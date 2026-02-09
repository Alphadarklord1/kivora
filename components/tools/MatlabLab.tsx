'use client';

import { useCallback, useMemo, useState } from 'react';

interface MatlabLabProps {
  onGraphExpression?: (expression: string) => void;
}

type Matrix = number[][];

interface FieldPoint {
  x: number;
  y: number;
  u: number;
  v: number;
}

function parseMatrix(input: string): Matrix | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const content = trimmed.replace(/^\[/, '').replace(/\]$/, '');
  const rowParts = content.split(/;|\n/).map(r => r.trim()).filter(Boolean);
  if (rowParts.length === 0) return null;

  const matrix: Matrix = rowParts.map(row => {
    const cols = row.split(/,|\s+/).map(v => v.trim()).filter(Boolean);
    return cols.map(value => Number(value));
  });

  const width = matrix[0]?.length || 0;
  if (!width) return null;
  if (matrix.some(row => row.length !== width || row.some(v => Number.isNaN(v)))) {
    return null;
  }

  return matrix;
}

function formatMatrix(matrix: Matrix): string {
  return matrix.map(row => row.map(n => Number(n.toFixed(4))).join('\t')).join('\n');
}

function addMatrices(a: Matrix, b: Matrix): Matrix | null {
  if (a.length !== b.length || a[0].length !== b[0].length) return null;
  return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}

function subtractMatrices(a: Matrix, b: Matrix): Matrix | null {
  if (a.length !== b.length || a[0].length !== b[0].length) return null;
  return a.map((row, i) => row.map((v, j) => v - b[i][j]));
}

