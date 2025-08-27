import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const submissionsFilePath = path.join(__dirname, '..', '..', 'data', 'submissions.json');

interface Submission {
  id: string;
  name: string;
  ownerId: string;
  ownerTag: string;
  dueDate: string;
  status: 'Pending' | 'Submitted';
}

// Helper functions to read/write from JSON file
const readSubmissions = (): Submission[] => {
  try {
    const data = fs.readFileSync(submissionsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading submissions file:', error);
    return [];
  }
};

const writeSubmissions = (data: Submission[]) => {
  try {
    fs.writeFileSync(submissionsFilePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing submissions file:', error);
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Manages submissions.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adds a new submission to the tracker.')
        .addStringOption(option =>
          option.setName('name').setDescription('The name of the submission').setRequired(true))
        .addUserOption(option =>
          option.setName('owner').setDescription('The user responsible for the submission').setRequired(true))
        .addStringOption(option =>
          option.setName('duedate').setDescription('The due date (e.g., YYYY-MM-DD)').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lists all current submissions.')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.options.getSubcommand() === 'add') {
      const name = interaction.options.getString('name', true);
      const owner = interaction.options.getUser('owner', true);
      const dueDate = interaction.options.getString('duedate', true);

      const newSubmission: Submission = {
        id: uuidv4(),
        name,
        ownerId: owner.id,
        ownerTag: owner.tag,
        dueDate,
        status: 'Pending',
      };

      const submissions = readSubmissions();
      submissions.push(newSubmission);
      writeSubmissions(submissions);

      await interaction.reply({
        content: `Added new submission: **${name}** assigned to **${owner.tag}** with due date **${dueDate}**.`,
        ephemeral: false,
      });
    } else if (interaction.options.getSubcommand() === 'list') {
      const submissions = readSubmissions();

      if (submissions.length === 0) {
        await interaction.reply('There are no submissions to display.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Submission Tracker')
        .setDescription('Here is a list of all current submissions:');

      submissions.forEach(sub => {
        embed.addFields({
          name: `${sub.name} (Status: ${sub.status})`,
          value: `Owner: ${sub.ownerTag}\nDue Date: ${sub.dueDate}`,
          inline: false,
        });
      });

      await interaction.reply({ embeds: [embed] });
    }
  },
};
