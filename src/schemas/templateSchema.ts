import { z } from 'zod';
import { PermissionFlagsBits } from 'discord.js';

// Dynamically create a Zod enum from the keys of PermissionFlagsBits
const permissionNames = Object.keys(PermissionFlagsBits) as (keyof typeof PermissionFlagsBits)[];

// Legacy (snake_case UPPER) -> v14 PascalCase mapping for common permissions
const legacyMap: Record<string, keyof typeof PermissionFlagsBits> = {
  SEND_MESSAGES: 'SendMessages',
  VIEW_CHANNEL: 'ViewChannel',
  READ_MESSAGE_HISTORY: 'ReadMessageHistory',
  // Add as needed:
  // MANAGE_EMOJIS: 'ManageEmojisAndStickers',
  // USE_APPLICATION_COMMANDS: 'UseApplicationCommands',
  // MANAGE_ROLES: 'ManageRoles',
  // MANAGE_CHANNELS: 'ManageChannels',
};

// Accept both legacy and modern names; normalize before validating
const PermissionStringSchema = z.preprocess((v) => {
  if (typeof v === 'string') {
    const upper = v.toUpperCase();
    if (legacyMap[upper]) return legacyMap[upper];
  }
  return v;
}, z.enum(permissionNames));

const hexColorRegex = /^#?[0-9a-fA-F]{6}$/;

const TemplateRoleOverwriteSchema = z.object({
  role: z.string().min(1, { message: "Overwrite role name cannot be empty." }),
  allow: z.array(PermissionStringSchema).default([]),
  deny: z.array(PermissionStringSchema).default([]),
});

const TemplateChannelSchema = z.object({
  name: z.string().min(1, { message: "Channel name cannot be empty." }),
  type: z.enum(['text', 'voice', 'forum']),
  topic: z.string().max(1024, { message: "Channel topic cannot be longer than 1024 characters." }).optional(),
  bitrate: z.number().optional(),
  overwrites: z.array(TemplateRoleOverwriteSchema).optional(),
});

const TemplateCategorySchema = z.object({
  name: z.string().min(1, { message: "Category name cannot be empty." }),
  channels: z.array(TemplateChannelSchema).min(1, { message: "A category must have at least one channel." }),
});

const TemplateRoleSchema = z.object({
  name: z.string().min(1, { message: "Role name cannot be empty." }),
  color: z.string().regex(hexColorRegex, { message: "Invalid hex color format. e.g. #AABBCC" }).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
});

export const ServerTemplateSchema = z.object({
  version: z.literal('1', { message: "Template version must be '1'." }),
  name: z.string().min(1, { message: "Template name cannot be empty." }),
  roles: z.array(TemplateRoleSchema).optional(),
  categories: z.array(TemplateCategorySchema).optional(),
});

/**
 * A TypeScript type inferred from the Zod schema.
 * This ensures the type always matches the validation rules.
 */
export type ServerTemplate = z.infer<typeof ServerTemplateSchema>;
