import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Every prompt leaves through backend.chat(), which POSTs to /api/ai. ES module
// exports cannot be reassigned, so the mock sits one step lower, on fetch: it
// records each /api/ai body (what backend.chat would send) and answers with a
// completion every builder can parse. Store saves and the taxonomy load are
// answered here too, so nothing reaches the network.
const sent = [];
const COMPLETION = JSON.stringify({ objective: 'ok', questions: [], results: [], cards: [], printables: [], materials: [] });
// A test can set the next reply; null means COMPLETION.
let nextCompletion = null;
const TAXONOMY = {
  'topics.json': { topics: [
    { id: 'count-to-5', name: 'Count to 5', subject: 'Mathematics', domain: 'Number', ageRangeStart: 4, ageRangeEnd: 6, description: 'Count five objects.', evidence: [] },
    { id: 'letter-sounds', name: 'Letter sounds', subject: 'English', domain: 'Phonics', ageRangeStart: 4, ageRangeEnd: 6, description: 'Say letter sounds.', evidence: [] },
  ] },
  'dependencies.json': { dependencies: [] },
};
globalThis.fetch = async (path, options = {}) => {
  const url = String(path);
  const json = (body, ok = true) => ({ ok, status: ok ? 200 : 404, headers: new Headers({ ETag: '"v1"' }), json: async () => body });
  if (url === '/api/ai') {
    sent.push(JSON.parse(options.body));
    return json({ content: nextCompletion ?? COMPLETION });
  }
  if (url.startsWith('/api/taxonomy/')) {
    const body = TAXONOMY[url.slice('/api/taxonomy/'.length)];
    return json(body || {}, !!body);
  }
  return json({});
};

const ai = await import('../src/js/ai.js');
const store = await import('../src/js/store.js');
const { loadTaxonomy } = await import('../src/js/data.js');
const { AI_CAPABILITIES } = await import('../src/js/ai-capabilities.js');
const { buildExplainPrompt, buildLessonPrompt, redactNames } = ai;

const repoRoot = new URL('..', import.meta.url);
const source = (path) => readFile(new URL(path, repoRoot), 'utf8');

const topic = {
  id: 'count-to-5',
  name: 'Count to 5',
  subject: 'Mathematics',
  domain: 'Number',
  ageRangeStart: 4,
  ageRangeEnd: 6,
  description: 'Count five objects.',
  evidence: ['Says numbers in order'],
};

// A fictional learner whose name cannot collide with prompt text.
const LEARNER = 'Zebulon Quixote';
const LEAK = /zebulon|quixote/i;
const NOTE_MARKER = 'tangerine-umbrella';
const sid = store.addStudent(LEARNER, 2019);
store.addStudent('Sample Nine', 2018); // a sibling; their name is redacted too
store.setActiveStudent(sid);

const transcript = `Parent: How many apples, Zebulon?\nZebulon: Five! That's Zebulon's answer.\nParent: Good, ZEBULON QUIXOTE. Sample said four.`;
const note = `${NOTE_MARKER}: Zebulon Quixote counted past five on his own.`;
const records = [
  { type: 'observation', rating: 4, note, title: 'Zebulon counted', topicName: 'Count to 5' },
  { type: 'question', rating: null, note: `${NOTE_MARKER} Quixote asked why`, title: '', topicName: 'Letter sounds' },
];
const stats = { mastered: 1, total: 4, pct: 25, inProgress: 2 };

const outgoing = () => sent.map(b => b.messages.map(m => m.content).join('\n')).join('\n');

