// Voice recording: capture lesson conversations, store to Puter FS (per-parent), play back.
import { el, refreshIcons, toast, openModal } from './ui.js';
import * as store from './store.js';
import { getData, SUBJECTS, topicAge } from './data.js';
import { aiDiscussionAnalysis } from './ai.js';

// Section id for a topic, matching mastery.js sectionId(): "subject|domain|age".
function sectionIdForTopic(t) {
  if (!t) return null;
  return `${t.subject}|${t.domain}|${topicAge(t)}`;
}

export function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickMime() {
  const opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const t of opts) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; }
  return '';
}

export function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Live transcription helper built on the browser's Web Speech API.
function makeTranscriber(onUpdate) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || 'en-US';
  let finalText = '';
  let stopped = false;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    onUpdate((finalText + interim).trim(), finalText.trim());
  };
  rec.onerror = () => {};
  rec.onend = () => { if (!stopped) { try { rec.start(); } catch {} } }; // auto-restart during a long session
  return {
    start() { try { rec.start(); } catch {} },
    stop() { stopped = true; try { rec.stop(); } catch {} return finalText.trim(); },
    getText() { return finalText.trim(); },
  };
}

export async function saveAudio(recId, blob, ext) {
  const path = `homestead/recordings/${recId}.${ext}`;
  await puter.fs.write(path, blob, { createMissingParents: true });
  return path;
}

const urlCache = new Map();
export async function loadAudioUrl(path) {
  if (urlCache.has(path)) return urlCache.get(path);
  const blob = await puter.fs.read(path);
  const url = URL.createObjectURL(blob);
  urlCache.set(path, url);
  return url;
}

// A lazy playback control that fetches the audio only when the parent taps play.
export function audioPlayer(path, duration) {
  const wrap = el(`<div class="mt-2"></div>`);
  const btn = el(`<button class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-light text-brand-dark text-sm font-medium hover:bg-brand/20 transition-colors">
    <i data-lucide="play-circle" class="w-4 h-4"></i>Play recording${duration ? ` · ${fmtDur(duration)}` : ''}</button>`);
  wrap.appendChild(btn);
  btn.onclick = async () => {
    btn.disabled = true;
    btn.innerHTML = '<div class="w-4 h-4 border-2 border-brand-dark border-t-transparent rounded-full animate-spin"></div>Loading\u2026';
    try {
      const url = await loadAudioUrl(path);
      const audio = el(`<audio class="w-full" controls autoplay></audio>`);
      audio.src = url;
      wrap.innerHTML = '';
      wrap.appendChild(audio);
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4"></i>Couldn\'t load recording';
      refreshIcons();
    }
  };
  refreshIcons();
  return wrap;
}

