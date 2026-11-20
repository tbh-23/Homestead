import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { unescapedInterpolations } from './support/templates.mjs';

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');
const importSource = async (path) => {
  const code = await source(path);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('the Harrington runtime has no Puter dependency', async () => {
  const runtimePaths = [
    'package.json',
    'src/index.html',
    'src/js/app.js',
    'src/js/backend.js',
    'src/js/store.js',
    'src/js/recorder.js',
    'src/js/ai.js',
    'src/js/coop.js',
    'src/js/graph.js',
    'src/js/views/graph.js',
    'src/js/mastery.js',
    'server.mjs',
  ];
  const runtimeSources = await Promise.all(runtimePaths.map(source));

  for (let index = 0; index < runtimeSources.length; index += 1) {
    assert.doesNotMatch(
      runtimeSources[index],
      /\bputer\b/i,
      `${runtimePaths[index]} still contains a Puter runtime reference`,
    );
  }
});

test('the browser starts in a private family workspace without sign-in', async () => {
  const [app, store, shell] = await Promise.all([
    source('src/js/app.js'),
    source('src/js/store.js'),
    source('src/js/views/shell.js'),
  ]);

  assert.doesNotMatch(app, /renderSignIn|sign in to begin/i);
  assert.match(store, /username:\s*'Family'/);
  assert.match(shell, /Private family space/);
  assert.doesNotMatch(shell, /Sign out/);
});

test('unmigrated connected features fail closed', async () => {
  const [ai, backend, coopSource, coop] = await Promise.all([
    source('src/js/ai.js'),
    source('src/js/backend.js'),
    source('src/js/coop.js'),
    importSource('src/js/coop.js'),
  ]);

  assert.match(ai, /backend\.chat/);
  assert.doesNotMatch(ai, /https?:\/\//);
  assert.match(backend, /\/api\/ai/);
  assert.match(coopSource, /not available in the self-hosted preview/i);
  assert.doesNotMatch(coopSource, /https?:\/\//);
  for (const action of [
    () => coop.createPod(),
    () => coop.joinPod(),
    () => coop.myPods(),
    () => coop.shareCard(),
    () => coop.cardsSharedToMe(),
  ]) {
    await assert.rejects(action, /not available in the self-hosted preview/i);
  }
});

test('interface assets are served by Harrington instead of public CDNs', async () => {
  const [index, ui, data] = await Promise.all([
    source('src/index.html'),
    source('src/js/ui.js'),
    source('src/js/data.js'),
  ]);

  assert.doesNotMatch(index, /cdn\.tailwindcss\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.doesNotMatch(ui, /cdn\.jsdelivr\.net|https?:\/\//);
  assert.doesNotMatch(data, /cdn\.jsdelivr\.net/);
  assert.match(data, /\/api\/taxonomy/);
  assert.match(index, /css\/tailwind\.css/);
  assert.match(index, /vendor\/lucide\.min\.js/);
});

test('src/index.html loads only self-hosted scripts and has no iframe telemetry shim', async () => {
  const index = await source('src/index.html');

  assert.doesNotMatch(index, /postMessage|window\.parent/, 'src/index.html must not contain iframe postMessage telemetry');
  assert.doesNotMatch(index, /\bwindow\.onerror\b|\bwindow\.onunhandledrejection\b/, 'src/index.html must not install global error telemetry');
  const scriptOpens = index.match(/<script\b[^>]*>/gi) || [];
  const scriptBlocks = index.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  assert.equal(scriptOpens.length, scriptBlocks.length, 'every <script> tag in src/index.html must be closed');
  assert.deepEqual(scriptBlocks, [
    '<script src="vendor/lucide.min.js"></script>',
    '<script type="module" src="js/app.js"></script>',
  ]);
});

test('views and recorder escape learner, record and taxonomy strings with the shared esc()', async () => {
  const sharedImport = /import \{[^}]*\besc\b[^}]*\} from '\.\.\/ui\.js';/;
  const localCopy = /(?:function\s+esc\s*\(|(?:const|let|var)\s+esc\s*=)/;
  // Sanity-check that localCopy catches both function declarations and arrow/variable copies.
  for (const hit of ['function esc(s) {}', 'function esc (s) {}', 'const esc = (s) => s;', 'let esc = s => s;', 'var esc = fn;']) {
    assert.match(hit, localCopy);
  }
  for (const safe of ["import { el, esc } from '../ui.js';", 'const escaped = esc(x);']) {
    assert.doesNotMatch(safe, localCopy);
  }

  // Every view under src/js/views/.
  const views = [
    'bookprint', 'books', 'calendar', 'challenge', 'childtopic', 'coverage',
    'dashboard', 'find', 'graph', 'guide', 'guideprint', 'howitworks', 'insights',
    'kidmode', 'learner', 'lesson', 'levelset', 'masterytest', 'notifications',
    'observation', 'placement', 'practice', 'printables', 'recall',
    'recordings', 'records', 'settings', 'shell', 'teachingguide', 'topic',
  ];
  for (const name of views) {
    const code = await source(`src/js/views/${name}.js`);
    assert.match(code, sharedImport, `views/${name}.js does not import esc from ../ui.js`);
    assert.doesNotMatch(code, localCopy, `views/${name}.js still defines a local esc copy`);
  }

  const recorder = await source('src/js/recorder.js');
  assert.match(recorder, /import \{[^}]*\besc\b[^}]*\} from '\.\/ui\.js';/, 'recorder.js does not import esc from ./ui.js');
  assert.doesNotMatch(recorder, localCopy, 'recorder.js still defines a local esc copy');
});

test('esc() and coverageClaimField() neutralise markup and attribute breakouts', async () => {
  const { esc } = await importSource('src/js/ui.js');
  const { coverageClaimField } = await import('../src/js/recorder.js');
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc(`"a" & 'b'`), '&quot;a&quot; &amp; &#39;b&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(7), '7');

  const claim = coverageClaimField([
    { id: 't1', name: '<img src=x onerror=alert(1)>' },
    { id: 't2', name: `"a" & 'b'` },
  ]);
  assert.doesNotMatch(claim, /<(?!\/?(?:label|input|span|strong)\b)/);
  assert.match(claim, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(claim, /&quot;a&quot; &amp; &#39;b&#39;/);
});

// Markup templates in these files interpolate only escaped values (HAR-11):
// esc(), analysisHtml(), ratingStars(), a number, a ternary or .map().join()
// of literal templates, a call to a listed helper that builds its markup from
// constants (meadow.js icons and rings, a view's own stat box), or a listed
// expression. A new `${t.name}` in markup fails here.
const MEADOW = ['meadowScene', 'petalRing', 'weekFlower', 'growthIcon', 'growthChip'];
const ESCAPED_MARKUP = {
  'src/js/recorder.js': {
    allowed: ['coverageClaimField(coverageTopics)'], // escapes each name; tested above and in daily.test.mjs
  },
  'src/js/views/records.js': {
    allowed: ["coverageNames(r).map(esc).join(' · ')", 'coverageClaimField(coverageTopics)'],
  },
  'src/js/views/recordings.js': {},
  'src/js/views/dashboard.js': {
    helpers: [...MEADOW, 'stop'],
    // Markup built a few lines above from escaped values; `empty` is one of
    // two constant sentences.
    allowed: ['stopHtml', "parts.join(' · ')", 'flowers', 'empty'],
  },
  'src/js/views/topic.js': {
    helpers: MEADOW,
    allowed: ['extra'], // section()'s header buttons, constant markup from the records section
  },
  'src/js/views/insights.js': { helpers: [...MEADOW, 'statBox'] },
  'src/js/views/challenge.js': {},
  'src/js/views/childtopic.js': { helpers: MEADOW },
  'src/js/views/coverage.js': {},
  'src/js/views/howitworks.js': {
    allowed: ['FRAME_HEIGHT[size] || FRAME_HEIGHT.normal'],
  },
  'src/js/views/observation.js': {},
  'src/js/views/practice.js': {},
  'src/js/views/teachingguide.js': {
    // label() and list() escape their text; the icons and class strings are constants.
    helpers: ['label', 'list', 'steps', 'creditLink', 'activityBlock', 'checkBlock', 'reteach'],
    // `activities` and `check` are built from those helpers just above.
    allowed: ['icon', 'summaryRow', 'MARBLE_HREF', 'LICENSE_HREF', 'activities', 'check', 'PRINT_BUTTON'], // PRINT_BUTTON: constant markup
  },
  'src/js/views/guideprint.js': {
    // The print page: list(), part(), para(), activity() and check() escape their text.
    helpers: ['list', 'part', 'para', 'activity', 'check'],
    // STYLE is the constant stylesheet; `errors`, `activities` and `checkPart`
    // are built from the helpers just above them; `partHtml` is part()'s
    // argument, always one of the helpers' results.
    allowed: ['STYLE', 'errors', 'partHtml', 'activities', 'checkPart'],
  },
};

test('learner, record and result markup interpolates only escaped values', async () => {
  for (const [path, { allowed = [], helpers = [] }] of Object.entries(ESCAPED_MARKUP)) {
    const unescaped = unescapedInterpolations(await source(path), new Set(allowed), helpers);
    assert.deepEqual(unescaped, [], `${path} interpolates unescaped values into markup (line: expression)`);
  }
});

test('the markup escaping check flags what it should and nothing else', () => {
  const flagged = (code) => unescapedInterpolations(code).map((hit) => hit.replace(/^\d+: /, ''));
  // Flagged: raw values, values next to an esc() call, values in nested markup.
  assert.deepEqual(flagged('el(`<span>${t.name}</span>`)'), ['t.name']);
  assert.deepEqual(flagged('el(`<b title="${esc(a) + b}">`)'), ['esc(a) + b']);
  assert.deepEqual(flagged('el(`<i>${on ? `x ${t.subject}` : \'\'}</i>`)'), ['t.subject']);
  assert.deepEqual(flagged('el(`<i>${on ? t.subject : \'\'}</i>`)'), ["on ? t.subject : ''"]);
  assert.deepEqual(flagged('el(`<i>${xs.map(x => x.name).join(\'\')}</i>`)'), ['xs.map(x => x.name).join(\'\')']);
  assert.deepEqual(flagged('el(`<i>${xs.map((x, i) => `<b data-i="${i}">${esc(x)}</b>`).join(\'\')}</i>`)'), ['i']);
  // Not flagged: escaped values, literal choices, non-markup templates.
  assert.deepEqual(flagged('el(`<span title="${esc(t.id)}">${esc(t.name)}</span>`)'), []);
  assert.deepEqual(flagged('el(`<i class="${on ? \'a\' : \'b\'}">${xs.map(x => `<b>${esc(x)}</b>`).join(\' \')}</i>`)'), []);
  assert.deepEqual(flagged('el(`<i>${xs.map((x, i) => `<b data-i="${esc(i)}">${esc(x)}</b>`).join(\'\')}</i>`)'), []);
  assert.deepEqual(flagged('const key = `${t.subject}|${t.domain}`;'), []);
  assert.deepEqual(flagged('el(`<i>${a ? \'x\' : b ? \'y\' : `z`}${90}</i>`)'), []);
  assert.deepEqual(flagged('el(`<i>${a ? \'x\' : b ? y : \'z\'}</i>`)'), ["a ? 'x' : b ? y : 'z'"]);
  assert.deepEqual(unescapedInterpolations('el(`<i>${ring(a)}${ring(a) + b}</i>`)', new Set(), ['ring']).map((h) => h.replace(/^\d+: /, '')), ['ring(a) + b']);
  // Comments, regex literals and strings with backticks or braces do not derail the scan.
  assert.deepEqual(flagged('// a `quoted` word\nconst re = /`{/g; const s = \'`}\';\nel(`<p>${t.name}</p>`)'), ['t.name']);
});

test('stored analysis HTML keeps only the tags toHtml() writes', async () => {
  const { analysisHtml } = await importSource('src/js/ui.js');
  const fine = '<h4>Summary</h4><p>Counted to <strong>ten</strong> &amp; <em>back</em>.</p><ul><li>a &lt;b&gt;</li></ul>';
  assert.equal(analysisHtml(fine), fine);
  // An imported document can carry any string here.
  const hostile = '<p onclick="x()">Hi</p><img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:x">y</a><svg/onload=z><!-- c --><p';
  const out = analysisHtml(hostile);
  assert.doesNotMatch(out, /<(?!\/?(?:p|h4|ul|li|strong|em)>)/, out);
  assert.equal(out, '&lt;p onclick=&quot;x()&quot;&gt;Hi</p>&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;'
    + '&lt;a href=&quot;javascript:x&quot;&gt;y&lt;/a&gt;&lt;svg/onload=z&gt;&lt;!-- c --&gt;&lt;p');
  assert.equal(analysisHtml('a > b <<p>c'), 'a &gt; b &lt;<p>c');
  assert.equal(analysisHtml(null), '');
  assert.equal(analysisHtml(7), '7');
});
