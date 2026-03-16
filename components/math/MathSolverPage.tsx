'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as math from 'mathjs';
import { MathRenderer } from '@/components/math/MathRenderer';
import { MatlabLab } from '@/components/tools/MatlabLab';
import { MATH_CATEGORIES, MATH_CATEGORY_ORDER, MATH_SYMBOL_GROUPS } from '@/lib/math/catalog';
import { clearMathContext, readMathContext, writeMathContext } from '@/lib/math/context';
import type { MathCategoryId, MathContext, MathSolveRequest, SolverResult } from '@/lib/math/types';
import { useToast } from '@/providers/ToastProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const functionPlot = typeof window !== 'undefined' ? require('function-plot') : null;

type MathTab = 'solver' | 'graph' | 'units' | 'lab';

type GraphExpression = {
  id: string;
  expr: string;
  color: string;
  enabled: boolean;
};

type RecentMathItem = {
  id: string;
  problem: string;
  answer: string;
  category: MathCategoryId;
  createdAt: string;
};

type RecentWorkspaceFile = {
  id: string;
  name: string;
  content?: string | null;
  folderId?: string | null;
  topicId?: string | null;
};

const GRAPH_COLORS = ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#7c3aed', '#0891b2'];
const HISTORY_KEY = 'kivora_math_history';
const TAB_LABELS: Record<MathTab, string> = {
  solver: 'Solver',
  graph: 'Graph',
  units: 'Units',
  lab: 'MATLAB Flow',
};

const UNIT_GROUPS = [
  {
    id: 'length',
    label: 'Length',
    units: [
      { id: 'm', label: 'Meters' },
      { id: 'cm', label: 'Centimeters' },
      { id: 'km', label: 'Kilometers' },
      { id: 'in', label: 'Inches' },
      { id: 'ft', label: 'Feet' },
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    units: [
      { id: 'kg', label: 'Kilograms' },
      { id: 'g', label: 'Grams' },
      { id: 'mg', label: 'Milligrams' },
      { id: 'lb', label: 'Pounds' },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    units: [
      { id: 'degC', label: 'Celsius' },
      { id: 'degF', label: 'Fahrenheit' },
      { id: 'K', label: 'Kelvin' },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    units: [
      { id: 'm / s', label: 'm/s' },
      { id: 'km / h', label: 'km/h' },
      { id: 'mph', label: 'mph' },
    ],
  },
] as const;

function getStoredHistory(): RecentMathItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentMathItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredHistory(items: RecentMathItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 8)));
}

function insertAtCaret(textarea: HTMLTextAreaElement | null, current: string, insert: string) {
  if (!textarea) return { value: `${current}${insert}`, caret: current.length + insert.length };
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? start;
  const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
  const anchor = insert.indexOf('()');
  const caret = anchor >= 0 ? start + anchor + 1 : start + insert.length;
  return { value: next, caret };
}

function normalizeGraphExpression(expr: string) {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(/^y\s*=\s*(.+)$/i);
  if (explicit) {
    return { type: 'function' as const, value: explicit[1].trim() };
  }

  const vertical = trimmed.match(/^x\s*=\s*(.+)$/i);
  if (vertical) {
    return { type: 'implicit' as const, value: `x - (${vertical[1].trim()})` };
  }

  if (trimmed.includes('=')) {
    const [lhs, rhs] = trimmed.split('=').map((part) => part.trim());
    if (!lhs || !rhs) return null;
    return { type: 'implicit' as const, value: `(${lhs}) - (${rhs})` };
  }

  return { type: 'function' as const, value: trimmed };
}

function isExplicitExpression(expr: string) {
  return normalizeGraphExpression(expr)?.type === 'function';
}

function buildValueTable(expr: string, xDomain: [number, number]) {
  const normalized = normalizeGraphExpression(expr);
  if (!normalized || normalized.type !== 'function') return [] as Array<{ x: string; y: string }>;

  const xs = Array.from({ length: 6 }, (_, index) => xDomain[0] + ((xDomain[1] - xDomain[0]) * index) / 5);
  return xs.map((x) => {
    try {
      const value = math.evaluate(normalized.value, { x });
      return {
        x: Number(x.toFixed(2)).toString(),
        y: typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(4)).toString() : '—',
      };
    } catch {
      return { x: Number(x.toFixed(2)).toString(), y: '—' };
    }
  });
}

function getThemePalette() {
  if (typeof document === 'undefined') {
    return {
      dark: false,
      background: '#ffffff',
      grid: '#d7e1ec',
      axis: '#0f172a',
      text: '#0f172a',
    };
  }

  const theme = document.documentElement.getAttribute('data-theme') ?? '';
  const dark = theme === 'black' || theme === 'dark';
  return dark
    ? { dark: true, background: '#07111f', grid: '#1e293b', axis: '#cbd5e1', text: '#e2e8f0' }
    : { dark: false, background: '#ffffff', grid: '#d7e1ec', axis: '#0f172a', text: '#0f172a' };
}

