'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { solve, EXAMPLE_PROBLEMS, type SolverResult } from '@/lib/math/symbolic-solver';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function KaTeX({ latex, display = false }: { latex: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode: display,
        throwOnError: false,
        trust: true,
        strict: false,
        output: 'htmlAndMathml',
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, display]);
  return <span ref={ref} />;
}

// ─── AI verification via Ollama ───────────────────────────────────────────────

async function verifyWithAI(problem: string, computedAnswer: string): Promise<string | null> {
  try {
    const res = await fetch('/api/math-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, answer: computedAnswer }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.feedback ?? null;
  } catch {
    return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MathSolverPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<SolverResult | null>(null);
  const [history, setHistory] = useState<{ input: string; result: SolverResult }[]>([]);
  const [activeCategory, setActiveCategory] = useState('algebra');
  const [loading, setLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [graphExpr, setGraphExpr] = useState('');
  const [showGraph, setShowGraph] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const graphRef = useRef<HTMLDivElement>(null);
  const categories = Object.keys(EXAMPLE_PROBLEMS);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kivora-math-history');
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* noop */ }
  }, []);

  const saveHistory = useCallback((h: { input: string; result: SolverResult }[]) => {
    try { localStorage.setItem('kivora-math-history', JSON.stringify(h.slice(-30))); } catch { /* noop */ }
  }, []);

  const handleSolve = useCallback(async (problemInput?: string) => {
    const problem = (problemInput ?? input).trim();
    if (!problem) return;

    setLoading(true);
    setAiFeedback(null);
    setResult(null);

    // Run symbolic solver
    const solverResult = solve(problem);
    setResult(solverResult);
    setLoading(false);

    // Add to history
    const newHistory = [{ input: problem, result: solverResult }, ...history.filter(h => h.input !== problem)];
    setHistory(newHistory);
    saveHistory(newHistory);

    // Try extractable graph expression
    const cleanExpr = problem
      .replace(/d\/dx|derivative of|simplify|expand|solve/gi, '')
      .replace(/=\s*0$/,'').trim();
    if (/x/.test(cleanExpr) && !cleanExpr.includes('[')) {
      setGraphExpr(cleanExpr);
    }

    // AI verification (non-blocking)
    setAiFeedbackLoading(true);
    const feedback = await verifyWithAI(problem, solverResult.answer);
    setAiFeedback(feedback);
    setAiFeedbackLoading(false);
  }, [input, history, saveHistory]);

  const handleExample = useCallback((expr: string) => {
    setInput(expr);
    inputRef.current?.focus();
  }, []);

  const handleHistoryClick = useCallback((item: { input: string; result: SolverResult }) => {
    setInput(item.input);
    setResult(item.result);
    setShowHistory(false);
  }, []);

  const copyLatex = useCallback(() => {
    if (result?.answerLatex) {
      navigator.clipboard.writeText(result.answerLatex).catch(() => {});
    }
  }, [result]);

  const copyText = useCallback(() => {
    if (result?.answer) {
      navigator.clipboard.writeText(result.answer).catch(() => {});
    }
  }, [result]);

  // Load function-plot graph
  useEffect(() => {
    if (!showGraph || !graphRef.current || !graphExpr) return;

    import('function-plot').then(({ default: functionPlot }) => {
      if (!graphRef.current) return;
      try {
        graphRef.current.innerHTML = '';
        functionPlot({
          target: graphRef.current,
          width: graphRef.current.clientWidth || 500,
          height: 300,
          grid: true,
          yAxis: { domain: [-10, 10] },
          xAxis: { domain: [-10, 10] },
          data: [{ fn: graphExpr.replace(/\^/g, '**'), color: 'var(--primary)' }],
        });
      } catch {
        if (graphRef.current) graphRef.current.innerHTML = '<p style="padding:12px;color:var(--text-muted)">Could not plot this expression</p>';
      }
    }).catch(() => {});
  }, [showGraph, graphExpr]);

  const currentExamples = useMemo(() =>
    EXAMPLE_PROBLEMS[activeCategory]?.examples ?? [],
    [activeCategory]
  );

  return (
    <div className="ms-shell">
      {/* Header */}
      <div className="ms-header">
        <div className="ms-brand">
          <span className="ms-brand-icon">∑</span>
          <div>
            <h1>Math Solver</h1>
            <p>Symbolic computation · Step-by-step · AI verification</p>
          </div>
        </div>
        <div className="ms-header-actions">
          <button className={`ms-hist-btn${showHistory ? ' active' : ''}`} onClick={() => setShowHistory(s => !s)}>
            🕑 History ({history.length})
          </button>
        </div>
      </div>

      <div className="ms-body">
        {/* Left: Input + Examples */}
        <div className="ms-left">
          {/* Input box */}
          <div className="ms-input-card">
            <div className="ms-input-label">Enter a math expression</div>
            <div className="ms-input-row">
              <input
                ref={inputRef}
                className="ms-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSolve()}
                placeholder="e.g. d/dx(x^3 + 2*x) or simplify 2*x + 3*x or x^2 - 5x + 6 = 0"
                spellCheck={false}
                autoFocus
              />
              <button
                className="ms-solve-btn"
                onClick={() => handleSolve()}
                disabled={loading || !input.trim()}
              >
                {loading ? '⟳' : '='}
              </button>
            </div>
            {/* Live LaTeX preview */}
            {input.trim() && (
              <div className="ms-preview">
                <span className="ms-preview-label">Preview</span>
                <div className="ms-preview-latex">
                  <KaTeX latex={safeLatex(input)} display />
                </div>
              </div>
            )}
            {/* Quick shortcuts */}
            <div className="ms-shortcuts">
              {['d/dx(', 'simplify ', 'expand ', 'solve ', 'det(', 'sin(', 'mean('].map(s => (
                <button key={s} className="ms-shortcut" onClick={() => setInput(p => s + p)}>
                  {s.trim() || s}
                </button>
              ))}
            </div>
          </div>

          {/* Category tabs + examples */}
          <div className="ms-examples-card">
            <div className="ms-cat-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`ms-cat-tab${activeCategory === cat ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {EXAMPLE_PROBLEMS[cat].label}
                </button>
              ))}
            </div>
            <div className="ms-examples">
              {currentExamples.map((ex, i) => (
                <button key={i} className="ms-example" onClick={() => handleExample(ex.expr)}>
                  <div className="ms-example-code">{ex.expr}</div>
                  <div className="ms-example-desc">{ex.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Solution */}
        <div className="ms-right">
          {!result && !loading && (
            <div className="ms-empty">
              <span className="ms-empty-icon">𝑓(x)</span>
              <p>Type a math problem and press Enter to solve.</p>
              <p className="ms-empty-hint">Supports derivatives, algebra, quadratics, trig, matrices, and more.</p>
            </div>
          )}

          {loading && (
            <div className="ms-loading">
              <div className="ms-spinner" />
              <p>Computing…</p>
            </div>
          )}

          {result && !loading && (
            <div className="ms-solution">
              {/* Answer bar */}
              <div className={`ms-answer-bar${result.verified ? '' : ' unverified'}`}>
                <div className="ms-answer-meta">
                  <span className="ms-answer-type">{result.type}</span>
                  {result.verified && <span className="ms-verified">✓ Verified by mathjs</span>}
                  {!result.verified && <span className="ms-unverified">⚠ Estimated</span>}
                </div>
                <div className="ms-answer-latex">
                  <KaTeX latex={result.answerLatex} display />
                </div>
                <div className="ms-answer-actions">
                  <button className="ms-act-btn" onClick={copyLatex} title="Copy LaTeX">LaTeX</button>
                  <button className="ms-act-btn" onClick={copyText} title="Copy plain text">Text</button>
                  {graphExpr && (
                    <button className={`ms-act-btn${showGraph ? ' active' : ''}`} onClick={() => setShowGraph(s => !s)}>
                      📈 Graph
                    </button>
                  )}
                </div>
              </div>

              {/* Graph */}
              {showGraph && graphExpr && (
                <div className="ms-graph-card">
                  <div className="ms-graph-title">f(x) = {graphExpr}</div>
                  <div ref={graphRef} className="ms-graph" />
                </div>
              )}

              {/* Steps */}
              <div className="ms-steps">
                <div className="ms-steps-title">Step-by-step solution</div>
                {result.steps.map((step, i) => (
                  <div key={i} className="ms-step">
                    <div className="ms-step-num">{step.step}</div>
                    <div className="ms-step-body">
                      <div className="ms-step-desc">{step.description}</div>
                      <div className="ms-step-expr">
                        <KaTeX latex={step.expression} display />
                      </div>
                      <div className="ms-step-expl">{step.explanation}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Feedback */}
              {(aiFeedback || aiFeedbackLoading) && (
                <div className="ms-ai-card">
                  <div className="ms-ai-header">
                    <span>🤖 AI Verification</span>
                    {aiFeedbackLoading && <span className="ms-ai-loading">Checking…</span>}
                  </div>
                  {aiFeedback && (
                    <div className="ms-ai-feedback">{aiFeedback}</div>
                  )}
                </div>
              )}

              {/* Error display */}
              {result.error && (
                <div className="ms-error">
                  <strong>Note:</strong> {result.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="ms-history-panel">
          <div className="ms-hist-header">
            <h3>History</h3>
            <button className="ms-hist-clear" onClick={() => { setHistory([]); saveHistory([]); }}>Clear all</button>
            <button className="ms-hist-close" onClick={() => setShowHistory(false)}>✕</button>
          </div>
          <div className="ms-hist-list">
            {history.length === 0 && <p className="ms-hist-empty">No history yet.</p>}
            {history.map((item, i) => (
              <button key={i} className="ms-hist-item" onClick={() => handleHistoryClick(item)}>
                <div className="ms-hist-input">{item.input}</div>
                <div className="ms-hist-answer">{item.result.answer}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        /* ── Shell ─────────────────────────────────────────────────── */
        .ms-shell {
          display: flex; flex-direction: column;
          height: calc(100dvh - 40px); overflow: hidden;
          background: var(--bg-surface);
          position: relative;
        }

        /* ── Header ────────────────────────────────────────────────── */
        .ms-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 24px; border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated); flex-shrink: 0;
        }
        .ms-brand { display: flex; align-items: center; gap: 14px; }
        .ms-brand-icon {
          width: 48px; height: 48px; border-radius: 14px;
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, #a78bfa));
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; color: white; font-weight: 700; flex-shrink: 0;
        }
        .ms-brand h1 { margin: 0; font-size: 20px; font-weight: 700; }
        .ms-brand p { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
        .ms-header-actions { display: flex; gap: 8px; }
        .ms-hist-btn {
          padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary); cursor: pointer;
          font-size: 13px; font-weight: 500; transition: all 0.12s;
        }
        .ms-hist-btn:hover, .ms-hist-btn.active { border-color: var(--primary); color: var(--primary); }

        /* ── Body layout ────────────────────────────────────────────── */
        .ms-body {
          display: grid; grid-template-columns: 400px minmax(0, 1fr);
          flex: 1; overflow: hidden; gap: 0;
        }
        .ms-left {
          display: flex; flex-direction: column; gap: 0;
          border-right: 1px solid var(--border-subtle);
          overflow-y: auto; background: var(--bg-elevated);
        }
        .ms-right { overflow-y: auto; padding: 20px; }

        /* ── Input card ─────────────────────────────────────────────── */
        .ms-input-card {
          padding: 20px; border-bottom: 1px solid var(--border-subtle);
        }
        .ms-input-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 10px;
        }
        .ms-input-row { display: flex; gap: 8px; }
        .ms-input {
          flex: 1; padding: 12px 16px; border-radius: 12px;
          border: 2px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-primary);
          font-size: 15px; font-family: 'JetBrains Mono', 'Fira Code', monospace;
          transition: border-color 0.15s; outline: none;
        }
        .ms-input:focus { border-color: var(--primary); }
        .ms-solve-btn {
          width: 50px; height: 50px; border-radius: 12px;
          background: var(--primary); color: white; border: none;
          font-size: 22px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: opacity 0.15s;
        }
        .ms-solve-btn:hover:not(:disabled) { opacity: 0.88; }
        .ms-solve-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ms-preview {
          margin-top: 12px; padding: 10px 12px;
          background: var(--bg-surface); border-radius: 10px;
          border: 1px solid var(--border-subtle);
          overflow-x: auto;
        }
        .ms-preview-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 4px; }
        .ms-preview-latex { display: flex; justify-content: center; padding: 4px 0; }
        .ms-shortcuts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
        .ms-shortcut {
          padding: 4px 10px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; font-family: monospace; cursor: pointer;
          transition: all 0.1s;
        }
        .ms-shortcut:hover { border-color: var(--primary); color: var(--primary); }

        /* ── Examples card ───────────────────────────────────────────── */
        .ms-examples-card { padding: 0 0 16px; flex: 1; }
        .ms-cat-tabs {
          display: flex; flex-wrap: wrap; gap: 2px;
          padding: 12px 16px 8px; background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-subtle);
          position: sticky; top: 0; z-index: 1;
        }
        .ms-cat-tab {
          padding: 5px 12px; border-radius: 8px; border: none;
          background: transparent; color: var(--text-muted);
          font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.12s;
        }
        .ms-cat-tab.active { background: var(--primary); color: white; }
        .ms-cat-tab:hover:not(.active) { color: var(--text-primary); background: var(--bg-surface); }
        .ms-examples { padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; }
        .ms-example {
          text-align: left; padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: var(--bg-surface);
          cursor: pointer; transition: all 0.12s;
        }
        .ms-example:hover { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, var(--bg-surface)); }
        .ms-example-code { font-size: 13px; font-family: monospace; color: var(--text-primary); font-weight: 500; }
        .ms-example-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

        /* ── Empty state ─────────────────────────────────────────────── */
        .ms-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 300px; color: var(--text-muted); text-align: center; gap: 8px;
        }
        .ms-empty-icon { font-size: 64px; opacity: 0.2; }
        .ms-empty p { margin: 0; font-size: 15px; }
        .ms-empty-hint { font-size: 13px !important; }

        .ms-loading {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 60px; color: var(--text-muted);
        }
        .ms-spinner {
          width: 36px; height: 36px; border: 3px solid var(--border-subtle);
          border-top-color: var(--primary); border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Solution ────────────────────────────────────────────────── */
        .ms-solution { display: flex; flex-direction: column; gap: 16px; }

        .ms-answer-bar {
          padding: 20px; border-radius: 16px;
          border: 2px solid var(--primary);
          background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated));
          box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 20%, transparent);
        }
        .ms-answer-bar.unverified {
          border-color: #f59e0b;
          background: color-mix(in srgb, #f59e0b 6%, var(--bg-elevated));
          box-shadow: 0 4px 20px color-mix(in srgb, #f59e0b 20%, transparent);
        }
        .ms-answer-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .ms-answer-type {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
          color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent);
          padding: 2px 8px; border-radius: 6px;
        }
        .ms-verified { font-size: 12px; color: #52b788; }
        .ms-unverified { font-size: 12px; color: #f59e0b; }
        .ms-answer-latex { display: flex; justify-content: center; padding: 12px 0; font-size: 1.2em; overflow-x: auto; }
        .ms-answer-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .ms-act-btn {
          padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .ms-act-btn:hover, .ms-act-btn.active { border-color: var(--primary); color: var(--primary); }

        /* ── Graph ───────────────────────────────────────────────────── */
        .ms-graph-card {
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 16px; overflow: hidden;
        }
        .ms-graph-title {
          padding: 10px 16px; font-size: 13px; font-weight: 600; color: var(--text-secondary);
          border-bottom: 1px solid var(--border-subtle); font-family: monospace;
        }
        .ms-graph { width: 100%; min-height: 300px; }

        /* ── Steps ───────────────────────────────────────────────────── */
        .ms-steps {
          background: var(--bg-elevated); border-radius: 16px;
          border: 1px solid var(--border-subtle); overflow: hidden;
        }
        .ms-steps-title {
          padding: 14px 20px; font-size: 13px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted);
          border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface);
        }
        .ms-step {
          display: flex; gap: 16px; padding: 16px 20px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .ms-step:last-child { border-bottom: none; }
        .ms-step-num {
          width: 28px; height: 28px; border-radius: 50%;
          background: var(--primary); color: white;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; flex-shrink: 0; margin-top: 2px;
        }
        .ms-step-body { flex: 1; min-width: 0; }
        .ms-step-desc { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
        .ms-step-expr {
          padding: 8px 12px; background: var(--bg-surface); border-radius: 10px;
          border: 1px solid var(--border-subtle); overflow-x: auto;
          display: flex; justify-content: center; margin-bottom: 8px;
        }
        .ms-step-expl { font-size: 12px; color: var(--text-muted); line-height: 1.6; }

        /* ── AI card ─────────────────────────────────────────────────── */
        .ms-ai-card {
          background: color-mix(in srgb, #a78bfa 8%, var(--bg-elevated));
          border: 1px solid color-mix(in srgb, #a78bfa 30%, var(--border-subtle));
          border-radius: 16px; padding: 16px;
        }
        .ms-ai-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 600; font-size: 14px; }
        .ms-ai-loading { font-size: 12px; color: var(--text-muted); animation: pulse 1s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .ms-ai-feedback { font-size: 14px; color: var(--text-secondary); line-height: 1.7; }

        /* ── Error ───────────────────────────────────────────────────── */
        .ms-error {
          padding: 12px 16px; border-radius: 10px;
          background: color-mix(in srgb, #e05252 8%, var(--bg-elevated));
          border: 1px solid color-mix(in srgb, #e05252 30%, var(--border-subtle));
          font-size: 13px; color: var(--text-secondary);
        }

        /* ── History panel ───────────────────────────────────────────── */
        .ms-history-panel {
          position: absolute; top: 0; right: 0; width: 340px; height: 100%;
          background: var(--bg-elevated); border-left: 1px solid var(--border-subtle);
          display: flex; flex-direction: column; z-index: 50;
          box-shadow: -4px 0 24px rgba(0,0,0,0.15);
          animation: slideRight 0.2s ease;
        }
        @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .ms-hist-header {
          display: flex; align-items: center; gap: 8px; padding: 16px 20px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .ms-hist-header h3 { margin: 0; flex: 1; font-size: 16px; }
        .ms-hist-clear {
          font-size: 12px; color: var(--text-muted); cursor: pointer; background: none; border: none; padding: 4px 8px;
        }
        .ms-hist-clear:hover { color: #e05252; }
        .ms-hist-close {
          width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); cursor: pointer; color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center; font-size: 13px;
        }
        .ms-hist-list { flex: 1; overflow-y: auto; padding: 8px; }
        .ms-hist-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 32px 0; }
        .ms-hist-item {
          width: 100%; text-align: left; padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--border-subtle); background: var(--bg-surface);
          cursor: pointer; margin-bottom: 6px; transition: all 0.12s;
        }
        .ms-hist-item:hover { border-color: var(--primary); }
        .ms-hist-input { font-size: 12px; font-family: monospace; color: var(--text-primary); font-weight: 500; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ms-hist-answer { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        @media (max-width: 900px) {
          .ms-body { grid-template-columns: 1fr; }
          .ms-left { border-right: none; border-bottom: 1px solid var(--border-subtle); max-height: 50vh; }
        }
      `}</style>
    </div>
  );
}

// Safe latex attempt - converts plain input to LaTeX for preview
function safeLatex(input: string): string {
  try {
    // Basic replacements
    return input
      .replace(/\*\*/g, '^')
      .replace(/\*/g, '\\cdot ')
      .replace(/d\/dx\s*\((.+)\)/i, '\\frac{d}{dx}\\left($1\\right)')
      .replace(/sqrt\((.+?)\)/g, '\\sqrt{$1}')
      .replace(/\^(\w+)/g, '^{$1}')
      .replace(/\bpi\b/g, '\\pi')
      .replace(/\binfinity\b/g, '\\infty');
  } catch {
    return input;
  }
}
