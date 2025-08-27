import { Guild, OverwriteResolvable, PermissionsString } from 'discord.js';
import getPrisma from '../prisma';
import { DiffResult } from './diffService';
import { SimpleOverwrite } from './discordService';

async function mapOverwritesFromSnapshot(guild: Guild, snapshotOverwrites: SimpleOverwrite[] = []): Promise<OverwriteResolvable[]> {
    const results: OverwriteResolvable[] = [];
    await guild.roles.fetch();

    for (const overwrite of snapshotOverwrites) {
        const role = overwrite.roleName === '@everyone'
            ? guild.roles.everyone
            : guild.roles.cache.find(r => r.name === overwrite.roleName);

        if (role) {
            results.push({
                id: role.id,
                allow: overwrite.allow as PermissionsString[],
                deny: overwrite.deny as PermissionsString[],
            });
        }
    }
    return results;
}

/**
 * Reverts a build by using the snapshot stored in a BuildRun record.
 * @param buildRunId The ID of the build run to roll back.
 * @param guild The guild where the rollback should occur.
 */
export async function executeRollback(buildRunId: string, guild: Guild) {
    const prisma = getPrisma();
    const buildRun = await prisma.buildRun.findUnique({ where: { id: buildRunId } });

    if (!buildRun) throw new Error('Build run not found.');
    if (buildRun.status === 'ROLLED_BACK') throw new Error('This build has already been rolled back.');

    const snapshot = buildRun.snapshot as any;
    const diff = buildRun.dryRunResult as unknown as DiffResult;
    const snapshotRoles = new Map<string, any>((snapshot.roles || []).map((r: any) => [r.id, r]));
    const snapshotChannels = new Map<string, any>((snapshot.channels || []).map((c: any) => [c.id, c]));

    // Revert Channels & Categories
    for (const channelData of diff.channels.toCreate) {
        const channel = guild.channels.cache.find(c => c.name === channelData.channel.name);
        if (channel) await channel.delete().catch(e => console.error(`Failed to delete channel ${channel.name}:`, e));
    }
    for (const categoryData of diff.categories.toCreate) {
        const category = guild.channels.cache.find(c => c.name === categoryData.name);
        if (category) await category.delete().catch(e => console.error(`Failed to delete category ${category.name}:`, e));
    }
    for (const channelData of diff.channels.toUpdate) {
        const originalChannel = snapshotChannels.get(channelData.existing.id);
        const liveChannel = guild.channels.cache.get(channelData.existing.id);
        if (originalChannel && liveChannel && 'edit' in liveChannel) {
            const originalOverwrites = await mapOverwritesFromSnapshot(guild, originalChannel.overwrites);
            await liveChannel.edit({
                topic: originalChannel.topic,
                permissionOverwrites: originalOverwrites,
            }).catch(e => console.error(`Failed to revert channel ${liveChannel.name}:`, e));
        }
    }

    // Revert Roles
    for (const roleData of diff.roles.toCreate) {
        const role = guild.roles.cache.find(r => r.name === roleData.name);
        if (role) await role.delete().catch(e => console.error(`Failed to delete role ${role.name}:`, e));
    }
    for (const roleData of diff.roles.toUpdate) {
        const originalRole = snapshotRoles.get(roleData.existing.id);
        if (originalRole) {
            await guild.roles.edit(roleData.existing.id, {
                name: originalRole.name,
                color: originalRole.color,
                hoist: originalRole.hoist,
                mentionable: originalRole.mentionable,
            }).catch(e => console.error(`Failed to revert role ${originalRole.name}:`, e));
        }
    }

    await prisma.buildRun.update({
        where: { id: buildRunId },
        data: { status: 'ROLLED_BACK' },
    });
}
