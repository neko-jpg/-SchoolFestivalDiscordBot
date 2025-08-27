import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { google } from 'googleapis';
import prisma from '../prisma';

async function getFinanceSummary(googleSheetId: string) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { error: 'Google Sheets API credentials are not configured.' };
  }
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: googleSheetId,
      range: 'Form Responses 1!B:D', // Assumes columns are Timestamp, Expense Item, Category, Amount
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return { total: 0, summary: 'No expense data found.' };
    }

    let total = 0;
    const categoryTotals: { [key: string]: number } = {};

    rows.slice(1).forEach(row => { // Skip header row
      const category = row[1] || 'Uncategorized';
      const amount = parseFloat(row[2]);
      if (!isNaN(amount)) {
        total += amount;
        categoryTotals[category] = (categoryTotals[category] || 0) + amount;
      }
    });

    const summary = Object.entries(categoryTotals)
      .map(([cat, sum]) => `**${cat}**: ${sum.toLocaleString()}円`)
      .join('\n');

    return { total, summary };
  } catch (error) {
    console.error('Google Sheets API Error:', error);
    return { error: 'Could not retrieve finance data from Google Sheets.' };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('finance')
    .setDescription('会計関連のタスクを処理します。')
    .addSubcommand(subcommand =>
      subcommand
        .setName('register')
        .setDescription('経費報告フォームへのリンクを提供します。')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('summary')
        .setDescription('すべての経費の要約を表示します。')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guildId },
    });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'register') {
      if (!config || !config.expenseFormUrl) {
        await interaction.reply({ content: '経費報告フォームのURLが設定されていません。`/config expenseform`で設定してください。', ephemeral: true });
        return;
      }
      await interaction.reply(`経費を報告するには、こちらのGoogleフォームを使用してください: ${config.expenseFormUrl}`);
    } else if (subcommand === 'summary') {
      if (!config || !config.googleSheetId) {
        await interaction.reply({ content: 'GoogleスプレッドシートIDが設定されていません。`/config sheet`で設定してください。', ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const { total, summary, error } = await getFinanceSummary(config.googleSheetId);

      if (error) {
        await interaction.editReply({ content: error });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('会計サマリー')
        .addFields(
          { name: '総支出', value: `**${total?.toLocaleString()}円**` },
          { name: '費目別支出', value: summary || 'データなし' }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
