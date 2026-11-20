import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

// DOM-level checks of the "Include my notes in this request" opt-in that the
// Insights progress review and the Records/Recordings analyze buttons share.
installFakeDom();
const { privacyControls, analysisOptIn } = await import('../src/js/views/recordings.js');

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');
const button = () => document.createElement('button');
const LABEL = 'Include my notes in this request';

test('the opt-in is a 20 px box inside a label, so the whole line is the hit area', () => {
  const controls = privacyControls({ hasNotes: true });
  const box = controls.querySelector('.include-notes');
  assert.equal(box.type, 'checkbox');
  assert.ok(box.classList.contains('w-5') && box.classList.contains('h-5'), 'w-5 h-5 is 20 px');
  assert.equal(box.checked, false, 'notes stay home by default');
  const label = box.closest('label');
  assert.ok(label, 'the checkbox sits inside its label');
  assert.equal(label.textContent.trim(), LABEL);
  label.click();
  assert.equal(box.checked, true, 'a tap on the label text ticks the box');
});

test('without notes there is no checkbox, only the redaction line', () => {
  const controls = privacyControls({ hasNotes: false });
  assert.equal(controls.querySelector('.include-notes'), null);
  assert.match(controls.textContent, /replaced with “the child” before this is sent/);
});

test('placement picks the margin: after a button by default, before the review on Insights', async () => {
  const after = privacyControls({ hasNotes: true });
  assert.ok(after.classList.contains('mt-2') && !after.classList.contains('mb-3'));
  const before = privacyControls({ hasNotes: true, placement: 'before' });
  assert.ok(before.classList.contains('mb-3') && !before.classList.contains('mt-2'));
  const insights = await source('src/js/views/insights.js');
  assert.match(insights, /privacyControls\(\{[^}]*placement: 'before'/);
  assert.doesNotMatch(insights, /classList\.replace\(/);
});

test('Records analyze: notes only, the button waits for the opt-in and says why', () => {
  const btn = button();
  let ran = null;
  const controls = analysisOptIn(btn, { transcript: '', note: 'counted to 12' }, (include) => { ran = include; });
  const hint = controls.querySelector('p.text-ink-soft');
  assert.equal(btn.disabled, true);
  assert.equal(hint.hidden, false);
  assert.equal(hint.textContent, 'Tick “Include my notes” to analyse your notes.');

  controls.querySelector('label').click();
  assert.equal(btn.disabled, false);
  assert.equal(hint.hidden, true);
  btn.click();
  assert.equal(ran, true, 'the analysis runs with the notes included');
});

test('Records analyze: a transcript can be analyzed without sending the notes', () => {
  const btn = button();
  let ran = null;
  const controls = analysisOptIn(btn, { transcript: 'Five apples', note: 'a note' }, (include) => { ran = include; });
  assert.equal(btn.disabled, false);
  btn.click();
  assert.equal(ran, false);
  controls.querySelector('.include-notes').click();
  btn.click();
  assert.equal(ran, true);
});

test('Records analyze: nothing to analyze leaves the button off with a visible reason', () => {
  const btn = button();
  const controls = analysisOptIn(btn, { transcript: ' ', note: '' }, () => assert.fail('must not run'));
  assert.equal(controls.querySelector('.include-notes'), null);
  assert.equal(btn.disabled, true);
  assert.equal(controls.querySelector('p.text-ink-soft').textContent, 'Add a transcript or notes to analyse.');
  btn.click();
});
