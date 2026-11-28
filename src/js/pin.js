// The grown-up PIN that keeps the child view from closing with one tap. Only a
// salted SHA-256 hash is kept in the family document (settings.parentPinHash,
// with the family's random salt in settings.parentPinSalt). Four digits are
// 10,000 guesses, so the hash keeps the PIN out of plain sight in an export;
// it does not make the PIN a lock.

export const PIN_PATTERN = /^\d{4}$/;

const toHex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

export function newSalt() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

// SHA-256 in plain JS, synchronous so the PIN can be migrated while a family
// document is applied (load, conflict reload, import, export). It also works
// where Web Crypto does not: a tablet opening Harrington at
// http://192.168.x.x is not a secure context.
export function sha256Hex(text) {
  return sha256Bytes(new TextEncoder().encode(text));
}

export function hashPin(pin, salt) {
  return sha256Hex(`${salt}:${pin}`);
}

export const HASH_PATTERN = /^[0-9a-f]{64}$/;
export const SALT_PATTERN = /^[0-9a-f]{32}$/;
const storedHash = (settings) =>
  HASH_PATTERN.test(settings?.parentPinHash ?? '') && SALT_PATTERN.test(settings?.parentPinSalt ?? '');

export function hasPin(settings) {
  return storedHash(settings) || !!legacyPin(settings);
}

export function verifyPin(pin, settings) {
  if (!PIN_PATTERN.test(String(pin))) return false;
  const legacy = legacyPin(settings);
  if (legacy) return String(pin) === legacy;
  if (!storedHash(settings)) return false;
  return hashPin(String(pin), settings.parentPinSalt) === settings.parentPinHash;
}

// Settings for a new PIN: a fresh salt (or the one given, for fixtures) and
// its hash, the plain PIN gone.
export function pinSettings(settings, pin, salt = newSalt()) {
  const { parentPin: _plain, parentPinHash: _h, parentPinSalt: _s, ...rest } = settings || {};
  return { ...rest, parentPinSalt: salt, parentPinHash: hashPin(String(pin), salt) };
}

export function clearPinSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  const { parentPin: _plain, parentPinHash: _h, parentPinSalt: _s, ...rest } = settings;
  return rest;
}

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_BASE_LOCKOUT_MS = 15_000;
export const PIN_MAX_LOCKOUT_MS = 5 * 60 * 1000;

const memoryThrottle = new Map();

function defaultPinStorage() {
  return {
    getItem(k) {
      try {
        if (typeof globalThis.sessionStorage !== 'undefined') return globalThis.sessionStorage.getItem(k);
      } catch {}
      return memoryThrottle.get(k) ?? null;
    },
    setItem(k, v) {
      memoryThrottle.set(k, v);
      try {
        if (typeof globalThis.sessionStorage !== 'undefined') globalThis.sessionStorage.setItem(k, v);
      } catch {}
    },
    removeItem(k) {
      memoryThrottle.delete(k);
      try {
        if (typeof globalThis.sessionStorage !== 'undefined') globalThis.sessionStorage.removeItem(k);
      } catch {}
    },
  };
}

// Tracks consecutive wrong child-view PIN guesses across modal open/close in
// sessionStorage (with an in-memory fallback), enforcing an exponential
// cooldown after PIN_MAX_ATTEMPTS failures up to PIN_MAX_LOCKOUT_MS.
export function createPinThrottle({ storage = defaultPinStorage(), now = () => Date.now(), key = 'harrington:pinThrottle' } = {}) {
  const read = () => {
    try {
      const raw = storage?.getItem?.(key);
      if (!raw) return { failures: 0, lockedUntil: 0 };
      const parsed = JSON.parse(raw);
      return {
        failures: Number.isSafeInteger(parsed?.failures) && parsed.failures >= 0 ? parsed.failures : 0,
        lockedUntil: Number.isFinite(parsed?.lockedUntil) && parsed.lockedUntil >= 0 ? parsed.lockedUntil : 0,
      };
    } catch {
      return { failures: 0, lockedUntil: 0 };
    }
  };
  const write = (state) => {
    try {
      if (state.failures === 0 && state.lockedUntil === 0) storage?.removeItem?.(key);
      else storage?.setItem?.(key, JSON.stringify(state));
    } catch {}
  };
  const status = () => {
    const state = read();
    const remainingMs = Math.max(0, state.lockedUntil - now());
    return {
      locked: remainingMs > 0,
      remainingMs,
      failures: state.failures,
      lockedUntil: state.lockedUntil,
    };
  };
  const recordFailure = () => {
    const current = read();
    const currentRemaining = Math.max(0, current.lockedUntil - now());
    if (currentRemaining > 0) {
      return { locked: true, remainingMs: currentRemaining, failures: current.failures, lockedUntil: current.lockedUntil };
    }
    const failures = current.failures + 1;
    const durationMs = failures >= PIN_MAX_ATTEMPTS
      ? Math.min(PIN_MAX_LOCKOUT_MS, PIN_BASE_LOCKOUT_MS * (2 ** (failures - PIN_MAX_ATTEMPTS)))
      : 0;
    const lockedUntil = durationMs > 0 ? now() + durationMs : 0;
    write({ failures, lockedUntil });
    return { locked: durationMs > 0, remainingMs: durationMs, failures, lockedUntil };
  };
  const reset = () => {
    write({ failures: 0, lockedUntil: 0 });
  };
  const verify = (pin, settings) => {
    const current = status();
    if (current.locked) return { ok: false, ...current };
    if (verifyPin(pin, settings)) {
      reset();
      return { ok: true, locked: false, remainingMs: 0, failures: 0, lockedUntil: 0 };
    }
    return { ok: false, ...recordFailure() };
  };
  return { status, recordFailure, reset, verify };
}

export const pinThrottle = createPinThrottle();

// A family document from before the hash (or hand-edited, or imported) may
// carry the plain PIN, or a hash or salt that is not one Harrington wrote.
// Returns settings with the plain PIN hashed and any malformed hash and salt
// dropped, or the same object when there is nothing to change. Synchronous;
// `salt` can be injected for fixtures.
export function migratePinSettings(settings, { salt } = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return settings;
  const hasPlain = 'parentPin' in settings;
  const hasStored = 'parentPinHash' in settings || 'parentPinSalt' in settings;
  if (!hasPlain && (!hasStored || storedHash(settings))) return settings;
  const pin = legacyPin(settings);
  if (pin) return pinSettings(settings, pin, salt);
  const { parentPin: _drop, parentPinHash, parentPinSalt, ...rest } = settings;
  return storedHash(settings) ? { ...rest, parentPinHash, parentPinSalt } : rest;
}

function legacyPin(settings) {
  // String() so a hand-edited numeric value in the data file still matches.
  const pin = settings?.parentPin;
  if (pin == null || pin === '') return null;
  const text = String(pin);
  return PIN_PATTERN.test(text) ? text : null;
}

// ---- SHA-256 (FIPS 180-4) ----
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Bytes(data) {
  const bitLength = data.length * 8;
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, x => x.toString(16).padStart(8, '0')).join('');
}
