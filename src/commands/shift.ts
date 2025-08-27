import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const shiftsFilePath = path.join(__dirname, '..', '..', 'data', 'shifts.json');

interface Shift {
  id: string;
  name: string;
  time: string;
  location: string;
  assignees: { id: string; tag: string }[];
}

// Helper functions
const readShifts = (): Shift[] => {
  try {
    const data = fs.readFileSync(shiftsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

const writeShifts = (data: Shift[]) => {
  fs.writeFileSync(shiftsFilePath, JSON.stringify(data, null, 2));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('Manages shifts.')
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
    const shifts = readShifts();

    if (subcommand === 'create') {
      const newShift: Shift = {
        id: uuidv4().substring(0, 8), // Short UUID for easier use
        name: interaction.options.getString('name', true),
        time: interaction.options.getString('time', true),
        location: interaction.options.getString('location', true),
        assignees: [],
      };
      shifts.push(newShift);
      writeShifts(shifts);
      await interaction.reply(`Shift "${newShift.name}" created with ID: **${newShift.id}**`);
    } else if (subcommand === 'list') {
      if (shifts.length === 0) {
        await interaction.reply('No shifts have been created yet.');
        return;
      }
      const embed = new EmbedBuilder().setColor('#FFC300').setTitle('Shift Roster');
      shifts.forEach(shift => {
        const assignees = shift.assignees.map(a => a.tag).join(', ') || 'None';
        embed.addFields({
          name: `${shift.name} @ ${shift.location} (${shift.time})`,
          value: `**ID:** ${shift.id}\n**Assigned:** ${assignees}`,
        });
      });
      await interaction.reply({ embeds: [embed] });
    } else if (subcommand === 'assign') {
      const shiftId = interaction.options.getString('shiftid', true);
      const user = interaction.options.getUser('user', true);
      const shiftIndex = shifts.findIndex(s => s.id === shiftId);

      if (shiftIndex === -1) {
        await interaction.reply({ content: `Shift with ID "${shiftId}" not found.`, ephemeral: true });
        return;
      }

      const shift = shifts[shiftIndex];
      if (shift.assignees.some(a => a.id === user.id)) {
        await interaction.reply({ content: `${user.tag} is already assigned to this shift.`, ephemeral: true });
        return;
      }

      shifts[shiftIndex].assignees.push({ id: user.id, tag: user.tag });
      writeShifts(shifts);
      await interaction.reply(`${user.tag} has been assigned to the "${shifts[shiftIndex].name}" shift.`);
    }
  },
};
