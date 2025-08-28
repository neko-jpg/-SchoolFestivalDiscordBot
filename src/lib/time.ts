// Parse a human-entered time range like "09:00-12:30" into Date objects.
// Accepts input variations (full-width digits, full-width colon/dash, extra spaces, single-hour forms like "9-12").
export function parseTimeRange(range: string, tz = 'Asia/Tokyo'): { start: Date; end: Date } {
  if (!range || typeof range !== 'string') {
    throw new Error('時間は 09:00-12:00 の形式で指定してください。');
  }

  const toHalf = (s: string) => s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30));
  const normalize = (s: string) => toHalf(s)
    .replace(/[：﹕꞉︓]/g, ':')
    .replace(/[‐‑–—−ー～〜－]/g, '-')
    .replace(/[\s　]+/g, '')
    .trim();

  const norm = normalize(range);
  const m = norm.match(/^(\d{1,2})(?::(\d{1,2}))?-(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) {
    throw new Error('時間は 09:00-12:00 の形式で指定してください。');
  }
  const h1 = parseInt(m[1], 10), m1 = m[2] ? parseInt(m[2], 10) : 0;
  const h2 = parseInt(m[3], 10), m2 = m[4] ? parseInt(m[4], 10) : 0;
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) {
    throw new Error('時間の値が不正です（時は0-23、分は0-59）。');
  }

  const base = process.env.FESTIVAL_START_DATE ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const mk = (hh: number, mm: number) => {
    const d = new Date(`${base}T00:00:00`);
    d.setHours(hh, mm ?? 0, 0, 0);
    return d;
  };
  const start = mk(h1, m1);
  const end = mk(h2, m2);
  if (end.getTime() <= start.getTime()) {
    throw new Error('終了時刻は開始時刻より後にしてください。');
  }
  return { start, end };
}

