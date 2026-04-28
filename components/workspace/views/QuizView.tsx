'use client';
import { useState } from 'react';
import { mdToHtml } from '@/lib/utils/md';
import { recordQuizAttempt, type QuizAnswerSummary } from '@/lib/workspace/quiz-persistence';

// Open-ended quiz view. Parses "Q1. ... Answer: ..." blocks emitted by the
// workspace generator and renders each question with a textarea so the
// student can type their response and self-check against the expected answer.

export function QuizView({ content, fileId, deckId }: { content: string; fileId?: string | null; deckId?: string | null }) {
  const [answers,  setAnswers]  = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [score,    setScore]    = useState<number | null>(null);

  const blocks = content
    .split(/\n(?=\s*\*?\*?(?:Q?\d+)[\.\)]\s)/i)
    .map(b => b.trim())
    .filter(b =>
      /^\s*\*?\*?(?:Q?\d+)[\.\)]/i.test(b) &&
      /(?:^|\n)\s*\*?\*?Answer\*?\*?\s*[:=]/i.test(b),
    );

  if (blocks.length === 0)
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;

  // Strip prefix from a block to recover the bare question stem (and any
  // body text that comes before "Answer:").
  function parseBlock(block: string): { stem: string; expected: string } {
    const ansIdx = block.search(/(?:^|\n)\s*\*?\*?Answer\*?\*?\s*[:=]/i);
    const head = ansIdx >= 0 ? block.slice(0, ansIdx).trim() : block;
    const tail = ansIdx >= 0 ? block.slice(ansIdx).replace(/^\s*\n?\s*\*?\*?Answer\*?\*?\s*[:=]\s*/i, '').trim() : '';
    const stem = head.replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '').trim();
    return { stem, expected: tail };
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
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {blocks.map((block, qi) => {
          const { stem, expected } = parseBlock(block);
          const isRev = revealed[qi];
          const userAnswer = answers[qi] ?? '';
          const isCorrect = isRev && userAnswer.trim().length > 0 && isCloseEnough(userAnswer, expected);
          return (
            <div key={qi} className="quiz-card">
              <div className="quiz-q-num">Q{qi + 1} of {blocks.length}</div>
              <div className="quiz-q-text">{stem}</div>
              <textarea
                value={userAnswer}
                onChange={(e) => setAnswers(p => ({ ...p, [qi]: e.target.value }))}
                disabled={isRev}
                placeholder="Type your answer…"
                rows={3}
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
                {isRev && (
                  <div className="quiz-answer" style={{ marginTop: 0 }}>
                    {userAnswer.trim()
                      ? (isCorrect ? '🎉 Looks right' : '✗ Could be closer — see expected below')
                      : 'Expected answer:'}
                  </div>
                )}
              </div>
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
