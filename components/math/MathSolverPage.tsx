'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import * as math from 'mathjs';
import { MatlabLab } from '@/components/tools/MatlabLab';
import { useToast } from '@/providers/ToastProvider';
import { formatMathExpression } from '@/components/math/MathRenderer';
import { MATH_CATEGORIES, MATH_CATEGORY_ORDER, MATH_SYMBOL_GROUPS } from '@/lib/math/catalog';
import { clearMathContext, readMathContext, writeMathContext } from '@/lib/math/context';
import type { MathCategoryId, MathContext, MathSolveRequest, SolverResult } from '@/lib/math/types';
import { idbStore } from '@/lib/idb';
import { extractTextFromBlob } from '@/lib/pdf/extract';

// ─── Types ─────────────────────────────────────────────────────────────────

type MainTab = 'solver' | 'graph' | 'units' | 'lab';

type SymbolGroupId = (typeof MATH_SYMBOL_GROUPS)[number]['id'];

interface GraphExpression {
  id: string;
  expr: string;
  color: string;
  enabled: boolean;
  showDerivative: boolean;
}

interface UnitCategory {
  label: string;
  units: { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[];
}

interface RecentFileCandidate {
  fileId: string;
  fileName: string;
  content?: string;
  localBlobId?: string | null;
  mimeType?: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const FN_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#0ea5e9'];

const UNIT_CATEGORIES: UnitCategory[] = [
  {
    label: 'Length',
    units: [
      { id: 'mm', label: 'Millimeters', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      { id: 'cm', label: 'Centimeters', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      { id: 'm', label: 'Meters', toBase: (v) => v, fromBase: (v) => v },
      { id: 'km', label: 'Kilometers', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      { id: 'in', label: 'Inches', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
      { id: 'ft', label: 'Feet', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    ],
  },
  {
    label: 'Mass',
    units: [
      { id: 'g', label: 'Grams', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      { id: 'kg', label: 'Kilograms', toBase: (v) => v, fromBase: (v) => v },
      { id: 'lb', label: 'Pounds', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
      { id: 'oz', label: 'Ounces', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    ],
  },
  {
    label: 'Temperature',
    units: [
      { id: 'C', label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
      { id: 'F', label: 'Fahrenheit (°F)', toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => (v * 9 / 5) + 32 },
      { id: 'K', label: 'Kelvin (K)', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    ],
  },
  {
    label: 'Speed',
    units: [
      { id: 'ms', label: 'm/s', toBase: (v) => v, fromBase: (v) => v },
      { id: 'kmh', label: 'km/h', toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
      { id: 'mph', label: 'mph', toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function LatexBlock({ latex, display = false }: { latex: string; display?: boolean }) {
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
      ref.current.textContent = latex;
    }
  }, [latex, display]);

  return <span ref={ref} />;
}

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function applyGraphTheme(container: HTMLDivElement) {
  const svg = container.querySelector('svg');
  if (!svg) return;

  const bgSurface = cssVar('--bg-surface', '#0b1220');
  const bgElevated = cssVar('--bg-elevated', '#101827');
  const border = cssVar('--border-subtle', 'rgba(148, 163, 184, 0.24)');
  const textMuted = cssVar('--text-muted', '#94a3b8');
  const textPrimary = cssVar('--text-primary', '#e5e7eb');
  const primary = cssVar('--primary', '#6366f1');
  const gridStroke = 'rgba(148, 163, 184, 0.18)';

  (svg as SVGSVGElement).style.display = 'block';
  (svg as SVGSVGElement).style.width = '100%';
  (svg as SVGSVGElement).style.height = '100%';
  (svg as SVGSVGElement).style.background = `linear-gradient(180deg, ${bgElevated}, ${bgSurface})`;
  (svg as SVGSVGElement).style.borderRadius = '18px';

  container.querySelectorAll('.x.axis text, .y.axis text').forEach((node) => {
    (node as SVGElement).setAttribute('fill', textMuted);
  });

  container.querySelectorAll('.x.axis line, .y.axis line, .x.axis path, .y.axis path').forEach((node) => {
    (node as SVGElement).setAttribute('stroke', border);
  });

  container.querySelectorAll('.x.grid .tick line, .y.grid .tick line, .grid line').forEach((node) => {
    (node as SVGElement).setAttribute('stroke', gridStroke);
  });

  container.querySelectorAll('.tip line, .tip path').forEach((node) => {
    (node as SVGElement).setAttribute('stroke', primary);
  });

  container.querySelectorAll('.tip text').forEach((node) => {
    (node as SVGElement).setAttribute('fill', textPrimary);
  });

  container.querySelectorAll('path.line').forEach((node) => {
    (node as SVGElement).setAttribute('stroke-width', '2.8');
  });
}

function normalizeInputForPreview(input: string) {
  return input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

type PreparedGraphExpression = {
  fn: string;
  label: string;
  kind: 'standard' | 'implicit';
  evaluationExpr?: string;
  supportsDerivative: boolean;
};

function prepareGraphExpression(raw: string): PreparedGraphExpression | null {
  const expr = raw.trim();
  if (!expr) return null;

  const relation = expr.match(/^(.+?)=(.+)$/);
  if (relation) {
    const lhs = relation[1].trim();
    const rhs = relation[2].trim();

    if (/^y$/i.test(lhs)) {
      return { fn: rhs, label: `y = ${rhs}`, kind: 'standard', evaluationExpr: rhs, supportsDerivative: true };
    }
    if (/^y$/i.test(rhs)) {
      return { fn: lhs, label: `${lhs} = y`, kind: 'standard', evaluationExpr: lhs, supportsDerivative: true };
    }

    return {
      fn: `(${lhs}) - (${rhs})`,
      label: `${lhs} = ${rhs}`,
      kind: 'implicit',
      supportsDerivative: false,
    };
  }

  return {
    fn: expr,
    label: expr,
    kind: 'standard',
    evaluationExpr: expr,
    supportsDerivative: true,
  };
}

function evaluateGraphExpressionAt(prepared: PreparedGraphExpression, x: number) {
  if (prepared.kind !== 'standard' || !prepared.evaluationExpr) return '—';
  try {
    const evaluated = math.evaluate(prepared.evaluationExpr, { x });
    return typeof evaluated === 'number' ? Number(evaluated.toFixed(4)).toString() : String(evaluated);
  } catch {
    return '—';
  }
}

async function loadMostRecentCandidate(): Promise<RecentFileCandidate | null> {
  try {
    const res = await fetch('/api/recent?limit=1', { cache: 'no-store' });
    if (!res.ok) return null;
    const payload = await res.json() as Array<{ file?: Record<string, unknown> | null }>;
    const candidate = payload?.[0]?.file;
    if (!candidate) return null;

    const fileId = typeof candidate.fileId === 'string'
      ? candidate.fileId
      : typeof candidate.id === 'string'
        ? candidate.id
        : '';
    const fileName = typeof candidate.fileName === 'string'
      ? candidate.fileName
      : typeof candidate.name === 'string'
        ? candidate.name
        : 'Recent file';

    if (!fileId) return null;

    return {
      fileId,
      fileName,
      content: typeof candidate.content === 'string' ? candidate.content : undefined,
      localBlobId: typeof candidate.localBlobId === 'string' ? candidate.localBlobId : null,
      mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : null,
    };
  } catch {
    return null;
  }
}

async function recentCandidateToContext(candidate: RecentFileCandidate): Promise<MathContext | null> {
  if (candidate.content?.trim()) {
    return {
      fileId: candidate.fileId,
      fileName: candidate.fileName,
      extractedText: candidate.content.trim(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (!candidate.localBlobId) return null;
  const payload = await idbStore.get(candidate.localBlobId).catch(() => undefined);
  if (!payload) return null;
  const extracted = await extractTextFromBlob(payload.blob, candidate.fileName);
  if (extracted.error) return null;
  return {
    fileId: candidate.fileId,
    fileName: candidate.fileName,
    extractedText: extracted.text,
    updatedAt: new Date().toISOString(),
  };
}

function buildMathLibraryContent(result: SolverResult) {
  const stepText = result.steps
    .map((step) => `${step.step}. ${step.description}\n${step.explanation}`)
    .join('\n\n');

  return [
    `Problem: ${result.normalizedInput}`,
    '',
    `Answer: ${result.answer}`,
    '',
    'Steps:',
    stepText,
    '',
    `Explanation: ${result.explanation}`,
  ].join('\n');
}

// ─── Graph Panel ──────────────────────────────────────────────────────────

function GraphPanel({ initialExpr }: { initialExpr?: string }) {
  const [expressions, setExpressions] = useState<GraphExpression[]>([
    { id: '1', expr: initialExpr || 'x^2', color: FN_COLORS[0], enabled: true, showDerivative: false },
  ]);
  const [activeExpressionId, setActiveExpressionId] = useState('1');
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [yMin, setYMin] = useState(-10);
  const [yMax, setYMax] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const [showZeros, setShowZeros] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [graphError, setGraphError] = useState('');
  const [tableX, setTableX] = useState('-5,-4,-3,-2,-1,0,1,2,3,4,5');
  const graphRef = useRef<HTMLDivElement>(null);

  const renderGraph = useCallback(() => {
    if (!graphRef.current) return;
    const active = expressions.filter((entry) => entry.enabled && entry.expr.trim());
    if (active.length === 0) {
      graphRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px">Add an expression to start graphing.</div>';
      return;
    }

    import('function-plot').then(({ default: functionPlot }) => {
      if (!graphRef.current) return;
      try {
        setGraphError('');
        graphRef.current.innerHTML = '';
        const target = graphRef.current;
        const width = target.clientWidth || 640;
        const height = target.clientHeight || 520;
        const data: object[] = [];

        for (const entry of active) {
          const prepared = prepareGraphExpression(entry.expr);
          if (!prepared) continue;

          data.push({
            fn: prepared.fn,
            color: entry.color,
            graphType: prepared.kind === 'standard' ? 'polyline' : undefined,
            fnType: prepared.kind === 'implicit' ? 'implicit' : undefined,
          });
          if (entry.showDerivative && prepared.supportsDerivative) {
            data.push({
              fn: prepared.fn,
              derivative: { fn: prepared.fn, updateOnMouseMove: false },
              color: `${entry.color}99`,
            });
          }
          if (showZeros && prepared.kind === 'standard') {
            data.push({ fn: prepared.fn, color: entry.color, fnType: 'x', graphType: 'scatter' });
          }
        }

        functionPlot({
          target,
          width,
          height,
          grid: showGrid,
          xAxis: { domain: [xMin, xMax] },
          yAxis: { domain: [yMin, yMax] },
          data,
          tip: { xLine: true, yLine: true },
          disableZoom: false,
        });
        applyGraphTheme(target);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not render graph';
        setGraphError(message.includes('builtIn sampler')
          ? 'This graph includes a relation like x = 2 or x^2 + y^2 = 25. Kivora now switches those to equation mode, but this entry still needs a cleaner relation.'
          : message);
      }
    }).catch(() => setGraphError('function-plot not available'));
  }, [expressions, showGrid, showZeros, xMin, xMax, yMin, yMax]);

  useEffect(() => {
    const handle = setTimeout(renderGraph, 120);
    return () => clearTimeout(handle);
  }, [renderGraph]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new MutationObserver(() => {
      renderGraph();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => observer.disconnect();
  }, [renderGraph]);

  useEffect(() => {
    if (!initialExpr?.trim()) return;
    setExpressions((prev) => {
      const current = prev[0];
      if (!current) return [{ id: crypto.randomUUID(), expr: initialExpr, color: FN_COLORS[0], enabled: true, showDerivative: false }];
      return [{ ...current, expr: initialExpr, enabled: true }, ...prev.slice(1)];
    });
    setActiveExpressionId('1');
  }, [initialExpr]);

  const tableRows = useMemo(() => {
    if (!showTable) return [];
    const xs = tableX.split(',').map((part) => Number(part.trim())).filter((value) => Number.isFinite(value));
    const active = expressions
      .filter((entry) => entry.enabled && entry.expr.trim())
      .map((entry) => ({ entry, prepared: prepareGraphExpression(entry.expr) }))
      .filter((item) => item.prepared);
    return xs.map((x) => ({
      x,
      values: active.map(({ prepared }) => evaluateGraphExpressionAt(prepared!, x)),
    }));
  }, [expressions, showTable, tableX]);

  function addExpression(seed = '') {
    setExpressions((prev) => {
      const id = `${Date.now()}`;
      const next = [...prev, { id, expr: seed, color: FN_COLORS[prev.length % FN_COLORS.length], enabled: true, showDerivative: false }];
      setActiveExpressionId(id);
      return next;
    });
  }

  function updateExpression(id: string, patch: Partial<GraphExpression>) {
    setExpressions((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function removeExpression(id: string) {
    setExpressions((prev) => {
      const next = prev.filter((entry) => entry.id !== id);
      if (next.length === 0) {
        return [{ id: '1', expr: '', color: FN_COLORS[0], enabled: false, showDerivative: false }];
      }
      if (!next.find((entry) => entry.id === activeExpressionId)) {
        setActiveExpressionId(next[0].id);
      }
      return next;
    });
  }

  const activeCount = expressions.filter((entry) => entry.enabled && entry.expr.trim()).length;
  const zeroAxisX = useMemo(() => {
    if (xMin >= 0 || xMax <= 0) return null;
    return ((0 - xMin) / (xMax - xMin)) * 100;
  }, [xMax, xMin]);
  const zeroAxisY = useMemo(() => {
    if (yMin >= 0 || yMax <= 0) return null;
    return 100 - (((0 - yMin) / (yMax - yMin)) * 100);
  }, [yMax, yMin]);

  return (
    <div className="graph-shell">
      <div className="graph-sidebar">
        <div className="graph-sidebar-header">
          <div>
            <span className="graph-sidebar-title">Expressions</span>
            <p className="graph-sidebar-copy">Build up the graph like Desmos: add, hide, differentiate, and compare.</p>
          </div>
          <button className="graph-add-btn" onClick={() => addExpression()}>＋ Add</button>
        </div>

        {expressions.map((entry, index) => {
          const prepared = prepareGraphExpression(entry.expr);
          const derivativeDisabled = prepared?.supportsDerivative === false;
          return (
            <div key={entry.id} className={`graph-row${activeExpressionId === entry.id ? ' active' : ''}`}>
              <button
                className="graph-color-chip"
                style={{ background: entry.color }}
                title={entry.enabled ? 'Hide expression' : 'Show expression'}
                onClick={() => updateExpression(entry.id, { enabled: !entry.enabled })}
              />
              <button className="graph-index" onClick={() => setActiveExpressionId(entry.id)}>{index + 1}</button>
              <div className="graph-input-wrap">
                <input
                  className="graph-input"
                  value={entry.expr}
                  onChange={(e) => updateExpression(entry.id, { expr: e.target.value, enabled: e.target.value.trim().length > 0 })}
                  onFocus={() => setActiveExpressionId(entry.id)}
                  placeholder={index === 0 ? 'y = x^2' : 'f(x) or x^2 + y^2 = 25'}
                  spellCheck={false}
                />
                <div className="graph-row-actions">
                  <button
                    className={`graph-derivative${entry.showDerivative ? ' on' : ''}`}
                    onClick={() => updateExpression(entry.id, { showDerivative: !entry.showDerivative })}
                    disabled={derivativeDisabled}
                    title={derivativeDisabled ? 'Derivative is available for y = f(x) entries' : 'Show derivative'}
                  >
                    f′
                  </button>
                  <button className="graph-remove" onClick={() => removeExpression(entry.id)}>✕</button>
                </div>
              </div>
            </div>
          );
        })}

        <div className="graph-sidebar-section">
          <div className="graph-sidebar-subtitle">View</div>
          <div className="graph-domain-grid">
            <label>
              x min
              <input type="number" value={xMin} onChange={(e) => setXMin(Number(e.target.value))} />
            </label>
            <label>
              x max
              <input type="number" value={xMax} onChange={(e) => setXMax(Number(e.target.value))} />
            </label>
            <label>
              y min
              <input type="number" value={yMin} onChange={(e) => setYMin(Number(e.target.value))} />
            </label>
            <label>
              y max
              <input type="number" value={yMax} onChange={(e) => setYMax(Number(e.target.value))} />
            </label>
          </div>

          <div className="graph-toggle-list">
            <label><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid</label>
            <label><input type="checkbox" checked={showZeros} onChange={(e) => setShowZeros(e.target.checked)} /> Roots / intercepts</label>
            <label><input type="checkbox" checked={showTable} onChange={(e) => setShowTable(e.target.checked)} /> Value table</label>
          </div>
        </div>

        <div className="graph-sidebar-section">
          <div className="graph-sidebar-subtitle">Quick presets</div>
          <div className="graph-preset-grid">
            {['y = x^2', 'y = sin(x)', 'y = cos(x)', 'y = tan(x)', 'x = 2', 'x^2 + y^2 = 25', 'y = exp(x)', 'y = abs(x)'].map((preset) => (
              <button key={preset} className="graph-preset" onClick={() => addExpression(preset)}>{preset}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="graph-main">
        <div className="graph-toolbar">
          <div className="graph-toolbar-left">
            <button className="graph-toolbar-btn primary" onClick={() => { setXMin(-10); setXMax(10); setYMin(-10); setYMax(10); }}>Home</button>
            <button className="graph-toolbar-btn" onClick={() => { setXMin((v) => v * 0.78); setXMax((v) => v * 0.78); setYMin((v) => v * 0.78); setYMax((v) => v * 0.78); }}>＋</button>
            <button className="graph-toolbar-btn" onClick={() => { setXMin((v) => v * 1.28); setXMax((v) => v * 1.28); setYMin((v) => v * 1.28); setYMax((v) => v * 1.28); }}>－</button>
          </div>
          <div className="graph-toolbar-meta">
            <span>{activeCount} active expression{activeCount === 1 ? '' : 's'}</span>
            <span>Type `y = ...` or full equations like `x^2 + y^2 = 25`</span>
            <span>Drag to pan · Scroll to zoom</span>
          </div>
        </div>

        <div className="graph-canvas-wrap">
          <div ref={graphRef} className="graph-canvas" />
          {zeroAxisX !== null ? <div className="graph-zero-axis vertical" style={{ left: `${zeroAxisX}%` }} /> : null}
          {zeroAxisY !== null ? <div className="graph-zero-axis horizontal" style={{ top: `${zeroAxisY}%` }} /> : null}
        </div>
        {graphError && <div className="graph-error">{graphError}</div>}

        {showTable && tableRows.length > 0 && (
          <div className="graph-table-wrap">
            <div className="graph-table-header">
              <span>Value table</span>
              <input value={tableX} onChange={(e) => setTableX(e.target.value)} placeholder="-5,-4,-3,-2,-1,0,1,2,3" />
            </div>
            <table className="graph-table">
              <thead>
                <tr>
                  <th>x</th>
                  {expressions
                    .filter((entry) => entry.enabled && entry.expr.trim())
                    .map((entry) => ({ entry, prepared: prepareGraphExpression(entry.expr) }))
                    .filter((item) => item.prepared)
                    .map(({ entry, prepared }) => (
                      <th key={entry.id} style={{ color: entry.color }}>{prepared!.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.x}>
                    <td>{row.x}</td>
                    {row.values.map((value, index) => <td key={`${row.x}-${index}`}>{value}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .graph-shell { display: flex; height: 100%; overflow: hidden; }
        .graph-sidebar { width: 320px; flex-shrink: 0; border-right: 1px solid var(--border-subtle); background: var(--bg-elevated); overflow-y: auto; }
        .graph-sidebar-header { padding: 16px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; }
        .graph-sidebar-title { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); font-weight: 700; }
        .graph-sidebar-copy { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-muted); }
        .graph-add-btn { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
        .graph-row { display: grid; grid-template-columns: 18px 28px minmax(0,1fr); gap: 10px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
        .graph-row.active { background: color-mix(in srgb, var(--primary) 9%, var(--bg-elevated)); }
        .graph-color-chip, .graph-index { border: none; cursor: pointer; }
        .graph-color-chip { width: 18px; height: 18px; border-radius: 999px; box-shadow: 0 0 0 2px color-mix(in srgb, var(--bg-surface) 80%, transparent); }
        .graph-index { width: 28px; height: 28px; border-radius: 8px; background: var(--bg-surface); color: var(--text-muted); }
        .graph-input-wrap { display: flex; gap: 8px; align-items: center; min-width: 0; }
        .graph-input { flex: 1; min-width: 0; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 10px; padding: 10px 12px; font-family: 'JetBrains Mono', monospace; }
        .graph-row-actions { display: flex; gap: 6px; }
        .graph-derivative, .graph-remove { border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-muted); padding: 6px 8px; cursor: pointer; }
        .graph-derivative.on { background: var(--primary); color: white; border-color: var(--primary); }
        .graph-derivative:disabled { opacity: 0.45; cursor: not-allowed; }
        .graph-sidebar-section { padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); }
        .graph-sidebar-subtitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; margin-bottom: 10px; }
        .graph-domain-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .graph-domain-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-muted); }
        .graph-domain-grid input { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 10px; padding: 8px 10px; }
        .graph-toggle-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; font-size: 13px; color: var(--text-secondary); }
        .graph-toggle-list input { margin-right: 8px; accent-color: var(--primary); }
        .graph-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .graph-preset { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); border-radius: 10px; padding: 8px 10px; font-family: 'JetBrains Mono', monospace; cursor: pointer; }
        .graph-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .graph-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .graph-toolbar-left { display: flex; gap: 8px; }
        .graph-toolbar-btn { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
        .graph-toolbar-btn.primary { background: var(--primary); color: white; border-color: var(--primary); }
        .graph-toolbar-meta { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted); }
        .graph-canvas-wrap { position: relative; flex: 1; min-height: 420px; background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, transparent), var(--bg-surface)); }
        .graph-canvas { position: absolute; inset: 0; }
        .graph-zero-axis { position: absolute; pointer-events: none; background: color-mix(in srgb, var(--text-primary) 38%, transparent); }
        .graph-zero-axis.vertical { top: 0; bottom: 0; width: 1.5px; transform: translateX(-0.75px); }
        .graph-zero-axis.horizontal { left: 0; right: 0; height: 1.5px; transform: translateY(-0.75px); }
        .graph-error { margin: 12px 18px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(239,68,68,0.25); background: rgba(239,68,68,0.08); color: #ef4444; font-size: 13px; }
        .graph-table-wrap { border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); padding: 14px 18px 18px; }
        .graph-table-header { display: flex; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .graph-table-header input { min-width: 240px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 10px; padding: 8px 10px; }
        .graph-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .graph-table th, .graph-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
        @media (max-width: 980px) {
          .graph-shell { flex-direction: column; }
          .graph-sidebar { width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); }
          .graph-table-header { flex-direction: column; align-items: stretch; }
          .graph-table-header input { min-width: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

// ─── Units Panel ──────────────────────────────────────────────────────────

function UnitsPanel() {
  const [catIdx, setCatIdx] = useState(0);
  const [fromUnit, setFromUnit] = useState(UNIT_CATEGORIES[0].units[2].id);
  const [toUnit, setToUnit] = useState(UNIT_CATEGORIES[0].units[3].id);
  const [value, setValue] = useState('1');

  const cat = UNIT_CATEGORIES[catIdx];
  const fromU = cat.units.find((unit) => unit.id === fromUnit) ?? cat.units[0];
  const toU = cat.units.find((unit) => unit.id === toUnit) ?? cat.units[1];

  const result = useMemo(() => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    const base = fromU.toBase(num);
    const converted = toU.fromBase(base);
    if (Math.abs(converted) < 0.0001 || Math.abs(converted) > 1e9) return converted.toExponential(6);
    return converted.toPrecision(10).replace(/\.0+$|(?<=\..*?)0+$/g, '').replace(/\.$/, '');
  }, [fromU, toU, value]);

  const allConversions = useMemo(() => {
    const num = Number(value);
    if (!Number.isFinite(num)) return [];
    const base = fromU.toBase(num);
    return cat.units.map((unit) => ({
      id: unit.id,
      label: unit.label,
      value: unit.fromBase(base),
    }));
  }, [cat, fromU, value]);

  return (
    <div className="units-shell">
      <div className="units-cats">
        {UNIT_CATEGORIES.map((entry, index) => (
          <button key={entry.label} className={`units-cat${catIdx === index ? ' active' : ''}`} onClick={() => {
            setCatIdx(index);
            setFromUnit(UNIT_CATEGORIES[index].units[0].id);
            setToUnit(UNIT_CATEGORIES[index].units[1].id);
          }}>{entry.label}</button>
        ))}
      </div>

      <div className="units-body">
        <div className="units-converter">
          <div className="units-row">
            <div className="units-field">
              <label className="units-label">From</label>
              <select className="units-select" value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}>
                {cat.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
              </select>
              <input className="units-input" type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>

            <button className="units-swap" onClick={() => { setFromUnit(toUnit); setToUnit(fromUnit); }}>⇄</button>

            <div className="units-field">
              <label className="units-label">To</label>
              <select className="units-select" value={toUnit} onChange={(e) => setToUnit(e.target.value)}>
                {cat.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
              </select>
              <div className="units-result">{result || '—'}</div>
            </div>
          </div>

          {result && <div className="units-formula">{value} {fromU.label} = <strong>{result}</strong> {toU.label}</div>}
        </div>

        <div>
          <div className="units-all-title">All {cat.label} conversions from {value} {fromU.label}</div>
          <div className="units-all-grid">
            {allConversions.map((entry) => (
              <button key={entry.id} className={`units-all-card${entry.id === fromUnit ? ' current' : ''}`} onClick={() => setToUnit(entry.id)}>
                <div className="units-all-val">{Number.isFinite(entry.value) ? Number(entry.value.toPrecision(8)).toString() : '—'}</div>
                <div className="units-all-lbl">{entry.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .units-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .units-cats { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .units-cat { padding: 6px 14px; border-radius: 10px; border: 1.5px solid var(--border-subtle); background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; }
        .units-cat.active { background: var(--primary); color: white; border-color: var(--primary); }
        .units-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .units-converter { background: var(--bg-elevated); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 20px; }
        .units-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
        .units-field { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 200px; }
        .units-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .units-select, .units-input { padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); }
        .units-result { padding: 12px 16px; border-radius: 10px; background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface)); border: 2px solid var(--primary); font-size: 18px; font-weight: 700; color: var(--primary); min-height: 50px; display: flex; align-items: center; }
        .units-swap { width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 20px; cursor: pointer; }
        .units-formula { margin-top: 14px; padding: 10px 14px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); font-size: 14px; color: var(--text-secondary); text-align: center; }
        .units-formula strong { color: var(--primary); }
        .units-all-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 12px; }
        .units-all-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
        .units-all-card { padding: 14px; border-radius: 12px; border: 1.5px solid var(--border-subtle); background: var(--bg-elevated); cursor: pointer; text-align: center; }
        .units-all-card.current { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated)); }
        .units-all-val { font-size: 16px; font-weight: 700; color: var(--text-primary); font-family: monospace; margin-bottom: 4px; }
        .units-all-lbl { font-size: 11px; color: var(--text-muted); }
      `}</style>
    </div>
  );
}

// ─── Solver Panel ─────────────────────────────────────────────────────────

function SolverPanel({ onGraphExpr }: { onGraphExpr: (expr: string) => void }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('2x + 5 = 11');
  const [activeCategory, setActiveCategory] = useState<MathCategoryId>('algebra');
  const [symbolGroup, setSymbolGroup] = useState<SymbolGroupId>('basic');
  const [result, setResult] = useState<SolverResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [context, setContext] = useState<MathContext | null>(null);
  const [recentCandidate, setRecentCandidate] = useState<RecentFileCandidate | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [practice, setPractice] = useState<string>('');
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [saving, setSaving] = useState<'solution' | 'practice' | null>(null);

  useEffect(() => {
    const stored = readMathContext();
    if (stored) {
      setContext(stored);
      return;
    }

    setRecentLoading(true);
    void loadMostRecentCandidate().then((candidate) => setRecentCandidate(candidate)).finally(() => setRecentLoading(false));
  }, []);

  const previewLatex = useMemo(() => formatMathExpression(normalizeInputForPreview(input || '')), [input]);
  const categoryConfig = MATH_CATEGORIES[activeCategory];

  useEffect(() => {
    const preferredGroup: Partial<Record<MathCategoryId, SymbolGroupId>> = {
      algebra: 'algebra',
      geometry: 'basic',
      calculus: 'calculus',
      trigonometry: 'trigonometry',
      'sequences-series': 'algebra',
      vectors: 'vectors',
      matrices: 'matrices',
      'linear-algebra': 'matrices',
    };
    const nextGroup = preferredGroup[activeCategory];
    if (nextGroup) setSymbolGroup(nextGroup);
  }, [activeCategory]);

  function insertSymbol(symbol: string) {
    const target = inputRef.current;
    const placeholderIndex = symbol.indexOf('()');
    const caretOffset = placeholderIndex >= 0 ? placeholderIndex + 1 : symbol.length;
    if (!target) {
      setInput((prev) => `${prev}${symbol}`);
      return;
    }

    const start = target.selectionStart ?? input.length;
    const end = target.selectionEnd ?? input.length;
    const next = `${input.slice(0, start)}${symbol}${input.slice(end)}`;
    setInput(next);
    requestAnimationFrame(() => {
      target.focus();
      const caret = start + caretOffset;
      target.setSelectionRange(caret, caret);
    });
  }

  async function loadRecentFileContext() {
    if (!recentCandidate) return;
    setRecentLoading(true);
    const resolved = await recentCandidateToContext(recentCandidate);
    setRecentLoading(false);
    if (!resolved) {
      toast('The recent file is not available locally on this device.', 'warning');
      return;
    }
    writeMathContext({
      fileId: resolved.fileId,
      fileName: resolved.fileName,
      extractedText: resolved.extractedText,
      sourceFolderId: resolved.sourceFolderId ?? null,
      sourceTopicId: resolved.sourceTopicId ?? null,
    });
    setContext(resolved);
    setRecentCandidate(null);
    toast(`Using ${resolved.fileName} for math context`, 'success');
  }

  const handleSolve = useCallback(async (problemInput?: string) => {
    const problem = (problemInput ?? input).trim();
    if (!problem) {
      setError('Enter a math problem first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setExplanation(null);
    setPractice('');

    try {
      const body: MathSolveRequest = {
        problem,
        category: activeCategory,
        contextFileId: context?.fileId ?? null,
        contextText: context?.extractedText ?? null,
      };
      const res = await fetch('/api/math/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Could not solve this problem.');
      }
      const solved = await res.json() as SolverResult;
      setResult(solved);
      setActiveCategory(solved.category);
      if (solved.graphExpr) onGraphExpr(solved.graphExpr);
    } catch (solveError) {
      setError(solveError instanceof Error ? solveError.message : 'Could not solve this problem.');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, context?.extractedText, context?.fileId, input, onGraphExpr]);

  async function saveToLibrary(mode: 'solution' | 'practice') {
    if (mode === 'solution' && !result) return;
    if (mode === 'practice' && !practice.trim()) return;

    setSaving(mode);
    try {
      const content = mode === 'solution'
        ? buildMathLibraryContent(result!)
        : practice;
      const metadata = {
        title: mode === 'solution' ? `${MATH_CATEGORIES[result!.category].label} solution` : `${categoryConfig.label} practice set`,
        category: mode === 'solution' ? MATH_CATEGORIES[result!.category].label : categoryConfig.label,
        problem: mode === 'solution' ? result!.normalizedInput : input.trim(),
        sourceFileId: context?.fileId ?? null,
        sourceFileName: context?.fileName ?? null,
        graphExpr: mode === 'solution' ? result!.graphExpr ?? null : null,
        savedFrom: '/math',
      };
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: mode === 'solution' ? 'math-solution' : 'math-practice',
          content,
          metadata,
        }),
      });
      if (!res.ok) throw new Error('Unable to save to Library.');
      toast(mode === 'solution' ? 'Saved solution to Library' : 'Saved practice set to Library', 'success');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : 'Unable to save to Library.', 'error');
    } finally {
      setSaving(null);
    }
  }

  async function explainConcept() {
    if (!input.trim() && !result) return;
    setExplainLoading(true);
    setExplanation(null);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: result?.normalizedInput || input.trim(),
          context: context?.extractedText?.slice(0, 2400),
        }),
      });
      const payload = await res.json().catch(() => ({ explanation: null }));
      setExplanation(payload.explanation || 'No explanation was returned.');
    } catch {
      setExplanation('Explanation service is unavailable right now.');
    } finally {
      setExplainLoading(false);
    }
  }

  async function generatePractice() {
    if (!input.trim() && !result) return;
    setPracticeLoading(true);
    setPractice('');
    try {
      let sourceContext = '';
      if (context?.extractedText?.trim()) {
        sourceContext = context.extractedText.slice(0, 4000);
      }

      const prompt = [
        `Math category: ${categoryConfig.label}`,
        `Task: ${categoryConfig.practicePrompt}`,
        result ? `Anchor problem already solved: ${result.normalizedInput}` : '',
        result ? `Anchor answer: ${result.answer}` : '',
        sourceContext ? `Use the following course material to mirror notation, terminology, and difficulty:\n${sourceContext}` : '',
        'Output 5 practice questions with concise answer keys.',
      ].filter(Boolean).join('\n\n');

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'assignment',
          text: prompt,
          fileId: context?.fileId ?? null,
          options: { count: 5 },
        }),
      });
      const payload = await res.json();
      setPractice(payload.content || payload.error || 'No practice set returned.');
    } catch {
      setPractice('Could not generate practice questions right now.');
    } finally {
      setPracticeLoading(false);
    }
  }

  return (
    <div className="ms-shell">
      <div className="ms-body">
        <div className="ms-left">
          <div className="ms-input-card">
            <div className="ms-input-header">
              <div>
                <div className="ms-input-label">Problem input</div>
                <p className="ms-input-copy">Use MATLAB-style text, insert symbols, then solve with one unified engine.</p>
              </div>
              {context ? (
                <button className="ms-context-clear" onClick={() => { clearMathContext(); setContext(null); }}>
                  Clear file context
                </button>
              ) : null}
            </div>

            {context ? (
              <div className="ms-context-card">
                <div>
                  <strong>{context.fileName}</strong>
                  <small>{context.extractedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words available for explanations and practice.</small>
                </div>
                <span className="ms-context-badge">Linked file</span>
              </div>
            ) : recentCandidate ? (
              <div className="ms-context-card recent">
                <div>
                  <strong>{recentCandidate.fileName}</strong>
                  <small>Use your most recent workspace file to ground math explanations and practice.</small>
                </div>
                <button className="ms-context-cta" onClick={() => void loadRecentFileContext()} disabled={recentLoading}>
                  {recentLoading ? 'Loading…' : 'Use most recent file'}
                </button>
              </div>
            ) : null}

            <div className="ms-input-row">
              <textarea
                ref={inputRef}
                className="ms-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Examples: 2x + 5 <= 11, x^2 - 5x + 6 = 0, hypotenuse 3 4, arithmetic nth 3 2 10"
                spellCheck={false}
              />
              <button className="ms-solve-btn" onClick={() => void handleSolve()} disabled={loading || !input.trim()}>
                {loading ? '⟳' : '='}
              </button>
            </div>

            {error && <div className="ms-error">{error}</div>}

            {input.trim() && (
              <div className="ms-preview">
                <div className="ms-preview-head">
                  <span className="ms-preview-label">Preview</span>
                  <span className="ms-preview-hint">Rendered notation before solving</span>
                </div>
                <div className="ms-preview-latex">
                  <LatexBlock latex={previewLatex} display />
                </div>
                <div className="ms-preview-raw">
                  <span className="ms-preview-raw-label">Input syntax</span>
                  <code>{normalizeInputForPreview(input)}</code>
                </div>
              </div>
            )}

            <div className="ms-keyboard-tabs">
              {MATH_SYMBOL_GROUPS.map((group) => (
                <button
                  key={group.id}
                  className={`ms-keyboard-tab${symbolGroup === group.id ? ' active' : ''}`}
                  onClick={() => setSymbolGroup(group.id)}
                >
                  {group.label}
                </button>
              ))}
            </div>
            <div className="ms-keyboard-grid">
              {MATH_SYMBOL_GROUPS.find((group) => group.id === symbolGroup)?.symbols.map((symbol) => (
                <button key={`${symbolGroup}-${symbol.label}`} className="ms-keyboard-key" onClick={() => insertSymbol(symbol.insert)}>
                  <span>{symbol.label}</span>
                  <small>{symbol.insert}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="ms-examples-card">
            <div className="ms-cat-tabs">
              {MATH_CATEGORY_ORDER.map((categoryId) => (
                <button key={categoryId} className={`ms-cat-tab${activeCategory === categoryId ? ' active' : ''}`} onClick={() => setActiveCategory(categoryId)}>
                  {MATH_CATEGORIES[categoryId].label}
                </button>
              ))}
            </div>
            <div className="ms-category-actions">
              {categoryConfig.supportedActions.map((action) => <span key={action} className="ms-action-pill">{action}</span>)}
            </div>
            <div className="ms-examples">
              {categoryConfig.examples.map((example, index) => (
                <button key={`${categoryConfig.id}-${index}`} className="ms-example" onClick={() => setInput(example.expr)}>
                  <div className="ms-example-code">{example.expr}</div>
                  <div className="ms-example-desc">{example.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="ms-right">
          {!result && !loading && (
            <div className="ms-empty">
              <span className="ms-empty-icon">𝑓(x)</span>
              <p>Enter algebra, geometry, trigonometry, sequences, calculus, matrix, or statistics problems and solve them with steps.</p>
              <p className="ms-empty-hint">Then explain the concept, send graphable work to the graph tab, or generate practice questions grounded in your course file.</p>
            </div>
          )}

          {loading && (
            <div className="ms-loading">
              <div className="ms-spinner" />
              <p>Solving the problem…</p>
            </div>
          )}

          {result && !loading && (
            <div className="ms-solution">
              <div className={`ms-answer-bar${result.verified ? '' : ' unverified'}`}>
                <div className="ms-answer-meta">
                  <span className="ms-answer-type">{MATH_CATEGORIES[result.category].label}</span>
                  <span className="ms-engine-pill">{result.engine}</span>
                  {result.verified ? <span className="ms-verified">Verified</span> : <span className="ms-unverified">Needs review</span>}
                </div>

                <div className="ms-problem-block">
                  <div className="ms-section-label">Normalized problem</div>
                  <div className="ms-problem-latex"><LatexBlock latex={result.previewLatex} display /></div>
                </div>

                <div className="ms-answer-latex">
                  <LatexBlock latex={result.answerLatex} display />
                </div>
                <div className="ms-explanation">{result.explanation}</div>

                <div className="ms-answer-actions">
                  <button className="ms-act-btn" onClick={() => navigator.clipboard.writeText(result.answer).catch(() => {})}>Copy answer</button>
                  <button className="ms-act-btn" onClick={() => navigator.clipboard.writeText(result.answerLatex).catch(() => {})}>Copy LaTeX</button>
                  {result.graphExpr && <button className="ms-act-btn ms-act-graph" onClick={() => onGraphExpr(result.graphExpr!)}>Plot on Graph</button>}
                  <button className="ms-act-btn" onClick={() => void explainConcept()} disabled={explainLoading}>{explainLoading ? 'Explaining…' : 'Explain this concept'}</button>
                  <button className="ms-act-btn" onClick={() => void generatePractice()} disabled={practiceLoading}>{practiceLoading ? 'Generating…' : 'Generate practice questions'}</button>
                  <button className="ms-act-btn" onClick={() => void saveToLibrary('solution')} disabled={saving === 'solution'}>{saving === 'solution' ? 'Saving…' : 'Save to Library'}</button>
                </div>
              </div>

              <div className="ms-steps">
                <div className="ms-steps-title">Step-by-step solution</div>
                {result.steps.map((step) => (
                  <div key={`${step.step}-${step.description}`} className="ms-step">
                    <div className="ms-step-num">{step.step}</div>
                    <div className="ms-step-body">
                      <div className="ms-step-desc">{step.description}</div>
                      <div className="ms-step-expr"><LatexBlock latex={step.expression} display /></div>
                      <div className="ms-step-expl">{step.explanation}</div>
                    </div>
                  </div>
                ))}
              </div>

              {(explainLoading || explanation) && (
                <div className="ms-side-card">
                  <div className="ms-side-card-header">Explain this concept</div>
                  <div className="ms-side-card-body">{explainLoading ? 'Generating a clear explanation…' : explanation}</div>
                </div>
              )}

              {(practiceLoading || practice) && (
                <div className="ms-side-card">
                  <div className="ms-side-card-header">Practice mode</div>
                  <div className="ms-side-card-body">{practiceLoading ? 'Generating practice questions…' : practice}</div>
                  {practice && (
                    <div className="ms-side-actions">
                      <button className="ms-act-btn" onClick={() => navigator.clipboard.writeText(practice).catch(() => {})}>Copy practice</button>
                      <button className="ms-act-btn" onClick={() => void saveToLibrary('practice')} disabled={saving === 'practice'}>{saving === 'practice' ? 'Saving…' : 'Save practice'}</button>
                    </div>
                  )}
                </div>
              )}

              {result.error && <div className="ms-error">{result.error}</div>}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .ms-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .ms-body { display: grid; grid-template-columns: 420px minmax(0,1fr); flex: 1; overflow: hidden; }
        .ms-left { display: flex; flex-direction: column; border-right: 1px solid var(--border-subtle); overflow-y: auto; background: var(--bg-elevated); }
        .ms-right { overflow-y: auto; padding: 20px; }
        .ms-input-card, .ms-examples-card { padding: 18px; border-bottom: 1px solid var(--border-subtle); }
        .ms-input-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .ms-input-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .ms-input-copy { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-muted); }
        .ms-context-clear { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
        .ms-context-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--border-subtle)); background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface)); margin-bottom: 12px; }
        .ms-context-card strong { display: block; font-size: 14px; }
        .ms-context-card small { display: block; margin-top: 4px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .ms-context-card.recent { background: color-mix(in srgb, var(--success) 8%, var(--bg-surface)); border-color: color-mix(in srgb, var(--success) 25%, var(--border-subtle)); }
        .ms-context-badge, .ms-context-cta { border-radius: 999px; padding: 8px 12px; font-size: 12px; font-weight: 600; }
        .ms-context-badge { background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); }
        .ms-context-cta { border: none; background: var(--success, #16a34a); color: white; cursor: pointer; }
        .ms-input-row { display: grid; grid-template-columns: minmax(0,1fr) 56px; gap: 10px; }
        .ms-input { width: 100%; min-height: 108px; padding: 14px 16px; border-radius: 14px; border: 2px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); font-size: 14px; line-height: 1.6; font-family: 'JetBrains Mono', monospace; resize: vertical; outline: none; }
        .ms-input:focus { border-color: var(--primary); }
        .ms-solve-btn { width: 56px; border-radius: 14px; background: var(--primary); color: white; border: none; font-size: 22px; font-weight: 700; cursor: pointer; }
        .ms-solve-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ms-preview { margin-top: 12px; padding: 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 7%, var(--bg-surface)), var(--bg-surface)); border-radius: 14px; border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border-subtle)); }
        .ms-preview-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
        .ms-preview-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .ms-preview-hint { font-size: 11px; color: var(--text-muted); }
        .ms-preview-latex { display: flex; justify-content: center; min-height: 52px; padding: 8px 4px 10px; overflow-x: auto; }
        .ms-preview-raw { display: grid; gap: 6px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--bg-elevated) 82%, transparent); border: 1px solid var(--border-subtle); font-size: 12px; line-height: 1.55; color: var(--text-secondary); white-space: pre-wrap; word-break: break-word; }
        .ms-preview-raw-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-family: var(--font-sans, inherit); }
        .ms-preview-raw code { font-family: 'JetBrains Mono', monospace; }
        .ms-keyboard-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
        .ms-keyboard-tab { border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-muted); border-radius: 999px; padding: 6px 10px; font-size: 12px; cursor: pointer; }
        .ms-keyboard-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
        .ms-keyboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; margin-top: 10px; }
        .ms-keyboard-key { text-align: left; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); border-radius: 12px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
        .ms-keyboard-key small { color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
        .ms-cat-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .ms-cat-tab { padding: 6px 10px; border-radius: 8px; border: none; background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; cursor: pointer; }
        .ms-cat-tab.active { background: var(--primary); color: white; }
        .ms-category-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .ms-action-pill { border-radius: 999px; padding: 4px 10px; background: color-mix(in srgb, var(--primary) 9%, var(--bg-surface)); color: var(--text-secondary); font-size: 11px; }
        .ms-examples { display: flex; flex-direction: column; gap: 6px; }
        .ms-example { text-align: left; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-surface); cursor: pointer; }
        .ms-example-code { font-size: 13px; font-family: 'JetBrains Mono', monospace; color: var(--text-primary); font-weight: 500; }
        .ms-example-desc { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .ms-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 320px; color: var(--text-muted); text-align: center; gap: 10px; }
        .ms-empty-icon { font-size: 60px; opacity: 0.25; }
        .ms-empty-hint { font-size: 12px !important; }
        .ms-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px; color: var(--text-muted); }
        .ms-spinner { width: 32px; height: 32px; border: 3px solid var(--border-subtle); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .ms-solution { display: flex; flex-direction: column; gap: 14px; }
        .ms-answer-bar { padding: 18px; border-radius: 16px; border: 2px solid var(--primary); background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated)); box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 15%, transparent); }
        .ms-answer-bar.unverified { border-color: #f59e0b; background: color-mix(in srgb, #f59e0b 6%, var(--bg-elevated)); }
        .ms-answer-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .ms-answer-type, .ms-engine-pill { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 8px; border-radius: 999px; }
        .ms-answer-type { background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary); }
        .ms-engine-pill { background: var(--bg-surface); color: var(--text-muted); }
        .ms-verified { color: #52b788; font-size: 12px; }
        .ms-unverified { color: #f59e0b; font-size: 12px; }
        .ms-problem-block { margin-bottom: 14px; }
        .ms-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 6px; }
        .ms-problem-latex, .ms-answer-latex { display: flex; justify-content: center; padding: 10px 0; overflow-x: auto; }
        .ms-explanation { font-size: 13px; line-height: 1.7; color: var(--text-secondary); }
        .ms-answer-actions, .ms-side-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .ms-act-btn { padding: 7px 12px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; }
        .ms-act-graph { background: color-mix(in srgb, var(--primary) 10%, var(--bg-surface)) !important; border-color: var(--primary) !important; color: var(--primary) !important; }
        .ms-steps, .ms-side-card { background: var(--bg-elevated); border-radius: 16px; border: 1px solid var(--border-subtle); overflow: hidden; }
        .ms-steps-title, .ms-side-card-header { padding: 12px 18px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
        .ms-step { display: flex; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); }
        .ms-step:last-child { border-bottom: none; }
        .ms-step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
        .ms-step-desc { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
        .ms-step-expr { padding: 7px 10px; background: var(--bg-surface); border-radius: 9px; border: 1px solid var(--border-subtle); overflow-x: auto; display: flex; justify-content: center; margin-bottom: 6px; }
        .ms-step-expl, .ms-side-card-body { font-size: 12px; color: var(--text-muted); line-height: 1.7; white-space: pre-wrap; }
        .ms-side-card-body { padding: 14px 18px; }
        .ms-error { padding: 10px 14px; border-radius: 12px; background: color-mix(in srgb, #e05252 8%, var(--bg-elevated)); border: 1px solid color-mix(in srgb, #e05252 30%, var(--border-subtle)); font-size: 12px; color: var(--text-secondary); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 980px) {
          .ms-body { grid-template-columns: 1fr; }
          .ms-left { border-right: none; border-bottom: 1px solid var(--border-subtle); }
          .ms-keyboard-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────

export default function MathSolverPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('solver');
  const [graphExprFromSolver, setGraphExprFromSolver] = useState<string | undefined>();

  const handleGraphExpr = useCallback((expr: string) => {
    setGraphExprFromSolver(expr);
    setActiveTab('graph');
  }, []);

  const tabs: Array<{ id: MainTab; label: string; icon: string; hint: string }> = [
    { id: 'solver', label: 'Solver', icon: '∑', hint: 'Solve algebra, calculus, vectors, statistics, and matrices.' },
    { id: 'graph', label: 'Graph', icon: '📈', hint: 'Plot graphable expressions with a Desmos-like workspace.' },
    { id: 'units', label: 'Units', icon: '⚖️', hint: 'Convert engineering and physics units quickly.' },
    { id: 'lab', label: 'MATLAB Flow', icon: '⌘', hint: 'Use matrix-first workflows and MATLAB-style commands.' },
  ];

  return (
    <div className="math-root">
      <div className="math-header">
        <div className="math-brand">
          <span className="math-brand-icon">∑</span>
          <div>
            <h1>Math</h1>
            <p>Unified solver · Graphing · Units · MATLAB Flow</p>
          </div>
        </div>
        <div className="math-tabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={`math-tab${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              <span className="math-tab-icon">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="math-body">
        <aside className="math-sidebar">
          <div className="math-sidebar-section">
            <div className="math-sidebar-label">Workflows</div>
            <div className="math-sidebar-list">
              {tabs.map((tab) => (
                <button key={tab.id} className={`math-side-item${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                  <span className="math-side-icon">{tab.icon}</span>
                  <span className="math-side-copy">
                    <strong>{tab.label}</strong>
                    <small>{tab.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="math-sidebar-section">
            <div className="math-sidebar-label">StudyPilot fit</div>
            <div className="math-ref-card subtle">
              <span className="math-ref-icon">R</span>
              <span className="math-side-copy">
                <strong>Results Hub</strong>
                <small>Save solved problems and generated practice directly into Library as math-specific results.</small>
              </span>
            </div>
            <Link className="math-ref-card" href="/workspace">
              <span className="math-ref-icon">⌘</span>
              <span className="math-side-copy">
                <strong>Workspace + Files</strong>
                <small>Send one selected course file into Math for grounded explanations and practice generation.</small>
              </span>
            </Link>
            <a className="math-ref-card" href="https://www.wolframalpha.com/" target="_blank" rel="noreferrer">
              <span className="math-ref-icon">W</span>
              <span className="math-side-copy">
                <strong>Wolfram Alpha</strong>
                <small>Cross-check exact symbolic results and edge cases when you want a second opinion.</small>
              </span>
            </a>
          </div>
        </aside>

        <div className="math-content">
          {activeTab === 'solver' && <SolverPanel onGraphExpr={handleGraphExpr} />}
          {activeTab === 'graph' && <GraphPanel initialExpr={graphExprFromSolver} />}
          {activeTab === 'units' && <UnitsPanel />}
          {activeTab === 'lab' && <MatlabLab onGraphExpression={handleGraphExpr} />}
        </div>
      </div>

      <style jsx>{`
        .math-root { display: flex; flex-direction: column; height: calc(100dvh - 40px); overflow: hidden; background: var(--bg-surface); }
        .math-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-elevated); gap: 16px; }
        .math-brand { display: flex; align-items: center; gap: 12px; }
        .math-brand-icon { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, #a78bfa)); display: flex; align-items: center; justify-content: center; font-size: 22px; color: white; font-weight: 700; }
        .math-brand h1 { margin: 0; font-size: 18px; font-weight: 700; }
        .math-brand p { margin: 1px 0 0; font-size: 11px; color: var(--text-muted); }
        .math-tabs { display: flex; gap: 4px; background: var(--bg-surface); border-radius: 12px; padding: 4px; border: 1px solid var(--border-subtle); }
        .math-tab { display: flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 9px; border: none; background: transparent; color: var(--text-muted); font-size: 14px; font-weight: 500; cursor: pointer; }
        .math-tab.active { background: var(--primary); color: white; }
        .math-body { flex: 1; display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 0; }
        .math-sidebar { padding: 18px; border-right: 1px solid var(--border-subtle); background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, transparent), color-mix(in srgb, var(--bg-surface) 96%, transparent)); overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
        .math-sidebar-section { display: flex; flex-direction: column; gap: 10px; }
        .math-sidebar-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .math-sidebar-list { display: flex; flex-direction: column; gap: 8px; }
        .math-side-item, .math-ref-card { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-elevated) 88%, transparent); color: var(--text-primary); text-align: left; text-decoration: none; }
        .math-side-item { cursor: pointer; width: 100%; }
        .math-side-item.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--bg-elevated)); box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 16%, transparent); }
        .math-ref-card.subtle { background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated)); }
        .math-side-icon, .math-ref-icon { width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--primary) 18%, var(--bg-elevated)); color: var(--text-primary); font-weight: 700; flex-shrink: 0; }
        .math-side-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .math-side-copy strong { font-size: 14px; line-height: 1.2; }
        .math-side-copy small { font-size: 12px; line-height: 1.45; color: var(--text-muted); }
        .math-content { flex: 1; overflow: hidden; min-width: 0; }
        @media (max-width: 980px) {
          .math-body { grid-template-columns: 1fr; }
          .math-sidebar { border-right: none; border-bottom: 1px solid var(--border-subtle); max-height: 260px; }
        }
      `}</style>
    </div>
  );
}