// Every exported function that builds or sends a prompt, called with every
// name-bearing input it could be given (including stale `studentName` and
// `childName` arguments that callers used to pass).
const PROMPT_CALLS = {
  buildExplainPrompt: () => ai.buildExplainPrompt(topic, LEARNER),
  buildLessonPrompt: () => ai.buildLessonPrompt(topic, LEARNER),
  buildDiscussionPrompt: () => ai.buildDiscussionPrompt({ studentName: LEARNER, age: 6, topic, transcript, note, includeNotes: true }),
  buildFeedbackPrompt: () => ai.buildFeedbackPrompt({ studentName: LEARNER, age: 6, subject: 'Mathematics', stats, recentTopics: [{ name: 'Count to 5', status: 'learning' }], records, includeNotes: true }),
  aiExplain: () => ai.aiExplain(topic, LEARNER),
  aiQuiz: () => ai.aiQuiz(topic, LEARNER),
  aiLesson: () => ai.aiLesson(topic, LEARNER),
  aiPrintables: () => ai.aiPrintables(topic, LEARNER),
  aiActivityDetail: () => ai.aiActivityDetail(topic, { title: 'Apple count', body: 'Count apples together.' }, 'activity'),
  aiMasteryTest: () => ai.aiMasteryTest({ studentName: LEARNER, subject: 'Mathematics', age: 6, topicNames: ['Count to 5'], mode: 'digital', topic }),
  aiChallenge: () => ai.aiChallenge({ studentName: LEARNER, subject: 'Mathematics', age: 6, topic }),
  aiRecallCards: () => ai.aiRecallCards(topic, 6),
  verifyTest: () => ai.verifyTest({ questions: [{ type: 'multiple_choice', q: '2+3?', options: ['4', '5'], answer: 1 }] }),
  aiDiscussionAnalysis: async () => {
    await ai.aiDiscussionAnalysis({ studentName: LEARNER, age: 6, topic, transcript, note });
    await ai.aiDiscussionAnalysis({ studentName: LEARNER, age: 6, topic, transcript, note, includeNotes: true });
    await ai.aiDiscussionAnalysis({ studentName: LEARNER, age: 6, topic, transcript: '', note, includeNotes: true });
  },
  aiFeedback: async () => {
    await ai.aiFeedback({ studentName: LEARNER, age: 6, subject: 'Mathematics', stats, recentTopics: [], records });
    await ai.aiFeedback({ studentName: LEARNER, age: 6, subject: 'Mathematics', stats, recentTopics: [], records, includeNotes: true });
  },
};
// Exports that neither build nor send a prompt.
const NOT_PROMPTS = new Set(['promptAge', 'redactNames', 'redactLearnerNames', 'summarizeRecords']);

test('every exported prompt function is covered by the name guard', () => {
  const exported = Object.entries(ai).filter(([, v]) => typeof v === 'function').map(([k]) => k);
  const uncovered = exported.filter(k => !(k in PROMPT_CALLS) && !NOT_PROMPTS.has(k));
  assert.deepEqual(uncovered, [], 'add new prompt functions to PROMPT_CALLS in this test');
});

test(`no prompt function sends a learner name, with "${LEARNER}" in state`, async () => {
  for (const [name, call] of Object.entries(PROMPT_CALLS)) {
    sent.length = 0;
    const result = await call();
    if (name.startsWith('build')) {
      assert.equal(typeof result, 'string');
      assert.doesNotMatch(result, LEAK, `${name} interpolated a learner name`);
      assert.doesNotMatch(result, /Sample Nine|\bSample\b/, `${name} interpolated a sibling's name`);
    } else {
      assert.ok(sent.length > 0, `${name} sent nothing to backend.chat`);
      assert.doesNotMatch(outgoing(), LEAK, `${name} sent a learner name`);
      assert.doesNotMatch(outgoing(), /\bSample\b/, `${name} sent a sibling's name`);
      // Besides the messages and the capability, only the notes opt-in, and only as true.
      assert.ok(sent.every((body) => Object.keys(body).join() === 'messages,capability'
        || (Object.keys(body).join() === 'messages,capability,includeNotes' && body.includeNotes === true)), `${name} sent more than the messages and its capability`);
    }
  }
});

// The capability each prompt function declares on /api/ai (HAR-26). The
// server refuses a request without one, so a new builder must be listed here.
const CAPABILITY_OF = {
  aiExplain: ['explain'],
  aiQuiz: ['quiz'],
  aiLesson: ['lesson'],
  aiPrintables: ['printables'],
  aiActivityDetail: ['activity'],
  aiMasteryTest: ['test'],
  aiChallenge: ['challenge'],
  aiRecallCards: ['recall'],
  verifyTest: ['test'],
  aiDiscussionAnalysis: ['analysis'],
  aiFeedback: ['review'],
};

