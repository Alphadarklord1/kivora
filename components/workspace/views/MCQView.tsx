'use client';
import { useState } from 'react';
import { mdToHtml } from '@/lib/utils/md';
import { recordQuizAttempt, type QuizAnswerSummary } from '@/lib/workspace/quiz-persistence';

export function MCQView({ content, fileId, deckId }: { content: string; fileId?: string | null; deckId?: string | null }) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [score,    setScore]    = useState<number | null>(null);

  // Accept any common question numbering the AI emits: "Q1.", "Q1)", "**Q1.**",
  // "1.", "1)", "**1.**". Block must have at least two A/B/C/D options to count.
  const blocks = content
    .split(/\n(?=\s*\*?\*?(?:Q?\d+)[\.\)]\s)/i)
    .map(b => b.trim())
    .filter(b =>
      /^\s*\*?\*?(?:Q?\d+)[\.\)]/i.test(b) &&
      (b.match(/^\s*[A-D][\.\)]/gmi) ?? []).length >= 2,
    );

  if (blocks.length === 0)
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;

  function revealAll() {
    const r: Record<number, boolean> = {};
    blocks.forEach((_, i) => { r[i] = true; });
    setRevealed(r);
    let correct = 0;
    const answers: QuizAnswerSummary[] = [];
    blocks.forEach((block, qi) => {
      const ans = block.match(/✓\s*([A-D])\)?/)?.[1]
        ?? block.match(/Answer:\s*([A-D])\b/i)?.[1];
      const userAnswer = selected[qi] ?? '';
      const isCorrect = Boolean(ans && userAnswer === ans);
      if (isCorrect) correct++;
      // Capture per-question detail so analytics can spot weak areas later.
      const blockLines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const optI = blockLines.findIndex(l => /^\*?\*?[A-D]\*?\*?[\.\)]/i.test(l));
      const stem = (optI > 0 ? blockLines.slice(0, optI).join(' ') : blockLines[0])
        .replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '').trim().slice(0, 200);
      answers.push({
        questionId: `q${qi + 1}`,
        question: stem,
        userAnswer,
        correctAnswer: ans ?? '',
        isCorrect,
      });
    });
    setScore(correct);
    // Fire-and-forget — won't block the UI or surface errors.
    void recordQuizAttempt({
      mode: 'mcq',
      totalQuestions: blocks.length,
      correctAnswers: correct,
      fileId,
      deckId,
      answers,
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {blocks.map((block, qi) => {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
          // The AI sometimes puts the question text on the same line as "Q1." and
          // sometimes on the line after. Concatenate everything from the prefix
          // up to the first option line so the stem is always the actual prompt.
          const optStart = lines.findIndex(l => /^\*?\*?[A-D]\*?\*?[\.\)]/i.test(l));
          const stemLines = (optStart > 0 ? lines.slice(0, optStart) : [lines[0]]).join(' ');
          const stem  = stemLines.replace(/^\s*\*?\*?(?:Q?\d+)[\.\)]\*?\*?\s*/i, '').trim();
          // Options may be "A)" or "A." style.
          const opts  = lines.filter(l => /^\*?\*?[A-D]\*?\*?[\.\)]/i.test(l));
          // Accept "Answer: B", "**Answer:** B", "Correct: B", or option line marked with ✓ / ✔ / (correct) / **bold**.
          const ans   = block.match(/(?:Answer|Correct(?:\s*answer)?)\s*[:=]\s*\*?\*?([A-D])\b/i)?.[1]
                     ?? block.match(/[✓✔]\s*\*?\*?([A-D])\b/i)?.[1]
                     ?? block.match(/^\s*\*\*([A-D])[\.\)]/m)?.[1]
                     ?? block.match(/^\s*([A-D])[\.\)][^\n]*\(correct\)/im)?.[1];
          const isRev = revealed[qi];
          return (
            <div key={qi} className="quiz-card">
              <div className="quiz-q-num">Q{qi + 1} of {blocks.length}</div>
              <div className="quiz-q-text">{stem}</div>
              <div className="quiz-options">
                {opts.map((opt, oi) => {
                  const letter = opt.match(/^\*?\*?([A-D])\*?\*?[\.\)]/i)?.[1]?.toUpperCase() ?? '';
                  const text   = opt.replace(/^\*?\*?[A-D]\*?\*?[\.\)]\s*/i, '').replace(/\s*[✓✔]\s*$/u, '').replace(/\s*\(correct\)\s*$/i, '');
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
