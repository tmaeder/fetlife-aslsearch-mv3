// Surface any error to the page so the user sees it without DevTools.
const __earlyErr = (msg, src, stack) => {
  console.error("[flal]", msg, src || "", stack || "");
  let el = document.getElementById("status");
  if (!el) {
    el = document.createElement("pre");
    el.id = "status";
    el.style.cssText = "background:#3a1212;color:#fff;padding:8px;margin:8px;border-radius:6px;font-size:11px;white-space:pre-wrap;border:1px solid #c14545";
    document.body?.insertAdjacentElement?.("afterbegin", el);
  }
  el.hidden = false;
  el.className = "status error";
  el.textContent = "Error: " + msg + (src ? "  @ " + src : "") + (stack ? "\n" + stack : "");
};
window.addEventListener("error", e => __earlyErr(e.message, (e.filename || "") + ":" + e.lineno, e.error?.stack));
window.addEventListener("unhandledrejection", e => __earlyErr(e.reason?.message || String(e.reason), "unhandled-rejection", e.reason?.stack));
console.log("[flal] search-page.js loaded");

import { crawl } from "./crawler.js";
import { fetchProfile, buildDeepPredicate } from "./profile-fetch.js";
import { geocode, haversineKm } from "./distance.js";
import { expandQuery, detectIntent } from "./expander.js";
import { seen, blocked, pinned, notes, history as historyStore, cache, savedSearches, prefs, crawlResume } from "../storage/store.js";
import { isPlaceQuery, isGroupQuery } from "../content/selectors.js";
import { ORIENTATIONS, LOOKING_FOR } from "./vocab.js";
import { parseActivity } from "./activity-parse.js";
import { dedupeMap } from "./avatar-dedupe.js";

function populateChipPicker(containerId, vocab, name) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.replaceChildren();
  for (const [key, label] of vocab) {
    if (!key) continue; // skip "Any"
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.value = key; cb.dataset.group = name;
    const sp = document.createElement("span"); sp.textContent = label;
    lab.append(cb, sp);
    wrap.appendChild(lab);
  }
}

const COLUMNS = [
  { key: "avatar",   label: "",         render: renderAvatar,   sort: () => 0 },
  { key: "nickname", label: "Nickname", render: renderNickname, sort: r => (r.nickname || "").toLowerCase() },
  { key: "age",      label: "Age",      render: txt(r => r.age ?? ""), sort: r => r.age ?? -1 },
  { key: "sex",      label: "Sex",      render: txt(r => r.sex || ""), sort: r => r.sex || "" },
  { key: "role",     label: "Role",     render: txt(r => r.role || ""), sort: r => r.role || "" },
  { key: "location", label: "Location", render: txt(r => r.location || ""), sort: r => r.location || "" },
  { key: "distance", label: "km",       render: renderDistance, sort: r => r.distanceKm ?? Infinity },
  { key: "pics",     label: "Pics",     render: txt(r => r.counts?.pics ?? 0), sort: r => r.counts?.pics ?? 0 },
  { key: "vids",     label: "Vids",     render: txt(r => r.counts?.vids ?? 0), sort: r => r.counts?.vids ?? 0 },
  { key: "writings", label: "Writings", render: txt(r => r.counts?.writings ?? 0), sort: r => r.counts?.writings ?? 0 },
  { key: "actions",  label: "",         render: renderActions, sort: () => 0 },
];

function txt(fn) { return (r, td) => { td.textContent = String(fn(r)); }; }

function renderAvatar(r, td) {
  if (!r.avatarUrl) return;
  const img = document.createElement("img");
  img.className = "avatar";
  img.src = r.avatarUrl;
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  td.appendChild(img);
}

function renderNickname(r, td) {
  const a = document.createElement("a");
  a.href = r.profileUrl;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.referrerPolicy = "no-referrer";
  a.textContent = r.nickname;
  td.appendChild(a);
  if (r.supporter) {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = "★";
    td.appendChild(document.createTextNode(" "));
    td.appendChild(span);
  }
  if (r.appearedInOtherSearches) {
    const span = document.createElement("span");
    span.className = "badge";
    span.style.background = "#444";
    span.title = "Seen in other recent searches";
    span.textContent = "↻";
    td.appendChild(document.createTextNode(" "));
    td.appendChild(span);
  }
}

function renderDistance(r, td) {
  td.className = "distance";
  td.textContent = r.distanceKm != null ? Math.round(r.distanceKm) + " km" : "";
}

function renderActions(r, td) {
  td.className = "row-actions";
  const mk = (label, title, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", e => { e.stopPropagation(); fn(); });
    return b;
  };
  td.append(
    mk("✓", "Mark seen (x)", () => toggleSeen(r.nickname)),
    mk("⊘", "Block (b)",     () => toggleBlock(r.nickname)),
    mk("📝","Note (n)",      () => editNote(r.nickname)),
    mk("⌕", "Search similar",() => searchSimilar(r)),
  );
}

const state = {
  results: [],
  visibleCols: loadCols(),
  sortKey: "nickname",
  sortDir: 1,
  filterText: "",
  abortCtl: null,
  hideSeen: false,
  cursorIdx: 0,
  recentNicks: new Set(),
  seenSet: new Set(),
  blockedSet: new Set(),
  pinnedSet: new Set(),
  selectedSet: new Set(),
  notesMap: {},
  homeLocation: null,
  prefs: null,
  locChipsActive: new Set(),
};

const PRESET_ROLES = ["sub", "dom", "switch", "top", "bottom"];

function loadCols() {
  try {
    const saved = JSON.parse(localStorage.getItem("flal_cols") || "null");
    if (Array.isArray(saved)) return new Set(saved);
  } catch {}
  return new Set(COLUMNS.filter(c => c.key !== "distance").map(c => c.key));
}
function saveCols() { localStorage.setItem("flal_cols", JSON.stringify([...state.visibleCols])); }

async function refreshLists() {
  const [s, b, n, p, pin] = await Promise.all([seen.list(), blocked.list(), notes.all(), prefs.get(), pinned.list()]);
  state.seenSet = new Set(Object.keys(s));
  state.blockedSet = new Set(Object.keys(b));
  state.pinnedSet = new Set(Object.keys(pin));
  state.notesMap = n;
  state.prefs = p;
  state.homeLocation = p.homeLocation;
  document.getElementById("moreDetails").open = !!p.moreOpen;
  document.getElementById("qf-distance").hidden = !p.homeLocation;
  // gather recent search nicknames for cross-search dedupe badge
  const hist = await historyStore.list();
  const recent = new Set();
  for (const h of hist.slice(0, 10)) (h.matchedNicks || []).forEach(n => recent.add(n));
  state.recentNicks = recent;
}

