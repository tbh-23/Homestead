#!/usr/bin/env node
// A tiny OpenAI-compatible provider for the e2e suite. It answers
// POST /v1/chat/completions with deterministic content chosen by keywords in
// the prompt, in exactly the JSON shapes src/js/ai.js expects.
//
//   node tests/e2e/mock-ai-server.mjs [--port 4311]
//
// Test-only endpoints:
//   GET  /health        -> { ok: true }
//   GET  /__log         -> every completion request seen: [{ kind, prompt, model, at }]
//   DELETE /__log       -> clear the log
//   POST /__fail        -> { count } make the next `count` completions answer HTTP 500
//   DELETE /__fail      -> stop failing (cancel what is left of a POST /__fail
//                          and of a POST /__malformed)
//   POST /__malformed   -> { count } make the next `count` completions answer 200
//                          with JSON the app must reject (MALFORMED_LESSON)
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { PORTS } from './support/env.mjs';

// ---- Canned content (exported so specs can answer questions correctly) ----

// Topic / section / subject mastery tests: four arithmetic multiple-choice
// questions. `answer`, `answerText` and `verify` all point at the same option,
// so normalizeTest keeps them and the exam checker below agrees with the key.
// Well-formed JSON that is not a usable lesson (`materials` must be a list):
// what a model that ignores the schema sends back.
export const MALFORMED_LESSON = { objective: 'x', teach: [{ title: 'a', say: 'b' }], materials: 'paper' };

export const MASTERY_QUESTIONS = [
  { q: 'What is 2 + 3?', options: ['4', '5', '6', '7'], answer: 1, answerText: '5', verify: '2+3' },
  { q: 'What is 6 - 2?', options: ['3', '8', '4', '2'], answer: 2, answerText: '4', verify: '6-2' },
  { q: 'What is 3 + 4?', options: ['7', '6', '8', '5'], answer: 0, answerText: '7', verify: '3+4' },
  { q: 'What is 10 - 1?', options: ['11', '8', '10', '9'], answer: 3, answerText: '9', verify: '10-1' },
];

// The timed challenge: eight slightly bigger sums.
export const CHALLENGE_QUESTIONS = [
  { q: 'What is 12 + 5?', options: ['17', '16', '18', '15'], answer: 0, answerText: '17', verify: '12+5' },
  { q: 'What is 20 - 7?', options: ['12', '13', '14', '27'], answer: 1, answerText: '13', verify: '20-7' },
  { q: 'What is 9 + 9?', options: ['17', '19', '18', '99'], answer: 2, answerText: '18', verify: '9+9' },
  { q: 'What is 15 - 6?', options: ['8', '10', '11', '9'], answer: 3, answerText: '9', verify: '15-6' },
  { q: 'What is 7 + 8?', options: ['15', '14', '16', '13'], answer: 0, answerText: '15', verify: '7+8' },
  { q: 'What is 30 - 12?', options: ['17', '18', '19', '42'], answer: 1, answerText: '18', verify: '30-12' },
  { q: 'What is 11 + 11?', options: ['21', '23', '22', '20'], answer: 2, answerText: '22', verify: '11+11' },
  { q: 'What is 25 - 5?', options: ['15', '25', '30', '20'], answer: 3, answerText: '20', verify: '25-5' },
];

export const RECALL_CARDS = [
  { front: 'What number comes after 4?', back: '5', hint: 'Count on by one' },
  { front: 'How many fingers are on one hand?', back: '5', hint: 'Hold one up' },
  { front: 'What is 2 + 2?', back: '4', hint: 'Two pairs' },
];

// Distinctive phrases the specs look for in rendered text.
export const MARKERS = {
  explain: 'Think of it like sharing snacks with a friend',
  quiz: 'Mini-quiz (mock provider)',
  discussion: 'What the learner seems to understand',
  review: 'Strengths',
  lessonHook: 'Start with a mystery bag',
  activitySetup: 'Clear a table and lay out the items',
};

function topicName(prompt) {
  const m = prompt.match(/"([^"]{3,120})"/);
  return m ? m[1] : 'this topic';
}

