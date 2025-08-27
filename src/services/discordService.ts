import { Guild, Role, ChannelType, TextChannel, VoiceChannel, CategoryChannel, PermissionOverwriteManager, PermissionFlags, PermissionsBitField } from 'discord.js';

// A simplified representation of a role for diffing purposes
export interface SimpleRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    mentionable: boolean;
    position: number;
}

export interface SimpleOverwrite {
    roleName: string;
    allow: string[];
    deny: string[];
}

// A simplified representation of a channel for diffing purposes
export interface SimpleChannel {
    id: string;
    name: string;
    type: ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildCategory;
    topic?: string | null;
    parentId: string | null;
    position: number;
    overwrites: SimpleOverwrite[];
}

// The overall state of the guild relevant for the template
export interface GuildState {
    roles: Map<string, SimpleRole>;
    channels: Map<string, SimpleChannel>;
}

/**
 * Fetches the current state of the guild (roles and channels) from Discord.
 * @param guild The discord.js Guild object.
 * @returns A promise that resolves to a structured representation of the guild's state.
 */
export async function getGuildState(guild: Guild): Promise<GuildState> {
    const state: GuildState = {
        roles: new Map(),
        channels: new Map(),
    };

    // 1. Fetch all roles from the guild
    const guildRoles = await guild.roles.fetch();
    guildRoles.forEach(role => {
        // We ignore the @everyone role unless it's explicitly managed in overwrites
        if (role.name !== '@everyone') {
            state.roles.set(role.name, {
                id: role.id,
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                position: role.position,
            });
        }
    });

    // Create a map of role IDs to names for easy lookup
    const roleIdToName = new Map<string, string>();
    guildRoles.forEach(role => roleIdToName.set(role.id, role.name));
    const everyoneRole = guild.roles.everyone;
    roleIdToName.set(everyoneRole.id, everyoneRole.name);

    // 2. Fetch all channels from the guild
    const guildChannels = await guild.channels.fetch();
    guildChannels.forEach(channel => {
        if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildCategory)) {

            const simpleOverwrites: SimpleOverwrite[] = [];
            channel.permissionOverwrites.cache.forEach(overwrite => {
                if (overwrite.type === 0) { // 0 for 'role'
                    const roleName = roleIdToName.get(overwrite.id);
                    if (roleName) {
                        simpleOverwrites.push({
                            roleName: roleName,
                            allow: new PermissionsBitField(overwrite.allow).toArray(),
                            deny: new PermissionsBitField(overwrite.deny).toArray(),
                        });
                    }
                }
            });

            state.channels.set(channel.name, {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                topic: channel.type === ChannelType.GuildText ? channel.topic : null,
                parentId: channel.parentId,
                position: channel.position,
                overwrites: simpleOverwrites,
            });
        }
    });

    return state;
}
