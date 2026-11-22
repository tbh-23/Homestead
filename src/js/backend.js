// Harrington-owned persistence. In self-hosted mode requests stay on the same
// origin; when built for Firebase Hosting, activeFirebaseConfig() routes them
// to the family's Firebase project.
import { activeFirebaseConfig } from './firebase-config.js';
import {
  firebaseBeaconState,
  firebaseChat,
  firebaseDeleteAudio,
  firebaseHealth,
  firebaseListFigures,
  firebaseListLessons,
  firebaseLoadAiSettings,
  firebaseLoadAudio,
  firebaseLoadLesson,
  firebaseLoadState,
  firebaseRemoveAiSettings,
  firebaseSaveAiSettings,
  firebaseSaveAudio,
  firebaseSaveLesson,
  firebaseSaveState,
  firebaseTestAiSettings,
} from './firebase-backend.js';
import { SIGN_IN_MESSAGE } from './hosting.js';

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 401) {
    // The access token is on and this browser has no sign-in cookie.
    throw Object.assign(new Error(SIGN_IN_MESSAGE), { status: 401, body: null });
  }
  if (!response.ok) {
    let message = `Harrington request failed (${response.status})`;
    let body = null;
    try {
      body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw Object.assign(new Error(message), { status: response.status, body });
  }
  return response;
}

export async function health() {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseHealth(cfg);
  return request('/api/health').then((response) => response.json());
}

// The "See how it works" figures this server has: [{ id, title, hint }] (HAR-34).
export async function listFigures() {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseListFigures();
  return request('/api/figures').then((response) => response.json()).then((body) => body.figures);
}

function versionFromEtag(response) {
  const match = (response.headers.get('ETag') || '').match(/"v(\d+)"/);
  return match ? Number.parseInt(match[1], 10) : null;
}

// Returns the stored family document, including its integer `version`.
export async function loadState() {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseLoadState(cfg);
  return request('/api/state').then((response) => response.json());
}

// A request that must outlive the page (a fetch with keepalive, a beacon)
// may carry about 64 KB of body: Chromium caps the bodies in flight per page
// at 65,536 bytes, for both kinds together. Larger documents go as plain
// requests, which the browser aborts on unload (the store warns before that).
export const UNLOAD_BODY_LIMIT = 64 * 1024;
const encoder = new TextEncoder();
export function fitsUnload(body) {
  return encoder.encode(body).length < UNLOAD_BODY_LIMIT;
}

// True when fetch here keeps a request alive past unload (every current
// browser; Firefox from 133). Such a request shares the unload budget above
// with beacons: Chromium refuses one that would exceed it before sending.
export function supportsKeepalive() {
  return typeof Request === 'function' && 'keepalive' in Request.prototype;
}

// The PUT body for `value`: the document plus the `writeId` the server stores
// so this tab can recognise its own write later.
export function stateBody(value, writeId) {
  return JSON.stringify({ ...value, writeId });
}

// Saves only if the server still holds `version`. `body` comes from stateBody.
// Resolves to the new version. Rejects with `status: 412` and `body` set to
// the server's current document when another tab or device saved first.
// keepalive: the request finishes even if the page is closed or reloaded
// before the response arrives (bodies under UNLOAD_BODY_LIMIT only).
export async function saveState(body, version, { keepalive = false } = {}) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseSaveState(body, version, cfg, undefined, { keepalive });
  const response = await request('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"v${version}"` },
    body,
    ...(keepalive ? { keepalive: true } : {}),
  });
  return versionFromEtag(response) ?? version + 1;
}

// Unload path: beacons cannot set headers, so the precondition travels in the
// body. Returns false when the browser refused to queue the beacon.
export function beaconState(value, version, writeId) {
  if (activeFirebaseConfig()) return firebaseBeaconState(value, version, writeId);
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return false;
  const blob = new Blob([JSON.stringify({ ...value, version, writeId })], { type: 'application/json' });
  return navigator.sendBeacon('/api/state', blob);
}

export async function loadLesson(id) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseLoadLesson(id, cfg);
  const response = await fetch(`/api/lessons/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load lesson (${response.status})`);
  return response.json();
}

// Keys and saved times (ms) of cached entries under one prefix, newest first,
// at most `limit` (the server caps it too). No content.
export async function listLessons(prefix, limit) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseListLessons(prefix, limit, cfg);
  const response = await request(`/api/lessons?prefix=${encodeURIComponent(prefix)}&limit=${limit}`);
  const body = await response.json();
  return Array.isArray(body?.lessons) ? body.lessons : [];
}

export async function saveLesson(id, value) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseSaveLesson(id, value, cfg);
  await request(`/api/lessons/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

export async function saveAudio(name, blob) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseSaveAudio(name, blob, cfg);
  await request(`/api/audio/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  return name;
}

export async function loadAudio(name) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseLoadAudio(name, cfg);
  return request(`/api/audio/${encodeURIComponent(name)}`).then((response) => response.blob());
}

export async function deleteAudio(name) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseDeleteAudio(name, cfg);
  await request(`/api/audio/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// The server always uses its configured AI model, and forwards the request
// only when `capability` is switched on (HARRINGTON_AI_CAPABILITIES).
// includeNotes: the parent ticked "Include my notes in this request"; without
// it the server removes any stored parent note from the messages.
export async function chat(messages, capability, { includeNotes = false } = {}) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseChat(messages, capability, { includeNotes }, cfg);
  const response = await request('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(includeNotes ? { messages, capability, includeNotes: true } : { messages, capability }),
  });
  return response.json();
}

// AI provider settings saved on the server (never the API key itself).
export async function loadAiSettings() {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseLoadAiSettings(cfg);
  return request('/api/settings/ai').then((response) => response.json());
}

// `patch` fields left out are unchanged; null or '' clears a saved value.
export async function saveAiSettings(patch) {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseSaveAiSettings(patch, cfg);
  const response = await request('/api/settings/ai', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return response.json();
}

export async function removeAiSettings() {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseRemoveAiSettings(cfg);
  return request('/api/settings/ai', { method: 'DELETE' }).then((response) => response.json());
}

// One tiny request to the provider: { ok, latencyMs, status?, error? }.
export async function testAiSettings() {
  const cfg = activeFirebaseConfig();
  if (cfg) return firebaseTestAiSettings(cfg);
  return request('/api/settings/ai/test', { method: 'POST' }).then((response) => response.json());
}
