import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

        // Simple search for context. A real app might use more complex keyword extraction.
        const queryKeywords = query.split(' ').slice(0, 5); // Use first 5 words as keywords
        const contextRecords = await prisma.knowledge.findMany({
            where: {
                OR: queryKeywords.map(kw => ({ content: { contains: kw, mode: 'insensitive' } }))
            }
        });

        const context = contextRecords.map(r => r.content).join('\n---\n');

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
