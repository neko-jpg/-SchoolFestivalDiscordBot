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

export interface ChannelDiff {
    toCreate: { channel: TemplateChannel; categoryName: string }[];
    toUpdate: { existing: SimpleChannel; changes: Partial<TemplateChannel>; categoryName: string }[];
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

function areOverwritesEqual(templateOverwrites: TemplateRoleOverwrite[] = [], existingOverwrites: SimpleOverwrite[] = []): boolean {
    if (templateOverwrites.length !== existingOverwrites.length) return false;

    const existingMap = new Map<string, { allow: Set<string>, deny: Set<string> }>();
    existingOverwrites.forEach(o => {
        existingMap.set(o.roleName, {
            allow: new Set(o.allow),
            deny: new Set(o.deny),
        });
    });

    for (const tplOverwrite of templateOverwrites) {
        const existingO = existingMap.get(tplOverwrite.role);
        if (!existingO) return false;

        const tplAllow = new Set(tplOverwrite.allow || []);
        const tplDeny = new Set(tplOverwrite.deny || []);

        if (tplAllow.size !== existingO.allow.size || tplDeny.size !== existingO.deny.size) return false;

        for (const p of tplAllow) if (!existingO.allow.has(p)) return false;
        for (const p of tplDeny) if (!existingO.deny.has(p)) return false;
    }

    return true;
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
                    const changes: Partial<TemplateChannel> = {};

                    // Compare topic
                    if (templateChannel.topic !== undefined && templateChannel.topic !== existingChannel.topic) {
                        changes.topic = templateChannel.topic;
                    }

                    // Compare overwrites
                    if (!areOverwritesEqual(templateChannel.overwrites, existingChannel.overwrites)) {
                        changes.overwrites = templateChannel.overwrites;
                    }

                    if (Object.keys(changes).length > 0) {
                        result.channels.toUpdate.push({ existing: existingChannel, changes, categoryName: templateCategory.name });
                    } else {
                        result.channels.toSkip.push(existingChannel);
                    }
                }
            });
        }
    });
}
