import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  PIN_BASE_LOCKOUT_MS,
  PIN_MAX_ATTEMPTS,
  PIN_MAX_LOCKOUT_MS,
  clearPinSettings,
  createPinThrottle,
  hashPin,
  hasPin,
  migratePinSettings,
  newSalt,
  pinSettings,
  sha256Hex,
  verifyPin,
} from '../src/js/pin.js';

const nodeSha = (text) => createHash('sha256').update(text).digest('hex');

test('the plain-JS SHA-256 matches Node', () => {
  for (const text of ['', 'abc', '0420', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(200), 'naïve 🌱']) {
    assert.equal(sha256Hex(text), nodeSha(text), text.slice(0, 10));
  }
});

test('a new salt is 16 random bytes in hex', () => {
  const a = newSalt();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, newSalt());
});

test('set a PIN, then verify it: only the salted hash is kept', () => {
  const settings = pinSettings({ calendar: { homeDays: [1] } }, '0420');
  assert.deepEqual(Object.keys(settings).sort(), ['calendar', 'parentPinHash', 'parentPinSalt']);
  assert.equal(settings.parentPinHash, nodeSha(`${settings.parentPinSalt}:0420`));
  assert.equal(settings.parentPinHash, hashPin('0420', settings.parentPinSalt));
  assert.doesNotMatch(JSON.stringify(settings), /"0420"/);
  assert.equal(hasPin(settings), true);
  assert.equal(verifyPin('0420', settings), true);
  assert.equal(verifyPin('0421', settings), false);
  assert.equal(verifyPin('42', settings), false);
  assert.equal(verifyPin('', settings), false);
  // Changing the PIN draws a new salt.
  const changed = pinSettings(settings, '1357');
  assert.notEqual(changed.parentPinSalt, settings.parentPinSalt);
  assert.equal(verifyPin('1357', changed), true);
  assert.equal(verifyPin('0420', changed), false);
  // A stored hash needs nothing migrated: the same object back.
  assert.equal(migratePinSettings(changed), changed);
});

test('no PIN set', () => {
  assert.equal(hasPin({}), false);
  assert.equal(hasPin(undefined), false);
  assert.equal(verifyPin('0000', {}), false);
  assert.equal(migratePinSettings(undefined), undefined);
  const plain = { calendar: {} };
  assert.equal(migratePinSettings(plain), plain);
});

test('a plain PIN from an older family document migrates to the hash', () => {
  const old = { parentPin: '2468', calendar: { homeDays: [1, 2] } };
  assert.equal(hasPin(old), true);
  assert.equal(verifyPin('2468', old), true);
  const migrated = migratePinSettings(old);
  assert.equal('parentPin' in migrated, false);
  assert.deepEqual(migrated.calendar, { homeDays: [1, 2] });
  assert.equal(verifyPin('2468', migrated), true);
  assert.equal(verifyPin('1111', migrated), false);
  assert.doesNotMatch(JSON.stringify(migrated), /"2468"/);
  // A hand-edited number still counts.
  assert.equal(verifyPin('1234', migratePinSettings({ parentPin: 1234 })), true);
  // A plain PIN wins over a stale hash next to it (an older tab saved it).
  const stale = { ...pinSettings({}, '9999'), parentPin: '1357' };
  const fresh = migratePinSettings(stale);
  assert.equal(verifyPin('1357', fresh), true);
  assert.equal(verifyPin('9999', fresh), false);
  // The salt can be injected for fixtures.
  const fixed = migratePinSettings({ parentPin: '2468' }, { salt: 'a'.repeat(32) });
  assert.equal(fixed.parentPinSalt, 'a'.repeat(32));
  assert.equal(fixed.parentPinHash, nodeSha(`${'a'.repeat(32)}:2468`));
  // An empty or malformed plain PIN is dropped, not hashed.
  assert.deepEqual(migratePinSettings({ parentPin: '' }), {});
  assert.deepEqual(migratePinSettings({ parentPin: 'abcd', calendar: {} }), { calendar: {} });
});

