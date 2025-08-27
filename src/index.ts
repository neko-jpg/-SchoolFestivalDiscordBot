// src/index.ts
import { Client, GatewayIntentBits, Collection, Interaction } from 'discord.js';
import fs from 'fs'; import path from 'path';
import { env } from './env';
import logger from './logger';
import { disconnectPrisma } from './prisma';

type Command = { data: any; execute: (i: any)=>Promise<void>; autocomplete?: (i:any)=>Promise<void> };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
}) as any;

client.commands = new Collection<string, Command>();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs
  .readdirSync(commandsPath)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
) {
  const filePath = path.join(commandsPath, file);
  try {
    const imported = require(filePath);
    const cmd: Command = (imported.default ?? imported) as Command;
    if (cmd?.data?.name && typeof cmd.execute === 'function') {
      client.commands.set(cmd.data.name, cmd);
      logger.info({ command: cmd.data.name }, 'Loaded command');
    } else {
      logger.warn({ filePath }, 'Invalid command module shape, skipped');
    }
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to load command (skipped)');
  }
}

client.once('ready', () => logger.info({ user: client.user?.tag }, 'Ready! Logged in'));
client.on('interactionCreate', async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd: Command | undefined = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try { await cmd.execute(interaction); }
    catch (err: any) {
      logger.error({ err, command: interaction.commandName }, 'Command failed');
      const msg = (err?.code ? `[${err.code}] ` : '') + (err?.message ?? String(err));
      const payload = { content: `❌ Error:\n\`\`\`\n${msg}\n\`\`\``, ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  } else if (interaction.isAutocomplete()) {
    const cmd: Command | undefined = client.commands.get(interaction.commandName);
    if (cmd?.autocomplete) try { await cmd.autocomplete(interaction); } catch (e) { logger.error({ e }, 'Autocomplete failed'); }
  }
});

client.login(env.DISCORD_TOKEN);
process.on('SIGINT', async () => { await disconnectPrisma(); client.destroy(); process.exit(0); });
