// Optional at-rest encryption for sensitive free-form fields (currently:
// private notes). Threat model: a local actor with read access to the user's
// Chrome profile directory should not be able to read note plaintext.
//
// Design: AES-GCM with a key derived from a user passphrase via PBKDF2-SHA256
// (210k iterations). Salt is per-installation, stored in chrome.storage.local.
// Once unlocked, the derived key is cached in chrome.storage.session — which
// Chrome clears when the browser closes — so the user only types the
// passphrase once per Chrome session. There is no recovery: forget the
// passphrase and the encrypted field is unreadable. That's the point.

const ENABLED_KEY = "vaultEnabled";
const SALT_KEY = "vaultSalt";
const VERIFIER_KEY = "vaultVerifier";   // a known-plaintext blob we can use to verify a passphrase
const SESSION_KEY = "vaultKeyJwk";       // raw JWK of the derived key for the current session
const PBKDF2_ITER = 210000;
const VERIFIER_PLAINTEXT = "fetlife-asl-vault-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64decode(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function getOrCreateSalt() {
  const got = await chrome.storage.local.get(SALT_KEY);
  if (got[SALT_KEY]) return b64decode(got[SALT_KEY]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.local.set({ [SALT_KEY]: b64encode(salt.buffer) });
  return salt;
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encryptString(plain, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return { v: 1, iv: b64encode(iv.buffer), ct: b64encode(ct) };
}

async function decryptString(blob, key) {
  if (!blob || typeof blob !== "object" || blob.v !== 1) throw new Error("not an encrypted blob");
  const iv = b64decode(blob.iv);
  const ct = b64decode(blob.ct);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(plain);
}

export const vault = {
  async isEnabled() { return !!(await chrome.storage.local.get(ENABLED_KEY))[ENABLED_KEY]; },

  async enable(passphrase) {
    if (!passphrase || passphrase.length < 8) throw new Error("passphrase must be ≥ 8 chars");
    const salt = await getOrCreateSalt();
    const key = await deriveKey(passphrase, salt);
    const verifier = await encryptString(VERIFIER_PLAINTEXT, key);
    await chrome.storage.local.set({ [ENABLED_KEY]: true, [VERIFIER_KEY]: verifier });
    await this._stashSessionKey(key);
  },

  async disable() {
    // Caller is responsible for migrating any encrypted fields back to plaintext.
    await chrome.storage.local.remove([ENABLED_KEY, VERIFIER_KEY]);
    await chrome.storage.session?.remove?.(SESSION_KEY).catch(() => {});
  },

  async isUnlocked() {
    if (!chrome.storage.session) return false;
    const got = await chrome.storage.session.get(SESSION_KEY);
    return !!got[SESSION_KEY];
  },

  async unlock(passphrase) {
    const enabled = await this.isEnabled();
    if (!enabled) throw new Error("vault not enabled");
    const got = await chrome.storage.local.get([SALT_KEY, VERIFIER_KEY]);
    const salt = b64decode(got[SALT_KEY]);
    const key = await deriveKey(passphrase, salt);
    try {
      const round = await decryptString(got[VERIFIER_KEY], key);
      if (round !== VERIFIER_PLAINTEXT) throw new Error("wrong passphrase");
    } catch { throw new Error("wrong passphrase"); }
    await this._stashSessionKey(key);
  },

  async lock() {
    if (!chrome.storage.session) return;
    await chrome.storage.session.remove(SESSION_KEY);
  },

  async _getKey() {
    if (!chrome.storage.session) throw new Error("session storage unavailable");
    const got = await chrome.storage.session.get(SESSION_KEY);
    if (!got[SESSION_KEY]) throw new Error("vault locked");
    return crypto.subtle.importKey(
      "jwk", got[SESSION_KEY], { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
    );
  },

  async _stashSessionKey(key) {
    if (!chrome.storage.session) return;
    const jwk = await crypto.subtle.exportKey("jwk", key);
    await chrome.storage.session.set({ [SESSION_KEY]: jwk });
  },

  async encrypt(plain) {
    if (plain == null || plain === "") return plain;
    const key = await this._getKey();
    return encryptString(String(plain), key);
  },

  async decrypt(blob) {
    if (blob == null) return blob;
    if (typeof blob === "string") return blob; // pre-vault plaintext
    const key = await this._getKey();
    return decryptString(blob, key);
  },
};
