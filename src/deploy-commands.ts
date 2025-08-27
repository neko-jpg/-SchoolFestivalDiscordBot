import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from './env';
import { glob } from 'glob';
import path from 'path';
import logger from './logger';

const commands = [];
const commandFiles = glob.sync('./src/commands/**/*.ts');

logger.info(`Found ${commandFiles.length} command files.`);

for (const file of commandFiles) {
  try {
    const command = require(path.resolve(file));
    if (command.data && typeof command.data.toJSON === 'function') {
      commands.push(command.data.toJSON());
    } else {
      logger.warn({ file }, `Command is missing a required "data" or "toJSON" method.`);
    }
  } catch (error) {
    logger.error({ err: error, file }, `Failed to load command.`);
  }
}

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

(async () => {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    await rest.put(
      Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
      { body: commands },
    );

    logger.info(`Successfully reloaded ${commands.length} application (/) commands.`);
  } catch (error) {
    logger.error({ err: error }, 'Failed to reload application commands.');
  }
})();