function applyForm(s) {
  if (!s) return;
  document.getElementById("q").value = s.q || s.query || "";
  setNum("ageMin", s.ageMin); setNum("ageMax", s.ageMax);
  document.querySelectorAll("#sexes input, #sexesOther input").forEach(i => { i.checked = (s.sexes || []).includes(i.value); });
  const sRoles = (s.roles || []).map(r => r.toLowerCase());
  document.querySelectorAll("#rolesChips input").forEach(i => { i.checked = sRoles.includes(i.value); });
  document.getElementById("rolesOther").value = sRoles.filter(r => !PRESET_ROLES.includes(r)).join(", ");
  document.getElementById("locationRegex").value = s.locationRegex || "";
  if (document.getElementById("locationSubstring")) document.getElementById("locationSubstring").value = s.locationSubstring || "";
  state.locChipsActive = new Set(s.locationsAny || []);
  document.getElementById("nicknameRegex").value = s.nicknameRegex || "";
  document.getElementById("hasPics").checked = !!s.hasPics;
  document.getElementById("hasVids").checked = !!s.hasVids;
  setNum("minPics", s.minPics); setNum("minVids", s.minVids);
  document.getElementById("supporter").value = s.supporter == null ? "" : String(s.supporter);
  document.getElementById("expandSynonyms").checked = !!s.expandSynonyms;
  document.getElementById("useCache").checked = s.useCache !== false;
  document.getElementById("deepEnable").checked = !!s.deepEnable;
  document.getElementById("bioRegex").value = s.bioRegex || "";
  document.getElementById("fetishesAny").value = (s.fetishesAny || []).join(", ");
  const setChips = (id, values) => {
    const set = new Set(values || []);
    document.querySelectorAll(`#${id} input`).forEach(i => { i.checked = set.has(i.value); });
  };
  setChips("orientationChips", s.orientationAny);
  setChips("lookingForChips", s.lookingForAny);
  if (document.getElementById("accountType")) document.getElementById("accountType").value = s.accountType || "";
  if (document.getElementById("relationshipStatus")) document.getElementById("relationshipStatus").value = s.relationshipStatus || "";
  setNum("minFriends", s.minFriends);
  if (document.getElementById("verifiedOnly")) document.getElementById("verifiedOnly").checked = !!s.verifiedOnly;
  if (document.getElementById("supporterOnly")) document.getElementById("supporterOnly").checked = !!s.supporterOnly;
  setNum("maxKm", s.maxKm);
  document.getElementById("maxPages").value = s.maxPages ?? 10;
  document.getElementById("maxMatches").value = s.maxMatches ?? 200;
  document.getElementById("delayMs").value = s.delayMs ?? 1500;
}

function loadSettings() {
  try { applyForm(JSON.parse(localStorage.getItem("flal_lastSearch") || "null")); } catch {}
}
function setNum(id, v) { document.getElementById(id).value = v ?? ""; }

function csvList(s) { return s.split(",").map(t => t.trim()).filter(Boolean); }

