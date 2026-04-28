'use client';
import { useState } from 'react';
import { mdToHtml } from '@/lib/utils/md';

export function PracticeView({ content }: { content: string }) {
  const [hintsShown,   setHintsShown]   = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [answer,       setAnswer]       = useState('');
  const [submitted,    setSubmitted]    = useState(false);

  // Parse sections. The AI is flaky about heading style, so accept several:
  //   ## Problem / # Problem / **Problem** / Problem (on its own line)
  // followed by Hint 1..N, Solution. "---" rules between sections are stripped.
  // Extra "Hint 4+" past the structured set get folded into Solution so they
  // don't clutter the Problem block.
  const sections: Record<string, string> = {};
  let current = '';
  const headingMatchers: Array<(line: string) => string | null> = [
    (line) => line.match(/^#{1,4}\s+(.+?)\s*$/)?.[1] ?? null,
    (line) => line.match(/^\*\*(.+?)\*\*\s*:?\s*$/)?.[1] ?? null,
    (line) => /^(?:Problem|Hint\s*\d+|Solution)\s*:?\s*$/i.test(line.trim()) ? line.trim().replace(/:$/, '') : null,
  ];

  function canonicalize(name: string): string {
    const t = name.trim();
    const hint = t.match(/^Hint\s*(\d+)/i);
    if (hint) return `Hint ${hint[1]}`;
    if (/^problem/i.test(t)) return 'Problem';
    if (/^solution/i.test(t)) return 'Solution';
    return t;
  }

  for (const raw of content.split('\n')) {
    const line = raw.replace(/^\s*[-=─━]{3,}\s*$/, '').replace(/^\s*📋\s*/, '');
    if (!line.trim() && !current) continue;
    let heading: string | null = null;
    for (const m of headingMatchers) { heading = m(line); if (heading) break; }
    if (heading) {
      current = canonicalize(heading);
      sections[current] = sections[current] ?? '';
    } else if (current) {
      sections[current] = (sections[current] + '\n' + raw).trimStart();
    }
  }

  const problem  = (sections['Problem'] ?? content).trim();
  const hints    = [1, 2, 3].map(n => sections[`Hint ${n}`]?.trim()).filter(Boolean) as string[];
  // Anything past Hint 3 gets appended to Solution so the Problem stays clean.
  const extraHintKeys = Object.keys(sections).filter(k => /^Hint\s*[4-9]\d*$/i.test(k));
  const solutionExtras = extraHintKeys.map(k => `\n\n**${k}.** ${sections[k].trim()}`).join('');
  const solution = ((sections['Solution'] ?? '') + solutionExtras).trim();

  if (!problem.trim() || (hints.length === 0 && !solution))
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
      ) : showSolution ? (
        /* The AI didn't emit a Solution section (or it was cut off
           mid-generation). Without this branch the click made the
           Reveal button disappear and showed absolutely nothing —
           that was the user-reported bug. Now we tell them what
           happened and how to recover. */
        <div style={{ background: 'color-mix(in srgb, #f59e0b 10%, var(--surface))', border: '1px dashed color-mix(in srgb, #f59e0b 40%, transparent)', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: '#f59e0b', marginBottom: 6 }}>⚠ Solution missing</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 8 }}>
            The AI didn&apos;t include a worked Solution in this practice problem (or the output was cut short). Try generating a new practice problem from the same source — most rerolls land cleanly.
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setHintsShown(0); setShowSolution(false); setAnswer(''); setSubmitted(false); }}
          >
            ↺ Reset and try the hints again
          </button>
        </div>
      ) : (
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
