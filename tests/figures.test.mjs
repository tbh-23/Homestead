// The "See how it works" figures (HAR-34). The pages under src/figures/ run in
// a child's browser, so they must stay self-contained and carry no link,
// product name or credit line; every page must meet the contract
// (src/js/figures/contract.js) so the server lists it with no other change;
// pages built from tools/figures/ must match their sources; and the engine
// must keep its MIT notice. Behavior (pressing buttons, no console errors, the
// iframe on the topic page and in the child view) is in tests/e2e/figures.spec.mjs.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { APP_CSP, ENGINE_NOTICE, FIGURE_CSP, contentPolicyFor, figureIdOf, figureLabels, figureMeta, figureProblems } from '../src/js/figures/contract.js';
import { buildAll, sourceIds } from '../scripts/build-figures.mjs';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

async function filesUnder(dir) {
  const out = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...await filesUnder(`${dir}${entry.name}/`));
    else out.push(`${dir}${entry.name}`);
  }
  return out;
}

test('no file under src/figures/ has a URL, a product name, a credit line or an external script', async () => {
  const files = await filesUnder('src/figures/');
  assert.ok(files.length >= 3, `expected the figure pages, found ${files.length}`);
  for (const file of files) {
    const text = await read(file);
    assert.doesNotMatch(text, /https?:\/\//i, `${file} has a URL`);
    assert.doesNotMatch(text, /colorfigures/i, `${file} names Colorfigures`);
    assert.doesNotMatch(text, /april-zhu/i, `${file} names april-zhu`);
    assert.doesNotMatch(text, /made with/i, `${file} has a "Made with" credit`);
    assert.doesNotMatch(text, /<script[^>]*\ssrc\s*=/i, `${file} loads a script`);
  }
});

test('every page in src/figures/ meets the contract, and built pages match their sources', async () => {
  for (const name of await readdir(new URL('src/figures/', root))) {
    assert.deepEqual(figureProblems(name, await read(`src/figures/${name}`)), [], name);
  }
  // A page built from tools/figures/ and then edited by hand, or a stale one, fails here: run `npm run build:figures`.
  assert.deepEqual(await buildAll({ check: true }), []);
  assert.ok((await sourceIds()).length >= 3);
});

// A minimal page that meets the contract; each case below breaks one rule.
const GOOD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Toy &amp; cart</title>
<meta name="description" content="Push the cart, then pull it back.">
</head><body><script>
${ENGINE_NOTICE}
function mountFigure(){}
</script><script>
const scene = () => tag([0,0,0], 1, 1, 'PUSH', true) + tag([0,0,0], 1, 1, 'ROPE') + tag([0,0,0], 1, 1, 'HEAVY BLOCK');
mountFigure({ title: 'Toy cart' });
</script></body></html>`;

test('the contract accepts a good page and names each broken rule', () => {
  assert.deepEqual(figureProblems('mt_B3W5EfimJw.html', GOOD), []);
  assert.deepEqual(figureMeta(GOOD), { title: 'Toy & cart', hint: 'Push the cart, then pull it back.' });
  assert.deepEqual(figureLabels(GOOD), ['PUSH', 'ROPE', 'HEAVY BLOCK']);
  // Labels in a conditional, in double quotes, or next to a call in another argument all count;
  // the engine's own definition and a bare tag() add nothing.
  const tricky = `tag([1, 2, 3], 4, -5, st.cut ? 'CUT WIRE' : 'WIRE', st.on) + tag(p, dx(1, 2), dy, "BULB");
    function tag(p3, dx, dy, text, on=false){} tag(); tag(a, b, c, 'BATTERY', f(1, 'x'));`;
  assert.deepEqual(figureLabels(tricky), ['CUT WIRE', 'WIRE', 'BULB', 'BATTERY']);
  const cases = [
    ['cart.html', GOOD, 'file name'],
    ['mt_B3W5EfimJw.htm', GOOD, 'file name'],
    ['mt_../x.html', GOOD, 'file name'],
    ['mt_B3W5EfimJw.html', GOOD + ' '.repeat(100 * 1024), 'bytes'],
    ['mt_B3W5EfimJw.html', GOOD.replace(/<title>[^<]*<\/title>/, ''), '<title>'],
    ['mt_B3W5EfimJw.html', GOOD.replace(/<meta name="description"[^>]*>/, ''), 'hint'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<a href="https://example.org">x</a></body>'), 'URL'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<p>Made with care</p></body>'), 'Made with'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<!-- Colorfigures --></body>'), 'Colorfigures'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<script src="engine.js"></script></body>'), 'script src'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</head>', '<link rel="stylesheet" href="x.css"></head>'), '<link>'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<iframe></iframe></body>'), '<iframe>'],
    ['mt_B3W5EfimJw.html', GOOD.replace(ENGINE_NOTICE, ''), 'notice'],
    ['mt_B3W5EfimJw.html', GOOD.replaceAll('mountFigure(', 'mount('), 'mountFigure'],
    ['mt_B3W5EfimJw.html', GOOD.replace("'ROPE'", "'PUSH'").replace("'HEAVY BLOCK'", "'PUSH'"), 'labels'],
    ['mt_B3W5EfimJw.html', GOOD.replace("'ROPE'", "'Rope'"), 'capital'],
    ['mt_B3W5EfimJw.html', GOOD.replace("'ROPE'", "st.cut ? 'CUT ROPE' : 'rope'"), 'capital'],
    ['mt_B3W5EfimJw.html', GOOD.replace("'ROPE'", "'PRECIPITATION RECORDER'"), 'longer than 20'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', "<script>location.href = '//example.org/x';</script></body>"), 'protocol-relative'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<img src=//example.org/x.png></body>'), 'protocol-relative'],
    ['mt_B3W5EfimJw.html', GOOD.replace('</body>', '<div style="background:url(//example.org/x.png)"></div></body>'), 'protocol-relative'],
  ];
  // Long words are fine (up to 20 characters a label), and so are comments that start with //.
  assert.deepEqual(figureProblems('mt_B3W5EfimJw.html', GOOD.replace("'ROPE'", "'PRECIPITATION'").replace('</script></body>', '// a comment\n</script></body>')), []);
  for (const [name, html, expected] of cases) {
    const problems = figureProblems(name, html);
    assert.ok(problems.some((p) => p.includes(expected)), `${expected}: ${problems.join(' | ') || 'no problem found'}`);
  }
  assert.equal(figureIdOf('mt_B3W5EfimJw.html'), 'mt_B3W5EfimJw');
  assert.equal(figureIdOf('mt_DA7-JYRvtP.html'), 'mt_DA7-JYRvtP');
  assert.equal(figureIdOf('index.html'), null);
});

test('the engine keeps its MIT notice, and a built page carries the pointer and its source header', async () => {
  const engine = await read('src/js/figures/engine.js');
  assert.match(engine, /MIT License/);
  assert.match(engine, /Permission is hereby granted, free of charge/);
  assert.match(engine, /Copyright \(c\) 2026 Tolga Cohce/);
  for (const id of await sourceIds()) {
    const source = await read(`tools/figures/${id}.js`);
    const meta = figureMeta(await read(`src/figures/${id}.html`));
    assert.equal(meta.title, /^\/\/ title: (.+)$/m.exec(source)[1].trim(), `${id} title`);
    assert.equal(meta.hint, /^\/\/ hint: (.+)$/m.exec(source)[1].trim(), `${id} hint`);
  }
});

test('figureFor is null for every topic until the list has loaded, and for an unknown topic after', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ figures: [
    { id: 'mt_B3W5EfimJw', title: 'Toy cart', hint: 'Push it.' },
    { id: '../evil', title: 'x', hint: 'y' },
    { id: 'mt_noTitle', title: '', hint: 'y' },
  ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const { figureFor, loadFigures } = await import(`../src/js/figures/index.js?t=${Date.now()}`);
    assert.equal(figureFor('mt_B3W5EfimJw'), null);
    await loadFigures();
    assert.deepEqual(figureFor('mt_B3W5EfimJw'), { id: 'mt_B3W5EfimJw', title: 'Toy cart', hint: 'Push it.', src: 'figures/mt_B3W5EfimJw.html' });
    assert.equal(figureFor('../evil'), null);
    assert.equal(figureFor('mt_noTitle'), null);
    assert.equal(figureFor('mt_none'), null);
    assert.equal(figureFor(undefined), null);
    // A server that fails leaves no figures and throws nothing.
    globalThis.fetch = async () => new Response('{}', { status: 500 });
    await loadFigures();
    assert.equal(figureFor('mt_B3W5EfimJw'), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the server policy: only the app shell is unsandboxed, whatever the case or separator of a path', () => {
  assert.equal(contentPolicyFor('index.html'), APP_CSP);
  assert.equal(contentPolicyFor('INDEX.HTML'), APP_CSP);
  // On macOS and Windows these name the same file as figures/mt_x.html; all are figures.
  for (const path of ['figures/mt_x.html', 'Figures/mt_x.html', 'FIGURES/mt_x.html', 'FiGuReS/MT_X.HTML', 'figures\\mt_x.html',
    'figures/notes.txt', 'other.html', 'docs/page.htm', 'js/../figures/x.html']) {
    assert.equal(contentPolicyFor(path), FIGURE_CSP, path);
  }
  for (const path of ['js/app.js', 'css/styles.css', 'vendor/lucide.min.js', 'docs/GUIDE.md']) assert.equal(contentPolicyFor(path), null, path);
  for (const directive of ["default-src 'self'", "script-src 'self' 'sha256-", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'self'", "frame-src 'self'"]) {
    assert.ok(APP_CSP.includes(directive), `${directive} in ${APP_CSP}`);
  }
  assert.match(FIGURE_CSP, /default-src 'none'/);
  assert.match(FIGURE_CSP, /sandbox allow-scripts/);
  assert.doesNotMatch(FIGURE_CSP, /allow-same-origin/);
});
