'use client';

import { useState } from 'react';
import { MathRenderer, MathText } from '@/components/math/MathRenderer';
import { solveOffline, MathSolution, MathStep } from '@/lib/math/offline-solver';

interface VerificationResult {
  isLikelyCorrect: boolean;
  confidence: 'high' | 'medium' | 'low';
  sources: {
    title: string;
    url: string;
    snippet: string;
    agrees: boolean;
  }[];
  explanation: string;
}

interface MathSolverProps {
  onGraphExpression?: (expression: string) => void;
}

export function MathSolver({ onGraphExpression }: MathSolverProps = {}) {
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState<MathSolution | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [matlabMode, setMatlabMode] = useState(true);
  const [showKeyboard, setShowKeyboard] = useState(false);

  const insertSymbol = (symbol: string) => {
    setProblem((prev) => `${prev}${symbol}`);
  };

  const SYMBOLS = [
    { label: '∫', value: '∫ ' },
    { label: 'd/dx', value: 'd/dx ' },
    { label: '∂/∂x', value: '∂/∂x ' },
    { label: 'lim', value: 'lim ' },
    { label: '√', value: 'sqrt()' },
    { label: 'π', value: 'pi' },
    { label: '∞', value: 'inf' },
    { label: '∑', value: 'sum()' },
    { label: '∏', value: 'prod()' },
    { label: 'θ', value: 'theta' },
    { label: 'sin', value: 'sin()' },
    { label: 'cos', value: 'cos()' },
    { label: 'tan', value: 'tan()' },
    { label: 'ln', value: 'ln()' },
    { label: 'log', value: 'log()' },
  ];

  const normalizeMatlabSyntax = (input: string) => {
    let out = input;
    out = out.replace(/\.\*/g, '*').replace(/\.\//g, '/').replace(/\.\^/g, '^');
    out = out.replace(/\bpi\b/gi, 'pi');
    out = out.replace(/(\d)\s+(\d)/g, '$1*$2');
    return out;
  };

  const handleSolve = async () => {
    if (!problem.trim()) {
      setError('Please enter a math problem');
      return;
    }

    setError('');
    setSolving(true);
    setSolution(null);
    setVerification(null);

    try {
      const normalized = matlabMode ? normalizeMatlabSyntax(problem.trim()) : problem.trim();

      if (/\[.*\]/.test(normalized)) {
        setError('Matrix inputs are best handled in MATLAB Lab. Switch to the MATLAB Lab tool.');
        setSolving(false);
        return;
      }

      if (useAI) {
        // Use AI API
        const res = await fetch('/api/math/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem: normalized }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to solve');
        }

        const data = await res.json();
        setSolution({ ...data, isOffline: false });
      } else {
        // Use offline solver
        const result = solveOffline(normalized);
        setSolution(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to solve problem');
    } finally {
      setSolving(false);
    }
  };

  const handleVerify = async () => {
    if (!solution) return;

    setVerifying(true);
    setVerification(null);

    try {
      const res = await fetch('/api/math/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: solution.problem,
          answer: solution.finalAnswer,
          problemType: solution.problemType,
        }),
      });

      if (!res.ok) {
        throw new Error('Verification failed');
      }

      const data = await res.json();
      setVerification(data);
    } catch {
      setError('Failed to verify answer');
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setProblem('');
    setSolution(null);
    setVerification(null);
    setError('');
  };

  const handleCopy = () => {
    if (!solution) return;

    let text = `Problem: ${solution.problem}\n\n`;
    text += `Type: ${formatProblemType(solution.problemType)}\n\n`;
    text += `Solution:\n`;
    solution.steps.forEach(step => {
      text += `\nStep ${step.step}: ${step.description}\n`;
      if (step.expression) text += `  ${step.expression}\n`;
      text += `  ${step.explanation}\n`;
    });
    text += `\nFinal Answer: ${solution.finalAnswer}`;

    navigator.clipboard.writeText(text);
  };

  const formatProblemType = (type: string): string => {
    return type
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const exampleProblems = [
    { label: 'Derivative', problem: 'Find the derivative of x^3 + 2x^2 - 5x + 3' },
    { label: 'Integral', problem: 'Integrate x^2 + 3x - 2 dx' },
    { label: 'Quadratic', problem: 'Solve x^2 - 5x + 6 = 0' },
    { label: 'Linear', problem: 'Solve 3x + 7 = 22' },
    { label: 'Arithmetic', problem: 'Calculate 2^8 + 15 * 4 - 32/4' },
    { label: 'Trig Derivative', problem: 'Find the derivative of sin(x) + cos(x)' },
  ];

  return (
    <div className="math-solver">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-4)'
      }}>
        <div>
          <h3 style={{ marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>Math Solver</span>
            {solution?.isOffline && (
              <span style={{
                fontSize: 'var(--font-tiny)',
                background: 'var(--bg-inset)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)'
              }}>
                Offline
              </span>
            )}
          </h3>
          <p style={{ fontSize: 'var(--font-meta)', color: 'var(--text-muted)', margin: 0 }}>
            Calculus, Algebra, Arithmetic & more
          </p>
        </div>
        {(solution || problem) && (
          <button className="btn ghost" onClick={handleReset} style={{ fontSize: 'var(--font-meta)' }}>
            Reset
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--error-muted)',
          color: 'var(--error)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)',
          fontSize: 'var(--font-meta)'
        }}>
          {error}
        </div>
      )}

      {/* Input Section */}
      {!solution && (
        <>
          {/* Mode Toggle */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-2)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--radius-md)',
          }}>
            <button
              className={`btn ${!useAI ? '' : 'ghost'}`}
              onClick={() => setUseAI(false)}
              style={{ flex: 1, fontSize: 'var(--font-meta)' }}
            >
              Offline Mode
            </button>
            <button
              className={`btn ${useAI ? '' : 'ghost'}`}
              onClick={() => setUseAI(true)}
              style={{ flex: 1, fontSize: 'var(--font-meta)' }}
            >
              AI Mode
            </button>
          </div>

          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            fontSize: 'var(--font-meta)'
          }}>
            <span>MATLAB Syntax Mode</span>
            <button
              className={`btn ${matlabMode ? '' : 'ghost'}`}
              onClick={() => setMatlabMode(prev => !prev)}
              style={{ fontSize: 'var(--font-tiny)' }}
            >
              {matlabMode ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          {useAI && (
            <div style={{
              padding: 'var(--space-3)',
              background: 'var(--primary-muted)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--font-meta)',
              color: 'var(--primary)'
            }}>
              AI mode uses OpenAI for complex problems like Linear Algebra, Series, and advanced Calculus. Requires API key in settings.
            </div>
          )}

          {/* Example Problems */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{
              fontSize: 'var(--font-meta)',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: 'var(--space-2)'
            }}>
              Try an example:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {exampleProblems.map((ex) => (
                <button
                  key={ex.label}
                  className="btn ghost"
                  onClick={() => setProblem(ex.problem)}
                  style={{
                    fontSize: 'var(--font-tiny)',
                    padding: 'var(--space-1) var(--space-2)'
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {/* Problem Input */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{
              fontSize: 'var(--font-meta)',
              fontWeight: 600,
              marginBottom: 'var(--space-2)',
              display: 'block'
            }}>
              Enter your math problem:
            </label>
            {/* Inline Symbol Bar */}
            <div style={{
              padding: 'var(--space-2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-inset)',
              marginBottom: 'var(--space-2)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-2)'
              }}>
                <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)' }}>
                  Quick symbols
                </span>
                <button
                  className="btn"
                  onClick={() => setShowKeyboard(true)}
                  style={{ fontSize: 'var(--font-tiny)', padding: 'var(--space-1) var(--space-2)' }}
                >
                  Open keyboard
                </button>
              </div>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)'
              }}>
                {SYMBOLS.map((s) => (
                  <button
                    key={s.label}
                    className="btn ghost"
                    onClick={() => insertSymbol(s.value)}
                    style={{ fontSize: 'var(--font-tiny)', padding: 'var(--space-1) var(--space-2)' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder={`Examples:
- Find the derivative of x^3 + 2x^2 - 5x
- Integrate x^2 + 3x dx
- Solve x^2 - 5x + 6 = 0
- Calculate 2^8 + 15 * 4`}
              rows={4}
              style={{
                fontSize: 'var(--font-body)',
                fontFamily: 'var(--font-mono, monospace)'
              }}
            />
            <p style={{
              fontSize: 'var(--font-tiny)',
              color: 'var(--text-muted)',
              marginTop: 'var(--space-2)'
            }}>
              Supports MATLAB style: `.^`, `.*`, `./` and standard math (`x^2`, `sqrt()`).
            </p>
          </div>
          {showKeyboard && (
            <div
              onClick={() => setShowKeyboard(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-4)',
                zIndex: 1000,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4)',
                  width: 'min(520px, 95vw)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <h4 style={{ margin: 0 }}>Math Keyboard</h4>
                  <button className="btn ghost" onClick={() => setShowKeyboard(false)}>Close</button>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                    gap: 'var(--space-2)',
                  }}
                >
                  {SYMBOLS.map((s) => (
                    <button key={s.label} className="btn ghost" onClick={() => insertSymbol(s.value)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Live Preview */}
          {problem && (
            <div style={{
              padding: 'var(--space-3)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
            }}>
              <label style={{
                fontSize: 'var(--font-tiny)',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 'var(--space-2)'
              }}>
                Preview:
              </label>
              <div style={{ fontSize: 'var(--font-lg)' }}>
                <MathRenderer math={problem} display={true} />
              </div>
            </div>
          )}

          {/* Solve Button */}
          <button
            className="btn"
            onClick={handleSolve}
            disabled={solving || !problem.trim()}
            style={{
              width: '100%',
              padding: 'var(--space-4)',
              fontSize: 'var(--font-body)',
              fontWeight: 600
            }}
          >
            {solving ? 'Solving...' : 'Solve Problem'}
          </button>
        </>
      )}

      {/* Solution Display */}
      {solution && (
        <div className="math-solution">
          {/* Problem Type Badge */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span style={{
              padding: 'var(--space-1) var(--space-2)',
              background: 'var(--primary-muted)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-tiny)',
              fontWeight: 600
            }}>
              {formatProblemType(solution.problemType)}
            </span>
            {solution.isOffline && (
              <span style={{
                padding: 'var(--space-1) var(--space-2)',
                background: 'var(--bg-inset)',
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-tiny)'
              }}>
                Solved Offline
              </span>
            )}
          </div>

          {/* Original Problem */}
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              Problem
            </div>
            <div style={{ fontSize: 'var(--font-xl)' }}>
              <MathRenderer math={solution.problem} display={true} />
            </div>
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-body)', fontWeight: 600 }}>
              Step-by-Step Solution
            </h4>

            {solution.steps.map((step, index) => (
              <StepCard key={index} step={step} index={index} />
            ))}
          </div>

          {/* Final Answer */}
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--success-muted)',
            border: '2px solid var(--success)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: 'var(--font-meta)',
              color: 'var(--success)',
              fontWeight: 600,
              marginBottom: 'var(--space-2)'
            }}>
              Final Answer
            </div>
            <div style={{ fontSize: 'var(--font-xl)', fontWeight: 600 }}>
              <MathRenderer math={solution.finalAnswer} display={true} />
            </div>
          </div>

          {/* Verification Section */}
          {!verification && solution.finalAnswer !== 'Use AI mode for detailed solution' && (
            <button
              className="btn secondary"
              onClick={handleVerify}
              disabled={verifying}
              style={{ width: '100%', marginBottom: 'var(--space-3)' }}
            >
              {verifying ? 'Verifying...' : 'Verify Answer (Web Search)'}
            </button>
          )}

          {verification && (
            <div style={{
              padding: 'var(--space-3)',
              background: verification.isLikelyCorrect ? 'var(--success-muted)' : 'var(--warning-muted)',
              border: `1px solid ${verification.isLikelyCorrect ? 'var(--success)' : 'var(--warning)'}`,
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-2)'
              }}>
                <span style={{ fontSize: '1.2em' }}>
                  {verification.isLikelyCorrect ? '✓' : '?'}
                </span>
                <strong>
                  {verification.isLikelyCorrect
                    ? `Likely Correct (${verification.confidence} confidence)`
                    : 'Could not verify'}
                </strong>
              </div>
              <p style={{ fontSize: 'var(--font-meta)', margin: 0 }}>
                {verification.explanation}
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button className="btn secondary" onClick={handleCopy}>
              Copy Solution
            </button>
            <button className="btn secondary" onClick={() => setSolution(null)}>
              New Problem
            </button>
            {onGraphExpression && solution.problemType !== 'arithmetic' && (
              <button
                className="btn secondary"
                onClick={() => {
                  // Extract a plottable expression from the problem
                  const expr = problem
                    .replace(/^(find the derivative of|integrate|solve|calculate|d\/dx|d\/dx of)\s*/i, '')
                    .replace(/\s*dx$/i, '')
                    .replace(/\s*=\s*0$/i, '')
                    .trim();
                  onGraphExpression(expr);
                }}
              >
                📈 Graph this
              </button>
            )}
            {solution.isOffline && solution.finalAnswer === 'Use AI mode for detailed solution' && (
              <button
                className="btn"
                onClick={() => {
                  setSolution(null);
                  setUseAI(true);
                }}
              >
                Try with AI
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Step Card Component with proper math rendering
function StepCard({ step, index }: { step: MathStep; index: number }) {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        background: index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-inset)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-2)',
        borderLeft: '3px solid var(--primary)'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-2)'
      }}>
        <span style={{
          width: '24px',
          height: '24px',
          background: 'var(--primary)',
          color: 'white',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--font-tiny)',
          fontWeight: 600,
          flexShrink: 0
        }}>
          {step.step}
        </span>
        <strong style={{ fontSize: 'var(--font-body)' }}>
          {step.description}
        </strong>
      </div>

      {step.expression && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--space-2)',
          overflowX: 'auto',
          textAlign: 'center'
        }}>
          <MathRenderer math={step.expression} display={true} />
        </div>
      )}

      <p style={{
        fontSize: 'var(--font-meta)',
        color: 'var(--text-secondary)',
        margin: 0,
        lineHeight: 1.5
      }}>
        <MathText>{step.explanation}</MathText>
      </p>
    </div>
  );
}
