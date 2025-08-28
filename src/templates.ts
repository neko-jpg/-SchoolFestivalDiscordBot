import { ServerTemplate } from './schemas/templateSchema';

type Grades = 3 | 4;

type TemplateRole = NonNullable<ServerTemplate['roles']>[number];

function gradeRoles(grades: Grades): ServerTemplate['roles'] {
  const list: TemplateRole[] = [
    { name: 'AdminOps', color: '#3498DB', hoist: true, mentionable: true },
  ];
  for (let i = 1; i <= grades; i++) list.push({ name: `Grade-${i}` } as TemplateRole);
  return list;
}

function announcementOverwrites(): any[] {
  return [
    { role: '@everyone', deny: ['SendMessages'], allow: ['ViewChannel', 'ReadMessageHistory'] },
    { role: 'AdminOps', allow: ['SendMessages'] },
  ];
}

function privateOpsOverwrites(): any[] {
  return [
    { role: '@everyone', deny: ['ViewChannel'] },
    { role: 'AdminOps', allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
  ];
}

export function bunkasaiTemplate(grades: Grades): ServerTemplate {
  return {
    version: '1',
    name: '文化祭',
    roles: gradeRoles(grades),
    categories: [
      {
        name: 'role-setup',
        channels: [
          { name: 'welcome', type: 'text', topic: 'read me first' },
          { name: 'rules', type: 'text', topic: 'server rules (read-only)', overwrites: announcementOverwrites() as any },
          { name: 'select-grade', type: 'text', topic: 'select your grade (/role)' },
          { name: 'select-notify', type: 'text', topic: 'select notification roles' },
        ],
      },
      {
        name: 'announcements',
        channels: [
          { name: 'news', type: 'text', topic: 'announcements (read-only)', overwrites: announcementOverwrites() as any },
          { name: 'day-schedule', type: 'text', topic: 'event schedule' },
          { name: 'emergency', type: 'text', topic: 'emergency (ops only)', overwrites: privateOpsOverwrites() as any },
        ],
      },
      {
        name: 'guide',
        channels: [
          { name: 'map', type: 'text', topic: 'venue map & flow' },
          { name: 'faq', type: 'text', topic: 'frequently asked questions' },
          { name: 'tickets', type: 'text', topic: 'admission / tickets' },
        ],
      },
      {
        name: 'stage',
        channels: [
          { name: 'running-order', type: 'text', topic: 'running order & rehearsal' },
          { name: 'stage-voice', type: 'voice', topic: 'stage control' },
        ],
      },
      {
        name: 'booths',
        channels: [
          { name: 'booth-list', type: 'text', topic: 'booth list & placement' },
          { name: 'booth-ops', type: 'text', topic: 'common ops (supplies/inventory/tools)' },
          { name: 'booth-1', type: 'text', topic: 'rename later' },
          { name: 'booth-2', type: 'text' },
          { name: 'booth-3', type: 'text' },
        ],
      },
      {
        name: 'ops-private',
        channels: [
          { name: 'accounting', type: 'text', topic: 'sales & receipts & settlement', overwrites: privateOpsOverwrites() as any },
          { name: 'inventory', type: 'text', topic: 'inventory & refill', overwrites: privateOpsOverwrites() as any },
          { name: 'minutes', type: 'text', topic: 'meeting minutes', overwrites: privateOpsOverwrites() as any },
        ],
      },
      {
        name: 'safety-lostfound',
        channels: [
          { name: 'safety', type: 'text', topic: 'safety/traffic control/security' },
          { name: 'lost-found', type: 'text', topic: 'lost and found' },
        ],
      },
      {
        name: 'media',
        channels: [
          { name: 'photo-drop', type: 'text', topic: 'photo sharing (images only recommended)' },
          { name: 'press', type: 'text', topic: 'public relations & SNS' },
        ],
      },
      {
        name: 'lounge',
        channels: [
          { name: 'general', type: 'text', topic: 'visitors & students chat' },
          { name: 'voice-1', type: 'voice' },
          { name: 'voice-2', type: 'voice' },
        ],
      },
      {
        name: 'grades',
        channels: [...Array.from({ length: grades }, (_, i) => ({ name: `grade-${i + 1}`, type: 'text' as const }))],
      },
    ],
  };
}

export function taiikusaiTemplate(grades: Grades): ServerTemplate {
  return {
    version: '1',
    name: '体育祭',
    roles: gradeRoles(grades),
    categories: [
      { name: 'role-setup', channels: [ { name: 'welcome', type: 'text' }, { name: 'rules', type: 'text', overwrites: announcementOverwrites() as any }, { name: 'select-grade', type: 'text' } ] },
      { name: 'announcements', channels: [ { name: 'announcements', type: 'text', overwrites: announcementOverwrites() as any }, { name: 'weather', type: 'text' }, { name: 'emergency', type: 'text', overwrites: privateOpsOverwrites() as any } ] },
      { name: 'events-guide', channels: [ { name: 'rules', type: 'text' }, { name: 'schedule', type: 'text' }, { name: 'marshaling', type: 'text' } ] },
      { name: 'disciplines', channels: [ { name: 'track', type: 'text' }, { name: 'field', type: 'text' }, { name: 'relay', type: 'text' }, { name: 'cheering', type: 'text' } ] },
      { name: 'results', channels: [ { name: 'heats', type: 'text' }, { name: 'results', type: 'text' }, { name: 'ranking', type: 'text' } ] },
      { name: 'ops-private', channels: [ { name: 'referees', type: 'text', overwrites: privateOpsOverwrites() as any }, { name: 'timekeepers', type: 'text', overwrites: privateOpsOverwrites() as any } ] },
      { name: 'grades', channels: [...Array.from({ length: grades }, (_, i) => ({ name: `grade-${i + 1}`, type: 'text' as const }))] },
      { name: 'lounge', channels: [ { name: 'general', type: 'text' }, { name: 'voice', type: 'voice' } ] },
    ],
  };
}

export function kyugiTemplate(grades: Grades): ServerTemplate {
  return {
    version: '1',
    name: '球技大会',
    roles: gradeRoles(grades),
    categories: [
      { name: 'role-setup', channels: [ { name: 'welcome', type: 'text' }, { name: 'rules', type: 'text', overwrites: announcementOverwrites() as any } ] },
      { name: 'announcements', channels: [ { name: 'announcements', type: 'text', overwrites: announcementOverwrites() as any }, { name: 'schedule', type: 'text' }, { name: 'rules', type: 'text' } ] },
      { name: 'tournament', channels: [ { name: 'brackets', type: 'text', topic: 'tournament bracket' }, { name: 'results', type: 'text', topic: 'results' } ] },
      { name: 'sports', channels: [ { name: 'soccer', type: 'text' }, { name: 'basketball', type: 'text' }, { name: 'volleyball', type: 'text' }, { name: 'tennis', type: 'text' } ] },
      { name: 'ops-private', channels: [ { name: 'officials', type: 'text', topic: 'officials communication', overwrites: privateOpsOverwrites() as any }, { name: 'medical', type: 'text', topic: 'first aid', overwrites: privateOpsOverwrites() as any } ] },
      { name: 'lounge', channels: [ { name: 'general', type: 'text' }, { name: 'voice-a', type: 'voice' }, { name: 'voice-b', type: 'voice' } ] },
    ],
  };
}

export function getTemplateByName(name: string, grades: Grades): ServerTemplate | null {
  switch (name) {
    case 'bunkasai':
      return bunkasaiTemplate(grades);
    case 'taiikusai':
      return taiikusaiTemplate(grades);
    case 'kyugi':
      return kyugiTemplate(grades);
    default:
      return null;
  }
}

