'use client';
import { useEffect, useMemo, useState } from 'react';
import { recordQuizAttempt, type QuizAnswerSummary } from '@/lib/workspace/quiz-persistence';
import { addXp, XP_VALUES, incrementCounter, getCounters, checkAndUnlockAchievements } from '@/lib/gamification';
import { hashContent, loadAnswers, saveAnswers, clearAnswers } from '@/lib/workspace/answer-persistence';

// ── Question type detection ────────────────────────────────────────────────
// Real finals mix: MCQ, T/F, fill-in-the-blank, multi-select, matching,
// short-answer, and essay/worked. The AI prompt asks for an inline type
// tag like "(T/F)" or "(Match)" so the parser can render the right UI.
type QType = 'mcq' | 'tf' | 'fib' | 'multi' | 'match' | 'short' | 'essay';

interface MatchPair { left: string; right: string }
interface ParsedQuestion {
  type:        QType;
  stem:        string;
  marks:       number | null;
  options:     string[];           // for mcq / multi
  correctMcq:  string;             // single letter A/B/C/D
  correctMulti: string[];          // ['A','C','D']
  matchLeft:   string[];           // numbered items
  matchRight:  string[];           // lettered items
  matchAnswer: Record<string, string>; // { '1': 'B', '2': 'C', ... }
  expected:    string;             // for tf / fib / short / essay
}

function detectType(block: string): QType {
  // Explicit type tag wins.
  const tag = block.match(/\(([A-Za-z\/\s]+?)\)/)?.[1]?.toLowerCase().trim() ?? '';
  if (/^t\/?f$/.test(tag) || /true.?false/.test(tag)) return 'tf';
  if (/^fib$/.test(tag) || /fill.?in.?the.?blank/.test(tag)) return 'fib';
  if (/select.?all|multi.?select/.test(tag)) return 'multi';
  if (/^match/.test(tag)) return 'match';
  if (/^mcq$/.test(tag) || /multiple.?choice/.test(tag)) return 'mcq';
  if (/^short/.test(tag)) return 'short';
  if (/^(essay|extended|worked)/.test(tag)) return 'essay';
  // Fallbacks for AI output that drops the tag — match by shape.
  const numbered = block.match(/^\s*\d+[\.\)]\s+/gm) ?? [];
  const lettered = block.match(/^\s*[A-Z][\.\)]\s+/gm) ?? [];
  if (numbered.length >= 3 && lettered.length >= 3) return 'match';
  if (lettered.length >= 4 && /Answer\s*:\s*[A-E][,\s]+[A-E]/i.test(block)) return 'multi';
  if (lettered.length >= 2) return 'mcq';
  if (/Answer\s*:\s*(true|false)\b/i.test(block)) return 'tf';
  if (/_+/.test(block)) return 'fib';
  // No options + no blanks → assume short-answer (or essay if expected is long).
  const ans = block.match(/Answer\s*:\s*([\s\S]+)$/i)?.[1]?.trim() ?? '';
  return ans.length > 200 ? 'essay' : 'short';
}

