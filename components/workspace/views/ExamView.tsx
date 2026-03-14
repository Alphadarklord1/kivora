'use client';
import { useEffect, useState } from 'react';

export function ExamView({ content, onDone }: { content: string; onDone?: (score: number, total: number) => void }) {
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
      const ans  = block.match(/✓\s*([A-D])\)?/)?.[1] ?? block.match(/Answer:\s*([A-D])\b/i)?.[1];
      const stem = block.split('\n')[0].replace(/^\*?\*?Q\d+[\.\)]\*?\*?\s*/i, '').slice(0, 40);
      if (ans && answers[qi] === ans) correct++;
      else weak.push(stem + '…');
    });
    setScore({ correct, total: blocks.length, weak: weak.slice(0, 5) });
    setPhase('results');
    onDone?.(correct, blocks.length);
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
