// src/deploy-commands.ts
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from './env';
import path from 'path'; import fs from 'fs';
import logger from './logger';

const commands: any[] = [];
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs
  .readdirSync(commandsDir)
  .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
) {
  const filePath = path.join(commandsDir, file);
  try {
    const imported = require(filePath);
    const c = imported.default ?? imported;
    if (c?.data?.toJSON) {
      commands.push(c.data.toJSON());
      logger.info({ command: c.data.name }, 'Prepared command for deploy');
    } else {
      logger.warn({ filePath }, 'Skip: no data.toJSON');
    }
  } catch (err) {
    logger.error({ err, filePath }, 'Skip broken command on deploy');
  }
}

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
(async () => {
  try {
    logger.info(`Uploading ${commands.length} commands to guild ${env.GUILD_ID}...`);
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), { body: commands });
    logger.info('✅ Deploy done');
  } catch (err) {
    logger.error({ err }, 'Deploy failed');
  }
})();