function multiplyMatrices(a: Matrix, b: Matrix): Matrix | null {
  if (a[0].length !== b.length) return null;
  const result: Matrix = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b[0].length; j++) {
      for (let k = 0; k < b.length; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function transposeMatrix(a: Matrix): Matrix {
  return a[0].map((_, j) => a.map(row => row[j]));
}

function determinant(matrix: Matrix): number | null {
  const n = matrix.length;
  if (n !== matrix[0].length) return null;
  if (n === 1) return matrix[0][0];
  if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  if (n === 3) {
    const [a, b, c] = matrix[0];
    const [d, e, f] = matrix[1];
    const [g, h, i] = matrix[2];
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }
  return null;
}

function inverse2x2(matrix: Matrix): Matrix | null {
  if (matrix.length !== 2 || matrix[0].length !== 2) return null;
  const det = determinant(matrix);
  if (!det) return null;
  const [[a, b], [c, d]] = matrix;
  return [
    [d / det, -b / det],
    [-c / det, a / det],
  ];
}

export function MatlabLab({ onGraphExpression }: MatlabLabProps = {}) {
  const [matrixA, setMatrixA] = useState('[1 2; 3 4]');
  const [matrixB, setMatrixB] = useState('[5 6; 7 8]');
  const [expression, setExpression] = useState('sin(x) + x^2');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [fieldU, setFieldU] = useState('y');
  const [fieldV, setFieldV] = useState('-x');
  const [gridSize, setGridSize] = useState(9);
  const [fieldScale, setFieldScale] = useState(0.7);

  const parsedA = useMemo(() => parseMatrix(matrixA), [matrixA]);
  const parsedB = useMemo(() => parseMatrix(matrixB), [matrixB]);

  const matrixHeatmap = useMemo(() => {
    if (!parsedA) return null;
    const flat = parsedA.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const range = max - min || 1;
    return { matrix: parsedA, min, max, range };
  }, [parsedA]);

  const normalizeExpression = (expr: string) => {
    let out = expr.trim();
    out = out.replace(/\^/g, '**');
    const funcs = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'log', 'ln', 'exp', 'abs'];
    for (const fn of funcs) {
      const re = new RegExp(`\\b${fn}\\b`, 'gi');
      out = out.replace(re, `Math.${fn === 'ln' ? 'log' : fn}`);
    }
    out = out.replace(/\bpi\b/gi, 'Math.PI');
    out = out.replace(/\be\b/g, 'Math.E');
    return out;
  };

  const evalField = useCallback((expr: string, x: number, y: number) => {
    const safe = normalizeExpression(expr);
    const fn = new Function('x', 'y', `return ${safe};`);
    const val = fn(x, y);
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) return 0;
    return val;
  }, []);

  const fieldData = useMemo(() => {
    const size = Math.max(3, Math.min(15, gridSize));
    const points: FieldPoint[] = [];
    const half = Math.floor(size / 2);
    for (let i = -half; i <= half; i++) {
      for (let j = -half; j <= half; j++) {
        const u = evalField(fieldU, i, j);
        const v = evalField(fieldV, i, j);
        points.push({ x: i, y: j, u, v });
      }
    }
    return { points, size };
  }, [fieldU, fieldV, gridSize, evalField]);

  const handleMatrixOp = (op: 'add' | 'sub' | 'mul' | 'transA' | 'detA' | 'invA') => {
    setError('');
    if (!parsedA) {
      setError('Matrix A is invalid. Use MATLAB format like [1 2; 3 4].');
      return;
    }

    if (['add', 'sub', 'mul'].includes(op) && !parsedB) {
      setError('Matrix B is invalid. Use MATLAB format like [5 6; 7 8].');
      return;
    }

    let output: string | null = null;
    if (op === 'add') {
      const res = addMatrices(parsedA, parsedB!);
      output = res ? formatMatrix(res) : null;
    }
    if (op === 'sub') {
      const res = subtractMatrices(parsedA, parsedB!);
      output = res ? formatMatrix(res) : null;
    }
    if (op === 'mul') {
      const res = multiplyMatrices(parsedA, parsedB!);
      output = res ? formatMatrix(res) : null;
    }
    if (op === 'transA') {
      output = formatMatrix(transposeMatrix(parsedA));
    }
    if (op === 'detA') {
      const det = determinant(parsedA);
      output = det === null ? null : `det(A) = ${det}`;
    }
    if (op === 'invA') {
      const inv = inverse2x2(parsedA);
      output = inv ? formatMatrix(inv) : null;
    }

    if (!output) {
      setError('Operation failed. Check matrix sizes (A+B requires same size, A*B requires columns of A = rows of B).');
      return;
    }
    setResult(output);
  };

  return (
    <div className="matlab-lab">
      <div className="lab-header">
        <div>
          <h3>MATLAB Lab</h3>
          <p>Matrix operations, quick plots, and MATLAB-style inputs.</p>
        </div>
        {onGraphExpression && (
          <button className="btn secondary" onClick={() => onGraphExpression(expression)}>
            📈 Plot Expression
          </button>
        )}
      </div>

      <div className="lab-grid">
        <section className="lab-card">
          <h4>Matrix A</h4>
          <textarea
            value={matrixA}
            onChange={(e) => setMatrixA(e.target.value)}
            rows={4}
          />
          <p className="hint">Format: `[1 2; 3 4]` or rows on new lines.</p>
        </section>

        <section className="lab-card">
          <h4>Matrix B</h4>
          <textarea
            value={matrixB}
            onChange={(e) => setMatrixB(e.target.value)}
            rows={4}
          />
          <p className="hint">Use for A + B, A - B, A * B.</p>
        </section>

        <section className="lab-card">
          <h4>Operations</h4>
          <div className="button-grid">
            <button className="btn" onClick={() => handleMatrixOp('add')}>A + B</button>
            <button className="btn" onClick={() => handleMatrixOp('sub')}>A - B</button>
            <button className="btn" onClick={() => handleMatrixOp('mul')}>A * B</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('transA')}>A&apos;</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('detA')}>det(A)</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('invA')}>inv(A) (2x2)</button>
          </div>
          {error && <div className="error">{error}</div>}
        </section>

        <section className="lab-card wide">
          <h4>Result</h4>
          <pre>{result || 'Run an operation to see output.'}</pre>
        </section>

        <section className="lab-card wide">
          <h4>Plot Expression</h4>
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="sin(x) + x^2"
          />
          <p className="hint">Supports MATLAB-style `.^`, `.*`, `./` (normalized in Math Solver).</p>
        </section>

        <section className="lab-card wide">
          <h4>Matrix Plot (Heatmap)</h4>
          {matrixHeatmap ? (
            <div className="heatmap">
              {matrixHeatmap.matrix.map((row, i) => (
                <div key={i} className="heatmap-row">
                  {row.map((value, j) => {
                    const t = (value - matrixHeatmap.min) / matrixHeatmap.range;
                    const hue = 210 - t * 220;
                    return (
                      <div
                        key={j}
                        className="heatmap-cell"
                        style={{ background: `hsl(${hue} 70% 60%)` }}
                        title={`A(${i + 1},${j + 1}) = ${value}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">Enter a valid matrix A to preview a heatmap.</p>
          )}
        </section>

        <section className="lab-card wide">
          <h4>Vector Field</h4>
          <div className="field-controls">
            <div>
              <label>u(x,y)</label>
              <input value={fieldU} onChange={(e) => setFieldU(e.target.value)} />
            </div>
            <div>
              <label>v(x,y)</label>
              <input value={fieldV} onChange={(e) => setFieldV(e.target.value)} />
            </div>
            <div>
              <label>Grid</label>
              <input
                type="number"
                min={3}
                max={15}
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
              />
            </div>
            <div>
              <label>Scale</label>
              <input
                type="number"
                step={0.1}
                min={0.2}
                max={2}
                value={fieldScale}
                onChange={(e) => setFieldScale(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field-canvas">
            <svg viewBox="-10 -10 20 20" role="img" aria-label="Vector field">
              <line x1="-9.5" y1="0" x2="9.5" y2="0" stroke="currentColor" strokeOpacity="0.2" />
              <line x1="0" y1="-9.5" x2="0" y2="9.5" stroke="currentColor" strokeOpacity="0.2" />
              {fieldData.points.map((p, idx) => {
                const mag = Math.sqrt(p.u * p.u + p.v * p.v) || 1;
                const ux = (p.u / mag) * fieldScale;
                const vy = (p.v / mag) * fieldScale;
                return (
                  <g key={idx} transform={`translate(${p.x},${-p.y})`}>
                    <line
                      x1={0}
                      y1={0}
                      x2={ux}
                      y2={-vy}
                      stroke="currentColor"
                      strokeOpacity="0.6"
                      strokeWidth="0.08"
                    />
                    <circle cx={ux} cy={-vy} r="0.15" fill="currentColor" opacity="0.4" />
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="hint">Example: u = y, v = -x (circular field).</p>
        </section>
      </div>

      <style jsx>{`
        .matlab-lab {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .lab-header {
          display: flex;
          justify-content: space-between;
          gap: var(--space-3);
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .lab-header h3 {
          margin: 0 0 var(--space-1);
        }

        .lab-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .lab-grid {
          display: grid;
          gap: var(--space-3);
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .lab-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .lab-card.wide {
          grid-column: 1 / -1;
        }

        textarea, input {
          width: 100%;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: var(--space-2);
          font-family: var(--font-mono, monospace);
          background: var(--bg-inset);
        }

        pre {
          background: var(--bg-inset);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          font-family: var(--font-mono, monospace);
          font-size: var(--font-meta);
          white-space: pre-wrap;
          margin: 0;
        }

        .heatmap {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
          padding: var(--space-2);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          width: fit-content;
        }

        .heatmap-row {
          display: flex;
          gap: 4px;
        }

        .heatmap-cell {
          width: 22px;
          height: 22px;
          border-radius: 4px;
          border: 1px solid rgba(15, 23, 42, 0.08);
        }

        .field-controls {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--space-2);
        }

        .field-controls label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          display: block;
          margin-bottom: 4px;
        }

        .field-canvas {
          margin-top: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          padding: var(--space-3);
        }

        .field-canvas svg {
          width: 100%;
          height: 260px;
          color: var(--text-primary);
        }

        .button-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: var(--space-2);
        }

        .hint {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .error {
          background: var(--error-muted);
          color: var(--error);
          font-size: var(--font-meta);
          padding: var(--space-2);
          border-radius: var(--radius-md);
        }

        @media (max-width: 600px) {
          .lab-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .heatmap-cell {
            width: 18px;
            height: 18px;
          }

          .field-canvas svg {
            height: 220px;
          }
        }
      `}</style>
    </div>
  );
}
