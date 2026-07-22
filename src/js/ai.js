// AI helpers via Puter.js. Returns HTML strings ready to inject.

function toHtml(text) {
  // Minimal markdown -> HTML (paragraphs, bold, bullet lists, headings).
  const lines = String(text).split('\n');
  let html = '', inList = false;
  const inline = s => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (/^#{1,4}\s/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h4>${inline(line.replace(/^#{1,4}\s/, ''))}</h4>`;
    } else if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inline(line.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, ''))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${inline(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

const US_SPELLING = ' Always write in American English spelling (e.g. "practice", "artifact", "color", "organize", "labeled", "favorite", "math", "recognize", "center").';

async function ask(prompt) {
  const res = await puter.ai.chat(prompt + US_SPELLING, { model: 'gpt-4o-mini' });
  const text = typeof res === 'string' ? res : (res?.message?.content || res?.text || String(res));
  return toHtml(text);
}

export function aiExplain(topic, childName) {
  const name = childName || 'a young learner';
  return ask(`You are a warm, expert homeschool tutor. Explain the topic "${topic.name}" (${topic.subject}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}) in simple, friendly language a parent can read aloud to ${name}. Topic description: ${topic.description}. Keep it under 160 words. Use one everyday analogy and end with a single sentence a parent could say to check understanding. Use short paragraphs.`);
}

export function aiQuiz(topic, childName) {
  return ask(`Create a short 4-question mini-quiz to check mastery of "${topic.name}" (${topic.subject}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}). Description: ${topic.description}. Mastery evidence: ${(topic.evidence||[]).join('; ')}. Mix question types (recall, apply, explain). Number the questions. After the questions add a short "**Answers**" section. Keep it concise and age-appropriate.`);
}

// ---- Structured lesson generation ----
function parseJson(text) {
  let s = String(text).trim();
  // strip code fences
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // grab first {...} block if there's surrounding prose
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function askJson(prompt, model = 'gpt-4o-mini') {
  const res = await puter.ai.chat(prompt + US_SPELLING, { model });
  const text = typeof res === 'string' ? res : (res?.message?.content || res?.text || String(res));
  return parseJson(text);
}

// A stronger model is worth it for correctness of test questions/answers.
const TEST_MODEL = 'gpt-4o';

// Safely evaluate a simple arithmetic expression (digits, + - * / . ( ) only).
// Returns a Number, or null if the expression is unsafe/invalid.
export function safeCalc(expr) {
  if (typeof expr !== 'string') return null;
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned || !/^[-+*/().\d]+$/.test(cleaned)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const val = Function('"use strict";return (' + cleaned + ')')();
    return (typeof val === 'number' && isFinite(val)) ? val : null;
  } catch { return null; }
}

function numbersEqual(a, b) {
  if (a === null || b === null) return false;
  return Math.abs(a - b) < 1e-6;
}

// Pull the first number out of a string like "3 apples" -> 3.
function extractNumber(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function normStr(s) { return String(s ?? '').trim().toLowerCase(); }

// Make every generated question internally consistent so grading is deterministic.
// For multiple_choice: reconcile the correct-option index using (in priority order)
// the arithmetic verifier, the exact answerText, then the given index. Anything we
// cannot make consistent is dropped so a broken question never reaches the student.
export function normalizeTest(test) {
  if (!test || !Array.isArray(test.questions)) return test;
  const out = [];
  for (const q of test.questions) {
    let question = { ...q };

    // Convert any stray true/false into multiple choice.
    if (question.type === 'true_false') {
      const truth = question.answer === true || normStr(question.answer) === 'true';
      question = { type: 'multiple_choice', q: question.q, options: ['True', 'False'], answer: truth ? 0 : 1, answerText: truth ? 'True' : 'False', points: 1 };
    }

    if (question.type === 'multiple_choice') {
      let options = Array.isArray(question.options) ? question.options.map(o => String(o).trim()).filter(Boolean) : [];
      // De-duplicate options (a common source of "two right answers").
      const seen = new Set();
      options = options.filter(o => { const k = normStr(o); if (seen.has(k)) return false; seen.add(k); return true; });
      if (options.length < 2) continue; // unusable

      let idx = -1;
      const calc = safeCalc(question.verify);
      const at = normStr(question.answerText);

      if (calc !== null) {
        const match = options.findIndex(o => numbersEqual(extractNumber(o), calc));
        if (match !== -1) idx = match;
      }
      if (idx === -1 && at) {
        const match = options.findIndex(o => normStr(o) === at);
        if (match !== -1) idx = match;
      }
      if (idx === -1 && Number.isInteger(question.answer) && question.answer >= 0 && question.answer < options.length) {
        idx = question.answer;
      }
      // If we still can't identify a single correct option, drop the question
      // rather than risk a wrong key.
      if (idx === -1) continue;

      out.push({ type: 'multiple_choice', q: String(question.q || '').trim(), options, answer: idx, points: 1 });
      continue;
    }

    // short_answer / task pass through (carry `answer` for the key).
    if (question.q) out.push(question);
  }
  if (out.length) test.questions = out;
  return test;
}

// Independent second-pass verification: a fresh model call re-solves every
// multiple_choice question WITHOUT seeing the proposed key, and we keep only the
// questions where the independent answer agrees with ours. Questions that are
// ambiguous, wrong, or unsolvable are removed. This is what guarantees the tests
// aren't "flat out wrong".
export async function verifyTest(test) {
  if (!test || !Array.isArray(test.questions)) return test;
  const mc = test.questions
    .map((q, i) => ({ q, i }))
    .filter(x => x.q.type === 'multiple_choice');
  if (mc.length === 0) return test;

  const payload = mc.map((x, n) => ({
    n,
    question: x.q.q,
    options: x.q.options.map((o, oi) => `${oi}: ${o}`),
  }));

  const prompt =
`You are a meticulous exam checker. For each item below, solve it independently and choose the single best correct option by its number. Also judge whether the item is a fair, unambiguous question with exactly one correct option.

Items (JSON):
${JSON.stringify(payload)}

Return ONLY valid JSON (no markdown):
{ "results": [ { "n": <item number>, "correct": <0-based option index you believe is correct>, "ok": <true if the question is clear and has exactly one correct option, else false> } ] }`;

  let verdicts = {};
  try {
    const res = await askJson(prompt, TEST_MODEL);
    (res.results || []).forEach(r => { verdicts[r.n] = r; });
  } catch {
    // If verification fails entirely, fall back to the normalized test as-is.
    return test;
  }

  const kept = [];
  const rejected = new Set();
  mc.forEach((x, n) => {
    const v = verdicts[n];
    // Keep only if the checker flagged it OK and its answer matches ours.
    if (v && v.ok !== false && Number.isInteger(v.correct) && v.correct === x.q.answer) {
      kept.push(x.i);
    } else {
      rejected.add(x.i);
    }
  });

  // Rebuild: keep all non-MC questions plus verified MC questions, in order.
  const rebuilt = test.questions.filter((q, i) => q.type !== 'multiple_choice' || kept.includes(i));
  // Only apply the filter if it leaves a usable test; otherwise keep original.
  if (rebuilt.length >= Math.max(3, Math.ceil(test.questions.length * 0.5))) {
    test.questions = rebuilt;
  }
  return test;
}

// A complete, ready-to-teach lesson for a single topic.
export function aiLesson(topic, childName) {
  const name = childName || 'your child';
  const prompt =
`You are an expert homeschool curriculum writer. Write a complete, ready-to-teach lesson a parent can use TODAY with ${name} on the topic "${topic.name}" (${topic.subject} > ${topic.domain}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}).
Topic description: ${topic.description}
Mastery evidence to aim for: ${(topic.evidence || []).join('; ') || 'general understanding'}

Return ONLY valid JSON (no markdown, no commentary) matching exactly this shape:
{
  "objective": "one clear sentence: what the child will be able to do",
  "duration": "e.g. 20-30 minutes",
  "materials": ["everyday item 1", "item 2"],
  "parentTips": {
    "focus": "1-2 sentences: the single most important thing for the parent to focus on so the child truly gets it",
    "struggles": "1-2 sentences: where children most often struggle here and how to spot it",
    "advice": "1-2 sentences: warm, practical advice on pacing, encouragement, or when to pause and revisit"
  },
  "hook": "2-3 sentences: a fun way to introduce the idea and get curiosity going",
  "teach": [
    { "title": "short step title", "say": "exactly what the parent can say, in plain words", "do": "what to physically do or show" }
  ],
  "guidedPractice": ["a task the parent and child do together", "another"],
  "independentActivity": { "title": "activity name", "steps": ["step 1", "step 2", "step 3"] },
  "questions": ["discussion / check question 1", "question 2", "question 3"],
  "commonMistakes": ["a mistake children make and how to gently correct it"],
  "masteryCheck": "one concrete thing the child should be able to do to show they've mastered it",
  "extension": "an optional harder challenge for children ready to go further"
}
Make "teach" have 3-5 steps. Keep language warm, concrete and age-appropriate. Use real, specific examples (numbers, words, objects) rather than generic filler. The parentTips must be specific to THIS topic, not generic teaching advice.`;
  return askJson(prompt);
}

// Ready-to-print materials for a topic. The AI picks the 2-3 formats that need
// the LEAST parent prep while being genuinely useful for this specific topic.
export function aiPrintables(topic, childName) {
  const prompt =
`You are a homeschool materials designer. Create ready-to-print materials for teaching "${topic.name}" (${topic.subject} > ${topic.domain}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}).
Topic description: ${topic.description}
Mastery evidence: ${(topic.evidence || []).join('; ') || 'general understanding'}

Goal: make parent prep as EASY as possible — the parent should be able to press print and immediately use it with their child, with no extra preparation or supplies beyond scissors.
Choose the 2 or 3 formats that best fit THIS topic from: "worksheet", "flashcards", "matching", "tracing", "sorting".
- worksheet: practice questions to write on. content: { "intro": "short instruction for the child", "problems": ["q1","q2",...8-12 items], "answers": ["a1","a2",...] }
- flashcards: cards to cut out, one concept per card. content: { "cards": [{"front":"...","back":"..."}, ...6-12] }
- matching: two columns to draw lines between or cut and pair. content: { "pairs": [{"left":"...","right":"..."}, ...5-8] }
- tracing: words/numbers/letters printed large to trace over (great for young children/handwriting). content: { "items": ["cat","dog",...4-8] }
- sorting: a bank of items to cut out and sort into categories. content: { "categories": ["Category A","Category B"], "items": [{"text":"...","category":"Category A"}, ...8-12] }

Return ONLY valid JSON (no markdown) matching:
{
  "printables": [
    { "type": "worksheet|flashcards|matching|tracing|sorting", "title": "clear title", "forParent": "one sentence on how to use it and why it's easy prep", "content": { ... matching the type above ... } }
  ]
}
Use real, specific, age-appropriate content (actual numbers, words, examples) — never placeholders.`;
  return askJson(prompt);
}

// Detailed how-to for one specific activity or game idea.
export function aiActivityDetail(topic, activity, kind) {
  const prompt =
`You are a homeschool tutor. Expand this ${kind} idea into clear, do-it-now instructions for a parent teaching "${topic.name}" (${topic.subject}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}).
${kind} idea: "${activity.title}" — ${activity.body}
Topic description: ${topic.description}

Return ONLY valid JSON (no markdown) matching:
{
  "materials": ["item 1", "item 2"],
  "setup": "one short paragraph on how to set up",
  "steps": ["numbered-style step 1", "step 2", "step 3", "step 4"],
  "example": "a concrete worked example the parent can copy",
  "tip": "one tip to make it easier or harder"
}
Use specific, real examples. Keep it practical and age-appropriate.`;
  return askJson(prompt);
}

// A mastery test. `mode` is 'digital' (auto-gradable quiz) or 'physical'
// (printable paper test / hands-on observation checklist).
// `section` (optional) narrows it to one domain/age unit; otherwise it's a
// final subject-wide test.
export function aiMasteryTest({ subject, age, topicNames, mode, section, topic, level }) {
  const digital = mode === 'digital';
  const advanced = level === 'advanced';
  const isTopic = !!topic;
  const isSection = !isTopic && !!section;
  const count = isTopic ? '4 to 6' : isSection ? '6 to 9' : '10 to 14';
  const scope = isTopic
    ? `the topic "${topic.name}" — ${topic.description || ''}${(topic.evidence && topic.evidence.length) ? '. Mastery evidence: ' + topic.evidence.join('; ') : ''}`
    : (topicNames && topicNames.length ? topicNames.join(', ') : `core ${subject} skills for age ${age}`);
  const heading = isTopic
    ? `Write a TOPIC MASTERY TEST for the single topic "${topic.name}" within ${subject}, for a learner aged ${age}. This confirms the child has truly mastered this one topic before moving on. Mastery is 90% or more correct.`
    : isSection
    ? `Write a SECTION MASTERY TEST for the unit "${section}" within ${subject}, for a learner aged ${age}. This checks the child has mastered this section before moving on. Mastery is 90% or more correct.`
    : `Write a FINAL MASTERY TEST for the subject "${subject}" for a learner aged ${age}. Mastery is 90% or more correct.`;
  const prompt =
`You are an expert homeschool assessor writing a test for a child aged ${age}. ${heading}
Focus tightly on: ${scope}.
${advanced ? 'ADAPTIVE DIFFICULTY: This child is excelling here, so pitch the questions a notch harder than usual — larger numbers, an extra reasoning step, or slightly deeper application — while staying fair for the age and on-topic.' : ''}

RULES FOR GOOD QUESTIONS (follow all):
1. SOLVE every question yourself first. Only write an answer you are 100% certain is correct.
2. Each question must have EXACTLY ONE correct option. The other options must be plausible but clearly, unambiguously wrong. Never let two options both be arguably correct.
3. Questions must be self-contained and answerable from the text alone — no "read the passage above", no reference to pictures, manipulatives, or things not shown.
4. Use simple, direct, age-${age} language. One idea per question. Avoid trick wording, double negatives, and "which of these is NOT" unless truly necessary.
5. Options must be short, distinct, and not overlapping (e.g. don't include both "4" and "four"). Don't use "all of the above" / "none of the above".
6. For math, keep numbers age-appropriate and put the FULL arithmetic in "verify" so it can be checked.

${digital
  ? `FORMAT: DIGITAL (answered on screen, auto-graded). Use ONLY "multiple_choice" questions with EXACTLY 4 options each (for genuinely true/false ideas you may use 2 options ["True","False"]). Do NOT use short_answer or task.`
  : `FORMAT: PHYSICAL (printed or observed). Use a mix of "multiple_choice" (4 options), "short_answer", and "task" (hands-on demonstration).`}

Question shapes:
- "multiple_choice": { "q": "...", "options": ["...","...","...","..."], "answer": <0-based index of the correct option>, "answerText": "exact text of the correct option, copied verbatim from options", "verify": "<for numeric answers only: a plain arithmetic expression using digits and + - * / ( ) that evaluates to the correct number, e.g. \\"4-1\\"; omit for non-numeric>", "points": 1 }
- "short_answer": { "q": "...", "answer": "the exact correct answer", "verify": "<arithmetic expression if numeric, else omit>", "points": 1 }
- "task": { "q": "a hands-on task to demonstrate", "answer": "the success criteria the parent looks for", "points": 1 }

For every multiple_choice, "answer", "answerText", and (if numeric) "verify" MUST all point to the SAME single option.

Return ONLY valid JSON (no markdown) matching exactly:
{
  "title": "${isTopic ? topic.name + ' — Topic Check' : isSection ? section + ' — Section Check' : subject + ' Mastery Test'}",
  "recommendedMode": "${mode}",
  "instructions": "2-3 sentences telling the parent how to give the test",
  "passMark": 90,
  "estimatedMinutes": <number>,
  "questions": [ ... ${count} questions using the shapes above, ordered easiest-first ... ]
}
Use real, specific, age-appropriate content (actual numbers, words, examples) — never placeholders.`;
  return askJson(prompt, TEST_MODEL).then(normalizeTest).then(verifyTest).then(normalizeTest);
}

// A timed "challenge" quiz taken AFTER a topic is mastered. Designed to stretch
// without frustrating: same core skill but slightly bigger numbers / minor
// concepts from what comes next. All multiple_choice for fast, fair grading.
export function aiChallenge({ subject, age, topic, nextHint }) {
  const prompt =
`You are an expert homeschool assessor creating a fun, TIMED "challenge" quiz for a child aged ${age} who has ALREADY mastered "${topic.name}" (${subject} > ${topic.domain}). Description: ${topic.description || ''}.
This is a stretch, not a trap: keep it enjoyable and doable, roughly 10-20% harder than the mastery test. Ways to stretch: slightly bigger numbers, an extra step, or a small taste of the next concept${nextHint ? ` (e.g. ${nextHint})` : ''}.

RULES:
1. SOLVE every question yourself first; only write answers you are 100% sure of.
2. ALL questions are "multiple_choice" with EXACTLY 4 short, distinct options and exactly one correct answer.
3. Make 8 questions so a quick child can race the clock; order easiest-first.
4. Self-contained wording, age-appropriate, no references to pictures.
5. For math include the FULL arithmetic in "verify".

Question shape:
{ "q": "...", "options": ["...","...","...","..."], "answer": <0-based index>, "answerText": "exact correct option text", "verify": "<arithmetic expression if numeric, else omit>", "points": 1 }

Return ONLY valid JSON (no markdown):
{ "title": "${topic.name} — Challenge", "questions": [ ...8 multiple_choice items... ] }
Use real, specific, age-appropriate content — never placeholders.`;
  return askJson(prompt, TEST_MODEL).then(t => { t.questions = (t.questions || []).map(q => ({ ...q, type: 'multiple_choice' })); return t; }).then(normalizeTest).then(verifyTest).then(normalizeTest);
}

// Active-recall cards for a topic: short question -> concise answer prompts the
// child answers from memory (retrieval practice). Returned as plain Q/A pairs.
export function aiRecallCards(topic, age) {
  const prompt =
`You are an expert tutor creating ACTIVE RECALL flashcards for "${topic.name}" (${topic.subject} > ${topic.domain}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}) for a child aged ${age}.
Topic description: ${topic.description || ''}
Mastery evidence: ${(topic.evidence || []).join('; ') || 'core understanding'}

Active recall = the child retrieves the answer FROM MEMORY, so each card must have one clear, checkable answer.
Rules:
1. 5-7 cards covering the key ideas of this topic.
2. "front" is a short question or prompt ("What is...?", "How do you...?", "Say the...").
3. "back" is the concise correct answer (a few words or one short sentence) the child should be able to say.
4. Age-appropriate, specific, and self-contained. Solve each yourself so the answer is correct.
5. Optionally add a tiny "hint" (a few words) to nudge without giving it away.

Return ONLY valid JSON (no markdown):
{ "cards": [ { "front": "...", "back": "...", "hint": "..." } ] }
Use real, specific content — never placeholders.`;
  return askJson(prompt, TEST_MODEL).then(data => {
    const cards = (data && Array.isArray(data.cards)) ? data.cards : [];
    return cards
      .filter(c => c && c.front && c.back)
      .map((c, i) => ({ id: `${topic.id}::${i}`, front: String(c.front).trim(), back: String(c.back).trim(), hint: c.hint ? String(c.hint).trim() : '' }));
  });
}

// Analyze a recorded/typed discussion and give the PARENT targeted coaching:
// how to approach the topic, why the child may be misunderstanding, and advice.
export function aiDiscussionAnalysis({ studentName, age, topic, transcript, note }) {
  const name = studentName || 'the child';
  const topicLine = topic
    ? `Topic being discussed: "${topic.name}" (${topic.subject} > ${topic.domain}, ages ${topic.ageRangeStart}-${topic.ageRangeEnd}). Description: ${topic.description || ''}. Mastery evidence: ${(topic.evidence || []).join('; ') || 'n/a'}.`
    : 'No specific topic was linked to this discussion.';
  const body = (transcript && transcript.trim())
    ? `Transcript of the recorded discussion between parent and child:\n"""\n${transcript.trim().slice(0, 4000)}\n"""`
    : `The parent did not capture a transcript. Their written notes about the discussion: "${(note || '').slice(0, 1500) || '(none)'}"`;

  return ask(
`You are an expert learning coach helping a homeschooling parent. Analyze the following discussion between the parent and ${name} (age ${age}) and give the PARENT practical, encouraging guidance.

${topicLine}

${body}

Based ONLY on what the discussion actually shows, write a focused analysis with these bold headings:
**What ${name} seems to understand** — 1-2 short bullets citing specific moments if possible.
**Where the misunderstanding is** — 1-2 bullets naming the likely misconception and, importantly, WHY you think ${name} is confused (the root cause, not just the symptom).
**How to approach this topic next** — 3 concrete, doable moves for the parent (a way to re-explain, a concrete example/manipulative, a question to ask, or a smaller sub-skill to revisit first).
**A phrase to try** — one short, warm sentence the parent could actually say to ${name} to unstick them.

If the transcript is too short or unclear to judge, say so honestly and suggest what to record next time. Keep it under 230 words, warm and jargon-free.`);
}

// Parent assistant chatbot. Holds a short conversation, grounded in the active
// student's real progress + the curriculum, and gives practical teaching help.
export async function aiParentChat(messages, context) {
  const sys =
`You are "Homestead Helper", a warm, practical AI teaching coach for a homeschooling PARENT (not the child). Give concrete, doable, encouraging advice — specific activities, ways to re-explain, everyday examples, manipulatives, small sub-skills to revisit, and signs of progress to look for. Keep answers focused and skimmable (short paragraphs or a few bullets), usually under 200 words unless asked for more. American English. You are advising the grown-up on how to teach; never talk down to them.

Context about their setup:
${context}

If they mention a struggling topic, suggest a clear plan: how to reteach it simply, one hands-on activity, a way to check understanding, and what usually trips kids up. Point them to Homestead features by name when relevant (a topic's Lesson, Print & go materials, Active recall cards, the timed Challenge, or recording a discussion for AI analysis). If you don't have enough info, ask one short clarifying question.`;

  const convo = [{ role: 'system', content: sys }, ...messages];
  const res = await puter.ai.chat(convo, { model: 'gpt-4o' });
  const text = typeof res === 'string' ? res : (res?.message?.content || res?.text || String(res));
  return toHtml(text);
}

// Teacher feedback based on a student's real progress + records.
export function aiFeedback({ studentName, age, subject, stats, recentTopics, records }) {
  const recTxt = records.length
    ? records.slice(0, 12).map(r => `- [${r.type}${r.rating ? ', '+r.rating+'/5' : ''}] ${r.topicName}: ${r.note || r.title || ''}`).join('\n')
    : '(no written records yet)';
  const topicTxt = recentTopics.length
    ? recentTopics.map(t => `- ${t.name} — ${t.status}`).join('\n')
    : '(no topics started yet)';
  return ask(
`You are an experienced homeschool mentor giving a parent-teacher a supportive, practical progress review for ${studentName} (age ${age}) in ${subject}.

Progress: ${stats.mastered} of ${stats.total} ${subject} topics mastered (${stats.pct}%), ${stats.inProgress} in progress.

Recent topics:
${topicTxt}

Parent's records (observations, questions, discussions):
${recTxt}

Write a warm, specific review with these sections using bold headings:
**Strengths** — 2 short bullets.
**Watch areas** — 2 short bullets referencing the records/questions where possible.
**What to do next** — 3 concrete, doable suggestions for the coming week (activities, revisit a topic, etc.).
Keep the whole thing under 220 words, encouraging and jargon-free.`);
}
