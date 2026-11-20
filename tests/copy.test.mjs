// User-facing copy describes only what works today (HAR-12). A promise that
// something will be fixed later goes stale once it ships, as the HAR-19
// privacy line did, so no shipped string may carry one.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const repoRoot = new URL('..', import.meta.url);

async function files(dir, prefix) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...await files(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`));
    else if (/\.(js|md|html)$/.test(entry.name)) out.push(`${prefix}${entry.name}`);
  }
  return out;
}

test('no user-facing string promises a later fix', async () => {
  const paths = [...await files(new URL('src/js/', repoRoot), 'src/js/'), ...await files(new URL('src/docs/', repoRoot), 'src/docs/')];
  assert.ok(paths.includes('src/js/views/guide.js') && paths.includes('src/docs/GUIDE.md'));
  for (const path of paths) {
    const text = await readFile(new URL(path, repoRoot), 'utf8');
    assert.doesNotMatch(text, /until\s+(that|this|it)\s+is\s+fixed/i, `${path} promises a later fix`);
  }
});

const read = (path) => readFile(new URL(path, repoRoot), 'utf8');
// Markdown wraps lines; compare prose with every run of whitespace as one space.
const prose = async (path) => (await read(path)).replace(/\s+/g, ' ');
const PRIVACY_DOCS = ['README.md', 'SECURITY.md', 'src/docs/GUIDE.md', 'src/js/views/guide.js'];
// Each document's own "what leaves" passage, so a fact elsewhere in the file
// cannot stand in for one missing from the privacy text.
const PRIVACY_SPANS = {
  'README.md': ['When an AI provider is configured, this is what still leaves the machine:', '## What works without an AI provider'],
  'SECURITY.md': ['- AI generation is disabled until', '- The child-view PIN'],
  'src/docs/GUIDE.md': ['- Nothing leaves your devices unless', '- Harrington has no user accounts'],
  'src/js/views/guide.js': ["'What leaves your home', `", '`],'],
};
async function privacyText(path) {
  const text = await read(path);
  const [from, to] = PRIVACY_SPANS[path];
  const a = text.indexOf(from);
  assert.ok(a !== -1, `${path}: privacy passage not found`);
  const b = text.indexOf(to, a + from.length);
  assert.ok(b !== -1, `${path}: end of privacy passage not found`);
  return text.slice(a, b).replace(/\s+/g, ' ');
}

test('Insights hints point at routes that exist, not the removed timeline', async () => {
  const insights = await read('src/js/views/insights.js');
  assert.doesNotMatch(insights, /timeline/i);
  assert.match(insights, /Pass the topic and section checks on the topic pages first\./);
  assert.match(insights, /mark some topics mastered from the map or a topic page/);
});

test('every privacy document lists each request that sends topic text', async () => {
  for (const path of PRIVACY_DOCS) {
    const text = (await privacyText(path)).toLowerCase();
    for (const kind of ['lessons', 'printables', 'activities', 'explain simply', 'mini-quizzes', 'recall cards', 'tests', 'challenges']) {
      assert.ok(text.includes(kind), `${path} omits ${kind}`);
    }
  }
});

