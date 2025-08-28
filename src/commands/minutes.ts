import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// This is a placeholder. In a real implementation, you'd manage recording state.
const activeRecordings = new Set<string>(); // Using guild ID as key

module.exports = {
  data: new SlashCommandBuilder()
    .setName('minutes')
    .setDescription('Manages meeting minutes.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Starts recording the meeting for minutes (placeholder).')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stops recording and prepares the summary (placeholder).')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('summarize')
        .setDescription('Summarizes a meeting transcript using AI.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Admin only
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
        if (activeRecordings.has(guildId)) {
            await interaction.reply({ content: 'A recording is already in progress in this server.', ephemeral: true });
            return;
        }
        activeRecordings.add(guildId);
        await interaction.reply('議事録の記録を開始しました。\n（注意：これはプレースホルダー機能です）');
    } else if (subcommand === 'stop') {
        if (!activeRecordings.has(guildId)) {
            await interaction.reply({ content: 'No recording is currently in progress.', ephemeral: true });
            return;
        }
        activeRecordings.delete(guildId);
        await interaction.reply('議事録の記録を停止しました。\n（注意：これはプレースホルダー機能です）');
    } else if (subcommand === 'summarize') {
        if (!process.env.GEMINI_API_KEY) {
            await interaction.reply({ content: 'The Gemini API is not configured.', ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId('summarizeModal')
            .setTitle('議事録要約');

        const transcriptInput = new TextInputBuilder()
            .setCustomId('transcriptInput')
            .setLabel("ここに文字起こししたテキストを貼り付けてください")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(transcriptInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);

        try {
            const modalInteraction = await interaction.awaitModalSubmit({ time: 300_000 }); // 5 minutes
            await modalInteraction.deferReply({ ephemeral: true });

            const transcript = modalInteraction.fields.getTextInputValue('transcriptInput');

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
            const prompt = `あなたは優秀なアシスタントです。以下の会議の文字起こしテキストを、3つのセクション（決定事項、アクションアイテム、主要な議題）に分けて要約してください。\n\n---\n\n${transcript}`;

            const result = await model.generateContent(prompt);
            const summary = await result.response.text();

            await modalInteraction.editReply({ content: '要約が完了しました。チャンネルに投稿します。' });
            await interaction.channel?.send(`**議事録要約**\n\n${summary}`);

        } catch (error) {
            console.error('Gemini API or modal error:', error);
            await interaction.followUp({ content: '要約の生成中にエラーが発生しました。', ephemeral: true });
        }
    }
  },
};
