import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import getPrisma from '../prisma';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Manages item inventory.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin-only for now
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adds a new item to the inventory.')
        .addStringOption(option => option.setName('name').setDescription('Name of the item').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('Initial quantity').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('Item description').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lists all inventory items.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('checkout')
        .setDescription('Checks out an item from the inventory.')
        .addStringOption(option => option.setName('name').setDescription('Name of the item to check out').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('Quantity to check out').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('checkin')
        .setDescription('Checks in an item to the inventory.')
        .addStringOption(option => option.setName('name').setDescription('Name of the item to check in').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('Quantity to check in').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const subcommand = interaction.options.getSubcommand();
    const name = interaction.options.getString('name');
    const quantity = interaction.options.getInteger('quantity');

    try {
      if (subcommand === 'add') {
        const description = interaction.options.getString('description');
        await prisma.inventoryItem.create({
          data: {
            name: name!,
            quantity: quantity!,
            description: description,
          },
        });
        await interaction.reply(`Added **${quantity}** of **${name}** to the inventory.`);
      } else if (subcommand === 'list') {
        const items = await prisma.inventoryItem.findMany();
        if (items.length === 0) {
          await interaction.reply('The inventory is empty.');
          return;
        }
        const embed = new EmbedBuilder().setColor('#F1C40F').setTitle('Inventory List');
        items.forEach(item => {
          embed.addFields({ name: item.name, value: `Quantity: ${item.quantity}\nDescription: ${item.description || 'N/A'}` });
        });
        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'checkout') {
        const item = await prisma.inventoryItem.findUnique({ where: { name: name! } });
        if (!item) {
          await interaction.reply({ content: `Item "${name}" not found.`, ephemeral: true });
          return;
        }
        if (item.quantity < quantity!) {
          await interaction.reply({ content: `Not enough stock for "${name}". Only ${item.quantity} available.`, ephemeral: true });
          return;
        }
        const checkouts = (item.checkouts as any[]) || [];
        checkouts.push({ user: interaction.user.tag, quantity: quantity!, date: new Date().toISOString() });

        await prisma.inventoryItem.update({
          where: { name: name! },
          data: {
            quantity: { decrement: quantity! },
            checkouts: checkouts,
          },
        });
        await interaction.reply(`**${interaction.user.tag}** checked out **${quantity}** of **${name}**.`);
      } else if (subcommand === 'checkin') {
        const item = await prisma.inventoryItem.findUnique({ where: { name: name! } });
        if (!item) {
          await interaction.reply({ content: `Item "${name}" not found.`, ephemeral: true });
          return;
        }
        await prisma.inventoryItem.update({
          where: { name: name! },
          data: {
            quantity: { increment: quantity! },
          },
        });
        await interaction.reply(`Checked in **${quantity}** of **${name}**.`);
      }
    } catch (error) {
      console.error('Inventory command error:', error);
      await interaction.reply({ content: 'An error occurred while managing the inventory.', ephemeral: true });
    }
  },
};
