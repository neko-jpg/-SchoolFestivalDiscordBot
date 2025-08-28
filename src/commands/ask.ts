import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits, SlashCommandStringOption } from 'discord.js';
import getPrisma from '../prisma';
import { requireGuildId } from '../lib/context';
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
    .setDescription('AIヘルプデスク')
    .addSubcommand(subcommand =>
      subcommand
        .setName('question')
        .setDescription('AIに質問する（日本語で回答）')
        .addStringOption((option: SlashCommandStringOption) => option.setName('query').setDescription('Your question').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remember')
        .setDescription('AIに情報を覚えさせる（管理者のみ）')
        .addStringOption(option => option.setName('keyword').setDescription('A unique keyword for this information').setRequired(true))
        .addStringOption(option => option.setName('content').setDescription('The information to remember').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const gid = requireGuildId(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'remember') {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'このコマンドを実行する権限がありません。', ephemeral: true });
        }
        const keyword = interaction.options.getString('keyword', true);
        const content = interaction.options.getString('content', true);

        await prisma.knowledge.upsert({
            where: { guildId_keyword: { guildId: gid, keyword } },
            update: { content },
            create: { guildId: gid, keyword, content },
        });

        await interaction.reply({ content: `「${keyword}」について記憶しました。`, ephemeral: true });

      } else if (subcommand === 'question') {
        if (!env.GEMINI_API_KEY) {
            return interaction.reply({ content: 'AIヘルプデスクの設定が不足しています。`GEMINI_API_KEY` を設定してください。', ephemeral: true });
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

        let contextRecords: { keyword: string; content: string }[] = [];
        try {
          contextRecords = await prisma.knowledge.findMany({
              where: {
                  guildId: gid,
                  OR: queryKeywords.map(kw => ({
                      OR: [
                          { keyword: { contains: kw, mode: 'insensitive' } },
                          { content: { contains: kw, mode: 'insensitive' } },
                      ]
                  }))
              }
          });
        } catch (e: any) {
          logger.warn({ err: e }, 'Knowledge lookup failed; proceeding without DB context');
          contextRecords = [];
        }

        const context = contextRecords.map(r => `キーワード: ${r.keyword}\n内容: ${r.content}`).join('\n---\n');

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
        const prompt = `あなたは文化祭運営の日本語アシスタントです。必ず日本語で、簡潔かつ丁寧に回答してください。\n\n参考情報（あれば）:\n${context || '該当する参考情報は見つかりませんでした。'}\n\n質問:\n${query}`;

        const result = await model.generateContent(prompt);
        const answer = await result.response.text();

        await interaction.editReply(answer);
      }
    } catch (error: any) {
      logger.error({ err: error, subcommand, user: interaction.user.id }, 'AIヘルプデスクでエラー');
      const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
      const replyPayload = { content: `AIヘルプデスクでエラーが発生しました。\n\`\`\`\n${msg}\n\`\`\``, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyPayload);
      } else {
        await interaction.reply(replyPayload);
      }
    }
  },
};