function readForm() {
  const sexes = [...document.querySelectorAll("#sexes input:checked, #sexesOther input:checked")].map(i => i.value);
  const chipRoles = [...document.querySelectorAll("#rolesChips input:checked")].map(i => i.value);
  const otherRoles = csvList(document.getElementById("rolesOther").value);
  const roles = [...new Set([...chipRoles, ...otherRoles])];
  const supRaw = document.getElementById("supporter").value;
  const supporter = supRaw === "true" ? true : supRaw === "false" ? false : null;
  return {
    q: document.getElementById("q").value.trim(),
    ageMin: numOrNull("ageMin"), ageMax: numOrNull("ageMax"),
    sexes, roles,
    locationSubstring: document.getElementById("locationSubstring")?.value.trim() || "",
    locationRegex: document.getElementById("locationRegex").value.trim(),
    locationsAny: [...state.locChipsActive],
    nicknameRegex: document.getElementById("nicknameRegex").value.trim(),
    hasPics: document.getElementById("hasPics").checked,
    hasVids: document.getElementById("hasVids").checked,
    minPics: numOrNull("minPics"), minVids: numOrNull("minVids"),
    supporter,
    expandSynonyms: document.getElementById("expandSynonyms").checked,
    useCache: document.getElementById("useCache").checked,
    incognito: document.getElementById("incognito")?.checked || false,
    deepEnable: document.getElementById("deepEnable").checked,
    bioRegex: document.getElementById("bioRegex").value.trim(),
    fetishesAny: csvList(document.getElementById("fetishesAny").value),
    orientationAny: [...document.querySelectorAll("#orientationChips input:checked")].map(i => i.value),
    lookingForAny: [...document.querySelectorAll("#lookingForChips input:checked")].map(i => i.value),
    accountType: document.getElementById("accountType")?.value || "",
    relationshipStatus: document.getElementById("relationshipStatus")?.value || "",
    minFriends: numOrNull("minFriends"),
    verifiedOnly: document.getElementById("verifiedOnly")?.checked || false,
    supporterOnly: document.getElementById("supporterOnly")?.checked || false,
    maxKm: numOrNull("maxKm"),
    maxPages: numOrNull("maxPages") ?? 10,
    maxMatches: numOrNull("maxMatches") ?? 200,
    delayMs: numOrNull("delayMs") ?? 1500,
  };
}
function numOrNull(id) {
  const v = document.getElementById(id).value;
  if (v === "" || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function setStatus(msg, kind = "") {
  const el = document.getElementById("status");
  if (!msg) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

function renderColumnToggles() {} // legacy no-op (sidebar uses card layout)

function buildCard(r, idx) {
  const card = document.createElement("div");
  card.className = "card" + (state.seenSet.has(r.nickname) ? " is-seen" : "")
    + (state.blockedSet.has(r.nickname) ? " is-blocked" : "")
    + (state.pinnedSet.has(r.nickname) ? " is-pinned" : "")
    + (state.selectedSet.has(r.nickname) ? " is-selected" : "")
    + (state.notesMap[r.nickname] ? " has-note" : "")
    + (idx === state.cursorIdx ? " is-cursor" : "");

  if (r.avatarUrl) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.src = r.avatarUrl;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    card.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className = "avatar";
    ph.style.background = "var(--bg-elev-2)";
    card.appendChild(ph);
  }

  const body = document.createElement("div");
  body.className = "card-body";
  const name = document.createElement("div");
  name.className = "card-name";
  const a = document.createElement("a");
  a.href = r.profileUrl;
  a.rel = "noopener noreferrer";
  a.referrerPolicy = "no-referrer";
  a.textContent = r.nickname;
  // Reuse a single preview tab unless user cmd/ctrl-clicks (then default new-tab).
  a.addEventListener("click", e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    chrome.runtime.sendMessage({ type: "profile:open", url: r.profileUrl, newTab: false });
    seen.add(r.nickname).then(() => { state.seenSet.add(r.nickname); renderTable(); });
  });
  name.appendChild(a);
  if (r.supporter) {
    const b = document.createElement("span"); b.className = "badge"; b.title = "FetLife Supporter"; b.textContent = "★";
    name.appendChild(b);
  }
  if (r.isProfileVerified) {
    const b = document.createElement("span"); b.className = "badge"; b.style.background = "#2e8b57"; b.title = "Profile verified"; b.textContent = "✓";
    name.appendChild(b);
  }
  const dups = state.dupAvatars?.get(r.nickname);
  if (dups?.length) {
    const b = document.createElement("span");
    b.className = "badge";
    b.style.background = "#c8893f";
    b.title = `Same avatar as: ${dups.join(", ")}`;
    b.textContent = "↻" + (dups.length > 1 ? dups.length : "");
    name.appendChild(b);
  }
  if (r.appearedInOtherSearches) {
    const b = document.createElement("span"); b.className = "badge"; b.style.background = "#444"; b.title = "Seen in other recent searches"; b.textContent = "↻";
    name.appendChild(b);
  }
  body.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  const parts = [];
  if (r.age) parts.push(r.age + (r.sex || ""));
  else if (r.sex) parts.push(r.sex);
  if (r.role) parts.push(r.role);
  if (r.location) parts.push(r.location);
  if (r.distanceKm != null) parts.push(Math.round(r.distanceKm) + " km");
  if (r.activity) parts.push(r.activity);
  meta.textContent = parts.join(" · ");
  body.appendChild(meta);

  const stats = document.createElement("div");
  stats.className = "card-stats";
  const c = r.counts || {};
  const sp = [];
  if (c.pics)     sp.push(c.pics + " pics");
  if (c.vids)     sp.push(c.vids + " vids");
  if (c.writings) sp.push(c.writings + " writ");
  if (sp.length) stats.textContent = sp.join(" · ");
  body.appendChild(stats);

  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  const mk = (label, title, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.title = title; b.textContent = label;
    b.addEventListener("click", e => { e.stopPropagation(); fn(); });
    return b;
  };
  const pinBtn = mk(state.pinnedSet.has(r.nickname) ? "📌" : "📍", "Pin (p)", () => togglePin(r.nickname));
  if (state.pinnedSet.has(r.nickname)) pinBtn.classList.add("active");
  actions.append(
    pinBtn,
    mk("✓", "Mark seen (x)",  () => toggleSeen(r.nickname)),
    mk("⊘", "Block (b)",       () => toggleBlock(r.nickname)),
    mk("📝", "Note (n)",       () => editNote(r.nickname)),
  );
  card.appendChild(actions);

  card.addEventListener("click", () => { state.cursorIdx = idx; renderTable(); });
  return card;
}

function fold(s) { return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

// Bump on every state.results mutation. Memoized derivers below check this.
function markResultsChanged() {
  state._resultsVersion = (state._resultsVersion || 0) + 1;
  // Drop cached search-blob — recomputed lazily next render.
  for (const r of state.results) if (r._blob !== undefined) r._blob = undefined;
}
function memoVersioned(fn) {
  let cached;
  return () => {
    if (cached?.v === state._resultsVersion) return cached.value;
    cached = { v: state._resultsVersion, value: fn() };
    return cached.value;
  };
}
const getDupAvatars = memoVersioned(() => dedupeMap(state.results));
function searchBlob(r) {
  if (r._blob === undefined) r._blob = JSON.stringify(r).toLowerCase();
  return r._blob;
}

function visibleRows() {
  const filterLc = state.filterText.toLowerCase();
  const subLc = fold(document.getElementById("locationSubstring")?.value || "");
  const chipsLc = [...state.locChipsActive].map(fold);
  const filtered = state.results
    .filter(r => !state.blockedSet.has(r.nickname))
    .filter(r => !state.hideSeen || !state.seenSet.has(r.nickname))
    .filter(r => !filterLc || searchBlob(r).includes(filterLc))
    .filter(r => {
      if (!subLc && !chipsLc.length) return true;
      const loc = fold(r.location || "");
      if (!loc) return false;
      if (subLc && loc.includes(subLc)) return true;
      if (chipsLc.length && chipsLc.some(c => loc.includes(c))) return true;
      return false;
    });
  // Sort: pinned first, then most-recently-active, then nickname.
  return filtered.sort((a, b) => {
    const ap = state.pinnedSet.has(a.nickname) ? 0 : 1;
    const bp = state.pinnedSet.has(b.nickname) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const aa = a.lastActiveMs ?? Infinity;
    const bb = b.lastActiveMs ?? Infinity;
    if (aa !== bb) return aa - bb;
    return (a.nickname || "").localeCompare(b.nickname || "");
  });
}

function renderLocChips() {
  const wrap = document.getElementById("locChips");
  if (!wrap) return;
  const counts = new Map();
  for (const r of state.results) {
    if (!r.location) continue;
    // Bucket by last comma-segment (country) and first segment (city) — both useful.
    const parts = r.location.split(",").map(s => s.trim()).filter(Boolean);
    const buckets = new Set();
    if (parts.length) buckets.add(parts[parts.length - 1]); // country
    if (parts.length > 1) buckets.add(parts[0]);            // city
    for (const b of buckets) counts.set(b, (counts.get(b) || 0) + 1);
  }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!entries.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  wrap.replaceChildren();
  const label = document.createElement("div");
  label.className = "loc-label";
  label.textContent = "Filter by location";
  wrap.appendChild(label);
  for (const [name, n] of entries) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    if (state.locChipsActive.has(name)) b.classList.add("active");
    const c = document.createElement("span");
    c.className = "count"; c.textContent = n;
    b.appendChild(c);
    b.addEventListener("click", () => {
      if (state.locChipsActive.has(name)) state.locChipsActive.delete(name);
      else state.locChipsActive.add(name);
      renderLocChips();
      renderTable();
    });
    wrap.appendChild(b);
  }
}

function renderFetishSummary() {
  const wrap = document.getElementById("fetish-summary");
  if (!wrap) return;
  const counts = new Map();
  let havingFetishes = 0;
  for (const r of state.results) {
    const arr = r.fetishes || [];
    if (arr.length) havingFetishes++;
    for (const f of arr) counts.set(f, (counts.get(f) || 0) + 1);
  }
  if (havingFetishes < 2) { wrap.hidden = true; return; }
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!entries.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  wrap.replaceChildren();
  const lab = document.createElement("div");
  lab.className = "label";
  lab.textContent = `Top fetishes among ${havingFetishes} matches`;
  wrap.appendChild(lab);
  for (const [name, n] of entries) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = `${n} of ${havingFetishes} matches list "${name}"`;
    b.textContent = name;
    const c = document.createElement("span"); c.className = "count"; c.textContent = n;
    b.appendChild(c);
    b.addEventListener("click", () => {
      const cur = document.getElementById("fetishesAny");
      const list = cur.value.split(",").map(s => s.trim()).filter(Boolean);
      if (!list.includes(name)) list.push(name);
      cur.value = list.join(", ");
    });
    wrap.appendChild(b);
  }
}

