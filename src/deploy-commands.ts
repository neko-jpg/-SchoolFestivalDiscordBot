import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { config } from 'dotenv';
import { glob } from 'glob';
import path from 'path';

config();

const commands = [];
const commandFiles = glob.sync('./src/commands/**/*.ts');

for (const file of commandFiles) {
  const command = require(path.resolve(file));
  commands.push(command.data.toJSON());
}

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env file.');
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
