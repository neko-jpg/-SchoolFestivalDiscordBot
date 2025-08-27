import { Guild, PermissionsBitField } from 'discord.js';
import { DiffResult } from './diffService';

/**
 * Validates if a build is possible by checking bot permissions and hierarchy.
 * @param guild The guild where the build will be executed.
 * @param diff The calculated diff of changes.
 * @returns An array of error messages. An empty array means validation passed.
 */
export function validateBuild(guild: Guild, diff: DiffResult): string[] {
    const errors: string[] = [];
    const botMember = guild.members.me;

    if (!botMember) {
        // This should theoretically never happen if the bot is in the guild.
        errors.push('Could not determine the bot\'s identity in the server. Cannot validate permissions.');
        return errors;
    }

    const hasChannelChanges = diff.channels.toCreate.length > 0 || diff.categories.toCreate.length > 0 || diff.channels.toUpdate.length > 0;
    const hasRoleChanges = diff.roles.toCreate.length > 0 || diff.roles.toUpdate.length > 0;

    // 1. Check for necessary permissions
    if (hasChannelChanges && !botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        errors.push('**Missing Permission**: The bot requires the `Manage Channels` permission to create or update channels and categories.');
    }
    if (hasRoleChanges && !botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        errors.push('**Missing Permission**: The bot requires the `Manage Roles` permission to create or update roles.');
    }

    // 2. Check role hierarchy
    if (hasRoleChanges) {
        const botHighestRolePosition = botMember.roles.highest.position;

        for (const roleToUpdate of diff.roles.toUpdate) {
            // We need to check the live role's position, not the snapshot's
            const liveRole = guild.roles.cache.get(roleToUpdate.existing.id);
            if (liveRole && liveRole.position >= botHighestRolePosition) {
                errors.push(`**Hierarchy Error**: The bot's highest role is not high enough to edit the \`@${liveRole.name}\` role.`);
            }
        }
    }

    return errors;
}
