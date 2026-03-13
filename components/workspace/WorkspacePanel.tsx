'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { idbStore } from '@/lib/idb';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import type { ToolMode } from '@/lib/offline/generate';
import { v4 as uuidv4 } from 'uuid';
import { deleteLocalFile, listLocalFiles, upsertLocalFile } from '@/lib/files/local-files';
import { solveOffline } from '@/lib/math/offline-solver';
import type { MathSolution } from '@/lib/math/offline-solver';
import { MathRenderer, MathText } from '@/components/math/MathRenderer';
import { createCard, gradeCard, getDeckStats, loadDecks, saveDeck, deleteDeck, type SRSDeck } from '@/lib/srs/sm2';
import { ChatPanel } from '@/components/workspace/ChatPanel';
import { NotesPanel } from '@/components/workspace/NotesPanel';
import { ExamPlannerPanel } from '@/components/workspace/ExamPlannerPanel';

// ── Types ──────────────────────────────────────────────────────────────────

interface FileRecord {
  id: string; name: string; type: string;
  mimeType?: string; fileSize?: number;
  localBlobId?: string; localFilePath?: string | null;
  content?: string; createdAt: string;
}

export interface WorkspacePanelProps {
  selectedFolder:     string | null;
  selectedTopic:      string | null;
  selectedFolderName: string;
  selectedTopicName:  string;
  onRefresh: () => void;
  filesRefreshKey?: number;
}

// ── Tab config ─────────────────────────────────────────────────────────────

const GENERATE_TABS = [
  { id: 'summarize',  label: 'Summarize',  icon: '📝', hint: 'Key-point summary of your content' },
  { id: 'notes',      label: 'Notes',      icon: '📋', hint: 'Structured study notes' },
  { id: 'rephrase',   label: 'Rephrase',   icon: '🔄', hint: 'Simplified rewrite' },
  { id: 'outline',    label: 'Outline',    icon: '📑', hint: 'Chapter outline with learning objectives' },
  { id: 'practice',   label: 'Practice',   icon: '🎯', hint: 'Practice problem with progressive hints and solution' },
  { id: 'mcq',        label: 'MCQ',        icon: '🧩', hint: 'Multiple-choice questions with answers' },
  { id: 'quiz',       label: 'Quiz',       icon: '❓', hint: 'Open-ended quiz questions' },
  { id: 'flashcards', label: 'Flashcards', icon: '📇', hint: 'Spaced-repetition study cards' },
  { id: 'assignment', label: 'Assignment', icon: '📌', hint: 'Practice assignment questions' },
  { id: 'exam',       label: 'Exam Prep',  icon: '🏆', hint: 'Timed exam with scoring and weak-area analysis' },
] as const;

type GenMode    = (typeof GENERATE_TABS)[number]['id'];
type MainTab    = 'files' | 'generate' | 'chat' | 'notes' | 'math' | 'focus' | 'library' | 'planner';

// ── Helpers ────────────────────────────────────────────────────────────────

