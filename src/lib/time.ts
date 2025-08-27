// "09:00-12:30" を Date に。日付は FESTIVAL_START_DATE or 今日
export function parseTimeRange(range: string, tz = "Asia/Tokyo"): { start: Date; end: Date } {
  const [s, e] = range.split("-").map(x => x.trim());
  if (!s || !e) throw new Error("時間は 09:00-12:00 の形式で指定してください。");
  const base = process.env.FESTIVAL_START_DATE ?? new Date().toISOString().slice(0, 10);
  // base は YYYY-MM-DD（ローカル日付扱い）
  const toISO = (hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    const d = new Date(`${base}T00:00:00`);
    d.setHours(h, m ?? 0, 0, 0);
    return d;
  };
  return { start: toISO(s), end: toISO(e) };
}
