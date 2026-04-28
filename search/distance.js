// Geocode location strings via OpenStreetMap Nominatim, cache aggressively,
// throttle to 1 req/sec per Nominatim policy.

const CACHE_KEY = "geoCache";
const FAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SUCCESS_TTL_MS = 365 * 24 * 60 * 60 * 1000;
let lastReqTs = 0;

async function getCache() {
  return (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] || {};
}
async function setCache(c) {
  await chrome.storage.local.set({ [CACHE_KEY]: c });
}

export async function geocode(query) {
  if (!query) return null;
  const key = query.trim().toLowerCase();
  const cache = await getCache();
  const hit = cache[key];
  const now = Date.now();
  if (hit) {
    const ttl = hit.ok ? SUCCESS_TTL_MS : FAIL_TTL_MS;
    if (now - hit.ts < ttl) return hit.ok ? { lat: hit.lat, lng: hit.lng, label: hit.label } : null;
  }

  const wait = Math.max(0, 1100 - (Date.now() - lastReqTs));
  if (wait) await new Promise(r => setTimeout(r, wait));
  lastReqTs = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const arr = await res.json();
    if (!arr.length) {
      cache[key] = { ts: now, ok: false };
      await setCache(cache);
      return null;
    }
    const top = arr[0];
    const out = { lat: parseFloat(top.lat), lng: parseFloat(top.lon), label: top.display_name };
    cache[key] = { ts: now, ok: true, ...out };
    await setCache(cache);
    return out;
  } catch (e) {
    return null;
  }
}

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function toRad(d) { return d * Math.PI / 180; }
