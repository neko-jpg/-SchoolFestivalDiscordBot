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
            // After prisma generate, this can be LostItemStatus.IN_STORAGE
            status: 'IN_STORAGE',
          },
        });
        await interaction.reply(`Reported lost item: **${itemName}**. Assigned ID: **${newItem.id}**`);
      } else if (subcommand === 'list') {
        await interaction.deferReply();
        const items = await prisma.lostItem.findMany({
          // After prisma generate, this can be LostItemStatus.IN_STORAGE
          where: { status: 'IN_STORAGE' },
          orderBy: { createdAt: 'desc' },
        });

        if (items.length === 0) {
          await interaction.editReply('No lost items have been reported.');
          return;
        }

        const embeds = items.map(item => {
            const embed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle(item.itemName)
                .addFields(
                    { name: 'Item ID', value: item.id, inline: true },
                    { name: 'Found Location', value: item.foundLocation, inline: true },
                    { name: 'Reported By', value: `<@${item.reportedById}>`, inline: true },
                )
                .setTimestamp(item.createdAt);

            if (item.imageUrl) {
                embed.setImage(item.imageUrl);
            }
            return embed;
        });

        // Discord allows up to 10 embeds per message
        const chunkSize = 10;
        for (let i = 0; i < embeds.length; i += chunkSize) {
            const chunk = embeds.slice(i, i + chunkSize);
            if (i === 0) {
                await interaction.editReply({ embeds: chunk });
            } else {
                await interaction.followUp({ embeds: chunk });
            }
        }

      } else if (subcommand === 'claim') {
        const itemId = interaction.options.getString('id', true);

        try {
          const updatedItem = await prisma.lostItem.update({
            where: { id: itemId },
            // After prisma generate, this can be LostItemStatus.RETURNED
            data: { status: 'RETURNED' },
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
