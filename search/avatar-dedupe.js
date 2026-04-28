// Detect duplicate avatars across results. Uses the FetLife CDN attachment ID
// embedded in avatar URLs as a fast exact match — same upload = same ID.
//
// Examples:
//   /picture/attachments/154886844/u1000.jpg → key "att:154886844"
//   /1289884/00063416-d17d.../c160.jpg       → key "alb:1289884:00063416-d17d-..."
//
// Returns a Map<string, Array<nickname>> for buckets with >1 entry.

export function avatarKey(url) {
  if (!url) return null;
  const m1 = url.match(/\/picture\/attachments\/(\d+)\//);
  if (m1) return "att:" + m1[1];
  const m2 = url.match(/\/(\d+)\/([0-9a-f-]{8,})\/[a-z]\d+\.jpg/);
  if (m2) return "alb:" + m2[1] + ":" + m2[2];
  // Fallback: full path without query
  const m3 = url.match(/\/[^/]+\.(jpg|png|webp)/);
  return m3 ? "url:" + m3[0] : null;
}

export function findDuplicateAvatars(results) {
  const buckets = new Map();
  for (const r of results) {
    const k = avatarKey(r.avatarUrl);
    if (!k) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r.nickname);
  }
  const dups = new Map();
  for (const [k, nicks] of buckets) {
    if (nicks.length >= 2) dups.set(k, nicks);
  }
  return dups;
}

// Returns a map nickname → other-nicknames-with-same-avatar
export function dedupeMap(results) {
  const dups = findDuplicateAvatars(results);
  const out = new Map();
  for (const nicks of dups.values()) {
    for (const n of nicks) {
      out.set(n, nicks.filter(o => o !== n));
    }
  }
  return out;
}
