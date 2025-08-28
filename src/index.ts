// src/index.ts
import { Client, GatewayIntentBits, Collection, Interaction, Events } from 'discord.js';
import fs from 'fs'; import path from 'path';
import { env } from './env';
import { tryConnectPrisma } from './prisma';
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
logger.info({ commandsPath }, 'コマンドディレクトリをスキャン中');

// --- DB到達性の簡易診断（起動時に一度だけ） ---
try {
  const dsn = process.env.DATABASE_URL;
  if (dsn) {
    const u = new URL(dsn);
    const safe = {
      protocol: u.protocol.replace(':',''),
      host: u.hostname,
      port: u.port || '(default)',
      db: u.pathname.replace('/', ''),
      params: [...u.searchParams.keys()].sort(),
    };
    logger.info({ database: safe }, 'DATABASE_URL を検出しました（パスワードは表示しません）');
  } else {
    logger.warn('DATABASE_URL が設定されていません');
  }
} catch (e) {
  logger.warn({ e }, 'DATABASE_URL の解析に失敗しました');
}

(async () => {
  const ok = await tryConnectPrisma(5000);
  if (!ok) logger.warn('DBへの接続に失敗しました（5秒でタイムアウト）。一部コマンドは機能制限されます。');
})();

function isCommandFilename(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith('.d.ts')) return false;
  if (/(?:^|\.)(?:test|spec)\.(?:ts|js)$/.test(lower)) return false;
  return lower.endsWith('.ts') || lower.endsWith('.js');
}

