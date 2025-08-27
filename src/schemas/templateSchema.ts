import { z } from 'zod';

const hexColorRegex = /^#?[0-9a-fA-F]{6}$/;

const TemplateRoleOverwriteSchema = z.object({
  role: z.string().min(1, { message: "Overwrite role name cannot be empty." }),
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
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
