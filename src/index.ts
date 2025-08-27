import { Client, GatewayIntentBits, Collection, Interaction } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { startReminderCronJob } from './scheduler';

config();

// Define a type for the client that includes our commands collection
interface CustomClient extends Client {
  commands: Collection<string, any>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages, // Required for DMs
  ],
}) as CustomClient;

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

client.once('ready', () => {
  if (client.user) {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    startReminderCronJob(client);
  } else {
    console.log('Ready! But user is not available.');
  }
});

import { executeRollback } from './services/rollbackService';

client.on('interactionCreate', async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    }
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith('build-undo-')) {
      if (!interaction.guild) {
          await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
          return;
      }

      const buildRunId = interaction.customId.split('-')[2];

      try {
        // Acknowledge the interaction immediately
        await interaction.update({ content: '🔄 Rolling back changes...', components: [] });

        await executeRollback(buildRunId, interaction.guild);

        // Edit the original message to show final status
        await interaction.followUp({ content: '✅ Rollback successful.', ephemeral: true });

      } catch (error: any) {
        console.error("Error during rollback:", error);
        await interaction.followUp({ content: `❌ An error occurred during rollback: ${error.message}`, ephemeral: true });
      }
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Error: DISCORD_TOKEN is not set in the .env file.');
  process.exit(1);
}

client.login(token);
