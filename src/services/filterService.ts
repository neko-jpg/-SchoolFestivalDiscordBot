import { Collection, GuildMember, Role } from 'discord.js';

export interface FilterConditions {
    withRole?: Role | null;
    withoutRole?: Role | null;
}

/**
 * Filters guild members based on a set of conditions.
 * @param members A collection of all guild members to filter.
 * @param conditions The conditions to filter by.
 * @returns A collection of members that match all conditions.
 */
export function filterMembers(
    members: Collection<string, GuildMember>,
    conditions: FilterConditions
): Collection<string, GuildMember> {
    let filteredMembers = members;

    if (conditions.withRole) {
        filteredMembers = filteredMembers.filter(member =>
            member.roles.cache.has(conditions.withRole!.id)
        );
    }

    if (conditions.withoutRole) {
        filteredMembers = filteredMembers.filter(member =>
            !member.roles.cache.has(conditions.withoutRole!.id)
        );
    }

    return filteredMembers;
}
