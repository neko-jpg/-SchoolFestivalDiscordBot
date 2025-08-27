import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { fromZonedTime } from 'date-fns-tz';
import getPrisma from '../prisma';
import { env } from '../env';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('countdown')
    .setDescription('文化祭開催までのカウントダウンを表示します。'),
  async execute(interaction: CommandInteraction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', ephemeral: true });
        return;
    }

    const prisma = getPrisma();
    const config = await prisma.guildConfig.findUnique({
        where: { guildId: interaction.guildId },
    });

    const festivalDateFromEnv = env.FESTIVAL_START_DATE;
    const festivalDateFromDb = config?.festivalStartDate;

    if (!festivalDateFromDb && !festivalDateFromEnv) {
      await interaction.reply({ content: '文化祭の開始日が設定されていません。`/config startdate`で設定してください。', ephemeral: true });
      return;
    }

    // Prioritize DB date over ENV var
    const startDate = festivalDateFromDb || new Date(festivalDateFromEnv as string);

    // Interpret the date as being in Asia/Tokyo timezone
    const timeZone = 'Asia/Tokyo';
    // We assume the date stored is the "wall clock" date. Let's create a proper, timezone-aware date object.
    // Let's assume the festival starts at 9:00 AM JST on the given date.
    const festivalDate = fromZonedTime(
        `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}T09:00:00`,
        timeZone
    );

    const now = new Date(); // Represents the current moment in UTC
    const diff = festivalDate.getTime() - now.getTime();

    if (diff <= 0) {
      await interaction.reply('文化祭はすでに開催中、または終了しました！ 🎉');
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