function styleRenderedGraph(target: HTMLElement | null) {
  if (!target) return;
  const palette = getThemePalette();
  const svg = target.querySelector('svg');
  if (!svg) return;

  svg.style.background = palette.background;
  svg.querySelectorAll('.x.axis path, .y.axis path, .x.axis line, .y.axis line').forEach((node) => {
    (node as SVGElement).setAttribute('stroke', palette.axis);
  });
  svg.querySelectorAll('.x.grid path, .y.grid path, .x.grid line, .y.grid line').forEach((node) => {
    (node as SVGElement).setAttribute('stroke', palette.grid);
  });
  svg.querySelectorAll('text').forEach((node) => {
    (node as SVGElement).setAttribute('fill', palette.text);
  });
}

function createHistoryItem(problem: string, answer: string, category: MathCategoryId): RecentMathItem {
  return {
    id: crypto.randomUUID(),
    problem,
    answer,
    category,
    createdAt: new Date().toISOString(),
  };
}

function createGraphExpression(expr: string, color = GRAPH_COLORS[0]): GraphExpression {
  return {
    id: crypto.randomUUID(),
    expr,
    color,
    enabled: true,
  };
}

export function MathSolverPage() {
  const { toast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<MathTab>('solver');
  const [category, setCategory] = useState<MathCategoryId>('algebra');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<SolverResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [generatingPractice, setGeneratingPractice] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [practice, setPractice] = useState('');
  const [mathContext, setMathContext] = useState<MathContext | null>(null);
  const [recentWorkspaceFile, setRecentWorkspaceFile] = useState<RecentWorkspaceFile | null>(null);
  const [history, setHistory] = useState<RecentMathItem[]>([]);
  const [graphExpressions, setGraphExpressions] = useState<GraphExpression[]>([createGraphExpression('y = x^2')]);
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);
  const [graphError, setGraphError] = useState('');
  const [xDomain, setXDomain] = useState<[number, number]>([-10, 10]);
  const [yDomain, setYDomain] = useState<[number, number]>([-10, 10]);
  const [unitGroupId, setUnitGroupId] = useState<(typeof UNIT_GROUPS)[number]['id']>('length');
  const [unitValue, setUnitValue] = useState('1');
  const [fromUnit, setFromUnit] = useState('m');
  const [toUnit, setToUnit] = useState('cm');
  const [themeTick, setThemeTick] = useState(0);

  const currentCategory = MATH_CATEGORIES[category];
  const symbolGroup = useMemo(() => {
    if (category === 'calculus') return 'calculus';
    if (category === 'trigonometry') return 'trigonometry';
    if (category === 'matrices' || category === 'linear-algebra') return 'matrices';
    if (category === 'vectors') return 'vectors';
    if (category === 'algebra') return 'algebra';
    return 'basic';
  }, [category]);
  const activeSymbols = MATH_SYMBOL_GROUPS.find((group) => group.id === symbolGroup) ?? MATH_SYMBOL_GROUPS[0];
  const unitGroup = UNIT_GROUPS.find((group) => group.id === unitGroupId) ?? UNIT_GROUPS[0];
  const activeGraph = graphExpressions.find((expr) => expr.id === activeGraphId) ?? graphExpressions[0] ?? null;
  const graphTable = activeGraph ? buildValueTable(activeGraph.expr, xDomain) : [];

  useEffect(() => {
    setHistory(getStoredHistory());
    const context = readMathContext();
    if (context) setMathContext(context);

    fetch('/api/recent?limit=1', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => {
        const first = Array.isArray(items) ? items[0]?.file : null;
        if (first && first.id && first.name) {
          setRecentWorkspaceFile(first as RecentWorkspaceFile);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!unitGroup.units.some((unit) => unit.id === fromUnit)) setFromUnit(unitGroup.units[0].id);
    if (!unitGroup.units.some((unit) => unit.id === toUnit)) setToUnit(unitGroup.units.at(-1)?.id ?? unitGroup.units[0].id);
  }, [unitGroup, fromUnit, toUnit]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => setThemeTick((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const renderGraph = useCallback(() => {
    if (!graphRef.current || !functionPlot) return;
    const enabled = graphExpressions.filter((expr) => expr.enabled && expr.expr.trim());
    if (enabled.length === 0) {
      graphRef.current.innerHTML = '';
      setGraphError('');
      return;
    }

    try {
      const data = enabled
        .map((item) => {
          const normalized = normalizeGraphExpression(item.expr);
          if (!normalized) return null;
          if (normalized.type === 'implicit') {
            return { fn: normalized.value, fnType: 'implicit', color: item.color, sampler: 'builtIn' };
          }
          return { fn: normalized.value, color: item.color, sampler: 'builtIn', nSamples: 500 };
        })
        .filter(Boolean);

      if (data.length === 0) {
        graphRef.current.innerHTML = '';
        setGraphError('');
        return;
      }

      functionPlot({
        target: graphRef.current,
        width: Math.max(420, graphRef.current.clientWidth || 760),
        height: 460,
        xAxis: { domain: xDomain },
        yAxis: { domain: yDomain },
        grid: true,
        disableZoom: true,
        data,
      });
      setGraphError('');
      styleRenderedGraph(graphRef.current);
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : 'Could not render this expression');
    }
  }, [graphExpressions, xDomain, yDomain]);

  useEffect(() => {
    if (activeTab !== 'graph') return;
    renderGraph();
  }, [activeTab, renderGraph, themeTick]);

  function addHistory(problem: string, answer: string, nextCategory: MathCategoryId) {
    const next = [createHistoryItem(problem, answer, nextCategory), ...history].slice(0, 8);
    setHistory(next);
    saveStoredHistory(next);
  }

  function addGraphExpression(expr: string) {
    const next = createGraphExpression(expr, GRAPH_COLORS[graphExpressions.length % GRAPH_COLORS.length]);
    setGraphExpressions((current) => [...current, next]);
    setActiveGraphId(next.id);
  }

  function applyExample(expr: string) {
    setInput(expr);
    setResult(null);
    setExplanation('');
    setPractice('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleInsert(insert: string) {
    const next = insertAtCaret(inputRef.current, input, insert);
    setInput(next.value);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  }

  async function handleSolve() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setExplanation('');
    setPractice('');

    try {
      const body: MathSolveRequest = {
        problem: input.trim(),
        category,
        contextFileId: mathContext?.fileId ?? null,
        contextText: mathContext?.extractedText ?? null,
      };
      const res = await fetch('/api/math/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null) as SolverResult & { error?: string } | null;
      if (!res.ok || !data) {
        throw new Error(data?.error ?? 'Could not solve this problem');
      }

      setResult(data);
      setCategory(data.category ?? category);
      addHistory(input.trim(), data.answer, data.category ?? category);

      if (data.graphExpr) {
        setGraphExpressions([createGraphExpression(data.graphExpr, GRAPH_COLORS[0])]);
        setActiveGraphId(null);
      }

      toast(data.verified ? 'Solved successfully' : 'Solved with limited confidence', data.verified ? 'success' : 'warning');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Math solve failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleExplain() {
    if (!input.trim() || explaining) return;
    setExplaining(true);
    try {
      const contextParts = [
        result?.answer ? `Solved answer: ${result.answer}` : '',
        mathContext?.extractedText ? mathContext.extractedText.slice(0, 2000) : '',
      ].filter(Boolean);

      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: input.trim(),
          context: contextParts.join('\n\n'),
        }),
      });
      const payload = await res.json().catch(() => null) as { explanation?: string; error?: string } | null;
      if (!res.ok || !payload?.explanation) throw new Error(payload?.error ?? 'Could not explain this concept');
      setExplanation(payload.explanation.trim());
      toast('Explanation ready', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not explain this concept', 'error');
    } finally {
      setExplaining(false);
    }
  }

  async function handlePractice() {
    if (!input.trim() || generatingPractice) return;
    setGeneratingPractice(true);
    try {
      const promptText = [
        `Category: ${currentCategory.label}`,
        `Problem focus: ${input.trim()}`,
        result?.answer ? `Solved answer: ${result.answer}` : '',
        currentCategory.practicePrompt,
        mathContext?.extractedText ? `Use this study file context where helpful:\n${mathContext.extractedText.slice(0, 2500)}` : '',
      ].filter(Boolean).join('\n\n');

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'practice', text: promptText, options: { count: 5 } }),
      });
      const payload = await res.json().catch(() => null) as { content?: string; error?: string } | null;
      if (!res.ok || !payload?.content) throw new Error(payload?.error ?? 'Could not generate practice');
      setPractice(payload.content);
      toast('Practice questions generated', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not generate practice', 'error');
    } finally {
      setGeneratingPractice(false);
    }
  }

  async function saveLibraryItem(mode: 'math-solution' | 'math-practice', content: string) {
    if (!content.trim()) return;
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          content,
          metadata: {
            title: mode === 'math-solution' ? `Math Solution — ${input.trim()}` : `Math Practice — ${currentCategory.label}`,
            category,
            problem: input.trim(),
            sourceFileId: mathContext?.fileId ?? null,
            sourceFileName: mathContext?.fileName ?? null,
            graphExpr: result?.graphExpr ?? null,
            savedFrom: '/math',
          },
        }),
      });
      if (!res.ok) throw new Error('Library save failed');
      toast(mode === 'math-solution' ? 'Saved solution to Library' : 'Saved practice to Library', 'success');
    } catch {
      toast('Could not save to Library', 'warning');
    }
  }

  function resetGraphView() {
    setXDomain([-10, 10]);
    setYDomain([-10, 10]);
  }

  function zoomGraph(factor: number) {
    const nextX = [xDomain[0] * factor, xDomain[1] * factor] as [number, number];
    const nextY = [yDomain[0] * factor, yDomain[1] * factor] as [number, number];
    setXDomain(nextX);
    setYDomain(nextY);
  }

  const unitResult = useMemo(() => {
    try {
      const numeric = Number(unitValue);
      if (!Number.isFinite(numeric)) return '—';
      const converted = math.unit(numeric, fromUnit).to(toUnit);
      const convertedValue = Number(converted.toNumeric());
      if (!Number.isFinite(convertedValue)) return '—';
      return `${convertedValue.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')} ${toUnit}`;
    } catch {
      return '—';
    }
  }, [unitValue, fromUnit, toUnit]);

  const previewExpression = result?.previewLatex || input.trim();

  return (
    <div className="math-shell">
      <div className="math-header">
        <div>
          <span className="math-eyebrow">Math Studio</span>
          <h1>Clean math workflow for high-school and undergraduate study.</h1>
          <p>One place to solve, graph, convert, explain, and practice without the old duplicated math paths getting in the way.</p>
        </div>
        <div className="math-header-actions">
          <button className="math-button secondary" onClick={() => router.push('/workspace')}>Back to Workspace</button>
          <button className="math-button secondary" onClick={() => setActiveTab('lab')}>Open MATLAB Flow</button>
        </div>
      </div>

      {mathContext ? (
        <div className="math-context-card">
          <div>
            <strong>{mathContext.fileName}</strong>
            <p>Linked from Workspace{mathContext.sourceTopicId ? ' topic' : mathContext.sourceFolderId ? ' folder' : ''}. This file will be used for explain/practice context.</p>
          </div>
          <div className="math-inline-actions">
            <button className="math-button secondary" onClick={() => router.push('/workspace')}>Open Workspace</button>
            <button className="math-button ghost" onClick={() => { clearMathContext(); setMathContext(null); }}>Clear file</button>
          </div>
        </div>
      ) : recentWorkspaceFile ? (
        <div className="math-context-card subtle">
          <div>
            <strong>Recent workspace file</strong>
            <p>{recentWorkspaceFile.name}</p>
          </div>
          <div className="math-inline-actions">
            {recentWorkspaceFile.content ? (
              <button
                className="math-button secondary"
                onClick={() => {
                  const nextContext = {
                    fileId: recentWorkspaceFile.id,
                    fileName: recentWorkspaceFile.name,
                    extractedText: recentWorkspaceFile.content ?? '',
                    sourceFolderId: recentWorkspaceFile.folderId ?? null,
                    sourceTopicId: recentWorkspaceFile.topicId ?? null,
                  };
                  writeMathContext(nextContext);
                  setMathContext({ ...nextContext, updatedAt: new Date().toISOString() });
                  toast('Recent file linked to Math', 'success');
                }}
              >
                Use recent file
              </button>
            ) : null}
            <button className="math-button ghost" onClick={() => router.push('/workspace')}>Choose from Workspace</button>
          </div>
        </div>
      ) : null}

      <div className="math-tabbar">
        {(['solver', 'graph', 'units', 'lab'] as MathTab[]).map((tab) => (
          <button
            key={tab}
            className={`math-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'solver' && (
        <div className="math-layout">
          <aside className="math-sidebar">
            <div className="math-card">
              <h3>Categories</h3>
              <div className="math-chip-grid">
                {MATH_CATEGORY_ORDER.map((id) => (
                  <button
                    key={id}
                    className={`math-chip ${category === id ? 'active' : ''}`}
                    onClick={() => setCategory(id)}
                  >
                    {MATH_CATEGORIES[id].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="math-card">
              <h3>{currentCategory.label} examples</h3>
              <div className="math-example-list">
                {currentCategory.examples.map((example) => (
                  <button key={example.expr} className="math-example" onClick={() => applyExample(example.expr)}>
                    <strong>{example.expr}</strong>
                    <span>{example.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="math-card">
              <h3>Recent solves</h3>
              {history.length === 0 ? (
                <p className="math-muted">Your recent math work will appear here.</p>
              ) : (
                <div className="math-history-list">
                  {history.map((item) => (
                    <button key={item.id} className="math-history-item" onClick={() => { setCategory(item.category); setInput(item.problem); setExplanation(''); setPractice(''); }}>
                      <strong>{item.problem}</strong>
                      <span>{item.answer}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <section className="math-main">
            <div className="math-card">
              <div className="math-card-header">
                <div>
                  <h3>Problem input</h3>
                  <p>Type naturally, like <code>integral from 0 to pi of sin(x) dx</code> or <code>system x + y = 3; x - y = 1</code>.</p>
                </div>
                <div className="math-inline-actions">
                  <button className="math-button ghost" onClick={() => { setInput(''); setResult(null); setExplanation(''); setPractice(''); }}>Clear</button>
                  <button className="math-button primary" onClick={handleSolve} disabled={!input.trim() || loading}>
                    {loading ? 'Solving…' : 'Solve'}
                  </button>
                </div>
              </div>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={currentCategory.examples[0]?.expr ?? 'Enter a math problem…'}
                className="math-input"
              />

              <div className="math-symbol-row">
                {activeSymbols.symbols.map((symbol) => (
                  <button key={`${activeSymbols.id}-${symbol.label}`} className="math-symbol" onClick={() => handleInsert(symbol.insert)}>
                    {symbol.label}
                  </button>
                ))}
              </div>

              <div className="math-preview-card">
                <div>
                  <span className="math-label">Preview</span>
                  {previewExpression ? (
                    <div className="math-preview-expression">
                      <MathRenderer math={previewExpression} display={true} />
                    </div>
                  ) : (
                    <p className="math-muted">Type a problem to see a clean math preview.</p>
                  )}
                </div>
                {input.trim() && <div className="math-input-syntax">Input syntax: {input.trim()}</div>}
              </div>
            </div>

            <div className="math-card">
              <div className="math-card-header">
                <div>
                  <h3>Solution</h3>
                  <p>Step-by-step output stays grounded in one solver path instead of multiple competing math UIs.</p>
                </div>
                <div className="math-inline-actions">
                  <button className="math-button secondary" onClick={handleExplain} disabled={!input.trim() || explaining}>
                    {explaining ? 'Explaining…' : 'Explain'}
                  </button>
                  <button className="math-button secondary" onClick={handlePractice} disabled={!input.trim() || generatingPractice}>
                    {generatingPractice ? 'Generating…' : 'Practice'}
                  </button>
                  <button className="math-button ghost" onClick={() => saveLibraryItem('math-solution', result ? `${result.answer}\n\n${result.steps.map((step) => `${step.description}: ${step.expression}`).join('\n')}` : '')} disabled={!result}>
                    Save
                  </button>
                </div>
              </div>

              {!result ? (
                <div className="math-empty-state">
                  <strong>Ready when you are</strong>
                  <p>Pick an example or type your own problem, then solve it here.</p>
                </div>
              ) : (
                <div className="math-result-stack">
                  <div className="math-answer-card">
                    <span className="math-label">Answer</span>
                    <h2>{result.answer}</h2>
                    <div className="math-rendered-answer"><MathRenderer math={result.answerLatex} display={true} /></div>
                    <p>{result.explanation}</p>
                    <div className="math-badges">
                      <span className={`math-badge ${result.verified ? 'good' : 'warn'}`}>{result.verified ? 'Verified' : 'Needs review'}</span>
                      <span className="math-badge neutral">{result.engine}</span>
                      <span className="math-badge neutral">{MATH_CATEGORIES[result.category]?.label ?? result.category}</span>
                    </div>
                    {result.graphExpr && (
                      <button className="math-button secondary" onClick={() => { addGraphExpression(result.graphExpr ?? ''); setActiveTab('graph'); }}>
                        Send to graph
                      </button>
                    )}
                  </div>

                  <div className="math-steps">
                    {result.steps.map((step) => (
                      <div key={`${step.step}-${step.description}`} className="math-step-card">
                        <div className="math-step-title">Step {step.step}: {step.description}</div>
                        <div className="math-step-render"><MathRenderer math={step.expression} display={true} /></div>
                        <p>{step.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(explanation || practice) && (
              <div className="math-secondary-grid">
                {explanation && (
                  <div className="math-card">
                    <div className="math-card-header compact">
                      <h3>Concept explanation</h3>
                      <button className="math-button ghost" onClick={() => setExplanation('')}>Clear</button>
                    </div>
                    <div className="math-prose">{explanation}</div>
                  </div>
                )}

                {practice && (
                  <div className="math-card">
                    <div className="math-card-header compact">
                      <h3>Practice questions</h3>
                      <div className="math-inline-actions">
                        <button className="math-button ghost" onClick={() => saveLibraryItem('math-practice', practice)}>Save</button>
                        <button className="math-button ghost" onClick={() => setPractice('')}>Clear</button>
                      </div>
                    </div>
                    <div className="math-prose">{practice}</div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'graph' && (
        <div className="math-layout graph-layout">
          <aside className="math-sidebar">
            <div className="math-card">
              <div className="math-card-header compact">
                <h3>Expressions</h3>
                <button className="math-button secondary" onClick={() => addGraphExpression('y = x')}>Add</button>
              </div>
              <div className="math-expression-list">
                {graphExpressions.map((expression) => (
                  <div key={expression.id} className={`math-expression-item ${activeGraphId === expression.id ? 'active' : ''}`}>
                    <button
                      className={`math-toggle ${expression.enabled ? 'on' : ''}`}
                      onClick={() => setGraphExpressions((current) => current.map((item) => item.id === expression.id ? { ...item, enabled: !item.enabled } : item))}
                    >
                      {expression.enabled ? 'On' : 'Off'}
                    </button>
                    <span className="math-color-dot" style={{ background: expression.color }} />
                    <input
                      value={expression.expr}
                      onFocus={() => setActiveGraphId(expression.id)}
                      onChange={(event) => setGraphExpressions((current) => current.map((item) => item.id === expression.id ? { ...item, expr: event.target.value } : item))}
                      placeholder="y = x^2"
                      className="math-expression-input"
                    />
                    <button className="math-delete" onClick={() => setGraphExpressions((current) => current.filter((item) => item.id !== expression.id))}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="math-card">
              <h3>Graph controls</h3>
              <div className="math-inline-actions wrap">
                <button className="math-button secondary" onClick={resetGraphView}>Home</button>
                <button className="math-button secondary" onClick={() => zoomGraph(0.8)}>Zoom in</button>
                <button className="math-button secondary" onClick={() => zoomGraph(1.25)}>Zoom out</button>
              </div>
              <p className="math-muted small">Use <code>y = x^2</code>, <code>x = 2</code>, or <code>x^2 + y^2 = 25</code>.</p>
            </div>

            <div className="math-card">
              <h3>Value table</h3>
              {activeGraph && isExplicitExpression(activeGraph.expr) ? (
                <div className="math-table">
                  {graphTable.map((row) => (
                    <div key={`${row.x}-${row.y}`} className="math-table-row">
                      <span>x = {row.x}</span>
                      <strong>y = {row.y}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="math-muted">Choose a standard function expression to see sample values.</p>
              )}
            </div>
          </aside>

          <section className="math-main">
            <div className="math-card graph-surface-card">
              <div className="math-card-header compact">
                <div>
                  <h3>Graph surface</h3>
                  <p>Cleaner plotting with explicit and implicit expressions in one place.</p>
                </div>
                <span className="math-badge neutral">{graphExpressions.filter((item) => item.enabled && item.expr.trim()).length} active</span>
              </div>
              {graphError && <div className="math-graph-error">{graphError}</div>}
              <div ref={graphRef} className="math-graph-canvas" />
            </div>
          </section>
        </div>
      )}

      {activeTab === 'units' && (
        <div className="math-layout compact-layout">
          <section className="math-main single-column">
            <div className="math-card">
              <div className="math-card-header">
                <div>
                  <h3>Unit converter</h3>
                  <p>Simple, reliable conversion for the units students actually use most.</p>
                </div>
              </div>
              <div className="math-unit-grid">
                <label>
                  <span>Category</span>
                  <select value={unitGroupId} onChange={(event) => setUnitGroupId(event.target.value as (typeof UNIT_GROUPS)[number]['id'])}>
                    {UNIT_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Value</span>
                  <input value={unitValue} onChange={(event) => setUnitValue(event.target.value)} />
                </label>
                <label>
                  <span>From</span>
                  <select value={fromUnit} onChange={(event) => setFromUnit(event.target.value)}>
                    {unitGroup.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>To</span>
                  <select value={toUnit} onChange={(event) => setToUnit(event.target.value)}>
                    {unitGroup.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="math-unit-result">
                <span className="math-label">Result</span>
                <strong>{unitResult}</strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'lab' && (
        <div className="math-layout compact-layout">
          <section className="math-main single-column">
            <div className="math-card">
              <div className="math-card-header">
                <div>
                  <h3>MATLAB Flow</h3>
                  <p>A cleaner student lab for matrices, systems, and quick plots — without pretending to be full desktop MATLAB.</p>
                </div>
                <button className="math-button secondary" onClick={() => setActiveTab('graph')}>Open graph tab</button>
              </div>
              <MatlabLab
                onGraphExpression={(expression) => {
                  addGraphExpression(expression.startsWith('y =') ? expression : `y = ${expression}`);
                  setActiveTab('graph');
                  toast('Expression sent to Graph', 'success');
                }}
              />
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .math-shell {
          display: grid;
          gap: 1rem;
          padding: 1rem;
          min-height: 100%;
          background: radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #2563eb) 8%, transparent), transparent 38%), var(--bg);
        }
        .math-header,
        .math-context-card,
        .math-tabbar,
        .math-card {
          border: 1px solid var(--border-subtle, var(--border));
          border-radius: 1.4rem;
          background: color-mix(in srgb, var(--surface, #fff) 86%, transparent);
          box-shadow: var(--shadow-md, 0 10px 30px rgba(15, 23, 42, 0.08));
        }
        .math-header {
          padding: 1.3rem 1.4rem;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .math-header h1 {
          margin: 0.45rem 0 0.55rem;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1;
          letter-spacing: -0.04em;
          font-family: "Fraunces", serif;
          color: var(--text-primary, var(--text));
          max-width: 16ch;
        }
        .math-header p,
        .math-context-card p,
        .math-card p,
        .math-prose {
          margin: 0;
          color: var(--text-muted, var(--text-3));
          line-height: 1.7;
        }
        .math-eyebrow,
        .math-label,
        .math-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }
        .math-eyebrow,
        .math-badge.neutral,
        .math-label {
          color: var(--text-muted, var(--text-3));
        }
        .math-badge {
          min-height: 1.8rem;
          padding: 0 0.7rem;
          border-radius: 999px;
          background: color-mix(in srgb, var(--bg-inset, #eef2ff) 82%, transparent);
          border: 1px solid color-mix(in srgb, var(--border, #cbd5e1) 65%, transparent);
        }
        .math-badge.good {
          color: #166534;
          background: rgba(22, 163, 74, 0.12);
          border-color: rgba(22, 163, 74, 0.3);
        }
        .math-badge.warn {
          color: #b45309;
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.25);
        }
        .math-header-actions,
        .math-inline-actions,
        .math-symbol-row,
        .math-badges,
        .math-chip-grid,
        .math-tabbar,
        .math-secondary-grid,
        .math-unit-grid {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .math-inline-actions.wrap {
          margin-top: 0.7rem;
        }
        .math-button,
        .math-tab,
        .math-chip,
        .math-symbol,
        .math-example,
        .math-history-item,
        .math-toggle,
        .math-delete {
          border: 1px solid var(--border, #cbd5e1);
          background: color-mix(in srgb, var(--surface, #fff) 86%, transparent);
          color: var(--text-primary, var(--text));
          border-radius: 0.95rem;
          cursor: pointer;
          transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease;
          font: inherit;
        }
        .math-button:hover,
        .math-tab:hover,
        .math-chip:hover,
        .math-symbol:hover,
        .math-example:hover,
        .math-history-item:hover,
        .math-toggle:hover,
        .math-delete:hover {
          transform: translateY(-1px);
        }
        .math-button {
          min-height: 2.7rem;
          padding: 0 1rem;
          font-weight: 600;
        }
        .math-button.primary,
        .math-tab.active,
        .math-chip.active {
          background: linear-gradient(135deg, var(--accent, #2563eb), color-mix(in srgb, var(--accent, #2563eb) 68%, white 32%));
          border-color: transparent;
          color: #fff;
        }
        .math-button.secondary {
          background: color-mix(in srgb, var(--accent, #2563eb) 12%, var(--surface, #fff));
          border-color: color-mix(in srgb, var(--accent, #2563eb) 28%, transparent);
        }
        .math-button.ghost,
        .math-delete {
          background: transparent;
        }
        .math-context-card {
          padding: 1rem 1.2rem;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .math-context-card.subtle {
          background: color-mix(in srgb, var(--bg-inset, #eef2ff) 68%, transparent);
        }
        .math-tabbar {
          padding: 0.6rem;
        }
        .math-tab {
          min-height: 2.6rem;
          padding: 0 1rem;
          font-weight: 600;
        }
        .math-layout {
          display: grid;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          gap: 1rem;
        }
        .math-layout.compact-layout,
        .math-main.single-column {
          grid-template-columns: 1fr;
        }
        .math-sidebar,
        .math-main,
        .math-result-stack,
        .math-steps,
        .math-history-list,
        .math-example-list,
        .math-expression-list {
          display: grid;
          gap: 1rem;
        }
        .math-card {
          padding: 1.15rem;
        }
        .math-card h3 {
          margin: 0;
          font-size: 1.05rem;
          color: var(--text-primary, var(--text));
        }
        .math-card-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 0.95rem;
          flex-wrap: wrap;
        }
        .math-card-header.compact {
          margin-bottom: 0.8rem;
        }
        .math-chip-grid {
          margin-top: 0.8rem;
        }
        .math-chip,
        .math-symbol {
          min-height: 2.35rem;
          padding: 0 0.85rem;
          font-size: 0.92rem;
        }
        .math-example,
        .math-history-item {
          padding: 0.9rem 1rem;
          text-align: left;
          display: grid;
          gap: 0.25rem;
        }
        .math-example strong,
        .math-history-item strong {
          color: var(--text-primary, var(--text));
          font-size: 0.94rem;
        }
        .math-example span,
        .math-history-item span,
        .math-muted,
        .math-input-syntax {
          color: var(--text-muted, var(--text-3));
          font-size: 0.88rem;
        }
        .math-muted.small {
          font-size: 0.8rem;
          margin-top: 0.7rem;
        }
        .math-input {
          width: 100%;
          min-height: 132px;
          padding: 1rem 1.05rem;
          border-radius: 1rem;
          border: 1px solid var(--border, #cbd5e1);
          background: color-mix(in srgb, var(--surface, #fff) 92%, transparent);
          color: var(--text-primary, var(--text));
          font: inherit;
          line-height: 1.7;
          resize: vertical;
          outline: none;
        }
        .math-input:focus,
        .math-expression-input:focus,
        .math-unit-grid input:focus,
        .math-unit-grid select:focus {
          border-color: color-mix(in srgb, var(--accent, #2563eb) 32%, transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #2563eb) 16%, transparent);
        }
        .math-symbol-row {
          margin-top: 0.85rem;
        }
        .math-preview-card,
        .math-answer-card,
        .math-step-card,
        .math-empty-state,
        .math-unit-result,
        .math-graph-error,
        .math-expression-item,
        .math-table-row {
          border: 1px solid color-mix(in srgb, var(--border, #cbd5e1) 70%, transparent);
          background: color-mix(in srgb, var(--bg-inset, #f8fafc) 82%, transparent);
          border-radius: 1rem;
        }
        .math-preview-card,
        .math-answer-card,
        .math-step-card,
        .math-empty-state,
        .math-unit-result,
        .math-graph-error {
          padding: 1rem;
        }
        .math-preview-card {
          margin-top: 1rem;
          display: grid;
          gap: 0.75rem;
        }
        .math-preview-expression,
        .math-rendered-answer,
        .math-step-render {
          overflow-x: auto;
        }
        .math-answer-card h2 {
          margin: 0.45rem 0 0.2rem;
          font-size: clamp(1.5rem, 3vw, 2.2rem);
          color: var(--text-primary, var(--text));
        }
        .math-prose {
          white-space: pre-wrap;
          word-break: break-word;
        }
        .math-expression-item {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.55rem;
          padding: 0.65rem;
        }
        .math-expression-item.active {
          border-color: color-mix(in srgb, var(--accent, #2563eb) 35%, transparent);
        }
        .math-expression-input,
        .math-unit-grid input,
        .math-unit-grid select {
          min-height: 2.55rem;
          border-radius: 0.85rem;
          border: 1px solid var(--border, #cbd5e1);
          padding: 0 0.75rem;
          background: color-mix(in srgb, var(--surface, #fff) 92%, transparent);
          color: var(--text-primary, var(--text));
          font: inherit;
          width: 100%;
        }
        .math-toggle {
          min-height: 2.1rem;
          padding: 0 0.7rem;
          font-size: 0.78rem;
        }
        .math-toggle.on {
          background: rgba(37, 99, 235, 0.12);
          border-color: rgba(37, 99, 235, 0.3);
          color: #1d4ed8;
        }
        .math-color-dot {
          width: 0.9rem;
          height: 0.9rem;
          border-radius: 999px;
        }
        .math-delete {
          width: 2.2rem;
          height: 2.2rem;
        }
        .math-graph-canvas {
          min-height: 460px;
          width: 100%;
          overflow: hidden;
          border-radius: 1rem;
          border: 1px solid color-mix(in srgb, var(--border, #cbd5e1) 60%, transparent);
          background: color-mix(in srgb, var(--surface, #fff) 94%, transparent);
        }
        .math-table {
          display: grid;
          gap: 0.55rem;
        }
        .math-table-row {
          padding: 0.8rem 0.9rem;
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }
        .math-unit-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        .math-unit-grid label {
          display: grid;
          gap: 0.45rem;
          font-size: 0.9rem;
          color: var(--text-primary, var(--text));
        }
        .math-unit-result {
          margin-top: 1rem;
          display: grid;
          gap: 0.45rem;
        }
        .math-unit-result strong {
          font-size: 1.6rem;
          color: var(--text-primary, var(--text));
        }
        code {
          padding: 0.1rem 0.35rem;
          border-radius: 0.35rem;
          background: color-mix(in srgb, var(--bg-inset, #eef2ff) 80%, transparent);
        }
        @media (max-width: 980px) {
          .math-layout {
            grid-template-columns: 1fr;
          }
          .math-header,
          .math-context-card,
          .math-card-header {
            align-items: stretch;
          }
          .math-unit-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default MathSolverPage;
