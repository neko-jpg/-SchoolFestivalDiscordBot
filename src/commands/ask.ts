import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits, SlashCommandStringOption } from 'discord.js';
import getPrisma from '../prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as kuromoji from 'kuromoji';
import { env } from '../env';
import logger from '../logger';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY || '');

// --- Kuromoji Tokenizer Initialization (Lazy) ---
let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
async function getTokenizer() {
  if (tokenizer) {
    return tokenizer;
  }

  logger.info('Building Kuromoji tokenizer for the first time...');
  return new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) => {
    kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, builtTokenizer) => {
      if (err) {
        logger.fatal({ err }, 'FATAL: Failed to build kuromoji tokenizer.');
        reject(err);
      } else {
        tokenizer = builtTokenizer;
        logger.info('Kuromoji tokenizer built successfully.');
        resolve(builtTokenizer);
      }
    });
  });
}
// --- End Kuromoji Initialization ---


module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('AI Help Desk')
    .addSubcommand(subcommand =>
      subcommand
        .setName('question')
        .setDescription('Ask a question to the AI assistant.')
        .addStringOption((option: SlashCommandStringOption) => option.setName('query').setDescription('Your question').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remember')
        .setDescription('Teach the AI new information (Admin only).')
        .addStringOption(option => option.setName('keyword').setDescription('A unique keyword for this information').setRequired(true))
        .addStringOption(option => option.setName('content').setDescription('The information to remember').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'remember') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }
        const keyword = interaction.options.getString('keyword', true);
        const content = interaction.options.getString('content', true);

        await prisma.knowledge.upsert({
            where: { keyword: keyword },
            update: { content: content },
            create: { keyword: keyword, content: content },
        });

        await interaction.reply({ content: `I've remembered about "${keyword}".`, ephemeral: true });

      } else if (subcommand === 'question') {
        if (!env.GEMINI_API_KEY) {
            return interaction.reply({ content: 'The AI Help Desk is not configured. The `GEMINI_API_KEY` has not been set.', ephemeral: true });
        }
        await interaction.deferReply();
        const query = interaction.options.getString('query', true);

        const localTokenizer = await getTokenizer();

        // Use Kuromoji to extract meaningful keywords (nouns, verbs)
        const tokens = localTokenizer.tokenize(query);
        const queryKeywords = tokens
            .filter(token => token.pos === '名詞' || token.pos === '動詞')
            .map(token => token.surface_form);

        if (queryKeywords.length === 0) {
            queryKeywords.push(query); // Fallback to using the whole query
        }

        const contextRecords = await prisma.knowledge.findMany({
            where: {
                OR: queryKeywords.map(kw => ({
                    OR: [
                        { keyword: { contains: kw, mode: 'insensitive' } },
                        { content: { contains: kw, mode: 'insensitive' } },
                    ]
                }))
            }
        });

        const context = contextRecords.map(r => `Keyword: ${r.keyword}\nContent: ${r.content}`).join('\n---\n');

        const model = genAI.getGenerativeModel({ model: "gemini-pro"});
        const prompt = `Based on the following context, please answer the user's question. If the context is not relevant, use your general knowledge.\n\nCONTEXT:\n${context || 'No relevant context found.'}\n\nQUESTION:\n${query}`;

        const result = await model.generateContent(prompt);
        const answer = await result.response.text();

        await interaction.editReply(answer);
      }
    } catch (error: any) {
      logger.error({ err: error, subcommand, user: interaction.user.id }, 'AI Help Desk command failed.');
      const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
      const replyPayload = { content: `AIヘルプデスクでエラーが発生しました:\n\`\`\`\n${msg}\n\`\`\``, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyPayload);
      } else {
        await interaction.reply(replyPayload);
      }
    }
  },
};