function fileIcon(f: FileRecord): string {
  const n = f.name.toLowerCase();
  if (f.mimeType === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (n.match(/\.docx?$/))  return '📘';
  if (n.match(/\.pptx?$/))  return '📙';
  if (n.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return '🖼️';
  if (n.match(/\.(txt|md)$/)) return '📝';
  return '📄';
}

function isPDF(f: FileRecord)   { return f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'); }
function isImage(f: FileRecord) { return !!f.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp|svg)$/); }

function fmt(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function mdToHtml(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(#{1,3})\s+(.+)/gm, (_, h, t) => `<h${h.length} style="margin:14px 0 6px">${t}</h${h.length}>`)
    .replace(/^[•\-]\s+(.+)/gm, '<li style="margin:3px 0">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, '<ul style="padding-left:20px;margin:8px 0">$1</ul>')
    .replace(/\n/g, '<br/>');
}

// ── MCQ renderer ───────────────────────────────────────────────────────────

function MCQView({ content }: { content: string }) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [score,    setScore]    = useState<number | null>(null);

  const blocks = content
    .split(/\n(?=\*?\*?Q\d+[\.\)])/i)
    .map(b => b.trim())
    .filter(b => /Q\d+/i.test(b) && b.length > 10);

  if (blocks.length === 0)
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;

  function revealAll() {
    const r: Record<number, boolean> = {};
    blocks.forEach((_, i) => { r[i] = true; });
    setRevealed(r);
    let correct = 0;
    blocks.forEach((block, qi) => {
      const ans = block.match(/✓\s*([A-D])\)?/)?.[1]
        ?? block.match(/Answer:\s*([A-D])\b/i)?.[1];
      if (ans && selected[qi] === ans) correct++;
    });
    setScore(correct);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {blocks.map((block, qi) => {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
          const stem  = lines[0].replace(/^\*?\*?Q\d+[\.\)]\*?\*?\s*/i, '');
          const opts  = lines.filter(l => /^[A-D]\)/.test(l));
          const ans   = block.match(/✓\s*([A-D])\)?/)?.[1] ?? block.match(/Answer:\s*([A-D])\b/i)?.[1];
          const isRev = revealed[qi];
          return (
            <div key={qi} className="quiz-card">
              <div className="quiz-q-num">Q{qi + 1} of {blocks.length}</div>
              <div className="quiz-q-text">{stem}</div>
              <div className="quiz-options">
                {opts.map((opt, oi) => {
                  const letter = opt.match(/^([A-D])\)/)?.[1] ?? '';
                  const text   = opt.replace(/^[A-D]\)\s*/, '');
                  const isSel  = selected[qi] === letter;
                  let cls = 'quiz-option';
                  if (isRev) { if (letter === ans) cls += ' correct'; else if (isSel) cls += ' wrong'; }
                  else if (isSel) cls += ' selected';
                  return (
                    <div key={oi} className={cls}
                      onClick={() => { if (!isRev) setSelected(p => ({ ...p, [qi]: letter })); }}>
                      <span className="quiz-opt-letter">{letter}</span>
                      <span>{text}</span>
                      {isRev && letter === ans && <span style={{ marginLeft: 'auto' }}>✓</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {!isRev && selected[qi] && (
                  <button className="btn btn-sm btn-primary"
                    onClick={() => setRevealed(p => ({ ...p, [qi]: true }))}>Check answer</button>
                )}
                {!isRev && !selected[qi] && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>Select an option</span>
                )}
                {isRev && ans && (
                  <div className="quiz-answer">
                    {selected[qi] === ans ? '🎉 Correct!' : `✗ Correct: ${ans}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-secondary" onClick={revealAll}>Reveal all answers</button>
        {score !== null && (
          <div className={`badge ${score === blocks.length ? 'badge-success' : score >= blocks.length / 2 ? 'badge-accent' : 'badge-danger'}`}
            style={{ fontSize: 'var(--text-sm)', padding: '4px 12px' }}>
            Score: {score} / {blocks.length}
          </div>
        )}
        <button className="btn btn-sm btn-ghost"
          onClick={() => { setSelected({}); setRevealed({}); setScore(null); }}>Reset</button>
      </div>
    </div>
  );
}

// ── Flashcard renderer ─────────────────────────────────────────────────────

// ── Flashcard parser ───────────────────────────────────────────────────────
function parseFlashcards(content: string): Array<{ front: string; back: string }> {
  // Format 1: "Front: ... | Back: ..." (pipe-separated on one line)
  const pipeLines = content
    .split(/\n/)
    .map(l => l.replace(/^\d+[.)]\s*/, '').trim())
    .filter(l => /front:/i.test(l) && /back:/i.test(l));
  if (pipeLines.length > 0) {
    return pipeLines.map(l => ({
      front: (l.match(/front:\s*(.*?)(?:\s*\|\s*back:|$)/i)?.[1] ?? '').trim(),
      back:  (l.match(/back:\s*(.*?)$/i)?.[1] ?? '').trim(),
    })).filter(c => c.front);
  }
  // Format 2: blocks separated by --- with Front: / Back: labels
  return content
    .split(/---+/)
    .map(block => ({
      front: block.match(/\*?\*?Front:\*?\*?\s*([\s\S]*?)(?=\*?\*?Back:|$)/i)?.[1]?.trim() ?? '',
      back:  block.match(/\*?\*?Back:\*?\*?\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '',
    }))
    .filter(c => c.front);
}

// ── Practice problem renderer (hints + solution reveal) ────────────────────

function PracticeView({ content }: { content: string }) {
  const [hintsShown,   setHintsShown]   = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [answer,       setAnswer]       = useState('');
  const [submitted,    setSubmitted]    = useState(false);

  // Parse sections: ## Problem / ## Hint N / ## Solution
  const sections: Record<string, string> = {};
  let current = '';
  for (const line of content.split('\n')) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { current = m[1].trim(); sections[current] = ''; }
    else if (current) sections[current] = (sections[current] + '\n' + line).trimStart();
  }

  const problem  = sections['Problem'] ?? content;
  const hints    = [1, 2, 3].map(n => sections[`Hint ${n}`]).filter(Boolean);
  const solution = sections['Solution'] ?? '';

  if (!problem.trim())
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, margin: '0 auto' }}>
      {/* Problem */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--accent)', marginBottom: 8 }}>📋 Problem</div>
        <div className="tool-output" style={{ margin: 0, padding: 0, background: 'none', border: 'none' }}
          dangerouslySetInnerHTML={{ __html: mdToHtml(problem) }} />
      </div>

      {/* Self-assessment answer box */}
      {!showSolution && (
        <div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
            Your answer (optional — for self-assessment)
          </label>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={3}
            placeholder="Write your working here before revealing hints or the solution…"
            style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, color: 'var(--text)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
          {answer.trim() && !submitted && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setSubmitted(true)}>✓ Lock in answer</button>
          )}
          {submitted && (
            <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>✓ Answer locked — compare with solution when ready</div>
          )}
        </div>
      )}

      {/* Hints */}
      {hints.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hints.slice(0, hintsShown).map((hint, i) => (
            <div key={i} style={{ background: 'color-mix(in srgb, #f59e0b 8%, var(--surface))', border: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: '#f59e0b', marginBottom: 6 }}>💡 Hint {i + 1}</div>
              <div className="tool-output" style={{ margin: 0, padding: 0, background: 'none', border: 'none', fontSize: 'var(--text-sm)' }}
                dangerouslySetInnerHTML={{ __html: mdToHtml(hint) }} />
            </div>
          ))}
          {hintsShown < hints.length && !showSolution && (
            <button className="btn btn-ghost btn-sm" onClick={() => setHintsShown(h => h + 1)}
              style={{ alignSelf: 'flex-start', color: '#f59e0b', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
              💡 Show hint {hintsShown + 1} of {hints.length}
            </button>
          )}
        </div>
      )}

      {/* Solution */}
      {showSolution && solution ? (
        <div style={{ background: 'color-mix(in srgb, #52b788 8%, var(--surface))', border: '1px solid color-mix(in srgb, #52b788 30%, transparent)', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: '#52b788', marginBottom: 8 }}>✅ Solution</div>
          <div className="tool-output" style={{ margin: 0, padding: 0, background: 'none', border: 'none' }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(solution) }} />
        </div>
      ) : !showSolution && (
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}
          onClick={() => { setHintsShown(hints.length); setShowSolution(true); }}>
          ✅ Reveal solution
        </button>
      )}

      {showSolution && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}
          onClick={() => { setHintsShown(0); setShowSolution(false); setAnswer(''); setSubmitted(false); }}>
          ↺ Reset
        </button>
      )}
    </div>
  );
}

// ── SM-2 Flashcard view ────────────────────────────────────────────────────
function FlashcardView({ content }: { content: string }) {
  const rawCards = parseFlashcards(content);

  // SRS deck state (persisted in localStorage)
  const [deck,       setDeck]       = useState<SRSDeck | null>(null);
  const [sessionIdx, setSessionIdx] = useState(0);
  const [flip,       setFlip]       = useState(false);
  const [phase,      setPhase]      = useState<'preview' | 'review' | 'done' | 'match' | 'learn'>('preview');
  const [graded,     setGraded]     = useState<number[]>([]); // grades for session
  // Match game state
  const [matchSelected, setMatchSelected] = useState<string | null>(null); // selected term id
  const [matchPaired,   setMatchPaired]   = useState<Set<string>>(new Set()); // paired term ids
  const [matchFlash,    setMatchFlash]    = useState<{ id: string; ok: boolean } | null>(null);
  const [matchStart,    setMatchStart]    = useState(0);
  const [matchEnd,      setMatchEnd]      = useState(0);
  const [matchShuffledDefs, setMatchShuffledDefs] = useState<Array<{ id: string; text: string }>>([]);
  // Learn mode state
  const [learnIdx,      setLearnIdx]      = useState(0);
  const [learnQueue,    setLearnQueue]    = useState<string[]>([]); // card ids remaining
  const [learnOptions,  setLearnOptions]  = useState<string[]>([]);
  const [learnPicked,   setLearnPicked]   = useState<string | null>(null);
  const [learnCorrect,  setLearnCorrect]  = useState(0);
  const [learnTotal,    setLearnTotal]    = useState(0);

  // Build/load the deck when content changes
  useEffect(() => {
    if (rawCards.length === 0) return;
    const deckId = 'deck-' + btoa(content.slice(0, 80)).replace(/[^a-z0-9]/gi, '').slice(0, 20);
    const existing = loadDecks().find(d => d.id === deckId);
    if (existing) {
      setDeck(existing);
    } else {
      const newDeck: SRSDeck = {
        id: deckId,
        name: `Flashcards (${rawCards.length} cards)`,
        cards: rawCards.map((c, i) => createCard(`${deckId}-${i}`, c.front, c.back)),
        createdAt: new Date().toISOString(),
      };
      saveDeck(newDeck);
      setDeck(newDeck);
    }
    setSessionIdx(0); setFlip(false); setPhase('preview'); setGraded([]);
    setMatchSelected(null); setMatchPaired(new Set()); setMatchFlash(null); setMatchEnd(0);
    setLearnIdx(0); setLearnQueue([]); setLearnPicked(null); setLearnCorrect(0); setLearnTotal(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (rawCards.length === 0)
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;

  if (!deck) return null;

  const stats = getDeckStats(deck);
  // Session cards: due today first, then new cards
  const today = new Date().toISOString().split('T')[0];
  const sessionCards = [
    ...deck.cards.filter(c => c.nextReview <= today && c.repetitions > 0),
    ...deck.cards.filter(c => c.repetitions === 0),
  ];
  const totalSession = sessionCards.length || deck.cards.length;
  const allCards = sessionCards.length > 0 ? sessionCards : deck.cards;

  function doGrade(grade: 0 | 1 | 2 | 3) {
    const card = allCards[sessionIdx];
    const updated = gradeCard(card, grade);
    const nextDeck: SRSDeck = {
      ...deck!,
      cards: deck!.cards.map(c => c.id === updated.id ? updated : c),
      lastStudied: new Date().toISOString(),
    };
    saveDeck(nextDeck);
    setDeck(nextDeck);
    setGraded(p => [...p, grade]);
    setFlip(false);
    if (sessionIdx + 1 >= allCards.length) {
      setTimeout(() => setPhase('done'), 100);
    } else {
      setTimeout(() => setSessionIdx(i => i + 1), 120);
    }
  }

  // GRADE_META
  const GRADES: Array<{ grade: 0|1|2|3; label: string; hint: string; color: string }> = [
    { grade: 0, label: 'Again',  hint: 'Forgot — review tomorrow',       color: '#e05252' },
    { grade: 1, label: 'Hard',   hint: 'Recalled with effort',           color: '#f59e0b' },
    { grade: 2, label: 'Good',   hint: 'Recalled correctly',             color: '#4f86f7' },
    { grade: 3, label: 'Easy',   hint: 'Instant recall — longer gap',    color: '#52b788' },
  ];

  // ── Done screen ──────────────────────────────────────────────────────
  if (phase === 'done') {
    const correct = graded.filter(g => g >= 2).length;
    const pct = Math.round((correct / graded.length) * 100);
    const nextStats = getDeckStats({ ...deck!, cards: deck!.cards });
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{pct >= 80 ? '🎉' : pct >= 50 ? '📚' : '💪'}</div>
        <h3 style={{ margin: '0 0 6px' }}>Session complete!</h3>
        <p style={{ color: 'var(--text-3)', margin: '0 0 20px' }}>
          {correct}/{graded.length} recalled correctly ({pct}%)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 24, fontSize: 'var(--text-sm)' }}>
          {[
            { label: 'New',      val: nextStats.new,      color: '#4f86f7' },
            { label: 'Learning', val: nextStats.learning, color: '#f59e0b' },
            { label: 'Mature',   val: nextStats.mature,   color: '#52b788' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 8px' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: s.color }}>{s.val}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {nextStats.due > 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 16 }}>
            {nextStats.due} card{nextStats.due !== 1 ? 's' : ''} still due today
          </div>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => {
          setSessionIdx(0); setFlip(false); setGraded([]);
          setPhase(nextStats.due > 0 ? 'review' : 'preview');
        }}>
          {nextStats.due > 0 ? `Review ${nextStats.due} remaining` : 'Browse all cards'}
        </button>
      </div>
    );
  }

  // ── Preview (browse all) mode ────────────────────────────────────────
  if (phase === 'preview') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Deck stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
            📇 {deck.name}
          </span>
          {[
            { label: `${stats.new} new`,      color: '#4f86f7' },
            { label: `${stats.learning} learning`, color: '#f59e0b' },
            { label: `${stats.mature} mature`, color: '#52b788' },
          ].map(b => (
            <span key={b.label} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: `${b.color}22`, color: b.color, fontWeight: 600 }}>
              {b.label}
            </span>
          ))}
          {stats.due > 0 && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--accent-subtle, rgba(79,134,247,0.12))', color: 'var(--accent)', fontWeight: 700, marginLeft: 'auto' }}>
              {stats.due} due today
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
            onClick={() => { setSessionIdx(0); setFlip(false); setGraded([]); setPhase('review'); }}>
            {stats.due > 0 ? `▶ Study ${stats.due} due` : `▶ Study all`}
          </button>
          <button className="btn btn-ghost btn-sm" title="Match game — pair terms with definitions"
            onClick={() => {
              // Shuffle definitions
              const defs = [...deck.cards].sort(() => Math.random() - 0.5).map(c => ({ id: c.id, text: c.back }));
              setMatchShuffledDefs(defs);
              setMatchSelected(null); setMatchPaired(new Set()); setMatchFlash(null);
              setMatchStart(Date.now()); setMatchEnd(0);
              setPhase('match');
            }}>
            🎮 Match
          </button>
          <button className="btn btn-ghost btn-sm" title="Learn mode — adaptive MCQ until 100%"
            onClick={() => {
              const ids = deck.cards.map(c => c.id);
              // Shuffle for learn queue
              const shuffled = [...ids].sort(() => Math.random() - 0.5);
              setLearnQueue(shuffled); setLearnIdx(0); setLearnPicked(null);
              setLearnCorrect(0); setLearnTotal(ids.length);
              setPhase('learn');
            }}>
            🎓 Learn
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {deck.cards.map((c, i) => {
            const maturity = c.repetitions === 0 ? 'new' : c.interval >= 21 ? 'mature' : 'learning';
            const colors = { new: '#4f86f7', learning: '#f59e0b', mature: '#52b788' };
            return (
              <div key={c.id}
                style={{ background: 'var(--surface)', border: `1px solid var(--border-2)`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 'var(--text-xs)', borderLeft: `3px solid ${colors[maturity]}` }}
                onClick={() => { setSessionIdx(i); setFlip(false); setPhase('review'); }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>{c.front}</div>
                <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>{c.back}</div>
                {c.repetitions > 0 && (
                  <div style={{ color: 'var(--text-3)', fontSize: 10 }}>
                    Next: {c.nextReview} · {Math.round((c.correctReviews / Math.max(1, c.totalReviews)) * 100)}% accuracy
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Match game mode ───────────────────────────────────────────────────
  if (phase === 'match') {
    const allMatched = matchPaired.size === deck.cards.length;
    const elapsed    = matchEnd > 0 ? Math.round((matchEnd - matchStart) / 1000) : Math.round((Date.now() - matchStart) / 1000);

    function handleMatchTerm(cardId: string) {
      if (matchPaired.has(cardId)) return;
      if (matchSelected === cardId) { setMatchSelected(null); return; }
      if (!matchSelected) { setMatchSelected(cardId); return; }
      // matchSelected is a termId, cardId is a defId — but in our UI both columns use card.id
      // Check if selected term matches this definition
      if (matchSelected === cardId) { setMatchSelected(null); return; }
      // correct pair: both columns reference same card id
      setMatchFlash({ id: cardId, ok: true });
      setMatchFlash({ id: matchSelected, ok: true });
      setTimeout(() => {
        setMatchPaired(prev => { const next = new Set(prev); next.add(cardId); return next; });
        setMatchSelected(null); setMatchFlash(null);
        if (deck && matchPaired.size + 1 === deck.cards.length) setMatchEnd(Date.now());
      }, 300);
    }

    function handleMatchDef(cardId: string) {
      if (matchPaired.has(cardId)) return;
      if (!matchSelected) return;
      if (matchSelected === cardId) {
        // Correct match
        setMatchFlash({ id: cardId, ok: true });
        setTimeout(() => {
          setMatchPaired(prev => { const next = new Set(prev); next.add(cardId); return next; });
          setMatchSelected(null); setMatchFlash(null);
          if (deck && matchPaired.size + 1 === deck.cards.length) setMatchEnd(Date.now());
        }, 300);
      } else {
        // Wrong match
        setMatchFlash({ id: cardId, ok: false });
        setTimeout(() => { setMatchFlash(null); }, 600);
      }
    }

    const shuffledTerms = deck.cards; // terms in original order, defs shuffled

    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>🎮 Match Game</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            {matchPaired.size}/{deck.cards.length} matched
          </span>
          {!allMatched && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginLeft: 'auto' }}>⏱ {elapsed}s</span>}
          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {allMatched ? (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
            <h3 style={{ margin: '0 0 6px' }}>All matched!</h3>
            <p style={{ color: 'var(--text-3)' }}>Completed in {elapsed} seconds</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const defs = [...deck.cards].sort(() => Math.random() - 0.5).map(c => ({ id: c.id, text: c.back }));
                setMatchShuffledDefs(defs); setMatchSelected(null); setMatchPaired(new Set());
                setMatchFlash(null); setMatchStart(Date.now()); setMatchEnd(0);
              }}>↺ Play again</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>← Back</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Terms column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Terms</div>
              {shuffledTerms.map(c => {
                const paired  = matchPaired.has(c.id);
                const selTerm = matchSelected === c.id;
                const flash   = matchFlash?.id === c.id;
                return (
                  <div key={c.id}
                    onClick={() => !paired && handleMatchTerm(c.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: paired ? 'default' : 'pointer',
                      fontSize: 'var(--text-xs)', lineHeight: 1.4, transition: 'all 0.15s',
                      background: paired ? 'color-mix(in srgb, #52b788 15%, var(--surface))' : selTerm ? 'var(--accent)' : flash ? (matchFlash?.ok ? '#52b78820' : '#ef444420') : 'var(--surface-2)',
                      color: paired ? '#52b788' : selTerm ? '#fff' : 'var(--text)',
                      border: `1px solid ${paired ? '#52b78840' : selTerm ? 'var(--accent)' : 'var(--border-2)'}`,
                      opacity: paired ? 0.6 : 1,
                    }}>
                    {paired ? '✓ ' : ''}{c.front}
                  </div>
                );
              })}
            </div>
            {/* Definitions column (shuffled) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Definitions</div>
              {matchShuffledDefs.map(def => {
                const paired = matchPaired.has(def.id);
                const flash  = matchFlash?.id === def.id;
                const active = !!matchSelected && !paired;
                return (
                  <div key={def.id}
                    onClick={() => !paired && active && handleMatchDef(def.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 8,
                      cursor: (!paired && active) ? 'pointer' : 'default',
                      fontSize: 'var(--text-xs)', lineHeight: 1.4, transition: 'all 0.15s',
                      background: paired ? 'color-mix(in srgb, #52b788 15%, var(--surface))' : flash ? (matchFlash?.ok ? '#52b78820' : '#ef444420') : active ? 'var(--surface)' : 'var(--surface-2)',
                      color: paired ? '#52b788' : flash && !matchFlash?.ok ? '#ef4444' : 'var(--text)',
                      border: `1px solid ${paired ? '#52b78840' : flash && !matchFlash?.ok ? '#ef4444' : active ? 'var(--accent)' : 'var(--border-2)'}`,
                      opacity: paired ? 0.6 : 1,
                      transform: flash && !matchFlash?.ok ? 'translateX(-4px)' : 'none',
                    }}>
                    {paired ? '✓ ' : ''}{def.text}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Learn mode ────────────────────────────────────────────────────────
  if (phase === 'learn') {
    const learnDone = learnQueue.length === 0;

    function buildOptions(cardId: string): string[] {
      const correct    = deck!.cards.find(c => c.id === cardId)?.back ?? '';
      const distractors = deck!.cards
        .filter(c => c.id !== cardId)
        .map(c => c.back)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      return [correct, ...distractors].sort(() => Math.random() - 0.5);
    }

    const currentCardId = learnQueue[learnIdx] ?? null;
    const currentCard   = deck.cards.find(c => c.id === currentCardId) ?? null;
    // Keep options stable via learnOptions state; rebuild when queue changes
    const learnOpts = learnOptions.length === 4
      ? learnOptions
      : (currentCardId ? buildOptions(currentCardId) : []);

    function pickAnswer(opt: string) {
      if (learnPicked) return;
      setLearnPicked(opt);
      const correct = currentCard?.back ?? '';
      const isRight = opt === correct;
      const nextId  = isRight ? null : currentCardId!;
      setTimeout(() => {
        setLearnQueue(prev => {
          const without = prev.filter((_, i) => i !== learnIdx);
          return nextId ? [...without, nextId] : without;
        });
        if (isRight) setLearnCorrect(p => p + 1);
        setLearnIdx(0);
        setLearnPicked(null);
        // Rebuild options for next card
        const nextCardId = learnQueue[learnIdx + (learnIdx + 1 < learnQueue.length ? 1 : 0)];
        if (nextCardId && nextCardId !== currentCardId) setLearnOptions(buildOptions(nextCardId));
        else setLearnOptions([]);
      }, 900);
    }

    if (learnDone) {
      const acc = Math.round((learnCorrect / learnTotal) * 100);
      return (
        <div style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>{acc === 100 ? '🎉' : acc >= 70 ? '📚' : '💪'}</div>
          <h3 style={{ margin: '0 0 6px' }}>Learn complete!</h3>
          <p style={{ color: 'var(--text-3)' }}>You got all {learnTotal} cards right</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              const ids = deck!.cards.map(c => c.id).sort(() => Math.random() - 0.5);
              setLearnQueue(ids); setLearnIdx(0); setLearnPicked(null);
              setLearnCorrect(0); setLearnTotal(ids.length); setLearnOptions([]);
            }}>↺ Restart</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>← Back</button>
          </div>
        </div>
      );
    }

    if (!currentCard) return null;
    const learnPct = Math.round(((learnTotal - learnQueue.length) / learnTotal) * 100);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540, margin: '0 auto' }}>
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${learnPct}%`, height: '100%', borderRadius: 3, background: '#52b788', transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {learnTotal - learnQueue.length}/{learnTotal}
          </span>
          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {/* Card front */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '20px 24px', textAlign: 'center', minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', lineHeight: 1.5 }}>{currentCard.front}</div>
        </div>

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {learnOpts.map((opt, i) => {
            const isCorrect = opt === currentCard.back;
            const isPicked  = learnPicked === opt;
            let bg = 'var(--surface-2)';
            let col = 'var(--text)';
            let border = 'var(--border-2)';
            if (isPicked && isCorrect) { bg = 'color-mix(in srgb,#52b788 20%,var(--surface))'; col = '#52b788'; border = '#52b788'; }
            if (isPicked && !isCorrect) { bg = 'color-mix(in srgb,#ef4444 20%,var(--surface))'; col = '#ef4444'; border = '#ef4444'; }
            if (learnPicked && !isPicked && isCorrect) { bg = 'color-mix(in srgb,#52b788 20%,var(--surface))'; col = '#52b788'; border = '#52b788'; }
            return (
              <div key={i} onClick={() => pickAnswer(opt)}
                style={{ padding: '12px 14px', borderRadius: 10, cursor: learnPicked ? 'default' : 'pointer', background: bg, color: col, border: `1px solid ${border}`, fontSize: 'var(--text-sm)', lineHeight: 1.4, transition: 'all 0.15s', fontWeight: isPicked ? 600 : 400 }}>
                {String.fromCharCode(65 + i)}. {opt}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Review mode ──────────────────────────────────────────────────────
  const card = allCards[Math.min(sessionIdx, allCards.length - 1)];
  const reviewPct = Math.round((sessionIdx / totalSession) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540, margin: '0 auto' }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${reviewPct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {sessionIdx + 1}/{totalSession}
        </span>
        <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }}
          title="Back to overview" onClick={() => { setPhase('preview'); }}>✕</button>
      </div>

      {/* Card */}
      <div className="flashcard-wrap" style={{ minHeight: 200 }} onClick={() => !flip && setFlip(true)}>
        <div className={`flashcard${flip ? ' flipped' : ''}`} style={{ minHeight: 200 }}>
          <div className="flashcard-face">
            <div className="flashcard-label">Front</div>
            <div className="flashcard-text">{card.front}</div>
            {!flip && <small style={{ marginTop: 'auto', color: 'var(--text-3)', paddingTop: 12 }}>Click to reveal answer</small>}
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="flashcard-label">Back</div>
            <div className="flashcard-text">{card.back}</div>
          </div>
        </div>
      </div>

      {/* Grade buttons — only shown after flip */}
      {flip ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {GRADES.map(g => (
            <button key={g.grade}
              onClick={() => doGrade(g.grade)}
              title={g.hint}
              style={{
                border: 'none', borderRadius: 8, padding: '8px 4px', cursor: 'pointer',
                background: `${g.color}18`, color: g.color, fontWeight: 600, fontSize: 'var(--text-xs)',
                transition: 'background 0.12s',
              }}>
              {g.label}
              <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.8, marginTop: 2 }}>{g.hint.split('—')[0].trim()}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFlip(true)}>Show answer</button>
        </div>
      )}
    </div>
  );
}

// ── Exam renderer (timed exam with score) ──────────────────────────────────

function ExamView({ content, onDone }: { content: string; onDone?: (score: number, total: number) => void }) {
  const blocks = content
    .split(/\n(?=\*?\*?Q\d+[\.\)])/i)
    .map(b => b.trim())
    .filter(b => /Q\d+/i.test(b) && b.length > 10);

  const [phase,    setPhase]    = useState<'setup' | 'exam' | 'results'>('setup');
  const [minutes,  setMinutes]  = useState(Math.max(5, Math.ceil(blocks.length * 1.5)));
  const [secsLeft, setSecsLeft] = useState(0);
  const [answers,  setAnswers]  = useState<Record<number, string>>({});
  const [score,    setScore]    = useState<{ correct: number; total: number; weak: string[] } | null>(null);

  useEffect(() => {
    if (phase !== 'exam') return;
    const timer = setInterval(() => {
      setSecsLeft(s => {
        if (s <= 1) { clearInterval(timer); submitExam(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startExam() {
    setSecsLeft(minutes * 60);
    setAnswers({});
    setScore(null);
    setPhase('exam');
  }

  function submitExam() {
    let correct = 0;
    const weak: string[] = [];
    blocks.forEach((block, qi) => {
      const ans = block.match(/✓\s*([A-D])\)?/)?.[1] ?? block.match(/Answer:\s*([A-D])\b/i)?.[1];
      const stem = block.split('\n')[0].replace(/^\*?\*?Q\d+[\.\)]\*?\*?\s*/i, '').slice(0, 40);
      if (ans && answers[qi] === ans) correct++;
      else weak.push(stem + '…');
    });
    setScore({ correct, total: blocks.length, weak: weak.slice(0, 5) });
    setPhase('results');
    onDone?.(correct, blocks.length);
  }

  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const pct = blocks.length > 0 ? Math.round((Object.keys(answers).length / blocks.length) * 100) : 0;

  if (phase === 'setup') {
    return (
      <div style={{ maxWidth: 440, margin: '0 auto', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
        <h3 style={{ margin: '0 0 6px' }}>Exam Simulator</h3>
        <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', marginBottom: 24 }}>
          {blocks.length} questions · timed exam with scoring
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 20, fontSize: 'var(--text-sm)' }}>
          Time limit:
          <input type="number" value={minutes} min={1} max={180}
            onChange={e => setMinutes(Math.max(1, +e.target.value))}
            style={{ width: 64, textAlign: 'center' }} /> minutes
        </label>
        <button className="btn btn-primary" style={{ padding: '10px 32px', fontSize: 'var(--text-base)' }}
          onClick={startExam}>
          Start Exam →
        </button>
      </div>
    );
  }

  if (phase === 'results' && score) {
    const pctScore = Math.round((score.correct / score.total) * 100);
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>
            {pctScore >= 80 ? '🎉' : pctScore >= 60 ? '📚' : '💪'}
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 'var(--text-2xl)' }}>{pctScore}%</h3>
          <div className={`badge ${pctScore >= 80 ? 'badge-success' : pctScore >= 60 ? 'badge-accent' : 'badge-danger'}`}
            style={{ fontSize: 'var(--text-sm)', padding: '4px 14px' }}>
            {score.correct} / {score.total} correct
          </div>
        </div>
        {score.weak.length > 0 && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: 6 }}>
              ⚠ Areas to review:
            </div>
            {score.weak.map((w, i) => (
              <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', marginTop: 3 }}>• {w}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={startExam}>Retake Exam</button>
          <button className="btn btn-ghost" onClick={() => setPhase('setup')}>Change settings</button>
        </div>
      </div>
    );
  }

  // Exam in progress
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Exam header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: secsLeft < 60 ? 'var(--danger)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          ⏱ {mm}:{ss}
        </div>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
          {Object.keys(answers).length}/{blocks.length} answered
        </span>
        <button className="btn btn-sm btn-primary" onClick={submitExam}>Submit</button>
      </div>

      {/* Questions */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocks.map((block, qi) => {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
          const stem  = lines[0].replace(/^\*?\*?Q\d+[\.\)]\*?\*?\s*/i, '');
          const opts  = lines.filter(l => /^[A-D]\)/.test(l));
          return (
            <div key={qi} className="quiz-card">
              <div className="quiz-q-num">Q{qi + 1}</div>
              <div className="quiz-q-text">{stem}</div>
              <div className="quiz-options">
                {opts.map((opt, oi) => {
                  const letter = opt.match(/^([A-D])\)/)?.[1] ?? '';
                  const text   = opt.replace(/^[A-D]\)\s*/, '');
                  const isSel  = answers[qi] === letter;
                  return (
                    <div key={oi} className={`quiz-option${isSel ? ' selected' : ''}`}
                      onClick={() => setAnswers(p => ({ ...p, [qi]: letter }))}>
                      <span className="quiz-opt-letter">{letter}</span>
                      <span>{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Math Solver panel ──────────────────────────────────────────────────────

const MATH_EXAMPLES = [
  { label: 'Derivative', q: "Find the derivative of x^3 + 2x^2 - 5x + 3" },
  { label: 'Integral',   q: "Integrate x^2 + 3x - 1 dx" },
  { label: 'Quadratic',  q: "Solve x^2 - 5x + 6 = 0" },
  { label: 'Linear Eq',  q: "Solve 3x + 7 = 22" },
  { label: 'Limit',      q: "Find the limit as x approaches 2 of (x^2 - 4)/(x - 2)" },
  { label: 'Arithmetic', q: "Calculate (15 * 4 + sqrt(81)) / 3" },
];

function MathPanel() {
  const { toast } = useToast();
  const [problem,   setProblem]   = useState('');
  const [solution,  setSolution]  = useState<MathSolution | null>(null);
  const [solving,   setSolving]   = useState(false);
  const [history,   setHistory]   = useState<MathSolution[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function solve() {
    const p = problem.trim();
    if (!p) return;
    setSolving(true);
    setSolution(null);
    try {
      const sol = solveOffline(p);
      setSolution(sol);
      setHistory(h => [sol, ...h].slice(0, 10));
    } catch (e) {
      toast('Could not solve: ' + (e instanceof Error ? e.message : 'Unknown error'), 'error');
    } finally {
      setSolving(false);
    }
  }

  function copyResult() {
    if (!solution) return;
    const text = [
      `Problem: ${solution.problem}`,
      `Type: ${solution.problemType}`,
      '',
      'Steps:',
      ...solution.steps.map(s => `${s.step}. ${s.description}: ${s.expression}\n   ${s.explanation}`),
      '',
      `Answer: ${solution.finalAnswer}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Input */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          🧮 Math Solver
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 400, color: 'var(--text-3)' }}>
            Derivatives · Integrals · Algebra · Limits · Arithmetic
          </span>
        </div>
        <textarea
          ref={textareaRef}
          rows={2}
          placeholder="Type a math problem, e.g.  Find the derivative of x^3 + 2x - 5"
          value={problem}
          onChange={e => setProblem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); solve(); } }}
          style={{
            width: '100%', resize: 'none',
            background: 'var(--surface)', border: '1.5px solid var(--border-2)',
            borderRadius: 10, padding: '10px 14px',
            fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={solve} disabled={!problem.trim() || solving}>
            {solving ? '⏳ Solving…' : '= Solve'}
          </button>
          {solution && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSolution(null); setProblem(''); }}>Clear</button>
              <button className="btn btn-ghost btn-sm" onClick={copyResult}>📋 Copy</button>
            </>
          )}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginLeft: 'auto' }}>
            Press Enter to solve · Shift+Enter for new line
          </span>
        </div>
        {/* Examples */}
        <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
          {MATH_EXAMPLES.map(ex => (
            <button key={ex.label}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12 }}
              onClick={() => { setProblem(ex.q); setSolution(null); textareaRef.current?.focus(); }}>
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {/* Solution */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {!solution && !solving && !history.length && (
          <div className="empty-state" style={{ padding: '48px 20px' }}>
            <div className="empty-icon">🧮</div>
            <h3>Math Solver</h3>
            <p>Enter any math problem above — algebra, calculus, limits, and more. Step-by-step solutions shown.</p>
          </div>
        )}

        {solving && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 60 }}>
            <div style={{ width: 20, height: 20, border: '2.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: 'var(--text-3)' }}>Solving…</span>
          </div>
        )}

        {solution && (
          <div className="math-solution">
            {/* Problem header */}
            <div className="math-sol-header">
              <div className="math-sol-type">{solution.problemType.replace(/-/g, ' ')}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>
                <MathText>{solution.problem}</MathText>
              </div>
            </div>

            {/* Steps */}
            {solution.steps.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 10 }}>
                  Step-by-step solution
                </div>
                {solution.steps.map(step => (
                  <div key={step.step} className="math-step">
                    <div className="math-step-num">{step.step}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 4 }}>
                        {step.description}
                      </div>
                      {step.expression && (
                        <div className="math-expr">
                          <MathRenderer math={step.expression} display={true} />
                        </div>
                      )}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 4 }}>
                        {step.explanation}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Final answer */}
            <div className="math-answer">
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 10 }}>
                Final Answer
              </div>
              <div className="math-answer-expr">
                <MathRenderer math={solution.finalAnswer} display={true} />
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 8 }}>
                Plain text: {solution.finalAnswer}
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {!solution && history.length > 0 && (
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', marginBottom: 10 }}>
              Recent problems
            </div>
            {history.map((h, i) => (
              <div key={i} className="math-history-item"
                onClick={() => { setSolution(h); setProblem(h.problem); }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', textTransform: 'uppercase' }}>{h.problemType.replace(/-/g, ' ')}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginTop: 2 }}>{h.problem}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginTop: 4 }}>→ {h.finalAnswer}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Focus / Pomodoro panel ─────────────────────────────────────────────────

type PomPhase = 'work' | 'short-break' | 'long-break';

const POMODORO_PRESETS: Record<PomPhase, number> = {
  'work': 25,
  'short-break': 5,
  'long-break': 15,
};

function FocusPanel() {
  const { toast } = useToast();
  const [phase,         setPhase]         = useState<PomPhase>('work');
  const [customMins,    setCustomMins]     = useState<Record<PomPhase, number>>({ ...POMODORO_PRESETS });
  const [secsLeft,      setSecsLeft]       = useState(POMODORO_PRESETS.work * 60);
  const [running,       setRunning]        = useState(false);
  const [sessions,      setSessions]       = useState(0);    // pomodoros completed today
  const [todayTotal,    setTodayTotal]     = useState(0);    // total minutes studied today
  const [task,          setTask]           = useState('');   // what are you studying?
  const [showSettings,  setShowSettings]   = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSecs    = customMins[phase] * 60;
  const progress     = Math.max(0, Math.min(100, ((totalSecs - secsLeft) / totalSecs) * 100));
  const mm           = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss           = String(secsLeft % 60).padStart(2, '0');
  const circumference = 2 * Math.PI * 54; // radius 54 on SVG

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecsLeft(s => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            handlePhaseEnd();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function handlePhaseEnd() {
    if (phase === 'work') {
      const newSessions = sessions + 1;
      setSessions(newSessions);
      setTodayTotal(t => t + customMins.work);
      toast(`🎉 Pomodoro #${newSessions} complete! Take a break.`, 'success');
      const next: PomPhase = newSessions % 4 === 0 ? 'long-break' : 'short-break';
      switchPhase(next);
    } else {
      toast('Break over — back to work!', 'info');
      switchPhase('work');
    }
  }

  function switchPhase(p: PomPhase) {
    setPhase(p);
    setSecsLeft(customMins[p] * 60);
    setRunning(false);
  }

  function reset() {
    setSecsLeft(customMins[phase] * 60);
    setRunning(false);
  }

  function skip() {
    handlePhaseEnd();
  }

  const phaseColor: Record<PomPhase, string> = {
    'work': 'var(--accent)',
    'short-break': 'var(--success)',
    'long-break': 'var(--purple)',
  };

  const strokeDash = circumference - (progress / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}>
      <div style={{ maxWidth: 500, margin: '0 auto', padding: '24px 20px', width: '100%' }}>

        {/* Phase selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, background: 'var(--surface)', borderRadius: 12, padding: 4 }}>
          {(['work', 'short-break', 'long-break'] as PomPhase[]).map(p => (
            <button key={p}
              onClick={() => switchPhase(p)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontWeight: 600,
                background: phase === p ? 'var(--bg)' : 'transparent',
                color: phase === p ? phaseColor[p] : 'var(--text-3)',
                boxShadow: phase === p ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}>
              {p === 'work' ? '🍅 Focus' : p === 'short-break' ? '☕ Short break' : '🌿 Long break'}
            </button>
          ))}
        </div>

        {/* Ring timer */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
          <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={70} cy={70} r={54} fill="none" stroke="var(--surface-2)" strokeWidth={8} />
            <circle cx={70} cy={70} r={54} fill="none"
              stroke={phaseColor[phase]}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDash}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
            />
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{
              fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              color: running ? phaseColor[phase] : 'var(--text)',
              animation: running ? 'timer-pulse 2s ease-in-out infinite' : 'none',
            }}>
              {mm}:{ss}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2, textTransform: 'capitalize' }}>
              {phase.replace('-', ' ')}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
          <button className="btn btn-ghost btn-sm" onClick={reset}>↺ Reset</button>
          <button
            style={{
              padding: '10px 36px', borderRadius: 50, border: 'none', cursor: 'pointer',
              background: phaseColor[phase], color: '#fff',
              fontSize: 'var(--text-base)', fontWeight: 700,
              boxShadow: running ? `0 0 0 4px color-mix(in srgb, ${phaseColor[phase]} 25%, transparent)` : 'none',
              transition: 'all 0.2s',
            }}
            onClick={() => setRunning(r => !r)}>
            {running ? '⏸ Pause' : secsLeft < totalSecs ? '▶ Resume' : '▶ Start'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={skip} disabled={!running}>Skip →</button>
        </div>

        {/* Task input */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="What are you studying? (optional)"
            value={task}
            onChange={e => setTask(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border-2)',
              fontSize: 'var(--text-sm)', color: 'var(--text)',
            }}
          />
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Pomodoros', value: sessions, icon: '🍅' },
            { label: 'Min studied', value: todayTotal, icon: '⏱' },
            { label: 'Goal today', value: '4 sessions', icon: '🎯' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text)' }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Custom durations */}
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)', width: '100%', justifyContent: 'center' }}
            onClick={() => setShowSettings(s => !s)}>
            {showSettings ? '▲ Hide settings' : '⚙ Customize durations'}
          </button>
          {showSettings && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '14px', background: 'var(--surface)', borderRadius: 10 }}>
              {(['work', 'short-break', 'long-break'] as PomPhase[]).map(p => (
                <label key={p} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {p === 'work' ? 'Focus' : p === 'short-break' ? 'Short break' : 'Long break'} (min)
                  <input type="number" value={customMins[p]} min={1} max={90}
                    onChange={e => {
                      const v = Math.max(1, +e.target.value);
                      setCustomMins(prev => ({ ...prev, [p]: v }));
                      if (phase === p) { setSecsLeft(v * 60); setRunning(false); }
                    }}
                    style={{ padding: '4px 8px', textAlign: 'center' }} />
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Study tips */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            💡 Pomodoro tips
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 'var(--text-xs)', color: 'var(--text-3)', lineHeight: 1.7 }}>
            <li>Work in 25-min focused bursts with no distractions</li>
            <li>Every 4 pomodoros, take a longer 15-min break</li>
            <li>Note what you studied each session to track progress</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Inline file viewer ─────────────────────────────────────────────────────

function FileViewer({
  file, onClose, onUseForTools,
}: { file: FileRecord; onClose: () => void; onUseForTools: (text: string) => void }) {
  const { toast } = useToast();
  const [blobUrl,     setBlobUrl]     = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    setLoading(true); setErr(null); setBlobUrl(null); setTextContent(null);
    (async () => {
      try {
        if (file.content && !file.localBlobId) { setTextContent(file.content); return; }
        if (!file.localBlobId) { setErr('No local file data — this file may have been uploaded on another device.'); return; }
        const payload = await idbStore.get(file.localBlobId);
        if (!payload) { setErr('File not found in local storage.'); return; }
        if (isPDF(file) || isImage(file)) {
          url = URL.createObjectURL(payload.blob);
          setBlobUrl(url);
        } else {
          const isPlain = !!file.name.toLowerCase().match(/\.(txt|md|csv|json|xml|html)$/);
          if (isPlain) setTextContent(await payload.blob.text());
          else {
            const res = await extractTextFromBlob(payload.blob, file.name);
            if (res.error) setErr(res.error); else setTextContent(res.text);
          }
        }
      } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load file.'); }
      finally { setLoading(false); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  async function useForTools() {
    if (textContent) { onUseForTools(textContent); return; }
    if (!file.localBlobId) return;
    const payload = await idbStore.get(file.localBlobId);
    if (!payload) { toast('File not found locally.', 'error'); return; }
    const res = await extractTextFromBlob(payload.blob, file.name);
    if (res.error) { toast(res.error, 'error'); return; }
    toast(`${res.wordCount.toLocaleString()} words loaded into Generate`, 'success');
    onUseForTools(res.text);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border)', background: 'var(--bg)', animation: 'slideInRight 0.18s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, minWidth: 0 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(file)}</span>
        <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{file.name}</span>
        {fmt(file.fileSize) && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', flexShrink: 0 }}>{fmt(file.fileSize)}</span>}
        <button className="btn btn-primary btn-sm" onClick={useForTools} title="Load into Generate tab" style={{ flexShrink: 0 }}>
          ⚡ Use for Generate
        </button>
        <button className="btn-icon" onClick={onClose} title="Close" style={{ flexShrink: 0 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
            <div style={{ width: 22, height: 22, border: '2.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>Loading…</span>
          </div>
        )}
        {err && <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div><p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', maxWidth: 300, margin: '0 auto' }}>{err}</p></div>}
        {!loading && !err && blobUrl && isPDF(file) && (
          <iframe src={blobUrl} title={file.name} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
        )}
        {!loading && !err && blobUrl && isImage(file) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, overflow: 'auto', background: 'var(--surface)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
          </div>
        )}
        {!loading && !err && textContent !== null && (
          <div style={{ height: '100%', overflow: 'auto', padding: '16px 20px' }}>
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-accent">{wordCount(textContent).toLocaleString()} words</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>Extracted text preview</span>
            </div>
            <pre style={{ fontFamily: 'inherit', fontSize: 'var(--text-sm)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', margin: 0 }}>{textContent}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function WorkspacePanel({
  selectedFolder, selectedTopic, selectedFolderName, selectedTopicName, onRefresh, filesRefreshKey,
}: WorkspacePanelProps) {
  const { toast } = useToast();
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [mainTab,       setMainTab]       = useState<MainTab>('files');
  const [genMode,       setGenMode]       = useState<GenMode>('summarize');
  const [files,         setFiles]         = useState<FileRecord[]>([]);
  const [filesLoad,     setFilesLoad]     = useState(false);
  const [viewFile,      setViewFile]      = useState<FileRecord | null>(null);
  const [selFile,       setSelFile]       = useState<FileRecord | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [pasteMode,     setPasteMode]     = useState(false);
  const [extracting,    setExtracting]    = useState(false);
  const [output,        setOutput]        = useState('');
  const [generating,    setGenerating]    = useState(false);
  const [count,         setCount]         = useState(5);
  const [libItems,      setLibItems]      = useState<Array<{ id: string; mode: string; content: string; createdAt: string }>>([]);
  const [libLoad,       setLibLoad]       = useState(false);
  const [libExpanded,   setLibExpanded]   = useState<Record<string, boolean>>({});
  const [srsDecks,      setSrsDecks]      = useState<SRSDeck[]>([]);
  const [reviewDeck,    setReviewDeck]    = useState<string | null>(null); // deckId being reviewed inline
  const [dragging,      setDragging]      = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [missingBlobs,  setMissingBlobs]  = useState<Set<string>>(new Set());
  const [reuploadTarget, setReuploadTarget] = useState<FileRecord | null>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [streamSource,  setStreamSource]  = useState<string>('');
  const [editMode,      setEditMode]      = useState(false);
  const [streak,        setStreak]        = useState<number>(0);
  const [notesInject,   setNotesInject]   = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    if (!selectedFolder) { setFiles([]); setMissingBlobs(new Set()); return; }
    setFilesLoad(true);
    const qs = new URLSearchParams({ folderId: selectedFolder });
    if (selectedTopic) qs.set('topicId', selectedTopic);
    try {
      const r = await fetch(`/api/files?${qs}`);
      const loaded: FileRecord[] = r.ok ? await r.json() : listLocalFiles(selectedFolder, selectedTopic);
      setFiles(loaded);
      // Check for missing blobs in the background
      const missing = new Set<string>();
      await Promise.all(loaded.map(async f => {
        if (f.localBlobId) {
          const payload = await idbStore.get(f.localBlobId).catch(() => undefined);
          if (!payload) missing.add(f.id);
        }
      }));
      setMissingBlobs(missing);
    } catch {
      const loaded = listLocalFiles(selectedFolder, selectedTopic);
      setFiles(loaded);
    }
    finally { setFilesLoad(false); }
  }, [selectedFolder, selectedTopic]);

  useEffect(() => { loadFiles(); }, [loadFiles, filesRefreshKey]);
  useEffect(() => { setViewFile(null); setMissingBlobs(new Set()); }, [selectedFolder, selectedTopic]);

  const loadLib = useCallback(() => {
    setLibLoad(true);
    fetch('/api/library')
      .then(r => r.ok ? r.json() : [])
      .then(setLibItems)
      .catch(() => setLibItems([]))
      .finally(() => setLibLoad(false));
  }, []);

  useEffect(() => {
    if (mainTab === 'library') {
      loadLib();
      setSrsDecks(loadDecks());
    }
  }, [mainTab, loadLib]);

  // ── File operations ───────────────────────────────────────────────────

  async function extractFromFile(file: FileRecord): Promise<string | null> {
    if (file.content) { setExtractedText(file.content); return file.content; }
    if (!file.localBlobId) { toast('No local file data.', 'error'); return null; }
    setExtracting(true);
    try {
      const payload = await idbStore.get(file.localBlobId);
      if (!payload) { toast('File not found in local storage.', 'error'); return null; }
      const res = await extractTextFromBlob(payload.blob, file.name);
      if (res.error) { toast(res.error, 'error'); return null; }
      setExtractedText(res.text);
      toast(`Extracted ${res.wordCount.toLocaleString()} words from "${file.name}"`, 'success');
      return res.text;
    } finally { setExtracting(false); }
  }

  async function uploadFile(file: File) {
    if (!selectedFolder) { toast('Select a folder first.', 'warning'); return; }
    const blobId = uuidv4(), fileId = uuidv4(), createdAt = new Date().toISOString();
    await idbStore.put(blobId, { blob: file, name: file.name, type: file.type, size: file.size });
    const local = { id: fileId, folderId: selectedFolder, topicId: selectedTopic ?? null, name: file.name, type: 'upload', localBlobId: blobId, mimeType: file.type, fileSize: file.size, createdAt };
    try {
      const res = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(local) });
      toast(res.ok ? `"${file.name}" uploaded` : `"${file.name}" saved locally`, res.ok ? 'success' : 'info');
      if (!res.ok) upsertLocalFile(local);
    } catch { upsertLocalFile(local); toast(`"${file.name}" saved locally`, 'info'); }
    await loadFiles(); onRefresh();
  }

  async function uploadFiles(list: FileList | File[]) {
    setUploading(true);
    try { for (const f of Array.from(list)) await uploadFile(f); }
    finally { setUploading(false); }
  }

  async function handleReupload(newFile: File, target: FileRecord) {
    const newBlobId = uuidv4();
    await idbStore.put(newBlobId, { blob: newFile, name: newFile.name, type: newFile.type, size: newFile.size });
    try {
      await fetch(`/api/files/${target.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localBlobId: newBlobId, fileSize: newFile.size }),
      });
    } catch {}
    setFiles(prev => prev.map(f => f.id === target.id ? { ...f, localBlobId: newBlobId, fileSize: newFile.size } : f));
    setMissingBlobs(prev => { const next = new Set(prev); next.delete(target.id); return next; });
    setReuploadTarget(null);
    toast(`"${target.name}" restored ✓`, 'success');
  }

  async function deleteFile(e: React.MouseEvent, file: FileRecord) {
    e.stopPropagation();
    if (!confirm(`Delete "${file.name}"?`)) return;
    if (file.localBlobId) await idbStore.delete(file.localBlobId);
    deleteLocalFile(file.id);
    await fetch(`/api/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
    setFiles(p => p.filter(f => f.id !== file.id));
    if (viewFile?.id === file.id) setViewFile(null);
    if (selFile?.id === file.id) { setSelFile(null); setExtractedText(''); setOutput(''); }
    toast('File deleted', 'info');
  }

  // ── AI generation (streaming) ──────────────────────────────────────────

  async function runGenerate(mode: ToolMode) {
    let src = extractedText.trim();
    if (!src && selFile) src = (await extractFromFile(selFile))?.trim() ?? '';
    if (!src) { toast('Select a file or paste content first.', 'warning'); return; }

    // Cancel any in-flight stream
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setGenerating(true);
    setOutput('');
    setStreamSource('');
    setEditMode(false);

    try {
      const ollamaModel = typeof window !== 'undefined'
        ? (localStorage.getItem('kivora_ollama_model') ?? 'mistral')
        : 'mistral';

      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, text: src, options: { count }, model: ollamaModel }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        // Fallback to non-streaming route
        const fallback = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, text: src, options: { count }, model: ollamaModel }),
        });
        const data = await fallback.json();
        setOutput(data.content ?? data.error ?? 'No output received.');
        if (data.source === 'offline') toast('Generated offline — AI not connected', 'info');
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.token) {
              accumulated += parsed.token;
              setOutput(accumulated);
            }
            if (parsed.done) {
              setStreamSource(parsed.source ?? '');
              if (parsed.source === 'offline') toast('Generated offline — AI not connected', 'info');
            }
          } catch { /* malformed chunk */ }
        }
      }
      if (!accumulated) setOutput('No output received.');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // cancelled
      toast('Generation failed. Please try again.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  // ── Export generated content ───────────────────────────────────────────

  function downloadOutput(format: 'txt' | 'md') {
    if (!output) return;
    const ext = format === 'md' ? 'md' : 'txt';
    const mime = format === 'md' ? 'text/markdown' : 'text/plain';
    const filename = `${genMode}-${selFile?.name?.replace(/\.[^.]+$/, '') ?? 'export'}.${ext}`;
    const blob = new Blob([output], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${filename}`, 'success');
  }

  // ── Streak counter from localStorage ─────────────────────────────────
  useEffect(() => {
    // Read study streak from local analytics data
    try {
      const raw = localStorage.getItem('kivora_study_streak');
      if (raw) setStreak(parseInt(raw, 10) || 0);
    } catch {}
  }, []);

  async function saveToLibrary() {
    if (!output) return;
    const res = await fetch('/api/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: genMode, content: output }),
    });
    if (res.ok) toast('Saved to Library ✓', 'success');
    else toast('Could not save — DB may not be configured', 'warning');
  }

  function handleUseForTools(text: string) {
    setExtractedText(text);
    setSelFile(viewFile);
    setPasteMode(false);
    setOutput('');
    setMainTab('generate');
    toast('Content loaded — pick a tool and generate', 'success');
  }

  function clearGen() { abortRef.current?.abort(); setSelFile(null); setExtractedText(''); setOutput(''); setPasteMode(false); setGenerating(false); }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      // Don't fire if focus is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape' && output) { clearGen(); return; }
      if (inInput) return;
      if (ctrl && e.key === 'g') { e.preventDefault(); if (mainTab === 'generate' && extractedText && !generating) runGenerate(genMode as ToolMode); }
      if (ctrl && e.key === 's') { e.preventDefault(); if (output) saveToLibrary(); }
      if (ctrl && e.key === 'e') { e.preventDefault(); if (output) downloadOutput('md'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, extractedText, generating, genMode, output]);

  const breadcrumb = [selectedFolderName, selectedTopicName].filter(Boolean).join(' › ');
  const currentGen = GENERATE_TABS.find(t => t.id === genMode)!;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="tool-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ gap: 10, flexShrink: 0 }}>
        <span className="panel-title">
          {breadcrumb
            ? <>{selectedFolderName}<span style={{ color: 'var(--text-3)' }}>{selectedTopicName ? ` › ${selectedTopicName}` : ''}</span></>
            : 'Kivora Workspace'}
        </span>
        {!selectedFolder && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', fontWeight: 400 }}>← Select a folder to get started</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {streak > 0 && (
            <span title={`${streak}-day study streak`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--text-xs)', color: 'var(--text-2)', background: 'color-mix(in srgb, #f59e0b 15%, var(--surface))', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)', borderRadius: 20, padding: '2px 8px', cursor: 'default' }}>
              🔥 {streak}d
            </span>
          )}
          {files.length > 0 && <span className="badge badge-accent">{files.length} file{files.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" style={{ flexShrink: 0, overflowX: 'auto', flexWrap: 'nowrap' }}>
        {([
          ['files',    `📁 Files${files.length ? ` (${files.length})` : ''}`],
          ['generate', '⚡ Generate'],
          ['chat',     '💬 Chat'],
          ['notes',    '📓 Notes'],
          ['math',     '🧮 Math'],
          ['focus',    '🍅 Focus'],
          ['planner',  '📅 Planner'],
          ['library',  `🗂 Library${libItems.length ? ` (${libItems.length})` : ''}`],
        ] as [MainTab, string][]).map(([id, label]) => (
          <button key={id} className={`tab-btn${mainTab === id ? ' active' : ''}`}
            onClick={() => setMainTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ─────────────────── FILES ─────────────────── */}
        {mainTab === 'files' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: viewFile ? 'clamp(180px, 28%, 300px)' : '100%',
              flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRight: viewFile ? '1px solid var(--border)' : 'none',
              transition: 'width 0.22s ease',
            }}>
              {!selectedFolder ? (
                <div className="empty-state" style={{ flex: 1 }}>
                  <div className="empty-icon">📂</div>
                  <h3>No folder selected</h3>
                  <p>Pick a folder from the left sidebar to see and upload files.</p>
                </div>
              ) : (
                <>
                  <input ref={filePickerRef} type="file" multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />

                  {/* Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={async e => { e.preventDefault(); setDragging(false); await uploadFiles(e.dataTransfer.files); }}
                    onClick={() => filePickerRef.current?.click()}
                    style={{
                      margin: '10px 10px 0', borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      border: dragging ? '2px solid var(--accent)' : '1.5px dashed var(--border-2)',
                      background: dragging ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                      transition: 'border-color 0.15s, background 0.15s', flexShrink: 0,
                    }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: dragging ? 'var(--accent)' : 'var(--text-2)' }}>
                      {uploading ? '⏳ Uploading…' : dragging ? '📥 Drop to upload' : '＋ Drop files or click to upload'}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 3 }}>
                      PDF · Word · PowerPoint · Images · Text
                      {(selectedTopicName || selectedFolderName) && <span style={{ color: 'var(--accent)' }}> → {selectedTopicName || selectedFolderName}</span>}
                    </div>
                  </div>

                  {/* File list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 12px' }}>
                    {filesLoad ? (
                      [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 58, marginBottom: 8, borderRadius: 10 }} />)
                    ) : files.length === 0 ? (
                      <div className="empty-state" style={{ padding: '32px 12px' }}>
                        <div className="empty-icon">📁</div>
                        <p style={{ fontSize: 'var(--text-sm)' }}>No files yet — drag one in above.</p>
                      </div>
                    ) : (
                      files.map(file => {
                        const isMissing = missingBlobs.has(file.id);
                        return (
                          <div key={file.id}
                            className={`file-card${viewFile?.id === file.id ? ' selected' : ''}${isMissing ? ' file-card-missing' : ''}`}
                            style={{ cursor: 'pointer', marginBottom: 6, flexDirection: 'column', alignItems: 'stretch' }}
                            onClick={() => !isMissing && setViewFile(v => v?.id === file.id ? null : file)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="file-thumb" style={{ opacity: isMissing ? 0.45 : 1 }}>{fileIcon(file)}</div>
                              <div className="file-info" style={{ flex: 1, minWidth: 0 }}>
                                <div className="file-name" title={file.name}>{file.name}</div>
                                <div className="file-meta">{fmt(file.fileSize)}{file.fileSize ? ' · ' : ''}{fmtDate(file.createdAt)}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                {!isMissing && (
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                                    onClick={e => { e.stopPropagation(); setViewFile(file); }}>View</button>
                                )}
                                <button className="btn-icon" style={{ color: 'var(--danger)', width: 26, height: 26 }}
                                  onClick={e => deleteFile(e, file)}>✕</button>
                              </div>
                            </div>
                            {isMissing && (
                              <div style={{
                                marginTop: 6, padding: '6px 10px', borderRadius: 8,
                                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}
                                onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 'var(--text-xs)', color: '#f59e0b', flex: 1 }}>
                                  ⚠ File data missing — re-upload to restore
                                </span>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: '2px 10px', background: '#f59e0b', color: '#000', border: 'none' }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setReuploadTarget(file);
                                    reuploadRef.current?.click();
                                  }}>
                                  ↑ Re-upload
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* Hidden re-upload input */}
                  <input
                    ref={reuploadRef}
                    type="file"
                    accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                    style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file && reuploadTarget) await handleReupload(file, reuploadTarget);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>
            {viewFile && (
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <FileViewer file={viewFile} onClose={() => setViewFile(null)} onUseForTools={handleUseForTools} />
              </div>
            )}
          </div>
        )}

        {/* ─────────────────── GENERATE ──────────────── */}
        {mainTab === 'generate' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* Tool mode pills */}
            <div style={{ display: 'flex', gap: 5, padding: '10px 14px 8px', flexWrap: 'wrap', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              {GENERATE_TABS.map(t => (
                <button key={t.id} title={t.hint}
                  onClick={() => { setGenMode(t.id); setOutput(''); }}
                  style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 'var(--text-xs)',
                    fontWeight: 500, border: `1.5px solid ${genMode === t.id ? 'var(--accent)' : 'var(--border-2)'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    background: genMode === t.id ? 'var(--accent)' : 'var(--surface-2)',
                    color: genMode === t.id ? '#fff' : 'var(--text-2)',
                    transition: 'all 0.14s',
                  }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Source row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <button className={`btn btn-sm ${!pasteMode ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setPasteMode(false)}>From file</button>
                <button className={`btn btn-sm ${pasteMode ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => { setPasteMode(true); setSelFile(null); if (!pasteMode) setExtractedText(''); }}>Paste text</button>
              </div>

              {!pasteMode && (
                <>
                  {selFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '5px 10px' }}>
                      <span>{fileIcon(selFile)}</span>
                      <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selFile.name}</span>
                      {extractedText && <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>}
                      <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={clearGen}>✕</button>
                    </div>
                  ) : files.length > 0 ? (
                    <select defaultValue="" onChange={e => { const f = files.find(x => x.id === e.target.value); if (f) { setSelFile(f); setExtractedText(''); setOutput(''); } }} style={{ flex: 1, minWidth: 180 }}>
                      <option value="" disabled>Choose a file…</option>
                      {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>No files yet —</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setMainTab('files')}>Go to Files ↗</button>
                    </div>
                  )}
                  {selFile && !extractedText && (
                    <button className="btn btn-secondary btn-sm" disabled={extracting}
                      onClick={() => extractFromFile(selFile)}>
                      {extracting ? 'Extracting…' : '↓ Extract text'}
                    </button>
                  )}
                </>
              )}

              {pasteMode && !extractedText && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>Paste content below →</span>}
              {pasteMode && extractedText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>
                  <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={() => { setExtractedText(''); setOutput(''); }}>✕</button>
                </div>
              )}

              {(extractedText || pasteMode) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                  {['quiz','mcq','flashcards','assignment','exam'].includes(genMode) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                      Count:
                      <input type="number" value={count} min={2} max={25}
                        onChange={e => setCount(Math.max(2, Math.min(25, +e.target.value)))}
                        style={{ width: 52, padding: '3px 7px', fontSize: 'var(--text-xs)' }} />
                    </label>
                  )}
                  {generating ? (
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--text-3)' }}
                      onClick={() => { abortRef.current?.abort(); setGenerating(false); }}>
                      ✕ Cancel
                    </button>
                  ) : (
                    <button
                      className={`btn btn-sm ${output ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={!extractedText.trim() && pasteMode}
                      onClick={() => runGenerate(genMode as ToolMode)}
                      title="Generate (Ctrl+G)">
                      {output ? `↻ Regenerate` : `${currentGen.icon} Generate ${currentGen.label}`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Paste textarea */}
            {pasteMode && !extractedText && (
              <div style={{ padding: '12px 14px', flexShrink: 0 }}>
                <textarea
                  placeholder="Paste your notes, essay, textbook content, or any study material here…"
                  style={{ width: '100%', minHeight: 140, resize: 'vertical', background: 'var(--surface)', border: '1.5px solid var(--border-2)', borderRadius: 10, padding: '12px 14px', fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit' }}
                  onBlur={e => { if (e.target.value.trim()) setExtractedText(e.target.value.trim()); }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm"
                    onClick={e => {
                      const ta = (e.currentTarget.closest('div')?.previousElementSibling as HTMLTextAreaElement);
                      if (ta?.value.trim()) setExtractedText(ta.value.trim());
                    }}>Use this text →</button>
                </div>
              </div>
            )}

            {/* Output */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
              {generating && !output && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 20px', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ color: 'var(--text-3)' }}>Generating {currentGen.label.toLowerCase()}…</span>
                </div>
              )}

              {(output || (generating && output)) && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 18 }}>{currentGen.icon}</span>
                    <span style={{ fontWeight: 600 }}>{currentGen.label}</span>
                    {selFile && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>from &ldquo;{selFile.name}&rdquo;</span>}
                    {generating && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginLeft: 4 }}>● streaming…</span>}
                    {!generating && streamSource === 'offline' && <span className="badge" style={{ fontSize: 10, opacity: 0.6 }}>offline</span>}
                    {!generating && streamSource === 'ollama' && <span className="badge badge-accent" style={{ fontSize: 10 }}>AI</span>}
                    {/* Edit toggle — only for text modes, not while streaming */}
                    {!generating && (genMode === 'summarize' || genMode === 'notes' || genMode === 'rephrase' || genMode === 'outline' || genMode === 'assignment' || genMode === 'quiz') && (
                      <button
                        className={`btn btn-sm ${editMode ? 'btn-accent' : 'btn-ghost'}`}
                        style={{ marginLeft: 'auto', fontSize: 12 }}
                        onClick={() => setEditMode(v => !v)}
                        title={editMode ? 'Done editing (view rendered)' : 'Edit output inline'}
                      >
                        {editMode ? '✓ Done' : '✏ Edit'}
                      </button>
                    )}
                  </div>

                  {/* Output rendering */}
                  {editMode && !generating && (genMode === 'summarize' || genMode === 'notes' || genMode === 'rephrase' || genMode === 'outline' || genMode === 'assignment' || genMode === 'quiz')
                    ? (
                      <textarea
                        value={output}
                        onChange={e => setOutput(e.target.value)}
                        spellCheck
                        style={{ width: '100%', minHeight: 320, padding: '14px 16px', background: 'var(--surface-2)', border: '1.5px solid var(--accent)', borderRadius: 10, color: 'var(--text)', fontSize: 'var(--text-sm)', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                      />
                    )
                    : generating
                    ? <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(output) + '<span class="stream-cursor">▍</span>' }} />
                    : genMode === 'practice'   ? <PracticeView content={output} />
                    : genMode === 'mcq'        ? <MCQView content={output} />
                    : genMode === 'flashcards' ? <FlashcardView content={output} />
                    : genMode === 'exam'       ? <ExamView content={output} />
                    : <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(output) }} />
                  }

                  {!generating && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => navigator.clipboard.writeText(output).then(() => toast('Copied!', 'success'))}>
                        📋 Copy
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('md')} title="Download as Markdown (Ctrl+E)">⬇ .md</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('txt')} title="Download as plain text">⬇ .txt</button>
                      <button className="btn btn-ghost btn-sm" onClick={saveToLibrary} title="Save to Library (Ctrl+S)">🗂 Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNotesInject(output); setMainTab('notes'); toast('Opened in Notes ✓', 'success'); }} title="Send to Notes editor">📓 Notes</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setOutput(''); setEditMode(false); }}>✕ Clear</button>
                    </div>
                  )}
                </>
              )}

              {!generating && !output && extractedText && (
                <div className="empty-state" style={{ padding: '50px 20px' }}>
                  <div className="empty-icon">{currentGen.icon}</div>
                  <h3>{currentGen.label}</h3>
                  <p>{currentGen.hint}</p>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 6 }}>
                    {wordCount(extractedText).toLocaleString()} words ready
                  </p>
                  <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => runGenerate(genMode as ToolMode)}>
                      {currentGen.icon} Generate {currentGen.label}
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>or press Ctrl+G</span>
                  </div>
                </div>
              )}

              {!generating && !output && !extractedText && !pasteMode && (
                <div className="empty-state" style={{ padding: '50px 20px' }}>
                  <div className="empty-icon">⚡</div>
                  <h3>AI Generate</h3>
                  <p>
                    Open a file in <strong>Files</strong> and click <strong>⚡ Use for Generate</strong>,
                    or switch to <strong>Paste text</strong> above to enter content directly.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 'var(--text-xs)', color: 'var(--text-3)', textAlign: 'left', maxWidth: 280, margin: '18px auto 0' }}>
                    <span><kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Ctrl+G</kbd> Generate</span>
                    <span><kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Ctrl+S</kbd> Save to library</span>
                    <span><kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Ctrl+E</kbd> Export .md</span>
                    <span><kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Esc</kbd> Clear output</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────── CHAT ──────────────────── */}
        {mainTab === 'chat' && (
          <ChatPanel extractedText={extractedText} fileName={selFile?.name} />
        )}

        {/* ─────────────────── NOTES ─────────────────── */}
        {mainTab === 'notes' && (
          <NotesPanel
            folderId={selectedFolder}
            injectContent={notesInject}
            onInjectConsumed={() => setNotesInject(undefined)}
          />
        )}

        {/* ─────────────────── MATH ──────────────────── */}
        {mainTab === 'math' && <MathPanel />}

        {/* ─────────────────── FOCUS ─────────────────── */}
        {mainTab === 'focus' && <FocusPanel />}

        {/* ─────────────────── PLANNER ─────────────────── */}
        {mainTab === 'planner' && <ExamPlannerPanel />}

        {/* ─────────────────── LIBRARY ───────────────── */}
        {mainTab === 'library' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Saved outputs</h3>
                {libItems.length > 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{libItems.length} item{libItems.length !== 1 ? 's' : ''}</div>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={loadLib}>↻ Refresh</button>
            </div>

            {/* ── SRS Decks ───────────────────────────────────────────────── */}
            {srsDecks.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>📇 Saved Flashcard Decks</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{srsDecks.length} deck{srsDecks.length !== 1 ? 's' : ''}</span>
                </div>
                {srsDecks.map(deck => {
                  const st = getDeckStats(deck);
                  const isReviewing = reviewDeck === deck.id;
                  return (
                    <div key={deck.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', marginBottom: 3 }}>{deck.name}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[
                              { label: `${st.new} new`,       color: '#4f86f7' },
                              { label: `${st.learning} lrn`,  color: '#f59e0b' },
                              { label: `${st.mature} mature`,  color: '#52b788' },
                            ].map(b => (
                              <span key={b.label} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${b.color}22`, color: b.color, fontWeight: 600 }}>{b.label}</span>
                            ))}
                            {st.due > 0 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--accent-subtle, rgba(79,134,247,0.12))', color: 'var(--accent)', fontWeight: 700 }}>{st.due} due</span>}
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => setReviewDeck(isReviewing ? null : deck.id)}>
                          {isReviewing ? 'Close' : (st.due > 0 ? `▶ Review ${st.due}` : '▶ Browse')}
                        </button>
                        <button className="btn-icon" style={{ color: 'var(--text-3)', width: 24, height: 24, fontSize: 12 }}
                          onClick={() => {
                            if (!confirm(`Delete deck "${deck.name}"?`)) return;
                            deleteDeck(deck.id);
                            setSrsDecks(d => d.filter(x => x.id !== deck.id));
                          }}>✕</button>
                      </div>
                      {isReviewing && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '14px' }}>
                          <FlashcardView content={deck.cards.map(c => `Front: ${c.front} | Back: ${c.back}`).join('\n')} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              </div>
            )}

            {libLoad ? (
              [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 90, marginBottom: 10, borderRadius: 10 }} />)
            ) : libItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🗂️</div>
                <h3>Library is empty</h3>
                <p>Generate something in <strong>Generate</strong>, then click <strong>Save to Library</strong>.</p>
              </div>
            ) : libItems.map(item => {
              const tool = GENERATE_TABS.find(t => t.id === item.mode);
              const expanded = libExpanded[item.id];
              return (
                <div key={item.id} className="lib-item" style={{ marginBottom: 10 }}>
                  <div className="lib-item-header">
                    <span style={{ fontSize: 16 }}>{tool?.icon ?? '📄'}</span>
                    <span className="lib-item-mode">{tool?.label ?? item.mode}</span>
                    <span className="lib-item-date">{fmtDate(item.createdAt)}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setLibExpanded(p => ({ ...p, [item.id]: !expanded }))}>
                        {expanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setOutput(item.content);
                          const match = GENERATE_TABS.find(t => t.id === item.mode);
                          setGenMode(match ? item.mode as GenMode : 'summarize');
                          setMainTab('generate');
                          toast('Loaded into Generate', 'info');
                        }}>Open ↗</button>
                      <button className="btn-icon" style={{ color: 'var(--danger)', width: 26, height: 26 }}
                        onClick={async () => {
                          await fetch(`/api/library/${item.id}`, { method: 'DELETE' });
                          setLibItems(p => p.filter(x => x.id !== item.id));
                          toast('Deleted', 'info');
                        }}>✕</button>
                    </div>
                  </div>
                  <div className="lib-item-preview" style={{ maxHeight: expanded ? 'none' : 80, overflow: expanded ? 'visible' : 'hidden', WebkitMaskImage: expanded ? 'none' : 'linear-gradient(to bottom, #000 60%, transparent)', maskImage: expanded ? 'none' : 'linear-gradient(to bottom, #000 60%, transparent)' }}>
                    {item.content.slice(0, expanded ? undefined : 600)}{!expanded && item.content.length > 600 ? '…' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                      onClick={() => navigator.clipboard.writeText(item.content).then(() => toast('Copied!', 'success'))}>
                      📋 Copy
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                      onClick={() => {
                        const filename = `${item.mode}-${new Date(item.createdAt).toISOString().slice(0,10)}.md`;
                        const blob = new Blob([item.content], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                        URL.revokeObjectURL(url);
                        toast(`Downloaded ${filename}`, 'success');
                      }}>
                      ⬇ .md
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center', marginLeft: 2 }}>
                      {wordCount(item.content).toLocaleString()} words
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
