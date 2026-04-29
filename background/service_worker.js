// MV3 service worker.
// Responsibilities:
//   - PAT-FetLife dataset refresh + lookup
//   - Watchers: scheduled background searches that notify on new matches
//   - Context menu "Search similar"
//   - Auto-clear cache on schedule (paranoid mode)

import { savedSearches, scheduled, prefs, cache, profileWatches, notes } from "../storage/store.js";
import { vault } from "../storage/vault.js";
import { parseProfile } from "../search/profile-fetch.js";
import { parseSearchPage } from "../search/parser.js";
import { urlForPage } from "../search/crawler.js";
import { buildPredicate } from "../search/filters.js";

const PAT_ALARM = "pat-refresh";
const WATCH_ALARM = "watcher-tick";
const CACHE_ALARM = "cache-cleanup";
const STORAGE_PAT_DATA = "patData";
const STORAGE_PAT_FETCHED = "patFetchedAt";

// Run on every SW startup (cold or warm) so the side-panel-on-action-click
// behavior is reliably set even when chrome.runtime.onInstalled doesn't fire
// (e.g. SW evicted and revived between events). Also done in onInstalled
// for first-install registration of alarms + context menu.
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(PAT_ALARM, { periodInMinutes: 60 * 24 });
  chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 5 });
  chrome.alarms.create(CACHE_ALARM, { periodInMinutes: 60 });
  try {
    chrome.contextMenus.create({
      id: "search-similar",
      title: "FetLife: search similar",
      contexts: ["link", "page"],
      documentUrlPatterns: ["https://fetlife.com/*"],
      targetUrlPatterns: ["https://fetlife.com/*"],
    });
  } catch {}
  refreshPat().catch(() => {});
});