function renderTable() {
  const list = document.getElementById("cards-list");
  if (!list) return;
  const rows = visibleRows();
  state.dupAvatars = getDupAvatars();
  list.replaceChildren();
  rows.forEach((r, i) => {
    if (state.recentNicks.has(r.nickname)) r.appearedInOtherSearches = true;
    list.appendChild(buildCard(r, i));
  });
  document.getElementById("matchCount").textContent = rows.length;
  document.getElementById("results").hidden = state.results.length === 0;
  renderLocChips();
  renderFetishSummary();
  if (state.results.length > 0 && rows.length === 0) showEmptyHint();
  else hideEmptyHint();
}

function showEmptyHint() {
  const el = document.getElementById("empty-hint");
  el.hidden = false;
  el.textContent = "0 visible matches. Try: relax age range, drop role chips, or uncheck 'Has pictures' / 'Hide seen'.";
}
function hideEmptyHint() { document.getElementById("empty-hint").hidden = true; }

function valueOf(r, key) {
  switch (key) {
    case "nickname": return r.nickname;
    case "age": return r.age ?? "";
    case "sex": return r.sex || "";
    case "role": return r.role || "";
    case "location": return r.location || "";
    case "distance": return r.distanceKm != null ? Math.round(r.distanceKm) : "";
    case "pics": return r.counts?.pics ?? 0;
    case "vids": return r.counts?.vids ?? 0;
    case "writings": return r.counts?.writings ?? 0;
    default: return "";
  }
}