test('every prompt function declares its capability on every request', async () => {
  const senders = Object.keys(PROMPT_CALLS).filter(name => !name.startsWith('build'));
  assert.deepEqual(senders.filter(name => !(name in CAPABILITY_OF)), [], 'add new prompt functions to CAPABILITY_OF');
  for (const name of senders) {
    sent.length = 0;
    await PROMPT_CALLS[name]();
    assert.ok(sent.length > 0, `${name} sent nothing`);
    for (const body of sent) {
      assert.ok(AI_CAPABILITIES.includes(body.capability), `${name} sent capability ${JSON.stringify(body.capability)}`);
      assert.ok(CAPABILITY_OF[name].includes(body.capability), `${name} sent "${body.capability}", expected ${CAPABILITY_OF[name]}`);
    }
  }
  // A challenge's verification pass runs under "challenge", not "test".
  sent.length = 0;
  await ai.verifyTest({ questions: [{ type: 'multiple_choice', q: '2+3?', options: ['4', '5'], answer: 1 }] }, 'challenge');
  assert.deepEqual(sent.map(b => b.capability), ['challenge']);
  // Every capability the server knows is used by some prompt.
  const used = new Set(Object.values(CAPABILITY_OF).flat());
  assert.deepEqual(AI_CAPABILITIES.filter(c => !used.has(c)), []);
});

test('discussion analysis sends a redacted transcript and leaves notes out unless opted in', async () => {
  sent.length = 0;
  await ai.aiDiscussionAnalysis({ age: 6, topic, transcript, note });
  const withoutOptIn = outgoing();
  assert.match(withoutOptIn, /How many apples, the child\?/);
  assert.match(withoutOptIn, /That's the child's answer/);
  assert.match(withoutOptIn, /your child \(age 6\)/);
  assert.doesNotMatch(withoutOptIn, new RegExp(NOTE_MARKER), 'notes were sent without the opt-in');

  sent.length = 0;
  await ai.aiDiscussionAnalysis({ age: 6, topic, transcript, note, includeNotes: true });
  const withOptIn = outgoing();
  assert.match(withOptIn, new RegExp(`${NOTE_MARKER}: the child counted past five`));
  assert.doesNotMatch(withOptIn, LEAK);
});

test('a discussion with notes only and no opt-in sends no notes', () => {
  const prompt = ai.buildDiscussionPrompt({ age: 6, topic, transcript: '', note, includeNotes: false });
  assert.doesNotMatch(prompt, new RegExp(NOTE_MARKER));
  assert.match(prompt, /did not share a transcript or notes/);
});

test('progress review summarizes records as counts and topic names unless opted in', async () => {
  sent.length = 0;
  await ai.aiFeedback({ age: 6, subject: 'Mathematics', stats, recentTopics: [], records });
  const summary = outgoing();
  assert.match(summary, /2 records \(1 observation, 1 question\)/);
  assert.match(summary, /Topics they mention: Count to 5; Letter sounds/);
  assert.match(summary, /Average parent confidence rating: 4\.0\/5/);
  assert.doesNotMatch(summary, new RegExp(NOTE_MARKER));
  assert.doesNotMatch(summary, /counted/, 'record titles are parent text too');

  sent.length = 0;
  await ai.aiFeedback({ age: 6, subject: 'Mathematics', stats, recentTopics: [], records, includeNotes: true });
  const shared = outgoing();
  assert.match(shared, /The parent chose to share these notes/);
  assert.match(shared, new RegExp(`${NOTE_MARKER}: the child counted past five`));
  assert.doesNotMatch(shared, LEAK);
});

test('the notes opt-in reaches the server only when the parent ticked it', async () => {
  sent.length = 0;
  await ai.aiDiscussionAnalysis({ age: 6, topic, transcript, note, includeNotes: false });
  await ai.aiFeedback({ age: 6, subject: 'Mathematics', stats, recentTopics: [], records, includeNotes: false });
  await ai.aiExplain(topic);
  assert.ok(sent.every((body) => !('includeNotes' in body)));
  sent.length = 0;
  await ai.aiDiscussionAnalysis({ age: 6, topic, transcript, note, includeNotes: true });
  await ai.aiFeedback({ age: 6, subject: 'Mathematics', stats, recentTopics: [], records, includeNotes: true });
  assert.deepEqual(sent.map((body) => body.includeNotes), [true, true]);
});

