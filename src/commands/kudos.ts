import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import getPrisma from '../prisma';
import logger from '../logger';
import { requireGuildId } from '../lib/context';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kudos')
    .setDescription('Give kudos to a team member.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('give')
        .setDescription('Give kudos to someone for their hard work.')
        .addUserOption(option => option.setName('user').setDescription('The user to give kudos to').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Your message of appreciation').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('top')
        .setDescription('Shows the kudos leaderboard.')
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const gid = requireGuildId(interaction.guildId);
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'give') {
        const targetUser = interaction.options.getUser('user', true);
        const message = interaction.options.getString('message', true);

        if (targetUser.id === interaction.user.id) {
          await interaction.reply({ content: 'You cannot give kudos to yourself!', ephemeral: true });
          return;
        }

        try {
          await prisma.kudos.create({
            data: {
              guildId: gid,
              fromUserId: interaction.user.id,
              toUserId: targetUser.id,
              message,
            },
          });
        } catch (e: any) {
          logger.warn({ err: e }, 'Failed to create kudos (DB unavailable)');
          await interaction.reply({ content: '⚠️ 現在DBに接続できないため、kudosを保存できませんでした。', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle(`👏 Kudos for ${targetUser.username}!`)
          .setDescription(`**${interaction.user.username}** gave kudos to **${targetUser.username}**:`)
          .addFields({ name: 'Message', value: message })
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else if (subcommand === 'top') {
        let topReceivers: any[] = [];
        try {
          topReceivers = await (prisma.kudos as any).groupBy({
            by: ['toUserId'],
            where: { guildId: gid },
            _count: {
              toUserId: true,
            },
            orderBy: {
              _count: {
                toUserId: 'desc',
              },
            },
            take: 5,
          } as any);
        } catch (e: any) {
          logger.warn({ err: e }, 'Failed to fetch kudos leaderboard (DB unavailable)');
          await interaction.reply({ content: '⚠️ 現在Kudosランキングを取得できません（DB接続エラー）。', ephemeral: true });
          return;
        }

        if (topReceivers.length === 0) {
          await interaction.reply('No kudos have been given yet.');
          return;
        }

        const embed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('🏆 Kudos Leaderboard');

        const leaderboardEntries = await Promise.all(
            topReceivers.map(async (receiver, index) => {
                try {
                    const user = await interaction.client.users.fetch(receiver.toUserId);
                    return `${index + 1}. **${user.username}** - ${receiver._count.toUserId} kudos`;
                } catch {
                    return `${index + 1}. **Unknown User** - ${receiver._count.toUserId} kudos`;
                }
            })
        );

        embed.setDescription(leaderboardEntries.join('\n'));
        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Kudos command error:', error);
      await interaction.reply({ content: 'An error occurred while handling kudos.', ephemeral: true });
    }
  },
};