function listCommandFiles(dir: string): string[] {
  let out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
      out = out.concat(listCommandFiles(full));
    } else if (entry.isFile() && isCommandFilename(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function loadCommandFromFile(filePath: string): Command | null {
  try {
    delete require.cache[filePath as any];
    const imported = require(filePath);
    const cmd: Command = (imported.default ?? imported) as Command;
    if (cmd?.data?.name && typeof cmd.execute === 'function') {
      return cmd;
    }
    logger.warn({ filePath, keys: Object.keys(imported ?? {}) }, 'Invalid command module shape, skipped');
    return null;
  } catch (err) {
    logger.error({ err, filePath }, 'Failed to load command (skipped)');
    return null;
  }
}

let discovered: string[] = [];
try {
  discovered = listCommandFiles(commandsPath);
  logger.info({ count: discovered.length, files: discovered.map(f => path.relative(commandsPath, f)) }, 'Discovered command files');
} catch (e) {
  logger.error({ e, commandsPath }, 'Failed to read commands directory');
}

// Track which file provided which command name
const fileToCommand = new Map<string, string>();
const commandToFile = new Map<string, string>();

for (const filePath of discovered) {
  const cmd = loadCommandFromFile(filePath);
  if (cmd) {
    // If the command name already exists, replace and warn
    const prevFile = commandToFile.get(cmd.data.name);
    if (prevFile && prevFile !== filePath) {
      logger.warn({ command: cmd.data.name, prevFile, newFile: filePath }, 'Duplicate command name detected, replacing');
    }
    client.commands.set(cmd.data.name, cmd);
    fileToCommand.set(filePath, cmd.data.name);
    commandToFile.set(cmd.data.name, filePath);
    logger.info({ command: cmd.data.name, file: path.relative(commandsPath, filePath) }, 'Loaded command');
  }
}

// Hot reload in development: watch command files recursively
const enableWatch = env.NODE_ENV !== 'production';
if (enableWatch) {
  try {
    const watcher = fs.watch(commandsPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const full = path.join(commandsPath, filename);
      if (!isCommandFilename(filename)) return;
      const exists = fs.existsSync(full);
      if (!exists) {
        // Removed or renamed away
        const commandName = fileToCommand.get(full);
        if (commandName) {
          client.commands.delete(commandName);
          commandToFile.delete(commandName);
          fileToCommand.delete(full);
          delete require.cache[full as any];
          logger.info({ file: filename, command: commandName }, 'Command file removed, command unloaded');
        } else {
          logger.info({ file: filename }, 'File removed (no registered command)');
        }
        return;
      }
      // Added or changed
      const reloaded = loadCommandFromFile(full);
      if (reloaded) {
        const prevName = fileToCommand.get(full);
        if (prevName && prevName !== reloaded.data.name) {
          // Name changed: remove old name
          client.commands.delete(prevName);
          commandToFile.delete(prevName);
          logger.warn({ file: filename, old: prevName, new: reloaded.data.name }, 'Command renamed in place, updated');
        }
        // Replace or set
        client.commands.set(reloaded.data.name, reloaded);
        fileToCommand.set(full, reloaded.data.name);
        commandToFile.set(reloaded.data.name, full);
        logger.info({ file: filename, command: reloaded.data.name, eventType }, 'Command (re)loaded');
      }
    });
    process.on('exit', () => watcher.close());
    logger.info('Command hot-reload watcher enabled (development mode)');
  } catch (e) {
    logger.warn({ e }, 'Failed to enable command watcher');
  }
}

client.once(Events.ClientReady, async () => {
  logger.info({ user: client.user?.tag }, 'Ready! Logged in');
  // On startup, compare loaded local commands with remote (guild/global) and log diffs
  try {
    const localNames = new Set<string>(client.commands.keys());

    const diffs: any[] = [];
    const hasChanges = { guild: false, global: false } as any;

    // Guild scope diff
    if (env.COMMANDS_SCOPE === 'guild' || env.COMMANDS_SCOPE === 'both') {
      try {
        const guild = await client.guilds.fetch(env.GUILD_ID);
        const remote = await guild.commands.fetch();
        const remoteNames = new Set<string>([...remote.values()].map((c: any) => c.name));
        const missingOnRemote = [...localNames].filter((n) => !remoteNames.has(n));
        const extraOnRemote = [...remoteNames].filter((n) => !localNames.has(n));
        // Detect modifications (description/options) for intersecting commands
        const changed: string[] = [];
        for (const name of [...localNames].filter((n) => remoteNames.has(n))) {
          const remoteCmd: any = [...remote.values()].find((c: any) => c.name === name);
          const localCmd = client.commands.get(name) as Command | undefined;
          const localJson: any = (localCmd as any)?.data?.toJSON?.() ?? {};
          const descDiff = (remoteCmd?.description ?? '') !== (localJson?.description ?? '');
          const localOpts = JSON.stringify(localJson?.options ?? []);
          const remoteOpts = JSON.stringify((remoteCmd as any)?.options ?? []);
          if (descDiff || localOpts !== remoteOpts) changed.push(name);
        }
        const anyDiff = missingOnRemote.length > 0 || extraOnRemote.length > 0 || changed.length > 0;
        hasChanges.guild = anyDiff;
        diffs.push({ scope: 'guild', guildId: env.GUILD_ID, missingOnRemote, extraOnRemote, changed });
      } catch (e) {
        logger.warn({ e, guildId: env.GUILD_ID }, 'Failed to fetch guild commands for diff');
      }
    }

    // Global scope diff
    if (env.COMMANDS_SCOPE === 'global' || env.COMMANDS_SCOPE === 'both') {
      try {
        const app = client.application;
        if (app) {
          const remote = await app.commands.fetch();
          const remoteNames = new Set<string>([...remote.values()].map((c: any) => c.name));
          const missingOnRemote = [...localNames].filter((n) => !remoteNames.has(n));
          const extraOnRemote = [...remoteNames].filter((n) => !localNames.has(n));
          const changed: string[] = [];
          for (const name of [...localNames].filter((n) => remoteNames.has(n))) {
            const remoteCmd: any = [...remote.values()].find((c: any) => c.name === name);
            const localCmd = client.commands.get(name) as Command | undefined;
            const localJson: any = (localCmd as any)?.data?.toJSON?.() ?? {};
            const descDiff = (remoteCmd?.description ?? '') !== (localJson?.description ?? '');
            const localOpts = JSON.stringify(localJson?.options ?? []);
            const remoteOpts = JSON.stringify((remoteCmd as any)?.options ?? []);
            if (descDiff || localOpts !== remoteOpts) changed.push(name);
          }
          const anyDiff = missingOnRemote.length > 0 || extraOnRemote.length > 0 || changed.length > 0;
          hasChanges.global = anyDiff;
          diffs.push({ scope: 'global', missingOnRemote, extraOnRemote, changed });
        } else {
          logger.warn('Application not available to fetch global commands');
        }
      } catch (e) {
        logger.warn({ e }, 'Failed to fetch global commands for diff');
      }
    }

    for (const d of diffs) {
      const hasAny = (d.missingOnRemote?.length || 0) > 0 || (d.extraOnRemote?.length || 0) > 0 || (d.changed?.length || 0) > 0;
      const msg = d.scope === 'guild' ? `Startup diff (GUILD ${d.guildId})` : 'Startup diff (GLOBAL)';
      if (hasAny) {
        logger.warn({ missingOnRemote: d.missingOnRemote, extraOnRemote: d.extraOnRemote, changed: d.changed }, `${msg}: mismatch detected. Consider running npm run deploy`);
      } else {
        logger.info(msg + ': in sync');
      }
    }

    // Optional: auto-deploy if differences exist and enabled
    if (env.AUTO_DEPLOY_ON_STARTUP) {
      const bodies = Array.from(client.commands.values())
        .map((c: any) => c?.data?.toJSON?.())
        .filter((v: any) => v);
      try {
        if ((env.COMMANDS_SCOPE === 'guild' || env.COMMANDS_SCOPE === 'both') && hasChanges.guild) {
          const guild = await client.guilds.fetch(env.GUILD_ID);
          logger.warn({ count: bodies.length, guildId: env.GUILD_ID }, 'Auto-deploying GUILD commands on startup...');
          const res = await guild.commands.set(bodies as any);
          logger.info({ count: res.size, guildId: env.GUILD_ID }, 'Auto-deploy (guild) done');
        }
        if ((env.COMMANDS_SCOPE === 'global' || env.COMMANDS_SCOPE === 'both') && hasChanges.global) {
          if (!client.application) await client.fetchApplication();
          logger.warn({ count: bodies.length }, 'Auto-deploying GLOBAL commands on startup...');
          const res = await client.application!.commands.set(bodies as any);
          logger.info({ count: res.size }, 'Auto-deploy (global) done (propagation may take time)');
        }
      } catch (e) {
        logger.error({ e }, 'Auto-deploy on startup failed');
      }
    }
  } catch (e) {
    logger.warn({ e }, 'Startup command diff check failed');
  }
});
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
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