test('privacy documents agree with ai.js on ages, the excelling flag and nicknames', async () => {
  for (const path of PRIVACY_DOCS) {
    const text = await privacyText(path);
    // A linked analysis sends the topic's age and the exact age, not one "instead" of the other.
    assert.doesNotMatch(text, /exact age instead/, `${path} says "instead"`);
    assert.match(text, /alongside (the|a) linked topic['’]s age/, `${path} omits the linked topic's age`);
    assert.match(text, /excelling/, `${path} omits the adaptive excelling flag`);
    assert.match(text, /a nickname, especially one that is an ordinary word/, `${path} drops the nickname caveat`);
    assert.match(text, /[Rr]ecord titles/, `${path} omits that record titles stay home`);
  }
  const ai = await read('src/js/ai.js');
  assert.match(ai, /This child is excelling here/, 'the flag the documents describe is still sent');
  assert.doesNotMatch(ai, /interests/i, 'interests never reach a prompt');
});

test('the HAR-19 behavior itself is in the changelog, not only the copy fix', async () => {
  const changelog = await prose('CHANGELOG.md');
  assert.match(changelog, /Learner names no longer reach the AI provider from the prompts, and parent notes reach it only when the parent opts in\..*\(HAR-19\)/);
  assert.doesNotMatch(changelog, /parent notes no longer reach the AI provider/);
});

test('SECURITY.md and the guides keep lines within 80 columns', async () => {
  for (const path of ['SECURITY.md', 'src/docs/GUIDE.md']) {
    for (const [i, line] of (await read(path)).split('\n').entries()) {
      // A lone link that cannot be broken is allowed to run over.
      if (/^\s*\S+$/.test(line)) continue;
      assert.ok(line.length <= 80, `${path}:${i + 1} is ${line.length} columns`);
    }
  }
});

test('CONTRIBUTING no longer says AI is disabled until self-hosted adapters exist', async () => {
  assert.doesNotMatch(await prose('CONTRIBUTING.md'), /disabled until|self-hosted adapters?/i);
});

// A pinned template phrase, allowing each ${...} to be wrapped in esc() (#32).
function pinned$(phrase) {
  const parts = phrase.split(/(\$\{[^}]*\})/);
  return new RegExp(parts.map((part) => {
    const m = /^\$\{(.*)\}$/.exec(part);
    const quote = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return m ? `\\$\\{(?:esc\\()?${quote(m[1])}\\)?\\}` : quote(part);
  }).join(''));
}

test('counts in the views agree with their number ("1 topic", never "1 topics")', async () => {
  const { countLabel } = await import('../src/js/format.js');
  assert.equal(countLabel(1, 'topic'), '1 topic');
  assert.equal(countLabel(0, 'topic'), '0 topics');
  assert.equal(countLabel(12, 'point'), '12 points');
  const pinned = {
    'src/js/views/topic.js': ["(${countLabel(sec.topics.length, 'topic')})", "${formatCount(stats.mastered)}/${countLabel(stats.total, 'topic')}"],
    'src/js/views/masterytest.js': [
      "${formatCount(secStats.mastered)} of ${countLabel(secStats.total, 'topic')} in this section marked mastered.",
      "${formatCount(stats.mastered)} of ${countLabel(stats.total, 'topic')} marked mastered (${stats.pct}%).",
      "${formatCount(graded.earned)} of ${countLabel(graded.total, 'point')}",
    ],
    'src/js/views/dashboard.js': ["${formatCount(stats.totalMastered)} of ${countLabel(stats.total, 'topic')} mastered"],
    'src/js/alerts.js': [
      "The last record was ${countLabel(Math.floor((now - last) / DAY_MS), 'day')} ago.",
      "Backup older than ${countLabel(BACKUP_DAYS, 'day')}",
      "The newest backup is ${countLabel(backupAgeDays, 'day')} old.",
    ],
  };
  for (const [path, phrases] of Object.entries(pinned)) {
    const text = await read(path);
    for (const phrase of phrases) assert.match(text, pinned$(phrase), `${path} lost: ${phrase}`);
    assert.doesNotMatch(text, /\$\{[^}]*(total|length|DAY_MS\)|_DAYS|Days)\} (topics|points|days)\b/, `${path} has an unpluralized count`);
  }
});

test('the shared-mode Guide never restores the single-computer claims', async () => {
  const { installFakeDom } = await import('./support/fake-dom.mjs');
  installFakeDom();
  const { setHosting } = await import('../src/js/hosting.js');
  const { features, guideSections } = await import('../src/js/views/guide.js');
  const allText = () => [
    ...features().map((f) => `${f.title} ${f.tagline} ${f.body}`),
    ...guideSections().flatMap((s) => [s.h, ...s.items.flat()]),
  ].join('\n');
  try {
    for (const authEnabled of [true, false]) {
      setHosting({ host: 'network', authEnabled, signedIn: authEnabled });
      const text = allText();
      assert.doesNotMatch(text, /this computer only/i, `shared, token ${authEnabled}`);
      assert.doesNotMatch(text, /leaves your home/i, `shared, token ${authEnabled}`);
      // The longer what-leaves wording survives inside the shared branch.
      assert.match(text, /What leaves your devices/);
      assert.match(text, /a nickname, especially one that is an ordinary word/);
      assert.match(text, /alongside the linked topic’s age/);
    }
    // With a token, nothing may say there is no sign-in. Without one, #34's
    // "There is no account and no sign-in" is true and stays.
    setHosting({ host: 'network', authEnabled: true, signedIn: true });
    assert.doesNotMatch(allText(), /no sign-in/i);
    setHosting({ host: 'loopback' });
    assert.match(allText(), /What leaves your home/, 'the single-computer label is unchanged');
  } finally {
    setHosting({ host: 'loopback' });
  }
});

test('no guide says AI buttons "show an error"; they show the provider chip', async () => {
  for (const path of ['src/docs/GUIDE.md', 'src/js/views/guide.js', 'README.md']) {
    const text = await prose(path);
    assert.doesNotMatch(text, /nothing else happens/, path);
    assert.doesNotMatch(text, /buttons show an error/, path);
  }
  // The GUIDE.md sentence is in a blockquote, so drop the "> " line markers first.
  const guide = (await prose('src/docs/GUIDE.md')).replace(/ > /g, ' ');
  assert.match(guide, /those buttons show a "Needs a local AI provider" chip instead/);
});

test('README and SECURITY keep the name-replacement limits ai.js actually has', async () => {
  for (const path of ['README.md', 'SECURITY.md']) {
    const text = await privacyText(path);
    assert.match(text, /one-letter name is not replaced/, `${path} drops the one-letter limit`);
    assert.match(text, /without spaces \(for example Chinese\)/, `${path} drops the unspaced-script limit`);
    // The old claims: replacement is best effort, so names are not "never sent".
    assert.doesNotMatch(text, /learner names, birth months? (and|or) years?,? (and )?interests[^.]* are never\s+sent/i, `${path} claims names are never sent`);
  }
  // The limits are real: ai.js skips one-letter names and needs a word boundary.
  const { redactNames } = await import('../src/js/ai.js');
  assert.equal(redactNames('J said hi', ['J']), 'J said hi');
  assert.equal(redactNames('小龍說', ['小龍']), '小龍說');
});

test('user-facing copy, AI prompts and contributor docs use Australian English (HAR-68)', async () => {
  for (const path of ['src/js/ai.js', 'CONTRIBUTING.md', '.github/pull_request_template.md']) {
    const text = await read(path);
    assert.match(text, /Australian English/, `${path} must require Australian English`);
    assert.doesNotMatch(text, /American English/, `${path} must not mention American English`);
  }
  const viewPaths = await files(new URL('src/js/views/', repoRoot), 'src/js/views/');
  const targets = [
    'src/js/ai.js',
    'src/js/graph.js',
    'src/js/resources.js',
    ...viewPaths,
    'src/docs/GUIDE.md',
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'docs/DEPLOYMENT.md',
  ];
  const usSpelling = /\b(American English|colored|coloring|organi[z]e[ds]?|organizing|labeled|favorites?|favored|favoring|neighbors?|artifacts?|Analyze)\b/;
  for (const path of targets) {
    const text = await read(path);
    const match = usSpelling.exec(text);
    assert.equal(match, null, `${path} contains US spelling "${match?.[0]}"`);
  }
});
