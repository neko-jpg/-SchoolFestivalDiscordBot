import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('Shows user achievements and contributions.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('Views the achievements of a user.')
        .addUserOption(option => option.setName('user').setDescription('The user to view (defaults to yourself)'))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      const targetUser = interaction.options.getUser('user') || interaction.user;

      try {
        await interaction.deferReply();

        const [kudosGiven, kudosReceived, itemsReported, shifts] = await Promise.all([
          prisma.kudos.count({ where: { fromUserId: targetUser.id } }),
          prisma.kudos.count({ where: { toUserId: targetUser.id } }),
          prisma.lostItem.count({ where: { reportedById: targetUser.id } }),
          prisma.shift.findMany({ where: { assignees: { path: '$[*].id', array_contains: targetUser.id } } }), // This is complex and might not work on all DBs
        ]);

        // A more reliable way to count shifts, albeit less efficient if there are many shifts
        const allShifts = await prisma.shift.findMany();
        const shiftCount = allShifts.filter(shift =>
            (shift.assignees as any[]).some(a => a.id === targetUser.id)
        ).length;

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(`${targetUser.username}'s Contributions`)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: 'Kudos Given', value: `**${kudosGiven}** times`, inline: true },
            { name: 'Kudos Received', value: `**${kudosReceived}** times`, inline: true },
            { name: 'Shifts Worked', value: `**${shiftCount}** times`, inline: true },
            { name: 'Lost Items Reported', value: `**${itemsReported}** items`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Achievements command error:', error);
        await interaction.editReply({ content: 'An error occurred while fetching achievements.', ephemeral: true });
      }
    }
  },
};