function exportCsv() {
  const cols = COLUMNS.filter(c => state.visibleCols.has(c.key) && c.key !== "avatar" && c.key !== "actions");
  const header = cols.map(c => c.label || c.key).join(",");
  const lines = visibleRows().map(r => cols.map(c => csvCell(valueOf(r, c.key))).join(","));
  download("fetlife-asl-results.csv", "text/csv", [header, ...lines].join("\n"));
}
function exportJson() {
  download("fetlife-asl-results.json", "application/json", JSON.stringify(visibleRows(), null, 2));
}
function csvCell(v) {
  const s = String(v ?? "").replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
function download(name, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

async function toggleSeen(nick) {
  if (state.seenSet.has(nick)) { await seen.remove(nick); state.seenSet.delete(nick); }
  else { await seen.add(nick); state.seenSet.add(nick); }
  renderTable();
}
async function toggleBlock(nick) {
  if (state.blockedSet.has(nick)) { await blocked.remove(nick); state.blockedSet.delete(nick); }
  else { await blocked.add(nick); state.blockedSet.add(nick); }
  renderTable();
}
async function togglePin(nick) {
  if (state.pinnedSet.has(nick)) { await pinned.remove(nick); state.pinnedSet.delete(nick); }
  else { await pinned.add(nick); state.pinnedSet.add(nick); }
  renderTable();
}

async function toggleProfileWatch(nick) {
  const r = await chrome.runtime.sendMessage({ type: "profileWatch:has", nickname: nick });
  if (r?.watching) {
    await chrome.runtime.sendMessage({ type: "profileWatch:remove", id: r.id });
    setStatus(`Stopped watching ${nick}.`, "ok");
  } else {
    const ivStr = prompt(`Watch ${nick}'s profile for changes (bio / roles / activity). Check every N hours?`, "12");
    const iv = parseInt(ivStr, 10);
    if (!iv || iv < 1) return;
    await chrome.runtime.sendMessage({ type: "profileWatch:add", nickname: nick, intervalMin: iv * 60 });
    setStatus(`Watching ${nick} every ${iv}h.`, "ok");
  }
}

function toggleSelected(nick) {
  if (state.selectedSet.has(nick)) state.selectedSet.delete(nick);
  else if (state.selectedSet.size >= 4) return; // cap at 4
  else state.selectedSet.add(nick);
  renderTable();
  document.getElementById("compare-bar").hidden = state.selectedSet.size === 0;
  document.getElementById("compare-count").textContent = state.selectedSet.size;
}

function openComparePanel() {
  const drawer = document.getElementById("drawer");
  const body = document.getElementById("drawer-body");
  drawer.hidden = false;
  document.getElementById("drawer-title").textContent = "Compare";
  body.replaceChildren();
  const profiles = [...state.selectedSet]
    .map(nick => state.results.find(r => r.nickname === nick))
    .filter(Boolean);
  if (!profiles.length) { body.textContent = "No profiles selected. Press 'c' on results to select up to 4."; return; }
  function avatarNode(r) {
    if (!r.avatarUrl) return document.createTextNode("");
    const img = document.createElement("img");
    img.src = r.avatarUrl;
    img.referrerPolicy = "no-referrer";
    img.style.cssText = "width:40px;height:40px;border-radius:50%;object-fit:cover";
    return img;
  }
  const fields = [
    ["Avatar", r => avatarNode(r)],
    ["Identity", r => r.identity || `${r.age || ""}${r.sex || ""} ${r.role || ""}`],
    ["Location", r => r.location || ""],
    ["Activity", r => r.activity || "—"],
    ["Account", r => r.accountType || "—"],
    ["Verified", r => r.isProfileVerified ? "✓" : "—"],
    ["Friends", r => r.friendsCount ?? "—"],
    ["Pics", r => r.counts?.pics ?? 0],
    ["Vids", r => r.counts?.vids ?? 0],
    ["Orientation", r => (r.orientation || []).join(", ") || "—"],
    ["Looking for", r => (r.lookingFor || []).join(", ") || "—"],
    ["Bio", r => (r.bio || "").slice(0, 200) + ((r.bio || "").length > 200 ? "…" : "")],
  ];
  const table = document.createElement("table");
  table.style.cssText = "width:100%;font-size:11px;border-collapse:collapse";
  const head = document.createElement("tr");
  head.appendChild(document.createElement("th"));
  for (const p of profiles) {
    const th = document.createElement("th");
    th.style.cssText = "padding:4px;border-bottom:1px solid var(--border);text-align:left";
    const a = document.createElement("a"); a.href = p.profileUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = p.nickname; a.style.color = "var(--accent)";
    th.appendChild(a);
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const [label, fn] of fields) {
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    td0.style.cssText = "padding:4px;color:var(--fg-dim);font-size:10px;text-transform:uppercase;border-bottom:1px solid var(--border);vertical-align:top";
    td0.textContent = label;
    tr.appendChild(td0);
    for (const p of profiles) {
      const td = document.createElement("td");
      td.style.cssText = "padding:4px;border-bottom:1px solid var(--border);vertical-align:top";
      const v = fn(p);
      if (v instanceof Node) td.appendChild(v);
      else td.textContent = String(v);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  body.appendChild(table);
}
async function editNote(nick) {
  const v = await chrome.runtime.sendMessage({ type: "vault:status" });
  if (v?.enabled && !v.unlocked) {
    const pass = prompt("Note vault is locked. Enter passphrase to unlock for this Chrome session:");
    if (!pass) return;
    const unlock = await chrome.runtime.sendMessage({ type: "vault:unlock", passphrase: pass });
    if (!unlock?.ok) { setStatus("Unlock failed: " + (unlock?.error || "unknown"), "error"); return; }
    state.notesMap = await notes.all();
  }
  const dlg = document.getElementById("note-dialog");
  document.getElementById("note-target").textContent = "for " + nick;
  document.getElementById("note-text").value = state.notesMap[nick]?.text || "";
  dlg.returnValue = "";
  dlg.showModal();
  await new Promise(r => dlg.addEventListener("close", r, { once: true }));
  if (dlg.returnValue === "save") {
    const text = document.getElementById("note-text").value.trim();
    await notes.set(nick, text);
    state.notesMap = await notes.all();
    renderTable();
  }
}
function searchSimilar(r) {
  document.getElementById("q").value = r.location ? r.location.split(",")[0] : (r.role || "");
  document.querySelectorAll("#sexes input").forEach(i => { i.checked = i.value === r.sex; });
  const role = (r.role || "").toLowerCase();
  document.querySelectorAll("#rolesChips input").forEach(i => { i.checked = role.includes(i.value); });
  if (r.age) {
    document.getElementById("ageMin").value = Math.max(18, r.age - 5);
    document.getElementById("ageMax").value = r.age + 5;
  }
  document.getElementById("search-form").requestSubmit();
}

// ── Main search flow ──
const _form = document.getElementById("search-form");
_form.addEventListener("submit", (ev) => {
  console.log("[flal] form submit");
  runSearch(ev).catch(e => surfaceError(e.message, e.stack));
});
document.getElementById("run").addEventListener("click", () => console.log("[flal] run clicked"));
console.log("[flal] handlers attached, form=", !!_form);

async function runSearch(ev) {
  ev?.preventDefault();
  const form = readForm();
  if (!form.q) { setStatus("Type a query first.", "error"); return; }

  // Auto-detect sex/role chips from query if not yet set
  const intent = detectIntent(form.q);
  if (form.sexes.length === 0 && intent.sexes.length) {
    intent.sexes.forEach(v => {
      const i = document.querySelector(`#sexes input[value="${v}"]`);
      if (i) i.checked = true;
    });
    form.sexes.push(...intent.sexes);
  }
  if (form.roles.length === 0 && intent.roles.length) {
    intent.roles.forEach(v => {
      const i = document.querySelector(`#rolesChips input[value="${v}"]`);
      if (i) i.checked = true;
    });
    form.roles.push(...intent.roles);
  }

  const effectiveQuery = form.expandSynonyms ? expandQuery(form.q) : form.q;

  localStorage.setItem("flal_lastSearch", JSON.stringify(form));

  // Cache hit?
  if (form.useCache && !form.incognito) {
    const hit = await cache.get(effectiveQuery, criteriaForCache(form));
    if (hit) {
      state.results = hit.results;

      markResultsChanged();
      state.cursorIdx = 0;
      renderTable();
      setStatus(`Cached: ${hit.results.length} results from ${new Date(hit.ts).toLocaleString()}.`, "ok");
      await postProcess(form);
      return;
    }
  }

  state.results = [];
  state.cursorIdx = 0;
  renderTable();
  document.getElementById("run").disabled = true;
  document.getElementById("cancel").hidden = false;
  state.abortCtl = new AbortController();
  setStatus("Starting…", "running");

  let totalSeen = 0;
  try {
    for await (const ev2 of crawl({
      query: effectiveQuery,
      criteria: form,
      maxPages: form.maxPages,
      maxMatches: form.maxMatches,
      delayMs: form.delayMs,
      signal: state.abortCtl.signal,
    })) {
      if (ev2.type === "page") {
        state.results.push(...ev2.matched);

        markResultsChanged();
        totalSeen += ev2.pageResults.length;
        const total = ev2.total ? ` • pool ${ev2.total.toLocaleString()}` : "";
        setStatus(`Page ${ev2.page} • scanned ${totalSeen} • matched ${ev2.matchCount}${total}`, "running");
        renderTable();
        if (ev2.parseHealth != null && ev2.parseHealth < 0.7 && totalSeen >= 20) {
          showParseWarning(ev2.parseHealth);
        }
      } else if (ev2.type === "logged_out") {
        setStatus("Logged out. Sign in at fetlife.com and retry.", "error");
        return;
      } else if (ev2.type === "error") {
        setStatus(`Error on page ${ev2.page}: ${ev2.message}`, "error");
        return;
      }
    }
    if (state.results.length > 0) setStatus(`Crawl done. ${state.results.length} matches.${form.incognito ? " 🕶" : ""}`, "ok");
    if (!form.incognito) {
      await cache.set(effectiveQuery, criteriaForCache(form), state.results);
      await postProcess(form);
      await historyStore.push({
        query: form.q, criteria: form,
        matchCount: state.results.length,
        matchedNicks: state.results.slice(0, 50).map(r => r.nickname),
      });
      await renderRecentSearches();
    } else {
      await postProcess(form);
    }
  } catch (e) {
    if (e.name === "AbortError") setStatus("Cancelled.");
    else setStatus("Error: " + e.message, "error");
  } finally {
    document.getElementById("run").disabled = false;
    document.getElementById("cancel").hidden = true;
    state.abortCtl = null;
  }
}

function criteriaForCache(form) {
  const { q, useCache, ...rest } = form;
  return rest;
}

async function postProcess(form) {
  // distance
  if (form.maxKm && state.homeLocation) {
    setStatus("Geocoding locations…", "running");
    for (const r of state.results) {
      if (!r.location) continue;
      const g = await geocode(r.location);
      if (g) r.distanceKm = haversineKm(state.homeLocation, g);
    }
    state.results = state.results.filter(r => r.distanceKm == null || r.distanceKm <= form.maxKm);

    markResultsChanged();
    renderTable();
  }

  // deep filter
  if (form.deepEnable) {
    const dpred = buildDeepPredicate(form);
    setStatus("Deep-filtering profiles…", "running");
    const kept = [];
    for (let i = 0; i < state.results.length; i++) {
      const r = state.results[i];
      try {
        const profile = await fetchProfile(r.nickname);
        if (dpred(profile)) {
          r.bio = profile.bio;
          r.fetishes = profile.fetishes?.all;
          r.orientation = profile.orientation;
          r.orientationKeys = profile.orientationKeys;
          r.friendsCount = profile.friendsCount;
          r.isProfileVerified = profile.isProfileVerified;
          r.accountType = profile.accountType;
          r.activity = profile.activity;
          r.lastActiveMs = parseActivity(profile.activity);
          r.lookingFor = profile.lookingFor;
          r.relationships = profile.relationships;
          kept.push(r);
        }
      } catch { /* skip */ }
      if (i % 5 === 0) {
        setStatus(`Deep filter ${i+1}/${state.results.length} • kept ${kept.length}`, "running");
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    state.results = kept;

    markResultsChanged();
    renderTable();
    setStatus(`Deep filter done. ${kept.length} matches.`, "ok");
  }
}

function showParseWarning(health) {
  const el = document.getElementById("parse-warning");
  el.hidden = false;
  el.textContent = `Selector drift suspected — ${Math.round((1-health)*100)}% of cards parsed incompletely. FetLife may have changed its layout.`;
}

document.getElementById("cancel").addEventListener("click", () => state.abortCtl?.abort());

document.getElementById("clear").addEventListener("click", () => {
  document.getElementById("search-form").reset();
  state.results = [];

  markResultsChanged();
  renderTable();
  setStatus("");
});

document.getElementById("filterText").addEventListener("input", e => {
  state.filterText = e.target.value;
  renderTable();
});
document.getElementById("locationSubstring")?.addEventListener("input", () => renderTable());
document.getElementById("compare-open")?.addEventListener("click", openComparePanel);
document.getElementById("compare-clear")?.addEventListener("click", () => {
  state.selectedSet.clear();
  document.getElementById("compare-bar").hidden = true;
  document.getElementById("compare-count").textContent = "0";
  renderTable();
});

document.getElementById("exportCsv")?.addEventListener("click", exportCsv);
document.getElementById("exportJson")?.addEventListener("click", exportJson);
document.getElementById("hideSeen")?.addEventListener("click", () => {
  state.hideSeen = !state.hideSeen;
  document.getElementById("hideSeen").classList.toggle("active", state.hideSeen);
  renderTable();
});
document.getElementById("bulkOpen").addEventListener("click", async () => {
  const rows = visibleRows().slice(0, 10);
  if (!confirm(`Open ${rows.length} profiles in new tabs (throttled)?`)) return;
  for (const r of rows) {
    chrome.tabs.create({ url: r.profileUrl, active: false });
    await new Promise(s => setTimeout(s, 250));
  }
});

document.getElementById("save").addEventListener("click", async () => {
  const form = readForm();
  if (!form.q) { alert("Enter a query first."); return; }
  const name = prompt("Name this saved search:", form.q);
  if (!name) return;
  await savedSearches.save(name, form.q, criteriaForCache(form));
  alert("Saved.");
});

document.getElementById("moreDetails").addEventListener("toggle", e => {
  prefs.set({ moreOpen: e.target.open });
});

// Drawer
document.querySelectorAll(".header-nav button[data-panel]").forEach(b =>
  b.addEventListener("click", () => openDrawer(b.dataset.panel)));
document.getElementById("drawer-close").addEventListener("click", () => {
  document.getElementById("drawer").hidden = true;
});

async function openDrawer(panel) {
  const drawer = document.getElementById("drawer");
  const body = document.getElementById("drawer-body");
  drawer.hidden = false;
  body.replaceChildren();
  const titles = { saved: "Saved searches", history: "History", lists: "Seen / Blocked", schedule: "Watchers" };
  document.getElementById("drawer-title").textContent = titles[panel] || panel;
  if (panel === "saved") await renderSaved(body);
  else if (panel === "history") await renderHistory(body);
  else if (panel === "lists") await renderLists(body);
  else if (panel === "schedule") await renderSchedule(body);
}

async function renderSaved(body) {
  const list = await savedSearches.list();
  if (!list.length) { body.textContent = "No saved searches yet. Click ★ next to the search button to save the current query."; return; }
  const hint = document.createElement("div");
  hint.className = "meta"; hint.style.marginBottom = "6px";
  hint.textContent = "Drag rows to reorder.";
  body.appendChild(hint);
  let dragIdx = -1;
  list.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "drawer-row";
    row.draggable = true;
    row.style.cursor = "move";
    row.addEventListener("dragstart", () => { dragIdx = idx; row.style.opacity = "0.4"; });
    row.addEventListener("dragend", () => { row.style.opacity = "1"; });
    row.addEventListener("dragover", e => e.preventDefault());
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (dragIdx < 0 || dragIdx === idx) return;
      const moved = list.splice(dragIdx, 1)[0];
      list.splice(idx, 0, moved);
      await chrome.storage.sync.set({ savedSearches: list });
      renderSaved(body);
    });
    const handle = document.createElement("span");
    handle.textContent = "⋮⋮";
    handle.style.cssText = "color:var(--fg-dim);margin-right:6px;cursor:grab";
    const left = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = s.name;
    const meta = document.createElement("div"); meta.className = "meta";
    meta.textContent = `"${s.query}" · ${new Date(s.createdAt).toLocaleDateString()}`;
    left.append(name, meta);
    const acts = document.createElement("div"); acts.className = "actions";
    const run = document.createElement("button"); run.textContent = "Run";
    run.addEventListener("click", () => loadAndRun(s));
    const watch = document.createElement("button"); watch.textContent = "Watch";
    watch.title = "Notify when new matches appear";
    watch.addEventListener("click", () => promptWatch(s));
    const del = document.createElement("button"); del.textContent = "✕";
    del.addEventListener("click", async () => { await savedSearches.remove(s.id); renderSaved(body); });
    acts.append(run, watch, del);
    const flex = document.createElement("div");
    flex.style.cssText = "display:flex;align-items:center;flex:1;min-width:0";
    flex.append(handle, left);
    row.append(flex, acts);
    body.appendChild(row);
  });
}

async function loadAndRun(s) {
  applyForm({ q: s.query, ...(s.criteria || {}) });
  document.getElementById("drawer").hidden = true;
  document.getElementById("search-form").requestSubmit();
}

async function promptWatch(s) {
  const intervalMin = parseInt(prompt("Check every N minutes?", "60"), 10);
  if (!intervalMin || intervalMin < 15) { alert("Minimum 15 minutes."); return; }
  await chrome.runtime.sendMessage({ type: "watch:add", savedSearchId: s.id, intervalMin });
  alert("Watching.");
}

async function renderHistory(body) {
  const list = await historyStore.list();
  if (!list.length) { body.textContent = "No history yet."; return; }
  for (const h of list) {
    const row = document.createElement("div");
    row.className = "drawer-row";
    const left = document.createElement("div");
    const name = document.createElement("strong"); name.textContent = h.query;
    const meta = document.createElement("div"); meta.className = "meta";
    meta.textContent = `${h.matchCount} matches · ${new Date(h.ts).toLocaleString()}`;
    left.append(name, meta);
    const acts = document.createElement("div"); acts.className = "actions";
    const run = document.createElement("button"); run.textContent = "Re-run";
    run.addEventListener("click", () => loadAndRun({ query: h.query, criteria: h.criteria }));
    acts.append(run);
    row.append(left, acts);
    body.appendChild(row);
  }
  const clear = document.createElement("button");
  clear.textContent = "Clear history";
  clear.style.marginTop = "12px";
  clear.addEventListener("click", async () => { await historyStore.clear(); renderHistory(body); });
  body.appendChild(clear);
}

async function renderLists(body) {
  const [s, b] = await Promise.all([seen.list(), blocked.list()]);
  const section = (label, map, removeFn) => {
    const h = document.createElement("h3");
    h.textContent = `${label} (${Object.keys(map).length})`;
    h.style.cssText = "font-size:13px;color:var(--fg-dim);margin:14px 0 6px;text-transform:uppercase;letter-spacing:0.04em";
    body.appendChild(h);
    if (!Object.keys(map).length) {
      const e = document.createElement("div"); e.className = "meta"; e.textContent = "(none)";
      body.appendChild(e);
      return;
    }
    for (const [nick, meta] of Object.entries(map)) {
      const row = document.createElement("div"); row.className = "drawer-row";
      const left = document.createElement("a");
      left.href = "https://fetlife.com/" + nick;
      left.target = "_blank"; left.rel = "noopener noreferrer";
      left.textContent = nick;
      left.style.color = "var(--fg)";
      const right = document.createElement("div"); right.className = "actions";
      const x = document.createElement("button"); x.textContent = "✕";
      x.addEventListener("click", async () => { await removeFn(nick); renderLists(body); });
      right.appendChild(x);
      row.append(left, right);
      body.appendChild(row);
    }
  };
  body.replaceChildren();
  section("Seen", s, async n => seen.remove(n));
  section("Blocked", b, async n => blocked.remove(n));
}

async function renderSchedule(body) {
  body.replaceChildren();
  const [searches, profiles] = await Promise.all([
    chrome.runtime.sendMessage({ type: "watch:list" }),
    chrome.runtime.sendMessage({ type: "profileWatch:list" }),
  ]);

  const section = (title) => {
    const h = document.createElement("h3");
    h.textContent = title;
    h.style.cssText = "font-size:11px;color:var(--fg-dim);margin:14px 0 4px;text-transform:uppercase;letter-spacing:0.04em";
    body.appendChild(h);
  };

  section("Saved-search watchers");
  if (!searches?.list?.length) {
    const e = document.createElement("div"); e.className = "meta"; e.textContent = "(none) · save a search and click 'Watch'.";
    body.appendChild(e);
  } else {
    for (const w of searches.list) {
      const row = document.createElement("div"); row.className = "drawer-row";
      const left = document.createElement("div");
      const n = document.createElement("strong"); n.textContent = w.savedName || "(deleted search)";
      const m = document.createElement("div"); m.className = "meta";
      m.textContent = `every ${w.intervalMin}m · last ${w.lastRun ? new Date(w.lastRun).toLocaleString() : "never"}`;
      left.append(n, m);
      const acts = document.createElement("div"); acts.className = "actions";
      const del = document.createElement("button"); del.textContent = "✕";
      del.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "watch:remove", id: w.id }); renderSchedule(body); });
      acts.append(del);
      row.append(left, acts);
      body.appendChild(row);
    }
  }

  section("Profile diff watchers");
  if (!profiles?.list?.length) {
    const e = document.createElement("div"); e.className = "meta"; e.textContent = "(none) · press 'w' on a result to watch their bio/roles/activity.";
    body.appendChild(e);
  } else {
    for (const w of profiles.list) {
      const row = document.createElement("div"); row.className = "drawer-row";
      const left = document.createElement("div");
      const a = document.createElement("a");
      a.href = "https://fetlife.com/" + w.nickname; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = w.nickname; a.style.color = "var(--fg)";
      const m = document.createElement("div"); m.className = "meta";
      m.textContent = `every ${w.intervalMin}m · last ${w.lastRun ? new Date(w.lastRun).toLocaleString() : "never"}`;
      left.append(a, m);
      const acts = document.createElement("div"); acts.className = "actions";
      const del = document.createElement("button"); del.textContent = "✕";
      del.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "profileWatch:remove", id: w.id }); renderSchedule(body); });
      acts.append(del);
      row.append(left, acts);
      body.appendChild(row);
    }
  }
}

