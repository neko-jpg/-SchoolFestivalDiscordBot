import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, Prisma } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Manages shifts using a database.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Creates a new shift.')
        .addStringOption(option => option.setName('name').setDescription('Name of the shift (e.g., Gate Guard)').setRequired(true))
        .addStringOption(option => option.setName('time').setDescription('Time slot (e.g., 10:00-12:00)').setRequired(true))
        .addStringOption(option => option.setName('location').setDescription('Location of the shift').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lists all shifts.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('assign')
        .setDescription('Assigns a user to a shift.')
        .addStringOption(option => option.setName('shiftid').setDescription('The ID of the shift to assign to').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('The user to assign').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'create') {
        const newShift = await prisma.shift.create({
          data: {
            name: interaction.options.getString('name', true),
            time: interaction.options.getString('time', true),
            location: interaction.options.getString('location', true),
            assignees: [], // Prisma's JsonNull
          },
        });
        await interaction.reply(`Shift "${newShift.name}" created with ID: **${newShift.id}**`);

      } else if (subcommand === 'list') {
        const shifts = await prisma.shift.findMany();
        if (shifts.length === 0) {
          await interaction.reply('No shifts have been created yet.');
          return;
        }
        const embed = new EmbedBuilder().setColor('#FFC300').setTitle('Shift Roster');
        shifts.forEach(shift => {
          const assignees = (shift.assignees as any[]).map(a => a.tag).join(', ') || 'None';
          embed.addFields({
            name: `${shift.name} @ ${shift.location} (${shift.time})`,
            value: `**ID:** ${shift.id}\n**Assigned:** ${assignees}`,
          });
        });
        await interaction.reply({ embeds: [embed] });

      } else if (subcommand === 'assign') {
        const shiftId = interaction.options.getString('shiftid', true);
        const user = interaction.options.getUser('user', true);

        const shift = await prisma.shift.findUnique({ where: { id: shiftId } });

        if (!shift) {
          await interaction.reply({ content: `Shift with ID "${shiftId}" not found.`, ephemeral: true });
          return;
        }

        const assignees = (shift.assignees as any[]) || [];
        if (assignees.some(a => a.id === user.id)) {
          await interaction.reply({ content: `${user.tag} is already assigned to this shift.`, ephemeral: true });
          return;
        }

        assignees.push({ id: user.id, tag: user.tag });

        await prisma.shift.update({
          where: { id: shiftId },
          data: { assignees: assignees as any },
        });

        await interaction.reply(`${user.tag} has been assigned to the "${shift.name}" shift.`);
      }
    } catch (error) {
      console.error('Prisma error in shift command:', error);
      await interaction.reply({ content: 'There was an error while interacting with the database.', ephemeral: true });
    }
  },
};
