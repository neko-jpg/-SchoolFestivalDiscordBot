import { SlashCommandBuilder, CommandInteraction } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Botの疎通確認'),
  async execute(interaction: CommandInteraction) {
    await interaction.reply('pong!');
  },
};
