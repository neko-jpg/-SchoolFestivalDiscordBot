import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as kuromoji from 'kuromoji';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// --- Kuromoji Tokenizer Initialization ---
let tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null;
console.log('Building Kuromoji tokenizer...');
kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, t) => {
    if (err) {
        console.error('FATAL: Failed to build kuromoji tokenizer. The /ask command will not work.', err);
    } else {
        tokenizer = t;
        console.log('Kuromoji tokenizer built successfully.');
    }
});
// --- End Kuromoji Initialization ---


module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('AI Help Desk')
    .addSubcommand(subcommand =>
      subcommand
        .setName('question')
        .setDescription('Ask a question to the AI assistant.')
        .addStringOption(option => option.setName('query').setDescription('Your question').setRequired(true))
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
        if (!process.env.GEMINI_API_KEY) {
            return interaction.reply({ content: 'The AI Help Desk is not configured.', ephemeral: true });
        }
        await interaction.deferReply();
        const query = interaction.options.getString('query', true);

        if (!tokenizer) {
            return interaction.editReply('The AI is still warming up (the tokenizer is not ready). Please try again in a moment.');
        }

        // Use Kuromoji to extract meaningful keywords (nouns, verbs)
        const tokens = tokenizer.tokenize(query);
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
    } catch (error) {
      console.error('AI Help Desk error:', error);
      await interaction.followUp({ content: 'An error occurred with the AI Help Desk.', ephemeral: true });
    }
  },
};
