'use client';
import { useEffect, useState } from 'react';
import { recordQuizAttempt, type QuizAnswerSummary } from '@/lib/workspace/quiz-persistence';
import { addXp, XP_VALUES, incrementCounter, getCounters, checkAndUnlockAchievements } from '@/lib/gamification';

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

  const [phase,    setPhase]    = useState<'setup' | 'exam' | 'results'>('setup');
  const [minutes,  setMinutes]  = useState(Math.max(5, Math.ceil(blocks.length * 1.5)));
  const [secsLeft, setSecsLeft] = useState(0);
  const [answers,  setAnswers]  = useState<Record<number, string>>({});
  const [score,    setScore]    = useState<{ correct: number; total: number; weak: string[] } | null>(null);
  // Track exam start so we can compute timeTaken on submit (the timer
  // counts down, so subtracting from the configured minutes is enough).
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);

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
    setExamStartedAt(Date.now());
    setPhase('exam');
  }

  function submitExam() {
    let correct = 0;
    const weak: string[] = [];
    const detailedAnswers: QuizAnswerSummary[] = [];
    blocks.forEach((block, qi) => {
      // MCQ answer letter (A/B/C/D)
      const mcqLetter = block.match(/(?:Answer|Correct(?:\s*answer)?)\s*[:=]\s*\*?\*?([A-D])\b/i)?.[1]
                ?? block.match(/[✓✔]\s*\*?\*?([A-D])\b/i)?.[1]
                ?? block.match(/^\s*\*\*([A-D])[\.\)]/m)?.[1]
                ?? block.match(/^\s*([A-D])[\.\)][^\n]*\(correct\)/im)?.[1];
      // Short-answer expected text (everything after the Answer: line for
      // non-MCQ blocks). Used for fuzzy grading of free-response questions.
      const shortAnswerMatch = block.match(/Answer\s*:\s*([\s\S]+?)$/im);
      const expectedText = shortAnswerMatch?.[1]?.trim() ?? '';

      const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const optI = blockLines.findIndex(l => /^\*?\*?[A-D]\*?\*?[\.\)]/i.test(l));
      const ansI = blockLines.findIndex(l => /^Answer\s*:/i.test(l));
      const stemEnd = optI > 0 ? optI : (ansI > 0 ? ansI : blockLines.length);
      const stemFull = blockLines.slice(0, stemEnd).join(' ')
        .replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '').trim();
      const userAnswer = answers[qi] ?? '';

      // Grade: MCQ exact-letter match, short-answer fuzzy word-overlap.
      let isCorrect = false;
      let correctAnsRecord = '';
      if (mcqLetter) {
        isCorrect = userAnswer === mcqLetter;
        correctAnsRecord = mcqLetter;
      } else if (expectedText) {
        // ≥50% overlap on distinctive words (>3 chars) — same threshold
        // QuizView uses, so the bar feels consistent across tools.
        const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
        const userWords = new Set(norm(userAnswer));
        const expectedWords = norm(expectedText);
        if (expectedWords.length > 0 && userWords.size > 0) {
          let hits = 0;
          for (const w of expectedWords) if (userWords.has(w)) hits++;
          isCorrect = hits / expectedWords.length >= 0.5;
        }
        correctAnsRecord = expectedText.slice(0, 200);
      }
      if (isCorrect) correct++;
      else weak.push(stemFull.slice(0, 40) + '…');
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
    setScore({ correct, total: blocks.length, weak: weak.slice(0, 5) });
    setPhase('results');
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
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button className="btn btn-primary" onClick={startExam}>Retake Exam</button>
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
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
          const optStart = lines.findIndex(l => /^\*?\*?[A-D]\*?\*?[\.\)]/i.test(l));
          const ansIdx = lines.findIndex(l => /^Answer\s*:/i.test(l));
          // Build stem from everything BEFORE the first option (or the
          // Answer: line for short-answer questions). Joining preserves
          // multi-line questions like "[5 marks] Describe X. Show your steps."
          const stemEnd = optStart > 0 ? optStart : (ansIdx > 0 ? ansIdx : lines.length);
          const stemLines = lines.slice(0, stemEnd).join(' ');
          const stem  = stemLines.replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '').trim();
          const opts  = lines.filter(l => /^\*?\*?[A-D]\*?\*?[\.\)]/i.test(l));
          const isMcq = opts.length >= 2;
          return (
            <div key={qi} className="quiz-card">
              <div className="quiz-q-num">Q{qi + 1}</div>
              <div className="quiz-q-text">{stem}</div>
              {isMcq ? (
                <div className="quiz-options">
                  {opts.map((opt, oi) => {
                    const letter = opt.match(/^\*?\*?([A-D])\*?\*?[\.\)]/i)?.[1]?.toUpperCase() ?? '';
                    const text   = opt.replace(/^\*?\*?[A-D]\*?\*?[\.\)]\s*/i, '').replace(/\s*[✓✔]\s*$/u, '').replace(/\s*\(correct\)\s*$/i, '');
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
              ) : (
                /* Short-answer / essay — give the student an actual place
                   to type their answer. Without this the question shows
                   but there's no input, leaving the user stuck. */
                <textarea
                  value={answers[qi] ?? ''}
                  onChange={(e) => setAnswers(p => ({ ...p, [qi]: e.target.value }))}
                  placeholder="Type your answer here…"
                  rows={4}
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
