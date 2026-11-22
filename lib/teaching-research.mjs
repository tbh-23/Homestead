// Marble's teaching research (data/teaching-research.json, about 23 MB) is
// never sent to the browser whole. The server splits it once per revision
// into one small file per topic under the taxonomy cache:
//
//   <taxonomyDir>/research/<topicId>.json   one record, as published
//   <taxonomyDir>/research/index.json       { format, sourceSha256, caveat, recordCount, topicIds }
//
// index.json is written last, so its presence (with the source's SHA-256)
// means the split finished. `caveat` is Marble's own first note about the
// records (notes[0]), kept verbatim so it follows the pinned file.
// Dependency-free.
import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const RESEARCH_FILE = 'teaching-research.json';
export const RESEARCH_DIR = 'research';
const INDEX = 'index.json';
// Bumped when index.json changes shape, so an older split is redone.
const INDEX_FORMAT = 2;

// Marble topic ids: "mt_" and a short URL-safe id. Checked before any path
// is built from one.
export const TOPIC_ID = /^mt_[A-Za-z0-9_-]{4,40}$/;

export function validTopicId(id) {
  return typeof id === 'string' && TOPIC_ID.test(id);
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// The split already on disk, or null when there is none (or it is unreadable).
export async function readResearchIndex(taxonomyDir) {
  try {
    const index = JSON.parse(await readFile(join(taxonomyDir, RESEARCH_DIR, INDEX), 'utf8'));
    return index?.format === INDEX_FORMAT && typeof index.sourceSha256 === 'string' && Array.isArray(index.topicIds)
      ? index : null;
  } catch {
    return null;
  }
}

// Writes the per-topic files for `source` (the downloaded file's bytes) and
// returns the index. A split of the same bytes already on disk is kept as is.
// Records without a valid topic id are skipped and counted, never written.
export async function splitTeachingResearch(source, taxonomyDir) {
  const sourceSha256 = sha256(source);
  const existing = await readResearchIndex(taxonomyDir);
  if (existing?.sourceSha256 === sourceSha256) return existing;

  const parsed = JSON.parse(source.toString('utf8'));
  if (!parsed || !Array.isArray(parsed.records)) throw new Error('Teaching research has no records');

  // Build next to the live directory and swap it in, so a reader never sees
  // half a split and a crash leaves the old one (or none) in place. Staging
  // and old directories a crashed split left behind are removed first.
  const target = join(taxonomyDir, RESEARCH_DIR);
  for (const name of await readdir(taxonomyDir).catch(() => [])) {
    if (name.startsWith(`${RESEARCH_DIR}.`) && (name.endsWith('.tmp') || name.includes('.old.'))) {
      await rm(join(taxonomyDir, name), { recursive: true, force: true });
    }
  }
  const stamp = `${process.pid}.${Date.now()}`;
  const staging = `${target}.${stamp}.tmp`;
  await mkdir(staging, { recursive: true, mode: 0o700 });
  await chmod(staging, 0o700).catch(() => {});
  const writePrivate = async (filePath, text) => {
    await writeFile(filePath, text, { mode: 0o600 });
    await chmod(filePath, 0o600).catch(() => {});
  };
  const seen = new Set();
  let skipped = 0;
  try {
    for (const record of parsed.records) {
      const id = record?.topicId;
      if (!validTopicId(id) || seen.has(id)) { skipped += 1; continue; }
      await writePrivate(join(staging, `${id}.json`), JSON.stringify(record));
      seen.add(id);
    }
    const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
    const index = {
      format: INDEX_FORMAT,
      sourceSha256,
      caveat: typeof notes[0] === 'string' ? notes[0] : null,
      schemaVersion: parsed.schemaVersion ?? null,
      version: parsed.version ?? null,
      recordCount: seen.size,
      skipped,
      topicIds: [...seen].sort(),
    };
    await writePrivate(join(staging, INDEX), JSON.stringify(index));
    // Move the old split aside, put the new one in place, then delete the
    // old one: `research/` is missing only between two renames.
    const old = `${target}.old.${stamp}`;
    const hadOld = await rename(target, old).then(() => true, (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    await rename(staging, target);
    await chmod(target, 0o700).catch(() => {});
    if (hadOld) await rm(old, { recursive: true, force: true });
    return index;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

// One topic's record as stored bytes, or null when it has none. Throws on a
// bad id before touching the filesystem.
export async function readResearchRecord(taxonomyDir, topicId) {
  if (!validTopicId(topicId)) {
    throw Object.assign(new Error('Invalid topic id'), { statusCode: 400 });
  }
  try {
    return await readFile(join(taxonomyDir, RESEARCH_DIR, `${topicId}.json`));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
