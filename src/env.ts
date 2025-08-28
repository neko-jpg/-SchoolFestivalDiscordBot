import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file at the top of the application.
// Use override:true so local .env wins over machine-level env vars
// (avoids picking up stale DATABASE_URL etc.)
config({ override: true });

// Prefer DISCORD_* names but accept legacy aliases without breaking existing setups
const mergedEnv = {
  ...process.env,
  CLIENT_ID: process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID,
  GUILD_ID: process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID,
  // Normalize scope to lowercase for case-insensitive input
  COMMANDS_SCOPE: process.env.COMMANDS_SCOPE?.toLowerCase(),
};

// Define the schema for environment variables
const envSchema = z.object({
  DISCORD_TOKEN: z
    .string()
    .min(1, 'DISCORD_TOKEN is required.'),
  CLIENT_ID: z
    .string()
    .min(1, 'CLIENT_ID is required.')
    .regex(/^\d+$/, 'CLIENT_ID must be a valid Discord ID.'),
  GUILD_ID: z
    .string()
    .min(1, 'GUILD_ID is required.')
    .regex(/^\d+$/, 'GUILD_ID must be a valid Discord ID.'),
  COMMANDS_SCOPE: z
    .enum(['guild', 'global', 'both', 'clear-guild', 'clear-global'])
    .default('guild'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  // Limit deploy to specific command names (comma-separated)
  COMMANDS_TARGET: z
    .preprocess((v) => {
      if (typeof v !== 'string') return [];
      return v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }, z.array(z.string()).default([])),
  COMMANDS_DRY_RUN: z
    .preprocess((v) => {
      if (typeof v === 'string') return /^(1|true|yes|on)$/i.test(v);
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'boolean') return v;
      return false;
    }, z.boolean().default(false)),
  AUTO_DEPLOY_ON_STARTUP: z
    .preprocess((v) => {
      if (typeof v === 'string') return /^(1|true|yes|on)$/i.test(v);
      if (typeof v === 'number') return v !== 0;
      if (typeof v === 'boolean') return v;
      return false;
    }, z.boolean().default(false)),
  // Optional integrations
  DATABASE_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  NOTION_API_KEY: z.string().optional(),
  NOTION_DATABASE_ID: z.string().optional(),
  NOTION_NAME_COLUMN: z.string().optional(),
  NOTION_OWNER_COLUMN: z.string().optional(),
  NOTION_DUEDATE_COLUMN: z.string().optional(),
  NOTION_STATUS_COLUMN: z.string().optional(),
  NOTION_STATUS_PENDING: z.string().optional(),
  WEATHER_API_KEY: z.string().optional(),
  GOOGLE_CALENDAR_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEET_ID: z.string().optional(),
  EXPENSE_REPORT_FORM_URL: z.string().url().optional(),
  REMINDER_CHANNEL_ID: z.string().regex(/^\d+$/, 'REMINDER_CHANNEL_ID must be a Discord ID.').optional(),
  // Optional visibility diagnostics
  VISIBILITY_CHECK_USER_ID: z.string().regex(/^\d+$/).optional(),
  VISIBILITY_CHECK_CHANNEL_ID: z.string().regex(/^\d+$/).optional(),
  FESTIVAL_START_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'FESTIVAL_START_DATE must be in YYYY-MM-DD format.')
    .optional(),
});

// Parse and export the environment variables.
// The .parse() method will throw a descriptive error if validation fails.
export const env = envSchema.parse(mergedEnv);
