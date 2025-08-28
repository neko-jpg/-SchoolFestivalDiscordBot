import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import getPrisma from '../prisma';
import logger from '../logger';
import { requireGuildId } from '../lib/context';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('ユーザーの貢献・実績を表示')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('指定ユーザーの実績を表示')
        .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to yourself)'))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;

      try {
        await interaction.deferReply();

        const prisma = getPrisma();
        const gid = requireGuildId(interaction.guildId);
        let kudosGiven = 0, kudosReceived = 0, itemsReported = 0, shiftCount = 0;
        try {
          [kudosGiven, kudosReceived, itemsReported, shiftCount] = await Promise.all([
            prisma.kudos.count({ where: { guildId: gid, fromUserId: targetUser.id } }),
            prisma.kudos.count({ where: { guildId: gid, toUserId: targetUser.id } }),
            prisma.lostItem.count({ where: { guildId: gid, reportedById: targetUser.id } }),
            prisma.shiftMember.count({
              where: { userId: targetUser.id, shift: { guildId: gid } },
            }),
          ]);
        } catch (e: any) {
          logger.warn({ err: e }, 'Achievements counts unavailable (DB error)');
          await interaction.editReply({ content: '⚠️ 現在DBに接続できないため、実績を取得できません。' });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(`${targetUser.username} さんの貢献`)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: '送ったKudos', value: `**${kudosGiven}** 回`, inline: true },
            { name: '受け取ったKudos', value: `**${kudosReceived}** 回`, inline: true },
            { name: '担当シフト', value: `**${shiftCount}** 回`, inline: true },
            { name: '落とし物の報告', value: `**${itemsReported}** 件`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Achievements command error:', error);
        await interaction.editReply({ content: '実績の取得中にエラーが発生しました。' });
      }
    }
  },
};
