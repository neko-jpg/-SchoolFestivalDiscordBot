import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from './env';
import { glob } from 'glob';
import path from 'path';

const commands = [];
const commandFiles = glob.sync('./src/commands/**/*.ts');

for (const file of commandFiles) {
  try {
    const command = require(path.resolve(file));
    if (command.data && typeof command.data.toJSON === 'function') {
      commands.push(command.data.toJSON());
    } else {
      console.log(`[WARNING] The command at ${file} is missing a required "data" property or "toJSON" method.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to load command at ${file}:`, error);
  }
}

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
