import { Guild, OverwriteResolvable, PermissionsString } from 'discord.js';
import prisma from '../prisma';
import { DiffResult } from './diffService';
import { GuildState, SimpleOverwrite } from './discordService';

async function mapOverwritesFromSnapshot(guild: Guild, snapshotOverwrites: SimpleOverwrite[] = []): Promise<OverwriteResolvable[]> {
    const results: OverwriteResolvable[] = [];
    await guild.roles.fetch();

    for (const overwrite of snapshotOverwrites) {
        let roleId: string | undefined;
        if (overwrite.roleName === '@everyone') {
            roleId = guild.roles.everyone.id;
        } else {
            const role = guild.roles.cache.find(r => r.name === overwrite.roleName);
            roleId = role?.id;
        }

        if (roleId) {
            results.push({
                id: roleId,
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
    // 1. Fetch the BuildRun record
    const buildRun = await prisma.buildRun.findUnique({
        where: { id: buildRunId },
    });

    if (!buildRun) {
        throw new Error('Build run not found.');
    }
    if (buildRun.status === 'ROLLED_BACK') {
        throw new Error('This build has already been rolled back.');
    }

    // 2. Parse the stored JSON data
    // It's important that the shapes match the original interfaces.
    // The maps from the original objects were lost during JSON serialization.
    const snapshot = buildRun.snapshot as any;
    const diff = buildRun.dryRunResult as DiffResult;

    // --- Reversal Phase ---
    // Order: Channels -> Categories -> Roles

    // 3. Revert Channel Changes
    for (const channelData of diff.channels.toCreate) {
        const channel = guild.channels.cache.find(c => c.name === channelData.channel.name);
        if (channel) await channel.delete();
    }
    for (const channelData of diff.channels.toUpdate) {
        const originalChannel = snapshot.channels.find((c: any) => c.id === channelData.existing.id);
        const liveChannel = guild.channels.cache.get(channelData.existing.id);

        if (originalChannel && liveChannel && 'edit' in liveChannel) {
            const originalOverwrites = await mapOverwritesFromSnapshot(guild, originalChannel.overwrites);
            await liveChannel.edit({
                topic: originalChannel.topic,
                permissionOverwrites: originalOverwrites,
            });
        }
    }

    // 4. Revert Category Changes
    for (const categoryData of diff.categories.toCreate) {
        const category = guild.channels.cache.find(c => c.name === categoryData.name);
        if (category) await category.delete();
    }

    // 5. Revert Role Changes
    for (const roleData of diff.roles.toCreate) {
        const role = guild.roles.cache.find(r => r.name === roleData.name);
        if (role) await role.delete();
    }
    for (const roleData of diff.roles.toUpdate) {
        const originalRole = snapshot.roles.find((r: any) => r.id === roleData.existing.id);
        if (originalRole) {
            await guild.roles.edit(roleData.existing.id, {
                name: originalRole.name,
                color: originalRole.color,
                hoist: originalRole.hoist,
                mentionable: originalRole.mentionable,
            });
        }
    }

    // 6. Mark the build as rolled back
    await prisma.buildRun.update({
        where: { id: buildRunId },
        data: { status: 'ROLLED_BACK' },
    });
}