test('redactNames replaces whole names, possessives and any case', () => {
  const names = ['Zebulon Quixote'];
  assert.equal(redactNames('Zebulon Quixote said hi', names), 'the child said hi');
  assert.equal(redactNames("zebulon's cup and QUIXOTE’s hat", names), "the child's cup and the child’s hat");
  assert.equal(redactNames('Zebulon\nQuixote', names), 'the child', 'a full name across a line break');
  assert.equal(redactNames('Ask Zebulon, then Zebulon.', names), 'Ask the child, then the child.');
  assert.equal(redactNames('', names), '');
  assert.equal(redactNames(null, names), '');
});

test('redactNames treats names that are common words as whole words only', () => {
  const names = ['Will', 'Rose'];
  assert.equal(redactNames('Will is willing; rose roses arose. Will’s turn.', names), 'the child is willing; the child roses arose. the child’s turn.');
  assert.equal(redactNames('Alexander and Xander', ['Xander']), 'Alexander and the child');
  assert.equal(redactNames('Dr. O(Neil)', ['O(Neil)']), 'Dr. the child', 'regex characters in a name are literal');
});

test('redactNames redacts nicknames in brackets or quotes, comma-joined names and control-separated words (HAR-41)', () => {
  assert.equal(redactNames('Xander counted to 20', ['Alexander (Xander) Quill']), 'the child counted to 20');
  assert.equal(redactNames('Alexander (Xander) Quill counted to 20', ['Alexander (Xander) Quill']), 'the child counted to 20');
  assert.equal(redactNames('Lizzy did well', ['Elizabeth "Lizzy" Fenn']), 'the child did well');
  assert.equal(redactNames('Lizzy did well', ["Elizabeth 'Lizzy' Fenn"]), 'the child did well');
  assert.equal(redactNames('Ivy and Rose read together', ['Ivy, Rose']), 'the child and the child read together');
  assert.equal(redactNames('Ada counted and Quill read', ['Ada\u0007Quill']), 'the child counted and the child read');
  assert.equal(redactNames('Ada\u0007Quill waved', ['Ada\u0007Quill']), 'the child waved');
  assert.equal(redactNames('Ada and Quill waved', ['Ada\x00Quill']), 'the child and the child waved');
  assert.equal(redactNames('Ada Quill waved', ['Ada\x00Quill']), 'the child waved');
  assert.equal(redactNames('Al knows al', ['Alexander (Al) Quill']), 'the child knows al');
});

// The independent review's stub transcript, row by row: spelling variants of a
// profile name must not leak.
const VARIANT_LEARNERS = ['Mary-Jane Smith', "Mia O'Neil", 'Zoë Park', 'José Ruiz'];
for (const [label, said, expected] of [
  ['hyphen spoken as a space', 'Say it again, Mary Jane.', 'Say it again, the child.'],
  ['hyphen dropped', 'MaryJane and mary-jane', 'the child and the child'],
  ['each half of a hyphenated name', 'Mary, then Jane.', 'the child, then the child.'],
  ['accent dropped', 'And Zoe? Zoe Park: nine!', 'And the child? the child: nine!'],
  ['accent dropped, first name only', 'Thank you Jose.', 'Thank you the child.'],
  ['decomposed accent', 'Zoë waved.', 'the child waved.'],
  ['precomposed accent kept elsewhere', 'Zoë’s café', 'the child’s café'],
  ['curly apostrophe in the name', 'and O’Neil too. Mia O’Neil laughed', 'and the child too. the child laughed'],
  ['straight apostrophe in the name', "Mia O'Neil's turn", "the child's turn"],
  ['apostrophe dropped', 'ONeil', 'the child'],
]) {
  test(`redactNames: ${label}`, () => {
    const out = redactNames(said, VARIANT_LEARNERS);
    assert.equal(out, expected);
    assert.doesNotMatch(out.normalize('NFD').replace(/\p{M}/gu, ''), /\b(mary|jane|zoe|jose|o.?neil|smith|ruiz)\b/i);
  });
}

