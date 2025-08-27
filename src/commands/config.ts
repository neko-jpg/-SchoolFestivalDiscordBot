import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import prisma from '../prisma'; // Prismaクライアントをインポート
import { z } from 'zod';

// 日付形式 (YYYY-MM-DD) を検証するためのZodスキーマ
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください。");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('サーバーごとのBot設定を管理します。')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 管理者のみ
    .addSubcommand(subcommand =>
      subcommand
        .setName('reminder')
        .setDescription('イベントリマインダーを投稿するチャンネルを設定します。')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('通知チャンネル')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText) // テキストチャンネルのみに限定
        )
    )
    .addSubcommand(subcommand =>
        subcommand
          .setName('startdate')
          .setDescription('文化祭の開始日を設定します (YYYY-MM-DD)。')
          .addStringOption(option => option.setName('date').setDescription('開始日 (例: 2025-10-25)').setRequired(true))
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    try {
      switch (subcommand) {
        case 'reminder': {
          const channel = interaction.options.getChannel('channel', true);
          await prisma.guildConfig.upsert({
            where: { guildId },
            update: { reminderChannelId: channel.id },
            create: { guildId, reminderChannelId: channel.id },
          });
          await interaction.reply({ content: `✅ リマインダーチャンネルを <#${channel.id}> に設定しました。`, ephemeral: true });
          break;
        }
        case 'startdate': {
            const dateStr = interaction.options.getString('date', true);
            const validation = dateSchema.safeParse(dateStr);
            if (!validation.success) {
                await interaction.reply({ content: `❌ 無効な日付形式です。YYYY-MM-DD形式で入力してください。`, ephemeral: true });
                return;
            }
            const startDate = new Date(dateStr);
            await prisma.guildConfig.upsert({
              where: { guildId },
              update: { festivalStartDate: startDate },
              create: { guildId, festivalStartDate: startDate },
            });
            await interaction.reply({ content: `✅ 文化祭開始日を ${dateStr} に設定しました。`, ephemeral: true });
            break;
        }
      }
    } catch (error) {
        console.error('Config command error:', error);
        await interaction.reply({ content: '設定の保存中にエラーが発生しました。', ephemeral: true });
    }
  },
};
