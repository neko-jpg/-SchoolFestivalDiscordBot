import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lostfound')
    .setDescription('Manages lost and found items.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('report')
        .setDescription('Reports a new lost item.')
        .addStringOption(option => option.setName('item').setDescription('The name of the item').setRequired(true))
        .addStringOption(option => option.setName('location').setDescription('Where the item was found').setRequired(true))
        .addAttachmentOption(option => option.setName('image').setDescription('A photo of the item').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lists all currently held lost items.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Marks an item as claimed/returned.')
        .addStringOption(option => option.setName('id').setDescription('The ID of the item that was claimed').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'report') {
        const itemName = interaction.options.getString('item', true);
        const foundLocation = interaction.options.getString('location', true);
        const image = interaction.options.getAttachment('image');

        const newItem = await prisma.lostItem.create({
          data: {
            itemName,
            foundLocation,
            imageUrl: image?.url,
            reportedById: interaction.user.id,
            status: '保管中',
          },
        });
        await interaction.reply(`Reported lost item: **${itemName}**. Assigned ID: **${newItem.id}**`);
      } else if (subcommand === 'list') {
        const items = await prisma.lostItem.findMany({
          where: { status: '保管中' },
          orderBy: { createdAt: 'desc' },
        });

        if (items.length === 0) {
          await interaction.reply('No lost items have been reported.');
          return;
        }

        const embed = new EmbedBuilder().setColor('#E74C3C').setTitle('Lost & Found Items');
        items.forEach(item => {
          embed.addFields({
            name: `${item.itemName} (ID: ${item.id})`,
            value: `Found at: ${item.foundLocation}\nReported by: <@${item.reportedById}>`,
          });
          if(item.imageUrl) {
            embed.setImage(item.imageUrl); // Note: only the last image will be shown if there are many. A better approach is multiple embeds.
          }
        });
        await interaction.reply({ embeds: [embed] });

      } else if (subcommand === 'claim') {
        const itemId = interaction.options.getString('id', true);

        try {
          const updatedItem = await prisma.lostItem.update({
            where: { id: itemId },
            data: { status: '返却済' },
          });
          await interaction.reply(`Item **${updatedItem.itemName}** (ID: ${itemId}) has been marked as claimed.`);
        } catch (error) {
          await interaction.reply({ content: `Could not find an item with ID "${itemId}".`, ephemeral: true });
        }
      }
    } catch (error) {
      console.error('Lost & Found command error:', error);
      await interaction.reply({ content: 'An error occurred while managing lost & found items.', ephemeral: true });
    }
  },
};
