import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { google } from 'googleapis';

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const EXPENSE_FORM_URL = process.env.EXPENSE_REPORT_FORM_URL;

async function getFinanceSummary() {
  if (!GOOGLE_SHEET_ID || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { error: 'Google Sheets not configured.' };
  }
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: GOOGLE_SHEET_ID,
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
    .setDescription('Handles accounting and finance tasks.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('register')
        .setDescription('Provides the link to the expense report form.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('summary')
        .setDescription('Shows a summary of all expenses.')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'register') {
      if (!EXPENSE_FORM_URL) {
        await interaction.reply({ content: 'The expense report form URL is not configured.', ephemeral: true });
        return;
      }
      await interaction.reply(`To report an expense, please use the Google Form: ${EXPENSE_FORM_URL}`);
    } else if (subcommand === 'summary') {
      await interaction.deferReply();
      const { total, summary, error } = await getFinanceSummary();

      if (error) {
        await interaction.editReply({ content: error, ephemeral: true });
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
