import { ChannelType } from 'discord.js';
import { ServerTemplate, TemplateCategory, TemplateChannel, TemplateRole, TemplateRoleOverwrite } from '../types/template';
import { GuildState, SimpleChannel, SimpleOverwrite, SimpleRole } from './discordService';

// --- Utility Functions ---

/**
 * Converts a hex color string to a decimal number.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @returns The color as a decimal number.
 */
function hexToNumber(hex: string): number {
    return parseInt(hex.startsWith('#') ? hex.substring(1) : hex, 16);
}


// --- Diffing Interfaces ---

export interface RoleDiff {
    toCreate: TemplateRole[];
    toUpdate: { existing: SimpleRole; changes: Partial<TemplateRole> }[];
    toSkip: SimpleRole[];
}

export interface CategoryDiff {
    toCreate: TemplateCategory[];
    toSkip: SimpleChannel[];
}

export interface OverwriteChanges {
    roleName: string;
    addedAllow: string[];
    removedAllow: string[];
    addedDeny: string[];
    removedDeny: string[];
}

export interface ChannelChanges {
    topic?: string;
    overwrites?: OverwriteChanges[];
}

export interface ChannelDiff {
    toCreate: { channel: TemplateChannel; categoryName: string }[];
    toUpdate: { existing: SimpleChannel; changes: ChannelChanges; categoryName: string }[];
    toSkip: SimpleChannel[];
}

export interface DiffResult {
    roles: RoleDiff;
    categories: CategoryDiff;
    channels: ChannelDiff;
}

// --- Main Diffing Logic ---

/**
 * Compares the server template with the current guild state to determine changes.
 * @param currentState The current state of the guild.
 * @param template The desired state from the template file.
 * @returns An object detailing what needs to be created, updated, or skipped.
 */
export function diffTemplate(currentState: GuildState, template: ServerTemplate): DiffResult {
    const result: DiffResult = {
        roles: { toCreate: [], toUpdate: [], toSkip: [] },
        categories: { toCreate: [], toSkip: [] },
        channels: { toCreate: [], toUpdate: [], toSkip: [] },
    };

    diffRoles(currentState, template, result);
    diffCategoriesAndChannels(currentState, template, result);

    return result;
}

function diffRoles(currentState: GuildState, template: ServerTemplate, result: DiffResult) {
    template.roles?.forEach(templateRole => {
        const existingRole = currentState.roles.get(templateRole.name);
        if (!existingRole) {
            result.roles.toCreate.push(templateRole);
        } else {
            // For now, we just check for existence. Update logic will be added later.
            // A simple check for color difference:
            const changes: Partial<TemplateRole> = {};
            if (templateRole.color && hexToNumber(templateRole.color) !== existingRole.color) {
                changes.color = templateRole.color;
            }
             if (templateRole.hoist !== undefined && templateRole.hoist !== existingRole.hoist) {
                changes.hoist = templateRole.hoist;
            }
            if (templateRole.mentionable !== undefined && templateRole.mentionable !== existingRole.mentionable) {
                changes.mentionable = templateRole.mentionable;
            }

            if (Object.keys(changes).length > 0) {
                result.roles.toUpdate.push({ existing: existingRole, changes });
            } else {
                result.roles.toSkip.push(existingRole);
            }
        }
    });
}

function diffOverwrites(templateOverwrites: TemplateRoleOverwrite[] = [], existingOverwrites: SimpleOverwrite[] = []): OverwriteChanges[] {
    const changes: OverwriteChanges[] = [];
    const tplMap = new Map(templateOverwrites.map(o => [o.role, o]));
    const existingMap = new Map(existingOverwrites.map(o => [o.roleName, o]));

    const allRoleNames = new Set([...tplMap.keys(), ...existingMap.keys()]);

    allRoleNames.forEach(roleName => {
        const tplO = tplMap.get(roleName);
        const existingO = existingMap.get(roleName);

        const tplAllow = new Set(tplO?.allow || []);
        const tplDeny = new Set(tplO?.deny || []);
        const existingAllow = new Set(existingO?.allow || []);
        const existingDeny = new Set(existingO?.deny || []);

        const addedAllow = [...tplAllow].filter(p => !existingAllow.has(p));
        const removedAllow = [...existingAllow].filter(p => !tplAllow.has(p));
        const addedDeny = [...tplDeny].filter(p => !existingDeny.has(p));
        const removedDeny = [...existingDeny].filter(p => !tplDeny.has(p));

        if (addedAllow.length > 0 || removedAllow.length > 0 || addedDeny.length > 0 || removedDeny.length > 0) {
            changes.push({ roleName, addedAllow, removedAllow, addedDeny, removedDeny });
        }
    });

    return changes;
}

function diffCategoriesAndChannels(currentState: GuildState, template: ServerTemplate, result: DiffResult) {
    const existingCategories = new Map<string, SimpleChannel>();
    const existingChannelsByParent = new Map<string, SimpleChannel[]>();

    currentState.channels.forEach(channel => {
        if (channel.type === ChannelType.GuildCategory) {
            existingCategories.set(channel.name, channel);
        } else if (channel.parentId) {
            const channels = existingChannelsByParent.get(channel.parentId) || [];
            channels.push(channel);
            existingChannelsByParent.set(channel.parentId, channels);
        }
    });

    template.categories?.forEach(templateCategory => {
        const existingCategory = existingCategories.get(templateCategory.name);
        if (!existingCategory) {
            // If category doesn't exist, all its channels are new
            result.categories.toCreate.push(templateCategory);
            templateCategory.channels.forEach(channel => {
                result.channels.toCreate.push({ channel, categoryName: templateCategory.name });
            });
        } else {
            // Category exists, so skip it and diff its channels
            result.categories.toSkip.push(existingCategory);
            const childChannels = existingChannelsByParent.get(existingCategory.id) || [];
            const childChannelsMap = new Map(childChannels.map(c => [c.name, c]));

            templateCategory.channels.forEach(templateChannel => {
                const existingChannel = childChannelsMap.get(templateChannel.name);
                if (!existingChannel) {
                    result.channels.toCreate.push({ channel: templateChannel, categoryName: templateCategory.name });
                } else {
                    const changes: ChannelChanges = {};
                    let hasChanges = false;

                    // Compare topic
                    if (templateChannel.topic !== undefined && templateChannel.topic !== existingChannel.topic) {
                        changes.topic = templateChannel.topic;
                        hasChanges = true;
                    }

                    // Compare overwrites
                    const overwriteChanges = diffOverwrites(templateChannel.overwrites, existingChannel.overwrites);
                    if (overwriteChanges.length > 0) {
                        changes.overwrites = overwriteChanges;
                        hasChanges = true;
                    }

                    if (hasChanges) {
                        result.channels.toUpdate.push({ existing: existingChannel, changes, categoryName: templateCategory.name });
                    } else {
                        result.channels.toSkip.push(existingChannel);
                    }
                }
            });
        }
    });
}
