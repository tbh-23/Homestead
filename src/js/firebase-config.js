// Active Firebase configuration for Firebase Hosting builds.
// Remains null in the repository so local self-hosted mode (`node server.mjs`)
// and automated tests use the local HTTP backend by default.
export const FIREBASE_CONFIG = null;

// Returns the active Firebase configuration when running on Firebase Hosting
// or when injected via `override` or `globalThis.__HARRINGTON_FIREBASE_CONFIG__`.
export function activeFirebaseConfig(override = null) {
  return override || globalThis.__HARRINGTON_FIREBASE_CONFIG__ || FIREBASE_CONFIG || null;
}
