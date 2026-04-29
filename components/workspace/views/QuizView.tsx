'use client';
import { useState } from 'react';
import { mdToHtml } from '@/lib/utils/md';
import { recordQuizAttempt, type QuizAnswerSummary } from '@/lib/workspace/quiz-persistence';
import { addXp, XP_VALUES, incrementCounter, getCounters, checkAndUnlockAchievements } from '@/lib/gamification';

// Open-ended quiz view. Parses "Q1. ... Answer: ..." blocks emitted by the
// workspace generator and renders each question with a textarea so the
// student can type their response and self-check against the expected answer.

interface AiGradeFeedback {
  score: number;          // 0–100
  rubricHits: string[];   // criteria the answer addressed
  rubricMisses: string[]; // criteria the answer missed
  feedback: string;       // 1–3 sentence summary
  loading?: boolean;
  error?: string;
}

export function QuizView({ content, fileId, deckId }: { content: string; fileId?: string | null; deckId?: string | null }) {
  const [answers,  setAnswers]  = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [score,    setScore]    = useState<number | null>(null);
  const [aiGrades, setAiGrades] = useState<Record<number, AiGradeFeedback>>({});

  const blocks = content
    .split(/\n(?=\s*\*?\*?(?:Q?\d+)[\.\)]\s)/i)
    .map(b => b.trim())
    .filter(b =>
      /^\s*\*?\*?(?:Q?\d+)[\.\)]/i.test(b) &&
      /(?:^|\n)\s*\*?\*?Answer\*?\*?\s*[:=]/i.test(b),
    );

  if (blocks.length === 0)
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;

  // Strip prefix from a block to recover the bare question stem and the
  // optional Rubric line (extended-response quizzes ship with one) plus
  // the body text that comes before "Answer:".
  function parseBlock(block: string): { stem: string; expected: string; rubric: string } {
    const ansIdx = block.search(/(?:^|\n)\s*\*?\*?Answer\*?\*?\s*[:=]/i);
    const head = ansIdx >= 0 ? block.slice(0, ansIdx).trim() : block;
    const tail = ansIdx >= 0 ? block.slice(ansIdx).replace(/^\s*\n?\s*\*?\*?Answer\*?\*?\s*[:=]\s*/i, '').trim() : '';

    // Pull out the "Rubric: ..." line so we can render it as its own
    // block instead of leaving it crammed into the question stem.
    const rubricMatch = head.match(/(?:^|\n)\s*\*?\*?Rubric\*?\*?\s*[:=]\s*([^\n]+)/i);
    const rubric = rubricMatch?.[1]?.trim() ?? '';
    const headWithoutRubric = rubricMatch
      ? head.replace(rubricMatch[0], '').trim()
      : head;
    const stem = headWithoutRubric.replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '').trim();
    return { stem, expected: tail, rubric };
  }

  // Loose word-overlap check — the student's answer is "close enough" if it
  // shares a meaningful chunk of distinctive words with the expected answer.
  function isCloseEnough(user: string, expected: string): boolean {
    const norm = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    const userWords = new Set(norm(user));
    const expectedWords = norm(expected);
    if (expectedWords.length === 0 || userWords.size === 0) return false;
    let hits = 0;
    for (const w of expectedWords) if (userWords.has(w)) hits++;
    return hits / expectedWords.length >= 0.5;
  }

  function gradeAll() {
    const r: Record<number, boolean> = {};
    blocks.forEach((_, i) => { r[i] = true; });
    setRevealed(r);
    let correct = 0;
    const detail: QuizAnswerSummary[] = [];
    blocks.forEach((block, qi) => {
      const { stem, expected } = parseBlock(block);
      const userAnswer = (answers[qi] ?? '').trim();
      const isCorrect = userAnswer.length > 0 && isCloseEnough(userAnswer, expected);
      if (isCorrect) correct++;
      detail.push({
        questionId: `q${qi + 1}`,
        question: stem.slice(0, 200),
        userAnswer,
        correctAnswer: expected.slice(0, 200),
        isCorrect,
      });
    });
    setScore(correct);
    void recordQuizAttempt({
      mode: 'quiz',
      totalQuestions: blocks.length,
      correctAnswers: correct,
      fileId,
      deckId,
      answers: detail,
    });
    addXp(XP_VALUES.quizCompleted, 'quiz:gradeAll');
    incrementCounter('quizzesCompleted');
    checkAndUnlockAchievements(getCounters());
  }

  // Send the user's free-form answer to the grading endpoint and replace
  // the loose word-overlap score with structured rubric feedback.
  // Only available when the question shipped with a Rubric: line; for
  // plain short-answer questions the existing word-overlap check is fine.
  async function gradeWithAi(qi: number) {
    const block = blocks[qi];
    if (!block) return;
    const { stem, expected, rubric } = parseBlock(block);
    const userAnswer = (answers[qi] ?? '').trim();
    if (!userAnswer) return;
    setAiGrades(p => ({ ...p, [qi]: { score: 0, rubricHits: [], rubricMisses: [], feedback: '', loading: true } }));
    try {
      const res = await fetch('/api/practice/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: stem, userAnswer, modelAnswer: expected, rubric }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as Partial<AiGradeFeedback>;
      setAiGrades(p => ({
        ...p,
        [qi]: {
          score: typeof data.score === 'number' ? Math.max(0, Math.min(100, data.score)) : 0,
          rubricHits: Array.isArray(data.rubricHits) ? data.rubricHits.slice(0, 8) : [],
          rubricMisses: Array.isArray(data.rubricMisses) ? data.rubricMisses.slice(0, 8) : [],
          feedback: typeof data.feedback === 'string' ? data.feedback.slice(0, 600) : '',
        },
      }));
    } catch {
      setAiGrades(p => ({ ...p, [qi]: { score: 0, rubricHits: [], rubricMisses: [], feedback: '', error: 'Could not grade this answer right now.' } }));
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {blocks.map((block, qi) => {
          const { stem, expected, rubric } = parseBlock(block);
          const isRev = revealed[qi];
          const userAnswer = answers[qi] ?? '';
          const isCorrect = isRev && userAnswer.trim().length > 0 && isCloseEnough(userAnswer, expected);
          const aiGrade = aiGrades[qi];
          const isExtended = rubric.length > 0 || expected.length > 400;
          return (
            <div key={qi} className="quiz-card">
              <div className="quiz-q-num">Q{qi + 1} of {blocks.length}</div>
              <div className="quiz-q-text">{stem}</div>
              {rubric && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, #a855f7 8%, transparent)',
                  border: '1px solid color-mix(in srgb, #a855f7 22%, transparent)',
                  fontSize: 'var(--text-xs)',
                  lineHeight: 1.55,
                  color: 'var(--text-2)',
                }}>
                  <strong style={{ fontSize: 'var(--text-xs)', color: '#a855f7', marginRight: 6 }}>RUBRIC</strong>
                  {rubric}
                </div>
              )}
              <textarea
                value={userAnswer}
                onChange={(e) => setAnswers(p => ({ ...p, [qi]: e.target.value }))}
                disabled={isRev}
                placeholder={isExtended ? 'Write a paragraph (~200 words)…' : 'Type your answer…'}
                rows={isExtended ? 8 : 3}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-2)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.55,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {!isRev && (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={!userAnswer.trim()}
                    onClick={() => setRevealed(p => ({ ...p, [qi]: true }))}
                  >
                    Check answer
                  </button>
                )}
                {!isRev && (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setRevealed(p => ({ ...p, [qi]: true }))}
                  >
                    Show expected
                  </button>
                )}
                {/* Extended-response questions get a "Grade with AI" button —
                    the loose word-overlap check is too crude for paragraph
                    answers, so we send the answer + rubric + model paragraph
                    to the grader and surface a real score + feedback. */}
                {isExtended && userAnswer.trim() && (
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={aiGrade?.loading}
                    onClick={() => void gradeWithAi(qi)}
                    title="Send the answer to the AI for rubric-based grading"
                  >
                    {aiGrade?.loading ? 'Grading…' : aiGrade?.score !== undefined && !aiGrade.error ? '↻ Re-grade' : '🤖 Grade with AI'}
                  </button>
                )}
                {isRev && (
                  <div className="quiz-answer" style={{ marginTop: 0 }}>
                    {userAnswer.trim()
                      ? (isCorrect ? '🎉 Looks right' : '✗ Could be closer — see expected below')
                      : 'Expected answer:'}
                  </div>
                )}
              </div>

              {/* AI grading panel — only shows once a grade has come back. */}
              {aiGrade && !aiGrade.loading && !aiGrade.error && aiGrade.feedback && (
                <div style={{
                  marginTop: 10,
                  padding: '12px 14px',
                  borderRadius: 8,
                  background: aiGrade.score >= 75
                    ? 'color-mix(in srgb, #52b788 10%, transparent)'
                    : aiGrade.score >= 50
                      ? 'color-mix(in srgb, #4f86f7 10%, transparent)'
                      : 'color-mix(in srgb, #f59e0b 10%, transparent)',
                  border: `1px solid color-mix(in srgb, ${aiGrade.score >= 75 ? '#52b788' : aiGrade.score >= 50 ? '#4f86f7' : '#f59e0b'} 30%, transparent)`,
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.55,
                  color: 'var(--text)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <strong style={{ fontSize: 'var(--text-xs)', color: aiGrade.score >= 75 ? '#52b788' : aiGrade.score >= 50 ? '#4f86f7' : '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      AI grade
                    </strong>
                    <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{aiGrade.score}/100</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>{aiGrade.feedback}</div>
                  {aiGrade.rubricHits.length > 0 && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)', marginBottom: 4 }}>
                      ✓ Hit: {aiGrade.rubricHits.join(', ')}
                    </div>
                  )}
                  {aiGrade.rubricMisses.length > 0 && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                      ✗ Missed: {aiGrade.rubricMisses.join(', ')}
                    </div>
                  )}
                </div>
              )}
              {aiGrade?.error && (
                <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>
                  ⚠ {aiGrade.error}
                </div>
              )}
              {isRev && expected ? (
                <div style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.55,
                  color: 'var(--text)',
                }}>
                  <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>EXPECTED</strong>
                  <div style={{ marginTop: 4 }}>{expected}</div>
                </div>
              ) : isRev ? (
                /* Reveal pressed but the AI didn't include an Answer line.
                   Without this fallback the "Expected answer:" hint above
                   pointed at empty space. */
                <div style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'color-mix(in srgb, #f59e0b 10%, transparent)',
                  border: '1px dashed color-mix(in srgb, #f59e0b 40%, transparent)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-2)',
                }}>
                  ⚠ This question came back without an expected answer. Regenerating the quiz usually fixes it.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-secondary" onClick={gradeAll}>Grade all</button>
        {score !== null && (
          <div className={`badge ${score === blocks.length ? 'badge-success' : score >= blocks.length / 2 ? 'badge-accent' : 'badge-danger'}`}
            style={{ fontSize: 'var(--text-sm)', padding: '4px 12px' }}>
            Score: {score} / {blocks.length}
          </div>
        )}
        <button className="btn btn-sm btn-ghost"
          onClick={() => { setAnswers({}); setRevealed({}); setScore(null); }}>Reset</button>
      </div>
    </div>
  );
}
