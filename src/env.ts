import { z } from 'zod';
import { config } from 'dotenv';

// Load .env file at the top of the application
config();

// Define the schema for environment variables
const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required."),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required.").regex(/^\d+$/, "CLIENT_ID must be a valid Discord ID."),
  GUILD_ID: z.string().min(1, "GUILD_ID is required.").regex(/^\d+$/, "GUILD_ID must be a valid Discord ID."),
  DATABASE_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
  FESTIVAL_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "FESTIVAL_START_DATE must be in YYYY-MM-DD format.").optional(),
});

// Parse and export the environment variables.
// The .parse() method will throw a descriptive error if validation fails.
export const env = envSchema.parse(process.env);
