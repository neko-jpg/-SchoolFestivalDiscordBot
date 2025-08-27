import { ChannelType, Guild, OverwriteResolvable, PermissionsString } from 'discord.js';
import getPrisma from '../prisma';
import { TemplateRoleOverwrite } from '../types/template';
import { DiffResult } from './diffService';
import { GuildState } from './discordService';

// --- Utility ---
function hexToNumber(hex: string): number {
    return parseInt(hex.startsWith('#') ? hex.substring(1) : hex, 16);
}

async function mapOverwrites(guild: Guild, templateOverwrites: TemplateRoleOverwrite[] = []): Promise<OverwriteResolvable[]> {
    const results: OverwriteResolvable[] = [];
    await guild.roles.fetch();

    for (const overwrite of templateOverwrites) {
        const role = overwrite.role === '@everyone'
            ? guild.roles.everyone
            : guild.roles.cache.find(r => r.name === overwrite.role);

        if (role) {
            results.push({
                id: role.id,
                allow: (overwrite.allow || []) as PermissionsString[],
                deny: (overwrite.deny || []) as PermissionsString[],
            });
        } else {
            console.warn(`Could not find role '${overwrite.role}' for permission overwrite. Skipping.`);
        }
    }
    return results;
}

/**
 * Executes the changes determined by the diffing service and returns the build run record.
 */
export async function executeBuild(guild: Guild, diff: DiffResult, currentState: GuildState, templateName: string, userId: string) {
    const prisma = getPrisma();
    const buildRun = await prisma.buildRun.create({
        data: {
            templateName: templateName,
            executedBy: userId,
            status: 'PENDING',
            snapshot: currentState as any,
            dryRunResult: diff as any,
        },
    });

    try {
        // --- Role Changes ---
        for (const roleToCreate of diff.roles.toCreate) {
            await guild.roles.create({
                name: roleToCreate.name,
                color: roleToCreate.color ? hexToNumber(roleToCreate.color) : undefined,
                hoist: roleToCreate.hoist,
                mentionable: roleToCreate.mentionable,
                permissions: [],
            });
        }
        for (const roleToUpdate of diff.roles.toUpdate) {
             await guild.roles.edit(roleToUpdate.existing.id, {
                color: roleToUpdate.changes.color ? hexToNumber(roleToUpdate.changes.color) : undefined,
                hoist: roleToUpdate.changes.hoist,
                mentionable: roleToUpdate.changes.mentionable
            });
        }

        // --- Category and Channel Changes ---
        const createdCategories = new Map<string, string>();
        for (const categoryToCreate of diff.categories.toCreate) {
            const newCategory = await guild.channels.create({
                name: categoryToCreate.name,
                type: ChannelType.GuildCategory,
            });
            createdCategories.set(categoryToCreate.name, newCategory.id);
        }

        for (const channelToCreate of diff.channels.toCreate) {
            const parentCategory = guild.channels.cache.find(c => c.name === channelToCreate.categoryName && c.type === ChannelType.GuildCategory);
            const parentId = parentCategory?.id ?? createdCategories.get(channelToCreate.categoryName);

            if (!parentId) {
                console.warn(`Could not find parent category for '#${channelToCreate.channel.name}'. Skipping.`);
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

        for (const channelToUpdate of diff.channels.toUpdate) {
            const channel = guild.channels.cache.get(channelToUpdate.existing.id);
            if (channel && 'edit' in channel) {
                const newOverwrites = channelToUpdate.changes.overwrites
                    ? await mapOverwrites(guild, channelToUpdate.changes.overwrites)
                    : undefined;

                await channel.edit({
                    topic: channelToUpdate.changes.topic,
                    permissionOverwrites: newOverwrites,
                });
            }
        }

        const finalBuildRun = await prisma.buildRun.update({
            where: { id: buildRun.id },
            data: { status: 'SUCCESS' },
        });
        return finalBuildRun;

    } catch (error) {
        await prisma.buildRun.update({
            where: { id: buildRun.id },
            data: { status: 'FAILED' },
        });
        throw error;
    }
}
