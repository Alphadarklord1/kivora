'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import * as math from 'mathjs';
import { solve, EXAMPLE_PROBLEMS, type SolverResult } from '@/lib/math/symbolic-solver';
import { MatlabLab } from '@/components/tools/MatlabLab';

// ─── Types ─────────────────────────────────────────────────────────────────

type MainTab = 'solver' | 'graph' | 'units' | 'lab';

interface GraphFn {
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

// ─── Constants ─────────────────────────────────────────────────────────────

const FN_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#a855f7'];

const DEFAULT_GRAPH_FNS: GraphFn[] = [
  { id: '1', expr: 'x^2', color: FN_COLORS[0], enabled: true, showDerivative: false },
  { id: '2', expr: '', color: FN_COLORS[1], enabled: false, showDerivative: false },
  { id: '3', expr: '', color: FN_COLORS[2], enabled: false, showDerivative: false },
  { id: '4', expr: '', color: FN_COLORS[3], enabled: false, showDerivative: false },
  { id: '5', expr: '', color: FN_COLORS[4], enabled: false, showDerivative: false },
];

const UNIT_CATEGORIES: UnitCategory[] = [
  {
    label: 'Length',
    units: [
      { id: 'mm', label: 'Millimeters', toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: 'cm', label: 'Centimeters', toBase: v => v / 100, fromBase: v => v * 100 },
      { id: 'm', label: 'Meters', toBase: v => v, fromBase: v => v },
      { id: 'km', label: 'Kilometers', toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: 'in', label: 'Inches', toBase: v => v * 0.0254, fromBase: v => v / 0.0254 },
      { id: 'ft', label: 'Feet', toBase: v => v * 0.3048, fromBase: v => v / 0.3048 },
      { id: 'yd', label: 'Yards', toBase: v => v * 0.9144, fromBase: v => v / 0.9144 },
      { id: 'mi', label: 'Miles', toBase: v => v * 1609.344, fromBase: v => v / 1609.344 },
    ],
  },
  {
    label: 'Mass',
    units: [
      { id: 'mg', label: 'Milligrams', toBase: v => v / 1e6, fromBase: v => v * 1e6 },
      { id: 'g', label: 'Grams', toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: 'kg', label: 'Kilograms', toBase: v => v, fromBase: v => v },
      { id: 'lb', label: 'Pounds', toBase: v => v * 0.453592, fromBase: v => v / 0.453592 },
      { id: 'oz', label: 'Ounces', toBase: v => v * 0.0283495, fromBase: v => v / 0.0283495 },
      { id: 't', label: 'Metric Tons', toBase: v => v * 1000, fromBase: v => v / 1000 },
    ],
  },
  {
    label: 'Temperature',
    units: [
      { id: 'C', label: 'Celsius (°C)', toBase: v => v, fromBase: v => v },
      { id: 'F', label: 'Fahrenheit (°F)', toBase: v => (v - 32) * 5/9, fromBase: v => v * 9/5 + 32 },
      { id: 'K', label: 'Kelvin (K)', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
    ],
  },
  {
    label: 'Speed',
    units: [
      { id: 'ms', label: 'm/s', toBase: v => v, fromBase: v => v },
      { id: 'kmh', label: 'km/h', toBase: v => v / 3.6, fromBase: v => v * 3.6 },
      { id: 'mph', label: 'mph', toBase: v => v * 0.44704, fromBase: v => v / 0.44704 },
      { id: 'knot', label: 'Knots', toBase: v => v * 0.514444, fromBase: v => v / 0.514444 },
      { id: 'mach', label: 'Mach', toBase: v => v * 340.29, fromBase: v => v / 340.29 },
    ],
  },
  {
    label: 'Area',
    units: [
      { id: 'm2', label: 'm²', toBase: v => v, fromBase: v => v },
      { id: 'km2', label: 'km²', toBase: v => v * 1e6, fromBase: v => v / 1e6 },
      { id: 'cm2', label: 'cm²', toBase: v => v / 1e4, fromBase: v => v * 1e4 },
      { id: 'ft2', label: 'ft²', toBase: v => v * 0.092903, fromBase: v => v / 0.092903 },
      { id: 'ac', label: 'Acres', toBase: v => v * 4046.86, fromBase: v => v / 4046.86 },
      { id: 'ha', label: 'Hectares', toBase: v => v * 10000, fromBase: v => v / 10000 },
    ],
  },
  {
    label: 'Volume',
    units: [
      { id: 'ml', label: 'Milliliters', toBase: v => v / 1000, fromBase: v => v * 1000 },
      { id: 'l', label: 'Liters', toBase: v => v, fromBase: v => v },
      { id: 'm3', label: 'm³', toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: 'gal', label: 'Gallons (US)', toBase: v => v * 3.78541, fromBase: v => v / 3.78541 },
      { id: 'fl_oz', label: 'Fluid oz', toBase: v => v * 0.0295735, fromBase: v => v / 0.0295735 },
      { id: 'cup', label: 'Cups', toBase: v => v * 0.236588, fromBase: v => v / 0.236588 },
    ],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

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

function safeLatex(input: string): string {
  try {
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

// ─── Graph Panel ──────────────────────────────────────────────────────────

function GraphPanel({ initialExpr }: { initialExpr?: string }) {
  const [fns, setFns] = useState<GraphFn[]>(() => {
    if (initialExpr) {
      return DEFAULT_GRAPH_FNS.map((f, i) =>
        i === 0 ? { ...f, expr: initialExpr, enabled: true } : f
      );
    }
    return DEFAULT_GRAPH_FNS;
  });
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [yMin, setYMin] = useState(-10);
  const [yMax, setYMax] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const [showZeros, setShowZeros] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [tableX, setTableX] = useState('-5,-4,-3,-2,-1,0,1,2,3,4,5');
  const [graphError, setGraphError] = useState('');
  const graphRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update graph whenever fns/domain changes
  const renderGraph = useCallback(() => {
    if (!graphRef.current) return;
    const active = fns.filter(f => f.enabled && f.expr.trim());
    if (active.length === 0) {
      graphRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px">Enter a function to plot</div>';
      return;
    }

    import('function-plot').then(({ default: functionPlot }) => {
      if (!graphRef.current) return;
      try {
        setGraphError('');
        graphRef.current.innerHTML = '';
        const container = graphRef.current;
        const w = container.clientWidth || 600;
        const h = container.clientHeight || 480;

        const data: object[] = [];
        for (const fn of active) {
          // function-plot uses ^ natively for power — do NOT convert to **
          const expr = fn.expr.trim();
          data.push({ fn: expr, color: fn.color, graphType: 'polyline' });
          if (fn.showDerivative) {
            data.push({ fn: expr, fnType: 'x', color: fn.color + '80', derivative: { fn: expr, updateOnMouseMove: false } });
          }
        }
        if (showZeros && active.length > 0) {
          // Show zeros as scatter overlay
          for (const fn of active) {
            data.push({ fn: fn.expr.trim(), color: fn.color, fnType: 'x', graphType: 'scatter' });
          }
        }

        functionPlot({
          target: container,
          width: w,
          height: h,
          grid: showGrid,
          xAxis: { domain: [xMin, xMax] },
          yAxis: { domain: [yMin, yMax] },
          data,
          tip: { xLine: true, yLine: true },
        });
      } catch (err) {
        setGraphError(String(err));
      }
    }).catch(() => {
      setGraphError('function-plot not available');
    });
  }, [fns, xMin, xMax, yMin, yMax, showGrid, showZeros]);

  useEffect(() => {
    if (plotRef.current) clearTimeout(plotRef.current);
    plotRef.current = setTimeout(renderGraph, 250);
    return () => { if (plotRef.current) clearTimeout(plotRef.current); };
  }, [renderGraph]);

  // Update when initialExpr changes (from solver)
  useEffect(() => {
    if (initialExpr) {
      setFns(prev => prev.map((f, i) =>
        i === 0 ? { ...f, expr: initialExpr, enabled: true } : f
      ));
    }
  }, [initialExpr]);

  // Table of values
  const tableData = useMemo(() => {
    if (!showTable) return null;
    const xs = tableX.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    const activeFns = fns.filter(f => f.enabled && f.expr.trim());
    if (activeFns.length === 0 || xs.length === 0) return null;

    return xs.map(x => {
      const vals = activeFns.map(fn => {
        try {
          const val = math.evaluate(fn.expr, { x });
          return typeof val === 'number' ? val.toFixed(4) : String(val);
        } catch {
          return '—';
        }
      });
      return { x, vals };
    });
  }, [showTable, tableX, fns]);

  const updateFn = (id: string, patch: Partial<GraphFn>) => {
    setFns(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  return (
    <div className="graph-shell">
      {/* Left: function list */}
      <div className="graph-sidebar">
        <div className="graph-sidebar-header">
          <span className="graph-sidebar-title">Functions</span>
        </div>
        {fns.map((fn, idx) => (
          <div key={fn.id} className={`graph-fn-row${fn.enabled ? ' active' : ''}`}>
            <button
              className="graph-fn-color"
              style={{ background: fn.color, border: fn.enabled ? `3px solid ${fn.color}` : '3px solid var(--border-subtle)' }}
              onClick={() => updateFn(fn.id, { enabled: !fn.enabled })}
              title={fn.enabled ? 'Hide' : 'Show'}
            />
            <div className="graph-fn-input-wrap">
              <span className="graph-fn-label">f{idx + 1}(x) =</span>
              <input
                className="graph-fn-input"
                value={fn.expr}
                onChange={e => updateFn(fn.id, { expr: e.target.value, enabled: e.target.value.trim().length > 0 })}
                placeholder={idx === 0 ? 'x^2' : ''}
                spellCheck={false}
              />
            </div>
            <button
              className={`graph-deriv-btn${fn.showDerivative ? ' on' : ''}`}
              onClick={() => updateFn(fn.id, { showDerivative: !fn.showDerivative })}
              title="Show derivative"
            >f′</button>
          </div>
        ))}

        {/* Domain controls */}
        <div className="graph-domain-section">
          <div className="graph-domain-title">Domain</div>
          <div className="graph-domain-row">
            <label>x</label>
            <input className="graph-domain-in" type="number" value={xMin} onChange={e => setXMin(+e.target.value)} />
            <span>to</span>
            <input className="graph-domain-in" type="number" value={xMax} onChange={e => setXMax(+e.target.value)} />
          </div>
          <div className="graph-domain-row">
            <label>y</label>
            <input className="graph-domain-in" type="number" value={yMin} onChange={e => setYMin(+e.target.value)} />
            <span>to</span>
            <input className="graph-domain-in" type="number" value={yMax} onChange={e => setYMax(+e.target.value)} />
          </div>
        </div>

        {/* Toggles */}
        <div className="graph-toggles">
          <label className="graph-toggle">
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            <span>Grid</span>
          </label>
          <label className="graph-toggle">
            <input type="checkbox" checked={showZeros} onChange={e => setShowZeros(e.target.checked)} />
            <span>Show zeros</span>
          </label>
          <label className="graph-toggle">
            <input type="checkbox" checked={showTable} onChange={e => setShowTable(e.target.checked)} />
            <span>Value table</span>
          </label>
        </div>

        {/* Quick presets */}
        <div className="graph-presets">
          <div className="graph-domain-title">Presets</div>
          <div className="graph-preset-grid">
            {[
              { label: 'x²', fn: 'x^2' },
              { label: 'sin(x)', fn: 'sin(x)' },
              { label: 'cos(x)', fn: 'cos(x)' },
              { label: 'tan(x)', fn: 'tan(x)' },
              { label: '1/x', fn: '1/x' },
              { label: 'e^x', fn: 'e^x' },
              { label: 'ln(x)', fn: 'log(x)' },
              { label: '|x|', fn: 'abs(x)' },
            ].map(p => (
              <button
                key={p.fn}
                className="graph-preset"
                onClick={() => {
                  const emptyIdx = fns.findIndex(f => !f.expr.trim());
                  const idx = emptyIdx >= 0 ? emptyIdx : 0;
                  updateFn(fns[idx].id, { expr: p.fn, enabled: true });
                }}
              >{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: canvas + table */}
      <div className="graph-main">
        <div ref={graphRef} className="graph-canvas" />
        {graphError && (
          <div className="graph-error">Could not render: {graphError}</div>
        )}

        {showTable && tableData && (
          <div className="graph-table-wrap">
            <div className="graph-table-header">
              <span>Value Table — x values:</span>
              <input
                className="graph-table-input"
                value={tableX}
                onChange={e => setTableX(e.target.value)}
                placeholder="-5,-4,-3,-2,-1,0,1,2,3,4,5"
              />
            </div>
            <table className="graph-table">
              <thead>
                <tr>
                  <th>x</th>
                  {fns.filter(f => f.enabled && f.expr.trim()).map((fn, i) => (
                    <th key={fn.id} style={{ color: fn.color }}>f{i + 1}(x)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map(row => (
                  <tr key={row.x}>
                    <td>{row.x}</td>
                    {row.vals.map((v, i) => <td key={i}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .graph-shell {
          display: flex; height: 100%; overflow: hidden;
        }
        .graph-sidebar {
          width: 280px; flex-shrink: 0;
          background: var(--bg-elevated);
          border-right: 1px solid var(--border-subtle);
          overflow-y: auto; display: flex; flex-direction: column; gap: 0;
        }
        .graph-sidebar-header {
          padding: 16px 16px 10px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .graph-sidebar-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--text-muted);
        }
        .graph-fn-row {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; border-bottom: 1px solid var(--border-subtle);
          opacity: 0.55; transition: opacity 0.15s;
        }
        .graph-fn-row.active { opacity: 1; }
        .graph-fn-color {
          width: 22px; height: 22px; border-radius: 6px; cursor: pointer;
          flex-shrink: 0; transition: transform 0.1s;
        }
        .graph-fn-color:hover { transform: scale(1.15); }
        .graph-fn-input-wrap {
          flex: 1; display: flex; align-items: center; gap: 4px;
          background: var(--bg-surface); border-radius: 8px;
          border: 1px solid var(--border-subtle); padding: 4px 8px;
        }
        .graph-fn-label {
          font-size: 11px; color: var(--text-muted); font-family: monospace;
          white-space: nowrap; flex-shrink: 0;
        }
        .graph-fn-input {
          flex: 1; border: none; background: transparent;
          font-size: 13px; font-family: 'JetBrains Mono', monospace;
          color: var(--text-primary); outline: none; min-width: 0;
        }
        .graph-deriv-btn {
          padding: 2px 7px; border-radius: 6px; border: 1px solid var(--border-subtle);
          background: transparent; color: var(--text-muted); font-size: 12px;
          cursor: pointer; font-family: serif; font-style: italic;
          transition: all 0.1s; flex-shrink: 0;
        }
        .graph-deriv-btn.on { background: var(--primary); color: white; border-color: var(--primary); }
        .graph-domain-section {
          padding: 12px; border-bottom: 1px solid var(--border-subtle);
        }
        .graph-domain-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 8px;
        }
        .graph-domain-row {
          display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
        }
        .graph-domain-row label { font-size: 12px; color: var(--text-muted); width: 10px; }
        .graph-domain-row span { font-size: 11px; color: var(--text-muted); }
        .graph-domain-in {
          flex: 1; padding: 5px 8px; border-radius: 7px;
          border: 1px solid var(--border-subtle); background: var(--bg-surface);
          color: var(--text-primary); font-size: 13px; outline: none;
          text-align: center;
        }
        .graph-domain-in:focus { border-color: var(--primary); }
        .graph-toggles {
          display: flex; flex-direction: column; gap: 4px;
          padding: 10px 12px; border-bottom: 1px solid var(--border-subtle);
        }
        .graph-toggle {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          font-size: 13px; color: var(--text-secondary);
        }
        .graph-toggle input { accent-color: var(--primary); }
        .graph-presets { padding: 12px; }
        .graph-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
        .graph-preset {
          padding: 6px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; font-family: monospace; cursor: pointer;
          transition: all 0.1s; text-align: center;
        }
        .graph-preset:hover { border-color: var(--primary); color: var(--primary); }
        .graph-main {
          flex: 1; display: flex; flex-direction: column; overflow: hidden;
        }
        .graph-canvas {
          flex: 1; min-height: 0; overflow: hidden;
          background: var(--bg-surface);
        }
        .graph-error {
          padding: 8px 16px; font-size: 12px; color: #ef4444;
          background: color-mix(in srgb, #ef4444 8%, var(--bg-elevated));
          border-top: 1px solid color-mix(in srgb, #ef4444 20%, transparent);
        }
        .graph-table-wrap {
          border-top: 1px solid var(--border-subtle);
          max-height: 220px; overflow-y: auto; flex-shrink: 0;
        }
        .graph-table-header {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          font-size: 12px; color: var(--text-muted);
        }
        .graph-table-input {
          flex: 1; padding: 3px 8px; border-radius: 6px;
          border: 1px solid var(--border-subtle); background: var(--bg-surface);
          color: var(--text-primary); font-size: 12px; font-family: monospace; outline: none;
        }
        .graph-table {
          width: 100%; border-collapse: collapse; font-size: 12px;
        }
        .graph-table th, .graph-table td {
          padding: 6px 12px; text-align: center;
          border-bottom: 1px solid var(--border-subtle);
        }
        .graph-table th {
          background: var(--bg-elevated); font-weight: 600; color: var(--text-muted);
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
        }
        .graph-table td { font-family: monospace; color: var(--text-secondary); }
        .graph-table tr:hover td { background: color-mix(in srgb, var(--primary) 4%, transparent); }
        @media (max-width: 780px) {
          .graph-shell { flex-direction: column; }
          .graph-sidebar { width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border-subtle); max-height: 40vh; }
        }
      `}</style>
    </div>
  );
}

// ─── Units Panel ──────────────────────────────────────────────────────────

function UnitsPanel() {
  const [catIdx, setCatIdx] = useState(0);
  const [fromUnit, setFromUnit] = useState(UNIT_CATEGORIES[0].units[2].id); // meters
  const [toUnit, setToUnit] = useState(UNIT_CATEGORIES[0].units[3].id); // km
  const [value, setValue] = useState('1');

  const cat = UNIT_CATEGORIES[catIdx];

  const fromU = cat.units.find(u => u.id === fromUnit) ?? cat.units[0];
  const toU = cat.units.find(u => u.id === toUnit) ?? cat.units[1];

  const result = useMemo(() => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    const base = fromU.toBase(num);
    const converted = toU.fromBase(base);
    // Format nicely
    if (Math.abs(converted) < 0.0001 || Math.abs(converted) > 1e9) {
      return converted.toExponential(6);
    }
    const str = converted.toPrecision(10).replace(/\.?0+$/, '');
    return str;
  }, [value, fromU, toU]);

  const swap = () => { setFromUnit(toUnit); setToUnit(fromUnit); };

  const onCatChange = (idx: number) => {
    setCatIdx(idx);
    setFromUnit(UNIT_CATEGORIES[idx].units[0].id);
    setToUnit(UNIT_CATEGORIES[idx].units[1].id);
  };

  // All-to-all table
  const allConversions = useMemo(() => {
    const num = parseFloat(value);
    if (isNaN(num)) return [];
    const base = fromU.toBase(num);
    return cat.units.map(u => ({
      id: u.id,
      label: u.label,
      val: u.fromBase(base),
    }));
  }, [value, fromU, cat]);

  return (
    <div className="units-shell">
      {/* Category tabs */}
      <div className="units-cats">
        {UNIT_CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            className={`units-cat${catIdx === i ? ' active' : ''}`}
            onClick={() => onCatChange(i)}
          >{c.label}</button>
        ))}
      </div>

      <div className="units-body">
        {/* Main converter */}
        <div className="units-converter">
          <div className="units-row">
            <div className="units-field">
              <label className="units-label">From</label>
              <select className="units-select" value={fromUnit} onChange={e => setFromUnit(e.target.value)}>
                {cat.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
              <input
                className="units-input"
                type="number"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Enter value"
              />
            </div>

            <button className="units-swap" onClick={swap} title="Swap">⇄</button>

            <div className="units-field">
              <label className="units-label">To</label>
              <select className="units-select" value={toUnit} onChange={e => setToUnit(e.target.value)}>
                {cat.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
              <div className="units-result">{result || '—'}</div>
            </div>
          </div>

          {result && (
            <div className="units-formula">
              {value} {fromU.label} = <strong>{result}</strong> {toU.label}
            </div>
          )}
        </div>

        {/* All conversions */}
        <div className="units-all">
          <div className="units-all-title">All {cat.label} Conversions from {value} {fromU.label}</div>
          <div className="units-all-grid">
            {allConversions.map(c => {
              const isCurrent = c.id === fromUnit;
              const num = c.val;
              const formatted = isNaN(num) ? '—' : (Math.abs(num) < 0.0001 || Math.abs(num) > 1e9)
                ? num.toExponential(4)
                : num.toPrecision(8).replace(/\.?0+$/, '');
              return (
                <button
                  key={c.id}
                  className={`units-all-card${isCurrent ? ' current' : ''}`}
                  onClick={() => { setToUnit(c.id); }}
                >
                  <div className="units-all-val">{formatted}</div>
                  <div className="units-all-lbl">{c.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .units-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
        .units-cats {
          display: flex; flex-wrap: wrap; gap: 4px;
          padding: 12px 16px; border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated); flex-shrink: 0;
        }
        .units-cat {
          padding: 6px 14px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.12s;
        }
        .units-cat.active { background: var(--primary); color: white; border-color: var(--primary); }
        .units-cat:hover:not(.active) { border-color: var(--primary); color: var(--primary); }
        .units-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
        .units-converter {
          background: var(--bg-elevated); border: 1px solid var(--border-subtle);
          border-radius: 16px; padding: 20px;
        }
        .units-row { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
        .units-field { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 200px; }
        .units-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .units-select {
          padding: 10px 12px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-primary); font-size: 14px; outline: none;
        }
        .units-select:focus { border-color: var(--primary); }
        .units-input {
          padding: 12px 16px; border-radius: 10px; border: 2px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-primary); font-size: 18px;
          font-weight: 600; outline: none; transition: border-color 0.15s;
        }
        .units-input:focus { border-color: var(--primary); }
        .units-result {
          padding: 12px 16px; border-radius: 10px;
          background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface));
          border: 2px solid var(--primary);
          font-size: 18px; font-weight: 700; color: var(--primary); min-height: 50px;
          display: flex; align-items: center;
        }
        .units-swap {
          width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 20px; cursor: pointer; flex-shrink: 0; margin-bottom: 2px;
          display: flex; align-items: center; justify-content: center; transition: all 0.15s;
        }
        .units-swap:hover { border-color: var(--primary); color: var(--primary); transform: rotate(180deg); }
        .units-formula {
          margin-top: 14px; padding: 10px 14px; border-radius: 10px;
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          font-size: 14px; color: var(--text-secondary); text-align: center;
        }
        .units-formula strong { color: var(--primary); }
        .units-all { }
        .units-all-title {
          font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 12px;
        }
        .units-all-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
        .units-all-card {
          padding: 14px; border-radius: 12px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-elevated); cursor: pointer; text-align: center;
          transition: all 0.12s;
        }
        .units-all-card:hover { border-color: var(--primary); }
        .units-all-card.current {
          border-color: var(--primary);
          background: color-mix(in srgb, var(--primary) 8%, var(--bg-elevated));
        }
        .units-all-val { font-size: 16px; font-weight: 700; color: var(--text-primary); font-family: monospace; margin-bottom: 4px; }
        .units-all-lbl { font-size: 11px; color: var(--text-muted); }
      `}</style>
    </div>
  );
}

// ─── Solver Panel ─────────────────────────────────────────────────────────

function SolverPanel({ onGraphExpr }: { onGraphExpr: (expr: string) => void }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<SolverResult | null>(null);
  const [history, setHistory] = useState<{ input: string; result: SolverResult }[]>([]);
  const [activeCategory, setActiveCategory] = useState('algebra');
  const [loading, setLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [graphExpr, setGraphExpr] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const categories = Object.keys(EXAMPLE_PROBLEMS);

  const handleOCR = useCallback(async (file: File) => {
    setOcrLoading(true);
    setOcrError('');
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/math-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
        signal: AbortSignal.timeout(35_000),
      });
      const data = await response.json();
      if (data.expression) {
        setInput(data.expression);
        inputRef.current?.focus();
      } else {
        setOcrError(data.error ?? 'Could not read expression. Make sure a vision model is installed.');
      }
    } catch {
      setOcrError('OCR request failed. Check that Ollama is running with a vision model.');
    } finally {
      setOcrLoading(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  }, []);

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

    const solverResult = solve(problem);
    setResult(solverResult);
    setLoading(false);

    const newHistory = [{ input: problem, result: solverResult }, ...history.filter(h => h.input !== problem)];
    setHistory(newHistory);
    saveHistory(newHistory);

    const cleanExpr = problem.replace(/d\/dx|derivative of|simplify|expand|solve/gi, '').replace(/=\s*0$/, '').trim();
    if (/x/.test(cleanExpr) && !cleanExpr.includes('[')) {
      setGraphExpr(cleanExpr);
    }

    setAiFeedbackLoading(true);
    const feedback = await verifyWithAI(problem, solverResult.answer);
    setAiFeedback(feedback);
    setAiFeedbackLoading(false);
  }, [input, history, saveHistory]);

  const currentExamples = useMemo(() => EXAMPLE_PROBLEMS[activeCategory]?.examples ?? [], [activeCategory]);

  return (
    <div className="ms-shell">
      <div className="ms-body">
        {/* Left */}
        <div className="ms-left">
          <div className="ms-input-card">
            <div className="ms-input-label">Enter a math expression</div>
            <div className="ms-input-row">
              <input
                ref={inputRef}
                className="ms-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSolve()}
                placeholder="e.g. d/dx(x^3 + 2*x) or integrate x^2 or limit x->0 of sin(x)/x"
                spellCheck={false}
                autoFocus
              />
              {/* OCR photo button */}
              <button
                className={`ms-ocr-btn${ocrLoading ? ' loading' : ''}`}
                onClick={() => ocrInputRef.current?.click()}
                disabled={ocrLoading}
                title="Photograph a math problem (requires Ollama vision model)"
              >
                {ocrLoading ? '⟳' : '📷'}
              </button>
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleOCR(f); }}
              />
              <button className="ms-solve-btn" onClick={() => handleSolve()} disabled={loading || !input.trim()}>
                {loading ? '⟳' : '='}
              </button>
            </div>
            {ocrError && (
              <div className="ms-ocr-error">{ocrError}</div>
            )}
            {input.trim() && (
              <div className="ms-preview">
                <span className="ms-preview-label">Preview</span>
                <div className="ms-preview-latex">
                  <KaTeX latex={safeLatex(input)} display />
                </div>
              </div>
            )}
            <div className="ms-shortcuts">
              {['d/dx(', 'integrate ', 'limit x->0 of ', 'series ', 'simplify ', 'expand ', 'solve ', 'det('].map(s => (
                <button key={s} className="ms-shortcut" onClick={() => setInput(p => s + p)}>
                  {s.trim() || s}
                </button>
              ))}
            </div>
          </div>

          <div className="ms-examples-card">
            <div className="ms-cat-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`ms-cat-tab${activeCategory === cat ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >{EXAMPLE_PROBLEMS[cat].label}</button>
              ))}
            </div>
            <div className="ms-examples">
              {currentExamples.map((ex, i) => (
                <button key={i} className="ms-example" onClick={() => { setInput(ex.expr); inputRef.current?.focus(); }}>
                  <div className="ms-example-code">{ex.expr}</div>
                  <div className="ms-example-desc">{ex.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
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
                  <button className="ms-act-btn" onClick={() => navigator.clipboard.writeText(result.answerLatex).catch(() => {})}>LaTeX</button>
                  <button className="ms-act-btn" onClick={() => navigator.clipboard.writeText(result.answer).catch(() => {})}>Text</button>
                  {graphExpr && (
                    <button className="ms-act-btn ms-act-graph" onClick={() => onGraphExpr(graphExpr)}>
                      📈 Plot on Graph
                    </button>
                  )}
                </div>
              </div>

              <div className="ms-steps">
                <div className="ms-steps-title">Step-by-step solution</div>
                {result.steps.map((step, i) => (
                  <div key={i} className="ms-step">
                    <div className="ms-step-num">{step.step}</div>
                    <div className="ms-step-body">
                      <div className="ms-step-desc">{step.description}</div>
                      <div className="ms-step-expr"><KaTeX latex={step.expression} display /></div>
                      <div className="ms-step-expl">{step.explanation}</div>
                    </div>
                  </div>
                ))}
              </div>

              {(aiFeedback || aiFeedbackLoading) && (
                <div className="ms-ai-card">
                  <div className="ms-ai-header">
                    <span>🤖 AI Verification</span>
                    {aiFeedbackLoading && <span className="ms-ai-loading">Checking…</span>}
                  </div>
                  {aiFeedback && <div className="ms-ai-feedback">{aiFeedback}</div>}
                </div>
              )}

              {result.error && (
                <div className="ms-error"><strong>Note:</strong> {result.error}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* History */}
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
              <button key={i} className="ms-hist-item" onClick={() => { setInput(item.input); setResult(item.result); setShowHistory(false); }}>
                <div className="ms-hist-input">{item.input}</div>
                <div className="ms-hist-answer">{item.result.answer}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ms-hist-fab">
        <button className={`ms-hist-btn${showHistory ? ' active' : ''}`} onClick={() => setShowHistory(s => !s)}>
          🕑 History ({history.length})
        </button>
      </div>

      <style jsx>{`
        .ms-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; position: relative; }
        .ms-body { display: grid; grid-template-columns: 380px minmax(0,1fr); flex: 1; overflow: hidden; }
        .ms-left { display: flex; flex-direction: column; border-right: 1px solid var(--border-subtle); overflow-y: auto; background: var(--bg-elevated); }
        .ms-right { overflow-y: auto; padding: 20px; }
        .ms-input-card { padding: 18px; border-bottom: 1px solid var(--border-subtle); }
        .ms-input-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 10px; }
        .ms-input-row { display: flex; gap: 8px; }
        .ms-input { flex: 1; padding: 12px 14px; border-radius: 12px; border: 2px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); font-size: 14px; font-family: monospace; transition: border-color 0.15s; outline: none; }
        .ms-input:focus { border-color: var(--primary); }
        .ms-solve-btn { width: 46px; height: 46px; border-radius: 12px; background: var(--primary); color: white; border: none; font-size: 20px; font-weight: 700; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: opacity 0.15s; }
        .ms-solve-btn:hover:not(:disabled) { opacity: 0.85; }
        .ms-solve-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ms-ocr-btn { width: 46px; height: 46px; border-radius: 12px; background: var(--bg-surface); border: 1.5px solid var(--border-subtle); font-size: 18px; cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .ms-ocr-btn:hover:not(:disabled) { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg-surface)); }
        .ms-ocr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ms-ocr-btn.loading { animation: spin 0.8s linear infinite; }
        .ms-ocr-error { font-size: 11px; color: #ef4444; padding: 5px 2px; margin-top: 4px; line-height: 1.4; }
        .ms-preview { margin-top: 10px; padding: 8px 12px; background: var(--bg-surface); border-radius: 10px; border: 1px solid var(--border-subtle); overflow-x: auto; }
        .ms-preview-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 4px; }
        .ms-preview-latex { display: flex; justify-content: center; padding: 4px 0; }
        .ms-shortcuts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
        .ms-shortcut { padding: 3px 9px; border-radius: 7px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; font-family: monospace; cursor: pointer; transition: all 0.1s; }
        .ms-shortcut:hover { border-color: var(--primary); color: var(--primary); }
        .ms-examples-card { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .ms-cat-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 10px 12px 8px; background: var(--bg-elevated); border-bottom: 1px solid var(--border-subtle); position: sticky; top: 0; z-index: 1; }
        .ms-cat-tab { padding: 4px 10px; border-radius: 8px; border: none; background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.1s; }
        .ms-cat-tab.active { background: var(--primary); color: white; }
        .ms-cat-tab:hover:not(.active) { color: var(--text-primary); background: var(--bg-surface); }
        .ms-examples { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; }
        .ms-example { text-align: left; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--border-subtle); background: var(--bg-surface); cursor: pointer; transition: all 0.1s; }
        .ms-example:hover { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, var(--bg-surface)); }
        .ms-example-code { font-size: 12px; font-family: monospace; color: var(--text-primary); font-weight: 500; }
        .ms-example-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .ms-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); text-align: center; gap: 8px; }
        .ms-empty-icon { font-size: 60px; opacity: 0.2; }
        .ms-empty p { margin: 0; font-size: 14px; }
        .ms-empty-hint { font-size: 12px !important; }
        .ms-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px; color: var(--text-muted); }
        .ms-spinner { width: 32px; height: 32px; border: 3px solid var(--border-subtle); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ms-solution { display: flex; flex-direction: column; gap: 14px; }
        .ms-answer-bar { padding: 18px; border-radius: 14px; border: 2px solid var(--primary); background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated)); box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 15%, transparent); }
        .ms-answer-bar.unverified { border-color: #f59e0b; background: color-mix(in srgb, #f59e0b 6%, var(--bg-elevated)); box-shadow: 0 4px 20px color-mix(in srgb, #f59e0b 15%, transparent); }
        .ms-answer-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .ms-answer-type { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); padding: 2px 8px; border-radius: 6px; }
        .ms-verified { font-size: 12px; color: #52b788; }
        .ms-unverified { font-size: 12px; color: #f59e0b; }
        .ms-answer-latex { display: flex; justify-content: center; padding: 10px 0; font-size: 1.15em; overflow-x: auto; }
        .ms-answer-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .ms-act-btn { padding: 5px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.1s; }
        .ms-act-btn:hover { border-color: var(--primary); color: var(--primary); }
        .ms-act-graph { background: color-mix(in srgb, var(--primary) 10%, var(--bg-surface)) !important; border-color: var(--primary) !important; color: var(--primary) !important; font-weight: 600 !important; }
        .ms-steps { background: var(--bg-elevated); border-radius: 14px; border: 1px solid var(--border-subtle); overflow: hidden; }
        .ms-steps-title { padding: 12px 18px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); border-bottom: 1px solid var(--border-subtle); background: var(--bg-surface); }
        .ms-step { display: flex; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); }
        .ms-step:last-child { border-bottom: none; }
        .ms-step-num { width: 26px; height: 26px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 2px; }
        .ms-step-body { flex: 1; min-width: 0; }
        .ms-step-desc { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
        .ms-step-expr { padding: 7px 10px; background: var(--bg-surface); border-radius: 9px; border: 1px solid var(--border-subtle); overflow-x: auto; display: flex; justify-content: center; margin-bottom: 6px; }
        .ms-step-expl { font-size: 12px; color: var(--text-muted); line-height: 1.6; }
        .ms-ai-card { background: color-mix(in srgb, #a78bfa 8%, var(--bg-elevated)); border: 1px solid color-mix(in srgb, #a78bfa 30%, var(--border-subtle)); border-radius: 14px; padding: 14px; }
        .ms-ai-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 600; font-size: 14px; }
        .ms-ai-loading { font-size: 12px; color: var(--text-muted); animation: pulse 1s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .ms-ai-feedback { font-size: 13px; color: var(--text-secondary); line-height: 1.7; }
        .ms-error { padding: 10px 14px; border-radius: 9px; background: color-mix(in srgb, #e05252 8%, var(--bg-elevated)); border: 1px solid color-mix(in srgb, #e05252 30%, var(--border-subtle)); font-size: 12px; color: var(--text-secondary); }
        .ms-history-panel { position: absolute; top: 0; right: 0; width: 320px; height: 100%; background: var(--bg-elevated); border-left: 1px solid var(--border-subtle); display: flex; flex-direction: column; z-index: 50; box-shadow: -4px 0 24px rgba(0,0,0,0.15); animation: slideRight 0.2s ease; }
        @keyframes slideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .ms-hist-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); }
        .ms-hist-header h3 { margin: 0; flex: 1; font-size: 15px; }
        .ms-hist-clear { font-size: 11px; color: var(--text-muted); cursor: pointer; background: none; border: none; padding: 3px 7px; }
        .ms-hist-clear:hover { color: #e05252; }
        .ms-hist-close { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border-subtle); background: var(--bg-surface); cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; font-size: 12px; }
        .ms-hist-list { flex: 1; overflow-y: auto; padding: 8px; }
        .ms-hist-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 28px 0; }
        .ms-hist-item { width: 100%; text-align: left; padding: 9px 11px; border-radius: 9px; border: 1px solid var(--border-subtle); background: var(--bg-surface); cursor: pointer; margin-bottom: 5px; transition: all 0.1s; }
        .ms-hist-item:hover { border-color: var(--primary); }
        .ms-hist-input { font-size: 12px; font-family: monospace; color: var(--text-primary); font-weight: 500; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ms-hist-answer { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ms-hist-fab { position: absolute; top: 12px; right: 12px; z-index: 10; }
        .ms-hist-btn { padding: 7px 13px; border-radius: 10px; border: 1.5px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.12s; backdrop-filter: blur(4px); }
        .ms-hist-btn:hover, .ms-hist-btn.active { border-color: var(--primary); color: var(--primary); }
        @media (max-width: 900px) {
          .ms-body { grid-template-columns: 1fr; }
          .ms-left { border-right: none; border-bottom: 1px solid var(--border-subtle); max-height: 50vh; }
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

  const TABS: { id: MainTab; label: string; icon: string; hint?: string }[] = [
    { id: 'solver', label: 'Solver', icon: '∑', hint: 'Solve symbolic and numeric problems' },
    { id: 'graph', label: 'Graph', icon: '📈', hint: 'Plot functions and inspect derivatives' },
    { id: 'units', label: 'Units', icon: '⚖️', hint: 'Convert physics and engineering units' },
    { id: 'lab', label: 'MATLAB Flow', icon: '⌘', hint: 'Matrix-first workspace and MATLAB-style commands' },
  ];

  return (
    <div className="math-root">
      {/* Top header */}
      <div className="math-header">
        <div className="math-brand">
          <span className="math-brand-icon">∑</span>
          <div>
            <h1>Math</h1>
            <p>Symbolic solver · Graphing · Unit converter</p>
          </div>
        </div>
        <div className="math-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`math-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="math-tab-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="math-body">
        <aside className="math-sidebar">
          <div className="math-sidebar-section">
            <div className="math-sidebar-label">Workflows</div>
            <div className="math-sidebar-list">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`math-side-item${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="math-side-icon">{tab.icon}</span>
                  <span className="math-side-copy">
                    <strong>{tab.label}</strong>
                    {tab.hint ? <small>{tab.hint}</small> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="math-sidebar-section">
            <div className="math-sidebar-label">References</div>
            <a className="math-ref-card" href="https://www.wolframalpha.com/" target="_blank" rel="noreferrer">
              <span className="math-ref-icon">W</span>
              <span className="math-side-copy">
                <strong>Wolfram Alpha</strong>
                <small>Cross-check exact symbolic results and edge cases.</small>
              </span>
            </a>
            <Link className="math-ref-card" href="/workspace">
              <span className="math-ref-icon">⌘</span>
              <span className="math-side-copy">
                <strong>Workspace + Files</strong>
                <small>Bring math results back into notes, assignments, and study tools.</small>
              </span>
            </Link>
          </div>
        </aside>

        {/* Tab content */}
        <div className="math-content">
          {activeTab === 'solver' && <SolverPanel onGraphExpr={handleGraphExpr} />}
          {activeTab === 'graph' && <GraphPanel initialExpr={graphExprFromSolver} />}
          {activeTab === 'units' && <UnitsPanel />}
          {activeTab === 'lab' && <MatlabLab onGraphExpression={handleGraphExpr} />}
        </div>
      </div>

      <style jsx>{`
        .math-root {
          display: flex; flex-direction: column;
          height: calc(100dvh - 40px); overflow: hidden;
          background: var(--bg-surface);
        }
        .math-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 24px; border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated); flex-shrink: 0; gap: 16px;
        }
        .math-brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
        .math-brand-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 60%, #a78bfa));
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; color: white; font-weight: 700; flex-shrink: 0;
        }
        .math-brand h1 { margin: 0; font-size: 18px; font-weight: 700; }
        .math-brand p { margin: 1px 0 0; font-size: 11px; color: var(--text-muted); }
        .math-tabs {
          display: flex; gap: 4px; background: var(--bg-surface);
          border-radius: 12px; padding: 4px; border: 1px solid var(--border-subtle);
        }
        .math-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 18px; border-radius: 9px; border: none;
          background: transparent; color: var(--text-muted);
          font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.15s;
        }
        .math-tab:hover { color: var(--text-primary); background: var(--bg-elevated); }
        .math-tab.active {
          background: var(--primary); color: white;
          box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 35%, transparent);
        }
        .math-tab-icon { font-size: 16px; }
        .math-body { flex: 1; display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 0; }
        .math-sidebar { padding: 18px; border-right: 1px solid var(--border-subtle); background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, transparent), color-mix(in srgb, var(--bg-surface) 96%, transparent)); overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
        .math-sidebar-section { display: flex; flex-direction: column; gap: 10px; }
        .math-sidebar-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .math-sidebar-list { display: flex; flex-direction: column; gap: 8px; }
        .math-side-item, .math-ref-card { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-elevated) 88%, transparent); color: var(--text-primary); text-align: left; text-decoration: none; transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease; }
        .math-side-item { cursor: pointer; width: 100%; }
        .math-side-item:hover, .math-ref-card:hover { border-color: color-mix(in srgb, var(--primary) 45%, var(--border-subtle)); transform: translateY(-1px); }
        .math-side-item.active { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--bg-elevated)); box-shadow: 0 8px 20px color-mix(in srgb, var(--primary) 16%, transparent); }
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
