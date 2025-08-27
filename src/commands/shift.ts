import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import getPrisma from '../prisma';

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

    const prisma = getPrisma();
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'create') {
        const newShift = await prisma.shift.create({
          data: {
            name: interaction.options.getString('name', true),
            time: interaction.options.getString('time', true),
            location: interaction.options.getString('location', true),
            // assignees is now a relation, so it's not set directly
          },
        });
        await interaction.reply(`Shift "${newShift.name}" created with ID: **${newShift.id}**`);

      } else if (subcommand === 'list') {
        const shifts = await prisma.shift.findMany({
          include: {
            assignees: true, // Include the related User objects
          },
        });
        if (shifts.length === 0) {
          await interaction.reply('No shifts have been created yet.');
          return;
        }
        const embed = new EmbedBuilder().setColor('#FFC300').setTitle('Shift Roster');
        shifts.forEach((shift) => {
          const assignees = shift.assignees.map((user: { tag: string | null; id: string }) => user.tag || user.id).join(', ') || 'None';
          embed.addFields({
            name: `${shift.name} @ ${shift.location} (${shift.time})`,
            value: `**ID:** ${shift.id}\n**Assigned:** ${assignees}`,
          });
        });
        await interaction.reply({ embeds: [embed] });

      } else if (subcommand === 'assign') {
        const shiftId = interaction.options.getString('shiftid', true);
        const userToAssign = interaction.options.getUser('user', true);

        // Find the shift first to check for existence and current assignees
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { assignees: true },
        });

        if (!shift) {
            await interaction.reply({ content: `Shift with ID "${shiftId}" not found.`, ephemeral: true });
            return;
        }

        // Check if user is already assigned
        if (shift.assignees.some(user => user.id === userToAssign.id)) {
            await interaction.reply({ content: `${userToAssign.tag} is already assigned to this shift.`, ephemeral: true });
            return;
        }

        // Ensure the user exists in our database before connecting
        await prisma.user.upsert({
          where: { id: userToAssign.id },
          update: { tag: userToAssign.tag },
          create: { id: userToAssign.id, tag: userToAssign.tag },
        });

        // Connect the user to the shift
        await prisma.shift.update({
          where: { id: shiftId },
          data: {
            assignees: {
              connect: { id: userToAssign.id },
            },
          },
        });

        await interaction.reply(`${userToAssign.tag} has been assigned to the "${shift.name}" shift.`);
      }
    } catch (error) {
      console.error('Prisma error in shift command:', error);
      await interaction.reply({ content: 'There was an error while interacting with the database.', ephemeral: true });
    }
  },
};