test('one- and two-letter name parts match only capitalized or in capitals', () => {
  const names = ['An Nguyen', 'He Lin', 'Do Park'];
  assert.equal(redactNames('He said he would do it with an apple.', names), 'the child said he would do it with an apple.');
  assert.equal(redactNames('AN and Do', names), 'the child and the child');
  assert.equal(redactNames('an nguyen, nguyen', names), 'the child, the child', 'the full name and long parts stay any-case');
});

test('three-letter name parts match in any case', () => {
  const names = ['Leo Park', 'Sam Little', 'Zoë Park', "Mia O'Neil", 'He Lin'];
  assert.equal(redactNames('leo and sam ran; mia laughed and zoe waved', names), 'the child and the child ran; the child laughed and the child waved');
  assert.equal(redactNames('LEO, Sam, lin', names), 'the child, the child, the child');
});

test('a name after "the" does not read "the the child"', () => {
  assert.equal(redactNames('Ask the Child, then Child Harold.', ['Child Harold']), 'Ask the child, then the child.');
  assert.equal(redactNames('Then leo left', ['Leo']), 'Then the child left', '"Then" is not "the"');
});

test('a name straddling the transcript and notes limits is redacted before the cut', () => {
  for (const [cut, field] of [[4000, 'transcript'], [1500, 'note']]) {
    // The name starts five characters before the cut, so slicing first would leave "Zebul".
    const text = 'x'.repeat(cut - 6) + ' Zebulon Quixote and more';
    const prompt = ai.buildDiscussionPrompt({ age: 6, topic, transcript: field === 'transcript' ? text : 'hi', note: field === 'note' ? text : '', includeNotes: true });
    assert.doesNotMatch(prompt, /zeb|quix/i, `${field} leaked part of a name at the cut`);
  }
});

test('summarizeRecords never sends a title, even without a topic', () => {
  const summary = ai.summarizeRecords([{ type: 'observation', title: 'Zebulon at the park', note: '', topicName: null }]);
  assert.equal(summary, '1 record (1 observation). No linked topics.');
});

test('record titles stay home even when notes are opted in', () => {
  const prompt = ai.buildFeedbackPrompt({ age: 6, subject: 'Mathematics', stats, recentTopics: [], includeNotes: true,
    records: [{ type: 'observation', title: 'secret-title-marker', note: '', topicName: 'Count to 5' }] });
  assert.doesNotMatch(prompt, /secret-title-marker/);
  assert.doesNotMatch(prompt, /chose to share/);
});

test('a missing birth year reads "age unknown", never "age null"', () => {
  assert.equal(ai.promptAge(null), 'age unknown');
  assert.equal(ai.promptAge(7), 'age 7');
  const prompts = [
    ai.buildDiscussionPrompt({ age: null, topic, transcript: 'hi' }),
    ai.buildFeedbackPrompt({ age: null, subject: 'Mathematics', stats, recentTopics: [], records: [] }),
  ];
  for (const p of prompts) { assert.match(p, /age unknown/); assert.doesNotMatch(p, /age (null|undefined)/); }
});

test('a test or challenge for a learner with no age leaves the age clause out', async () => {
  const promptOf = async (call) => {
    const before = sent.length;
    await call();
    return sent[before].messages.map(m => m.content).join('\n');
  };
  const prompts = [
    await promptOf(() => ai.aiMasteryTest({ subject: 'Mathematics', age: null, topicNames: ['Count to 5'], mode: 'digital' })),
    await promptOf(() => ai.aiMasteryTest({ subject: 'Mathematics', age: null, topicNames: [], mode: 'physical' })),
    await promptOf(() => ai.aiChallenge({ subject: 'Mathematics', age: undefined, topic })),
  ];
  for (const p of prompts) {
    assert.doesNotMatch(p, /aged|for age|age-(null|undefined)|null|undefined/);
    assert.match(p, /for a child\b/);
  }
  assert.match(prompts[0], /FINAL MASTERY TEST for the subject "Mathematics" for a learner\. /);
  assert.match(prompts[0], /age-appropriate language/);
  assert.match(prompts[1], /Focus tightly on: core Mathematics skills\./);
  const known = await promptOf(() => ai.aiMasteryTest({ subject: 'Mathematics', age: 7, topicNames: [], mode: 'digital' }));
  assert.match(known, /for a learner aged 7\. /);
  assert.match(known, /core Mathematics skills for age 7/);
  assert.match(known, /age-7 language/);
});

