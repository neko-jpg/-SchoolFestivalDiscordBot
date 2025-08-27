import { ChannelType, Guild, OverwriteResolvable, PermissionsString } from 'discord.js';
import prisma from '../prisma';
import { TemplateRoleOverwrite } from '../types/template';
import { DiffResult } from './diffService';
import { GuildState } from './discordService';

// --- Utility ---
function hexToNumber(hex: string): number {
    return parseInt(hex.startsWith('#') ? hex.substring(1) : hex, 16);
}

async function mapOverwrites(guild: Guild, templateOverwrites: TemplateRoleOverwrite[] = []): Promise<OverwriteResolvable[]> {
    const results: OverwriteResolvable[] = [];
    // Ensure all roles are fetched into the cache
    await guild.roles.fetch();

    for (const overwrite of templateOverwrites) {
        let roleId: string | undefined;
        if (overwrite.role === '@everyone') {
            roleId = guild.roles.everyone.id;
        } else {
            const role = guild.roles.cache.find(r => r.name === overwrite.role);
            roleId = role?.id;
        }

        if (roleId) {
            results.push({
                id: roleId,
                allow: overwrite.allow as PermissionsString[],
                deny: overwrite.deny as PermissionsString[],
            });
        } else {
            console.warn(`Could not find role '${overwrite.role}' for permission overwrite. Skipping.`);
        }
    }
    return results;
}

/**
 * Executes the changes determined by the diffing service.
 * @param guild The guild to apply changes to.
 * @param diff The diff result from the diffing service.
 * @param currentState The state of the guild before changes, used for snapshotting.
 * @param templateName The name of the template being applied.
 * @param userId The ID of the user who initiated the build.
 */
export async function executeBuild(guild: Guild, diff: DiffResult, currentState: GuildState, templateName: string, userId: string) {
    // 1. Create a snapshot and a BuildRun record
    const buildRun = await prisma.buildRun.create({
        data: {
            templateName: templateName,
            executedBy: userId,
            status: 'PENDING',
            snapshot: currentState as any, // Cast to any to satisfy Prisma's JsonValue
            dryRunResult: diff as any,
        },
    });

    try {
        // --- Execution Phase ---
        // The order of operations is important to handle dependencies (roles -> categories -> channels)

        // 2. Execute Role Changes
        for (const roleToCreate of diff.roles.toCreate) {
            await guild.roles.create({
                name: roleToCreate.name,
                color: roleToCreate.color ? hexToNumber(roleToCreate.color) : undefined,
                hoist: roleToCreate.hoist,
                mentionable: roleToCreate.mentionable,
                permissions: [], // Permissions are handled via overwrites, not on the role itself
            });
        }
        for (const roleToUpdate of diff.roles.toUpdate) {
             await guild.roles.edit(roleToUpdate.existing.id, {
                color: roleToUpdate.changes.color ? hexToNumber(roleToUpdate.changes.color) : undefined,
                hoist: roleToUpdate.changes.hoist,
                mentionable: roleToUpdate.changes.mentionable
            });
        }

        // 3. Execute Category and Channel Changes
        const createdCategories = new Map<string, string>(); // Map from template category name to created category ID

        for (const categoryToCreate of diff.categories.toCreate) {
            const newCategory = await guild.channels.create({
                name: categoryToCreate.name,
                type: ChannelType.GuildCategory,
            });
            createdCategories.set(categoryToCreate.name, newCategory.id);
        }

        for (const channelToCreate of diff.channels.toCreate) {
            // Find parent category ID
            const parentCategory = guild.channels.cache.find(c => c.name === channelToCreate.categoryName && c.type === ChannelType.GuildCategory);
            const parentId = parentCategory?.id ?? createdCategories.get(channelToCreate.categoryName);

            if (!parentId) {
                console.warn(`Could not find or create parent category '${channelToCreate.categoryName}' for channel '#${channelToCreate.channel.name}'. Skipping.`);
                continue;
            }

            const permissionOverwrites = await mapOverwrites(guild, channelToCreate.channel.overwrites);

            await guild.channels.create({
                name: channelToCreate.channel.name,
                type: channelToCreate.channel.type === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice,
                topic: channelToCreate.channel.topic,
                parent: parentId,
                permissionOverwrites,
            });
        }

        // 4. Execute Channel Updates
        for (const channelToUpdate of diff.channels.toUpdate) {
            const channel = guild.channels.cache.get(channelToUpdate.existing.id);
            if (channel && 'edit' in channel) {
                const newOverwrites = await mapOverwrites(guild, channelToUpdate.changes.overwrites);
                await channel.edit({
                    topic: channelToUpdate.changes.topic,
                    permissionOverwrites: newOverwrites,
                });
            }
        }

        // 4. If all successful, update the build run status
        const finalBuildRun = await prisma.buildRun.update({
            where: { id: buildRun.id },
            data: { status: 'SUCCESS' },
        });
        return finalBuildRun;

    } catch (error) {
        // 5. If an error occurs, update the status and re-throw
        await prisma.buildRun.update({
            where: { id: buildRun.id },
            data: { status: 'FAILED' },
        });
        // Re-throw the error to be caught by the command handler
        throw error;
    }
}
