import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installFakeDom } from './support/fake-dom.mjs';

installFakeDom();
const { EXTRAS_CAP, renderDayExtras } = await import('../src/js/views/calendar.js');

test('renderDayExtras caps large days (e.g. 600 extras) behind a Show all button (HAR-42)', () => {
  const list = document.createElement('div');
  const extras = Array.from({ length: 600 }, (_, i) => ({ id: `x_${i}`, title: `Extra ${i}` }));
  const makeRow = (x) => {
    const row = document.createElement('div');
    row.className = 'extra-row';
    row.textContent = x.title;
    return row;
  };

  let expandedCount = 0;
  renderDayExtras(list, extras, {
    renderRow: makeRow,
    onExpand: () => { expandedCount += 1; },
  });

  const rows = () => list.children.filter((n) => n.className === 'extra-row');
  assert.equal(EXTRAS_CAP, 10);
  assert.equal(rows().length, EXTRAS_CAP);
  const btn = list.querySelector('#show-all-extras');
  assert.ok(btn, 'Show all button is rendered when extras exceed the cap');
  assert.equal(btn.textContent, 'Show all (590 more)');

  btn.onclick();
  assert.equal(expandedCount, 1);
  assert.equal(rows().length, 600);
  assert.equal(list.querySelector('#show-all-extras'), null);
});

test('renderDayExtras renders all rows directly when at or below the cap', () => {
  const list = document.createElement('div');
  const extras = Array.from({ length: 4 }, (_, i) => ({ id: `x_${i}`, title: `Extra ${i}` }));
  const makeRow = (x) => {
    const row = document.createElement('div');
    row.textContent = x.title;
    return row;
  };
  renderDayExtras(list, extras, { renderRow: makeRow });
  assert.equal(list.children.length, 4);
  assert.equal(list.querySelector('#show-all-extras'), null);
});
