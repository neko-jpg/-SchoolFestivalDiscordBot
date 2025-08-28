import {
  SlashCommandBuilder,
  CommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import path from 'path';
import logger from '../logger';
import { getGuildState, GuildState } from '../services/discordService';
import { diffTemplate, DiffResult } from '../services/diffService';
import { executeBuild } from '../services/executionService';
import { validateBuild } from '../services/validationService';
import { loadAndValidateTemplate } from '../services/templateService';
import { ServerTemplate } from '../schemas/templateSchema';
import { getTemplateByName } from '../templates';

function formatDiffPreview(diff: DiffResult, templateName: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle(`Template Dry-Run: '${templateName}'`)
    .setDescription('Apply preview. Review before confirming.')
    .setTimestamp();

  let description = '';
  diff.roles.toCreate.forEach((r) => (description += `➕ Create Role: \`${r.name}\`\n`));
  diff.roles.toUpdate.forEach((r) => (description += `🔄 Update Role: \`${r.existing.name}\`\n`));
  diff.categories.toCreate.forEach((c) => (description += `📁 Create Category: \`${c.name}\`\n`));
  diff.channels.toCreate.forEach((c) => (description += `#️⃣ Create Channel: \`#${c.channel.name}\` in **${c.categoryName}**\n`));
  diff.channels.toUpdate.forEach((c) => (description += `🔧 Update Channel: \`#${c.existing.name}\`\n`));

  if (description === '') embed.setDescription('No changes detected.');
  else if (description.length > 4000) embed.setDescription(description.substring(0, 4000) + '\n...and more.');
  else embed.setDescription(description);
  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('build')
    .setDescription('テンプレートにもとづきサーバー構成を更新')
    .addSubcommand((sub) =>
      sub
        .setName('apply')
        .setDescription('テンプレートを適用（事前プレビューあり）')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('テンプレート名')
            .setRequired(true)
            .addChoices(
              { name: 'bunkasai', value: 'bunkasai' },
              { name: 'taiikusai', value: 'taiikusai' },
              { name: 'kyugi', value: 'kyugi' },
              { name: 'standard(json)', value: 'standard' }
            )
        )
        .addIntegerOption((option) => option.setName('grades').setDescription('学年数（3 または 4）').addChoices({ name: '3', value: 3 }, { name: '4', value: 4 }))
        .addBooleanOption((option) => option.setName('preview').setDescription('プレビューをスキップして即適用'))
    ),

  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    if (interaction.options.getSubcommand() !== 'apply') return;

    const templateName = interaction.options.getString('name', true);
    const grades = ((interaction.options.getInteger('grades') ?? 3) === 4 ? 4 : 3) as 3 | 4;
    const skipPreview = interaction.options.getBoolean('preview') === true;

    await interaction.reply({ content: `テンプレート **${templateName}** の適用を準備中…`, ephemeral: true });

    let diff: DiffResult;
    let currentState: GuildState;

    try {
      let template: ServerTemplate | null = getTemplateByName(templateName, grades);
      if (!template) {
        const templatePath = path.resolve(process.cwd(), 'template.json');
        template = await loadAndValidateTemplate(templatePath);
      }

      currentState = await getGuildState(interaction.guild);
      diff = diffTemplate(currentState, template);

      const validationErrors = validateBuild(interaction.guild, diff);
      if (validationErrors.length > 0) {
        const errorEmbed = new EmbedBuilder().setColor('#E74C3C').setTitle('検証に失敗しました').setDescription(validationErrors.join('\n'));
        await interaction.editReply({ embeds: [errorEmbed], components: [] });
        return;
      }

      const applyNow = async () => {
        const me = await interaction.guild!.members.fetchMe();
        const requiredPermissions = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles];
        const missingPermissions = requiredPermissions.filter((p) => !me.permissions.has(p));
        if (missingPermissions.length > 0) {
          const missingPermsString = missingPermissions
            .map((p) => {
              for (const key in PermissionFlagsBits) if ((PermissionFlagsBits as any)[key] === p) return key;
              return String(p);
            })
            .join(', ');
          await interaction.editReply({ content: `権限不足: \`${missingPermsString}\``, components: [], embeds: [] });
          return;
        }

        const { buildRun, failures } = await executeBuild(interaction.guild!, diff, currentState!, templateName, interaction.user.id);

        let finalMessage = `✅ Build Successful!\nThe template has been applied.`;
        if (failures.length > 0) {
          let failureMessage = failures.slice(0, 15).join('\n- ');
          if (failures.length > 15) failureMessage += `\n- ...and ${failures.length - 15} more.`;
          finalMessage = `⚠️ Build finished with ${failures.length} errors.\n\n**Errors:**\n- ${failureMessage}`;
        }
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        if (buildRun?.id) {
          const undoButton = new ButtonBuilder().setCustomId(`build-undo-${buildRun.id}`).setLabel('元に戻す').setStyle(ButtonStyle.Danger);
          rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(undoButton));
        } else {
          finalMessage += '\n\n(ℹ️ DB未接続のため UNDO は無効です)';
        }
        await interaction.editReply({ content: finalMessage, components: rows, embeds: [] });
      };

      if (skipPreview) {
        await applyNow();
        return;
      }

      const previewEmbed = formatDiffPreview(diff, templateName);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('build-confirm').setLabel('適用する').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('build-cancel').setLabel('やめる').setStyle(ButtonStyle.Secondary)
      );
      const response = await interaction.editReply({ content: '', embeds: [previewEmbed], components: [row] });

      const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: 'このボタンを操作できるのは実行者のみです。', ephemeral: true });
          return;
        }
        collector.stop();
        if (i.customId === 'build-confirm') {
          await i.update({ content: '変更を適用しています…', embeds: [], components: [] });
          try {
            await applyNow();
          } catch (error: any) {
            logger.error({ err: error, user: i.user.id }, 'Error during build execution');
            const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
            await i.editReply({ content: `エラー:\n\`\`\`\n${msg}\n\`\`\``, components: [] });
          }
        } else if (i.customId === 'build-cancel') {
          await i.update({ content: 'キャンセルしました。', embeds: [], components: [] });
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') interaction.editReply({ content: '確認がタイムアウトしました。', embeds: [], components: [] });
      });
    } catch (error: any) {
      logger.error({ err: error, user: interaction.user.id }, 'Error during build preview');
      const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
      const errorEmbed = new EmbedBuilder().setColor('#E74C3C').setTitle('プレビュー実行中にエラーが発生しました').setDescription(`\`\`\`\n${msg}\n\`\`\``);
      await interaction.editReply({ content: '', embeds: [errorEmbed], components: [] });
    }
  },
};