test('redactLearnerNames covers every learner in state, not only the active one', () => {
  assert.equal(ai.redactLearnerNames('Zebulon and Sample Nine and Nine-pins'), 'the child and the child and the child-pins');
});

test('views stop passing the learner name into prompt builders', async () => {
  const [records, recordings, insights] = await Promise.all([
    source('src/js/views/records.js'),
    source('src/js/views/recordings.js'),
    source('src/js/views/insights.js'),
  ]);
  for (const src of [records, recordings, insights]) assert.doesNotMatch(src, /studentName/);
  // The opt-in is per request: both analysis views and the review read the box.
  assert.match(recordings, /Include my notes in this request/);
  assert.match(recordings, /Names of learners in this app are replaced with/);
  assert.match(records, /analysisOptIn\(/);
  assert.match(insights, /const includeNotes = !!privacy\.querySelector\('\.include-notes'\)\?\.checked/);
  assert.match(insights, /hasNotes: subjectRecords\(\)\.some\(r => \(r\.note \|\| ''\)\.trim\(\)\)/, 'titles alone do not offer the box');
  // A retry re-sends with the earlier choice, so the spinner and error say so.
  for (const src of [records, recordings, insights]) {
    assert.match(src, /\(notes included\)/);
    assert.match(src, /if \(includeNotes\) \w+\.appendChild\(notesIncludedLine\(\)\)/);
  }
});

test('lesson and explain prompts use a generic learner and age band, never a child name', () => {
  const secret = 'SecretChildXYZ';
  const lesson = buildLessonPrompt(topic, secret);
  const explain = buildExplainPrompt(topic, secret);

  for (const prompt of [lesson, explain]) {
    assert.doesNotMatch(prompt, new RegExp(secret));
    assert.match(prompt, /your child/i);
    assert.match(prompt, /ages 4-6/);
    assert.match(prompt, /Count to 5/);
  }
});

test('lesson generators and callers do not interpolate learner names into prompts', async () => {
  const [ai, lesson, printables, topicView] = await Promise.all([
    source('src/js/ai.js'),
    source('src/js/views/lesson.js'),
    source('src/js/views/printables.js'),
    source('src/js/views/topic.js'),
  ]);

  assert.match(ai, /buildLessonPrompt/);
  assert.doesNotMatch(ai, /childName \|\| 'your child'/);
  assert.doesNotMatch(ai, /childName \|\| 'a young learner'/);
  assert.doesNotMatch(ai, /studentName/);
  assert.doesNotMatch(lesson, /childName \|\| student\?\.name/);
  assert.doesNotMatch(printables, /aiPrintables\(topic, student\?\.name\)/);
  assert.doesNotMatch(topicView, /fn\(t, student\?\.name\)/);
  // Generation is gated in store.generateCached, which showGenerated wraps (see lesson-cache.test.mjs).
  assert.match(lesson, /showGenerated\(/);
  assert.doesNotMatch(lesson, /aiLesson\(topic\);\s*\n\s*await store\.saveCachedLesson/);
});

test('a mastery test keeps positive points and gives anything else 1, so a score always saves', async () => {
  nextCompletion = JSON.stringify({ title: 'T', questions: [
    { type: 'short_answer', q: 'Half a point', answer: 'a', points: 0.5 },
    { type: 'task', q: 'Text points', answer: 'b', points: 'two' },
    { type: 'short_answer', q: 'Negative', answer: 'c', points: -1 },
    { type: 'short_answer', q: 'None', answer: 'd' },
  ] });
  try {
    const test = await ai.aiMasteryTest({ subject: 'Mathematics', age: 6, topicNames: ['Count to 5'], mode: 'digital', topic });
    assert.deepEqual(test.questions.map((q) => q.points), [0.5, 1, 1, 1]);
  } finally {
    nextCompletion = null;
  }
});
