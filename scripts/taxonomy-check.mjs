#!/usr/bin/env node
// npm run taxonomy:check
//
// A diagnostic, for a pin bump and for CI: downloads every curriculum file
// pinned in lib/taxonomy-pin.mjs, checks its SHA-256 and cross-checks the
// upstream manifest. It writes nothing. The server needs no help moving to a
// new pin: it replaces any cached file that does not match on first use. See
// docs/CURRICULUM.md.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TAXONOMY_PIN, sha256Hex } from '../lib/taxonomy-pin.mjs';
import { CACHE_DIR, localSeedDirs } from '../tests/e2e/support/taxonomy.mjs';

const remoteOnly = process.argv.includes('--remote');
const candidateDirs = remoteOnly ? [] : [CACHE_DIR, ...localSeedDirs()];

async function readLocalVerified(name, expected) {
  for (const dir of candidateDirs) {
    try {
      const body = await readFile(join(dir, name));
      if ((await sha256Hex(body)) === expected) return body;
    } catch {
      // Try next local directory before falling back to upstream fetch.
    }
  }
  return null;
}

const bodies = new Map();
let failed = false;
for (const [name, expected] of Object.entries(TAXONOMY_PIN.files)) {
  let body = await readLocalVerified(name, expected);
  let source = 'local cache';
  if (!body) {
    source = 'upstream';
    try {
      const res = await fetch(`${TAXONOMY_PIN.upstream}/${name}`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = Buffer.from(await res.arrayBuffer());
    } catch (error) {
      console.error(`✗ ${name}: could not download (${error.message})`);
      failed = true;
      continue;
    }
  }
  const actual = await sha256Hex(body);
  if (actual !== expected) {
    console.error(`✗ ${name}: SHA-256 ${actual}, expected ${expected}`);
    failed = true;
    continue;
  }
  console.log(`✓ ${name} (${body.length.toLocaleString('en-US')} bytes, ${source})`);
  bodies.set(name, body);
}

if (failed) {
  console.error(`\nThe pinned taxonomy ${TAXONOMY_PIN.revision.slice(0, 7)} did not verify.`);
  process.exit(1);
}

const manifest = JSON.parse(bodies.get('manifest.json'));
const topics = JSON.parse(bodies.get('topics.json'));
const count = (topics.topics || topics).length;
console.log(`\nMarble Skill Taxonomy ${TAXONOMY_PIN.revision.slice(0, 7)} (${TAXONOMY_PIN.date}), generated ${manifest.generatedAt}: `
  + `${count.toLocaleString('en-US')} topics, ${Object.keys(manifest.counts?.topicsBySubject || {}).length} subjects.`);
// The upstream manifest lists its own files' hashes; ours must agree with it.
for (const [name, entry] of Object.entries(manifest.files || {})) {
  if (TAXONOMY_PIN.files[name] && entry.sha256 !== TAXONOMY_PIN.files[name]) {
    console.error(`✗ manifest.json lists ${name} as ${entry.sha256}, the pin says ${TAXONOMY_PIN.files[name]}`);
    process.exit(1);
  }
}
