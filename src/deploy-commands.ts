// src/deploy-commands.ts
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from './env';
import path from 'path';
import fs from 'fs';
import logger from './logger';

const commands: any[] = [];
const commandsDir = path.join(__dirname, 'commands');
logger.info({ commandsDir }, 'Scanning commands directory for deploy');

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

let discovered: string[] = [];
try {
  discovered = listCommandFiles(commandsDir);
  logger.info({ count: discovered.length, files: discovered.map(f => path.relative(commandsDir, f)) }, 'Discovered command files for deploy');
} catch (e) {
  logger.error({ e, commandsDir }, 'Failed to read commands directory for deploy');
}
const targetSet = new Set<string>(env.COMMANDS_TARGET || []);
if (targetSet.size > 0) {
  logger.warn({ targets: Array.from(targetSet) }, 'COMMANDS_TARGET is set; only these commands will be deployed');
}
for (const filePath of discovered) {
  try {
    const imported = require(filePath);
    const c = imported.default ?? imported;
  if (c?.data?.toJSON) {
    const json = c.data.toJSON();
    if (targetSet.size === 0 || (json?.name && targetSet.has(json.name))) {
      commands.push(json);
      logger.info({ command: json?.name ?? c.data?.name, file: path.relative(commandsDir, filePath) }, 'Prepared command for deploy');
      if (json?.default_member_permissions) {
        logger.warn({ command: json?.name, default_member_permissions: json.default_member_permissions }, 'Command has default_member_permissions; may be hidden from users without permission');
      }
      if (json?.dm_permission === false) {
        logger.info({ command: json?.name }, 'Command disabled in DMs (dm_permission=false)');
      }
    } else {
      logger.info({ command: json?.name, file: path.relative(commandsDir, filePath) }, 'Skipped due to COMMANDS_TARGET filter');
    }
  } else {
      logger.warn({ filePath, keys: Object.keys(imported ?? {}) }, 'Skip: no data.toJSON');
    }
  } catch (err) {
    logger.error({ err, filePath }, 'Skip broken command on deploy');
  }
}

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

// Determine scope from env (guild | global). Defaults to guild.
const scope: 'guild' | 'global' | 'both' | 'clear-guild' | 'clear-global' = env.COMMANDS_SCOPE as any;

// Basic diagnostics about deployment parameters
logger.info(
  {
    scope,
    clientId: env.CLIENT_ID,
    guildId: scope.includes('guild') ? env.GUILD_ID : undefined,
    commandsPrepared: commands.map((c) => c?.name || '(unknown)'),
  },
  'Deploy starting with parameters'
);

function normalizeOption(opt: any): any {
  const base: any = {
    type: opt?.type,
    name: opt?.name,
    description: opt?.description ?? '',
    required: !!opt?.required,
  };
  if (Array.isArray(opt?.choices)) {
    base.choices = opt.choices.map((c: any) => ({ name: c?.name, value: c?.value }));
  }
  if (Array.isArray(opt?.options)) {
    base.options = opt.options.map((o: any) => normalizeOption(o));
  }
  return base;
}

function normalizeCommandShape(c: any): any {
  return {
    name: c?.name,
    description: c?.description ?? '',
    options: Array.isArray(c?.options)
      ? c.options.map((o: any) => normalizeOption(o))
      : [],
  };
}

async function preflightDiff(target: 'guild' | 'global') {
  const localMap = new Map<string, any>();
  for (const c of commands) {
    const n = normalizeCommandShape(c);
    if (n?.name) localMap.set(n.name, n);
  }
  if (target === 'global') {
    const remote = (await rest.get(Routes.applicationCommands(env.CLIENT_ID))) as any[];
    const remoteMap = new Map<string, any>();
    for (const r of remote) {
      const n = normalizeCommandShape(r);
      if (n?.name) remoteMap.set(n.name, n);
    }
    const missingOnRemote = [...localMap.keys()].filter((k) => !remoteMap.has(k));
    const extraOnRemote = [...remoteMap.keys()].filter((k) => !localMap.has(k));
    const changed: string[] = [];
    for (const k of [...localMap.keys()].filter((k) => remoteMap.has(k))) {
      if (JSON.stringify(localMap.get(k)) !== JSON.stringify(remoteMap.get(k))) changed.push(k);
    }
    logger.info({ scope: 'global', missingOnRemote, extraOnRemote, changed }, 'Preflight diff (GLOBAL)');
    return { missingOnRemote, extraOnRemote, changed };
  } else {
    const remote = (await rest.get(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID))) as any[];
    const remoteMap = new Map<string, any>();
    for (const r of remote) {
      const n = normalizeCommandShape(r);
      if (n?.name) remoteMap.set(n.name, n);
    }
    const missingOnRemote = [...localMap.keys()].filter((k) => !remoteMap.has(k));
    const extraOnRemote = [...remoteMap.keys()].filter((k) => !localMap.has(k));
    const changed: string[] = [];
    for (const k of [...localMap.keys()].filter((k) => remoteMap.has(k))) {
      if (JSON.stringify(localMap.get(k)) !== JSON.stringify(remoteMap.get(k))) changed.push(k);
    }
    logger.info({ scope: 'guild', guildId: env.GUILD_ID, missingOnRemote, extraOnRemote, changed }, 'Preflight diff (GUILD)');
    return { missingOnRemote, extraOnRemote, changed };
  }
}

