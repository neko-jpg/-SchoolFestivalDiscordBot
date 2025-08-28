import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import getPrisma from '../prisma';
import { requireGuildId } from '../lib/context';
import { parseTimeRange } from '../lib/time';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shift')
    .setDescription('当番シフトを管理（DB使用）')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('新しいシフトを作成')
        .addStringOption(option => option.setName('name').setDescription('Name of the shift (e.g., Gate Guard)').setRequired(true))
        .addStringOption(option => option.setName('time').setDescription('Time slot (e.g., 10:00-12:00)').setRequired(true))
        .addStringOption(option => option.setName('location').setDescription('Location of the shift').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('シフト一覧を表示')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('assign')
        .setDescription('ユーザーをシフトに割り当て')
        .addStringOption(option => option.setName('shiftid').setDescription('The ID of the shift to assign to').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('The user to assign').setRequired(true))
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) return;

    const prisma = getPrisma();
    const subcommand = interaction.options.getSubcommand();
    const gid = requireGuildId(interaction.guildId);

    try {
      if (subcommand === 'create') {
        const name = interaction.options.getString('name', true);
        const time = interaction.options.getString('time', true);
        const location = interaction.options.getString('location');
        const { start, end } = parseTimeRange(time, 'Asia/Tokyo');

        const newShift = await prisma.shift.create({
          data: {
            guildId: gid,
            name,
            location,
            startAt: start,
            endAt: end,
            timezone: 'Asia/Tokyo',
          },
        });
        await interaction.reply(`シフト「${newShift.name}」を作成しました（ID: **${newShift.id}**）`);

      } else if (subcommand === 'list') {
        const shifts = await prisma.shift.findMany({
          where: { guildId: gid },
          include: { members: { include: { user: true } } },
          orderBy: { startAt: 'asc' },
        });
        if (shifts.length === 0) {
          await interaction.reply('まだシフトは作成されていません。');
          return;
        }
        const embed = new EmbedBuilder().setColor('#FFC300').setTitle('Shift Roster');
        const pad = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        shifts.forEach((shift) => {
          const assignees = (shift.members ?? []).map(m => m.user?.tag ?? m.userId).join(', ') || 'None';
          embed.addFields({
            name: `${shift.name} @ ${shift.location ?? 'TBD'} (${pad(shift.startAt)}-${pad(shift.endAt)})`,
            value: `**ID:** ${shift.id}\n**担当:** ${assignees}`,
          });
        });
        await interaction.reply({ embeds: [embed] });

      } else if (subcommand === 'assign') {
        const shiftId = interaction.options.getString('shiftid', true);
        const userToAssign = interaction.options.getUser('user', true);

        // Find the shift first to check for existence and current assignees
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
            include: { members: true },
        });

        if (!shift) {
            await interaction.reply({ content: `ID「${shiftId}」のシフトが見つかりませんでした。`, ephemeral: true });
            return;
        }

        // Check if user is already assigned
        if ((shift.members ?? []).some(m => m.userId === userToAssign.id)) {
            await interaction.reply({ content: `${userToAssign.tag} さんは既にこのシフトに割り当てられています。`, ephemeral: true });
            return;
        }

        // Ensure the user exists in our database before connecting
        await prisma.user.upsert({
          where: { id: userToAssign.id },
          update: { tag: userToAssign.tag },
          create: { id: userToAssign.id, tag: userToAssign.tag },
        });

        // Connect the user to the shift
        await prisma.shiftMember.create({
          data: { shiftId: shiftId, userId: userToAssign.id, role: null, notes: null },
        });

        await interaction.reply(`${userToAssign.tag} さんを「${shift.name}」シフトに割り当てました。`);
      }
    } catch (error) {
      console.error('シフトコマンドのDBエラー:', error);
      await interaction.reply({ content: 'データベースとの通信中にエラーが発生しました。', ephemeral: true });
    }
  },
};
