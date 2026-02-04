// StudyPilot – main application logic (split-file version)

console.log('StudyPilot app.js loaded successfully');

function $(id) {
  return document.getElementById(id);
}

// Render the full UI dynamically into #app (single source of truth)
function renderAppShell() {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <header class="header-bar">
      <div>
        <h1>StudyPilot</h1>
        <p>Offline-first study workspace</p>
      </div>
      <button id="openSettings" class="icon-btn" type="button" title="Settings">⚙️</button>
    </header>

    <main class="wrap">

      <!-- Sidebar -->
      <aside class="panel">
        <div class="panel-header">
          <h2>📁 Study Folders</h2>
          <p class="sub">Folder → Subfolder</p>
        </div>

        <div class="panel-body">
          <div class="row">
            <input id="folderName" type="text" placeholder="Add folder (e.g. NET101, Math)" />
            <button class="btn" id="btnAddFolder" type="button">Add Folder</button>
          </div>

          <div class="divider"></div>

          <div class="folder-list" id="folderList"></div>
          <p class="dblclick-hint">Tip: double-click a name to rename. Use the trash icon to delete.</p>

          <div class="row mt-8">
            <input id="subfolderName" type="text" placeholder="Add subfolder (e.g. Calculus 2)" />
            <button class="btn secondary" id="btnAddSubfolder" type="button">Add Subfolder</button>
          </div>
          <p class="hint">⚠️ A subfolder is required to save files (e.g. "General", "Week 1", "Calculus 2")</p>

          <div class="divider"></div>

          <h3 style="margin: 0;">📄 Files in selected subfolder</h3>
          <p class="sub">These are files saved to your folder system (not the Library).</p>
          <div class="hint" id="currentLocation">Select a folder, then pick a subfolder to view/save files.</div>

          <div class="row mt-8">
            <button class="btn secondary" id="btnPickFile" type="button">Add file (PDF / Word / PPT)</button>
            <input
              id="filePicker"
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              style="display:none"
            />
          </div>
          <p class="hint">Stores the ORIGINAL file in the selected folder & subfolder. Double‑click to open.</p>

          <div id="filesList" class="mt-8"></div>
        </div>
      </aside>

      <!-- Main workspace -->
      <section class="panel">
        <div class="panel-header">
          <h2>📚 Workspace</h2>
          <p class="sub">Folder → Subfolder → Files</p>
        </div>

        <div class="panel-body">

          <!-- Top-level modes (YouTube-style) -->
          <div class="modebar" aria-label="App modes">
            <div class="mode active" data-mode="workspace" role="button" tabindex="0">📚 Workspace</div>
            <div class="mode" data-mode="tools" role="button" tabindex="0">🛠 Tools</div>
            <div class="mode" data-mode="library" role="button" tabindex="0">🗂️ Library</div>
          </div>

          <div id="toolsArea">
            <!-- Tabs -->
            <div class="subnav-tabs" role="tablist" aria-label="Tools">
              <div class="navtab active" data-tab="assignment">📄 Assignment</div>
              <div class="navtab" data-tab="summarize">🧾 Summarize</div>
              <div class="navtab" data-tab="mcq">✅ MCQ</div>
              <div class="navtab" data-tab="quiz">🧠 Quiz</div>
              <div class="navtab" data-tab="pop">⚡ Pop Quiz</div>
              <div class="navtab" data-tab="notes">📝 Notes</div>
              <div class="navtab" data-tab="library">🗂️ Library</div>
            </div>

            <!-- Tab views -->
            <div class="card" id="tab-assignment">
              <h3>📄 Assignment</h3>
              <p>Paste assignment instructions and get a breakdown.</p>
              <div class="upload-row">
                <input class="pdf-input" type="file" accept="application/pdf" />
                <span class="upload-hint">(extracts text for this tool only)</span>
              </div>
              <textarea id="input-assignment" placeholder="Paste assignment text here…"></textarea>
              <button class="btn" id="btn-assignment" type="button">Explain Assignment</button>
              <div class="output" id="out-assignment" style="display:none;"></div>
              <div class="row">
                <button class="btn secondary" type="button" data-action="copy" data-target="out-assignment">Copy</button>
                <button class="btn" type="button" data-action="save" data-mode="assignment">Save</button>
              </div>
            </div>

            <div class="card" id="tab-summarize" style="display:none;">
              <h3>🧾 Summarize</h3>
              <p>Paste lesson content and generate a clean summary.</p>
              <div class="upload-row">
                <input class="pdf-input" type="file" accept="application/pdf" />
                <span class="upload-hint">(extracts text for this tool only)</span>
              </div>
              <textarea id="input-summarize" placeholder="Paste lesson text here…"></textarea>
              <button class="btn" id="btn-summarize" type="button">Summarize</button>
              <div class="output" id="out-summarize" style="display:none;"></div>
              <div class="row">
                <button class="btn secondary" type="button" data-action="copy" data-target="out-summarize">Copy</button>
                <button class="btn" type="button" data-action="save" data-mode="summarize">Save</button>
              </div>
            </div>

            <div class="card" id="tab-mcq" style="display:none;">
              <h3>✅ MCQ</h3>
              <p>Generate multiple-choice questions from your lesson text.</p>
              <div class="upload-row">
                <input class="pdf-input" type="file" accept="application/pdf" />
                <span class="upload-hint">(extracts text for this tool only)</span>
              </div>
              <textarea id="input-mcq" placeholder="Paste lesson text here…"></textarea>
              <button class="btn" id="btn-mcq" type="button">Generate MCQs</button>
              <div class="output" id="out-mcq" style="display:none;"></div>
              <div class="row">
                <button class="btn secondary" type="button" data-action="copy" data-target="out-mcq">Copy</button>
                <button class="btn" type="button" data-action="save" data-mode="mcq">Save</button>
              </div>
            </div>

            <div class="card" id="tab-quiz" style="display:none;">
              <h3>🧠 Quiz</h3>
              <p>Generate short-answer quiz questions from your lesson.</p>
              <div class="upload-row">
                <input class="pdf-input" type="file" accept="application/pdf" />
                <span class="upload-hint">(extracts text for this tool only)</span>
              </div>
              <textarea id="input-quiz" placeholder="Paste lesson text here…"></textarea>
              <button class="btn" id="btn-quiz" type="button">Generate Quiz</button>
              <div class="output" id="out-quiz" style="display:none;"></div>
              <div class="row">
                <button class="btn secondary" type="button" data-action="copy" data-target="out-quiz">Copy</button>
                <button class="btn" type="button" data-action="save" data-mode="quiz">Save</button>
              </div>
            </div>

            <div class="card" id="tab-pop" style="display:none;">
              <h3>⚡ Pop Quiz</h3>
              <p>Quick-fire revision prompts.</p>
              <div class="upload-row">
                <input class="pdf-input" type="file" accept="application/pdf" />
                <span class="upload-hint">(extracts text for this tool only)</span>
              </div>
              <textarea id="input-pop" placeholder="Paste lesson text here…"></textarea>
              <button class="btn" id="btn-pop" type="button">Generate Pop Quiz</button>
              <div class="output" id="out-pop" style="display:none;"></div>
              <div class="row">
                <button class="btn secondary" type="button" data-action="copy" data-target="out-pop">Copy</button>
                <button class="btn" type="button" data-action="save" data-mode="pop">Save</button>
              </div>
            </div>

            <div class="card" id="tab-notes" style="display:none;">
              <h3>📝 Notes</h3>
              <p>Paste lecture text and format it into notes.</p>
              <div class="upload-row">
                <input class="pdf-input" type="file" accept="application/pdf" />
                <span class="upload-hint">(extracts text for this tool only)</span>
              </div>
              <textarea id="input-notes" placeholder="Paste lecture text here…"></textarea>
              <button class="btn" id="btn-notes" type="button">Generate Notes</button>
              <div class="output" id="out-notes" style="display:none;"></div>
              <div class="row">
                <button class="btn secondary" type="button" data-action="copy" data-target="out-notes">Copy</button>
                <button class="btn" type="button" data-action="save" data-mode="notes">Save</button>
              </div>
            </div>

            <div class="card" id="tab-library" style="display:none;">
              <h3>🗂️ Library</h3>
              <p>Your saved items will show here.</p>
              <input id="librarySearch" type="text" placeholder="Search saved items…" />
              <div class="row mt-8">
                <button class="btn secondary" id="btn-library-export" type="button">Export JSON</button>
                <button class="btn secondary" id="btn-library-refresh" type="button">Refresh</button>
                <button class="btn danger" id="btn-library-clear" type="button">Clear All</button>
              </div>
              <div id="libraryView" class="mt-12"></div>
            </div>

          </div> <!-- /#toolsArea -->
        </div>
      </section>

    </main>

    <!-- Settings Modal -->
    <div id="settingsModal" class="settings-modal hidden" aria-hidden="true">
      <div class="settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="settings-header">
          <h2>⚙️ Settings</h2>
          <button id="closeSettings" class="icon-btn" type="button" title="Close">✕</button>
        </div>

        <div class="divider"></div>

        <section class="settings-section">
          <h3>Saving</h3>
          <p class="hint">Control where “Save” goes by default (Workspace vs Library) and whether to ask every time.</p>
          <p class="sub">(Settings logic will be wired next.)</p>
        </section>

        <section class="settings-section">
          <h3>Folder Rules</h3>
          <p class="hint">Subfolder requirements, auto-create “General”, and auto-select behavior.</p>
          <p class="sub">(Settings logic will be wired next.)</p>
        </section>

        <section class="settings-section">
          <h3>Documents</h3>
          <p class="hint">PDF / Word / PowerPoint extraction preferences and diagnostics.</p>
          <p class="sub">(Settings logic will be wired next.)</p>
        </section>

        <section class="settings-section">
          <h3>Storage</h3>
          <p class="hint">Clear Library, clear folder metadata, clear uploaded files (IndexedDB), or full reset.</p>
          <p class="sub">(Settings logic will be wired next.)</p>
        </section>

      </div>
    </div>
  `;
}

// Safari-safe sentence splitter (no regex lookbehind)
function splitSentences(text) {
  const t = (text || '').replace(/\r/g, ' ').trim();
  if (!t) return [];

  // Preferred split: keep punctuation by splitting on whitespace that follows sentence end.
  // Older Safari can throw on lookbehind, so wrap in try/catch.
  try {
    const raw = t.split(/(?<=[.!?])\s+/);
    if (raw && raw.length > 1) {
      return raw.map(s => s.trim()).filter(Boolean);
    }
  } catch (e) {
    // ignore and fall back
  }

  // Fallback (no lookbehind): split on sentence-ending punctuation.
  // Note: punctuation is removed, but it is stable across browsers.
  return t
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizePreview(s) {
  return (s || '')
    .replace(/[\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegExp(s) {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractKeywords(text, max = 18) {
  const stop = new Set([
    'the','a','an','and','or','but','if','then','else','when','while','for','to','of','in','on','at','by','with','without','from','into','over','under',
    'is','are','was','were','be','been','being','do','does','did','can','could','should','would','may','might','must','will','shall',
    'this','that','these','those','it','its','they','them','their','you','your','we','our','i','me','my','as','than','also','such','not','no','yes',
    'more','most','less','least','very','much','many','some','any','each','every'
  ]);

  const words = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => w.length >= 4 && w.length <= 20)
    .filter(w => !stop.has(w));

  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, max);
}

function findBestSentenceForTerm(text, term) {
  const sents = splitSentences(text);

  const termRe = new RegExp('\\b' + escapeRegExp(term) + '\\b', 'i');
  const hits = sents.filter(s => termRe.test(s));
  hits.sort((a, b) => a.length - b.length);
  return hits[0] || '';
}

function makeOfflineMCQs(text) {
  const cleaned = (text || '').trim();
  const terms = extractKeywords(cleaned, 20);

  if (!terms.length) {
    return [
      'MCQ Set (offline mode)',
      '',
      'Could not detect enough keywords. Paste a longer lesson text.'
    ].join('\n');
  }

  const letters = ['A','B','C','D'];
  const used = new Set();
  const questions = [];

  for (const term of terms) {
    if (questions.length >= 8) break;
    if (used.has(term)) continue;
    used.add(term);

    const bestSent = findBestSentenceForTerm(cleaned, term);
    const stem = bestSent
      ? normalizePreview(bestSent).replace(new RegExp('\\b' + escapeRegExp(term) + '\\b', 'ig'), '_____')
      : '_____ is best described by which option?';

    const distractors = terms.filter(t => t !== term).slice(0, 12);
    const picked = shuffleArray(distractors).slice(0, 3);

    const options = shuffleArray([term, ...picked]);
    const correctIndex = options.indexOf(term);
    const answerLetter = letters[correctIndex] || 'A';

    const optsLines = options.map((opt, idx) => '   ' + letters[idx] + ') ' + opt);

    questions.push([
      (questions.length + 1) + ') Fill the blank:',
      '   "' + stem + '"',
      ...optsLines,
      '   Answer: ' + answerLetter,
      ''
    ].join('\n'));
  }

  return ['MCQ Set (offline mode)', '', ...questions].join('\n');
}

function offlineGenerate(mode, text) {
  const cleaned = (text || '').trim();

  if (mode === 'assignment') {
    if (!cleaned) return 'Assignment Breakdown (offline mode)\n\nPaste your assignment instructions and click Explain Assignment.';
    const preview = normalizePreview(cleaned).slice(0, 240) + (cleaned.length > 240 ? '…' : '');
    return [
      'Assignment Breakdown (offline mode)',
      '',
      '1) What you need to do',
      '- Turn the prompt into a checklist.',
      '- Answer every rubric point using headings.',
      '- Submit in the required format.',
      '',
      '2) Checklist',
      '- [ ] Read requirements and grading rubric',
      '- [ ] Write outline with headings',
      '- [ ] Draft answers + examples',
      '- [ ] Proofread + formatting',
      '',
      'Preview:',
      preview
    ].join('\n');
  }

  if (mode === 'summarize') {
    if (!cleaned) return 'Lesson Summary (offline mode)\n\nPaste lesson content and click Summarize.';
    const sents = splitSentences(cleaned);
    const bullets = sents.slice(0, 10).map(s => '• ' + normalizePreview(s));
    return [
      'Lesson Summary (offline mode)',
      '',
      'Key points:',
      ...bullets,
      '',
      'Quick recall:',
      '• Define: ______',
      '• Explain why: ______',
      '• Give an example of: ______'
    ].join('\n');
  }

  if (mode === 'mcq') {
    if (!cleaned) return 'MCQ Set (offline mode)\n\nPaste lesson content and click Generate MCQs.';
    return makeOfflineMCQs(cleaned);
  }

  if (mode === 'quiz') {
    if (!cleaned) return 'Quiz (offline mode)\n\nPaste lesson content and click Generate Quiz.';
    const sents = splitSentences(cleaned);
    const qs = sents.slice(0, 8).map((s, i) => (i + 1) + ') Explain in your own words: "' + normalizePreview(s).slice(0, 90) + '…"');
    return ['Quiz (offline mode)', '', ...qs].join('\n');
  }

  if (mode === 'pop') {
    if (!cleaned) return 'Pop Quiz (offline mode)\n\nPaste lesson content and click Generate Pop Quiz.';
    const sents = splitSentences(cleaned);
    const qs = sents.slice(0, 5).map((s, i) => (i + 1) + ') Pop prompt: What does this mean? "' + normalizePreview(s).slice(0, 70) + '…"');
    return ['Pop Quiz (offline mode)', '', ...qs].join('\n');
  }

  // notes
  if (!cleaned) return 'Notes (offline mode)\n\nPaste lecture content and click Generate Notes.';
  const sents = splitSentences(cleaned);
  const bullets = sents.slice(0, 18).map(s => '• ' + normalizePreview(s));
  return ['Notes (offline mode)', '', 'Key points:', ...bullets, '', 'Quick recall:', '• Definition: ______ is ______', '• Example: ______ shows ______', '• Common mistake: ______'].join('\n');
}

function showOutput(mode, text) {
  const out = $('out-' + mode);
  if (!out) return;
  out.textContent = text;
  out.style.display = 'block';
}

// ---- Copy & Library helpers ----
function copyOutputById(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = el.textContent || '';
  if (!text) return;

  // Modern clipboard (requires HTTPS + permission)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).catch(() => {
      // fall back below
      fallbackCopyText(text);
    });
    return;
  }

  fallbackCopyText(text);
}

function fallbackCopyText(text) {
  // Works on many browsers even when Clipboard API is blocked
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    // If copying fails, do nothing (user can still select manually)
  }
  document.body.removeChild(ta);
}

function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem('studypilot_library') || '[]');
  } catch {
    return [];
  }
}

function saveLibrary(items) {
  localStorage.setItem('studypilot_library', JSON.stringify(items));
}

function saveToLibrary(mode, content) {
  if (!content) return;
  const items = loadLibrary();
  items.unshift({
    id: Date.now(),
    mode,
    content,
    created: new Date().toISOString()
  });
  saveLibrary(items);
}

// --- Library tab helpers ---
function formatMode(mode) {
  const m = (mode || '').toLowerCase();
  if (m === 'mcq') return 'MCQ';
  if (m === 'pop') return 'Pop Quiz';
  if (m === 'quiz') return 'Quiz';
  if (m === 'summarize') return 'Summary';
  if (m === 'notes') return 'Notes';
  if (m === 'assignment') return 'Assignment';
  return mode || 'Item';
}

function deleteLibraryItem(id) {
  const items = loadLibrary();
  const next = items.filter(it => String(it.id) !== String(id));
  saveLibrary(next);
}

function exportLibraryJSON() {
  const items = loadLibrary();
  const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'studypilot-library.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderLibraryView() {
  const view = document.getElementById('libraryView');
  if (!view) return;

  const qEl = document.getElementById('librarySearch');
  const q = (qEl ? qEl.value : '').trim().toLowerCase();

  const items = loadLibrary();
  const filtered = q
    ? items.filter(it => {
        const hay = ((it.mode || '') + ' ' + (it.content || '')).toLowerCase();
        return hay.includes(q);
      })
    : items;

  // Clear view
  view.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.textContent = q
      ? 'No results for "' + q + '".'
      : 'No saved items yet. Generate something and click “Save to Library”.';
    view.appendChild(empty);
    return;
  }

  // Render newest first (items are already unshifted; just render as-is)
  filtered.forEach((it) => {
    const wrap = document.createElement('div');
    wrap.style.border = '1px solid rgba(255,255,255,0.12)';
    wrap.style.borderRadius = '12px';
    wrap.style.padding = '10px';
    wrap.style.marginTop = '10px';
    wrap.style.background = 'rgba(0,0,0,0.12)';

    const top = document.createElement('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.style.gap = '10px';
    top.style.alignItems = 'center';

    const meta = document.createElement('div');
    const date = new Date(it.created || Date.now()).toLocaleString();
    meta.textContent = '[' + formatMode(it.mode) + '] ' + date;
    meta.style.fontWeight = '700';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn secondary';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.setAttribute('data-lib-action', 'copy');
    copyBtn.setAttribute('data-lib-id', String(it.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.setAttribute('data-lib-action', 'delete');
    delBtn.setAttribute('data-lib-id', String(it.id));

    actions.appendChild(copyBtn);
    actions.appendChild(delBtn);

    top.appendChild(meta);
    top.appendChild(actions);

    const content = document.createElement('div');
    content.style.whiteSpace = 'pre-wrap';
    content.style.marginTop = '8px';
    content.textContent = it.content || '';

    wrap.appendChild(top);
    wrap.appendChild(content);
    view.appendChild(wrap);
  });
}

function wireGenerateButtons() {
  const map = [
    ['assignment', 'input-assignment', 'btn-assignment'],
    ['summarize', 'input-summarize', 'btn-summarize'],
    ['mcq', 'input-mcq', 'btn-mcq'],
    ['quiz', 'input-quiz', 'btn-quiz'],
    ['pop', 'input-pop', 'btn-pop'],
    ['notes', 'input-notes', 'btn-notes']
  ];

  map.forEach(([mode, inputId, btnId]) => {
    const input = $(inputId);
    const btn = $(btnId);
    if (!input || !btn) return;

    btn.addEventListener('click', () => {
      const result = offlineGenerate(mode, input.value);
      showOutput(mode, result);
    });
  });
}

function setActiveTab(key) {
  const tabs = document.querySelectorAll('.navtab[data-tab]');
  const views = {
    assignment: $('tab-assignment'),
    summarize: $('tab-summarize'),
    mcq: $('tab-mcq'),
    quiz: $('tab-quiz'),
    pop: $('tab-pop'),
    notes: $('tab-notes'),
    library: $('tab-library')
  };

  // Highlight active tab
  tabs.forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === key);
  });

  // Hide all views then show selected
  Object.keys(views).forEach(k => {
    if (views[k]) views[k].style.display = 'none';
  });
  if (views[key]) views[key].style.display = 'block';
  if (key === 'library') renderLibraryView();
}

// ---- App modes (Workspace / Tools / Library) ----
const LS_APP_MODE = 'studypilot_app_mode_v1';

function getAppMode() {
  return localStorage.getItem(LS_APP_MODE) || 'workspace';
}

function setAppMode(mode, opts = {}) {
  const m = (mode || 'workspace').toLowerCase();
  const safe = (m === 'tools' || m === 'library') ? m : 'workspace';
  if (!opts.silent) localStorage.setItem(LS_APP_MODE, safe);

  // Modebar active state
  document.querySelectorAll('.modebar .mode[data-mode]').forEach(el => {
    el.classList.toggle('active', String(el.getAttribute('data-mode')) === safe);
  });

  // Layout targets
  const wrap = document.querySelector('.wrap') || document.querySelector('.app') || document.querySelector('main') || document.body;
  const sidebar = document.querySelector('aside.panel');
  const tabsRow = document.querySelector('.subnav') || document.querySelector('.subnav-tabs') || document.querySelector('.tabs') || document.querySelector('.nav');
  const toolsArea = document.getElementById('toolsArea');

  // Helper: show/hide
  const show = (el) => { if (el) el.style.display = ''; };
  const hide = (el) => { if (el) el.style.display = 'none'; };

  if (safe === 'workspace') {
    show(sidebar);
    // Restore multi-column layout if your CSS uses grid
    if (wrap && wrap.style) wrap.style.gridTemplateColumns = '';

    show(tabsRow);
    show(toolsArea);

    // If library tab was open, snap back to Assignment
    const activeTab = document.querySelector('.navtab.active[data-tab]');
    const key = activeTab ? activeTab.getAttribute('data-tab') : '';
    if (key === 'library') setActiveTab('assignment');

    return;
  }

  if (safe === 'tools') {
    hide(sidebar);
    if (wrap && wrap.style) wrap.style.gridTemplateColumns = '1fr';

    show(tabsRow);
    show(toolsArea);

    // If library tab was open, snap to Assignment
    const activeTab = document.querySelector('.navtab.active[data-tab]');
    const key = activeTab ? activeTab.getAttribute('data-tab') : '';
    if (key === 'library') setActiveTab('assignment');

    return;
  }

  // library
  hide(sidebar);
  if (wrap && wrap.style) wrap.style.gridTemplateColumns = '1fr';

  // Hide tool tabs row so Library feels like its own section
  hide(tabsRow);

  // Force Library view (keeps your existing Library rendering)
  if (toolsArea) show(toolsArea);
  setActiveTab('library');
}

function wireModeBar() {
  const modes = document.querySelectorAll('.modebar .mode[data-mode]');
  if (!modes.length) return;

  modes.forEach(el => {
    const mode = el.getAttribute('data-mode');

    el.addEventListener('click', () => setAppMode(mode));

    // Keyboard support
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setAppMode(mode);
      }
    });
  });
}

// ---- Settings modal (Option B gear popup) ----
function wireSettingsModal() {
  const openBtn = document.getElementById('openSettings');
  const closeBtn = document.getElementById('closeSettings');
  const modal = document.getElementById('settingsModal');
  if (!openBtn || !modal) return;

  // Hard force-hide by default. This fixes cases where CSS .hidden isn't applied or is overridden.
  const forceHidden = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
  };

  const forceShown = () => {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
  };

  // Always start hidden on load.
  forceHidden();

  const open = () => {
    forceShown();
  };

  const close = () => {
    forceHidden();
  };

  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    open();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
  }

  // Click outside the panel closes
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

// Helper: ensure PDF.js is loaded (tries local, then CDN)
async function ensurePdfJsLoaded(timeoutMs = 5000) {
  // If already available, we're done.
  if (window.pdfjsLib) return true;

  const candidates = [
    // Local first (recommended): put pdf.min.js in /vendor/pdf.min.js
    './vendor/pdf.min.js',
    // CDN fallbacks
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js'
  ];

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });

  const start = Date.now();

  for (const src of candidates) {
    try {
      await loadScript(src);
      // Wait briefly for pdfjsLib to appear
      const t0 = Date.now();
      while (!window.pdfjsLib && (Date.now() - t0) < 1000) {
        await new Promise(r => setTimeout(r, 25));
      }
      if (window.pdfjsLib) return true;
    } catch (e) {
      console.warn(e);
    }
    if (Date.now() - start > timeoutMs) break;
  }

  return !!window.pdfjsLib;
}

async function extractTextFromPDF(file) {
  if (!file) return '';

  // Wait briefly for PDF.js to be available (HTML may load it asynchronously)
  async function waitForPdfJs(timeoutMs = 5000) {
    const ok = await ensurePdfJsLoaded(timeoutMs);
    if (ok) return true;
    const start = Date.now();
    while (!window.pdfjsLib) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise(r => setTimeout(r, 50));
    }
    return true;
  }

  const ready = await waitForPdfJs();
  if (!ready) {
    throw new Error(
      'PDF.js failed to load. Workaround: add a local copy at ./vendor/pdf.min.js and reload.'
    );
  }

  // Configure worker (required)
  // Do NOT forcibly overwrite workerSrc if HTML already set it.
  // Many users have cdnjs blocked; keep existing or fall back safely.
  const v = '4.0.379';
  const workerCdnA = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + v + '/pdf.worker.min.js';
  const workerCdnB = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + v + '/build/pdf.worker.min.js';

  // Allow an explicit override from HTML if desired:
  // window.STUDYPILOT_PDF_WORKER_SRC = '...';
  if (typeof window.STUDYPILOT_PDF_WORKER_SRC === 'string' && window.STUDYPILOT_PDF_WORKER_SRC.trim()) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.STUDYPILOT_PDF_WORKER_SRC.trim();
  } else if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // Default to jsDelivr (often less blocked). If you know cdnjs works, you can switch.
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerCdnB;
  }

  const arrayBuffer = await file.arrayBuffer();
  let pdf;

  // Attempt 1: normal worker mode (fast)
  try {
    pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch (e1) {
    console.error('PDF.js getDocument failed (attempt 1). workerSrc=', window.pdfjsLib.GlobalWorkerOptions.workerSrc, e1);

    // Attempt 2: fallback mode (no worker) — works when Brave/adblock blocks the worker
    try {
      pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
      console.warn('PDF.js loaded using disableWorker fallback.');
    } catch (e2) {
      console.error('PDF.js getDocument failed (attempt 2, disableWorker).', e2);
      throw e2;
    }
  }

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map(it => it.str);
    fullText += strings.join(' ') + '\n\n';
  }

  // Cleanup
  return fullText
    .replace(/\u0000/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function wirePdfInputs() {
  document.querySelectorAll('.pdf-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const card = input.closest('.card');
      const textarea = card ? card.querySelector('textarea') : null;
      if (!textarea) return;

      textarea.value = 'Extracting text from PDF…';

      try {
        const text = await extractTextFromPDF(file);
        textarea.value = text || 'No selectable text found in this PDF. If it is scanned images, PDF text extraction won\'t work without OCR.';

        // Offer to save extracted PDF text into the selected Folder/Topic
        const extracted = textarea.value;
        const ok = confirm('Save this PDF text into the selected folder/subfolder?');
        if (ok) {
          if (!String(getActiveTopicId() || '')) {
            alert('Select a subfolder first, then save this PDF text.');
          } else {
            const name = prompt('File name:', file.name || 'PDF Text');
            if (name !== null) {
              saveContentAsFile({ type: 'pdf', name, content: extracted });
            }
          }
        }
      } catch (err) {
        console.error(err);
        textarea.value = 'Failed to read PDF: ' + (err && err.message ? err.message : String(err));
      }

      // Allow uploading same file again
      input.value = '';
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // Build the UI dynamically first
  renderAppShell();

  console.log('DOM fully loaded');

  // Tabs
  document.querySelectorAll('.navtab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const key = tab.getAttribute('data-tab');
      if (key) setActiveTab(key);
    });
  });

  // Top-level modes (Workspace / Tools / Library)
  wireModeBar();
  setAppMode(getAppMode(), { silent: true });

  // Settings modal (gear)
  wireSettingsModal();

  // PDF inputs (per-card)
  wirePdfInputs();

  wireGenerateButtons();

  // Copy / Save actions
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    if (!action) return;

    if (action === 'copy') {
      const target = btn.getAttribute('data-target');
      if (target) copyOutputById(target);
    }

    if (action === 'save') {
      const mode = btn.getAttribute('data-mode');
      if (!mode) return;
      const out = document.getElementById('out-' + mode);
      if (out && out.textContent) {
        // Save to Library (existing behavior)
        saveToLibrary(mode, out.textContent);
        renderLibraryView();

        // Also save into the active Folder/Topic as a “file”
        const pretty = formatMode(mode);
        const suggested = pretty + ' - ' + new Date().toLocaleDateString();
        const name = prompt('Save as file name:', suggested);
        if (name !== null) {
          saveContentAsFile({ type: mode, name, content: out.textContent });
        }
      }
    }

    // Library item actions (rendered inside #libraryView)
    const libAction = btn.getAttribute('data-lib-action');
    if (libAction) {
      const id = btn.getAttribute('data-lib-id');
      if (!id) return;

      if (libAction === 'copy') {
        const items = loadLibrary();
        const item = items.find(x => String(x.id) === String(id));
        if (item && item.content) {
          // Copy content directly
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(item.content).catch(() => fallbackCopyText(item.content));
          } else {
            fallbackCopyText(item.content);
          }
        }
      }

      if (libAction === 'delete') {
        const ok = confirm('Delete this saved item?');
        if (!ok) return;
        deleteLibraryItem(id);
        renderLibraryView();
      }

      return;
    }
  });

  // Library controls (optional UI)
  const search = document.getElementById('librarySearch');
  if (search) search.addEventListener('input', () => renderLibraryView());

  const refreshBtn = document.getElementById('btn-library-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', () => renderLibraryView());

  const exportBtn = document.getElementById('btn-library-export');
  if (exportBtn) exportBtn.addEventListener('click', () => exportLibraryJSON());

  const clearBtn = document.getElementById('btn-library-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const ok = confirm('Clear ALL saved items?');
    if (!ok) return;
    saveLibrary([]);
    renderLibraryView();
  });

  // ---- Folders + optional Topics (Explorer-style) ----
  // Data model (localStorage: studypilot_folders_v2)
  // folders: [{ id, name, topics: [{ id, name }] }]
  // active: studypilot_active_folder, studypilot_active_topic

  const LS_FOLDERS = 'studypilot_folders_v2';
  const LS_ACTIVE_FOLDER = 'studypilot_active_folder';
  const LS_ACTIVE_TOPIC = 'studypilot_active_topic';

  // Files saved into Folder/Topic (works only if Files panel exists in HTML)
const LS_FILES = 'studypilot_files_v1';

function loadFiles() {
  try {
    const raw = localStorage.getItem(LS_FILES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


function saveFiles(files) {
  localStorage.setItem(LS_FILES, JSON.stringify(files));
}

// ---- IndexedDB for original uploaded files (PDF / DOC / PPT) ----
const IDB_DB = 'studypilot_blobs_v1';
const IDB_STORE = 'blobs';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}


async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Best-effort cleanup: remove IndexedDB blobs for uploaded files being deleted
function cleanupUploadBlobs(files) {
  try {
    (files || []).forEach(f => {
      if (f && f.type === 'upload') {
        idbDel(String(f.blobId || f.id)).catch(err => console.error(err));
      }
    });
  } catch (e) {
    console.error(e);
  }
}

function getActiveTabKey() {
  const active = document.querySelector('.navtab.active[data-tab]');
  return active ? active.getAttribute('data-tab') : 'summarize';
}


function setToolInputForTab(tabKey, text) {
  const map = {
    assignment: 'input-assignment',
    summarize: 'input-summarize',
    mcq: 'input-mcq',
    quiz: 'input-quiz',
    pop: 'input-pop',
    notes: 'input-notes'
  };
  const id = map[tabKey];
  const el = id ? document.getElementById(id) : null;
  if (el) el.value = text || '';
}

async function openUploadedFile(file) {
  try {
    const payload = await idbGet(String(file.blobId || file.id));
    if (!payload || !payload.blob) {
      alert('Original file not found (it may have been cleared).');
      return;
    }
    const url = URL.createObjectURL(payload.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    console.error(e);
    alert('Failed to open file.');
  }
}

function renderFilesPanel() {
  const filesList = document.getElementById('filesList');
  const loc = document.getElementById('currentLocation');
  if (!filesList || !loc) return; // HTML might not include this yet
  // Ensure upload controls exist (JS-only)
ensureFilesControls();  

  const folders = loadFolders();
  const folderId = String(getActiveFolderId() || '');
  const topicId = String(getActiveTopicId() || '');

  const folder = folders.find(f => String(f.id) === folderId);
  const topic = folder && Array.isArray(folder.topics)
    ? folder.topics.find(t => String(t.id) === topicId)
    : null;

  if (!folder) {
    loc.textContent = 'Select a folder to start saving files.';
    filesList.innerHTML = '';
    return;
  }

  if (!topicId) {
    loc.textContent = 'Select a subfolder to view and save files.';
    filesList.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No subfolder selected. Pick one under the active folder to start saving files.';
    filesList.appendChild(empty);
    return;
  }

  loc.textContent = topic
    ? ('Saving to: ' + folder.name + ' / ' + topic.name)
    : ('Saving to: ' + folder.name);

  const all = loadFiles();
  const filtered = all.filter(f => {
    if (String(f.folderId) !== folderId) return false;
    return String(f.topicId || '') === topicId;
  });

  filesList.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = topic
      ? 'No files in this subfolder yet. Generate something and click Save.'
      : 'No files in this folder yet. Generate something and click Save.';
    filesList.appendChild(empty);
    return;
  }

  filtered.forEach((file) => {
    const row = document.createElement('div');
    row.className = 'topic';
    row.style.marginLeft = '0';

    const left = document.createElement('div');
    left.innerHTML =
      `<strong>${escapeHtml(file.name || 'Untitled')}</strong>` +
      `<div class="hint" style="margin: 2px 0 0;">${escapeHtml(String(file.type || 'file').toUpperCase())}</div>`;

    const actions = document.createElement('div');
    actions.className = 'topic-actions';

    const useBtn = document.createElement('button');
    useBtn.className = 'icon-btn';
    useBtn.type = 'button';
    useBtn.title = 'Load into current tool';
    useBtn.textContent = '↩️';

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.type = 'button';
    delBtn.title = 'Delete file';
    delBtn.textContent = '🗑️';

    actions.appendChild(useBtn);
    actions.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(actions);

    const loadIntoTool = () => {
      if (file.type === 'upload') {
        openUploadedFile(file);
        return;
      }
      const tab = getActiveTabKey();
      const key = tab === 'library' ? 'summarize' : tab;
      if (tab === 'library') setActiveTab('summarize');
      setToolInputForTab(key, file.content || '');
    };

    row.addEventListener('dblclick', () => loadIntoTool());
    useBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      loadIntoTool();
    });


    delBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ok = confirm('Delete file "' + (file.name || 'Untitled') + '"?');
      if (!ok) return;
      if (file.type === 'upload') {
        try {
          await idbDel(String(file.blobId || file.id));
        } catch (err) {
          console.error(err);
        }
      }
      const allFiles = loadFiles();
      saveFiles(allFiles.filter(x => String(x.id) !== String(file.id)));
      renderFilesPanel();
    });

    filesList.appendChild(row);
  });
}

function saveContentAsFile({ type, name, content }) {
  const folderId = String(getActiveFolderId() || '');
  if (!folderId) {
    alert('Create/select a folder first, then Save.');
    return;
  }

  const topicId = String(getActiveTopicId() || '');
  if (!topicId) {
    alert('Select a subfolder first, then Save.');
    return;
  }
  const filename = (name || '').trim() || (String(type || 'File') + ' - ' + new Date().toLocaleString());

  const files = loadFiles();
  files.unshift({
    id: Date.now(),
    type: type || 'file',
    name: filename,
    content: content || '',
    created: new Date().toISOString(),
    folderId,
    topicId
  });
  saveFiles(files);
  renderFilesPanel();
}

  function loadFolders() {
    try {
      const raw = localStorage.getItem(LS_FOLDERS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveFolders(folders) {
    localStorage.setItem(LS_FOLDERS, JSON.stringify(folders));
  }

  function setFolderExpanded(folderId, expanded) {
    const folders = loadFolders();
    const f = folders.find(x => String(x.id) === String(folderId));
    if (!f) return;
    f.expanded = !!expanded;
    saveFolders(folders);
  }

  function toggleFolderExpanded(folderId) {
    const folders = loadFolders();
    const f = folders.find(x => String(x.id) === String(folderId));
    if (!f) return;
    f.expanded = !f.expanded;
    saveFolders(folders);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getActiveFolderId() {
    return localStorage.getItem(LS_ACTIVE_FOLDER) || '';
  }

  function setActiveFolderId(id) {
    localStorage.setItem(LS_ACTIVE_FOLDER, String(id || ''));
  }

  function getActiveTopicId() {
    return localStorage.getItem(LS_ACTIVE_TOPIC) || '';
  }

  function setActiveTopicId(id) {
    localStorage.setItem(LS_ACTIVE_TOPIC, String(id || ''));
  }

  // Ensure sidebar controls exist (JS-only: we inject a Reset + Topic add UI as needed)
  function ensureFolderControls() {
    const panelBody = document.querySelector('aside.panel .panel-body');
    if (!panelBody) return;

    // Reset button (optional)
    if (!document.getElementById('btn-reset-fs')) {
      const row = document.createElement('div');
      row.className = 'row mt-12';

      const spacer = document.createElement('div');
      spacer.className = 'hint';
      spacer.textContent = 'Tip: use the trash icon to delete items.';

      const reset = document.createElement('button');
      reset.className = 'btn reset';
      reset.id = 'btn-reset-fs';
      reset.type = 'button';
      reset.textContent = 'Reset';
      reset.title = 'Clear all folders + topics';

      // Add below the folder list
      const list = document.getElementById('folderList');
      if (list && list.parentElement) {
        list.parentElement.appendChild(spacer);
        list.parentElement.appendChild(row);
        row.appendChild(document.createElement('div'));
        row.appendChild(reset);
      }

      reset.addEventListener('click', () => {
        const ok = confirm('Reset will delete ALL folders and topics. Continue?');
        if (!ok) return;
        localStorage.removeItem(LS_FOLDERS);
        localStorage.removeItem(LS_ACTIVE_FOLDER);
        localStorage.removeItem(LS_ACTIVE_TOPIC);
        localStorage.removeItem(LS_FILES);
        renderFolders();
      });
    }
  }

  // Files panel controls: prefer existing HTML (#btnPickFile/#filePicker), else inject a fallback
  function ensureFilesControls() {
    const loc = document.getElementById('currentLocation');
    const filesList = document.getElementById('filesList');
    if (!loc || !filesList) return;

    // If HTML already includes controls, wire them once
    const btn = document.getElementById('btnPickFile');
    const input = document.getElementById('filePicker');
    if (btn && input) {
      if (btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';

      btn.addEventListener('click', () => {
        const folderId = String(getActiveFolderId() || '');
        const topicId = String(getActiveTopicId() || '');
        if (!folderId) {
          alert('Select a folder first.');
          return;
        }
        if (!topicId) {
          alert('Select a subfolder first, then add a file.');
          return;
        }
        input.click();
      });

      input.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const folderId = String(getActiveFolderId() || '');
        const topicId = String(getActiveTopicId() || '');
        if (!folderId || !topicId) {
          alert('Select a folder and subfolder first.');
          input.value = '';
          return;
        }

        const id = Date.now();

        // Store original blob in IndexedDB
        await idbPut(String(id), {
          blob: file,
          name: file.name,
          type: file.type || '',
          size: file.size || 0
        });

        // Store metadata in localStorage
        const files = loadFiles();
        files.unshift({
          id,
          type: 'upload',
          name: file.name,
          content: '',
          created: new Date().toISOString(),
          folderId,
          topicId,
          blobId: id,
          mime: file.type || '',
          size: file.size || 0
        });
        saveFiles(files);
        renderFilesPanel();

        // Optional: extract PDF text for tools (keeps original)
        const isPdf = (file.type === 'application/pdf') || String(file.name || '').toLowerCase().endsWith('.pdf');
        if (isPdf) {
          const ok = confirm('Extract text from this PDF for summaries/quizzes too? (Original kept)');
          if (ok) {
            try {
              const text = await extractTextFromPDF(file);
              if (text && text.trim()) {
                saveContentAsFile({ type: 'pdf', name: file.name, content: text });
              } else {
                alert('No selectable text found in this PDF.');
              }
            } catch (err) {
              console.error(err);
              alert('PDF extraction failed.');
            }
          }
        }

        // Allow picking the same file again
        input.value = '';
      });

      return;
    }

    // Fallback: inject controls if HTML is missing them
    if (document.getElementById('btnPickFile') || document.getElementById('filePicker')) return;

    const row = document.createElement('div');
    row.className = 'row mt-8';

    const b = document.createElement('button');
    b.className = 'btn secondary';
    b.id = 'btnPickFile';
    b.type = 'button';
    b.textContent = 'Add file (PDF/Word/PPT)';

    const i = document.createElement('input');
    i.id = 'filePicker';
    i.type = 'file';
    i.style.display = 'none';
    i.accept = [
      '.pdf,.doc,.docx,.ppt,.pptx',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ].join(',');

    row.appendChild(b);
    row.appendChild(i);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Stores the ORIGINAL file in the selected folder & subfolder. Double-click to open.';

    const parent = loc.parentElement || loc;
    parent.insertBefore(row, filesList);
    parent.insertBefore(hint, filesList);

    // Wire now that controls exist
    ensureFilesControls();
  }



  function deleteFolder(folderId) {
    const folders = loadFolders();
    const next = folders.filter(f => String(f.id) !== String(folderId));
    saveFolders(next);

    // Remove all files belonging to this folder (and cleanup uploaded blobs)
    const allFiles = loadFiles();
    const toRemove = allFiles.filter(x => String(x.folderId) === String(folderId));
    cleanupUploadBlobs(toRemove);
    saveFiles(allFiles.filter(x => String(x.folderId) !== String(folderId)));

    // Clear active selections if needed
    if (String(getActiveFolderId()) === String(folderId)) {
      setActiveFolderId(next[0] ? next[0].id : '');
      setActiveTopicId('');
    }

    renderFolders();
  }

  function renameFolder(folderId, newName) {
    const name = (newName || '').trim();
    if (!name) return;

    const folders = loadFolders();
    const f = folders.find(x => String(x.id) === String(folderId));
    if (!f) return;

    // Prevent duplicates (case-insensitive) across folders
    if (folders.some(x => String(x.id) !== String(folderId) && String(x.name || '').toLowerCase() === name.toLowerCase())) {
      alert('A folder with that name already exists.');
      return;
    }

    f.name = name;
    saveFolders(folders);
    renderFolders(f.id);
    renderFilesPanel();
  }

  function renameTopic(folderId, topicId, newName) {
    const name = (newName || '').trim();
    if (!name) return;

    const folders = loadFolders();
    const f = folders.find(x => String(x.id) === String(folderId));
    if (!f) return;

    f.topics = Array.isArray(f.topics) ? f.topics : [];
    const t = f.topics.find(x => String(x.id) === String(topicId));
    if (!t) return;

    // Prevent duplicates within the same folder
    if (f.topics.some(x => String(x.id) !== String(topicId) && String(x.name || '').toLowerCase() === name.toLowerCase())) {
      alert('A subfolder with that name already exists in this folder.');
      return;
    }

    t.name = name;
    saveFolders(folders);
    setActiveFolderId(f.id);
    setActiveTopicId(t.id);
    renderFolders(f.id);
    renderFilesPanel();
  }

  function addTopic(folderId, name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;

    const folders = loadFolders();
    const f = folders.find(x => String(x.id) === String(folderId));
    if (!f) return;

    f.topics = Array.isArray(f.topics) ? f.topics : [];

    // Prevent duplicate topics inside same folder
    if (f.topics.some(t => String(t.name || '').toLowerCase() === trimmed.toLowerCase())) {
      alert('Subfolder already exists in this folder.');
      return;
    }

    const t = { id: Date.now(), name: trimmed };
    f.topics.unshift(t);
    saveFolders(folders);
    setActiveTopicId(t.id);
    renderFolders(f.id);
  }

  function deleteTopic(folderId, topicId) {
    const folders = loadFolders();
    const f = folders.find(x => String(x.id) === String(folderId));
    if (!f) return;

    f.topics = Array.isArray(f.topics) ? f.topics : [];
    f.topics = f.topics.filter(t => String(t.id) !== String(topicId));
    saveFolders(folders);

    // Remove all files belonging to this topic (and cleanup uploaded blobs)
    const allFiles = loadFiles();
    const toRemove = allFiles.filter(x => (String(x.folderId) === String(folderId) && String(x.topicId || '') === String(topicId)));
    cleanupUploadBlobs(toRemove);
    saveFiles(allFiles.filter(x => !(String(x.folderId) === String(folderId) && String(x.topicId || '') === String(topicId))));

    if (String(getActiveTopicId()) === String(topicId)) {
      setActiveTopicId('');
    }

    renderFolders(folderId);
  }

  function renderFolders(forceActiveFolderId = null) {
    ensureFolderControls();

    const list = document.getElementById('folderList');
    if (!list) return;

    const folders = loadFolders();

    // Decide active folder
    const currentActive = forceActiveFolderId != null ? String(forceActiveFolderId) : String(getActiveFolderId() || '');
    const activeFolderId = folders.some(f => String(f.id) === currentActive)
      ? currentActive
      : (folders[0] ? String(folders[0].id) : '');

    if (activeFolderId) setActiveFolderId(activeFolderId);

    // Ensure the active folder is expanded by default (Explorer-like)
    if (activeFolderId) {
      const folders2 = loadFolders();
      const af = folders2.find(x => String(x.id) === String(activeFolderId));
      if (af && typeof af.expanded === 'undefined') {
        af.expanded = true;
        saveFolders(folders2);
      }
    }

    // Clear list
    list.innerHTML = '';

    if (!folders.length) {
      const empty = document.createElement('div');
      empty.className = 'library-empty';
      empty.textContent = 'No folders yet. Add one above.';
      list.appendChild(empty);
      return;
    }

    folders.forEach((f) => {
      const folderRow = document.createElement('div');
      folderRow.className = 'folder' + (String(f.id) === String(activeFolderId) ? ' active' : '');

      // --- Replace left UI with chevron + folder name ---
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const chev = document.createElement('button');
      chev.className = 'icon-btn';
      chev.type = 'button';
      chev.title = (f.expanded ? 'Collapse' : 'Expand');
      chev.textContent = f.expanded ? '▾' : '▸';

      const nameEl = document.createElement('div');
      nameEl.innerHTML = `<strong>${escapeHtml(f.name)}</strong>`;

      // Double-click to rename folder
      nameEl.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = prompt('Rename folder:', f.name);
        if (next === null) return;
        renameFolder(f.id, next);
      });

      left.appendChild(chev);
      left.appendChild(nameEl);
      // --- End replacement ---

      const right = document.createElement('div');
      right.className = 'folder-actions';

      // topics count
      const count = document.createElement('span');
      const topicsArr = Array.isArray(f.topics) ? f.topics : [];
      count.textContent = topicsArr.length + ' subfolders';

      // delete button (also supported via double-click)
      const del = document.createElement('button');
      del.className = 'icon-btn danger';
      del.type = 'button';
      del.title = 'Delete folder';
      del.textContent = '🗑️';

      right.appendChild(count);
      right.appendChild(del);

      folderRow.appendChild(left);
      folderRow.appendChild(right);

      // Chevron click handler: toggle expanded/collapsed, do not change selection
      chev.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFolderExpanded(f.id);
        renderFolders(activeFolderId);
        renderFilesPanel();
      });

      // Single click: select/expand/collapse logic
      // Part 4.5: when selecting a folder, auto-expand and auto-select first subfolder (if any)
      folderRow.addEventListener('click', () => {
        const wasActive = String(f.id) === String(getActiveFolderId());
        setActiveFolderId(f.id);

        const topics = Array.isArray(f.topics) ? f.topics : [];

        if (wasActive) {
          // Toggle expand/collapse on second click
          toggleFolderExpanded(f.id);

          // If we collapsed, clear active subfolder; if we expanded and none selected, pick first
          const foldersNow = loadFolders();
          const now = foldersNow.find(x => String(x.id) === String(f.id));
          const isExpanded = now ? !!now.expanded : false;

          if (!isExpanded) {
            setActiveTopicId('');
          } else {
            const currentTopic = String(getActiveTopicId() || '');
            if (!currentTopic && topics.length) {
              setActiveTopicId(topics[0].id);
            }
          }
        } else {
          // Switching folders: expand and select first subfolder if it exists
          setFolderExpanded(f.id, true);
          if (topics.length) {
            setActiveTopicId(topics[0].id);
          } else {
            setActiveTopicId('');
          }
        }

        renderFolders(f.id);
        renderFilesPanel();
      });


      // Delete button deletes folder
      del.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = confirm('Delete folder "' + f.name + '" and all its subfolders?');
        if (!ok) return;
        deleteFolder(f.id);
      });

      list.appendChild(folderRow);

      // If this is the active folder AND it is expanded, render its optional topics section
      if (String(f.id) === String(activeFolderId) && !!f.expanded) {
        const wrap = document.createElement('div');

        // Topics list
        const topics = Array.isArray(f.topics) ? f.topics : [];
        if (topics.length) {
          const tList = document.createElement('div');
          tList.className = 'topic-list';

          const activeTopicId = String(getActiveTopicId() || '');

          topics.forEach((t) => {
            const tRow = document.createElement('div');
            tRow.className = 'topic' + (String(t.id) === activeTopicId ? ' active' : '');

            const tLeft = document.createElement('div');
            tLeft.textContent = t.name;

            // Double-click to rename subfolder
            tLeft.addEventListener('dblclick', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const next = prompt('Rename subfolder:', t.name);
              if (next === null) return;
              renameTopic(f.id, t.id, next);
            });

            const tActions = document.createElement('div');
            tActions.className = 'topic-actions';

            const tDel = document.createElement('button');
            tDel.className = 'icon-btn danger';
            tDel.type = 'button';
            tDel.title = 'Delete subfolder';
            tDel.textContent = '🗑️';

            tActions.appendChild(tDel);
            tRow.appendChild(tLeft);
            tRow.appendChild(tActions);

            // Select topic
            tRow.addEventListener('click', () => {
              setActiveFolderId(f.id);
              setActiveTopicId(t.id);
              renderFolders(f.id);
              renderFilesPanel();
            });

            // Delete button
            tDel.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const ok = confirm('Delete subfolder "' + t.name + '"?');
              if (!ok) return;
              deleteTopic(f.id, t.id);
            });

            tList.appendChild(tRow);
          });

          wrap.appendChild(tList);
        } else {
          const hint = document.createElement('div');
          hint.className = 'dblclick-hint';
          hint.textContent = 'Subfolders are optional. You can keep using only the folder if you want.';
          wrap.appendChild(hint);
        }

        list.appendChild(wrap);
      }
    });
    // Keep Files panel in sync (if present in HTML)
    renderFilesPanel();
  }

  // Hook up Add Folder input/button from HTML
  const btnAddFolder = document.getElementById('btnAddFolder');
  const folderName = document.getElementById('folderName');
  const btnAddSubfolder = document.getElementById('btnAddSubfolder');
  const subfolderName = document.getElementById('subfolderName'); 

  function addFolderFromInput() {
    if (!folderName) return;
    const name = (folderName.value || '').trim();
    if (!name) return;

    const folders = loadFolders();

    // Prevent duplicates (case-insensitive)
    if (folders.some(f => String(f.name || '').toLowerCase() === name.toLowerCase())) {
      alert('Folder already exists.');
      return;
    }

    const newFolder = { id: Date.now(), name, topics: [] };
    folders.unshift(newFolder);
    saveFolders(folders);

    folderName.value = '';
    setActiveFolderId(newFolder.id);
    setActiveTopicId('');
    renderFolders(newFolder.id);
  }

  function addSubfolderFromInput() {
    if (!subfolderName) return;
    const name = (subfolderName.value || '').trim();
    if (!name) return;

    const folderId = String(getActiveFolderId() || '');
    if (!folderId) {
      alert('Select a folder first, then add a subfolder.');
      return;
    }

    addTopic(folderId, name);
    subfolderName.value = '';
    renderFolders(folderId);
  }

  if (btnAddFolder) btnAddFolder.addEventListener('click', addFolderFromInput);
  if (folderName) {
    folderName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addFolderFromInput();
    });
  }

  if (btnAddSubfolder) btnAddSubfolder.addEventListener('click', addSubfolderFromInput);
  if (subfolderName) {
    subfolderName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addSubfolderFromInput();
    });
  }

  // Initial render
  renderFolders();
  renderFilesPanel();

  // Default tool tab (unless Library mode is active)
  if (getAppMode() !== 'library') setActiveTab('assignment');

  // ========================================
  // NEW FEATURES: Settings + Liked/Pinned/Recent
  // ========================================

  // Settings Management
  const SETTINGS_KEY = 'studypilot_settings_v1';
  
  function loadUserSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      return stored ? JSON.parse(stored) : {
        theme: 'light',
        fontSize: '1',
        lineHeight: '1.5',
        density: 'normal'
      };
    } catch {
      return {
        theme: 'light',
        fontSize: '1',
        lineHeight: '1.5',
        density: 'normal'
      };
    }
  }

  function saveUserSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    applyUserSettings(settings);
  }

  function applyUserSettings(settings) {
    const html = document.documentElement;
    html.setAttribute('data-theme', settings.theme || 'light');
    html.setAttribute('data-density', settings.density || 'normal');
    html.style.setProperty('--user-font-scale', settings.fontSize || '1');
    html.style.setProperty('--user-line-height', settings.lineHeight || '1.5');
  }

  // Apply settings on load
  applyUserSettings(loadUserSettings());


  // ========================================
  // Liked/Pinned/Recent Features
  // ========================================

  // Extend file metadata to include liked/pinned flags
  function toggleFileLiked(fileId) {
    const files = loadFiles();
    const file = files.find(f => String(f.id) === String(fileId));
    if (file) {
      file.liked = !file.liked;
      saveFiles(files);
      renderWorkspaceSections();
    }
  }

  function toggleFilePinned(fileId) {
    const files = loadFiles();
    const file = files.find(f => String(f.id) === String(fileId));
    if (file) {
      file.pinned = !file.pinned;
      saveFiles(files);
      renderWorkspaceSections();
    }
  }

  // Track recent file access
  const RECENT_KEY = 'studypilot_recent_v1';

  function addToRecent(fileId) {
    try {
      let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      recent = recent.filter(id => String(id) !== String(fileId));
      recent.unshift(fileId);
      recent = recent.slice(0, 20); // Keep last 20
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (e) {
      console.error('Failed to update recent files:', e);
    }
  }

  function getRecentFiles() {
    try {
      const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      const files = loadFiles();
      return recent
        .map(id => files.find(f => String(f.id) === String(id)))
        .filter(f => f != null)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  // Render workspace sections
  function renderWorkspaceSections() {
    const mode = getAppMode();
    if (mode !== 'workspace') return;

    const toolsArea = document.getElementById('toolsArea');
    if (!toolsArea) return;

    // Ensure container exists
    let sectionsContainer = document.getElementById('workspace-sections');
    if (!sectionsContainer) {
      sectionsContainer = document.createElement('div');
      sectionsContainer.id = 'workspace-sections';
      // Put it at the top of tools area
      toolsArea.insertBefore(sectionsContainer, toolsArea.firstChild);
    }

    // Reset
    sectionsContainer.innerHTML = '';

    const files = loadFiles();
    const likedFiles = files.filter(f => !!f.liked);
    const pinnedFiles = files.filter(f => !!f.pinned);
    const recentFiles = getRecentFiles();

    const folders = loadFolders();

    function getFileLocation(file) {
      const folder = folders.find(f => String(f.id) === String(file.folderId));
      const topic = folder && Array.isArray(folder.topics)
        ? folder.topics.find(t => String(t.id) === String(file.topicId))
        : null;
      return folder && topic ? `${folder.name} / ${topic.name}` : (folder ? `${folder.name}` : 'Unknown location');
    }

    function createSection(title) {
      const section = document.createElement('div');
      section.className = 'workspace-section';

      const header = document.createElement('div');
      header.className = 'section-header';
      header.textContent = title;

      const list = document.createElement('div');
      list.className = 'file-list';

      section.appendChild(header);
      section.appendChild(list);
      return { section, list };
    }

    function createFileItem(file) {
      const location = getFileLocation(file);
      const typeIcon = file.type === 'upload' ? '📄'
        : file.type === 'notes' ? '📝'
        : file.type === 'mcq' ? '✅'
        : file.type === 'quiz' ? '🧠'
        : file.type === 'pop' ? '⚡'
        : file.type === 'summarize' ? '🧾'
        : file.type === 'assignment' ? '📄'
        : '📋';

      const item = document.createElement('div');
      item.className = 'file-item';

      item.innerHTML = `
        <div class="file-icon">${typeIcon}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(file.name || 'Untitled')}</div>
          <div class="file-meta">${escapeHtml(location)}</div>
        </div>
        <div class="file-actions">
          <button class="icon-btn" type="button" title="${file.liked ? 'Unlike' : 'Like'}" data-action="toggle-like" data-file-id="${file.id}">
            ${file.liked ? '⭐' : '☆'}
          </button>
          <button class="icon-btn" type="button" title="${file.pinned ? 'Unpin' : 'Pin'}" data-action="toggle-pin" data-file-id="${file.id}">
            ${file.pinned ? '📌' : '📍'}
          </button>
        </div>
      `;

      // Click to load/open (but ignore clicks on action buttons)
      item.addEventListener('click', (e) => {
        if (e.target && e.target.closest('[data-action]')) return;

        if (file.type === 'upload') {
          openUploadedFile(file);
        } else {
          const tab = getActiveTabKey();
          const key = tab === 'library' ? 'summarize' : tab;
          if (tab === 'library') setActiveTab('summarize');
          setToolInputForTab(key, file.content || '');
        }

        addToRecent(file.id);
        renderWorkspaceSections();
      });

      // Like/Pin actions
      const likeBtn = item.querySelector('[data-action="toggle-like"]');
      if (likeBtn) {
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFileLiked(file.id);
        });
      }

      const pinBtn = item.querySelector('[data-action="toggle-pin"]');
      if (pinBtn) {
        pinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFilePinned(file.id);
        });
      }

      return item;
    }

    // Nothing to show
    if (!pinnedFiles.length && !likedFiles.length && !recentFiles.length) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'No pinned/liked/recent items yet. Save a file, then pin ⭐ or 📌 it.';
      sectionsContainer.appendChild(empty);
      return;
    }

    // Render sections (cap at 5 items each)
    if (pinnedFiles.length) {
      const { section, list } = createSection('📌 Pinned');
      pinnedFiles.slice(0, 5).forEach(f => list.appendChild(createFileItem(f)));
      sectionsContainer.appendChild(section);
    }

    if (likedFiles.length) {
      const { section, list } = createSection('⭐ Liked');
      likedFiles.slice(0, 5).forEach(f => list.appendChild(createFileItem(f)));
      sectionsContainer.appendChild(section);
    }

    if (recentFiles.length) {
      const { section, list } = createSection('🕒 Recent');
      recentFiles.slice(0, 5).forEach(f => list.appendChild(createFileItem(f)));
      sectionsContainer.appendChild(section);
    }
  }

  // Update file picker to accept Word and PowerPoint
  const filePickerEl = document.getElementById('filePicker');
  if (filePickerEl) {
    filePickerEl.setAttribute('accept', '.pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation');
  }

  // Initial render of workspace sections
  setTimeout(() => {
    renderWorkspaceSections();
  }, 100);

  console.log('✅ Settings, Liked/Pinned/Recent features loaded');
});
