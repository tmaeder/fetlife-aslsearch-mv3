async function load() {
  const s = await chrome.storage.sync.get(["patUrl", "defaultDelay", "defaultMaxPages", "homeLocation", "paranoidMode", "cacheTtlMs"]);
  document.getElementById("patUrl").value = s.patUrl || "";
  document.getElementById("defaultDelay").value = s.defaultDelay ?? 1500;
  document.getElementById("defaultMaxPages").value = s.defaultMaxPages ?? 10;
  document.getElementById("paranoidMode").checked = !!s.paranoidMode;
  document.getElementById("cacheTtlHours").value = Math.round((s.cacheTtlMs ?? 24*60*60*1000) / (60*60*1000));
  if (s.homeLocation) {
    document.getElementById("homeStatus").textContent =
      `Set: ${s.homeLocation.label || `${s.homeLocation.lat}, ${s.homeLocation.lng}`}`;
  }
  const meta = await chrome.storage.local.get(["patFetchedAt", "patData"]);
  if (meta.patFetchedAt) {
    const count = Object.keys(meta.patData || {}).length;
    document.getElementById("patStatus").textContent =
      `Last refreshed ${new Date(meta.patFetchedAt).toLocaleString()} — ${count} entries.`;
  }
}

document.getElementById("opts").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ttlH = parseInt(document.getElementById("cacheTtlHours").value, 10) || 24;
  await chrome.storage.sync.set({
    patUrl: document.getElementById("patUrl").value.trim(),
    defaultDelay: parseInt(document.getElementById("defaultDelay").value, 10) || 1500,
    defaultMaxPages: parseInt(document.getElementById("defaultMaxPages").value, 10) || 10,
    paranoidMode: document.getElementById("paranoidMode").checked,
    cacheTtlMs: ttlH * 60 * 60 * 1000,
  });
  setStatus("Saved.", "ok");
});

document.getElementById("refresh").addEventListener("click", async () => {
  document.getElementById("patStatus").textContent = "Refreshing…";
  const r = await chrome.runtime.sendMessage({ type: "pat:refresh" });
  if (r?.ok) {
    const meta = await chrome.storage.local.get(["patFetchedAt", "patData"]);
    const count = Object.keys(meta.patData || {}).length;
    document.getElementById("patStatus").textContent =
      `Refreshed ${new Date(meta.patFetchedAt).toLocaleString()} — ${count} entries.`;
  } else {
    document.getElementById("patStatus").textContent = "Refresh failed: " + (r?.error || "unknown");
  }
});

document.getElementById("geocode").addEventListener("click", async () => {
  const q = document.getElementById("homeQuery").value.trim();
  if (!q) return;
  document.getElementById("homeStatus").textContent = "Looking up…";
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const arr = await res.json();
    if (!arr.length) { document.getElementById("homeStatus").textContent = "No match found."; return; }
    const top = arr[0];
    const home = { lat: parseFloat(top.lat), lng: parseFloat(top.lon), label: top.display_name };
    await chrome.storage.sync.set({ homeLocation: home });
    document.getElementById("homeStatus").textContent = "Set: " + home.label;
  } catch (e) {
    document.getElementById("homeStatus").textContent = "Lookup failed: " + e.message;
  }
});

document.getElementById("clearCache").addEventListener("click", async () => {
  await chrome.storage.local.set({ cache: {}, geoCache: {} });
  setStatus("Cache cleared.", "ok");
});

document.getElementById("clearAll").addEventListener("click", async () => {
  if (!confirm("Erase all stored data: seen list, blocked list, notes, cache, history, saved searches?")) return;
  await chrome.storage.local.clear();
  await chrome.storage.sync.clear();
  setStatus("All data cleared. Reload extension.", "ok");
});

function setStatus(msg, kind = "") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
  el.hidden = !msg;
}

document.getElementById("exportLists").addEventListener("click", async () => {
  const data = await chrome.storage.local.get(["seen", "blocked", "pinned", "notes"]);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fetlife-asl-lists-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("listsStatus").textContent = `Exported ${Object.keys(data.seen||{}).length} seen · ${Object.keys(data.blocked||{}).length} blocked · ${Object.keys(data.pinned||{}).length} pinned · ${Object.keys(data.notes||{}).length} notes.`;
});

document.getElementById("importLists").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const cur = await chrome.storage.local.get(["seen", "blocked", "pinned", "notes"]);
    const merged = {
      seen:    { ...(cur.seen    || {}), ...(data.seen    || {}) },
      blocked: { ...(cur.blocked || {}), ...(data.blocked || {}) },
      pinned:  { ...(cur.pinned  || {}), ...(data.pinned  || {}) },
      notes:   { ...(cur.notes   || {}), ...(data.notes   || {}) },
    };
    await chrome.storage.local.set(merged);
    document.getElementById("listsStatus").textContent =
      `Imported. Now: ${Object.keys(merged.seen).length} seen · ${Object.keys(merged.blocked).length} blocked · ${Object.keys(merged.pinned).length} pinned · ${Object.keys(merged.notes).length} notes.`;
  } catch (err) {
    document.getElementById("listsStatus").textContent = "Import failed: " + err.message;
  } finally {
    e.target.value = "";
  }
});

async function refreshVault() {
  const r = await chrome.runtime.sendMessage({ type: "vault:status" });
  const status = document.getElementById("vault-status");
  const enableRow = document.getElementById("vault-enable-row");
  const unlockRow = document.getElementById("vault-unlock-row");
  if (!r?.enabled) {
    status.textContent = "Disabled · notes stored as plaintext.";
    enableRow.hidden = false;
    unlockRow.hidden = true;
  } else if (r.unlocked) {
    status.textContent = "Enabled and unlocked for this Chrome session.";
    enableRow.hidden = true;
    unlockRow.hidden = false;
  } else {
    status.textContent = "Enabled — locked. Existing notes are unreadable until you unlock.";
    enableRow.hidden = true;
    unlockRow.hidden = false;
  }
}

document.getElementById("vault-enable").addEventListener("click", async () => {
  const pass = document.getElementById("vault-pass").value;
  const r = await chrome.runtime.sendMessage({ type: "vault:enable", passphrase: pass });
  if (r?.ok) {
    document.getElementById("vault-pass").value = "";
    setStatus("Vault enabled and unlocked.", "ok");
    await refreshVault();
  } else {
    setStatus("Enable failed: " + (r?.error || "unknown"), "error");
  }
});

document.getElementById("vault-unlock").addEventListener("click", async () => {
  const pass = document.getElementById("vault-unlock-pass").value;
  const r = await chrome.runtime.sendMessage({ type: "vault:unlock", passphrase: pass });
  if (r?.ok) {
    document.getElementById("vault-unlock-pass").value = "";
    setStatus("Vault unlocked.", "ok");
    await refreshVault();
  } else {
    setStatus("Unlock failed: " + (r?.error || "unknown"), "error");
  }
});

document.getElementById("vault-lock").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "vault:lock" });
  setStatus("Vault locked.", "ok");
  await refreshVault();
});

load();
refreshVault();
