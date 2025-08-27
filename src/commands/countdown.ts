import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import prisma from '../prisma';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('countdown')
    .setDescription('文化祭開催までのカウントダウンを表示します。'),
  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
        return;
    }

    const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId },
    });

    if (!config || !config.festivalStartDate) {
      await interaction.reply({ content: '文化祭の開始日が設定されていません。`/config startdate`で設定してください。', ephemeral: true });
      return;
    }

    const festivalDate = config.festivalStartDate;
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
