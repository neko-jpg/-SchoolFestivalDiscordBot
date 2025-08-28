import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import { getGuildState, GuildState } from '../services/discordService';
import { diffTemplate, DiffResult, ChannelChanges } from '../services/diffService';
import { executeBuild } from '../services/executionService';
import { validateBuild } from '../services/validationService';
import { loadAndValidateTemplate } from '../services/templateService';
import { ServerTemplate } from '../schemas/templateSchema';
import path from 'path';
import logger from '../logger';

/*
function formatOverwriteChanges(changes: any[]): string {
    return changes.map(c => {
        const parts: string[] = [];
        // This logic is broken as diffService doesn't provide this level of detail.
        // if (c.addedAllow.length > 0) parts.push(`+Allow(${c.addedAllow.join(', ')})`);
        // if (c.removedAllow.length > 0) parts.push(`-Allow(${c.removedAllow.join(', ')})`);
        // if (c.addedDeny.length > 0) parts.push(`+Deny(${c.addedDeny.join(', ')})`);
        // if (c.removedDeny.length > 0) parts.push(`-Deny(${c.removedDeny.join(', ')})`);
        return `  - For @${c.roleName}: ${parts.join(' ')}`;
    }).join('\n');
}
*/

function formatDiffPreview(diff: DiffResult, templateName: string): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`Template Dry-Run: '${templateName}'`)
        .setDescription('Review the following changes before applying the template. This is a preview and no changes have been made yet.')
        .setTimestamp();

    let description = '';

    diff.roles.toCreate.forEach(r => description += `➕ Create Role: \`${r.name}\`\n`);
    diff.roles.toUpdate.forEach(r => description += `🔄 Update Role: \`${r.existing.name}\`\n`);
    diff.categories.toCreate.forEach(c => description += `➕ Create Category: \`${c.name}\`\n`);
    diff.channels.toCreate.forEach(c => description += `➕ Create Channel: \`#${c.channel.name}\` in **${c.categoryName}**\n`);
    diff.channels.toUpdate.forEach(c => {
        description += `🔄 Update Channel: \`#${c.existing.name}\`\n`;
        if (c.changes.topic) {
            description += `  - Topic will be updated.\n`;
        }
        if (c.changes.overwrites && c.changes.overwrites.length > 0) {
            // description += formatOverwriteChanges(c.changes.overwrites) + '\n';
            description += `  - Permissions will be updated.\n`;
        }
    });

    if (description === '') {
        embed.setDescription('✅ No changes detected. The server configuration already matches the template.');
    } else {
        if (description.length > 4000) {
            description = description.substring(0, 4000) + '\n...and more.';
        }
        embed.setDescription(description);
    }

    return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('build')
    .setDescription('テンプレートにもとづきサーバー構成を更新')
    .addSubcommand(subcommand =>
      subcommand
        .setName('apply')
        .setDescription('テンプレートを適用（事前プレビューあり）')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('The name of the template to apply.')
            .setRequired(true)
            .addChoices({ name: 'standard', value: 'standard' })
        )
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;

    if (interaction.options.getSubcommand() === 'apply') {
        const templateName = interaction.options.getString('name', true);
        await interaction.reply({ content: `テンプレート **${templateName}** の適用を準備中…`, ephemeral: true });

        let diff: DiffResult;
        let currentState: GuildState;

        try {
            const templatePath = path.resolve(process.cwd(), 'template.json');
            const template = await loadAndValidateTemplate(templatePath);

            currentState = await getGuildState(interaction.guild);
            diff = diffTemplate(currentState, template);

            const validationErrors = validateBuild(interaction.guild, diff);
            if (validationErrors.length > 0) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle('検証に失敗しました')
                    .setDescription('以下の理由で実行できません。\n\n' + validationErrors.join('\n'));
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }

            const previewEmbed = formatDiffPreview(diff, templateName);
            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId('build-confirm').setLabel('適用する').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('build-cancel').setLabel('やめる').setStyle(ButtonStyle.Secondary)
                );

            const response = await interaction.editReply({
                content: '',
                embeds: [previewEmbed],
                components: [actionRow]
            });

            const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: 'このボタンを操作できるのは実行者のみです。', ephemeral: true });
                    return;
                }

                collector.stop();
                if (i.customId === 'build-confirm') {
                    if (!i.guild) return;
                    const me = await i.guild.members.fetchMe();
                    const requiredPermissions = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles];
                    const missingPermissions = requiredPermissions.filter(p => !me.permissions.has(p));

                    if (missingPermissions.length > 0) {
                        const missingPermsString = missingPermissions.map(p => {
                            for (const key in PermissionFlagsBits) {
                                if (PermissionFlagsBits[key as keyof typeof PermissionFlagsBits] === p) return key;
                            }
                            return String(p);
                        }).join(', ');
                        await i.update({ content: `❌ **Error:** I am missing required permissions: \`${missingPermsString}\`.\nPlease grant them and try again.`, embeds: [], components: [] });
                        return;
                    }

                    try {
                        await i.update({ content: '変更を適用しています…', embeds: [], components: [] });

                        const { buildRun, failures } = await executeBuild(i.guild, diff, currentState, templateName, i.user.id);

                        let componentsRows: ActionRowBuilder<ButtonBuilder>[] = [];
                        if (buildRun?.id) {
                            const undoButton = new ButtonBuilder()
                                .setCustomId(`build-undo-${buildRun.id}`)
                                .setLabel('元に戻す')
                                .setStyle(ButtonStyle.Danger);
                            const resultRow = new ActionRowBuilder<ButtonBuilder>().addComponents(undoButton);
                            componentsRows = [resultRow];
                        }

                        let finalMessage = `✅ **Build Successful!**\nThe template has been applied.`;
                        if (failures.length > 0) {
                            let failureMessage = failures.slice(0, 15).join('\n- ');
                            if (failures.length > 15) {
                                failureMessage += `\n- ...and ${failures.length - 15} more.`;
                            }
                            finalMessage = `⚠️ **Build Finished with ${failures.length} errors.**\n\n**Errors:**\n- ${failureMessage}`;
                        }

                        if (!buildRun?.id) {
                            finalMessage += '\n\n(ℹ️ DBが利用できないためUNDOは無効です)';
                        }
                        await i.editReply({ content: finalMessage, components: componentsRows });

                    } catch (error: any) {
                        logger.fatal({ err: error, user: i.user.id }, "Catastrophic error during build execution");
                        const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
                        await i.editReply({ content: `❌ An unexpected catastrophic error occurred during execution:\n\`\`\`\n${msg}\n\`\`\``, components: [] });
                    }
                } else if (i.customId === 'build-cancel') {
                    await i.update({ content: 'Operation cancelled.', embeds: [], components: [] });
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({ content: 'Confirmation timed out.', embeds: [], components: [] });
                }
            });

        } catch (error: any) {
            logger.error({ err: error, user: interaction.user.id }, "Error during build preview");
            const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
            const errorEmbed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle('プレビュー生成中にエラーが発生しました')
                .setDescription(`\`\`\`\n${msg}\n\`\`\``);
            await interaction.editReply({ content: '', embeds: [errorEmbed], components: [] });
        }
    }
  },
};
