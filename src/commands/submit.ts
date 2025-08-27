import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { Client as NotionClient } from '@notionhq/client';
import prisma from '../prisma';

// Initialize Notion Client
const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });

if (!process.env.NOTION_API_KEY) {
  console.warn('Notion API Key not set. The /submit command will be disabled.');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Notionデータベースと連携して提出物を管理します。')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('新しい提出物をNotionデータベースに追加します。')
        .addStringOption(option =>
          option.setName('name').setDescription('提出物の名前').setRequired(true))
        .addUserOption(option =>
          option.setName('owner').setDescription('担当者').setRequired(true))
        .addStringOption(option =>
          option.setName('duedate').setDescription('締切日 (YYYY-MM-DD)').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Notionデータベースから全ての提出物を一覧表示します。')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

    if (!process.env.NOTION_API_KEY) {
      await interaction.reply({ content: 'Notion連携が設定されていません。管理者に連絡してください。', ephemeral: true });
      return;
    }

    const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId },
    });

    if (!config || !config.notionDatabaseId) {
        await interaction.reply({ content: 'NotionデータベースIDが設定されていません。`/config notion`で設定してください。', ephemeral: true });
        return;
    }
    const databaseId = config.notionDatabaseId;

    try {
      if (interaction.options.getSubcommand() === 'add') {
        const name = interaction.options.getString('name', true);
        const owner = interaction.options.getUser('owner', true);
        const dueDate = interaction.options.getString('duedate', true);

        await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            // Assumes the Notion DB has columns with these exact names.
            'Name': { title: [{ text: { content: name } }] },
            'Owner': { rich_text: [{ text: { content: owner.tag } }] },
            'Due Date': { date: { start: dueDate } },
            'Status': { select: { name: 'Pending' } },
          },
        });

        await interaction.reply({
          content: `Added new submission to Notion: **${name}** assigned to **${owner.tag}**.`,
        });
      } else if (interaction.options.getSubcommand() === 'list') {
        const response = await notion.databases.query({
          database_id: databaseId,
        });

        const submissions = response.results;
        if (submissions.length === 0) {
          await interaction.reply('There are no submissions in the Notion database.');
          return;
        }

        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('Submission Tracker (from Notion)')
          .setDescription('Here is a list of all current submissions:');

        submissions.forEach((page: any) => {
          const props = page.properties;
          const name = props.Name?.title[0]?.text?.content || 'No Name';
          const owner = props.Owner?.rich_text[0]?.text?.content || 'N/A';
          const dueDate = props['Due Date']?.date?.start || 'N/A';
          const status = props.Status?.select?.name || 'N/A';

          embed.addFields({
            name: `${name} (Status: ${status})`,
            value: `Owner: ${owner}\nDue Date: ${dueDate}`,
            inline: false,
          });
        });

        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
        console.error('Notion API error:', error);
        await interaction.reply({ content: 'There was an error communicating with Notion.', ephemeral: true });
    }
  },
};