// Resume banner
async function checkResume() {
  const r = await crawlResume.load();
  const banner = document.getElementById("resume-banner");
  if (!r) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.replaceChildren();
  const text = document.createElement("span");
  text.textContent = `Interrupted crawl: "${r.query}" at page ${r.page}.`;
  const resume = document.createElement("button"); resume.textContent = "Resume";
  const dismiss = document.createElement("button"); dismiss.textContent = "Dismiss";
  resume.addEventListener("click", () => {
    applyForm({ q: r.query, ...(r.criteria || {}) });
    banner.hidden = true;
    document.getElementById("search-form").requestSubmit();
  });
  dismiss.addEventListener("click", async () => { await crawlResume.clear(); banner.hidden = true; });
  banner.append(text, resume, dismiss);
}

// Keyboard
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, select")) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const rows = visibleRows();
  if (e.key === "j") { state.cursorIdx = Math.min(rows.length - 1, state.cursorIdx + 1); renderTable(); e.preventDefault(); }
  else if (e.key === "k") { state.cursorIdx = Math.max(0, state.cursorIdx - 1); renderTable(); e.preventDefault(); }
  else if (e.key === "o") { const r = rows[state.cursorIdx]; if (r) chrome.runtime.sendMessage({ type: "profile:open", url: r.profileUrl, newTab: e.shiftKey }); }
  else if (e.key === "x") { const r = rows[state.cursorIdx]; if (r) toggleSeen(r.nickname); }
  else if (e.key === "b") { const r = rows[state.cursorIdx]; if (r) toggleBlock(r.nickname); }
  else if (e.key === "n") { const r = rows[state.cursorIdx]; if (r) editNote(r.nickname); }
  else if (e.key === "p") { const r = rows[state.cursorIdx]; if (r) togglePin(r.nickname); }
  else if (e.key === "c") { const r = rows[state.cursorIdx]; if (r) toggleSelected(r.nickname); }
  else if (e.key === "w") { const r = rows[state.cursorIdx]; if (r) toggleProfileWatch(r.nickname); }
  else if (e.key === "/") { document.getElementById("filterText").focus(); e.preventDefault(); }
});

