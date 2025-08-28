import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import getPrisma from '../prisma';
import { requireGuildId } from '../lib/context';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lostfound')
    .setDescription('落とし物を管理')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('report')
        .setDescription('落とし物を報告')
        .addStringOption(option => option.setName('item').setDescription('The name of the item').setRequired(true))
        .addStringOption(option => option.setName('location').setDescription('Where the item was found').setRequired(true))
        .addAttachmentOption(option => option.setName('image').setDescription('A photo of the item').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('保管中の落とし物一覧を表示')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('返却済みにする')
        .addStringOption(option => option.setName('id').setDescription('The ID of the item that was claimed').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const gid = requireGuildId(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'report') {
        const itemName = interaction.options.getString('item', true);
        const foundLocation = interaction.options.getString('location', true);
        const image = interaction.options.getAttachment('image');

        const newItem = await prisma.lostItem.create({
          data: {
            guildId: gid,
            itemName,
            foundLocation,
            imageUrl: image?.url,
            reportedById: interaction.user.id,
            // After prisma generate, this can be LostItemStatus.IN_STORAGE
            status: 'IN_STORAGE',
          },
        });
        await interaction.reply(`落とし物を登録しました: **${itemName}**（ID: **${newItem.id}**）`);
      } else if (subcommand === 'list') {
        await interaction.deferReply();
        const items = await prisma.lostItem.findMany({
          // After prisma generate, this can be LostItemStatus.IN_STORAGE
          where: { guildId: gid, status: 'IN_STORAGE' },
          orderBy: { createdAt: 'desc' },
        });

        if (items.length === 0) {
          await interaction.editReply('保管中の落とし物はありません。');
          return;
        }

        const embeds = items.map(item => {
            const embed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle(item.itemName)
                .addFields(
                    { name: '管理ID', value: item.id, inline: true },
                    { name: '発見場所', value: item.foundLocation, inline: true },
                    { name: '報告者', value: `<@${item.reportedById}>`, inline: true },
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
          await interaction.reply(`「${updatedItem.itemName}」(ID: ${itemId}) を返却済みにしました。`);
        } catch (error) {
          await interaction.reply({ content: `ID「${itemId}」の落とし物が見つかりませんでした。`, ephemeral: true });
        }
      }
    } catch (error) {
      console.error('Lost & Found command error:', error);
      const payload = { content: 'An error occurred while managing lost & found items.', ephemeral: true } as const;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload as any);
      } else {
        await interaction.reply(payload as any);
      }
    }
  },
};