async function verifyClientIdMatchesToken() {
  try {
    // For bot tokens, this returns the application that owns the bot
    const app = (await rest.get(Routes.oauth2CurrentApplication())) as any;
    if (app?.id && app.id !== env.CLIENT_ID) {
      logger.warn({ envClientId: env.CLIENT_ID, tokenAppId: app.id }, 'CLIENT_ID does not match the application id from DISCORD_TOKEN');
    } else if (app?.id) {
      logger.info({ applicationId: app.id, name: app.name }, 'Verified token application matches CLIENT_ID');
    }
  } catch (e) {
    logger.warn({ e }, 'Could not verify application id from token');
  }
}

async function verifyGuildMembership() {
  try {
    const g = (await rest.get(Routes.guild(env.GUILD_ID))) as any;
    logger.info({ guildId: env.GUILD_ID, name: g?.name }, 'Verified bot is in target guild');
    return g;
  } catch (e: any) {
    const status = (e as any)?.status ?? (e as any)?.code;
    logger.warn({ e, status, guildId: env.GUILD_ID }, 'Bot may not be in target guild or lacks permission to fetch guild');
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${env.CLIENT_ID}&scope=applications.commands%20bot&guild_id=${env.GUILD_ID}&disable_guild_select=true`;
    logger.warn({ oauthUrl }, 'Install/ensure the bot in the correct guild with required scopes');
  }
}

function bitHasAll(value: bigint, required: bigint): boolean {
  return (value & required) === required;
}

async function diagnoseUserVisibility() {
  if (!env.VISIBILITY_CHECK_USER_ID) return;
  try {
    // Fetch roles and member to compute guild-level effective permissions
    const [roles, member, guild] = await Promise.all([
      rest.get(Routes.guildRoles(env.GUILD_ID)) as Promise<any[]>,
      rest.get(Routes.guildMember(env.GUILD_ID, env.VISIBILITY_CHECK_USER_ID)) as Promise<any>,
      rest.get(Routes.guild(env.GUILD_ID)) as Promise<any>,
    ]);

    const roleMap = new Map<string, any>();
    for (const r of roles) roleMap.set(r.id, r);
    const everyoneRole = roleMap.get(env.GUILD_ID);
    let perms = BigInt(everyoneRole?.permissions ?? '0');
    for (const rid of member.roles ?? []) {
      const r = roleMap.get(rid);
      if (r) perms |= BigInt(r.permissions ?? '0');
    }
    // Owner has all permissions
    const isOwner = guild?.owner_id === member?.user?.id;
    const ADMIN = BigInt(0x00000008);
    const hasAdmin = (perms & ADMIN) === ADMIN;

    logger.info(
      {
        userId: env.VISIBILITY_CHECK_USER_ID,
        guildId: env.GUILD_ID,
        isOwner,
        hasAdmin,
      },
      'Computed guild-level permissions for visibility check'
    );

    for (const c of commands) {
      const reqStr = c?.default_member_permissions as string | undefined;
      if (!reqStr || reqStr === '0') continue;
      const required = BigInt(reqStr);
      const ok = isOwner || hasAdmin || bitHasAll(perms, required);
      if (!ok) {
        logger.warn(
          { command: c.name, requiredBits: reqStr, userId: env.VISIBILITY_CHECK_USER_ID },
          'User likely cannot see this command due to default_member_permissions'
        );
      } else {
        logger.info(
          { command: c.name, requiredBits: reqStr, userId: env.VISIBILITY_CHECK_USER_ID },
          'User satisfies required permissions for this command'
        );
      }
    }
  } catch (e) {
    logger.warn({ e, userId: env.VISIBILITY_CHECK_USER_ID }, 'Failed to perform visibility diagnostics');
  }
}

async function verifyCommandsPostDeploy() {
  try {
    if (scope === 'global') {
      const list = (await rest.get(Routes.applicationCommands(env.CLIENT_ID))) as any[];
      logger.info(
        { count: list.length, names: list.map((c: any) => c.name) },
        'Fetched current GLOBAL commands (propagation may take up to 1 hour)'
      );
    } else if (scope === 'guild') {
      const list = (await rest.get(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID))) as any[];
      logger.info(
        { count: list.length, names: list.map((c: any) => c.name), guildId: env.GUILD_ID },
        'Fetched current GUILD commands after deploy'
      );
      const expected = new Set(commands.map((c) => c.name));
      const present = new Set(list.map((c: any) => c.name));
      const missing = [...expected].filter((n) => !present.has(n));
      if (missing.length) {
        logger.warn({ missing }, 'Some commands are not present right after deploy');
      }
    } else if (scope === 'both') {
      const g = (await rest.get(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID))) as any[];
      const glob = (await rest.get(Routes.applicationCommands(env.CLIENT_ID))) as any[];
      logger.info({ count: g.length, names: g.map((c: any) => c.name), guildId: env.GUILD_ID }, 'Fetched current GUILD commands');
      logger.info({ count: glob.length, names: glob.map((c: any) => c.name) }, 'Fetched current GLOBAL commands (propagation may take up to 1 hour)');
    } else if (scope === 'clear-guild') {
      const g = (await rest.get(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID))) as any[];
      logger.info({ count: g.length, guildId: env.GUILD_ID }, 'After clear: GUILD commands count');
    } else if (scope === 'clear-global') {
      const glob = (await rest.get(Routes.applicationCommands(env.CLIENT_ID))) as any[];
      logger.info({ count: glob.length }, 'After clear: GLOBAL commands count');
    }
  } catch (e) {
    logger.warn({ e, scope }, 'Failed to fetch commands for verification');
  }
}

(async () => {
  try {
    // Always compute preflight diff before applying any changes
    if (scope === 'guild' || scope === 'both') {
      await preflightDiff('guild');
    }
    if (scope === 'global' || scope === 'both') {
      await preflightDiff('global');
    }

    if (env.COMMANDS_DRY_RUN) {
      logger.warn('COMMANDS_DRY_RUN is enabled. No changes will be applied.');
      return;
    }

    if (scope === 'global') {
      logger.info(`Uploading ${commands.length} commands globally...`);
      const result = (await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: commands })) as any[];
      logger.info({ count: result?.length, names: result?.map((c) => c.name) }, 'Global commands upserted');
    } else if (scope === 'guild') {
      logger.info(`Uploading ${commands.length} commands to guild ${env.GUILD_ID}...`);
      const result = (await rest.put(
        Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
        { body: commands }
      )) as any[];
      logger.info({ count: result?.length, names: result?.map((c) => c.name), guildId: env.GUILD_ID }, 'Guild commands upserted');
    } else if (scope === 'both') {
      logger.info(`Uploading ${commands.length} commands to guild ${env.GUILD_ID}...`);
      const gRes = (await rest.put(
        Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
        { body: commands }
      )) as any[];
      logger.info({ count: gRes?.length, names: gRes?.map((c) => c.name), guildId: env.GUILD_ID }, 'Guild commands upserted');
      logger.info(`Uploading ${commands.length} commands globally...`);
      const globRes = (await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: commands })) as any[];
      logger.info({ count: globRes?.length, names: globRes?.map((c) => c.name) }, 'Global commands upserted');
    } else if (scope === 'clear-guild') {
      logger.warn({ guildId: env.GUILD_ID }, 'Clearing ALL guild commands...');
      const res = (await rest.put(
        Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID),
        { body: [] }
      )) as any[];
      logger.info({ count: res?.length ?? 0, guildId: env.GUILD_ID }, 'Guild commands cleared');
    } else if (scope === 'clear-global') {
      logger.warn('Clearing ALL global commands...');
      const res = (await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: [] })) as any[];
      logger.info({ count: res?.length ?? 0 }, 'Global commands cleared');
    }
    await verifyClientIdMatchesToken();
    if (scope === 'guild' || scope === 'both') {
      await verifyGuildMembership();
      await diagnoseUserVisibility();
    }
    await verifyCommandsPostDeploy();
    if (scope === 'global' || scope === 'both') {
      logger.info('Note: Global commands can take up to 1 hour to appear.');
    }
    if (scope === 'guild' || scope === 'both') {
      logger.info('Guild commands should appear almost immediately. If not, check bot permissions and guild selection.');
    }
  } catch (err) {
    logger.error({ err, scope }, 'Deploy failed');
  }
})();
