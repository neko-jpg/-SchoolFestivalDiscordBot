import { Client, GatewayIntentBits, Collection, Interaction, Partials } from 'discord.js';
import fs from 'fs';
import path from 'path';
import logger from './logger';

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection');
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught Exception, process will exit.');
  // In a real-world app, you might want to gracefully shut down here before exiting
  process.exit(1);
});
// --- End Global Error Handlers ---
import { env } from './env';
import { disconnectPrisma } from './prisma';
import { executeRollback } from './services/rollbackService';

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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
}) as CustomClient;

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      logger.warn({ filePath }, `Command is missing a required "data" or "execute" property.`);
    }
  } catch (error) {
      logger.error({ err: error, filePath }, 'Failed to load command file.');
  }
}

client.once('ready', () => {
  if (client.user) {
    logger.info({ user: client.user.tag }, 'Ready! Logged in.');
  } else {
    logger.warn('Ready, but client.user is not available.');
  }
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      logger.error({ commandName: interaction.commandName }, 'No command matching was found.');
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error: any) {
      logger.error({ err: error, commandName: interaction.commandName, user: interaction.user.id, guild: interaction.guild?.id }, 'Error executing command');
      const msg = (error?.code ? `[${error.code}] ` : '') + (error?.message ?? String(error));
      const reply = { content: `コマンド実行中にエラーが発生しました:\n\`\`\`\n${msg}\n\`\`\``, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  } else if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
        logger.error({ commandName: interaction.commandName }, 'No command matching was found for autocomplete.');
        return;
    }
    try {
        if (command.autocomplete) {
            await command.autocomplete(interaction);
        }
    } catch (error) {
        logger.error({ err: error, commandName: interaction.commandName }, 'Error executing autocomplete.');
    }
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith('build-undo-')) {
      if (!interaction.guild) {
          await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
          return;
      }

      const buildRunId = interaction.customId.split('-')[2];

      try {
        await interaction.update({ content: '🔄 Rolling back changes...', components: [] });
        await executeRollback(buildRunId, interaction.guild);
        await interaction.editReply({ content: '✅ Rollback successful.' });
      } catch (error: any) {
        logger.error({ err: error, buildRunId, user: interaction.user.id, guild: interaction.guild.id }, 'Error during build rollback');
        await interaction.editReply({ content: `❌ An error occurred during rollback: ${error.message}` });
      }
    }
  }
});

client.login(env.DISCORD_TOKEN);

process.on('SIGINT', async () => {
  logger.info('Received SIGINT. Shutting down gracefully...');
  await disconnectPrisma();
  client.destroy();
  logger.info('Clients disconnected. Exiting.');
  process.exit(0);
});
