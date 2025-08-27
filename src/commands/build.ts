import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { getGuildState, GuildState } from '../services/discordService';
import { diffTemplate, DiffResult, OverwriteChanges } from '../services/diffService';
import { executeBuild } from '../services/executionService';
import { ServerTemplate } from '../types/template';
import * as fs from 'fs/promises';
import path from 'path';

function formatOverwriteChanges(changes: OverwriteChanges[]): string {
    return changes.map(c => {
        const parts: string[] = [];
        if (c.addedAllow.length > 0) parts.push(`+Allow(${c.addedAllow.join(', ')})`);
        if (c.removedAllow.length > 0) parts.push(`-Allow(${c.removedAllow.join(', ')})`);
        if (c.addedDeny.length > 0) parts.push(`+Deny(${c.addedDeny.join(', ')})`);
        if (c.removedDeny.length > 0) parts.push(`-Deny(${c.removedDeny.join(', ')})`);
        return `  - For @${c.roleName}: ${parts.join(' ')}`;
    }).join('\n');
}


function formatDiffPreview(diff: DiffResult, templateName: string): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`Template Dry-Run: '${templateName}'`)
        .setDescription('Review the following changes before applying the template. This is a preview and no changes have been made yet.')
        .setTimestamp();

    let description = '';

    // Roles
    diff.roles.toCreate.forEach(r => description += `➕ Create Role: \`${r.name}\`\n`);
    diff.roles.toUpdate.forEach(r => description += `🔄 Update Role: \`${r.existing.name}\`\n`);

    // Categories
    diff.categories.toCreate.forEach(c => description += `➕ Create Category: \`${c.name}\`\n`);

    // Channels
    diff.channels.toCreate.forEach(c => description += `➕ Create Channel: \`#${c.channel.name}\` in **${c.categoryName}**\n`);
    diff.channels.toUpdate.forEach(c => {
        description += `🔄 Update Channel: \`#${c.existing.name}\`\n`;
        if (c.changes.topic) {
            description += `  - Topic will be updated.\n`;
        }
        if (c.changes.overwrites) {
            description += formatOverwriteChanges(c.changes.overwrites);
        }
    });

    if (description === '') {
        embed.setDescription('✅ No changes detected. The server configuration already matches the template.');
    } else {
        // Discord embed descriptions have a 4096 character limit. Truncate if necessary.
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
    .setDescription('Manages the server build based on a template.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('apply')
        .setDescription('Applies a server template (shows a preview first).')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('The name of the template to apply.')
            .setRequired(true)
            .addChoices(
                { name: 'standard', value: 'standard' }
            )
        )
    ),
  async execute(interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand() || !interaction.guild) return;

    if (interaction.options.getSubcommand() === 'apply') {
        const templateName = interaction.options.getString('name', true);
        await interaction.reply({ content: `Request received for template **${templateName}**. Generating preview...`, ephemeral: true });

        let diff: DiffResult;
        let currentState: GuildState;

        try {
            // 1. Load template and calculate diff
            const templatePath = path.resolve(process.cwd(), 'template.json');
            const templateFile = await fs.readFile(templatePath, 'utf-8');
            const template: ServerTemplate = JSON.parse(templateFile);
            currentState = await getGuildState(interaction.guild);
            diff = diffTemplate(currentState, template);

            // 2. Format and send the preview
            const previewEmbed = formatDiffPreview(diff, templateName);
            const actionRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder().setCustomId('build-confirm').setLabel('Apply Changes').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('build-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                );

            const response = await interaction.editReply({
                content: ``,
                embeds: [previewEmbed],
                components: [actionRow]
            });

            // 3. Wait for button interaction
            const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: 'You cannot use these buttons.', ephemeral: true });
                    return;
                }

                collector.stop();
                if (i.customId === 'build-confirm') {
                    try {
                        await i.update({ content: 'Applying changes...', embeds: [], components: [] });
                        const buildRun = await executeBuild(interaction.guild!, diff, currentState, templateName, i.user.id);

                        const undoButton = new ButtonBuilder()
                            .setCustomId(`build-undo-${buildRun.id}`)
                            .setLabel('Undo')
                            .setStyle(ButtonStyle.Danger);

                        const successRow = new ActionRowBuilder<ButtonBuilder>().addComponents(undoButton);

                        await i.editReply({ content: '✅ Build successful! The template has been applied.', components: [successRow] });
                    } catch (error) {
                        console.error("Error during build execution:", error);
                        await i.editReply({ content: '❌ An error occurred during execution. Please check the logs.' });
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

        } catch (error) {
            console.error("Error during preview generation:", error);
            await interaction.editReply({ content: 'An error occurred while generating the preview.', embeds:[], components: [] });
        }
    }
  },
};
