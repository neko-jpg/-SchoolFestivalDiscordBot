import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('briefing')
    .setDescription('Manages daily briefings.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('post')
        .setDescription('Posts the daily briefing manually.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only admins can see/use this command
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.options.getSubcommand() === 'post') {
      // In a real implementation, this data would be fetched from APIs
      const today = new Date();
      const weather = '☀️ 最高27℃/最低20℃、午後ににわか雨注意';
      const schedule = [
        '10:00 開会式',
        '13:00 吹奏楽部演奏',
        '15:30 閉会式',
      ].join('\n');
      const notes = '13時以降は体育館への搬入禁止';

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`【本日のブリーフィング】 ${today.toLocaleDateString('ja-JP')}`)
        .addFields(
          { name: '天気', value: weather },
          { name: '本日のスケジュール', value: schedule },
          { name: '運営注意事項', value: notes }
        )
        .setTimestamp()
        .setFooter({ text: '文化祭実行委員会' });

      await interaction.reply({ embeds: [embed] });
    }
  },
};
