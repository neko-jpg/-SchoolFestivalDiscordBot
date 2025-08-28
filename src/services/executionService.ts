import { ChannelType, Guild, OverwriteResolvable, PermissionsString } from 'discord.js';
import getPrisma from '../prisma';
import { withTimeout } from '../utils';
import logger from '../logger';
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
            logger.warn({ roleName: overwrite.role, guildId: guild.id }, "Could not find role for permission overwrite. Skipping.");
        }
    }
    return results;
}

/**
 * Executes the changes determined by the diffing service and returns the build run record.
 */
export async function executeBuild(guild: Guild, diff: DiffResult, currentState: GuildState, templateName: string, userId: string) {
    const prisma = getPrisma();
    let buildRun: { id: string } | null = null;
    try {
      buildRun = await withTimeout(
        prisma.buildRun.create({
          data: {
            guildId: guild.id,
            templateName,
            executedBy: userId,
            status: 'PENDING',
            snapshot: currentState as any,
            dryRunResult: diff as any,
          },
        }),
        5000,
        undefined,
        'buildRun.create'
      );
    } catch (e: any) {
      logger.warn({ err: e }, 'DB unavailable: proceeding with build without persistence');
    }

    const failures: string[] = [];

    // --- Role Creation ---
    for (const roleToCreate of diff.roles.toCreate) {
        try {
            const existingRole = guild.roles.cache.find(r => r.name === roleToCreate.name);
            if (existingRole) {
                failures.push(`Role '${roleToCreate.name}' already exists, skipping creation.`);
                continue;
            }
            await guild.roles.create({
                name: roleToCreate.name,
                color: roleToCreate.color ? hexToNumber(roleToCreate.color) : undefined,
                hoist: roleToCreate.hoist,
                mentionable: roleToCreate.mentionable,
                permissions: [],
            });
        } catch (e: any) {
            failures.push(`Failed to create role '${roleToCreate.name}': [${e.code}] ${e.message}`);
        }
    }

    // --- Role Updates ---
    for (const roleToUpdate of diff.roles.toUpdate) {
        try {
            await guild.roles.edit(roleToUpdate.existing.id, {
                color: roleToUpdate.changes.color ? hexToNumber(roleToUpdate.changes.color) : undefined,
                hoist: roleToUpdate.changes.hoist,
                mentionable: roleToUpdate.changes.mentionable,
            });
        } catch (e: any) {
            failures.push(`Failed to update role '${roleToUpdate.existing.name}': [${e.code}] ${e.message}`);
        }
    }

    await guild.roles.fetch(); // Re-fetch roles to ensure cache is up-to-date for permission overwrites

    // --- Category and Channel Changes ---
    const createdCategories = new Map<string, string>();
    for (const categoryToCreate of diff.categories.toCreate) {
        try {
            const existingCategory = guild.channels.cache.find(c => c.name === categoryToCreate.name && c.type === ChannelType.GuildCategory);
            if (existingCategory) {
                failures.push(`Category '${categoryToCreate.name}' already exists, skipping creation.`);
                createdCategories.set(categoryToCreate.name, existingCategory.id);
                continue;
            }
            const newCategory = await guild.channels.create({ name: categoryToCreate.name, type: ChannelType.GuildCategory });
            createdCategories.set(categoryToCreate.name, newCategory.id);
        } catch (e: any) {
            failures.push(`Failed to create category '${categoryToCreate.name}': [${e.code}] ${e.message}`);
        }
    }

    for (const channelToCreate of diff.channels.toCreate) {
        try {
            const existingChannel = guild.channels.cache.find(c => c.name === channelToCreate.channel.name && c.type !== ChannelType.GuildCategory);
            if (existingChannel) {
                failures.push(`Channel '#${channelToCreate.channel.name}' already exists, skipping creation.`);
                continue;
            }

            const parentCategory = guild.channels.cache.find(c => c.name === channelToCreate.categoryName && c.type === ChannelType.GuildCategory);
            const parentId = parentCategory?.id ?? createdCategories.get(channelToCreate.categoryName);

            if (!parentId) {
                failures.push(`Could not find parent category for '#${channelToCreate.channel.name}'. Skipping.`);
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
        } catch (e: any) {
            failures.push(`Failed to create channel '#${channelToCreate.channel.name}': [${e.code}] ${e.message}`);
        }
    }

    for (const channelToUpdate of diff.channels.toUpdate) {
        try {
            const channel = guild.channels.cache.get(channelToUpdate.existing.id);
            if (channel && 'edit' in channel) {
                const newOverwrites = channelToUpdate.changes.overwrites ? await mapOverwrites(guild, channelToUpdate.changes.overwrites) : undefined;
                await channel.edit({ topic: channelToUpdate.changes.topic, permissionOverwrites: newOverwrites });
            } else {
                failures.push(`Could not find channel '#${channelToUpdate.existing.name}' to update.`);
            }
        } catch (e: any) {
            failures.push(`Failed to update channel '#${channelToUpdate.existing.name}': [${e.code}] ${e.message}`);
        }
    }

    if (buildRun?.id) {
      try {
        await withTimeout(
          prisma.buildRun.update({ where: { id: buildRun.id }, data: { status: 'SUCCESS' } }),
          5000,
          undefined,
          'buildRun.update'
        );
      } catch (e: any) {
        logger.warn({ err: e }, 'DB unavailable when marking build success');
      }
    }

    return { buildRun, failures };
}
