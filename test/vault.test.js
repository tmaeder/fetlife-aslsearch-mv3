import test from "node:test";
import assert from "node:assert/strict";

// Stub chrome.storage so vault.js can import. We only test the inner crypto
// functions exported via a side door.
function makeArea() {
  const _s = {};
  return {
    async get(k) {
      if (Array.isArray(k)) return Object.fromEntries(k.map(key => [key, _s[key]]));
      if (k && typeof k === "object") return Object.fromEntries(Object.entries(k).map(([key, def]) => [key, _s[key] ?? def]));
      return { [k]: _s[k] };
    },
    async set(o) { Object.assign(_s, o); },
    async remove(k) {
      const keys = Array.isArray(k) ? k : [k];
      for (const key of keys) delete _s[key];
    },
  };
}
const chromeStub = { storage: { local: makeArea(), session: makeArea() } };
globalThis.chrome = chromeStub;

const { vault } = await import("../storage/vault.js");

test("vault: enable + encrypt + decrypt round-trip", async () => {
  await vault.enable("hunter2-correct-horse-battery-staple");
  assert.equal(await vault.isEnabled(), true);
  assert.equal(await vault.isUnlocked(), true);
  const blob = await vault.encrypt("private text — Tallassee");
  assert.notEqual(blob, "private text — Tallassee");
  assert.equal(blob.v, 1);
  assert.ok(blob.iv && blob.ct);
  const back = await vault.decrypt(blob);
  assert.equal(back, "private text — Tallassee");
});

test("vault: lock prevents decrypt; unlock with wrong passphrase rejects", async () => {
  await vault.lock();
  assert.equal(await vault.isUnlocked(), false);
  await assert.rejects(() => vault.decrypt({ v: 1, iv: "AA==", ct: "AA==" }), /vault locked/);
  await assert.rejects(() => vault.unlock("wrong"), /wrong passphrase/);
  await vault.unlock("hunter2-correct-horse-battery-staple");
  assert.equal(await vault.isUnlocked(), true);
});

test("vault: short passphrase rejected", async () => {
  await vault.disable();
  await assert.rejects(() => vault.enable("short"), /≥ 8/);
});

test("vault: pre-vault plaintext passes through decrypt", async () => {
  await vault.enable("hunter2-correct-horse-battery-staple");
  // strings (legacy plaintext) should pass through
  assert.equal(await vault.decrypt("plain text"), "plain text");
  // null pass-through
  assert.equal(await vault.decrypt(null), null);
});
