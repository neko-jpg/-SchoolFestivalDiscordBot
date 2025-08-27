import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';

const festivalDateStr = process.env.FESTIVAL_START_DATE;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('countdown')
    .setDescription('Shows the countdown to the festival.'),
  async execute(interaction: CommandInteraction) {
    if (!festivalDateStr) {
      await interaction.reply({ content: 'The festival start date is not configured.', ephemeral: true });
      return;
    }

    const festivalDate = new Date(festivalDateStr);
    const now = new Date();

    const diff = festivalDate.getTime() - now.getTime();

    if (diff <= 0) {
      await interaction.reply('The festival is already happening or has passed! 🎉');
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('文化祭開催まであと...')
        .setDescription(`**${days}**日 **${hours}**時間 **${minutes}**分 **${seconds}**秒`);

    await interaction.reply({ embeds: [embed] });
  },
};