// Fallback if openPanelOnActionClick failed: open the panel from this gesture.
chrome.action.onClicked.addListener(async (tab) => {
  try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch {}
});

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === PAT_ALARM) refreshPat();
  if (a.name === WATCH_ALARM) tickWatchers();
  if (a.name === CACHE_ALARM) maybeClearCache();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "search-similar") return;
  const url = info.linkUrl || info.pageUrl;
  let nick = null;
  try {
    const u = new URL(url);
    if (u.hostname === "fetlife.com") {
      const m = u.pathname.match(/^\/([A-Za-z0-9_.\-]+)\/?$/);
      if (m) nick = m[1];
    }
  } catch {}
  if (nick) await chrome.storage.session?.set?.({ pendingNick: nick }).catch(() => {});
  if (nick) await chrome.storage.local.set({ pendingNick: nick });
  try { await chrome.sidePanel.open({ windowId: tab.windowId }); }
  catch { chrome.tabs.create({ url: chrome.runtime.getURL("search/search-page.html") + (nick ? `?nick=${encodeURIComponent(nick)}` : "") }); }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "pat:check") {
    chrome.storage.local.get(STORAGE_PAT_DATA).then(({ [STORAGE_PAT_DATA]: index = {} }) => {
      sendResponse({ match: index[String(msg.userId)] || null });
    });
    return true;
  }
  if (msg?.type === "pat:refresh") {
    refreshPat().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === "watch:add") {
    scheduled.save(msg.savedSearchId, Math.max(15, msg.intervalMin)).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "watch:remove") {
    scheduled.remove(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "watch:list") {
    Promise.all([scheduled.list(), savedSearches.list()]).then(([list, saved]) => {
      const byId = Object.fromEntries(saved.map(s => [s.id, s]));
      sendResponse({ list: list.map(w => ({ ...w, savedName: byId[w.savedSearchId]?.name })) });
    });
    return true;
  }
  if (msg?.type === "profileWatch:add") {
    profileWatches.add(msg.nickname, msg.intervalMin || 12 * 60).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "profileWatch:remove") {
    profileWatches.remove(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "profileWatch:list") {
    profileWatches.list().then(list => sendResponse({ list }));
    return true;
  }
  if (msg?.type === "profileWatch:has") {
    profileWatches.byNickname(msg.nickname).then(w => sendResponse({ watching: !!w, id: w?.id }));
    return true;
  }
  if (msg?.type === "fl:fetch") {
    if (!isFetlifeUrl(msg.url)) { sendResponse({ ok: false, error: "url not on fetlife.com" }); return false; }
    flFetch(msg.url, msg.method || "GET").then(r => sendResponse({ ok: true, ...r }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === "ui:open") {
    (async () => {
      const win = await chrome.windows.getCurrent();
      try { await chrome.sidePanel.open({ windowId: win.id }); sendResponse({ ok: true }); }
      catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
  if (msg?.type === "profile:open") {
    if (!isFetlifeUrl(msg.url)) { sendResponse({ ok: false, error: "url not on fetlife.com" }); return false; }
    openProfile(msg.url, msg.newTab).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === "notes:get") {
    notes.get(msg.nickname).then(note => sendResponse({ note }))
      .catch(() => sendResponse({ note: null }));
    return true;
  }
  if (msg?.type === "vault:status") {
    Promise.all([vault.isEnabled(), vault.isUnlocked()])
      .then(([enabled, unlocked]) => sendResponse({ enabled, unlocked }));
    return true;
  }
  if (msg?.type === "vault:enable") {
    vault.enable(msg.passphrase).then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === "vault:unlock") {
    vault.unlock(msg.passphrase).then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === "vault:lock") {
    vault.lock().then(() => sendResponse({ ok: true }));
    return true;
  }
});

function isFetlifeUrl(u) {
  if (typeof u !== "string") return false;
  try { return new URL(u).hostname === "fetlife.com"; } catch { return false; }
}

// Single managed "preview" tab for profile clicks. Reused on each click.
let previewTabId = null;
async function openProfile(url, forceNewTab) {
  if (forceNewTab) { await chrome.tabs.create({ url, active: true }); return; }
  if (previewTabId) {
    try {
      const t = await chrome.tabs.get(previewTabId);
      if (t) { await chrome.tabs.update(previewTabId, { url, active: true }); await chrome.windows.update(t.windowId, { focused: true }); return; }
    } catch { previewTabId = null; }
  }
  const tab = await chrome.tabs.create({ url, active: true });
  previewTabId = tab.id;
  chrome.tabs.onRemoved.addListener(function listener(id) {
    if (id === previewTabId) { previewTabId = null; chrome.tabs.onRemoved.removeListener(listener); }
  });
}

// Fetch a fetlife.com URL via chrome.scripting.executeScript inside an open
// fetlife.com tab. Same-origin fetch attaches the user's session cookie
// (SameSite=Lax) without the bandwidth cost of rendering the page. The SSR
// HTML embeds list data as JSON in a `data-component` attribute, so we just
// fetch and parse the string.

let scrapeTabId = null;

async function ensureFetlifeTab() {
  if (scrapeTabId) {
    try { const t = await chrome.tabs.get(scrapeTabId); if (t?.url?.startsWith("https://fetlife.com/")) return scrapeTabId; } catch {}
  }
  scrapeTabId = null;
  const tabs = await chrome.tabs.query({ url: "https://fetlife.com/*" });
  if (tabs.length) { scrapeTabId = tabs[0].id; return scrapeTabId; }
  const t = await chrome.tabs.create({ url: "https://fetlife.com/home", active: false });
  scrapeTabId = t.id;
  await new Promise(resolve => {
    const listener = (id, info) => {
      if (id === t.id && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  return t.id;
}

async function flFetch(url, method = "GET") {
  const tabId = await ensureFetlifeTab();
  const [execRes] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (u, m) => {
      try {
        const r = await fetch(u, { credentials: "include", method: m, redirect: "manual" });
        const headers = {};
        r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return { status: r.status, html: m === "HEAD" ? "" : await r.text(), headers };
      } catch (e) { return { status: 0, html: "", error: e.message }; }
    },
    args: [url, method],
    world: "MAIN",
  });
  return execRes?.result || { status: 0, html: "" };
}

async function refreshPat() {
  const { patUrl = "" } = await chrome.storage.sync.get("patUrl");
  if (!patUrl) {
    await chrome.storage.local.set({ [STORAGE_PAT_DATA]: {}, [STORAGE_PAT_FETCHED]: Date.now() });
    return;
  }
  try {
    const res = await fetch(patUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const index = {};
    if (Array.isArray(data)) {
      for (const row of data) if (row?.userId != null) index[String(row.userId)] = { reason: row.reason || "", url: row.url || "" };
    }
    await chrome.storage.local.set({ [STORAGE_PAT_DATA]: index, [STORAGE_PAT_FETCHED]: Date.now() });
  } catch (e) { console.warn("PAT fetch:", e); }
}

async function maybeClearCache() {
  const p = await prefs.get();
  if (!p.paranoidMode) return;
  const all = (await chrome.storage.local.get("cache")).cache || {};
  const now = Date.now();
  const cutoff = now - p.cacheTtlMs;
  for (const [k, v] of Object.entries(all)) if ((v.ts || 0) < cutoff) delete all[k];
  await chrome.storage.local.set({ cache: all });
}

async function tickWatchers() {
  // Independent — run in parallel.
  await Promise.allSettled([tickSavedSearchWatchers(), tickProfileWatchers()]);
}

async function tickSavedSearchWatchers() {
  const list = await scheduled.list();
  if (!list.length) return;
  const saved = await savedSearches.list();
  const byId = Object.fromEntries(saved.map(s => [s.id, s]));
  const now = Date.now();
  for (const w of list) {
    const due = !w.lastRun || (now - w.lastRun) >= w.intervalMin * 60 * 1000;
    if (!due) continue;
    const s = byId[w.savedSearchId];
    if (!s) continue;
    try {
      const news = await runWatcher(s, w);
      await scheduled.update(w.id, { lastRun: Date.now(), knownNicks: news.allNicks.slice(0, 200) });
      if (news.fresh.length) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: `FetLife ASL: ${news.fresh.length} new for "${s.name}"`,
          message: news.fresh.slice(0, 5).map(r => `${r.nickname} (${r.age || "?"}${r.sex || ""}, ${r.location || "?"})`).join("\n"),
        });
      }
    } catch (e) { console.warn("watcher:", e); }
  }
}

const PROFILE_DIFF_FIELDS = ["bio", "roles", "orientation", "lookingFor", "activity", "isProfileVerified"];

async function tickProfileWatchers() {
  const list = await profileWatches.list();
  if (!list.length) return;
  const now = Date.now();
  for (const w of list) {
    const due = !w.lastRun || (now - w.lastRun) >= w.intervalMin * 60 * 1000;
    if (!due) continue;
    try {
      const r = await flFetch("https://fetlife.com/" + encodeURIComponent(w.nickname));
      if (r.status !== 200) continue;
      const profile = parseProfile(r.html, w.nickname);
      const snap = {};
      for (const k of PROFILE_DIFF_FIELDS) snap[k] = profile[k];
      const diffs = diffProfile(w.snapshot || {}, snap);
      await profileWatches.update(w.id, { lastRun: Date.now(), snapshot: snap });
      if (w.snapshot && diffs.length) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: `${w.nickname} updated their profile`,
          message: diffs.slice(0, 4).join(" · "),
        });
      }
    } catch (e) { console.warn("profile-watcher:", e); }
  }
}

function diffProfile(a, b) {
  const out = [];
  for (const k of PROFILE_DIFF_FIELDS) {
    const av = JSON.stringify(a[k] ?? null);
    const bv = JSON.stringify(b[k] ?? null);
    if (av !== bv) out.push(k);
  }
  return out;
}

async function runWatcher(saved, watcher) {
  const url = urlForPage(saved.query, 1);
  const r = await flFetch(url);
  if (r.status !== 200) throw new Error("HTTP " + r.status);
  const parsed = parseSearchPage(r.html);
  if (!parsed.loggedIn) throw new Error("logged out");
  const pred = buildPredicate(saved.criteria || {});
  const matched = parsed.results.filter(pred);
  const known = new Set(watcher.knownNicks || []);
  const fresh = matched.filter(r => !known.has(r.nickname));
  const allNicks = matched.map(r => r.nickname);
  return { fresh, allNicks };
}
