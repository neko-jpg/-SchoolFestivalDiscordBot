import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import getPrisma from '../prisma'; // Prismaクライアントをインポート
import { z } from 'zod';
import logger from '../logger';

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

    const prisma = getPrisma();
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
            const [year, month, day] = dateStr.split('-').map(Number);
            const startDate = new Date(year, month - 1, day); // 月は0-indexed
            await prisma.guildConfig.upsert({
              where: { guildId },
              update: { festivalStartDate: startDate },
              create: { guildId, festivalStartDate: startDate },
            });
            await interaction.reply({ content: `✅ 文化祭開始日を ${dateStr} に設定しました。`, ephemeral: true });
            break;
        }
      }
    } catch (error: any) {
        logger.error({ err: error, subcommand, guildId }, 'Config command failed');
        const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
        const replyPayload = { content: `設定の保存中にエラーが発生しました:\n\`\`\`\n${msg}\n\`\`\``, ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload);
        } else {
          await interaction.reply(replyPayload);
        }
    }
  },
};