test('a malformed or half-present hash and salt are dropped, and count as no PIN', () => {
  const good = pinSettings({}, '0420');
  const cases = [
    { parentPinHash: good.parentPinHash },                                  // no salt
    { parentPinSalt: good.parentPinSalt },                                  // no hash
    { parentPinHash: good.parentPinHash.toUpperCase(), parentPinSalt: good.parentPinSalt },
    { parentPinHash: good.parentPinHash.slice(1), parentPinSalt: good.parentPinSalt },
    { parentPinHash: good.parentPinHash, parentPinSalt: `${good.parentPinSalt}0` },
    { parentPinHash: 42, parentPinSalt: null },
  ];
  for (const settings of cases) {
    const label = JSON.stringify(settings);
    assert.equal(hasPin(settings), false, label);
    assert.equal(verifyPin('0420', settings), false, label);
    assert.deepEqual(migratePinSettings({ ...settings, calendar: {} }), { calendar: {} }, label);
  }
});

test('clearPinSettings removes PIN fields while keeping other settings (HAR-57)', () => {
  const settings = pinSettings({ calendar: { homeDays: [1, 2] } }, '0420');
  assert.equal(hasPin(settings), true);
  const cleared = clearPinSettings({ ...settings, parentPin: '0420' });
  assert.equal(hasPin(cleared), false);
  assert.deepEqual(cleared, { calendar: { homeDays: [1, 2] } });
});

test('PIN throttle locks out after 5 wrong tries with exponential backoff persisted in storage (HAR-57)', () => {
  let clock = 1_000_000;
  const map = new Map();
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  const settings = pinSettings({}, '2468', 'a'.repeat(32));
  const throttle = createPinThrottle({ storage, now: () => clock });

  for (let i = 1; i < PIN_MAX_ATTEMPTS; i += 1) {
    const res = throttle.verify('0000', settings);
    assert.equal(res.ok, false);
    assert.equal(res.locked, false);
    assert.equal(res.failures, i);
  }

  // 5th failure triggers the base lockout (15 s).
  const fifth = throttle.verify('0000', settings);
  assert.equal(fifth.ok, false);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.failures, 5);
  assert.equal(fifth.remainingMs, PIN_BASE_LOCKOUT_MS);

  // Reopening the modal (a fresh throttle instance sharing storage) keeps the lockout,
  // and even the right PIN is refused while locked.
  const reopened = createPinThrottle({ storage, now: () => clock });
  assert.equal(reopened.status().locked, true);
  assert.equal(reopened.verify('2468', settings).ok, false);
  assert.equal(reopened.status().failures, 5);

  // After 15 s, a 6th failure doubles the lockout to 30 s.
  clock += PIN_BASE_LOCKOUT_MS;
  assert.equal(reopened.status().locked, false);
  const sixth = reopened.verify('9999', settings);
  assert.equal(sixth.locked, true);
  assert.equal(sixth.remainingMs, PIN_BASE_LOCKOUT_MS * 2);

  // Further failures double up to the 5-minute cap.
  for (let i = 7; i <= 11; i += 1) {
    clock += PIN_MAX_LOCKOUT_MS;
    const res = reopened.verify('9999', settings);
    assert.equal(res.locked, true);
    assert.equal(res.remainingMs, Math.min(PIN_MAX_LOCKOUT_MS, PIN_BASE_LOCKOUT_MS * (2 ** (i - PIN_MAX_ATTEMPTS))));
  }

  // After the cooldown, the right PIN succeeds and resets storage.
  clock += PIN_MAX_LOCKOUT_MS;
  const ok = reopened.verify('2468', settings);
  assert.equal(ok.ok, true);
  assert.equal(ok.locked, false);
  assert.equal(ok.failures, 0);
  assert.equal(map.size, 0);
});
