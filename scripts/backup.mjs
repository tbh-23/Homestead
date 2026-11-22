// Archives the private family data directory (state, lesson cache, recordings,
// taxonomy cache) into backups/harrington-<timestamp>.tar.gz using the system
// tar, leaving out the stored AI settings (secrets.json; see below).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const dataDir = resolve(process.env.HARRINGTON_DATA_DIR || join(repoRoot, 'data', 'private'));
const backupDir = resolve(process.env.HARRINGTON_BACKUP_DIR || join(repoRoot, 'backups'));

if (!existsSync(dataDir)) {
  console.error(`No family data found at ${dataDir}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const archive = join(backupDir, `harrington-${stamp}.tar.gz`);
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
chmodSync(backupDir, 0o700);

// secrets.json holds the AI provider settings saved in the app, including any
// API key. It stays out of the archive on purpose: a backup copied to a USB
// stick or another computer must not carry the key. Re-enter it under
// Settings > AI provider after a restore.
const base = basename(dataDir);
const exclude = [`--exclude=${base}/secrets.json`, `--exclude=${base}/secrets.json.*.tmp`];
const result = spawnSync('tar', [...exclude, '-czf', archive, '-C', dirname(dataDir), base], { stdio: 'inherit' });
if (result.error || result.status !== 0) {
  console.error(`Backup failed: ${result.error?.message || `tar exited with ${result.status}`}`);
  process.exit(1);
}
chmodSync(archive, 0o600);
console.log(`Backed up ${dataDir} to ${archive}`);