// ---- The recorder modal ----
// section (optional): { id, subject, domain, age } — links the recording to a section.
export function openRecorder(studentId, topic = null, section = null) {
  if (!studentId) { toast('Add a student first', 'error'); return; }
  const d = getData();
  const contextLabel = topic ? 'Linked to ' + topic.name
    : section ? `Linked to ${section.domain} · Age ${section.age}`
    : 'Capture a lesson discussion, then link it to a topic.';

  const body = el(`<div class="p-5">
    <div class="flex items-center gap-2 mb-1">
      <span class="w-8 h-8 rounded-lg bg-[#b0413a]/10 flex items-center justify-center"><i data-lucide="mic" class="w-4.5 h-4.5 text-[#b0413a]"></i></span>
      <h3 class="font-display text-lg font-600">Record conversation</h3>
    </div>
    <p class="text-xs text-ink-faint mb-4">${contextLabel}</p>

    <div id="stage"></div>
  </div>`);
  const stage = body.querySelector('#stage');
  const m = openModal(body);

  let stream = null, recorder = null, chunks = [], mime = '', startTs = 0, timerId = null, blob = null, duration = 0;
  let transcriber = null, transcript = '', liveTranscript = '';

  const cleanupStream = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } };
  const originalClose = m.close;
  m.close = () => { cleanupStream(); if (transcriber) transcriber.stop(); if (timerId) clearInterval(timerId); originalClose(); };
  body.querySelector('#stage').addEventListener('modal-close', m.close);

  // Stage 1: idle
  function renderIdle() {
    stage.innerHTML = '';
    const canTranscribe = speechSupported();
    stage.appendChild(el(`<div class="text-center py-6">
      <div class="w-20 h-20 rounded-full bg-[#b0413a]/10 flex items-center justify-center mx-auto mb-4">
        <i data-lucide="mic" class="w-9 h-9 text-[#b0413a]"></i>
      </div>
      <p class="text-sm text-ink-soft mb-4 max-w-xs mx-auto">Press start, then talk through the lesson together. The recording is saved privately to your account.</p>
      <div class="inline-flex items-center gap-1.5 text-xs ${canTranscribe ? 'text-brand-dark' : 'text-ink-faint'} mb-5">
        <i data-lucide="${canTranscribe ? 'captions' : 'captions-off'}" class="w-3.5 h-3.5"></i>${canTranscribe ? 'Live transcript on — enables AI analysis afterwards' : 'Live transcript not supported in this browser'}
      </div>
      <div>
        <button id="start" class="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#b0413a] hover:bg-[#963731] text-white font-medium transition-colors">
          <i data-lucide="circle" class="w-4 h-4 fill-current"></i>Start recording</button>
      </div>
    </div>`));
    stage.querySelector('#start').onclick = startRecording;
    refreshIcons();
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast('Microphone access is needed to record', 'error');
      return;
    }
    mime = pickMime();
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      recorder = new MediaRecorder(stream);
    }
    chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      blob = new Blob(chunks, { type: mime || 'audio/webm' });
      duration = (Date.now() - startTs) / 1000;
      if (transcriber) transcript = transcriber.stop();
      cleanupStream();
      renderReview();
    };
    recorder.start();
    startTs = Date.now();

    // Start live transcription (best-effort; audio still records if unsupported).
    transcript = ''; liveTranscript = '';
    transcriber = makeTranscriber((full) => {
      liveTranscript = full;
      const box = stage.querySelector('#livecap');
      if (box) { box.textContent = full || 'Listening…'; box.scrollTop = box.scrollHeight; }
    });
    if (transcriber) transcriber.start();

    renderRecording();
  }

  function renderRecording() {
    stage.innerHTML = '';
    const showCap = speechSupported();
    stage.appendChild(el(`<div class="text-center py-4">
      <div class="w-16 h-16 rounded-full bg-[#b0413a] flex items-center justify-center mx-auto mb-3 relative">
        <span class="absolute inset-0 rounded-full bg-[#b0413a]/40 animate-ping"></span>
        <i data-lucide="mic" class="w-7 h-7 text-white relative"></i>
      </div>
      <p id="timer" class="text-3xl font-700 font-display tabular-nums mb-1">0:00</p>
      <p class="text-sm text-[#b0413a] font-medium mb-4 flex items-center justify-center gap-1.5"><span class="w-2 h-2 rounded-full bg-[#b0413a] animate-pulse"></span>Recording\u2026</p>
      ${showCap ? `<div class="text-left mb-4">
        <p class="text-[11px] font-600 uppercase tracking-wide text-ink-faint mb-1 flex items-center gap-1"><i data-lucide="captions" class="w-3.5 h-3.5"></i>Live transcript</p>
        <div id="livecap" class="text-sm text-ink-soft bg-paper border border-paper-line rounded-xl p-3 h-28 overflow-y-auto leading-relaxed">Listening…</div>
      </div>` : ''}
      <button id="stop" class="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-ink hover:bg-ink-soft text-white font-medium transition-colors">
        <i data-lucide="square" class="w-4 h-4 fill-current"></i>Stop &amp; review</button>
    </div>`));
    const timerEl = stage.querySelector('#timer');
    timerId = setInterval(() => { timerEl.textContent = fmtDur((Date.now() - startTs) / 1000); }, 250);
    const cap = stage.querySelector('#livecap');
    if (cap && liveTranscript) cap.textContent = liveTranscript;
    stage.querySelector('#stop').onclick = () => { clearInterval(timerId); recorder.stop(); };
    refreshIcons();
  }

  function renderReview() {
    stage.innerHTML = '';
    const url = URL.createObjectURL(blob);
    const wrap = el(`<div>
      <div class="rounded-xl border border-paper-line bg-paper p-3 mb-4">
        <div class="flex items-center gap-2 mb-2 text-sm font-600"><i data-lucide="audio-lines" class="w-4 h-4 text-brand-dark"></i>Preview · ${fmtDur(duration)}</div>
        <audio class="w-full" controls src="${url}"></audio>
      </div>
      <form id="f" class="space-y-3.5">
        ${!topic ? `<div>
          <label class="text-sm font-medium block mb-1.5">Link to topic <span class="text-ink-faint font-normal">(optional)</span></label>
          <input id="search" placeholder="Search topics\u2026" autocomplete="off" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
          <div id="results" class="mt-1 max-h-36 overflow-y-auto space-y-1"></div>
          <input type="hidden" name="topicId" />
        </div>` : `<input type="hidden" name="topicId" value="${topic.id}" />`}
        <div>
          <label class="text-sm font-medium block mb-1.5">Title</label>
          <input name="title" placeholder="e.g. Talking through fractions" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" />
        </div>
        <div>
          <label class="text-sm font-medium block mb-1.5">Notes <span class="text-ink-faint font-normal">(optional)</span></label>
          <textarea name="note" rows="2" placeholder="Key questions, moments, or things to revisit\u2026" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"></textarea>
        </div>
        ${(transcript || speechSupported()) ? `<div>
          <label class="text-sm font-medium mb-1.5 flex items-center gap-1.5"><i data-lucide="captions" class="w-4 h-4 text-brand-dark"></i>Transcript <span class="text-ink-faint font-normal">(used for AI analysis — edit if needed)</span></label>
          <textarea name="transcript" rows="4" placeholder="${transcript ? '' : 'No speech was captured. You can type or paste what was said here.'}" class="w-full px-3.5 py-2.5 rounded-lg border border-paper-line bg-paper focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none text-sm">${transcript || ''}</textarea>
        </div>` : ''}
        <div class="flex gap-2">
          <button type="button" id="redo" class="px-4 py-2.5 rounded-xl border border-paper-line text-sm font-medium hover:border-ink-faint/40 transition-colors">Re-record</button>
          <button id="save" class="flex-1 px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium transition-colors flex items-center justify-center gap-2"><i data-lucide="save" class="w-4 h-4"></i>Save recording</button>
        </div>
      </form>
    </div>`);
    stage.appendChild(wrap);

    // topic search
    if (!topic) {
      const search = wrap.querySelector('#search');
      const results = wrap.querySelector('#results');
      const hidden = wrap.querySelector('input[name="topicId"]');
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        results.innerHTML = '';
        if (q.length < 2) return;
        d.topics.filter(t => t.name.toLowerCase().includes(q)).slice(0, 6).forEach(t => {
          const r = el(`<button type="button" class="w-full text-left px-3 py-2 rounded-lg hover:bg-paper text-sm flex items-center gap-2"><span class="w-2 h-2 rounded-full" style="background:${SUBJECTS[t.subject].color}"></span><span class="flex-1 truncate">${t.name}</span><span class="text-xs text-ink-faint">${t.subject}</span></button>`);
          r.onclick = () => { hidden.value = t.id; search.value = t.name; results.innerHTML = ''; };
          results.appendChild(r);
        });
      });
    }

    wrap.querySelector('#redo').onclick = () => { blob = null; renderIdle(); };
    wrap.querySelector('#f').onsubmit = async e => {
      e.preventDefault();
      const saveBtn = wrap.querySelector('#save');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Saving\u2026';
      const fd = new FormData(e.target);
      const ext = (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');
      const recId = 'r_' + Math.random().toString(36).slice(2, 9);
      try {
        const path = await saveAudio(recId, blob, ext);
        const topicId = fd.get('topicId') || null;
        store.addRecord(studentId, {
          id: recId,
          type: 'recording',
          title: fd.get('title').trim() || 'Voice recording',
          note: fd.get('note').trim(),
          transcript: (fd.get('transcript') || '').trim(),
          topicId,
          topicName: topicId ? (d.byId.get(topicId)?.name || null) : null,
          sectionId: section ? section.id : (topicId ? sectionIdForTopic(d.byId.get(topicId)) : null),
          sectionLabel: section ? `${section.domain} · Age ${section.age}` : null,
          subject: section ? section.subject : (topicId ? d.byId.get(topicId)?.subject : null),
          audioPath: path,
          duration,
        });
        toast('Recording saved', 'success');
        m.close();
      } catch (err) {
        console.error(err);
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i>Save recording';
        refreshIcons();
        toast('Could not save the recording', 'error');
      }
    };
    refreshIcons();
  }

  renderIdle();
}
