import { SlashCommandBuilder, ChatInputCommandInteraction, Attachment, AutocompleteInteraction, AttachmentBuilder } from 'discord.js';
import getPrisma from '../prisma';
import { ensureUser } from '../lib/user';
import logger from '../logger';
import sharp from 'sharp';
import { requireGuildId } from '../lib/context';

const COLORS = { 1: '#2ECC71', 2: '#F1C40F', 3: '#E74C3C' } as const; // 緑・黄・赤
function percentToPixel(v: number, total: number) { return Math.round((v / 100) * total); }
function circleSvg(diameter: number, color: string, opacity = 0.7) {
  const r = Math.max(1, Math.round(diameter / 2));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${r * 2}' height='${r * 2}'>
    <circle cx='${r}' cy='${r}' r='${r}' fill='${color}' fill-opacity='${opacity}' />
  </svg>`;
  return Buffer.from(svg);
}

async function getActiveMap(prisma: any, guildId: string) {
  return prisma.congestionMap.findFirst({ where: { guildId, isActive: true }, include: { locations: true } });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('congestion')
    .setDescription('混雑マップをセットアップ＆運用する')
    .addSubcommand(sc => sc
      .setName('setup')
      .setDescription('地図を登録（既存は非アクティブ化）')
      .addStringOption(o => o.setName('name').setDescription('地図名').setRequired(true))
      .addAttachmentOption(o => o.setName('image').setDescription('地図画像（PNG/JPG）').setRequired(true))
    )
    .addSubcommand(sc => sc
      .setName('add-location')
      .setDescription('地点を追加（%座標）')
      .addStringOption(o => o.setName('name').setDescription('地点名').setRequired(true))
      .addNumberOption(o => o.setName('x').setDescription('X座標（%）').setRequired(true))
      .addNumberOption(o => o.setName('y').setDescription('Y座標（%）').setRequired(true))
      .addIntegerOption(o => o.setName('max').setDescription('最大人数（任意）').setMinValue(1))
    )
    .addSubcommand(sc => sc
      .setName('set-capacity')
      .setDescription('地点の最大人数を変更')
      .addStringOption(o => o.setName('name').setDescription('地点名').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('max').setDescription('最大人数（1以上）').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sc => sc
      .setName('report')
      .setDescription('地点の混雑を報告（色）')
      .addStringOption(o => o.setName('location').setDescription('地点名').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('color').setDescription('色').setRequired(true)
        .addChoices({ name: '🟢 緑', value: 1 }, { name: '🟡 黄', value: 2 }, { name: '🔴 赤', value: 3 }))
    )
    .addSubcommand(sc => sc
      .setName('clear')
      .setDescription('混雑レポートをリセット')
      .addStringOption(o => o.setName('location').setDescription('地点名（未指定で全消し）').setAutocomplete(true))
    )
    .addSubcommand(sc => sc
      .setName('view')
      .setDescription('現在の混雑マップを表示')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild()) return;
    const prisma = getPrisma();
    const p: any = prisma;
    const gid = requireGuildId(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'setup') {
        const name = interaction.options.getString('name', true);
        const image = interaction.options.getAttachment('image', true) as Attachment;
        if (!image.contentType?.startsWith('image/')) {
          await interaction.reply({ content: '画像ファイルを指定してください。', ephemeral: true });
          return;
        }
        await interaction.deferReply({ ephemeral: true });
        await p.congestionMap.updateMany({ where: { guildId: gid, isActive: true }, data: { isActive: false } });
        const sent = await interaction.channel!.send({ content: `🗺️ 地図「${name}」`, files: [image.url] });
        const res = await fetch(image.url); const buf = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buf).metadata();
        await p.congestionMap.create({ data: {
          guildId: gid, name, imageMessageId: sent.id, imageUrl: image.url,
          width: meta.width ?? null, height: meta.height ?? null, isActive: true,
        }});
        await interaction.editReply({ content: `地図「${name}」を登録し、アクティブ化しました。` });
        return;
      }

      if (sub === 'add-location') {
        const name = interaction.options.getString('name', true);
        const x = interaction.options.getNumber('x', true);
        const y = interaction.options.getNumber('y', true);
        const max = interaction.options.getInteger('max') ?? null;
        const cmap = await getActiveMap(p, gid);
        if (!cmap) { await interaction.reply({ content: 'アクティブな地図がありません。まず /congestion setup を実行してください。', ephemeral: true }); return; }
        if (x < 0 || x > 100 || y < 0 || y > 100) { await interaction.reply({ content: '座標は 0〜100（%）で指定してください。', ephemeral: true }); return; }
        await p.congestionLocation.create({ data: { mapId: cmap.id, name, xPercent: x, yPercent: y, maxCapacity: max } });
        await interaction.reply({ content: `地点「${name}」(x:${x}%, y:${y}%) を追加しました。${max ? `最大人数: ${max}` : ''}`, ephemeral: true });
        return;
      }

      if (sub === 'set-capacity') {
        const name = interaction.options.getString('name', true);
        const max = interaction.options.getInteger('max', true);
        const cmap = await getActiveMap(p, gid);
        if (!cmap) { await interaction.reply({ content: 'アクティブな地図がありません。', ephemeral: true }); return; }
        await p.congestionLocation.update({ where: { mapId_name: { mapId: cmap.id, name } }, data: { maxCapacity: max } });
        await interaction.reply({ content: `地点「${name}」の最大人数を ${max} に設定しました。`, ephemeral: true });
        return;
      }

      if (sub === 'remove-location') {
        const name = interaction.options.getString('name', true);
        const cmap = await getActiveMap(p, gid);
        if (!cmap) { await interaction.reply({ content: 'アクティブな地図がありません。', ephemeral: true }); return; }
        await p.congestionLocation.delete({ where: { mapId_name: { mapId: cmap.id, name } } });
        await interaction.reply({ content: `地点「${name}」を削除しました。`, ephemeral: true });
        return;
      }

      if (sub === 'report') {
        const location = interaction.options.getString('location', true);
        const color = interaction.options.getInteger('color', true) as 1|2|3;
        await ensureUser(prisma as any, interaction.user.id, interaction.user.tag);
        const cmap = await getActiveMap(p, gid);
        const loc = (cmap?.locations || []).find((l: any) => l.name === location);
        // 既にそのユーザーが選択済みなら色の更新（重複カウントしない）
        const existing = await p.congestionReport.findFirst({
          where: { guildId: gid, location, reporterId: interaction.user.id },
          orderBy: { createdAt: 'desc' },
        });
        if (!existing) {
          if (loc?.maxCapacity) {
            const distinctUsers = await p.congestionReport.findMany({ where: { guildId: gid, location }, select: { reporterId: true } });
            const unique = new Set(distinctUsers.map((r: any) => r.reporterId));
            if (unique.size >= loc.maxCapacity) {
              await interaction.reply({ content: `地点「${location}」は満員です（上限 ${loc.maxCapacity} 人）。`, ephemeral: true });
              return;
            }
          }
          await p.congestionReport.create({ data: { guildId: gid, location, level: color, weight: 1, reporterId: interaction.user.id } });
        } else {
          await p.congestionReport.update({ where: { id: existing.id }, data: { level: color } });
        }
        await interaction.reply({ content: `「${location}」の選択を ${color === 1 ? '緑' : color === 2 ? '黄' : '赤'} に設定しました。`, ephemeral: true });
        return;
      }

      if (sub === 'clear') {
        const target = interaction.options.getString('location');
        if (target) {
          await p.congestionReport.deleteMany({ where: { guildId: gid, location: target } });
          await interaction.reply({ content: `地点「${target}」の記録をリセットしました。`, ephemeral: true });
        } else {
          await p.congestionReport.deleteMany({ where: { guildId: gid } });
          await interaction.reply({ content: '全地点の記録をリセットしました。', ephemeral: true });
        }
        return;
      }

      if (sub === 'view') {
        await interaction.deferReply();
        const cmap = await getActiveMap(p, gid);
        if (!cmap) { await interaction.editReply({ content: 'アクティブな地図がありません。まず /congestion setup を実行してください。' }); return; }
        const res = await fetch(cmap.imageUrl); const baseBuf = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(baseBuf).metadata();
        const width = cmap.width ?? meta.width ?? 0; const height = cmap.height ?? meta.height ?? 0;

        // ユーザーごとに最新の選択のみをカウント
        const reports = await p.congestionReport.findMany({ where: { guildId: gid }, orderBy: { createdAt: 'desc' } });
        const latestPerUser = new Map<string, Map<string, number>>(); // location -> (userId -> color)
        for (const r of reports) {
          const locMap = latestPerUser.get(r.location) || new Map<string, number>();
          if (!locMap.has(r.reporterId)) locMap.set(r.reporterId, r.level as number);
          latestPerUser.set(r.location, locMap);
        }
        const agg = new Map<string, Map<number, number>>();
        for (const [locName, m] of latestPerUser.entries()) {
          const colorCount = new Map<number, number>();
          for (const color of m.values()) colorCount.set(color, (colorCount.get(color) ?? 0) + 1);
          agg.set(locName, colorCount);
        }

        const overlays: sharp.OverlayOptions[] = [];
        for (const loc of (cmap.locations ?? [])) {
          const m = agg.get(loc.name);
          if (!m) continue;
          let domColor = 1; let maxW = -1; let total = 0;
          for (const [c, w] of m.entries()) { total += w; if (w > maxW) { maxW = w; domColor = c as any; } }
          if (total <= 0) continue;
          const cap = loc.maxCapacity ?? Math.max(10, total); // 未設定時は最低10を基準
          const ratio = Math.min(1, total / cap);
          const base = 12, maxR = 60, gamma = 1.5; // 増加率の調整
          const radius = Math.round(base + (maxR - base) * Math.pow(ratio, gamma));
          const svg = circleSvg(radius * 2, COLORS[domColor as 1|2|3] || COLORS[1]);
          const top = percentToPixel(loc.yPercent, height) - radius;
          const left = percentToPixel(loc.xPercent, width) - radius;
          overlays.push({ input: svg, top, left });
        }
        const out = await sharp(baseBuf).composite(overlays).png().toBuffer();
        const attachment = new AttachmentBuilder(out, { name: 'congestion-map.png' });
        await interaction.editReply({ files: [attachment] });
        return;
      }
    } catch (error: any) {
      logger.error({ err: error, sub, user: interaction.user.id }, 'Congestion command failed');
      const content = '混雑マップ処理中にエラーが発生しました。設定や画像URL、地点登録を確認してください。';
      const payload = { content, ephemeral: true } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload as any);
      else await interaction.reply(payload as any);
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    try {
      const prisma = getPrisma();
      const p: any = prisma;
      const gid = requireGuildId(interaction.guildId);
      const cmap = await p.congestionMap.findFirst({ where: { guildId: gid, isActive: true }, include: { locations: true } });
      const q = (interaction.options.getFocused() as string) ?? '';
      const names = (cmap?.locations ?? []).map((l: any) => l.name).filter((n: string) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 25);
      await interaction.respond(names.map((n: string) => ({ name: n, value: n })));
    } catch {
      await interaction.respond([]);
    }
  }
};

