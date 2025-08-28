import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import getPrisma from '../prisma';
import { requireGuildId } from '../lib/context';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('備品の在庫を管理')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin-only for now
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('在庫に新しい品目を追加')
        .addStringOption(option => option.setName('name').setDescription('Name of the item').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('Initial quantity').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('Item description').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('在庫一覧を表示')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('checkout')
        .setDescription('在庫から持ち出し（チェックアウト）')
        .addStringOption(option => option.setName('name').setDescription('Name of the item to check out').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('Quantity to check out').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('checkin')
        .setDescription('在庫に返却（チェックイン）')
        .addStringOption(option => option.setName('name').setDescription('Name of the item to check in').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('Quantity to check in').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const gid = requireGuildId(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();
    const name = interaction.options.getString('name');
    const quantity = interaction.options.getInteger('quantity');

    try {
      if (subcommand === 'add') {
        const description = interaction.options.getString('description');
        await prisma.inventoryItem.create({
          data: {
            guildId: gid,
            name: name!,
            quantity: quantity!,
            description,
          },
        });
        await interaction.reply(`在庫に **${name}** を **${quantity}** 個追加しました。`);
      } else if (subcommand === 'list') {
        const items = await prisma.inventoryItem.findMany({ where: { guildId: gid } });
        if (items.length === 0) {
          await interaction.reply('在庫は空です。');
          return;
        }
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle('在庫一覧');
        items.forEach(item => {
          embed.addFields({ name: item.name, value: `数量: ${item.quantity}\n説明: ${item.description || '（なし）'}` });
        });
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'checkout') {
        const item = await prisma.inventoryItem.findUnique({
          where: { guildId_name: { guildId: gid, name: name! } },
        });
        if (!item) {
          await interaction.reply({ content: `品目「${name}」が見つかりません。`, ephemeral: true });
          return;
        }
        if (item.quantity < quantity!) {
          await interaction.reply({ content: `「${name}」の在庫が不足しています（残り ${item.quantity}）。`, ephemeral: true });
          return;
        }
        const checkouts = (item.checkouts as any[]) || [];
        checkouts.push({ user: interaction.user.tag, quantity: quantity!, date: new Date().toISOString() });

        await prisma.inventoryItem.update({
          where: { guildId_name: { guildId: gid, name: name! } },
          data: {
            quantity: { decrement: quantity! },
            checkouts,
          },
        });
        await interaction.reply(`**${interaction.user.tag}** さんが **${name}** を **${quantity}** 個持ち出しました。`);
      } else if (subcommand === 'checkin') {
        const item = await prisma.inventoryItem.findUnique({
          where: { guildId_name: { guildId: gid, name: name! } },
        });
        if (!item) {
          await interaction.reply({ content: `品目「${name}」が見つかりません。`, ephemeral: true });
          return;
        }
        await prisma.inventoryItem.update({
          where: { guildId_name: { guildId: gid, name: name! } },
          data: {
            quantity: { increment: quantity! },
          },
        });
        await interaction.reply(`**${name}** を **${quantity}** 個返却しました。`);
      }
    } catch (error) {
      console.error('Inventory command error:', error);
      await interaction.reply({ content: '在庫管理中にエラーが発生しました。', ephemeral: true });
    }
  },
};