function surfaceError(msg, stack) {
  __earlyErr(String(msg), "", stack || "");
}

// Hash-encoded shareable filter URL.
function encodeHash(form) {
  const min = {};
  for (const [k, v] of Object.entries(form)) {
    if (v == null || v === "" || v === false) continue;
    if (Array.isArray(v) && !v.length) continue;
    min[k] = v;
  }
  try { return "#" + btoa(unescape(encodeURIComponent(JSON.stringify(min)))); } catch { return ""; }
}
function decodeHash(h) {
  if (!h || h.length < 2) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(h.slice(1))))); } catch { return null; }
}
function syncHash() {
  const f = readForm();
  const newHash = encodeHash(f);
  if (location.hash !== newHash) history.replaceState(null, "", newHash || "#");
}

function updateModeBadge() {
  const q = document.getElementById("q").value.trim();
  const badge = document.getElementById("mode-badge");
  const input = document.getElementById("q");
  const clearBtn = document.getElementById("q-clear");
  if (clearBtn) clearBtn.hidden = !q;
  if (!badge) return;
  if (isPlaceQuery(q)) {
    badge.hidden = false;
    badge.textContent = "📍 Place";
    input.classList.add("with-badge");
  } else if (isGroupQuery(q)) {
    badge.hidden = false;
    badge.textContent = "👥 Group";
    input.classList.add("with-badge");
  } else {
    badge.hidden = true;
    input.classList.remove("with-badge");
  }
}