function parseQuestion(block: string): ParsedQuestion {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const type = detectType(block);
  // Strip the prefix (Q1., 1.) and the type tag from the stem.
  const stemLineEnd = lines.findIndex(l => /^\*?\*?[A-E]\*?\*?[\.\)]/i.test(l) || /^\d+[\.\)]\s/.test(l) || /^Answer\s*:/i.test(l));
  const stemRaw = (stemLineEnd > 0 ? lines.slice(0, stemLineEnd) : [lines[0]]).join(' ');
  const marksMatch = stemRaw.match(/\[\s*(\d+)\s*marks?\s*\]/i);
  const marks = marksMatch ? Number(marksMatch[1]) : null;
  const stem = stemRaw
    .replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '')
    .replace(/\[\s*\d+\s*marks?\s*\]/i, '')
    .replace(/\([A-Za-z\/\s]+?\)\s*/, '')
    .trim();

  const ansLine = block.match(/Answer\s*:\s*([\s\S]+?)$/im)?.[1]?.trim() ?? '';

  // Lettered options (A) … D)) for MCQ / multi-select.
  const options = lines.filter(l => /^\*?\*?[A-E]\*?\*?[\.\)]/i.test(l))
    .map(l => l.replace(/^\*?\*?([A-E])\*?\*?[\.\)]\s*/i, ''));

  // Numbered items (1., 2., …) for matching.
  const matchLeft = lines.filter(l => /^\d+[\.\)]\s/.test(l))
    .map(l => l.replace(/^\d+[\.\)]\s*/, ''));
  const matchRight = lines.filter(l => /^[A-Z][\.\)]\s/.test(l))
    .map(l => l.replace(/^[A-Z][\.\)]\s*/, ''));

  const correctMcq = type === 'mcq' ? (ansLine.match(/^([A-E])\b/i)?.[1]?.toUpperCase() ?? '') : '';
  const correctMulti = type === 'multi'
    ? Array.from(ansLine.matchAll(/[A-E]/gi)).map(m => m[0].toUpperCase()).filter((v, i, a) => a.indexOf(v) === i)
    : [];
  const matchAnswer: Record<string, string> = {};
  if (type === 'match') {
    for (const m of ansLine.matchAll(/(\d+)\s*[=→]\s*([A-Z])/gi)) {
      matchAnswer[m[1]] = m[2].toUpperCase();
    }
  }

  return {
    type, stem, marks, options, correctMcq, correctMulti,
    matchLeft, matchRight, matchAnswer, expected: ansLine,
  };
}

const TYPE_LABELS: Record<QType, string> = {
  mcq:   'MCQ',
  tf:    'True / False',
  fib:   'Fill in the blank',
  multi: 'Select all that apply',
  match: 'Matching',
  short: 'Short answer',
  essay: 'Extended response',
};