function lesson(prompt) {
  const name = topicName(prompt);
  return {
    objective: `Show and explain ${name} using everyday objects.`,
    duration: '20-30 minutes',
    materials: ['10 buttons or dried pasta', 'a small cloth bag', 'paper and a pencil'],
    parentTips: {
      focus: 'Keep the objects visible and let your child touch and move them while they talk.',
      struggles: 'Children often rush and skip an object; slow down and point to each one.',
      advice: 'Stop while it is still fun. Five calm minutes beat twenty tired ones.',
    },
    hook: `${MARKERS.lessonHook}: hide a few buttons and ask your child to guess, then check together.`,
    teach: [
      { title: 'Show it', say: 'Watch me. I touch each button once.', do: 'Line up five buttons and touch each in turn.' },
      { title: 'Try it together', say: 'Now you touch and I will say the words.', do: 'Guide their finger along the line.' },
      { title: 'Swap roles', say: 'Your turn to be the teacher.', do: 'Let your child check your work.' },
    ],
    guidedPractice: ['Sort the buttons into two piles and compare them.', 'Make a line of seven and say how many.'],
    independentActivity: { title: 'Button hunt', steps: ['Find buttons around the house.', 'Line them up.', 'Say how many you found.'] },
    questions: ['How do you know you did not miss one?', 'What happens if we move them around?', 'Can you show me a bigger group?'],
    commonMistakes: ['Saying two words for one object; slow down and touch each object once.'],
    masteryCheck: 'Your child can show a group of up to ten objects and explain how they checked it.',
    extension: 'Try the same game with groups hidden under cups.',
  };
}

function printables(prompt) {
  const name = topicName(prompt);
  return {
    printables: [
      {
        type: 'worksheet',
        title: `${name} practice sheet`,
        forParent: 'Print it and sit beside your child; no other preparation needed.',
        content: { intro: 'Answer each one.', problems: ['2 + 1 = __', '3 + 2 = __', '4 + 4 = __'], answers: ['3', '5', '8'] },
      },
      {
        type: 'flashcards',
        title: `${name} flashcards`,
        forParent: 'Cut along the lines and quiz in short bursts.',
        content: { cards: [{ front: '1 + 1', back: '2' }, { front: '2 + 2', back: '4' }, { front: '3 + 3', back: '6' }] },
      },
    ],
  };
}

function activityDetail() {
  return {
    materials: ['a tray', 'ten small toys'],
    setup: `${MARKERS.activitySetup}, then invite your child to join you.`,
    steps: ['Show the first example.', 'Do one together.', 'Let your child lead the next one.', 'Talk about what you noticed.'],
    example: 'Put three toys on the tray, add two more, and count all five together.',
    tip: 'Use fewer items to make it easier, more to make it harder.',
  };
}

function test(title) {
  return {
    title,
    recommendedMode: 'digital',
    instructions: 'Read each question aloud and let your child tap an answer.',
    passMark: 90,
    estimatedMinutes: 5,
    questions: MASTERY_QUESTIONS.map((q) => ({ type: 'multiple_choice', ...q, points: 1 })),
  };
}

function challenge(prompt) {
  return {
    title: `${(prompt.match(/mastered "([^"]+)"/) || [, 'Topic'])[1]} — Challenge`,
    questions: CHALLENGE_QUESTIONS.map((q) => ({ ...q, points: 1 })),
  };
}

// The independent re-solve in verifyTest. It sends items like
// { n, question, options: ["0: 4", "1: 5", …] } and expects the index it
// believes is correct. We look the question up in our own key, so the
// checker always agrees and every question survives verification.
function verify(prompt) {
  const start = prompt.indexOf('Items (JSON):');
  const end = prompt.indexOf('Return ONLY valid JSON');
  let items = [];
  try { items = JSON.parse(prompt.slice(start + 'Items (JSON):'.length, end).trim()); } catch {}
  const key = new Map([...MASTERY_QUESTIONS, ...CHALLENGE_QUESTIONS].map((q) => [q.q, q.answerText]));
  return {
    results: items.map((item) => {
      const answerText = key.get(item.question);
      const correct = item.options.findIndex((o) => o.replace(/^\d+:\s*/, '') === answerText);
      return { n: item.n, correct, ok: correct !== -1 };
    }),
  };
}

