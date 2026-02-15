'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

interface Expression {
  id: string;
  fn: string;
  color: string;
}

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2', '#65a30d'];

const PRESETS = [
  { label: 'Parabola', fn: 'x^2' },
  { label: 'Sine Wave', fn: 'sin(x)' },
  { label: 'Cosine', fn: 'cos(x)' },
  { label: 'Cubic', fn: 'x^3 - 3*x' },
  { label: 'Exponential', fn: '2^x' },
  { label: 'Absolute', fn: 'abs(x)' },
  { label: 'Tangent', fn: 'tan(x)' },
  { label: 'Log', fn: 'log(x)' },
];

interface GraphingCalculatorProps {
  initialExpression?: string;
}

export function GraphingCalculator({ initialExpression }: GraphingCalculatorProps) {
  const { t } = useI18n({
    'Parabola': 'قطع مكافئ',
    'Sine Wave': 'موجة جيب',
    'Cosine': 'جيب التمام',
    'Cubic': 'تكعيبي',
    'Exponential': 'أسي',
    'Absolute': 'قيمة مطلقة',
    'Tangent': 'ظل',
    'Log': 'لوغاريتم',
    'Invalid expression': 'تعبير غير صالح',
    'Graphing Calculator': 'آلة الرسم البياني',
    'Plot and visualize mathematical functions': 'ارسم الدوال الرياضية بصريًا.',
    'Quick add:': 'إضافة سريعة:',
    'e.g. x^2, sin(x), 2*x + 1': 'مثال: x^2, sin(x), 2*x + 1',
    'Add expression': 'إضافة تعبير',
    'Zoom in': 'تكبير',
    'Zoom out': 'تصغير',
    'Reset view': 'إعادة العرض',
    'Reset': 'إعادة ضبط',
    'Grid': 'الشبكة',
    'to': 'إلى',
    'Supports: x^2, sin(x), cos(x), tan(x), sqrt(x), abs(x), log(x), exp(x), pi, e. Use * for multiplication. Drag to pan, scroll to zoom.': 'يدعم: x^2, sin(x), cos(x), tan(x), sqrt(x), abs(x), log(x), exp(x), pi, e. استخدم * للضرب. اسحب للتحريك واستخدم عجلة الفأرة للتكبير.',
  });
  const graphRef = useRef<HTMLDivElement>(null);
  const [expressions, setExpressions] = useState<Expression[]>([
    { id: '1', fn: initialExpression || 'x^2', color: COLORS[0] },
  ]);
  const [error, setError] = useState('');
  const [xDomain, setXDomain] = useState<[number, number]>([-10, 10]);
  const [yDomain, setYDomain] = useState<[number, number]>([-10, 10]);
  const [showGrid, setShowGrid] = useState(true);
  const functionPlotRef = useRef<typeof import('function-plot').default | null>(null);

  const renderGraph = useCallback(() => {
    if (!graphRef.current || !functionPlotRef.current) return;

    const validExpressions = expressions.filter(e => e.fn.trim());
    if (validExpressions.length === 0) return;

    try {
      setError('');
      // Clear previous
      graphRef.current.innerHTML = '';

      const width = graphRef.current.clientWidth;
      const height = Math.min(width * 0.75, 500);

      functionPlotRef.current({
        target: graphRef.current,
        width,
        height,
        xAxis: { domain: xDomain, label: 'x' },
        yAxis: { domain: yDomain, label: 'y' },
        grid: showGrid,
        data: validExpressions.map(expr => ({
          fn: expr.fn,
          color: expr.color,
          graphType: 'polyline' as const,
        })),
        tip: {
          xLine: true,
          yLine: true,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Invalid expression'));
    }
  }, [expressions, xDomain, yDomain, showGrid]);

  // Load function-plot dynamically (it uses d3 which needs DOM)
  useEffect(() => {
    import('function-plot').then((mod) => {
      functionPlotRef.current = mod.default;
      renderGraph();
    });
  }, [renderGraph]);

  useEffect(() => {
    renderGraph();
  }, [renderGraph]);

  // Re-render on resize
  useEffect(() => {
    const handleResize = () => {
      renderGraph();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderGraph]);

  // Update initial expression if prop changes
  useEffect(() => {
    if (initialExpression) {
      setExpressions(prev => {
        const updated = [...prev];
        if (updated.length > 0) {
          updated[0] = { ...updated[0], fn: initialExpression };
        }
        return updated;
      });
    }
  }, [initialExpression]);

  const addExpression = () => {
    const colorIndex = expressions.length % COLORS.length;
    setExpressions([
      ...expressions,
      { id: Date.now().toString(), fn: '', color: COLORS[colorIndex] },
    ]);
  };

  const removeExpression = (id: string) => {
    if (expressions.length <= 1) return;
    setExpressions(expressions.filter(e => e.id !== id));
  };

  const updateExpression = (id: string, fn: string) => {
    setExpressions(expressions.map(e => e.id === id ? { ...e, fn } : e));
  };

  const handlePreset = (fn: string) => {
    const emptyExpr = expressions.find(e => !e.fn.trim());
    if (emptyExpr) {
      updateExpression(emptyExpr.id, fn);
    } else {
      const colorIndex = expressions.length % COLORS.length;
      setExpressions([
        ...expressions,
        { id: Date.now().toString(), fn, color: COLORS[colorIndex] },
      ]);
    }
  };

  const resetView = () => {
    setXDomain([-10, 10]);
    setYDomain([-10, 10]);
  };

  const zoomIn = () => {
    setXDomain([xDomain[0] * 0.7, xDomain[1] * 0.7]);
    setYDomain([yDomain[0] * 0.7, yDomain[1] * 0.7]);
  };

  const zoomOut = () => {
    setXDomain([xDomain[0] * 1.4, xDomain[1] * 1.4]);
    setYDomain([yDomain[0] * 1.4, yDomain[1] * 1.4]);
  };

  return (
    <div className="graphing-calc">
      {/* Header */}
      <div className="graph-header">
        <div>
          <h3>{t('Graphing Calculator')}</h3>
          <p>{t('Plot and visualize mathematical functions')}</p>
        </div>
      </div>

      {/* Presets */}
      <div className="presets">
        <label>{t('Quick add:')}</label>
        <div className="preset-btns">
          {PRESETS.map(p => (
            <button key={p.label} className="preset-btn" onClick={() => handlePreset(p.fn)}>
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>

      {/* Expression Inputs */}
      <div className="expr-list">
        {expressions.map((expr, i) => (
          <div key={expr.id} className="expr-row">
            <div className="expr-color" style={{ background: expr.color }} />
            <span className="expr-label">y{expressions.length > 1 ? i + 1 : ''} =</span>
            <input
              type="text"
              value={expr.fn}
              onChange={(e) => updateExpression(expr.id, e.target.value)}
              placeholder={t('e.g. x^2, sin(x), 2*x + 1')}
              className="expr-input"
            />
            {expressions.length > 1 && (
              <button className="expr-remove" onClick={() => removeExpression(expr.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="add-expr-btn" onClick={addExpression}>
          + {t('Add expression')}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="graph-error">
          {error}
        </div>
      )}

      {/* Graph Controls */}
      <div className="graph-controls">
        <div className="zoom-btns">
          <button className="ctrl-btn" onClick={zoomIn} title={t('Zoom in')}>+</button>
          <button className="ctrl-btn" onClick={zoomOut} title={t('Zoom out')}>-</button>
          <button className="ctrl-btn" onClick={resetView} title={t('Reset view')}>{t('Reset')}</button>
        </div>
        <label className="grid-toggle">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          {t('Grid')}
        </label>
      </div>

      {/* Domain Controls */}
      <div className="domain-controls">
        <div className="domain-row">
          <label>X:</label>
          <input
            type="number"
            value={xDomain[0]}
            onChange={(e) => setXDomain([Number(e.target.value), xDomain[1]])}
            className="domain-input"
          />
          <span>{t('to')}</span>
          <input
            type="number"
            value={xDomain[1]}
            onChange={(e) => setXDomain([xDomain[0], Number(e.target.value)])}
            className="domain-input"
          />
        </div>
        <div className="domain-row">
          <label>Y:</label>
          <input
            type="number"
            value={yDomain[0]}
            onChange={(e) => setYDomain([Number(e.target.value), yDomain[1]])}
            className="domain-input"
          />
          <span>{t('to')}</span>
          <input
            type="number"
            value={yDomain[1]}
            onChange={(e) => setYDomain([yDomain[0], Number(e.target.value)])}
            className="domain-input"
          />
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="graph-container" ref={graphRef} />

      {/* Help text */}
      <p className="graph-help">
        {t('Supports: x^2, sin(x), cos(x), tan(x), sqrt(x), abs(x), log(x), exp(x), pi, e. Use * for multiplication. Drag to pan, scroll to zoom.')}
      </p>

      <style jsx>{`
        .graphing-calc {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .graph-header h3 {
          margin-bottom: var(--space-1);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .graph-header p {
          font-size: var(--font-meta);
          color: var(--text-muted);
          margin: 0;
        }

        .presets label {
          font-size: var(--font-meta);
          color: var(--text-muted);
          display: block;
          margin-bottom: var(--space-2);
        }

        .preset-btns {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .preset-btn {
          padding: var(--space-1) var(--space-3);
          border: 1px solid var(--border-subtle);
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          cursor: pointer;
          transition: all 0.15s;
        }

        .preset-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
        }

        .expr-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .expr-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .expr-color {
          width: 12px;
          height: 12px;
          border-radius: var(--radius-full);
          flex-shrink: 0;
        }

        .expr-label {
          font-size: var(--font-meta);
          font-weight: 600;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .expr-input {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          font-family: var(--font-mono, monospace);
          background: var(--bg-base);
        }

        .expr-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-muted);
        }

        .expr-remove {
          width: 28px;
          height: 28px;
          border: none;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 12px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .expr-remove:hover {
          background: var(--error-muted);
          color: var(--error);
        }

        .add-expr-btn {
          padding: var(--space-2);
          border: 1px dashed var(--border-subtle);
          background: transparent;
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }

        .add-expr-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
        }

        .graph-error {
          padding: var(--space-3);
          background: var(--error-muted);
          color: var(--error);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
        }

        .graph-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .zoom-btns {
          display: flex;
          gap: var(--space-1);
        }

        .ctrl-btn {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-subtle);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          font-weight: 600;
          cursor: pointer;
          min-width: 36px;
          min-height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ctrl-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--primary);
        }

        .grid-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-meta);
          color: var(--text-secondary);
          cursor: pointer;
        }

        .grid-toggle input {
          width: auto;
        }

        .domain-controls {
          display: flex;
          gap: var(--space-4);
          flex-wrap: wrap;
        }

        .domain-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }

        .domain-row label {
          font-weight: 600;
          min-width: 16px;
        }

        .domain-input {
          width: 70px;
          padding: var(--space-1) var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
          text-align: center;
          background: var(--bg-base);
        }

        .domain-input:focus {
          outline: none;
          border-color: var(--primary);
        }

        .graph-container {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--bg-surface);
          min-height: 300px;
        }

        .graph-container :global(svg) {
          display: block;
          width: 100% !important;
        }

        .graph-container :global(.x.axis text),
        .graph-container :global(.y.axis text) {
          font-size: 11px;
          fill: var(--text-muted);
        }

        .graph-container :global(.x.axis line),
        .graph-container :global(.y.axis line),
        .graph-container :global(.x.axis path),
        .graph-container :global(.y.axis path) {
          stroke: var(--border-default);
        }

        .graph-help {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          line-height: 1.4;
          margin: 0;
        }

        @media (max-width: 600px) {
          .preset-btns {
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: var(--space-1);
          }

          .preset-btns::-webkit-scrollbar {
            display: none;
          }

          .preset-btn {
            flex-shrink: 0;
          }

          .domain-controls {
            flex-direction: column;
            gap: var(--space-2);
          }

          .graph-container {
            min-height: 250px;
          }
        }
      `}</style>
    </div>
  );
}
