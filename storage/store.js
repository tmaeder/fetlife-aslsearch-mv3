// Single source of truth for chrome.storage access.
// Layout:
//   local: seen, blocked, notes, history, cache, telemetry, crawlResume
//   sync:  savedSearches, scheduled, homeLocation, prefs

const L = chrome.storage.local;
const S = chrome.storage.sync;

const get = async (area, key, def) => (await area.get(key))[key] ?? def;
const set = (area, key, val) => area.set({ [key]: val });

export const seen = {
  async list() { return get(L, "seen", {}); },
  async add(nick, meta = {}) {
    const cur = await this.list();
    cur[nick] = { ts: Date.now(), ...meta };
    await set(L, "seen", cur);
  },
  async remove(nick) {
    const cur = await this.list();
    delete cur[nick];
    await set(L, "seen", cur);
  },
  async has(nick) { return !!(await this.list())[nick]; },
};

export const profileWatches = {
  async list() { return get(L, "profileWatches", []); },
  async add(nickname, intervalMin = 60 * 12) {
    const list = await this.list();
    if (list.some(w => w.nickname === nickname)) return;
    list.push({ id: crypto.randomUUID(), nickname, intervalMin, lastRun: 0, snapshot: null });
    await set(L, "profileWatches", list);
  },
  async remove(id) {
    const list = (await this.list()).filter(w => w.id !== id);
    await set(L, "profileWatches", list);
  },
  async update(id, patch) {
    const list = await this.list();
    const i = list.findIndex(w => w.id === id);
    if (i >= 0) { list[i] = { ...list[i], ...patch }; await set(L, "profileWatches", list); }
  },
  async byNickname(nickname) {
    return (await this.list()).find(w => w.nickname === nickname) || null;
  },
};

export const pinned = {
  async list() { return get(L, "pinned", {}); },
  async add(nick) {
    const cur = await this.list();
    cur[nick] = { ts: Date.now() };
    await set(L, "pinned", cur);
  },
  async remove(nick) {
    const cur = await this.list();
    delete cur[nick];
    await set(L, "pinned", cur);
  },
  async has(nick) { return !!(await this.list())[nick]; },
};

export const blocked = {
  async list() { return get(L, "blocked", {}); },
  async add(nick, reason = "") {
    const cur = await this.list();
    cur[nick] = { ts: Date.now(), reason };
    await set(L, "blocked", cur);
  },
  async remove(nick) {
    const cur = await this.list();
    delete cur[nick];
    await set(L, "blocked", cur);
  },
  async has(nick) { return !!(await this.list())[nick]; },
};

export const notes = {
  async all() { return get(L, "notes", {}); },
  async get(nick) { return (await this.all())[nick] || null; },
  async set(nick, text) {
    const cur = await this.all();
    if (!text) delete cur[nick]; else cur[nick] = { text, ts: Date.now() };
    await set(L, "notes", cur);
  },
};

export const history = {
  async list() { return get(L, "history", []); },
  async push(entry) {
    const list = await this.list();
    list.unshift({ id: crypto.randomUUID(), ts: Date.now(), ...entry });
    if (list.length > 200) list.length = 200;
    await set(L, "history", list);
  },
  async clear() { await set(L, "history", []); },
};

export const cache = {
  hash(query, criteria) {
    const norm = JSON.stringify({ q: query, c: criteria || {} });
    let h = 0;
    for (let i = 0; i < norm.length; i++) h = ((h << 5) - h + norm.charCodeAt(i)) | 0;
    return String(h);
  },
  async get(query, criteria) {
    const all = await get(L, "cache", {});
    const key = this.hash(query, criteria);
    const entry = all[key];
    if (!entry) return null;
    const ttl = await get(S, "cacheTtlMs", 24 * 60 * 60 * 1000);
    if (Date.now() - entry.ts > ttl) return null;
    return entry;
  },
  async set(query, criteria, results) {
    const all = await get(L, "cache", {});
    const key = this.hash(query, criteria);
    all[key] = { ts: Date.now(), query, criteria, results };
    await set(L, "cache", all);
  },
  async clear() { await set(L, "cache", {}); },
};

export const savedSearches = {
  async list() { return get(S, "savedSearches", []); },
  async save(name, query, criteria) {
    const list = await this.list();
    list.unshift({ id: crypto.randomUUID(), name, query, criteria, createdAt: Date.now() });
    await set(S, "savedSearches", list);
  },
  async remove(id) {
    const list = (await this.list()).filter(s => s.id !== id);
    await set(S, "savedSearches", list);
  },
};

export const scheduled = {
  async list() { return get(S, "scheduled", []); },
  async save(savedSearchId, intervalMin) {
    const list = await this.list();
    list.push({ id: crypto.randomUUID(), savedSearchId, intervalMin, lastRun: 0, knownNicks: [] });
    await set(S, "scheduled", list);
  },
  async update(id, patch) {
    const list = await this.list();
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) { list[i] = { ...list[i], ...patch }; await set(S, "scheduled", list); }
  },
  async remove(id) {
    const list = (await this.list()).filter(x => x.id !== id);
    await set(S, "scheduled", list);
  },
};

export const prefs = {
  async get() {
    return {
      density: await get(S, "density", "comfort"),
      moreOpen: await get(S, "moreOpen", false),
      paranoidMode: await get(S, "paranoidMode", false),
      cacheTtlMs: await get(S, "cacheTtlMs", 24 * 60 * 60 * 1000),
      patUrl: await get(S, "patUrl", ""),
      homeLocation: await get(S, "homeLocation", null),
      defaultDelay: await get(S, "defaultDelay", 1500),
      defaultMaxPages: await get(S, "defaultMaxPages", 10),
    };
  },
  async set(patch) { await S.set(patch); },
};

export const telemetry = {
  async record(selector, hit) {
    const all = await get(L, "telemetry", {});
    const k = selector;
    if (!all[k]) all[k] = { hits: 0, misses: 0 };
    if (hit) all[k].hits++; else all[k].misses++;
    await set(L, "telemetry", all);
  },
  async report() { return get(L, "telemetry", {}); },
  async reset() { await set(L, "telemetry", {}); },
};

export const crawlResume = {
  async save(state) { await set(L, "crawlResume", state); },
  async load() { return get(L, "crawlResume", null); },
  async clear() { await set(L, "crawlResume", null); },
};
