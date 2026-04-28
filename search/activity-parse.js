// Parse FetLife "Active …" / "Just In The Bedroom" strings into a relative
// timestamp (ms since now). Lower = more recent. Returns null if unparseable.

const UNITS = {
  second: 1000, seconds: 1000, sec: 1000,
  minute: 60_000, minutes: 60_000, min: 60_000,
  hour: 3_600_000, hours: 3_600_000, hr: 3_600_000,
  day: 86_400_000, days: 86_400_000,
  week: 604_800_000, weeks: 604_800_000,
  month: 2_592_000_000, months: 2_592_000_000,
  year: 31_536_000_000, years: 31_536_000_000,
};

export function parseActivity(s) {
  if (!s) return null;
  const t = s.trim();
  // "Just In The Bedroom" → very recently online
  if (/just in the bedroom/i.test(t)) return 0;
  if (/online now|active now/i.test(t)) return 0;
  if (/today/i.test(t)) return 0;
  if (/yesterday/i.test(t)) return UNITS.day;
  // "Active 2 days ago" / "Active a few minutes ago"
  const m = t.match(/(\d+|a few|an?)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (m) {
    const n = /^a few$/i.test(m[1]) ? 3 : /^an?$/i.test(m[1]) ? 1 : parseInt(m[1], 10);
    return n * (UNITS[m[2].toLowerCase()] || UNITS[m[2].toLowerCase() + "s"]);
  }
  return null;
}

// Bucket for filter chips: "≤24h" / "≤7d" / "≤30d" / "older".
export function activityBucket(ms) {
  if (ms == null) return "unknown";
  if (ms <= UNITS.day) return "day";
  if (ms <= UNITS.week) return "week";
  if (ms <= UNITS.month) return "month";
  return "older";
}