const TEXT = {
  explain: (p) => `**${topicName(p)}**\n\n${MARKERS.explain}: when you share, everyone gets a fair turn and you can check by counting.\n\nAsk: "Can you show me how you would check?"`,
  quiz: (p) => `### ${MARKERS.quiz}\n1. Show me three buttons.\n2. What comes after 7?\n3. Which group is bigger?\n4. How did you check?\n\n**Answers**\n- Three buttons\n- 8\n- The group with more\n- By counting each once`,
  discussion: () => `**${MARKERS.discussion}**\n- Counts small groups accurately.\n\n**Where the misunderstanding is**\n- Skips objects when they are not in a line.\n\n**How to approach this topic next**\n- Line objects up first.\n- Touch each one.\n- Ask how they checked.\n\n**A phrase to try**\n"Show me how you know."`,
  review: () => `**${MARKERS.review}**\n- Curious and persistent.\n- Talks through their thinking.\n\n**Watch areas**\n- Rushes when tired.\n- Needs objects in a line.\n\n**What to do next**\n- Short daily counting games.\n- Revisit one earlier topic.\n- Record one conversation.`,
};

export function classify(prompt) {
  if (prompt.includes('meticulous exam checker')) return 'verify';
  if (prompt.includes('TIMED "challenge" quiz')) return 'challenge';
  if (prompt.includes('homeschool assessor writing a test')) return 'mastery-test';
  if (prompt.includes('ACTIVE RECALL flashcards')) return 'recall';
  if (prompt.includes('homeschool curriculum writer')) return 'lesson';
  if (prompt.includes('homeschool materials designer')) return 'printables';
  if (prompt.includes('do-it-now instructions')) return 'activity';
  if (prompt.includes('Explain the topic')) return 'explain';
  if (prompt.includes('mini-quiz')) return 'quiz';
  if (/Analy[sz]e the following discussion/.test(prompt)) return 'discussion';
  if (prompt.includes('progress review')) return 'review';
  return 'unknown';
}

export function respond(kind, prompt) {
  switch (kind) {
    case 'verify': return JSON.stringify(verify(prompt));
    case 'challenge': return JSON.stringify(challenge(prompt));
    case 'mastery-test': {
      const t = prompt.match(/"title": "([^"]+)"/);
      return JSON.stringify(test(t ? t[1] : 'Mastery Test'));
    }
    case 'recall': return JSON.stringify({ cards: RECALL_CARDS });
    case 'lesson': return JSON.stringify(lesson(prompt));
    case 'printables': return JSON.stringify(printables(prompt));
    case 'activity': return JSON.stringify(activityDetail(prompt));
    case 'explain': case 'quiz': case 'discussion': case 'review':
      return TEXT[kind](prompt);
    default: return 'The mock provider did not recognize this prompt.';
  }
}

export function startMockAi(port = PORTS.mockAi) {
  const log = [];
  let failNext = 0;
  let malformedNext = 0;
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://mock');
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true });
    if (url.pathname === '/__log') {
      if (req.method === 'DELETE') { log.length = 0; return json(res, 200, { ok: true }); }
      return json(res, 200, log);
    }
    if (req.method === 'DELETE' && url.pathname === '/__fail') { failNext = 0; malformedNext = 0; return json(res, 200, { ok: true, failNext, malformedNext }); }
    let body = '';
    for await (const chunk of req) body += chunk;
    if (req.method === 'POST' && url.pathname === '/__fail') {
      failNext = Number(JSON.parse(body || '{}').count ?? 1);
      return json(res, 200, { ok: true, failNext });
    }
    if (req.method === 'POST' && url.pathname === '/__malformed') {
      malformedNext = Number(JSON.parse(body || '{}').count ?? 1);
      return json(res, 200, { ok: true, malformedNext });
    }
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      let payload;
      try { payload = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      const prompt = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n\n');
      const kind = classify(prompt);
      log.push({ kind, model: payload.model, prompt, at: Date.now() });
      // A short delay so loading states are visible in screenshots and videos.
      await new Promise((r) => setTimeout(r, 150));
      if (failNext > 0) { failNext -= 1; return json(res, 500, { error: 'mock failure' }); }
      let content = respond(kind, prompt);
      if (malformedNext > 0) { malformedNext -= 1; content = JSON.stringify(MALFORMED_LESSON); }
      return json(res, 200, {
        id: `mock-${log.length}`,
        object: 'chat.completion',
        model: payload.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
      });
    }
    json(res, 404, { error: 'not found' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--port');
  const port = i > -1 ? Number(process.argv[i + 1]) : PORTS.mockAi;
  const server = await startMockAi(port);
  console.log(`Mock AI provider listening at http://127.0.0.1:${server.address().port}/v1`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