async function renderRecentSearches() {
  const wrap = document.getElementById("recent-searches");
  if (!wrap) return;
  const list = (await historyStore.list()).slice(0, 5);
  if (!list.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  wrap.replaceChildren();
  const lab = document.createElement("div"); lab.className = "label"; lab.textContent = "Recent";
  wrap.appendChild(lab);
  for (const h of list) {
    const b = document.createElement("button");
    b.type = "button";
    const summary = summarizeCriteria(h.criteria);
    const detail = `${h.matchCount} matches · ${new Date(h.ts).toLocaleString()}${summary ? " · " + summary : ""}`;
    b.title = detail;
    const q = document.createElement("span"); q.textContent = h.query;
    b.appendChild(q);
    if (summary) {
      const tags = document.createElement("span");
      tags.style.cssText = "margin-left:6px;color:var(--fg-dim);font-size:10px";
      tags.textContent = summary;
      b.appendChild(tags);
    }
    b.addEventListener("click", () => loadAndRun({ query: h.query, criteria: h.criteria }));
    wrap.appendChild(b);
  }
}

function summarizeCriteria(c) {
  if (!c) return "";
  const bits = [];
  if (c.ageMin || c.ageMax) bits.push(`${c.ageMin || ""}-${c.ageMax || ""}`);
  if (c.sexes?.length) bits.push(c.sexes.join("/"));
  if (c.roles?.length) bits.push(c.roles.slice(0, 3).join("/"));
  if (c.locationsAny?.length) bits.push("📍" + c.locationsAny.slice(0, 2).join(","));
  if (c.deepEnable) bits.push("deep");
  if (c.verifiedOnly) bits.push("✓");
  return bits.join(" · ");
}

// Init
(async () => {
  try {
    await refreshLists();
    populateChipPicker("orientationChips", ORIENTATIONS, "orientation");
    populateChipPicker("lookingForChips", LOOKING_FOR.map(([k, n]) => [k, n]), "lookingFor");
    renderColumnToggles();
    loadSettings();
    updateModeBadge();
    await renderRecentSearches();
    const qEl = document.getElementById("q");
    qEl.addEventListener("input", updateModeBadge);
    document.getElementById("q-clear")?.addEventListener("click", () => { qEl.value = ""; qEl.focus(); updateModeBadge(); });
    const params = new URLSearchParams(location.search);
    if (params.get("q"))    document.getElementById("q").value = params.get("q");
    if (params.get("nick")) document.getElementById("q").value = params.get("nick");
    const fromHash = decodeHash(location.hash);
    if (fromHash) applyForm(fromHash);
    document.getElementById("search-form").addEventListener("input", () => syncHash());
    document.getElementById("search-form").addEventListener("change", () => syncHash());
    // Pending nick from "search similar" context menu (side panel can't read URL params).
    const { pendingNick } = await chrome.storage.local.get("pendingNick");
    if (pendingNick) {
      document.getElementById("q").value = pendingNick;
      await chrome.storage.local.remove("pendingNick");
    }
    await checkResume();
  } catch (e) { surfaceError(e.message, e.stack); }
})();