export function ExamView({
  content,
  onDone,
  fileId,
  deckId,
}: {
  content: string;
  onDone?: (score: number, total: number) => void;
  fileId?: string | null;
  deckId?: string | null;
}) {
  // Tolerate "Q1.", "Q1)", "**Q1.**", "1.", "1)" numbering. A block must
  // either have ≥2 lettered options (MCQ) or an "Answer:" line (short answer).
  const blocks = content
    .split(/\n(?=\s*\*?\*?(?:Q?\d+)[\.\)]\s)/i)
    .map(b => b.trim())
    .filter(b =>
      /^\s*\*?\*?(?:Q?\d+)[\.\)]/i.test(b) &&
      ((b.match(/^\s*[A-D][\.\)]/gmi) ?? []).length >= 2 || /Answer\s*:/i.test(b)),
    );

  const contentHash = useMemo(() => hashContent(content), [content]);
  // Restore exam-in-progress state if the student navigated away mid-test.
  // The countdown is anchored to wall-clock time (startedAt + durationSec)
  // so coming back recovers the correct seconds-left, not the value at the
  // moment they left.
  const restored = useMemo(() => loadAnswers('exam', contentHash), [contentHash]);
  const [phase,    setPhase]    = useState<'setup' | 'exam' | 'results'>(() => restored?.phase === 'exam' ? 'exam' : 'setup');
  const [minutes,  setMinutes]  = useState(Math.max(5, Math.ceil(blocks.length * 1.5)));
  const [secsLeft, setSecsLeft] = useState<number>(() => {
    if (restored?.phase === 'exam' && restored.startedAt && restored.durationSec) {
      const elapsed = Math.floor((Date.now() - restored.startedAt) / 1000);
      return Math.max(0, restored.durationSec - elapsed);
    }
    return 0;
  });
  const [answers,  setAnswers]  = useState<Record<number, string>>(() => restored?.answers ?? {});
  const [score,    setScore]    = useState<{ correct: number; total: number; weak: string[]; wrongIndices: number[] } | null>(null);
  const [examStartedAt, setExamStartedAt] = useState<number | null>(() => restored?.startedAt ?? null);

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

  // Persist exam state on every change so unmounting (e.g. user navigated
  // to /math, /coach, etc. mid-exam) doesn't wipe the in-progress test.
  // The actual timer is anchored to startedAt so it keeps ticking forward
  // even while the panel is unmounted.
  useEffect(() => {
    if (phase === 'exam' && examStartedAt) {
      saveAnswers('exam', {
        contentHash,
        answers,
        startedAt: examStartedAt,
        durationSec: minutes * 60,
        phase,
      });
    }
  }, [answers, phase, examStartedAt, minutes, contentHash]);

  function startExam() {
    const now = Date.now();
    setSecsLeft(minutes * 60);
    setAnswers({});
    setScore(null);
    setExamStartedAt(now);
    setPhase('exam');
    // Persist immediately so a refresh during the first second still
    // recovers correctly.
    saveAnswers('exam', {
      contentHash,
      answers: {},
      startedAt: now,
      durationSec: minutes * 60,
      phase: 'exam',
    });
  }

  function submitExam() {
    let correct = 0;
    const weak: string[] = [];
    const wrongIndices: number[] = [];
    const detailedAnswers: QuizAnswerSummary[] = [];
    blocks.forEach((block, qi) => {
      const parsed = parseQuestion(block);
      const userAnswer = answers[qi] ?? '';
      const stemFull = parsed.stem;

      // Type-aware grading. Each branch decides isCorrect + records the
      // canonical "correctAnswer" string for the analytics summary.
      let isCorrect = false;
      let correctAnsRecord = '';
      if (parsed.type === 'mcq') {
        isCorrect = userAnswer === parsed.correctMcq;
        correctAnsRecord = parsed.correctMcq;
      } else if (parsed.type === 'tf') {
        const expected = /^t/i.test(parsed.expected) ? 'true' : 'false';
        isCorrect = userAnswer.toLowerCase() === expected;
        correctAnsRecord = expected;
      } else if (parsed.type === 'fib') {
        // Loose match: case-insensitive, punctuation-stripped equality OR
        // the user's answer being a substring of the expected (or vice
        // versa) — captures "Paris" vs "Paris, France" without being
        // overly strict.
        const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const u = norm(userAnswer);
        const e = norm(parsed.expected);
        isCorrect = u.length > 0 && (u === e || (e.includes(u) && u.length >= 3) || u.includes(e));
        correctAnsRecord = parsed.expected.slice(0, 200);
      } else if (parsed.type === 'multi') {
        // Set equality on the chosen letters. Stored as comma-separated
        // string in `answers` so localStorage persistence keeps working.
        const chosen = userAnswer.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).sort();
        const expected = parsed.correctMulti.slice().sort();
        isCorrect = chosen.length === expected.length && chosen.every((v, i) => v === expected[i]);
        correctAnsRecord = expected.join(',');
      } else if (parsed.type === 'match') {
        // userAnswer is JSON like {"1":"B","2":"C"}. Score per-pair and
        // require ALL pairs correct for the question to count.
        let pairs: Record<string, string> = {};
        try { pairs = userAnswer ? JSON.parse(userAnswer) as Record<string, string> : {}; } catch { /* noop */ }
        const expected = parsed.matchAnswer;
        const keys = Object.keys(expected);
        isCorrect = keys.length > 0 && keys.every(k => pairs[k] === expected[k]);
        correctAnsRecord = keys.map(k => `${k}=${expected[k]}`).join(', ');
      } else {
        // short / essay — same fuzzy word-overlap as QuizView.
        const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
        const userWords = new Set(norm(userAnswer));
        const expectedWords = norm(parsed.expected);
        if (expectedWords.length > 0 && userWords.size > 0) {
          let hits = 0;
          for (const w of expectedWords) if (userWords.has(w)) hits++;
          isCorrect = hits / expectedWords.length >= 0.5;
        }
        correctAnsRecord = parsed.expected.slice(0, 200);
      }
      if (isCorrect) correct++;
      else { weak.push(stemFull.slice(0, 40) + '…'); wrongIndices.push(qi); }
      // Per-question record for analytics — keeps the same shape the
      // /api/quiz-attempts route already validates.
      detailedAnswers.push({
        questionId: `q${qi + 1}`,
        question: stemFull.slice(0, 200),
        userAnswer,
        correctAnswer: correctAnsRecord,
        isCorrect,
      });
    });
    setScore({ correct, total: blocks.length, weak: weak.slice(0, 5), wrongIndices });
    setPhase('results');
    // Exam is done — clear the in-progress snapshot so a future visit
    // doesn't try to "resume" a finished test.
    clearAnswers('exam');
    onDone?.(correct, blocks.length);
    // Persist the attempt — fire-and-forget so a slow network never
    // blocks the results screen.
    const timeTaken = examStartedAt ? Math.round((Date.now() - examStartedAt) / 1000) : null;
    void recordQuizAttempt({
      mode: 'exam',
      totalQuestions: blocks.length,
      correctAnswers: correct,
      fileId,
      deckId,
      timeTaken,
      answers: detailedAnswers,
    });
    // Exam Prep is the heaviest assessment — give a bigger XP bump.
    addXp(XP_VALUES.quizCompleted * 2, 'exam:submit');
    incrementCounter('quizzesCompleted');
    checkAndUnlockAchievements(getCounters());
  }

  const mm  = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss  = String(secsLeft % 60).padStart(2, '0');
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
          onClick={startExam}>Start Exam →</button>
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
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: 6 }}>⚠ Areas to review:</div>
            {score.weak.map((w, i) => (
              <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', marginTop: 3 }}>• {w}</div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={startExam}>Retake Exam</button>
          {/* Retake-wrong-only — keeps the questions you got right marked
              done and unlocks just the misses. Re-arms the timer too so
              the practice is actually timed. */}
          {score.wrongIndices.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                const keepCorrect: Record<number, string> = {};
                blocks.forEach((_, qi) => {
                  if (!score.wrongIndices.includes(qi)) {
                    // Carry forward the right answer so it's already
                    // counted on the next submit (no need to re-pick it).
                    keepCorrect[qi] = answers[qi] ?? '';
                  }
                });
                const now = Date.now();
                // Recalculate a sensible time limit: roughly 1.5 min per
                // remaining wrong question, with a 5-minute floor.
                const remainingMins = Math.max(5, Math.ceil(score.wrongIndices.length * 1.5));
                setMinutes(remainingMins);
                setSecsLeft(remainingMins * 60);
                setAnswers(keepCorrect);
                setScore(null);
                setExamStartedAt(now);
                setPhase('exam');
                saveAnswers('exam', {
                  contentHash,
                  answers: keepCorrect,
                  startedAt: now,
                  durationSec: remainingMins * 60,
                  phase: 'exam',
                });
              }}
            >
              ↻ Retake wrong ({score.wrongIndices.length})
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setPhase('setup')}>Change settings</button>
        </div>
      </div>
    );
  }

  // In progress
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: secsLeft < 60 ? 'var(--danger)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          ⏱ {mm}:{ss}
        </div>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{Object.keys(answers).length}/{blocks.length} answered</span>
        <button className="btn btn-sm btn-primary" onClick={submitExam}>Submit</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocks.map((block, qi) => {
          // Single source of truth — the parser detects the type and
          // returns everything we need to render the right input UI.
          const q = parseQuestion(block);
          const userAnswer = answers[qi] ?? '';
          return (
            <div key={qi} className="quiz-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="quiz-q-num">Q{qi + 1}</div>
                {q.marks !== null && (
                  <span className="badge badge-accent" style={{ fontSize: 10 }}>
                    {q.marks} mark{q.marks === 1 ? '' : 's'}
                  </span>
                )}
                <span className="badge" style={{ fontSize: 10, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                  {TYPE_LABELS[q.type]}
                </span>
              </div>
              <div className="quiz-q-text">{q.stem}</div>

              {/* MCQ — single best answer */}
              {q.type === 'mcq' && (
                <div className="quiz-options">
                  {q.options.map((text, oi) => {
                    const letter = String.fromCharCode(65 + oi);
                    const isSel = userAnswer === letter;
                    return (
                      <div key={oi} className={`quiz-option${isSel ? ' selected' : ''}`}
                        onClick={() => setAnswers(p => ({ ...p, [qi]: letter }))}>
                        <span className="quiz-opt-letter">{letter}</span>
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* True / False — two big buttons */}
              {q.type === 'tf' && (
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {['true', 'false'].map(val => {
                    const isSel = userAnswer.toLowerCase() === val;
                    return (
                      <button key={val} type="button"
                        onClick={() => setAnswers(p => ({ ...p, [qi]: val }))}
                        style={{
                          flex: 1, padding: '12px', borderRadius: 10,
                          border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border-2)'}`,
                          background: isSel ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface)',
                          color: 'var(--text)', fontSize: 'var(--text-base)', fontWeight: 600,
                          cursor: 'pointer',
                        }}>
                        {val === 'true' ? '✓ True' : '✗ False'}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Fill in the blank — single short text input */}
              {q.type === 'fib' && (
                <input
                  type="text"
                  value={userAnswer}
                  onChange={(e) => setAnswers(p => ({ ...p, [qi]: e.target.value }))}
                  placeholder="Fill in the blank…"
                  style={{
                    width: '100%', marginTop: 10, padding: '10px 14px',
                    borderRadius: 8, border: '1px solid var(--border-2)',
                    background: 'var(--surface)', color: 'var(--text)',
                    fontSize: 'var(--text-base)', fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              )}

              {/* Multi-select — checkbox per option, store as comma list */}
              {q.type === 'multi' && (
                <div className="quiz-options">
                  {q.options.map((text, oi) => {
                    const letter = String.fromCharCode(65 + oi);
                    const chosen = userAnswer.split(',').map(s => s.trim()).filter(Boolean);
                    const isSel = chosen.includes(letter);
                    return (
                      <div key={oi} className={`quiz-option${isSel ? ' selected' : ''}`}
                        onClick={() => {
                          const next = isSel ? chosen.filter(c => c !== letter) : [...chosen, letter].sort();
                          setAnswers(p => ({ ...p, [qi]: next.join(',') }));
                        }}>
                        <span className="quiz-opt-letter" style={{ borderRadius: 4 }}>
                          {isSel ? '✓' : letter}
                        </span>
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Matching — left column is the prompt, right column is a
                  dropdown per row picking the matching letter. Store the
                  pairs as a JSON map so persistence + grading are stable. */}
              {q.type === 'match' && (
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {q.matchLeft.map((leftText, li) => {
                    const num = String(li + 1);
                    let pairs: Record<string, string> = {};
                    try { pairs = userAnswer ? JSON.parse(userAnswer) as Record<string, string> : {}; } catch { /* noop */ }
                    return (
                      <div key={li} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 8 }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 20 }}>{num}.</span>
                        <span style={{ flex: 1, fontSize: 'var(--text-sm)' }}>{leftText}</span>
                        <span style={{ color: 'var(--text-3)' }}>→</span>
                        <select
                          value={pairs[num] ?? ''}
                          onChange={(e) => {
                            const next = { ...pairs, [num]: e.target.value };
                            if (!e.target.value) delete next[num];
                            setAnswers(p => ({ ...p, [qi]: JSON.stringify(next) }));
                          }}
                          style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border-2)', color: 'var(--text)' }}
                        >
                          <option value="">—</option>
                          {q.matchRight.map((_, ri) => {
                            const ltr = String.fromCharCode(65 + ri);
                            return <option key={ltr} value={ltr}>{ltr}</option>;
                          })}
                        </select>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border-2)' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choices</div>
                    {q.matchRight.map((rightText, ri) => (
                      <div key={ri} style={{ fontSize: 'var(--text-sm)', padding: '2px 0' }}>
                        <strong style={{ color: 'var(--accent)' }}>{String.fromCharCode(65 + ri)}.</strong> {rightText}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Short answer + essay/extended — same textarea, different rows */}
              {(q.type === 'short' || q.type === 'essay') && (
                <textarea
                  value={userAnswer}
                  onChange={(e) => setAnswers(p => ({ ...p, [qi]: e.target.value }))}
                  placeholder={q.type === 'essay' ? 'Write a paragraph or step-by-step solution…' : 'Type your answer here…'}
                  rows={q.type === 'essay' ? 8 : 4}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-2)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
