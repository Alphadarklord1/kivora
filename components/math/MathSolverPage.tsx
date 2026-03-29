'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import * as math from 'mathjs';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import { readMathContext } from '@/lib/math/context';
import { MathText } from '@/components/math/MathRenderer';
import { MATH_CATEGORIES, MATH_CATEGORY_ORDER } from '@/lib/math/catalog';
import type { MathCategoryId } from '@/lib/math/types';
import { isCustomFuncDefinition, normalizeGraphExpression, buildSharedScope } from '@/lib/math/graph-utils';
import { VisualAnalyzer } from '@/components/tools/VisualAnalyzer';
import { MatlabLab } from '@/components/tools/MatlabLab';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MathStep {
  step: number;
  description: string;
  expression: string;  // matches /lib/math/types.ts and both solver paths
  explanation: string;
}

interface SolveResult {
  answer: string;
  answerLatex: string;
  steps: MathStep[];
  graphExpr: string | null;
  category: string;
  engine: string;
  error: string | null;
}

interface HistoryItem {
  id: string;
  problem: string;
  answer: string;
  category: string;
  ts: number;
}

interface GraphExpression {
  id: string;
  expr: string;
  color: string;
  enabled: boolean;
}

interface WorkflowStep {
  label: string;
  detail: string;
}


// ── Topic catalogue ───────────────────────────────────────────────────────────

const TOPIC_META: Record<MathCategoryId, { icon: string; color: string }> = {
  algebra: { icon: '𝑥', color: '#6366f1' },
  geometry: { icon: '△', color: '#10b981' },
  calculus: { icon: '∂', color: '#8b5cf6' },
  trigonometry: { icon: '∠', color: '#f59e0b' },
  'sequences-series': { icon: 'Σ', color: '#0ea5e9' },
  'linear-algebra': { icon: '⊞', color: '#ec4899' },
  statistics: { icon: 'σ', color: '#06b6d4' },
  vectors: { icon: '→', color: '#84cc16' },
  matrices: { icon: '▦', color: '#a855f7' },
  'differential-equations': { icon: "y'", color: '#f97316' },
  discrete: { icon: '∈', color: '#14b8a6' },
  physics: { icon: '⚛', color: '#ef4444' },
};

const TOPICS: Array<{ id: MathCategoryId; label: string; icon: string; color: string; examples: string[] }> =
  MATH_CATEGORY_ORDER.map((id) => ({
    id,
    label: MATH_CATEGORIES[id].label,
    icon: TOPIC_META[id].icon,
    color: TOPIC_META[id].color,
    examples: MATH_CATEGORIES[id].examples.map((example) => example.expr),
  }));

type TopicId = MathCategoryId;
type SpecialView = 'formulas' | 'graph' | 'units' | 'scan' | 'visual' | 'matlab';
type ActiveView = TopicId | SpecialView;

const DEFAULT_ACCENT = 'var(--primary)';

const SPECIAL_VIEW_META: Record<SpecialView, { title: string; subtitle: string; icon: string; accent: string; workflowTitle: string; workflow: WorkflowStep[] }> = {
  formulas: {
    title: 'Formula Sheets',
    subtitle: 'Quick-reference formulas organized by topic, ready to review before homework or exams.',
    icon: '📚',
    accent: '#6366f1',
    workflowTitle: 'Formula-sheet workflow',
    workflow: [
      { label: 'Choose a topic', detail: 'Jump into the formula group that matches the class or chapter you are studying.' },
      { label: 'Review the pattern', detail: 'Use these as quick revision cards before homework, quizzes, or an exam.' },
      { label: 'Send one to the solver', detail: 'Click any formula card when you want a worked explanation or an example problem.' },
    ],
  },
  graph: {
    title: 'Graph Plotter',
    subtitle: 'Plot functions, parametric curves, implicit relations, and reusable custom functions.',
    icon: '📈',
    accent: '#22c55e',
    workflowTitle: 'Graph workflow',
    workflow: [
      { label: 'Enter a relation', detail: 'Use forms like y = x^2, x = 2, x^2 + y^2 = 25, or parametric x = cos(t), y = sin(t).' },
      { label: 'Define custom functions', detail: 'Add a row like f(x) = x^2 + 1 — then use f(x) in any other expression row.' },
      { label: 'Plot it', detail: 'Hit Plot to render everything together: functions, relations, and parametric curves.' },
      { label: 'Compare expressions', detail: 'Add extra rows to overlay multiple curves and see how they interact.' },
    ],
  },
  units: {
    title: 'Unit Converter',
    subtitle: 'Convert the common units students need most, with a simpler focused tool.',
    icon: '⚖',
    accent: '#f59e0b',
    workflowTitle: 'Unit-converter workflow',
    workflow: [
      { label: 'Choose a category', detail: 'Pick the measurement family you need first, like length, mass, or speed.' },
      { label: 'Set from and to units', detail: 'Choose your source unit and the unit you want to end up with.' },
      { label: 'Enter a value', detail: 'Type one value and let the converter return a clean answer immediately.' },
      { label: 'Swap when needed', detail: 'Use the swap control to reverse the conversion without re-entering everything.' },
    ],
  },
  scan: {
    title: 'Question Scan',
    subtitle: 'Upload a screenshot or PDF of a math question, extract it, and send it to the solver. OCR now follows your selected app language where possible.',
    icon: '🧾',
    accent: '#38bdf8',
    workflowTitle: 'Question-scan workflow',
    workflow: [
      { label: 'Upload a screenshot or PDF', detail: 'This tab only accepts images and PDFs that contain math questions.' },
      { label: 'Extract the question text', detail: 'Images use OCR and PDFs use text extraction so we can turn the file into solver-ready input, with OCR guided by the current interface language.' },
      { label: 'Review what was captured', detail: 'Check the extracted question before sending it into the solver.' },
      { label: 'Solve it step by step', detail: 'Use “Solve now” to move the extracted text straight into the Solver tab.' },
    ],
  },
  visual: {
    title: 'Visual Analyzer',
    subtitle: 'Upload images or diagrams to extract and analyze visual math content with AI.',
    icon: '🔬',
    accent: '#a78bfa',
    workflowTitle: 'Visual analyzer workflow',
    workflow: [
      { label: 'Upload an image or diagram', detail: 'Provide a photo, screenshot, or drawn diagram containing math or data.' },
      { label: 'AI analyzes the content', detail: 'The visual analyzer identifies equations, graphs, tables, and other mathematical structures.' },
      { label: 'Review the analysis', detail: 'Inspect the extracted information and see a structured breakdown of what was found.' },
      { label: 'Send to solver', detail: 'Use any identified expression directly in the math solver for step-by-step working.' },
    ],
  },
  matlab: {
    title: 'MATLAB Lab',
    subtitle: 'Run MATLAB-style numeric computations, matrix operations, and plotting — all in the browser.',
    icon: '🧮',
    accent: '#f97316',
    workflowTitle: 'MATLAB Lab workflow',
    workflow: [
      { label: 'Write MATLAB-style code', detail: 'Use familiar MATLAB syntax for matrices, loops, functions, and numeric operations.' },
      { label: 'Run the script', detail: 'Execute the code in the browser-based engine and see results instantly.' },
      { label: 'Inspect outputs', detail: 'View numeric results, matrices, and generated plots side by side.' },
      { label: 'Send a graph expression', detail: 'Route any expression from the output to the Graph Plotter for visualization.' },
    ],
  },
};

// ── Formula reference data ────────────────────────────────────────────────────

const FORMULAS: Record<string, Array<{ title: string; latex: string; note?: string }>> = {
  algebra: [
    { title: 'Quadratic formula', latex: 'x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' },
    { title: 'Sum of arithmetic series', latex: 'S_n = \\dfrac{n}{2}(a_1 + a_n)' },
    { title: 'Sum of geometric series', latex: 'S_n = \\dfrac{a_1(1 - r^n)}{1 - r},\\ r \\neq 1' },
    { title: 'Binomial theorem', latex: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k' },
    { title: 'Difference of squares', latex: 'a^2 - b^2 = (a+b)(a-b)' },
    { title: 'Perfect square', latex: '(a \\pm b)^2 = a^2 \\pm 2ab + b^2' },
    { title: 'Logarithm rules', latex: '\\log(ab)=\\log a+\\log b,\\ \\log\\dfrac{a}{b}=\\log a-\\log b' },
    { title: 'Change of base', latex: '\\log_b a = \\dfrac{\\ln a}{\\ln b}' },
  ],
  calculus: [
    { title: 'Power rule', latex: '\\dfrac{d}{dx}\\left[x^n\\right] = nx^{n-1}' },
    { title: 'Product rule', latex: '\\dfrac{d}{dx}[uv] = u\'v + uv\'' },
    { title: 'Quotient rule', latex: '\\dfrac{d}{dx}\\left[\\dfrac{u}{v}\\right] = \\dfrac{u\'v - uv\'}{v^2}' },
    { title: 'Chain rule', latex: '\\dfrac{d}{dx}[f(g(x))] = f\'(g(x))\\cdot g\'(x)' },
    { title: 'Fundamental theorem', latex: '\\int_a^b f(x)\\,dx = F(b) - F(a)' },
    { title: 'Power rule (integration)', latex: '\\int x^n\\,dx = \\dfrac{x^{n+1}}{n+1} + C,\\ n \\neq -1' },
    { title: 'Integration by parts', latex: '\\int u\\,dv = uv - \\int v\\,du' },
    { title: "L'Hôpital's rule", latex: '\\lim_{x \\to a}\\dfrac{f(x)}{g(x)} = \\lim_{x \\to a}\\dfrac{f\'(x)}{g\'(x)}' },
  ],
  statistics: [
    { title: 'Sample mean', latex: '\\bar{x} = \\dfrac{\\sum x_i}{n}' },
    { title: 'Population variance', latex: '\\sigma^2 = \\dfrac{\\sum(x_i - \\mu)^2}{N}' },
    { title: 'Z-score', latex: 'z = \\dfrac{x - \\mu}{\\sigma}' },
    { title: 'Normal PDF', latex: 'f(x) = \\dfrac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}' },
    { title: 'Binomial probability', latex: 'P(X=k) = \\binom{n}{k}p^k(1-p)^{n-k}' },
    { title: 'Confidence interval', latex: 'CI = \\bar{x} \\pm z_{\\alpha/2}\\cdot\\dfrac{\\sigma}{\\sqrt{n}}' },
    { title: 'Correlation coefficient', latex: 'r = \\dfrac{\\sum(x_i-\\bar{x})(y_i-\\bar{y})}{\\sqrt{\\sum(x_i-\\bar{x})^2\\sum(y_i-\\bar{y})^2}}' },
    { title: "Bayes' theorem", latex: 'P(A|B) = \\dfrac{P(B|A)\\cdot P(A)}{P(B)}' },
  ],
  trigonometry: [
    { title: 'Pythagorean identity', latex: '\\sin^2\\theta + \\cos^2\\theta = 1' },
    { title: 'Sum identities', latex: '\\sin(A \\pm B) = \\sin A\\cos B \\pm \\cos A\\sin B' },
    { title: 'Double angle (sin)', latex: '\\sin(2x) = 2\\sin x\\cos x' },
    { title: 'Double angle (cos)', latex: '\\cos(2x) = \\cos^2 x - \\sin^2 x' },
    { title: 'Law of sines', latex: '\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}' },
    { title: 'Law of cosines', latex: 'c^2 = a^2 + b^2 - 2ab\\cos C' },
    { title: 'Euler\'s formula', latex: 'e^{i\\theta} = \\cos\\theta + i\\sin\\theta' },
    { title: 'Half angle (sin)', latex: '\\sin\\dfrac{\\theta}{2} = \\pm\\sqrt{\\dfrac{1-\\cos\\theta}{2}}' },
  ],
  geometry: [
    { title: 'Triangle area', latex: 'A = \\dfrac{1}{2}bh = \\dfrac{1}{2}ab\\sin C' },
    { title: "Heron's formula", latex: 'A = \\sqrt{s(s-a)(s-b)(s-c)},\\ s=\\dfrac{a+b+c}{2}' },
    { title: 'Circle area / perimeter', latex: 'A = \\pi r^2,\\quad C = 2\\pi r' },
    { title: 'Sphere', latex: 'V = \\dfrac{4}{3}\\pi r^3,\\quad A = 4\\pi r^2' },
    { title: 'Distance formula', latex: 'd = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}' },
    { title: 'Midpoint', latex: 'M = \\left(\\dfrac{x_1+x_2}{2},\\dfrac{y_1+y_2}{2}\\right)' },
    { title: 'Equation of line', latex: 'y - y_1 = m(x - x_1)' },
    { title: 'Equation of circle', latex: '(x-h)^2 + (y-k)^2 = r^2' },
  ],
  'linear-algebra': [
    { title: '2×2 Determinant', latex: '\\det\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix} = ad - bc' },
    { title: '2×2 Inverse', latex: 'A^{-1} = \\dfrac{1}{ad-bc}\\begin{pmatrix}d&-b\\\\-c&a\\end{pmatrix}' },
    { title: 'Eigenvalue equation', latex: 'Av = \\lambda v \\Leftrightarrow \\det(A - \\lambda I) = 0' },
    { title: 'Dot product', latex: '\\mathbf{u} \\cdot \\mathbf{v} = \\sum u_i v_i = |u||v|\\cos\\theta' },
    { title: 'Cross product magnitude', latex: '|\\mathbf{u} \\times \\mathbf{v}| = |u||v|\\sin\\theta' },
    { title: 'Gram-Schmidt', latex: 'e_k = v_k - \\sum_{j<k}\\dfrac{\\langle v_k,e_j\\rangle}{\\langle e_j,e_j\\rangle}e_j' },
  ],
  'differential-equations': [
    { title: 'Separable DE', latex: '\\dfrac{dy}{dx} = f(x)g(y) \\Rightarrow \\int\\dfrac{dy}{g(y)} = \\int f(x)\\,dx' },
    { title: 'Linear 1st-order', latex: 'y\' + P(x)y = Q(x),\\quad \\mu = e^{\\int P\\,dx}' },
    { title: 'Characteristic equation', latex: 'ay\'\' + by\' + cy = 0 \\Rightarrow ar^2 + br + c = 0' },
    { title: 'Euler\'s method', latex: 'y_{n+1} = y_n + h\\cdot f(x_n, y_n)' },
    { title: 'Laplace transform', latex: '\\mathcal{L}\\{f\\}(s) = \\int_0^\\infty e^{-st}f(t)\\,dt' },
    { title: 'Convolution theorem', latex: '\\mathcal{L}\\{f * g\\} = F(s) \\cdot G(s)' },
  ],
  discrete: [
    { title: 'Permutations', latex: 'P(n,k) = \\dfrac{n!}{(n-k)!}' },
    { title: 'Combinations', latex: 'C(n,k) = \\binom{n}{k} = \\dfrac{n!}{k!(n-k)!}' },
    { title: 'Inclusion–exclusion', latex: '|A \\cup B| = |A| + |B| - |A \\cap B|' },
    { title: 'Euler\'s formula (graphs)', latex: 'V - E + F = 2' },
    { title: 'Pigeonhole principle', latex: 'n+1 \\text{ items in } n \\text{ bins} \\Rightarrow \\text{one bin} \\geq 2' },
    { title: 'Sum of integers', latex: '\\sum_{k=1}^n k = \\dfrac{n(n+1)}{2}' },
  ],
  physics: [
    { title: "Newton's 2nd law", latex: 'F = ma' },
    { title: 'Kinematic equations', latex: 'v = v_0 + at,\\quad s = v_0 t + \\tfrac{1}{2}at^2' },
    { title: 'Projectile range', latex: 'R = \\dfrac{v_0^2\\sin(2\\theta)}{g}' },
    { title: 'Work-energy theorem', latex: 'W = \\Delta KE = \\dfrac{1}{2}mv^2 - \\dfrac{1}{2}mv_0^2' },
    { title: "Coulomb's law", latex: 'F = k_e\\dfrac{q_1 q_2}{r^2},\\quad k_e \\approx 8.99\\times10^9' },
    { title: 'Wave speed', latex: 'v = f\\lambda' },
    { title: "Ohm's law", latex: 'V = IR' },
    { title: 'Ideal gas law', latex: 'PV = nRT' },
  ],
};

const GRAPH_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#0ea5e9'];
const GRAPH_PRESETS = [
  { label: 'y = x²',       expr: 'y = x^2' },
  { label: 'y = sin(x)',   expr: 'y = sin(x)' },
  { label: 'y = cos(x)',   expr: 'y = cos(x)' },
  { label: 'y = e^x',     expr: 'y = e^x' },
  { label: 'y = ln(x)',   expr: 'y = log(x)' },
  { label: 'y = 1/x',    expr: 'y = 1/x' },
  { label: 'y = |x|',    expr: 'y = abs(x)' },
  { label: 'Line',       expr: 'y = 1.333333*x + 0.666667' },
  { label: 'Circle',     expr: 'x^2 + y^2 = 25' },
  { label: 'Shifted circle', expr: '(x - 2)^2 + (y + 3)^2 = 25' },
  { label: 'y = tan(x)', expr: 'y = tan(x)' },
  { label: 'x = 2',      expr: 'x = 2' },
  { label: 'Parametric circle', expr: 'x = cos(t), y = sin(t)' },
  { label: 'Spiral',            expr: 'x = t*cos(t), y = t*sin(t)' },
  { label: 'Custom f(x)',       expr: 'f(x) = x^2 - 3' },
];


function getGraphTheme() {
  const theme = document.documentElement.getAttribute('data-theme');
  const dark = theme === 'blue' || theme === 'black' || theme === 'dark';
  return {
    background: dark ? '#10192d' : '#ffffff',
    axis: dark ? '#dbe4f5' : '#111827',
    grid: dark ? '#31415e' : '#dbe4f0',
    labels: dark ? '#dbe4f5' : '#1f2937',
  };
}

function buildGraphSvg(
  expressions: GraphExpression[],
  xDomain: [number, number],
  yDomain: [number, number],
) {
  const width = 920;
  const height = 420;
  const padding = 28;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const xRange = Math.max(xDomain[1] - xDomain[0], 0.0001);
  const yRange = Math.max(yDomain[1] - yDomain[0], 0.0001);
  const theme = getGraphTheme();

  const toSvgX = (x: number) => padding + ((x - xDomain[0]) / xRange) * innerWidth;
  const toSvgY = (y: number) => height - padding - ((y - yDomain[0]) / yRange) * innerHeight;

  const sharedScope = buildSharedScope(expressions, math.evaluate);

  const evaluate = (expr: string, scope: Record<string, number>) => {
    const fullScope = Object.assign({}, sharedScope, scope);
    const result = math.evaluate(expr, fullScope);
    return typeof result === 'number' ? result : Number(result);
  };

  // Desmos-like grid: compute a "nice" step so grid lines fall on whole numbers
  const niceStep = (range: number) => {
    const raw = range / 14;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const frac = raw / mag;
    if (frac < 1.5) return mag;
    if (frac < 3.5) return 2 * mag;
    if (frac < 7.5) return 5 * mag;
    return 10 * mag;
  };
  const xStep = niceStep(xRange);
  const yStep = niceStep(yRange);

  const xAxisVisible = yDomain[0] <= 0 && yDomain[1] >= 0;
  const yAxisVisible = xDomain[0] <= 0 && xDomain[1] >= 0;
  const axisX = yAxisVisible ? toSvgX(0) : padding;
  const axisY = xAxisVisible ? toSvgY(0) : height - padding;

  // Build grid lines snapped to step multiples
  let gridLines = '';
  const xGridStart = Math.ceil(xDomain[0] / xStep) * xStep;
  const yGridStart = Math.ceil(yDomain[0] / yStep) * yStep;
  const snap = (v: number, s: number) => Math.round(v / s) * s;

  // Vertical grid lines + x-axis labels
  for (let raw = xGridStart; raw <= xDomain[1] + xStep * 0.01; raw += xStep) {
    const xv = snap(raw, xStep);
    const svgX = toSvgX(xv);
    const isOrigin = Math.abs(xv) < xStep * 0.001;
    const label = Number(xv.toFixed(6));
    const labelStr = Number.isInteger(label) ? String(label) : label.toFixed(1);
    // Grid line
    if (!isOrigin) {
      gridLines += `<line x1="${svgX.toFixed(1)}" y1="${padding}" x2="${svgX.toFixed(1)}" y2="${(height - padding).toFixed(1)}" stroke="${theme.grid}" stroke-width="0.8" opacity="0.55" />`;
    }
    // Tick on x-axis
    gridLines += `<line x1="${svgX.toFixed(1)}" y1="${(axisY - 3.5).toFixed(1)}" x2="${svgX.toFixed(1)}" y2="${(axisY + 3.5).toFixed(1)}" stroke="${theme.axis}" stroke-width="1" opacity="0.7" />`;
    // Label (near x-axis, skip origin)
    if (!isOrigin) {
      const labelY = Math.min(axisY + 16, height - padding + 14);
      gridLines += `<text x="${svgX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" fill="${theme.labels}" font-size="10" font-family="system-ui,sans-serif" opacity="0.85">${labelStr}</text>`;
    }
  }

  // Horizontal grid lines + y-axis labels
  for (let raw = yGridStart; raw <= yDomain[1] + yStep * 0.01; raw += yStep) {
    const yv = snap(raw, yStep);
    const svgY = toSvgY(yv);
    const isOrigin = Math.abs(yv) < yStep * 0.001;
    const label = Number(yv.toFixed(6));
    const labelStr = Number.isInteger(label) ? String(label) : label.toFixed(1);
    // Grid line
    if (!isOrigin) {
      gridLines += `<line x1="${padding}" y1="${svgY.toFixed(1)}" x2="${(width - padding).toFixed(1)}" y2="${svgY.toFixed(1)}" stroke="${theme.grid}" stroke-width="0.8" opacity="0.55" />`;
    }
    // Tick on y-axis
    gridLines += `<line x1="${(axisX - 3.5).toFixed(1)}" y1="${svgY.toFixed(1)}" x2="${(axisX + 3.5).toFixed(1)}" y2="${svgY.toFixed(1)}" stroke="${theme.axis}" stroke-width="1" opacity="0.7" />`;
    // Label (near y-axis, skip origin)
    if (!isOrigin) {
      const labelX = Math.max(axisX - 8, padding + 2);
      gridLines += `<text x="${labelX.toFixed(1)}" y="${(svgY + 4).toFixed(1)}" text-anchor="end" fill="${theme.labels}" font-size="10" font-family="system-ui,sans-serif" opacity="0.85">${labelStr}</text>`;
    }
  }

  // Grid intersection dots — small dots at every grid crossing (Desmos-style)
  const maxDots = 30 * 30;
  let dotCount = 0;
  let intersectionDots = '';
  for (let rx = xGridStart; rx <= xDomain[1] + xStep * 0.01 && dotCount < maxDots; rx += xStep) {
    for (let ry = yGridStart; ry <= yDomain[1] + yStep * 0.01 && dotCount < maxDots; ry += yStep) {
      const xv = snap(rx, xStep), yv = snap(ry, yStep);
      intersectionDots += `<circle cx="${toSvgX(xv).toFixed(1)}" cy="${toSvgY(yv).toFixed(1)}" r="1.3" fill="${theme.grid}" opacity="0.5" />`;
      dotCount++;
    }
  }

  // Axes with arrowheads — Desmos style
  const arr = 6;
  const markerDefs = `<defs>
    <marker id="gax" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,7 L7,3.5 z" fill="${theme.axis}" opacity="0.85" />
    </marker>
    <marker id="gay" markerWidth="7" markerHeight="7" refX="3.5" refY="7" orient="auto" markerUnits="strokeWidth">
      <path d="M0,7 L7,7 L3.5,0 z" fill="${theme.axis}" opacity="0.85" />
    </marker>
  </defs>`;

  let axisLines = '';
  // x-axis (→)
  if (xAxisVisible) {
    axisLines += `<line x1="${padding}" y1="${axisY.toFixed(1)}" x2="${(width - padding - arr).toFixed(1)}" y2="${axisY.toFixed(1)}" stroke="${theme.axis}" stroke-width="1.6" marker-end="url(#gax)" opacity="0.9" />`;
    axisLines += `<text x="${(width - padding + 4).toFixed(1)}" y="${(axisY + 4).toFixed(1)}" fill="${theme.labels}" font-size="12" font-family="system-ui,sans-serif" font-style="italic" opacity="0.85">x</text>`;
  }
  // y-axis (↑)
  if (yAxisVisible) {
    axisLines += `<line x1="${axisX.toFixed(1)}" y1="${(height - padding).toFixed(1)}" x2="${axisX.toFixed(1)}" y2="${(padding + arr).toFixed(1)}" stroke="${theme.axis}" stroke-width="1.6" marker-end="url(#gay)" opacity="0.9" />`;
    axisLines += `<text x="${(axisX + 6).toFixed(1)}" y="${(padding - 2).toFixed(1)}" fill="${theme.labels}" font-size="12" font-family="system-ui,sans-serif" font-style="italic" opacity="0.85">y</text>`;
  }
  // Origin "0" label
  if (xAxisVisible && yAxisVisible) {
    axisLines += `<text x="${(axisX - 6).toFixed(1)}" y="${(axisY + 14).toFixed(1)}" text-anchor="end" fill="${theme.labels}" font-size="10" font-family="system-ui,sans-serif" opacity="0.75">0</text>`;
  }

  const layers = expressions
    .filter(expr => expr.enabled && expr.expr.trim())
    .map(expr => {
      const normalized = normalizeGraphExpression(expr.expr);
      if (!normalized) return '';

      if (normalized.type === 'function') {
        const samples = 260;
        const segments: string[] = [];
        let current = '';
        let previous: { x: number; y: number } | null = null;

        for (let i = 0; i <= samples; i += 1) {
          const x = xDomain[0] + (xRange * i) / samples;
          let y: number;
          try {
            y = evaluate(normalized.value, { x });
          } catch {
            if (current) segments.push(current);
            current = '';
            previous = null;
            continue;
          }

          if (!Number.isFinite(y)) {
            if (current) segments.push(current);
            current = '';
            previous = null;
            continue;
          }

          const svgX = toSvgX(x);
          const svgY = toSvgY(y);
          const jumpTooLarge = previous && Math.abs(svgY - previous.y) > innerHeight * 0.75;
          if (jumpTooLarge && current) {
            segments.push(current);
            current = '';
          }

          current = current ? `${current} L ${svgX.toFixed(2)} ${svgY.toFixed(2)}` : `M ${svgX.toFixed(2)} ${svgY.toFixed(2)}`;
          previous = { x: svgX, y: svgY };
        }

        if (current) segments.push(current);
        const pathStr = segments.map(segment => `<path d="${segment}" fill="none" stroke="${expr.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />`).join('');

        // Dots on the curve at every integer x — Desmos-style snap points
        const intXStart = Math.ceil(xDomain[0]);
        const intXEnd = Math.floor(xDomain[1]);
        const dotStep = Math.max(1, Math.round((intXEnd - intXStart) / 30)); // cap at ~30 dots
        let curveDots = '';
        for (let ix = intXStart; ix <= intXEnd; ix += dotStep) {
          try {
            const y = evaluate(normalized.value, { x: ix });
            if (Number.isFinite(y) && y >= yDomain[0] - (yRange * 0.01) && y <= yDomain[1] + (yRange * 0.01)) {
              curveDots += `<circle cx="${toSvgX(ix).toFixed(2)}" cy="${toSvgY(y).toFixed(2)}" r="3.5" fill="${expr.color}" stroke="white" stroke-width="1.5" opacity="0.95" />`;
            }
          } catch { /* skip */ }
        }
        return pathStr + curveDots;
      }

      if (normalized.type === 'parametric') {
        const tSamples = 600;
        const segments: string[] = [];
        let current = '';
        for (let i = 0; i <= tSamples; i++) {
          const t = normalized.tMin + (normalized.tMax - normalized.tMin) * i / tSamples;
          try {
            const x = evaluate(normalized.valueX, { t });
            const y = evaluate(normalized.valueY, { t });
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              if (current) { segments.push(current); current = ''; }
              continue;
            }
            const sx = toSvgX(x).toFixed(2), sy = toSvgY(y).toFixed(2);
            current = current ? `${current} L ${sx} ${sy}` : `M ${sx} ${sy}`;
          } catch {
            if (current) { segments.push(current); current = ''; }
          }
        }
        if (current) segments.push(current);
        return segments.map(s => `<path d="${s}" fill="none" stroke="${expr.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />`).join('');
      }

      // Marching squares — produces clean line segments instead of sparse dots
      const MS_COLS = 160;
      const MS_ROWS = 110;

      // Step 1: sample f(x,y) at every grid point
      const grid: number[][] = [];
      for (let row = 0; row <= MS_ROWS; row++) {
        grid[row] = [];
        for (let col = 0; col <= MS_COLS; col++) {
          const x = xDomain[0] + (xRange * col) / MS_COLS;
          const y = yDomain[0] + (yRange * row) / MS_ROWS;
          try {
            const v = evaluate(normalized.value, { x, y });
            grid[row][col] = Number.isFinite(v) ? v : NaN;
          } catch {
            grid[row][col] = NaN;
          }
        }
      }

      // Step 2: walk each cell, interpolate zero-crossings on edges → draw segments
      function lerpCross(v0: number, v1: number): number {
        // t in [0,1] where linear blend of v0→v1 equals 0
        return Math.abs(v0 - v1) < 1e-12 ? 0.5 : v0 / (v0 - v1);
      }

      const msSegs: string[] = [];
      for (let row = 0; row < MS_ROWS; row++) {
        for (let col = 0; col < MS_COLS; col++) {
          const v00 = grid[row][col];
          const v10 = grid[row][col + 1];
          const v01 = grid[row + 1][col];
          const v11 = grid[row + 1][col + 1];
          if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) continue;

          const xL = xDomain[0] + (xRange * col) / MS_COLS;
          const xR = xDomain[0] + (xRange * (col + 1)) / MS_COLS;
          const yB = yDomain[0] + (yRange * row) / MS_ROWS;
          const yT = yDomain[0] + (yRange * (row + 1)) / MS_ROWS;

          const pts: { x: number; y: number }[] = [];
          // Bottom edge (y=yB)
          if ((v00 > 0) !== (v10 > 0)) {
            const t = lerpCross(v00, v10);
            pts.push({ x: xL + t * (xR - xL), y: yB });
          }
          // Right edge (x=xR)
          if ((v10 > 0) !== (v11 > 0)) {
            const t = lerpCross(v10, v11);
            pts.push({ x: xR, y: yB + t * (yT - yB) });
          }
          // Top edge (y=yT)
          if ((v01 > 0) !== (v11 > 0)) {
            const t = lerpCross(v01, v11);
            pts.push({ x: xL + t * (xR - xL), y: yT });
          }
          // Left edge (x=xL)
          if ((v00 > 0) !== (v01 > 0)) {
            const t = lerpCross(v00, v01);
            pts.push({ x: xL, y: yB + t * (yT - yB) });
          }

          if (pts.length === 2) {
            const sx0 = toSvgX(pts[0].x).toFixed(2);
            const sy0 = toSvgY(pts[0].y).toFixed(2);
            const sx1 = toSvgX(pts[1].x).toFixed(2);
            const sy1 = toSvgY(pts[1].y).toFixed(2);
            msSegs.push(`<line x1="${sx0}" y1="${sy0}" x2="${sx1}" y2="${sy1}" stroke="${expr.color}" stroke-width="2.2" stroke-linecap="round" />`);
          }
        }
      }
      return msSegs.join('');
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Math graph">
      ${markerDefs}
      <rect width="${width}" height="${height}" fill="${theme.background}" rx="14" ry="14" />
      ${gridLines}
      ${intersectionDots}
      ${axisLines}
      ${layers}
    </svg>
  `;
}

// ── KaTeX helper ──────────────────────────────────────────────────────────────

function Latex({ latex, display = false }: { latex: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode: display, throwOnError: false, trust: true, strict: false,
      });
    } catch { ref.current.textContent = latex; }
  }, [latex, display]);
  return <span ref={ref} />;
}

function WorkflowCard({ accent, title, steps }: { accent: string; title: string; steps: WorkflowStep[] }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${accent}30`,
        background: `${accent}10`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {steps.map((step, index) => (
          <div
            key={`${step.label}-${index}`}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11, color: accent, fontWeight: 700, marginBottom: 4 }}>
              {index + 1}. {step.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {step.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Unit converter data ───────────────────────────────────────────────────────

const UNIT_CATS = [
  { label: 'Length', units: [
    { id: 'm', label: 'Meters', toSI: (v: number) => v, fromSI: (v: number) => v },
    { id: 'km', label: 'Kilometers', toSI: (v: number) => v * 1000, fromSI: (v: number) => v / 1000 },
    { id: 'cm', label: 'Centimeters', toSI: (v: number) => v / 100, fromSI: (v: number) => v * 100 },
    { id: 'mm', label: 'Millimeters', toSI: (v: number) => v / 1000, fromSI: (v: number) => v * 1000 },
    { id: 'in', label: 'Inches', toSI: (v: number) => v * 0.0254, fromSI: (v: number) => v / 0.0254 },
    { id: 'ft', label: 'Feet', toSI: (v: number) => v * 0.3048, fromSI: (v: number) => v / 0.3048 },
    { id: 'mi', label: 'Miles', toSI: (v: number) => v * 1609.34, fromSI: (v: number) => v / 1609.34 },
  ]},
  { label: 'Mass', units: [
    { id: 'kg', label: 'Kilograms', toSI: (v: number) => v, fromSI: (v: number) => v },
    { id: 'g', label: 'Grams', toSI: (v: number) => v / 1000, fromSI: (v: number) => v * 1000 },
    { id: 'mg', label: 'Milligrams', toSI: (v: number) => v / 1e6, fromSI: (v: number) => v * 1e6 },
    { id: 'lb', label: 'Pounds', toSI: (v: number) => v * 0.453592, fromSI: (v: number) => v / 0.453592 },
    { id: 'oz', label: 'Ounces', toSI: (v: number) => v * 0.0283495, fromSI: (v: number) => v / 0.0283495 },
  ]},
  { label: 'Temperature', units: [
    { id: 'C', label: '°Celsius', toSI: (v: number) => v, fromSI: (v: number) => v },
    { id: 'F', label: '°Fahrenheit', toSI: (v: number) => (v - 32) * 5 / 9, fromSI: (v: number) => v * 9 / 5 + 32 },
    { id: 'K', label: 'Kelvin', toSI: (v: number) => v - 273.15, fromSI: (v: number) => v + 273.15 },
  ]},
  { label: 'Speed', units: [
    { id: 'ms', label: 'm/s', toSI: (v: number) => v, fromSI: (v: number) => v },
    { id: 'kmh', label: 'km/h', toSI: (v: number) => v / 3.6, fromSI: (v: number) => v * 3.6 },
    { id: 'mph', label: 'mph', toSI: (v: number) => v * 0.44704, fromSI: (v: number) => v / 0.44704 },
    { id: 'kn', label: 'Knots', toSI: (v: number) => v * 0.514444, fromSI: (v: number) => v / 0.514444 },
  ]},
  { label: 'Area', units: [
    { id: 'm2', label: 'm²', toSI: (v: number) => v, fromSI: (v: number) => v },
    { id: 'km2', label: 'km²', toSI: (v: number) => v * 1e6, fromSI: (v: number) => v / 1e6 },
    { id: 'ft2', label: 'ft²', toSI: (v: number) => v * 0.092903, fromSI: (v: number) => v / 0.092903 },
    { id: 'acre', label: 'Acres', toSI: (v: number) => v * 4046.86, fromSI: (v: number) => v / 4046.86 },
    { id: 'ha', label: 'Hectares', toSI: (v: number) => v * 10000, fromSI: (v: number) => v / 10000 },
  ]},
  { label: 'Volume', units: [
    { id: 'L', label: 'Litres', toSI: (v: number) => v, fromSI: (v: number) => v },
    { id: 'mL', label: 'Millilitres', toSI: (v: number) => v / 1000, fromSI: (v: number) => v * 1000 },
    { id: 'm3', label: 'm³', toSI: (v: number) => v * 1000, fromSI: (v: number) => v / 1000 },
    { id: 'gal', label: 'Gallons (US)', toSI: (v: number) => v * 3.78541, fromSI: (v: number) => v / 3.78541 },
    { id: 'pt', label: 'Pints (US)', toSI: (v: number) => v * 0.473176, fromSI: (v: number) => v / 0.473176 },
  ]},
];

const HISTORY_KEY = 'kivora-math-history';
function loadHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryItem[]; } catch { return []; }
}
function saveHistory(h: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50))); } catch { /* noop */ }
}

// ── Structured form config (all solver categories) ────────────────────────────

interface StructParam {
  key: string;
  label: string;
  unit?: string;
  placeholder?: string;
  /** 'select' = dropdown (supply options[]); 'matrix-grid' = cell grid (supply rowsKey/colsKey) */
  inputType: 'number' | 'text' | 'select' | 'matrix-grid';
  options?:  string[];
  rowsKey?:  string;
  colsKey?:  string;
}
interface StructForm {
  id: string;
  label: string;
  latexFormula: string;
  note: string;
  params: StructParam[];
  buildCommand: (p: Record<string, string>) => string;
}

// ── buildMatrix ─────────────────────────────────────────────────────────────
function buildMatrix(p: Record<string,string>, key: string, rows: number, cols: number): string {
  return '[' + Array.from({length: rows}, (_, r) =>
    '[' + Array.from({length: cols}, (_, c) => p[`${key}_${r}_${c}`]?.trim() || '0').join(',') + ']'
  ).join(',') + ']';
}

const CATEGORY_FORMS: Record<string, StructForm[]> = {

  /* ── Algebra ─────────────────────────────────────────────────────────── */
  algebra: [
    {
      id: 'quadratic',
      label: 'Solve Quadratic  (ax² + bx + c = 0)',
      latexFormula: 'ax^2 + bx + c = 0 \\quad x = \\dfrac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
      note: 'Enter all three coefficients — the solver finds both roots.',
      params: [
        { key: 'a', label: 'Coefficient a  (x²)', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'b', label: 'Coefficient b  (x)', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'c', label: 'Constant c', inputType: 'number', placeholder: 'e.g. 6' },
      ],
      buildCommand: (p) => `Solve ${p.a || '1'}x^2 + ${p.b || '0'}x + ${p.c || '0'} = 0`,
    },
    {
      id: 'linear',
      label: 'Solve Linear Equation  (ax + b = c)',
      latexFormula: 'ax + b = c',
      note: 'Enter the three values to solve for x.',
      params: [
        { key: 'a', label: 'Coefficient a', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'b', label: 'Constant b', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'c', label: 'Right-hand side c', inputType: 'number', placeholder: 'e.g. 7' },
      ],
      buildCommand: (p) => `Solve ${p.a || '1'}x + ${p.b || '0'} = ${p.c || '0'}`,
    },
    {
      id: 'factor',
      label: 'Factor a Polynomial',
      latexFormula: 'ax^2 + bx + c = (\\cdots)(\\cdots)',
      note: 'Type the polynomial to factor — e.g. 4x^2 - 9 or x^2 + 5x + 6.',
      params: [
        { key: 'expr', label: 'Polynomial expression', inputType: 'text', placeholder: 'e.g. 4x^2 - 9' },
      ],
      buildCommand: (p) => `Factor ${p.expr || ''}`,
    },
    {
      id: 'system',
      label: 'Solve a System of 2 Equations',
      latexFormula: '\\begin{cases} a_1x + b_1y = c_1 \\\\ a_2x + b_2y = c_2 \\end{cases}',
      note: 'Enter both equations using variables x and y.',
      params: [
        { key: 'eq1', label: 'Equation 1', inputType: 'text', placeholder: 'e.g. x + y = 5' },
        { key: 'eq2', label: 'Equation 2', inputType: 'text', placeholder: 'e.g. 2x - y = 4' },
      ],
            buildCommand: (p) => `Solve system: ${p.eq1 || ''}, ${p.eq2 || ''}`,
    },
    {
      id: 'completing-square',
      label: 'Complete the Square  (x² + bx + c)',
      latexFormula: 'x^2 + bx + c = (x + \\tfrac{b}{2})^2 - \\tfrac{b^2}{4} + c',
      note: 'Enter b and c in x² + bx + c.  Works for monic quadratics.',
      params: [
        { key: 'b', label: 'Coefficient b  (x)', inputType: 'number', placeholder: 'e.g. 6' },
        { key: 'c', label: 'Constant c', inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `Complete the square: x^2 + ${p.b || '0'}x + ${p.c || '0'}`,
    },
    {
      id: 'log-equation',
      label: 'Solve Logarithm Equation',
      latexFormula: '\\log_b(x) = c \\implies x = b^c',
      note: 'Enter any log equation — e.g. log(x) = 2 or log_3(x) = 4.',
      params: [
        { key: 'eq', label: 'Log equation', inputType: 'text', placeholder: 'e.g. log(x) = 2' },
      ],
      buildCommand: (p) => `Solve ${p.eq || ''}`,
    },
    {
      id: 'exp-equation',
      label: 'Solve Exponential Equation',
      latexFormula: 'a \\cdot b^x = c',
      note: 'Enter an exponential equation — the solver uses logarithms to isolate x.',
      params: [
        { key: 'eq', label: 'Exponential equation', inputType: 'text', placeholder: 'e.g. 2^x = 16' },
      ],
      buildCommand: (p) => `Solve ${p.eq || ''}`,
    },
    {
      id: 'inequality',
      label: 'Solve an Inequality',
      latexFormula: 'ax + b \\leq c \\quad \\text{or} \\quad ax^2+bx+c \\geq 0',
      note: 'Enter the inequality — linear or quadratic.',
      params: [
        { key: 'ineq', label: 'Inequality', inputType: 'text', placeholder: 'e.g. 2x - 3 < 7' },
      ],
      buildCommand: (p) => `Solve inequality: ${p.ineq || ''}`,
    },
    {
      id: 'rational-expr',
      label: 'Simplify a Rational Expression',
      latexFormula: '\\dfrac{P(x)}{Q(x)} = \\cdots',
      note: 'Enter the expression to simplify by factoring numerator and denominator.',
      params: [
        { key: 'expr', label: 'Rational expression', inputType: 'text', placeholder: 'e.g. (x^2 - 4)/(x - 2)' },
      ],
      buildCommand: (p) => `Simplify ${p.expr || ''}`,
    },
  ],

  /* ── Calculus ────────────────────────────────────────────────────────── */
  calculus: [
    {
      id: 'differentiate',
      label: 'Differentiate  f(x)',
      latexFormula: '\\dfrac{d}{dx}\\bigl[f(x)\\bigr]',
      note: 'Enter the function — the solver applies differentiation rules step by step.',
      params: [
        { key: 'fx', label: 'Function f(x)', inputType: 'text', placeholder: 'e.g. x^3 * sin(x)' },
      ],
      buildCommand: (p) => `Differentiate ${p.fx || ''}`,
    },
    {
      id: 'integrate',
      label: 'Integrate  f(x) dx  (indefinite)',
      latexFormula: '\\int f(x)\\,dx',
      note: 'Enter the integrand — the solver finds the antiderivative and adds + C.',
      params: [
        { key: 'fx', label: 'Function f(x)', inputType: 'text', placeholder: 'e.g. x^2 * ln(x)' },
      ],
      buildCommand: (p) => `Integrate ${p.fx || ''} dx`,
    },
    {
      id: 'limit',
      label: 'Evaluate a Limit',
      latexFormula: '\\lim_{x \\to a} f(x)',
      note: 'Enter f(x) and the value x approaches. Use "inf" for infinity.',
      params: [
        { key: 'fx', label: 'Function f(x)', inputType: 'text', placeholder: 'e.g. sin(x)/x' },
        { key: 'approach', label: 'x approaches', inputType: 'text', placeholder: 'e.g. 0' },
      ],
      buildCommand: (p) => `Limit of ${p.fx || ''} as x → ${p.approach || '0'}`,
    },
    {
      id: 'critical',
      label: 'Find Critical Points  (f′(x) = 0)',
      latexFormula: "f'(x) = 0",
      note: 'Enter f(x) to find where the derivative is zero — local maxima and minima.',
      params: [
        { key: 'fx', label: 'Function f(x)', inputType: 'text', placeholder: 'e.g. x^3 - 3x' },
      ],
            buildCommand: (p) => `Find critical points of f(x) = ${p.fx || ''}`,
    },
    {
      id: 'second-deriv',
      label: "Second Derivative  f″(x)",
      latexFormula: "\\dfrac{d^2}{dx^2}\\bigl[f(x)\\bigr]",
      note: "Enter f(x) — the solver differentiates twice and simplifies.",
      params: [
        { key: 'fx', label: 'Function f(x)', inputType: 'text', placeholder: 'e.g. x^4 - 3x^2' },
      ],
      buildCommand: (p) => `Second derivative of ${p.fx || ''}`,
    },
    {
      id: 'definite-integral',
      label: 'Definite Integral  ∫ₐᵇ f(x) dx',
      latexFormula: '\\int_a^b f(x)\\,dx',
      note: 'Enter f(x) and the bounds a and b to evaluate the definite integral.',
      params: [
        { key: 'fx', label: 'Integrand f(x)', inputType: 'text', placeholder: 'e.g. x^2' },
        { key: 'a',  label: 'Lower bound a',  inputType: 'number', placeholder: 'e.g. 0' },
        { key: 'b',  label: 'Upper bound b',  inputType: 'number', placeholder: 'e.g. 1' },
      ],
      buildCommand: (p) => `Integral from ${p.a || '0'} to ${p.b || '1'} of ${p.fx || ''} dx`,
    },
    {
      id: 'lhopital',
      label: "L’Hôpital’s Rule",
      latexFormula: "\\lim_{x\\to a}\\dfrac{f(x)}{g(x)} = \\lim_{x\\to a}\\dfrac{f'(x)}{g'(x)}",
      note: "Enter the quotient f(x)/g(x) and the point of indeterminate form (0/0 or ∞/∞).",
      params: [
        { key: 'fx', label: 'Quotient  f(x)/g(x)', inputType: 'text', placeholder: 'e.g. sin(x)/x' },
        { key: 'at', label: 'x approaches',        inputType: 'text', placeholder: 'e.g. 0' },
      ],
      buildCommand: (p) => `L'Hopital limit of ${p.fx || ''} as x approaches ${p.at || '0'}`,
    },
  ],

  /* ── Geometry ───────────────────────────────────────────────────────── */
  geometry: [
    {
      id: 'triangle-area',
      label: "Triangle Area  (Heron's Formula)",
      latexFormula: 'A = \\sqrt{s(s-a)(s-b)(s-c)},\\quad s=\\tfrac{a+b+c}{2}',
      note: 'Enter all three side lengths to compute the area.',
      params: [
        { key: 'a', label: 'Side a', unit: 'units', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'b', label: 'Side b', unit: 'units', inputType: 'number', placeholder: 'e.g. 4' },
        { key: 'c', label: 'Side c', unit: 'units', inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `Area of triangle with sides ${p.a}, ${p.b}, ${p.c}`,
    },
    {
      id: 'circle',
      label: 'Circle Equation  (x−h)² + (y−k)² = r²',
      latexFormula: '(x-h)^2 + (y-k)^2 = r^2',
      note: 'Enter the center coordinates and radius to get the standard equation.',
      params: [
        { key: 'h', label: 'Center x  (h)', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'k', label: 'Center y  (k)', inputType: 'number', placeholder: 'e.g. -3' },
        { key: 'r', label: 'Radius r', unit: 'units', inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `Equation of circle: center (${p.h},${p.k}), radius ${p.r}`,
    },
    {
      id: 'distance',
      label: 'Distance Between Two Points',
      latexFormula: 'd = \\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}',
      note: 'Enter the coordinates of both points.',
      params: [
        { key: 'x1', label: 'Point A  x₁', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'y1', label: 'Point A  y₁', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'x2', label: 'Point B  x₂', inputType: 'number', placeholder: 'e.g. 4' },
        { key: 'y2', label: 'Point B  y₂', inputType: 'number', placeholder: 'e.g. 6' },
      ],
      buildCommand: (p) => `Distance between (${p.x1},${p.y1}) and (${p.x2},${p.y2})`,
    },
    {
      id: 'midpoint',
      label: 'Midpoint of a Segment',
      latexFormula: 'M = \\left(\\tfrac{x_1+x_2}{2},\\tfrac{y_1+y_2}{2}\\right)',
      note: 'Enter two points to find the midpoint and the segment they define.',
      params: [
        { key: 'x1', label: 'Point A  x₁', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'y1', label: 'Point A  y₁', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'x2', label: 'Point B  x₂', inputType: 'number', placeholder: 'e.g. 4' },
        { key: 'y2', label: 'Point B  y₂', inputType: 'number', placeholder: 'e.g. 6' },
      ],
      buildCommand: (p) => `Midpoint of (${p.x1},${p.y1}) and (${p.x2},${p.y2})`,
    },
    {
      id: 'line-through-points',
      label: 'Line Through Two Points',
      latexFormula: 'm = \\dfrac{y_2-y_1}{x_2-x_1},\\quad y-y_1=m(x-x_1)',
      note: 'Enter two points to build the line equation and plot it in the graph tab.',
      params: [
        { key: 'x1', label: 'Point A  x₁', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'y1', label: 'Point A  y₁', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'x2', label: 'Point B  x₂', inputType: 'number', placeholder: 'e.g. 4' },
        { key: 'y2', label: 'Point B  y₂', inputType: 'number', placeholder: 'e.g. 6' },
      ],
      buildCommand: (p) => `Line through (${p.x1},${p.y1}) and (${p.x2},${p.y2})`,
    },
    {
      id: 'sphere',
      label: 'Volume of a Sphere',
      latexFormula: 'V = \\tfrac{4}{3}\\pi r^3',
      note: 'Enter the radius to compute the volume.',
      params: [
        { key: 'r', label: 'Radius r', unit: 'units', inputType: 'number', placeholder: 'e.g. 7' },
      ],
            buildCommand: (p) => `Volume of sphere with radius ${p.r}`,
    },
    {
      id: 'pythagorean',
      label: 'Pythagorean Theorem  (a² + b² = c²)',
      latexFormula: 'c = \\sqrt{a^2 + b^2}',
      note: 'Enter any two values — leave the third blank and the solver finds it.',
      params: [
        { key: 'a', label: 'Leg a', unit: 'units', inputType: 'number', placeholder: 'leave blank to solve' },
        { key: 'b', label: 'Leg b', unit: 'units', inputType: 'number', placeholder: 'leave blank to solve' },
        { key: 'c', label: 'Hypotenuse c', unit: 'units', inputType: 'number', placeholder: 'leave blank to solve' },
      ],
      buildCommand: (p) => `Pythagorean theorem a=${p.a || ''} b=${p.b || ''} c=${p.c || ''}`,
    },
    {
      id: 'triangle-bh',
      label: 'Triangle Area  (base × height)',
      latexFormula: 'A = \\tfrac{1}{2} b h',
      note: 'Enter base and perpendicular height to compute the area.',
      params: [
        { key: 'base', label: 'Base b',   unit: 'units', inputType: 'number', placeholder: 'e.g. 8' },
        { key: 'h',    label: 'Height h', unit: 'units', inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `Area of triangle base ${p.base || ''} height ${p.h || ''}`,
    },
    {
      id: 'rectangle',
      label: 'Rectangle Area & Perimeter',
      latexFormula: 'A = lw,\\quad P = 2(l+w)',
      note: 'Enter length and width to get both area and perimeter.',
      params: [
        { key: 'l', label: 'Length l', unit: 'units', inputType: 'number', placeholder: 'e.g. 6' },
        { key: 'w', label: 'Width w',  unit: 'units', inputType: 'number', placeholder: 'e.g. 9' },
      ],
      buildCommand: (p) => `Area and perimeter of rectangle ${p.l || ''} ${p.w || ''}`,
    },
    {
      id: 'cylinder',
      label: 'Cylinder Volume',
      latexFormula: 'V = \\pi r^2 h',
      note: 'Enter radius and height to compute the volume.',
      params: [
        { key: 'r', label: 'Radius r', unit: 'units', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'h', label: 'Height h', unit: 'units', inputType: 'number', placeholder: 'e.g. 10' },
      ],
      buildCommand: (p) => `Volume of cylinder radius ${p.r || ''} height ${p.h || ''}`,
    },
    {
      id: 'cone',
      label: 'Cone Volume',
      latexFormula: 'V = \\tfrac{1}{3}\\pi r^2 h',
      note: 'Enter radius and height to compute the volume.',
      params: [
        { key: 'r', label: 'Radius r', unit: 'units', inputType: 'number', placeholder: 'e.g. 4' },
        { key: 'h', label: 'Height h', unit: 'units', inputType: 'number', placeholder: 'e.g. 9' },
      ],
      buildCommand: (p) => `Volume of cone radius ${p.r || ''} height ${p.h || ''}`,
    },
    {
      id: 'sector',
      label: 'Sector Area',
      latexFormula: 'A = \\tfrac{1}{2}r^2\\theta',
      note: 'Enter radius and angle θ in degrees to compute the sector area.',
      params: [
        { key: 'r',     label: 'Radius r', unit: 'units', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'theta', label: 'Angle θ',  unit: '°',    inputType: 'number', placeholder: 'e.g. 60' },
      ],
      buildCommand: (p) => `Sector area radius ${p.r || ''} angle ${p.theta || ''}`,
    },
  ],

  /* ── Trigonometry ───────────────────────────────────────────────────── */
  trigonometry: [
    {
      id: 'solve-trig',
      label: 'Solve a Trig Equation',
      latexFormula: 'f(x) = c, \\quad x \\in [0,\\, 2\\pi]',
      note: 'Enter the equation — the solver finds all solutions in [0, 2π].',
      params: [
        { key: 'eq', label: 'Trig equation', inputType: 'text', placeholder: 'e.g. 2 sin(x) = 1' },
      ],
      buildCommand: (p) => `Solve ${p.eq || ''} for x in [0, 2π]`,
    },
    {
      id: 'exact-value',
      label: 'Find an Exact Trig Value',
      latexFormula: '\\cos 75^\\circ,\\; \\sin\\tfrac{\\pi}{3},\\; \\tan 45^\\circ \\ldots',
      note: 'Type an expression like cos(75°) or sin(π/3) to get the exact value.',
      params: [
        { key: 'expr', label: 'Expression', inputType: 'text', placeholder: 'e.g. cos(75°)' },
      ],
      buildCommand: (p) => `Find ${p.expr || ''} exactly`,
    },
    {
      id: 'solve-triangle',
      label: 'Solve a Triangle  (SAS)',
      latexFormula: 'c^2 = a^2 + b^2 - 2ab\\cos C',
      note: 'Enter two sides and the angle between them (law of cosines).',
      params: [
        { key: 'a', label: 'Side a', unit: 'units', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'b', label: 'Side b', unit: 'units', inputType: 'number', placeholder: 'e.g. 7' },
        { key: 'C', label: 'Included angle C', unit: '°', inputType: 'number', placeholder: 'e.g. 60' },
      ],
      buildCommand: (p) => `Solve triangle: a=${p.a}, b=${p.b}, C=${p.C}°`,
    },
    {
      id: 'identity',
      label: 'Simplify a Trig Identity',
      latexFormula: '\\sin^2 x + \\cos^2 x = 1',
      note: 'Enter a trig expression to simplify or verify.',
      params: [
        { key: 'expr', label: 'Trig expression', inputType: 'text', placeholder: 'e.g. sin^2(x) + cos^2(x)' },
      ],
            buildCommand: (p) => `Simplify ${p.expr || ''}`,
    },
    {
      id: 'inverse-trig',
      label: 'Inverse Trig  (arcsin / arccos / arctan)',
      latexFormula: '\\arcsin(x),\\; \\arccos(x),\\; \\arctan(x)',
      note: 'Enter an inverse trig expression — result given in both radians and degrees.',
      params: [
        { key: 'expr', label: 'Expression', inputType: 'text', placeholder: 'e.g. arcsin(0.5)' },
      ],
      buildCommand: (p) => `Evaluate ${p.expr || ''}`,
    },
    {
      id: 'law-sines',
      label: 'Law of Sines  (SSA / AAS)',
      latexFormula: '\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}',
      note: 'Enter two angles A, B (degrees) and side a opposite to angle A.',
      params: [
        { key: 'A', label: 'Angle A', unit: '°', inputType: 'number', placeholder: 'e.g. 40' },
        { key: 'B', label: 'Angle B', unit: '°', inputType: 'number', placeholder: 'e.g. 60' },
        { key: 'a', label: 'Side a  (opp. A)', unit: 'units', inputType: 'number', placeholder: 'e.g. 7' },
      ],
      buildCommand: (p) => `Law of sines A=${p.A || ''}° B=${p.B || ''}° a=${p.a || ''}`,
    },
    {
      id: 'law-cosines',
      label: 'Law of Cosines  (SAS / SSS)',
      latexFormula: 'c^2 = a^2 + b^2 - 2ab\\cos C',
      note: 'Enter sides a, b and included angle C (degrees) to find side c and other angles.',
      params: [
        { key: 'a', label: 'Side a', unit: 'units', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'b', label: 'Side b', unit: 'units', inputType: 'number', placeholder: 'e.g. 7' },
        { key: 'C', label: 'Angle C', unit: '°', inputType: 'number', placeholder: 'e.g. 60' },
      ],
      buildCommand: (p) => `Law of cosines a=${p.a || ''} b=${p.b || ''} C=${p.C || ''}°`,
    },
    {
      id: 'deg-rad',
      label: 'Degrees ↔ Radians',
      latexFormula: '\\theta_{\\text{rad}} = \\theta_{\\text{deg}} \\times \\dfrac{\\pi}{180}',
      note: 'Enter a value and choose the conversion direction.',
      params: [
        { key: 'value', label: 'Angle value',  inputType: 'number', placeholder: 'e.g. 45' },
        { key: 'dir',   label: 'Convert from', inputType: 'select', options: ['degrees to radians', 'radians to degrees'] },
      ],
      buildCommand: (p) => `${p.dir || 'degrees to radians'} ${p.value || ''}`,
    },
    {
      id: 'amp-period',
      label: 'Amplitude & Period',
      latexFormula: 'y = A\\sin(Bx),\\quad T = \\dfrac{2\\pi}{|B|}',
      note: 'Enter A (amplitude) and B (angular frequency) to find the period.',
      params: [
        { key: 'A', label: 'Amplitude A',           inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'B', label: 'Angular frequency B',    inputType: 'number', placeholder: 'e.g. 2' },
      ],
      buildCommand: (p) => `Amplitude ${p.A || ''} period of sin(${p.B || '1'}x)`,
    },
  ],

  /* ── Statistics ─────────────────────────────────────────────────────── */
  statistics: [
    {
      id: 'mean-sd',
      label: 'Mean & Standard Deviation',
      latexFormula: '\\bar{x} = \\dfrac{\\sum x_i}{n}, \\quad \\sigma = \\sqrt{\\dfrac{\\sum(x_i-\\bar{x})^2}{n}}',
      note: 'Enter a comma-separated list of numbers.',
      params: [
        { key: 'data', label: 'Data values  (comma-separated)', inputType: 'text', placeholder: 'e.g. 4, 8, 15, 16, 23, 42' },
      ],
      buildCommand: (p) => `Mean and SD of [${p.data || ''}]`,
    },
    {
      id: 'binomial',
      label: 'Binomial Probability  P(X = k)',
      latexFormula: 'P(X=k) = \\binom{n}{k}p^k(1-p)^{n-k}',
      note: 'Enter the number of trials n, successes k, and probability p.',
      params: [
        { key: 'n', label: 'Trials n', inputType: 'number', placeholder: 'e.g. 10' },
        { key: 'k', label: 'Successes k', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'p', label: 'Probability p', unit: '(0 to 1)', inputType: 'number', placeholder: 'e.g. 0.4' },
      ],
      buildCommand: (p) => `Binomial P(X=${p.k}) with n=${p.n}, p=${p.p}`,
    },
    {
      id: 'confidence',
      label: 'Confidence Interval for Mean',
      latexFormula: 'CI = \\bar{x} \\pm z_{\\alpha/2} \\cdot \\dfrac{s}{\\sqrt{n}}',
      note: 'Enter sample size, sample mean, and sample standard deviation.',
      params: [
        { key: 'n', label: 'Sample size n', inputType: 'number', placeholder: 'e.g. 25' },
        { key: 'xbar', label: 'Sample mean x̄', inputType: 'number', placeholder: 'e.g. 50' },
        { key: 's', label: 'Std deviation s', inputType: 'number', placeholder: 'e.g. 8' },
      ],
      buildCommand: (p) => `Confidence interval for mean, n=${p.n}, x̄=${p.xbar}, s=${p.s}`,
    },
    {
      id: 'variance',
      label: 'Variance / Standard Deviation',
      latexFormula: '\\sigma^2 = \\dfrac{\\sum (x_i-\\bar{x})^2}{n},\\quad \\sigma = \\sqrt{\\sigma^2}',
      note: 'Enter a comma-separated list to compute variance or standard deviation from the same dataset.',
      params: [
        { key: 'data', label: 'Data values  (comma-separated)', inputType: 'text', placeholder: 'e.g. 4, 7, 13, 2, 8' },
        { key: 'mode', label: 'Measure', inputType: 'text', placeholder: 'variance or std' },
      ],
            buildCommand: (p) => `${(p.mode || 'variance').trim()}([${p.data || ''}])`,
    },
    {
      id: 'median-mode',
      label: 'Median, Mode & Range',
      latexFormula: '\\text{Median: middle value},\\quad \\text{Range: }x_{\\max}-x_{\\min}',
      note: 'Enter a comma-separated dataset to find median, mode, and range.',
      params: [
        { key: 'data', label: 'Data values  (comma-separated)', inputType: 'text', placeholder: 'e.g. 4, 7, 7, 13, 2, 8' },
      ],
      buildCommand: (p) => `Median, mode, and range of [${p.data || ''}]`,
    },
    {
      id: 'comb-perm',
      label: 'Combinations C(n,r) & Permutations P(n,r)',
      latexFormula: 'C(n,r) = \\dfrac{n!}{r!(n-r)!},\\quad P(n,r) = \\dfrac{n!}{(n-r)!}',
      note: 'Enter n and r — the solver computes both C(n,r) and P(n,r).',
      params: [
        { key: 'n', label: 'Total items n', inputType: 'number', placeholder: 'e.g. 10' },
        { key: 'r', label: 'Choose r',      inputType: 'number', placeholder: 'e.g. 3' },
      ],
      buildCommand: (p) => `Combinations and permutations n=${p.n || ''} r=${p.r || ''}`,
    },
  ],

  /* ── Sequences & Series ─────────────────────────────────────────────── */
  'sequences-series': [
    {
      id: 'arithmetic-nth',
      label: 'Arithmetic nth Term',
      latexFormula: 'a_n = a_1 + (n-1)d',
      note: 'Enter the first term, common difference, and the term number n.',
      params: [
        { key: 'a1', label: 'First term a₁', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'd', label: 'Common difference d', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'n', label: 'Term number n', inputType: 'number', placeholder: 'e.g. 10' },
      ],
      buildCommand: (p) => `arithmetic nth ${p.a1 || ''} ${p.d || ''} ${p.n || ''}`,
    },
    {
      id: 'arithmetic-sum',
      label: 'Arithmetic Series Sum',
      latexFormula: 'S_n = \\dfrac{n}{2}(a_1+a_n)',
      note: 'Enter the first term, common difference, and number of terms.',
      params: [
        { key: 'a1', label: 'First term a₁', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'd', label: 'Common difference d', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'n', label: 'Number of terms n', inputType: 'number', placeholder: 'e.g. 10' },
      ],
      buildCommand: (p) => `arithmetic sum ${p.a1 || ''} ${p.d || ''} ${p.n || ''}`,
    },
    {
      id: 'geometric-nth',
      label: 'Geometric nth Term',
      latexFormula: 'a_n = a_1 r^{n-1}',
      note: 'Enter the first term, common ratio, and the term number n.',
      params: [
        { key: 'a1', label: 'First term a₁', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'r', label: 'Common ratio r', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'n', label: 'Term number n', inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `geometric nth ${p.a1 || ''} ${p.r || ''} ${p.n || ''}`,
    },
    {
      id: 'geometric-sum',
      label: 'Geometric Series Sum',
      latexFormula: 'S_n = a_1\\dfrac{1-r^n}{1-r}',
      note: 'Enter the first term, common ratio, and number of terms.',
      params: [
        { key: 'a1', label: 'First term a₁', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'r', label: 'Common ratio r', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'n', label: 'Number of terms n', inputType: 'number', placeholder: 'e.g. 5' },
      ],
            buildCommand: (p) => `geometric sum ${p.a1 || ''} ${p.r || ''} ${p.n || ''}`,
    },
    {
      id: 'geo-sum-inf',
      label: 'Geometric Sum to Infinity  (|r| < 1)',
      latexFormula: 'S_\\infty = \\dfrac{a_1}{1 - r}, \\quad |r| < 1',
      note: 'Converges only when |r| < 1. Enter the first term and common ratio.',
      params: [
        { key: 'a1', label: 'First term a₁', inputType: 'number', placeholder: 'e.g. 4' },
        { key: 'r',  label: 'Common ratio r', inputType: 'number', placeholder: 'e.g. 0.5' },
      ],
      buildCommand: (p) => `Geometric series sum to infinity a=${p.a1 || ''} r=${p.r || ''}`,
    },
    {
      id: 'identify-seq',
      label: 'Identify Sequence Type',
      latexFormula: '\\text{Arithmetic? Geometric? Neither?}',
      note: 'Enter the first few terms — the solver checks for a common difference or ratio.',
      params: [
        { key: 'terms', label: 'First few terms  (comma-separated)', inputType: 'text', placeholder: 'e.g. 2, 6, 18, 54' },
      ],
      buildCommand: (p) => `Identify sequence type: ${p.terms || ''}`,
    },
  ],

  /* ── Linear Algebra ─────────────────────────────────────────────────── */
  'linear-algebra': [
    {
      id: 'eigenvalues',
      label: 'Eigenvalues of a 2×2 Matrix',
      latexFormula: '\\det(A - \\lambda I) = 0',
      note: 'Enter all four entries of the 2×2 matrix row by row.',
      params: [
        { key: 'a', label: 'Row 1 →  a', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'b', label: 'Row 1 →  b', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'c', label: 'Row 2 →  c', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'd', label: 'Row 2 →  d', inputType: 'number', placeholder: 'e.g. 2' },
      ],
      buildCommand: (p) => `Eigenvalues of [[${p.a},${p.b}],[${p.c},${p.d}]]`,
    },
    {
      id: 'determinant',
      label: 'Determinant of a 3×3 Matrix',
      latexFormula: '\\det\\begin{pmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{pmatrix}',
      note: 'Enter all nine entries row by row.',
      params: [
        { key: 'a11', label: 'Row 1 →  a', inputType: 'number', placeholder: '1' },
        { key: 'a12', label: 'Row 1 →  b', inputType: 'number', placeholder: '2' },
        { key: 'a13', label: 'Row 1 →  c', inputType: 'number', placeholder: '3' },
        { key: 'a21', label: 'Row 2 →  d', inputType: 'number', placeholder: '4' },
        { key: 'a22', label: 'Row 2 →  e', inputType: 'number', placeholder: '5' },
        { key: 'a23', label: 'Row 2 →  f', inputType: 'number', placeholder: '6' },
        { key: 'a31', label: 'Row 3 →  g', inputType: 'number', placeholder: '7' },
        { key: 'a32', label: 'Row 3 →  h', inputType: 'number', placeholder: '8' },
        { key: 'a33', label: 'Row 3 →  i', inputType: 'number', placeholder: '9' },
      ],
      buildCommand: (p) => `Determinant of [[${p.a11},${p.a12},${p.a13}],[${p.a21},${p.a22},${p.a23}],[${p.a31},${p.a32},${p.a33}]]`,
    },
    {
      id: 'solve-axb',
      label: 'Solve  Ax = b  (2×2 System)',
      latexFormula: 'A\\mathbf{x} = \\mathbf{b} \\implies \\mathbf{x} = A^{-1}\\mathbf{b}',
      note: 'Enter the 2×2 matrix A and the right-hand side vector b.',
      params: [
        { key: 'a11', label: 'A  row 1, col 1', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'a12', label: 'A  row 1, col 2', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'a21', label: 'A  row 2, col 1', inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'a22', label: 'A  row 2, col 2', inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'b1', label: 'b₁', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'b2', label: 'b₂', inputType: 'number', placeholder: 'e.g. 10' },
      ],
      buildCommand: (p) => `Solve Ax=b: A=[[${p.a11},${p.a12}],[${p.a21},${p.a22}]], b=[${p.b1},${p.b2}]`,
    },
    {
      id: 'dot-product',
      label: 'Dot Product of Two Vectors',
      latexFormula: '\\mathbf{u} \\cdot \\mathbf{v} = \\sum u_i v_i',
      note: 'Enter two comma-separated vectors of the same length.',
      params: [
        { key: 'u', label: 'Vector u', inputType: 'text', placeholder: 'e.g. 1, 2, 3' },
        { key: 'v', label: 'Vector v', inputType: 'text', placeholder: 'e.g. 4, 5, 6' },
      ],
      buildCommand: (p) => `Dot product of [${p.u || ''}] and [${p.v || ''}]`,
    },
  ],

    /* ── Vectors ──────────────────────────────────────────────────────────────────── */
  vectors: [
    { id: 'vec-add-2d', label: 'Add / Subtract  (2D)', latexFormula: '\\mathbf{a} \\pm \\mathbf{b}', note: 'Enter x, y for each vector; pick + or −.',
      params: [
        { key: 'op', label: 'Operation', inputType: 'select', options: ['+', '-'] },
        { key: 'A_0', label: 'a₁ (x)', inputType: 'number', placeholder: '0' },
        { key: 'A_1', label: 'a₂ (y)', inputType: 'number', placeholder: '0' },
        { key: 'B_0', label: 'b₁ (x)', inputType: 'number', placeholder: '0' },
        { key: 'B_1', label: 'b₂ (y)', inputType: 'number', placeholder: '0' },
      ],
      buildCommand: (p) => `[${p.A_0||'0'}, ${p.A_1||'0'}] ${p.op||'+'} [${p.B_0||'0'}, ${p.B_1||'0'}]`,
    },
    { id: 'vec-add-3d', label: 'Add / Subtract  (3D)', latexFormula: '\\mathbf{a} \\pm \\mathbf{b}', note: 'Enter x, y, z for each vector; pick + or −.',
      params: [
        { key: 'op', label: 'Operation', inputType: 'select', options: ['+', '-'] },
        { key: 'A_0', label: 'a₁ (x)', inputType: 'number', placeholder: '0' },
        { key: 'A_1', label: 'a₂ (y)', inputType: 'number', placeholder: '0' },
        { key: 'A_2', label: 'a₃ (z)', inputType: 'number', placeholder: '0' },
        { key: 'B_0', label: 'b₁ (x)', inputType: 'number', placeholder: '0' },
        { key: 'B_1', label: 'b₂ (y)', inputType: 'number', placeholder: '0' },
        { key: 'B_2', label: 'b₃ (z)', inputType: 'number', placeholder: '0' },
      ],
      buildCommand: (p) => `[${p.A_0||'0'}, ${p.A_1||'0'}, ${p.A_2||'0'}] ${p.op||'+'} [${p.B_0||'0'}, ${p.B_1||'0'}, ${p.B_2||'0'}]`,
    },
    { id: 'vec-dot-2d', label: 'Dot Product  (2D)', latexFormula: '\\mathbf{a}\\cdot\\mathbf{b}', note: 'Scalar = a₁b₁ + a₂b₂.',
      params: [
        { key: 'A_0', label: 'a₁', inputType: 'number', placeholder: '0' },
        { key: 'A_1', label: 'a₂', inputType: 'number', placeholder: '0' },
        { key: 'B_0', label: 'b₁', inputType: 'number', placeholder: '0' },
        { key: 'B_1', label: 'b₂', inputType: 'number', placeholder: '0' },
      ],
      buildCommand: (p) => `dot([${p.A_0||'0'}, ${p.A_1||'0'}], [${p.B_0||'0'}, ${p.B_1||'0'}])`,
    },
    { id: 'vec-dot-3d', label: 'Dot Product  (3D)', latexFormula: '\\mathbf{a}\\cdot\\mathbf{b}', note: 'Scalar = a₁b₁ + a₂b₂ + a₃b₃.',
      params: [
        { key: 'A_0', label: 'a₁', inputType: 'number', placeholder: '0' },
        { key: 'A_1', label: 'a₂', inputType: 'number', placeholder: '0' },
        { key: 'A_2', label: 'a₃', inputType: 'number', placeholder: '0' },
        { key: 'B_0', label: 'b₁', inputType: 'number', placeholder: '0' },
        { key: 'B_1', label: 'b₂', inputType: 'number', placeholder: '0' },
        { key: 'B_2', label: 'b₃', inputType: 'number', placeholder: '0' },
      ],
      buildCommand: (p) => `dot([${p.A_0||'0'}, ${p.A_1||'0'}, ${p.A_2||'0'}], [${p.B_0||'0'}, ${p.B_1||'0'}, ${p.B_2||'0'}])`,
    },
    { id: 'vec-cross', label: 'Cross Product  (3D)', latexFormula: '\\mathbf{a}\\times\\mathbf{b}', note: 'Returns a vector perpendicular to both inputs.',
      params: [
        { key: 'A_0', label: 'a₁', inputType: 'number', placeholder: '0' },
        { key: 'A_1', label: 'a₂', inputType: 'number', placeholder: '0' },
        { key: 'A_2', label: 'a₃', inputType: 'number', placeholder: '0' },
        { key: 'B_0', label: 'b₁', inputType: 'number', placeholder: '0' },
        { key: 'B_1', label: 'b₂', inputType: 'number', placeholder: '0' },
        { key: 'B_2', label: 'b₃', inputType: 'number', placeholder: '0' },
      ],
      buildCommand: (p) => `cross([${p.A_0||'0'}, ${p.A_1||'0'}, ${p.A_2||'0'}], [${p.B_0||'0'}, ${p.B_1||'0'}, ${p.B_2||'0'}])`,
    },
    { id: 'vec-mag-2d', label: 'Magnitude  (2D)', latexFormula: '|\\mathbf{a}|', note: 'Magnitude = √(x²+y²).',
      params: [{ key: 'A_0', label: 'x', inputType: 'number', placeholder: '3' }, { key: 'A_1', label: 'y', inputType: 'number', placeholder: '4' }],
      buildCommand: (p) => `norm([${p.A_0||'0'}, ${p.A_1||'0'}])`,
    },
    { id: 'vec-mag-3d', label: 'Magnitude  (3D)', latexFormula: '|\\mathbf{a}|', note: 'Magnitude = √(x²+y²+z²).',
      params: [{ key: 'A_0', label: 'x', inputType: 'number', placeholder: '1' }, { key: 'A_1', label: 'y', inputType: 'number', placeholder: '2' }, { key: 'A_2', label: 'z', inputType: 'number', placeholder: '2' }],
      buildCommand: (p) => `norm([${p.A_0||'0'}, ${p.A_1||'0'}, ${p.A_2||'0'}])`,
    },
    { id: 'vec-angle-2d', label: 'Angle Between  (2D)', latexFormula: '\\theta = \\cos^{-1}\\left(\\frac{\\mathbf{a}\\cdot\\mathbf{b}}{|\\mathbf{a}||\\mathbf{b}|}\\right)', note: 'Returns the angle in degrees.',
      params: [
        { key: 'A_0', label: 'a₁ (x)', inputType: 'number', placeholder: '1' },
        { key: 'A_1', label: 'a₂ (y)', inputType: 'number', placeholder: '0' },
        { key: 'B_0', label: 'b₁ (x)', inputType: 'number', placeholder: '0' },
        { key: 'B_1', label: 'b₂ (y)', inputType: 'number', placeholder: '1' },
      ],
      buildCommand: (p) => `angle between [${p.A_0||'0'}, ${p.A_1||'0'}] [${p.B_0||'0'}, ${p.B_1||'0'}]`,
    },
    { id: 'vec-angle-3d', label: 'Angle Between  (3D)', latexFormula: '\\theta = \\cos^{-1}\\left(\\frac{\\mathbf{a}\\cdot\\mathbf{b}}{|\\mathbf{a}||\\mathbf{b}|}\\right)', note: 'Returns the angle in degrees.',
      params: [
        { key: 'A_0', label: 'a₁', inputType: 'number', placeholder: '1' },
        { key: 'A_1', label: 'a₂', inputType: 'number', placeholder: '2' },
        { key: 'A_2', label: 'a₃', inputType: 'number', placeholder: '3' },
        { key: 'B_0', label: 'b₁', inputType: 'number', placeholder: '4' },
        { key: 'B_1', label: 'b₂', inputType: 'number', placeholder: '5' },
        { key: 'B_2', label: 'b₃', inputType: 'number', placeholder: '6' },
      ],
      buildCommand: (p) => `angle between [${p.A_0||'0'}, ${p.A_1||'0'}, ${p.A_2||'0'}] [${p.B_0||'0'}, ${p.B_1||'0'}, ${p.B_2||'0'}]`,
    },
    { id: 'vec-unit-2d', label: 'Unit Vector  (2D)', latexFormula: '\\hat{\\mathbf{a}} = \\frac{\\mathbf{a}}{|\\mathbf{a}|}', note: 'Normalizes the vector to length 1.',
      params: [
        { key: 'A_0', label: 'x', inputType: 'number', placeholder: '3' },
        { key: 'A_1', label: 'y', inputType: 'number', placeholder: '4' },
      ],
      buildCommand: (p) => `unit vector [${p.A_0||'0'}, ${p.A_1||'0'}]`,
    },
    { id: 'vec-unit-3d', label: 'Unit Vector  (3D)', latexFormula: '\\hat{\\mathbf{a}} = \\frac{\\mathbf{a}}{|\\mathbf{a}|}', note: 'Normalizes the vector to length 1.',
      params: [
        { key: 'A_0', label: 'x', inputType: 'number', placeholder: '1' },
        { key: 'A_1', label: 'y', inputType: 'number', placeholder: '2' },
        { key: 'A_2', label: 'z', inputType: 'number', placeholder: '2' },
      ],
      buildCommand: (p) => `unit vector [${p.A_0||'0'}, ${p.A_1||'0'}, ${p.A_2||'0'}]`,
    },
  ],

    /* ── Matrices ─────────────────────────────────────────────────────────────────── */
  matrices: [
    { id: 'mat-arith', label: 'Add / Subtract  (A ± B)', latexFormula: 'A \\pm B', note: 'Pick size, fill both matrices, choose + or −. Both must be same size.',
      params: [
        { key: 'rows', label: 'Rows',      inputType: 'select', options: ['1','2','3','4'] },
        { key: 'cols', label: 'Columns',   inputType: 'select', options: ['1','2','3','4'] },
        { key: 'op',   label: 'Operation', inputType: 'select', options: ['+', '-'] },
        { key: 'A', label: 'Matrix A', inputType: 'matrix-grid', rowsKey: 'rows', colsKey: 'cols' },
        { key: 'B', label: 'Matrix B', inputType: 'matrix-grid', rowsKey: 'rows', colsKey: 'cols' },
      ],
      buildCommand: (p) => { const r=parseInt(p.rows||'2'),c=parseInt(p.cols||'2'); return `${buildMatrix(p,'A',r,c)} ${p.op||'+'} ${buildMatrix(p,'B',r,c)}`; },
    },
    { id: 'mat-multiply', label: 'Multiply  (A × B)', latexFormula: 'A \\times B', note: 'Cols of A = Rows of B = Shared dim.',
      params: [
        { key: 'rA',  label: 'Rows of A',  inputType: 'select', options: ['1','2','3','4'] },
        { key: 'sAB', label: 'Shared dim', inputType: 'select', options: ['1','2','3','4'] },
        { key: 'cB',  label: 'Cols of B',  inputType: 'select', options: ['1','2','3','4'] },
        { key: 'A', label: 'Matrix A', inputType: 'matrix-grid', rowsKey: 'rA',  colsKey: 'sAB' },
        { key: 'B', label: 'Matrix B', inputType: 'matrix-grid', rowsKey: 'sAB', colsKey: 'cB'  },
      ],
      buildCommand: (p) => { const rA=parseInt(p.rA||'2'),sAB=parseInt(p.sAB||'2'),cB=parseInt(p.cB||'2'); return `${buildMatrix(p,'A',rA,sAB)} * ${buildMatrix(p,'B',sAB,cB)}`; },
    },
    { id: 'mat-det', label: 'Determinant  (square)', latexFormula: '\\det(A)', note: 'Choose 2×2 or 3×3.',
      params: [
        { key: 'dim', label: 'Size', inputType: 'select', options: ['2','3'] },
        { key: 'A', label: 'Matrix A', inputType: 'matrix-grid', rowsKey: 'dim', colsKey: 'dim' },
      ],
      buildCommand: (p) => { const d=parseInt(p.dim||'2'); return `det(${buildMatrix(p,'A',d,d)})`; },
    },
    { id: 'mat-inv', label: 'Inverse  (A⁻¹)', latexFormula: 'A^{-1}', note: 'Only square, non-singular matrices are invertible.',
      params: [
        { key: 'dim', label: 'Size', inputType: 'select', options: ['2','3'] },
        { key: 'A', label: 'Matrix A', inputType: 'matrix-grid', rowsKey: 'dim', colsKey: 'dim' },
      ],
      buildCommand: (p) => { const d=parseInt(p.dim||'2'); return `inv(${buildMatrix(p,'A',d,d)})`; },
    },
    { id: 'mat-transpose', label: 'Transpose  (Aᵀ)', latexFormula: 'A^T', note: 'Flips rows ↔ columns.',
      params: [
        { key: 'rows', label: 'Rows',    inputType: 'select', options: ['1','2','3','4'] },
        { key: 'cols', label: 'Columns', inputType: 'select', options: ['1','2','3','4'] },
        { key: 'A', label: 'Matrix A', inputType: 'matrix-grid', rowsKey: 'rows', colsKey: 'cols' },
      ],
      buildCommand: (p) => { const r=parseInt(p.rows||'2'),c=parseInt(p.cols||'2'); return `transpose(${buildMatrix(p,'A',r,c)})`; },
    },
    { id: 'mat-scalar', label: 'Scalar Multiply  (k·A)', latexFormula: 'kA', note: 'Multiplies every entry by k.',
      params: [
        { key: 'k',    label: 'Scalar k', inputType: 'number' },
        { key: 'rows', label: 'Rows',     inputType: 'select', options: ['1','2','3','4'] },
        { key: 'cols', label: 'Columns',  inputType: 'select', options: ['1','2','3','4'] },
        { key: 'A', label: 'Matrix A', inputType: 'matrix-grid', rowsKey: 'rows', colsKey: 'cols' },
      ],
      buildCommand: (p) => { const r=parseInt(p.rows||'2'),c=parseInt(p.cols||'2'); return `${p.k||'2'} * ${buildMatrix(p,'A',r,c)}`; },
    },
  ],

  /* ── Differential Equations ─────────────────────────────────────────── */
  'differential-equations': [
    {
      id: '2nd-order',
      label: "2nd-Order Homogeneous  (ay″ + by′ + cy = 0)",
      latexFormula: "ay'' + by' + cy = 0",
      note: 'Enter the three coefficients. The solver uses the characteristic equation method.',
      params: [
        { key: 'a', label: "Coefficient a  (y″)", inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'b', label: "Coefficient b  (y′)", inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'c', label: 'Coefficient c  (y)', inputType: 'number', placeholder: 'e.g. 2' },
      ],
      buildCommand: (p) => `${p.a || '1'}y'' + ${p.b || '0'}y' + ${p.c || '0'}y = 0`,
    },
    {
      id: '1st-separable',
      label: "1st-Order Separable  (y′ = ky)",
      latexFormula: "y' = ky \\implies y = Ce^{kx}",
      note: 'Enter the constant k. The solution is y = Ce^(kx).',
      params: [
        { key: 'k', label: 'Constant k', inputType: 'number', placeholder: 'e.g. -2' },
      ],
      buildCommand: (p) => `y' = ${p.k || '1'}y`,
    },
    {
      id: '1st-direct',
      label: 'Direct Integration  (dy/dx = f(x))',
      latexFormula: '\\dfrac{dy}{dx} = f(x) \\implies y = \\int f(x)\\,dx',
      note: 'Enter f(x) — the solver integrates the right-hand side directly.',
      params: [
        { key: 'fx', label: 'Right-hand side f(x)', inputType: 'text', placeholder: 'e.g. 3x^2' },
      ],
      buildCommand: (p) => `dy/dx = ${p.fx || ''}`,
    },
    {
      id: '1st-linear',
      label: "1st-Order Linear  (y′ + P(x)y = Q(x))",
      latexFormula: "y' + P(x)y = Q(x)",
      note: 'Enter P(x) and Q(x) — the solver applies the integrating factor method.',
      params: [
        { key: 'P', label: 'P(x)  (multiplied by y)', inputType: 'text', placeholder: 'e.g. 2' },
        { key: 'Q', label: 'Q(x)  (right-hand side)', inputType: 'text', placeholder: 'e.g. 4' },
      ],
            buildCommand: (p) => `y' + ${p.P || ''}y = ${p.Q || ''}`,
    },
    {
      id: 'exp-growth-decay',
      label: 'Exponential Growth / Decay  (dy/dt = ky)',
      latexFormula: 'y = y_0\\,e^{kt}',
      note: 'Enter rate k and initial value y₀.  k > 0 = growth, k < 0 = decay.',
      params: [
        { key: 'k',  label: 'Rate k',          inputType: 'number', placeholder: 'e.g. -0.03' },
        { key: 'y0', label: 'Initial value y₀', inputType: 'number', placeholder: 'e.g. 500' },
        { key: 't',  label: 'Time t  (optional for specific value)', inputType: 'number', placeholder: 'leave blank for general form' },
      ],
      buildCommand: (p) => p.t ? `Exponential decay y0=${p.y0 || ''} k=${p.k || ''} t=${p.t}` : `y' = ${p.k || ''}y, y(0) = ${p.y0 || ''}`,
    },
    {
      id: '2nd-forced',
      label: "2nd-Order with Constant Forcing  (ay″ + by′ + cy = d)",
      latexFormula: "ay'' + by' + cy = d",
      note: 'Particular solution found via undetermined coefficients.',
      params: [
        { key: 'a', label: "Coefficient a  (y″)", inputType: 'number', placeholder: 'e.g. 1' },
        { key: 'b', label: "Coefficient b  (y′)", inputType: 'number', placeholder: 'e.g. 3' },
        { key: 'c', label: 'Coefficient c  (y)',  inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'd', label: 'Forcing term d',      inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `${p.a || '1'}y'' + ${p.b || '0'}y' + ${p.c || '0'}y = ${p.d || '0'}`,
    },
  ],

  /* ── Discrete Math ──────────────────────────────────────────────────── */
  discrete: [
    {
      id: 'gcd',
      label: 'Greatest Common Divisor  gcd(m, n)',
      latexFormula: '\\gcd(m, n) \\text{ — Euclidean algorithm}',
      note: 'Enter two positive integers. Shows each division step.',
      params: [
        { key: 'm', label: 'First number m', inputType: 'number', placeholder: 'e.g. 48' },
        { key: 'n', label: 'Second number n', inputType: 'number', placeholder: 'e.g. 36' },
      ],
      buildCommand: (p) => `gcd(${p.m || ''}, ${p.n || ''})`,
    },
    {
      id: 'combination',
      label: 'Combination  C(n, k)',
      latexFormula: 'C(n,k) = \\dbinom{n}{k} = \\dfrac{n!}{k!\\,(n-k)!}',
      note: 'Enter n (total items) and k (items chosen, order does not matter).',
      params: [
        { key: 'n', label: 'Total items n', inputType: 'number', placeholder: 'e.g. 10' },
        { key: 'k', label: 'Choose k', inputType: 'number', placeholder: 'e.g. 3' },
      ],
      buildCommand: (p) => `C(${p.n || ''}, ${p.k || ''})`,
    },
    {
      id: 'permutation',
      label: 'Permutation  P(n, k)',
      latexFormula: 'P(n,k) = \\dfrac{n!}{(n-k)!}',
      note: 'Enter n (total items) and k (positions to arrange, order matters).',
      params: [
        { key: 'n', label: 'Total items n', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'k', label: 'Arrange k', inputType: 'number', placeholder: 'e.g. 2' },
      ],
      buildCommand: (p) => `P(${p.n || ''}, ${p.k || ''})`,
    },
    {
      id: 'fibonacci',
      label: 'Fibonacci Number  F(n)',
      latexFormula: 'F_n = F_{n-1} + F_{n-2}, \\quad F_0=0,\\; F_1=1',
      note: 'Enter n to get the nth Fibonacci number (0-indexed).',
      params: [
        { key: 'n', label: 'Index n', inputType: 'number', placeholder: 'e.g. 10' },
      ],
      buildCommand: (p) => `fibonacci(${p.n || ''})`,
    },
    {
      id: 'modular',
      label: 'Modular Exponentiation  (aᵇ mod m)',
      latexFormula: 'a^b \\bmod m',
      note: 'Compute aᵇ mod m using fast exponentiation — useful in cryptography.',
      params: [
        { key: 'a', label: 'Base a', inputType: 'number', placeholder: 'e.g. 2' },
        { key: 'b', label: 'Exponent b', inputType: 'number', placeholder: 'e.g. 10' },
        { key: 'm', label: 'Modulus m', inputType: 'number', placeholder: 'e.g. 7' },
      ],
            buildCommand: (p) => `${p.a || ''}^${p.b || ''} mod ${p.m || ''}`,
    },
    {
      id: 'lcm',
      label: 'Least Common Multiple  lcm(m, n)',
      latexFormula: '\\text{lcm}(m,n) = \\dfrac{|m \\cdot n|}{\\gcd(m,n)}',
      note: 'Enter two positive integers. Useful for adding fractions.',
      params: [
        { key: 'm', label: 'First number m',  inputType: 'number', placeholder: 'e.g. 12' },
        { key: 'n', label: 'Second number n', inputType: 'number', placeholder: 'e.g. 18' },
      ],
      buildCommand: (p) => `lcm(${p.m || ''}, ${p.n || ''})`,
    },
    {
      id: 'prime-factor',
      label: 'Prime Factorisation',
      latexFormula: 'n = p_1^{e_1} \\cdot p_2^{e_2} \\cdots p_k^{e_k}',
      note: 'Enter a positive integer to express it as a product of prime powers.',
      params: [
        { key: 'n', label: 'Integer n', inputType: 'number', placeholder: 'e.g. 360' },
      ],
      buildCommand: (p) => `Prime factorisation of ${p.n || ''}`,
    },
    {
      id: 'floor-ceil',
      label: 'Floor & Ceiling',
      latexFormula: '\\lfloor x \\rfloor \\text{ and } \\lceil x \\rceil',
      note: 'Enter a decimal or expression — returns both floor and ceiling values.',
      params: [
        { key: 'x', label: 'Value x', inputType: 'number', placeholder: 'e.g. 3.7' },
      ],
      buildCommand: (p) => `Floor and ceiling of ${p.x || ''}`,
    },
  ],

  /* ── Physics ────────────────────────────────────────────────────────── */
  physics: [
    {
      id: 'ohm',
      label: "Ohm's Law  (V = IR)",
      latexFormula: 'V = I \\cdot R',
      note: 'Enter any 2 values — the solver finds the missing one.',
      params: [
        { key: 'V', label: 'Voltage V', unit: 'volts', inputType: 'number', placeholder: 'leave blank to solve' },
        { key: 'I', label: 'Current I', unit: 'amps', inputType: 'number', placeholder: 'leave blank to solve' },
        { key: 'R', label: 'Resistance R', unit: 'ohms (Ω)', inputType: 'number', placeholder: 'leave blank to solve' },
      ],
      buildCommand: (p) => {
        const parts = Object.entries(p).filter(([, v]) => v.trim() !== '').map(([k, v]) => `${k}=${v}`);
        return `ohm ${parts.join(' ')}`;
      },
    },
    {
      id: 'KE',
      label: 'Kinetic Energy  (KE = ½mv²)',
      latexFormula: 'KE = \\tfrac{1}{2}mv^2',
      note: 'Enter both values to compute kinetic energy.',
      params: [
        { key: 'm', label: 'Mass m', unit: 'kg', inputType: 'number', placeholder: 'e.g. 10' },
        { key: 'v', label: 'Velocity v', unit: 'm/s', inputType: 'number', placeholder: 'e.g. 5' },
      ],
      buildCommand: (p) => `KE m=${p.m || ''} v=${p.v || ''}`,
    },
    {
      id: 'projectile',
      label: 'Projectile Range  (R = v²sin2θ / g)',
      latexFormula: 'R = \\dfrac{v^2 \\sin 2\\theta}{g}',
      note: 'Enter both values to compute horizontal range (g = 9.81 m/s²).',
      params: [
        { key: 'v', label: 'Launch speed v', unit: 'm/s', inputType: 'number', placeholder: 'e.g. 50' },
        { key: 'theta', label: 'Launch angle θ', unit: 'degrees', inputType: 'number', placeholder: 'e.g. 45' },
      ],
      buildCommand: (p) => `projectile v=${p.v || ''} theta=${p.theta || ''}`,
    },
    {
      id: 'wave',
      label: 'Wave Speed  (v = fλ)',
      latexFormula: 'v = f \\lambda',
      note: 'Enter both values to compute wave speed.',
      params: [
        { key: 'f', label: 'Frequency f', unit: 'Hz', inputType: 'number', placeholder: 'e.g. 440' },
        { key: 'lambda', label: 'Wavelength λ', unit: 'm', inputType: 'number', placeholder: 'e.g. 0.78' },
      ],
      buildCommand: (p) => `wave f=${p.f || ''} lambda=${p.lambda || ''}`,
    },
    {
      id: 'force',
      label: "Newton's 2nd Law  (F = ma)",
      latexFormula: 'F = m \\cdot a',
      note: 'Enter both values to compute the net force.',
      params: [
        { key: 'm', label: 'Mass m', unit: 'kg', inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'a', label: 'Acceleration a', unit: 'm/s²', inputType: 'number', placeholder: 'e.g. 3' },
      ],
      buildCommand: (p) => `force m=${p.m || ''} a=${p.a || ''}`,
    },
    {
      id: 'PE',
      label: 'Gravitational PE  (PE = mgh)',
      latexFormula: 'PE = mgh',
      note: 'Enter both values (g = 9.81 m/s²).',
      params: [
        { key: 'm', label: 'Mass m', unit: 'kg', inputType: 'number', placeholder: 'e.g. 10' },
        { key: 'h', label: 'Height h', unit: 'm', inputType: 'number', placeholder: 'e.g. 5' },
      ],
            buildCommand: (p) => `PE m=${p.m || ''} h=${p.h || ''}`,
    },
    {
      id: 'momentum',
      label: 'Momentum  (p = mv)',
      latexFormula: 'p = m \\cdot v',
      note: 'Enter mass and velocity to compute momentum.',
      params: [
        { key: 'm', label: 'Mass m',     unit: 'kg',  inputType: 'number', placeholder: 'e.g. 5' },
        { key: 'v', label: 'Velocity v', unit: 'm/s', inputType: 'number', placeholder: 'e.g. 10' },
      ],
      buildCommand: (p) => `Momentum m=${p.m || ''} v=${p.v || ''}`,
    },
    {
      id: 'hooke',
      label: "Hooke’s Law  (F = kx)",
      latexFormula: 'F = k \\cdot x',
      note: 'Enter spring constant k and displacement x to find the restoring force.',
      params: [
        { key: 'k', label: 'Spring constant k', unit: 'N/m', inputType: 'number', placeholder: 'e.g. 200' },
        { key: 'x', label: 'Displacement x',    unit: 'm',   inputType: 'number', placeholder: 'e.g. 0.05' },
      ],
      buildCommand: (p) => `Hooke k=${p.k || ''} x=${p.x || ''}`,
    },
    {
      id: 'power-phys',
      label: 'Power  (P = W/t)',
      latexFormula: 'P = \\dfrac{W}{t}',
      note: 'Enter work in joules and time in seconds to compute power in watts.',
      params: [
        { key: 'W', label: 'Work done W', unit: 'J', inputType: 'number', placeholder: 'e.g. 1000' },
        { key: 't', label: 'Time t',      unit: 's', inputType: 'number', placeholder: 'e.g. 50' },
      ],
      buildCommand: (p) => `Power W=${p.W || ''} t=${p.t || ''}`,
    },
    {
      id: 'pressure',
      label: 'Pressure  (P = F/A)',
      latexFormula: 'P = \\dfrac{F}{A}',
      note: 'Enter force (N) and area (m²) to compute pressure in pascals.',
      params: [
        { key: 'F', label: 'Force F', unit: 'N',   inputType: 'number', placeholder: 'e.g. 500' },
        { key: 'A', label: 'Area A',  unit: 'm²', inputType: 'number', placeholder: 'e.g. 2' },
      ],
      buildCommand: (p) => `Pressure F=${p.F || ''} A=${p.A || ''}`,
    },
  ],
};

// ── Main component ────────────────────────────────────────────────────────────

const MATH_SIDEBAR_KEY = 'kivora-math-sidebar';

// ── autoWrapMath: detects math spans and wraps in $...$/$$...$$ for KaTeX
function autoWrapMath(raw: string): string {
  if (!raw.trim()) return '';
  if (raw.includes('$')) return raw;
  const PROSE = /\b(find|solve|calculate|evaluate|compute|show|prove|given|determine|what|how|when|the|a|an|of|in|at|to|and|or|not|with|that|this|let|where|is|are|was|were|by|be|all|using|use|apply|write)\b/gi;
  const MS = new RegExp(
    '\\[\\[[\\s\\S]*?\\]\\]|\\[\\s*[\\d.+\\-*/\\s,a-zA-Z]+\\s*\\]' +
    '|\\b(?:sin|cos|tan|asin|acos|atan|log|ln|exp|sqrt|abs|det|inv)\\s*\\([^)]{0,80}\\)' +
    '|d(?:\\^2)?[a-zA-Z]?\\/d[a-zA-Z](?:\\^2)?' +
    "|y''|y'" +
    '|[a-zA-Z0-9]+\\^[a-zA-Z0-9{}()_+\\-*/]+' +
    '|\\b(?:pi|theta|alpha|beta|gamma|delta|epsilon|lambda|mu|sigma|phi|omega)\\b' +
    '|[a-zA-Z]+(?:\\^[a-zA-Z0-9{}]+)?(?:\\s*[+\\-*/]\\s*[a-zA-Z0-9.]+(?:\\^[a-zA-Z0-9{}]+)?)+\\s*=\\s*[^.?!\\n,]{1,40}' +
    '|[-]?\\d+(?:\\.\\d+)?(?:\\s*[+\\-*/^]\\s*(?:\\([-]?\\d[^)]*\\)|[-]?\\d+(?:\\.\\d+)?))+',
    'g'
  );
  return raw.split('\n').map(line => {
    const t = line.trim(); if (!t) return line;
    const pr = (t.match(PROSE)??[]).length / Math.max((t.match(/\b\w+\b/g)??[]).length, 1);
    const hasMath = /\b(?:sin|cos|tan|sqrt|log|ln|exp|abs|det|inv)\s*\(/.test(t) ||
      /\b(?:derivative|integral|limit)\b/i.test(t) || /d[a-z]\/d[a-z]/.test(t) ||
      /\b(?:pi|theta|alpha|beta|gamma|sigma|omega)\b/i.test(t) ||
      /[a-zA-Z0-9]\^[a-zA-Z0-9{(]/.test(t) ||
      (t.match(/[+\-*/^=<>()\[\]{}|]/g)??[]).length > 2;
    if (!hasMath) return line;
    if (pr < 0.25 && (t.match(/\b\w+\b/g)??[]).length <= 10) return '$$' + t + '$$';
    return t.replace(MS, m => '$' + m.trim() + '$');
  }).join('\n');
}

export function MathSolverPage() {
  const [active, setActive] = useState<ActiveView>('algebra');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(MATH_SIDEBAR_KEY) !== 'closed'; } catch { return true; }
  });
  const [compactMathLayout, setCompactMathLayout] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Graph state
  const [graphExprs, setGraphExprs] = useState<GraphExpression[]>([
    { id: '1', expr: 'y = x^2', color: GRAPH_COLORS[0], enabled: true },
  ]);
  const graphRef = useRef<HTMLDivElement>(null);
  const graphOverlayRef = useRef<HTMLDivElement>(null);
  const [graphError, setGraphError] = useState('');
  const [xDomain, setXDomain] = useState<[number, number]>([-12, 12]);
  const [yDomain, setYDomain] = useState<[number, number]>([-10, 10]);
  const [themeTick, setThemeTick] = useState(0);
  // Hover coordinates
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; svgX: number; svgY: number } | null>(null);
  const [formulaSearch, setFormulaSearch] = useState('');

  const [contextName, setContextName] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanExtracted, setScanExtracted] = useState('');
  const [scanMode,   setScanMode]   = useState<'upload' | 'type'>('upload');
  const [typeInput,  setTypeInput]  = useState('');


  // Unit converter state
  const [unitCatIdx, setUnitCatIdx] = useState(0);
  const [fromUnit, setFromUnit] = useState(0);
  const [toUnit, setToUnit] = useState(1);
  const [unitValue, setUnitValue] = useState('1');

  // Structured form state (shared across all solver categories)
  const [structFormType, setStructFormType] = useState('quadratic'); // first algebra form
  const [structFormParams, setStructFormParams] = useState<Record<string, string>>({});

  // Step-by-step reveal animation
  const [revealedSteps, setRevealedSteps] = useState<number>(0);

  // Flashcard save feedback
  const [flashcardToast, setFlashcardToast] = useState<string>('');

  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    const pending = localStorage.getItem('math_pending_problem');
    if (pending) {
      setInput(pending);
      localStorage.removeItem('math_pending_problem');
    }
  }, []);

  // Reset structured form when switching to a different solver category
  useEffect(() => {
    const forms = CATEGORY_FORMS[String(active)];
    if (forms?.length) {
      setStructFormType(forms[0].id);
      setStructFormParams({});
    }
  }, [active]);

  useEffect(() => {
    const context = readMathContext();
    if (!context) return;
    setContextName(context.fileName);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => setThemeTick(v => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLayout = () => {
      const compact = window.innerWidth < 960;
      setCompactMathLayout(compact);
      setSidebarOpen((current) => {
        if (compact) return false;
        return current;
      });
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  const replaceGraphWith = useCallback((expr: string) => {
    setGraphExprs([{ id: crypto.randomUUID(), expr, color: GRAPH_COLORS[0], enabled: true }]);
  }, []);

  const loadQuestionFromFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
      setScanError('Upload a screenshot image or a PDF that contains a math question.');
      return;
    }

    setScanBusy(true);
    setScanError('');
    setScanExtracted('');
    try {
      if (isImage) {
        const imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('Could not read the image.'));
          reader.readAsDataURL(file);
        });

        const response = await fetch('/api/math-ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64 }),
        });
        const data = await response.json();
        if (!response.ok || !data.expression) {
          throw new Error(data.error ?? 'Could not extract a math expression from the screenshot.');
        }
        setScanExtracted(String(data.expression).trim());
        return;
      }

      const extracted = await extractTextFromBlob(file, file.name);
      if (extracted.error || !extracted.text.trim()) {
        throw new Error(extracted.error ?? 'The PDF did not contain readable text.');
      }
      setScanExtracted(extracted.text.replace(/\s+/g, ' ').trim().slice(0, 4000));
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Could not process this file.');
    } finally {
      setScanBusy(false);
    }
  }, []);

  // ── Solver ─────────────────────────────────────────────────────────────────

  const solve = useCallback(async (problem: string = input, categoryOverride?: TopicId) => {
    const p = problem.trim();
    if (!p) return;
    setLoading(true);
    setResult(null);
    const requestCategory = categoryOverride ?? TOPICS.find(t => t.id === active)?.id ?? null;
    try {
      const res = await fetch('/api/math/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: p, category: requestCategory }),
      });
      const data = await res.json() as SolveResult;
      setResult(data);
      // Reveal steps one-by-one with animation
      setRevealedSteps(0);
      const total = data.steps?.length ?? 0;
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setRevealedSteps(i);
        if (i >= total) clearInterval(iv);
      }, 280);
      // Add to history
      if (data.answer && !data.error) {
        const item: HistoryItem = { id: crypto.randomUUID(), problem: p, answer: data.answer, category: data.category ?? String(active), ts: Date.now() };
        setHistory(prev => { const next = [item, ...prev.filter(h => h.problem !== p)]; saveHistory(next); return next; });
      }
      // Auto-populate graph if solver provides expression
      if (data.graphExpr) {
        replaceGraphWith(data.graphExpr);
      }
    } catch {
      setResult({ answer: '', answerLatex: '', steps: [], graphExpr: null, category: String(requestCategory ?? active), engine: 'error', error: 'Network error — check that the AI model is running.' });
    } finally {
      setLoading(false);
    }
  }, [input, active, replaceGraphWith]);

  // ── Graph rendering ────────────────────────────────────────────────────────

  const renderGraph = useCallback(() => {
    if (!graphRef.current) return;
    const enabled = graphExprs.filter(e => e.enabled && e.expr.trim());
    if (enabled.length === 0) {
      graphRef.current.innerHTML = '';
      setGraphError('');
      return;
    }
    try {
      graphRef.current.innerHTML = buildGraphSvg(enabled, xDomain, yDomain);
      setGraphError('');
    } catch (err) {
      graphRef.current.innerHTML = '';
      setGraphError(err instanceof Error ? err.message : String(err));
    }
  }, [graphExprs, xDomain, yDomain]);

  useEffect(() => {
    if (active === 'graph') renderGraph();
  }, [active, renderGraph, themeTick]);

  // Auto-plot with debounce when expressions or domain changes
  useEffect(() => {
    if (active !== 'graph') return;
    const t = setTimeout(() => renderGraph(), 320);
    return () => clearTimeout(t);
  }, [graphExprs, xDomain, yDomain, active, renderGraph]);

  function resetGraphView() {
    setXDomain([-12, 12]);
    setYDomain([-10, 10]);
  }

  function zoomGraph(factor: number) {
    setXDomain(([min, max]) => [Number((min * factor).toFixed(2)), Number((max * factor).toFixed(2))]);
    setYDomain(([min, max]) => [Number((min * factor).toFixed(2)), Number((max * factor).toFixed(2))]);
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const currentTopic = TOPICS.find(t => t.id === active);
  const currentCategoryConfig = currentTopic ? MATH_CATEGORIES[currentTopic.id] : null;
  const specialMeta = !currentTopic ? SPECIAL_VIEW_META[active as SpecialView] : null;
  const currentAccent = currentTopic?.color ?? specialMeta?.accent ?? DEFAULT_ACCENT;
  const activeTitle = currentTopic?.label ?? specialMeta?.title ?? 'Math';
  const activeSubtitle = currentTopic
    ? `Focus on ${currentCategoryConfig?.supportedActions.slice(0, 4).join(' · ') ?? 'step-by-step problem solving'}.`
    : specialMeta?.subtitle ?? '';

  const unitCat = UNIT_CATS[unitCatIdx];
  const unitResult = (() => {
    const v = parseFloat(unitValue);
    if (isNaN(v) || !unitCat) return '';
    const si = unitCat.units[fromUnit].toSI(v);
    const out = unitCat.units[toUnit].fromSI(si);
    return Number(out.toPrecision(8)).toString();
  })();

  // ── Styles ──────────────────────────────────────────────────────────────────

  const S = {
    shell: { display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)', fontFamily: 'inherit' } as React.CSSProperties,
    sidebar: {
      width: sidebarOpen ? (compactMathLayout ? 188 : 220) : 52,
      minWidth: sidebarOpen ? (compactMathLayout ? 188 : 220) : 52,
      transition: 'width 0.2s, min-width 0.2s',
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column' as const,
      overflowY: 'auto' as const,
      overflowX: 'hidden' as const,
      flexShrink: 0,
    },
    main: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const },
  };

  // ── Sidebar ─────────────────────────────────────────────────────────────────

  function NavItem({ id, icon, label, color }: { id: ActiveView; icon: string; label: string; color?: string }) {
    const isActive = active === id;
    return (
      <button
        onClick={() => {
          if (id !== active) { setInput(''); setResult(null); }
          setActive(id);
        }}
        title={!sidebarOpen ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: sidebarOpen ? '8px 14px' : '8px 0',
          justifyContent: sidebarOpen ? 'flex-start' : 'center',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          borderRadius: 8, margin: '1px 6px', width: 'calc(100% - 12px)',
          background: isActive ? `${color ?? 'var(--primary)'}1a` : 'transparent',
          color: isActive ? (color ?? 'var(--primary)') : 'var(--text-secondary)',
          fontWeight: isActive ? 700 : 400, fontSize: 13,
          transition: 'all 0.12s',
          borderLeft: isActive ? `3px solid ${color ?? 'var(--primary)'}` : '3px solid transparent',
        }}
      >
        <span style={{ fontSize: 15, flexShrink: 0, fontStyle: 'normal', minWidth: 20, textAlign: 'center' }}>{icon}</span>
        {sidebarOpen && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
      </button>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={S.shell}>

      {/* ── Sidebar ── */}
      <aside style={S.sidebar}>
        {/* Collapse toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center', padding: sidebarOpen ? '14px 14px 8px' : '14px 0 8px' }}>
          {sidebarOpen && <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Categories</span>}
          <button onClick={() => setSidebarOpen(o => {
            const next = !o;
            try { localStorage.setItem(MATH_SIDEBAR_KEY, next ? 'open' : 'closed'); } catch { /* noop */ }
            return next;
          })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: 4 }} title={sidebarOpen ? 'Collapse' : 'Expand'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <div style={{ padding: '0 0 8px' }}>
          {sidebarOpen && (
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', padding: '6px 20px 4px', opacity: 0.6 }}>
              Solver Topics
            </div>
          )}
          {TOPICS.map(t => <NavItem key={t.id} id={t.id} icon={t.icon} label={t.label} color={t.color} />)}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 14px' }} />
          {sidebarOpen && (
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', padding: '2px 20px 4px', opacity: 0.6 }}>
              Tools
            </div>
          )}
          <NavItem id="formulas"  icon="📚" label="Formula Sheets" />
          <NavItem id="graph"     icon="📈" label="Graph Plotter"  color="#22c55e" />
          <NavItem id="units"     icon="⚖" label="Unit Converter" color="#f59e0b" />
          <NavItem id="scan"      icon="🧾" label="Question Scan"  color="#38bdf8" />
          <NavItem id="visual"    icon="🔬" label="Visual Analyzer"  color="#a78bfa" />
          <NavItem id="matlab"    icon="🧮" label="MATLAB Lab"       color="#f97316" />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={S.main}>

        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', flexShrink: 0, position: 'relative' }}>
          {/* Accent color strip at the very top */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${currentAccent}, ${currentAccent}80)`, position: 'absolute', top: 0, left: 0, right: 0, borderRadius: '0 0 0 0' }} />
          <div style={{ padding: '14px 24px 12px', display: 'flex', alignItems: 'center', gap: 14, paddingTop: 17 }}>
            {/* Category icon with colored circle backdrop */}
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: `${currentAccent}18`,
              border: `1.5px solid ${currentAccent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontStyle: 'normal',
            }}>
              {currentTopic?.icon ?? specialMeta?.icon ?? '∑'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {activeTitle}
                {currentTopic && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${currentAccent}15`, color: currentAccent, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    Solver
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeSubtitle}
              </div>
            </div>
            {history.length > 0 && (
              <button onClick={() => setShowHistory(h => !h)}
                style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${showHistory ? currentAccent : 'var(--border-subtle)'}`, background: showHistory ? `${currentAccent}12` : 'var(--bg-elevated)', color: showHistory ? currentAccent : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s', flexShrink: 0 }}>
                🕐 History
                <span style={{ background: showHistory ? currentAccent : 'var(--border-mid, var(--border-subtle))', color: showHistory ? '#fff' : 'var(--text-muted)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, minWidth: 16, textAlign: 'center' }}>{history.length}</span>
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '10px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 75%, transparent), var(--bg-base))',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Math focus
            </span>
            <strong style={{ color: 'var(--text-primary)', fontSize: 14 }}>
              {currentTopic ? `${currentTopic.label} problem-solving` : `${specialMeta?.title ?? 'Math tools'} workspace`}
            </strong>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 760 }}>
              {contextName
                ? `Connected to ${contextName}. You can keep this file in context while solving, graphing, or exploring formulas.`
                : currentTopic
                  ? `Use structured forms, quick examples, and step-by-step solving without leaving the current topic.`
                  : `Switch between graphing, scanning, formulas, units, visual analysis, and MATLAB-style work from the same space.`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {compactMathLayout && (
              <button
                onClick={() => setSidebarOpen((value) => !value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {sidebarOpen ? 'Hide topics' : 'Show topics'}
              </button>
            )}
            <span style={{ padding: '4px 10px', borderRadius: 999, background: `${currentAccent}14`, color: currentAccent, fontSize: 11, fontWeight: 700 }}>
              {currentTopic ? 'Solver mode' : specialMeta?.title ?? 'Tool mode'}
            </span>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}>
              {history.length} recent problem{history.length === 1 ? '' : 's'}
            </span>
            {currentCategoryConfig && (
              <span style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }}>
                {currentCategoryConfig.supportedActions.length} supported actions
              </span>
            )}
          </div>
        </div>

        {/* History drawer */}
        {showHistory && (
          <div style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-2)' }}>
            <div style={{ padding: '10px 24px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Recent Problems</span>
              {history.length > 0 && (
                <button onClick={() => { setHistory([]); try { localStorage.removeItem('kivora_math_history'); } catch { /* noop */ } }}
                  style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}>
                  Clear all
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div style={{ padding: '12px 24px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No history yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto', padding: '4px 24px 12px' }}>
                {history.map(h => {
                  const catTopic = TOPICS.find(topic => topic.id === h.category);
                  const catColor = catTopic?.color ?? 'var(--primary)';
                  const catIcon = catTopic?.icon ?? '∑';
                  return (
                    <button key={h.id} onClick={() => {
                      const nextCategory = (catTopic?.id ?? 'algebra') as TopicId;
                      setInput(h.problem);
                      setShowHistory(false);
                      setActive(nextCategory);
                      setTimeout(() => { void solve(h.problem, nextCategory); }, 0);
                    }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = catColor; e.currentTarget.style.background = `color-mix(in srgb, ${catColor} 5%, var(--bg-elevated))`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                    >
                      {/* Category color dot + icon */}
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: `${catColor}18`, border: `1px solid ${catColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                        {catIcon}
                      </div>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono", monospace' }}>{h.problem}</span>
                      <span style={{ fontSize: 11, color: catColor, fontWeight: 600, flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>= {h.answer.slice(0, 28)}{h.answer.length > 28 ? '…' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── SOLVER PHASE ── */}
        {active !== 'formulas' && active !== 'graph' && active !== 'units' && active !== 'scan' && active !== 'visual' && active !== 'matlab' && (
          <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

            {/* Quick examples — hidden for categories that use the structured form */}
            {currentTopic && !CATEGORY_FORMS[String(active)] && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {currentTopic.examples.map(ex => (
                  <button key={ex} onClick={() => { setInput(ex); void solve(ex, currentTopic.id); }}
                    style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', transition: 'all 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget).style.borderColor = currentTopic.color; (e.currentTarget).style.color = currentTopic.color; }}
                    onMouseLeave={e => { (e.currentTarget).style.borderColor = 'var(--border-subtle)'; (e.currentTarget).style.color = 'var(--text-secondary)'; }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}

            {!CATEGORY_FORMS[String(active)] && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Best for: one problem, one result, and clear working steps.
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Press <strong style={{ color: 'var(--text-primary)' }}>Enter</strong> to solve, <strong style={{ color: 'var(--text-primary)' }}>Shift + Enter</strong> for a new line.
                </span>
              </div>
            )}

            {contextName && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)' }}>
                Linked workspace file: <strong style={{ color: 'var(--text-primary)' }}>{contextName}</strong>
              </div>
            )}

            {currentCategoryConfig && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {currentCategoryConfig.supportedActions.map((action) => (
                  <span
                    key={action}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: `1px solid ${currentAccent}26`,
                      background: `${currentAccent}10`,
                      color: currentAccent,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {action}
                  </span>
                ))}
              </div>
            )}

            {/* ── Structured form (all solver categories) ── */}
            {(() => {
              const forms = CATEGORY_FORMS[String(active)];
              if (!forms?.length) return null;
              const pf = forms.find(f => f.id === structFormType) ?? forms[0];
              const handleStructSolve = () => {
                const cmd = pf.buildCommand(structFormParams);
                if (!cmd.trim()) return;
                setInput(cmd);
                void solve(cmd, active as TopicId);
              };
              // Derive a short pill label: everything before the first double-space
              const pillLabel = (label: string) => label.split('  ')[0];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* ── Problem type pill tabs ── */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Problem type</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {forms.map(f => {
                        const isSelected = (structFormType === f.id) || (!structFormType && f === forms[0]);
                        return (
                          <button
                            key={f.id}
                            onClick={() => { setStructFormType(f.id); setStructFormParams({}); setResult(null); }}
                            style={{
                              padding: '6px 14px', borderRadius: 20,
                              border: `1.5px solid ${isSelected ? currentAccent : 'var(--border-subtle)'}`,
                              background: isSelected ? `${currentAccent}18` : 'var(--bg-2)',
                              color: isSelected ? currentAccent : 'var(--text-secondary)',
                              fontSize: 12, fontWeight: isSelected ? 700 : 400,
                              cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = `${currentAccent}80`; e.currentTarget.style.color = currentAccent; } }}
                            onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
                          >
                            {pillLabel(f.label)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Formula preview (left accent rail) ── */}
                  <div style={{
                    display: 'flex', alignItems: 'stretch', borderRadius: 12,
                    border: '1px solid var(--border-subtle)', overflow: 'hidden',
                    background: 'var(--bg-elevated)',
                  }}>
                    {/* Left accent rail */}
                    <div style={{ width: 4, flexShrink: 0, background: currentAccent, borderRadius: '0' }} />
                    <div style={{ padding: '14px 18px', flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: currentAccent, marginBottom: 6 }}>
                        {pillLabel(pf.label)}
                      </div>
                      <div style={{ overflowX: 'auto', fontSize: 16 }}>
                        <Latex latex={pf.latexFormula} display />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                        {pf.note}
                      </div>
                    </div>
                  </div>

                  {/* ── Parameter inputs ── */}
                  {(() => {
                    const regParams = pf.params.filter(p => p.inputType !== 'matrix-grid');
                    const matParams = pf.params.filter(p => p.inputType === 'matrix-grid');
                    const rc = regParams.length;
                    const gridCols = rc >= 6 ? 'repeat(3, 1fr)' : rc >= 4 ? 'repeat(2, 1fr)' : `repeat(${Math.min(rc, 3)}, 1fr)`;
                    const bs: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', transition: 'border-color 0.15s, box-shadow 0.15s', width: '100%', boxSizing: 'border-box' as const };
                    const onF = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = currentAccent; e.currentTarget.style.boxShadow = `0 0 0 3px ${currentAccent}18`; };
                    const onB = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none'; };
                    return (
                      <>
                        {rc > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 12 }}>
                            {regParams.map((param, idx) => (
                              <div key={param.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: `${currentAccent}20`, color: currentAccent, fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
                                  {param.label}
                                  {param.unit && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>({param.unit})</span>}
                                </label>
                                {param.inputType === 'select' ? (
                                  <select value={structFormParams[param.key] ?? (param.options?.[0] ?? '')} onChange={e => setStructFormParams(prev => ({ ...prev, [param.key]: e.target.value }))} style={{ ...bs, cursor: 'pointer' }} onFocus={onF} onBlur={onB}>
                                    {param.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : (
                                  <input type={param.inputType === 'number' ? 'number' : 'text'} step="any" placeholder={param.placeholder ?? '…'}
                                    value={structFormParams[param.key] ?? ''} onChange={e => setStructFormParams(prev => ({ ...prev, [param.key]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') handleStructSolve(); }}
                                    style={{ ...bs, fontFamily: param.inputType === 'text' ? '"JetBrains Mono", monospace' : 'inherit' }} onFocus={onF} onBlur={onB} />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {matParams.map(param => {
                          const rows = Math.max(1, Math.min(4, parseInt(structFormParams[param.rowsKey!] ?? '2')));
                          const cols = Math.max(1, Math.min(4, parseInt(structFormParams[param.colsKey!] ?? '2')));
                          return (
                            <div key={param.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {param.label}<span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>({rows}×{cols})</span>
                              </span>
                              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6, maxWidth: cols <= 2 ? 260 : cols === 3 ? 340 : 440 }}>
                                {Array.from({ length: rows * cols }, (_, idx) => {
                                  const r = Math.floor(idx / cols), c = idx % cols;
                                  const ck = `${param.key}_${r}_${c}`;
                                  return (
                                    <input key={ck} type="number" step="any" placeholder="0"
                                      value={structFormParams[ck] ?? ''} onChange={e => setStructFormParams(prev => ({ ...prev, [ck]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') handleStructSolve(); }}
                                      style={{ padding: '8px 4px', borderRadius: 8, textAlign: 'center', border: '1.5px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-primary)', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' as const, fontFamily: '"JetBrains Mono", monospace', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                                      onFocus={e => { e.currentTarget.style.borderColor = currentAccent; e.currentTarget.style.boxShadow = `0 0 0 2px ${currentAccent}18`; }}
                                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.boxShadow = 'none'; }} />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}

                  {/* ── Solve / Clear row ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {result && !loading && (
                      <button
                        onClick={() => { setStructFormParams({}); setResult(null); }}
                        style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}
                      >
                        ✕ Clear result
                      </button>
                    )}
                    <button
                      onClick={handleStructSolve}
                      disabled={loading}
                      style={{
                        marginLeft: 'auto', padding: '10px 28px', borderRadius: 12, border: 'none',
                        cursor: loading ? 'default' : 'pointer',
                        background: loading ? `${currentAccent}33` : currentAccent,
                        color: loading ? currentAccent : '#fff',
                        fontWeight: 700, fontSize: 14, flexShrink: 0, transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      {loading
                        ? <><span style={{ display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⏳</span> Solving…</>
                        : '▶  Solve'}
                    </button>
                  </div>
                  <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                </div>
              );
            })()}

            {/* Recent history chips — free-text categories only */}
            {!CATEGORY_FORMS[String(active)] && history.length > 0 && !loading && !result && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Recent:</span>
                {history.slice(0, 3).map(h => (
                  <button key={h.id}
                    onClick={() => {
                      const nextCategory = (TOPICS.find(t => t.id === h.category)?.id ?? 'algebra') as TopicId;
                      setInput(h.problem);
                      setActive(nextCategory);
                      setTimeout(() => { void solve(h.problem, nextCategory); }, 0);
                    }}
                    style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'all 0.1s', fontFamily: '"JetBrains Mono", monospace' }}
                    title={`${h.problem} = ${h.answer}`}
                    onMouseEnter={e => { (e.currentTarget).style.borderColor = 'var(--primary)'; (e.currentTarget).style.color = 'var(--primary)'; }}
                    onMouseLeave={e => { (e.currentTarget).style.borderColor = 'var(--border-subtle)'; (e.currentTarget).style.color = 'var(--text-secondary)'; }}
                  >
                    {h.problem.length > 28 ? h.problem.slice(0, 28) + '…' : h.problem}
                  </button>
                ))}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <style>{`
                  @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.9} }
                  @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
                  .sk-shimmer {
                    background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-elevated) 50%, var(--bg-2) 75%);
                    background-size: 200% 100%;
                    animation: shimmer 1.6s ease-in-out infinite;
                  }
                `}</style>
                {/* Answer card skeleton */}
                <div className="sk-shimmer" style={{ height: 90, borderRadius: 14, border: `1.5px solid ${currentAccent}20` }} />
                {/* Step skeleton rows */}
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden', animationDelay: `${i * 0.15}s` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: `${currentAccent}06` }}>
                      <div className="sk-shimmer" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                      <div className="sk-shimmer" style={{ height: 14, borderRadius: 6, flex: 1, maxWidth: ['70%', '55%', '45%'][i] }} />
                    </div>
                    <div style={{ padding: '12px 18px' }}>
                      <div className="sk-shimmer" style={{ height: 12, borderRadius: 6, width: '40%' }} />
                    </div>
                  </div>
                ))}
                {/* Thinking status pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: `${currentAccent}0d`, border: `1px solid ${currentAccent}25`, alignSelf: 'flex-start', marginTop: 2 }}>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 12 }}>⚙</span>
                  <span style={{ fontSize: 11, color: currentAccent, fontWeight: 600 }}>Solving step by step…</span>
                </div>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.error ? (
                  <div style={{ borderRadius: 14, background: '#ef444408', border: '1.5px solid #ef444430', overflow: 'hidden' }}>
                    {/* Error header strip */}
                    <div style={{ height: 3, background: 'linear-gradient(90deg, #ef4444, #ef444460)' }} />
                    <div style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ef444415', border: '1px solid #ef444430', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>⚠</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#ef4444', marginBottom: 4 }}>Could not solve this problem</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{result.error}</div>
                        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                          Try rephrasing your input, checking for typos, or switching to a different problem type.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Answer card */}
                    <div style={{ borderRadius: 14, background: `${currentAccent}0a`, border: `1.5px solid ${currentAccent}28`, overflow: 'hidden' }}>
                      {/* Thin top accent strip */}
                      <div style={{ height: 3, background: `linear-gradient(90deg, ${currentAccent}, ${currentAccent}50)` }} />
                      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: currentAccent }}>Answer</div>
                        <div style={{ height: 1, flex: 1, background: `${currentAccent}20` }} />
                        <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: `${currentAccent}12`, color: currentAccent, fontWeight: 600 }}>
                          {result.engine === 'ai' ? '✨ AI' : '🔢 symbolic'}
                        </div>
                      </div>
                      <div style={{ padding: '10px 20px 16px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', overflowX: 'auto' }}>
                        {result.answerLatex ? <Latex latex={result.answerLatex} display /> : <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{result.answer}</span>}
                      </div>
                      {input && (
                        <div style={{ padding: '8px 20px 12px', borderTop: `1px solid ${currentAccent}18`, fontSize: 11, color: 'var(--text-muted)', fontFamily: '"JetBrains Mono", monospace', overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>Input:</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{input.length > 80 ? input.slice(0, 80) + '…' : input}</span>
                        </div>
                      )}
                    </div>

                    {/* Steps */}
                    {result.steps.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 2 }}>Step-by-step solution</div>
                        {result.steps.map((step, i) => {
                          const expr = step.expression ?? '';
                          let exprLatex = expr;
                          if (expr && !expr.includes('\\') && !expr.includes('{')) {
                            try { exprLatex = math.parse(expr).toTex({ parenthesis: 'keep' }); } catch { /* keep raw */ }
                          }
                          return (
                            <div key={i} style={{
                              borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden',
                              transition: 'opacity 0.25s ease, transform 0.25s ease',
                              opacity: i < revealedSteps ? 1 : 0,
                              transform: i < revealedSteps ? 'translateY(0)' : 'translateY(6px)',
                            }}>
                              {/* Step header */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: (exprLatex || step.explanation) ? '1px solid var(--border-subtle)' : 'none', background: `${currentAccent}06` }}>
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: currentAccent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{step.step ?? i + 1}</div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{step.description}</div>
                              </div>
                              {/* Expression block */}
                              {exprLatex && (
                                <div style={{ overflowX: 'auto', padding: '10px 18px', borderBottom: step.explanation ? '1px solid var(--border-subtle)' : 'none', background: `${currentAccent}04` }}>
                                  <Latex latex={exprLatex} display />
                                </div>
                              )}
                              {/* Explanation */}
                              {step.explanation && (
                                <div style={{ padding: '8px 14px 10px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.65, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                  <span style={{ color: currentAccent, flexShrink: 0, fontSize: 13, marginTop: 1 }}>ℹ</span>
                                  <span>{step.explanation}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Graph CTA */}
                    {result.graphExpr && (
                      <button onClick={() => {
                        // Normalize graphExpr: prefix "y = " if it's a bare function with no "=" sign
                        const rawExpr = result.graphExpr!;
                        const normalizedExpr = /[=]/.test(rawExpr) ? rawExpr : `y = ${rawExpr}`;
                        setGraphExprs([{ id: crypto.randomUUID(), expr: normalizedExpr, color: GRAPH_COLORS[0], enabled: true }]);
                        setActive('graph');
                      }}
                        style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: `1px solid ${currentAccent}40`, background: `${currentAccent}10`, color: currentAccent, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        📈 Plot this in Graph Plotter
                      </button>
                    )}

                    {/* Save as flashcard */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={async () => {
                          const problem = input.trim();
                          const answer = result.answer ?? '';
                          if (!problem || !answer) return;
                          try {
                            await fetch('/api/library', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                mode: 'flashcards',
                                content: `Q: ${problem}\nA: ${answer}`,
                                title: problem.length > 60 ? problem.slice(0, 60) + '…' : problem,
                              }),
                            });
                            broadcastInvalidate(LIBRARY_CHANNEL);
                            setFlashcardToast('Saved to flashcards!');
                            setTimeout(() => setFlashcardToast(''), 2800);
                          } catch {
                            setFlashcardToast('Could not save — try again.');
                            setTimeout(() => setFlashcardToast(''), 2800);
                          }
                        }}
                        style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                      >
                        📇 Save as flashcard
                      </button>
                      {flashcardToast && (
                        <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>{flashcardToast}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── FORMULAS VIEW ── */}
        {active === 'formulas' && (() => {
          const q = formulaSearch.trim().toLowerCase();
          const topicsWithFormulas = TOPICS.filter(topic => (FORMULAS[topic.id] ?? []).length > 0);
          const totalCount = topicsWithFormulas.reduce((acc, t) => acc + (FORMULAS[t.id]?.length ?? 0), 0);
          return (
            <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
              <WorkflowCard
                accent={SPECIAL_VIEW_META.formulas.accent}
                title={SPECIAL_VIEW_META.formulas.workflowTitle}
                steps={SPECIAL_VIEW_META.formulas.workflow}
              />

              {/* Search + stats bar */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <input
                  value={formulaSearch}
                  onChange={e => setFormulaSearch(e.target.value)}
                  placeholder="Search formulas…"
                  style={{ flex: 1, minWidth: 180, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{totalCount} formulas across {topicsWithFormulas.length} topics</span>
              </div>

              {/* Topic jump chips */}
              {!q && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                  {topicsWithFormulas.map(topic => (
                    <a key={topic.id} href={`#formula-${topic.id}`}
                      style={{ padding: '3px 12px', borderRadius: 20, border: `1px solid ${topic.color}40`, background: `${topic.color}10`, color: topic.color, fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                      {topic.icon} {topic.label} <span style={{ opacity: 0.7 }}>({FORMULAS[topic.id]?.length ?? 0})</span>
                    </a>
                  ))}
                </div>
              )}

              {topicsWithFormulas.map(topic => {
                const allFormulas = FORMULAS[topic.id] ?? [];
                const formulas = q
                  ? allFormulas.filter(f => f.title.toLowerCase().includes(q) || f.latex.toLowerCase().includes(q))
                  : allFormulas;
                if (formulas.length === 0) return null;
                return (
                  <div key={topic.id} id={`formula-${topic.id}`} style={{ marginBottom: 28, scrollMarginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `2px solid ${topic.color}40` }}>
                      <span style={{ fontSize: 18 }}>{topic.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: topic.color }}>{topic.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{formulas.length} formula{formulas.length !== 1 ? 's' : ''}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>Click any card to explain in solver →</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                      {formulas.map((f, i) => (
                        <div key={i}
                          style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'all 0.12s', position: 'relative' }}
                          onClick={() => { setInput(`Explain: ${f.title}`); setActive(topic.id as TopicId); void solve(`Explain: ${f.title}`, topic.id as TopicId); }}
                          onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = topic.color; el.style.boxShadow = `0 0 0 2px ${topic.color}20`; }}
                          onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border-subtle)'; el.style.boxShadow = 'none'; }}
                          title={`Click to explain "${f.title}" in the solver`}
                        >
                          <div style={{ fontSize: 11, color: topic.color, fontWeight: 600, marginBottom: 8 }}>{f.title}</div>
                          <div style={{ overflowX: 'auto', fontSize: 14 }}>
                            <Latex latex={f.latex} display />
                          </div>
                          {f.note && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>{f.note}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {q && topicsWithFormulas.every(topic => {
                const allFormulas = FORMULAS[topic.id] ?? [];
                return allFormulas.filter(f => f.title.toLowerCase().includes(q) || f.latex.toLowerCase().includes(q)).length === 0;
              }) && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No formulas match &ldquo;{formulaSearch}&rdquo;
                </div>
              )}
            </div>
          );
        })()}

        {/* ── GRAPH VIEW ── */}
        {active === 'graph' && (
          <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <WorkflowCard
              accent={SPECIAL_VIEW_META.graph.accent}
              title={SPECIAL_VIEW_META.graph.workflowTitle}
              steps={SPECIAL_VIEW_META.graph.workflow}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {GRAPH_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => replaceGraphWith(preset.expr)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={resetGraphView} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Home</button>
                <button onClick={() => zoomGraph(0.8)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Zoom in</button>
                <button onClick={() => zoomGraph(1.25)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Zoom out</button>
              </div>
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Supported: <code>y = x^2</code>, <code>x = 2</code>, <code>x^2 + y^2 = 25</code>, line equations, and geometry results from the solver.
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Window x:[{xDomain[0]}, {xDomain[1]}] · y:[{yDomain[0]}, {yDomain[1]}]
              </span>
            </div>

            {/* Graph canvas with hover overlay */}
            <div style={{ position: 'relative', width: '100%', height: 420 }}>
              <div ref={graphRef} style={{ width: '100%', height: '100%', borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }} />
              {/* Transparent hover capture layer */}
              <div
                ref={graphOverlayRef}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
                onMouseMove={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const px = e.clientX - rect.left;
                  const py = e.clientY - rect.top;
                  const padding = 28;
                  const innerW = rect.width - padding * 2;
                  const innerH = rect.height - padding * 2;
                  const xVal = xDomain[0] + ((px - padding) / innerW) * (xDomain[1] - xDomain[0]);
                  const yVal = yDomain[1] - ((py - padding) / innerH) * (yDomain[1] - yDomain[0]);
                  setHoverCoord({ x: xVal, y: yVal, svgX: px, svgY: py });
                }}
                onMouseLeave={() => setHoverCoord(null)}
              />
              {/* Coordinate tooltip */}
              {hoverCoord && (
                <div style={{
                  position: 'absolute',
                  left: hoverCoord.svgX + 12,
                  top: hoverCoord.svgY - 8,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                }}>
                  x = {hoverCoord.x.toFixed(3)}, y = {hoverCoord.y.toFixed(3)}
                </div>
              )}
            </div>
            {graphError && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠ {graphError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {graphExprs.map((ge) => {
                // LaTeX preview
                let latexPreview = '';
                try {
                  const n = normalizeGraphExpression(ge.expr);
                  if (n?.type === 'function' && ge.expr.trim()) {
                    const node = math.parse(n.value);
                    latexPreview = node.toTex({ parenthesis: 'keep' });
                    // Reconstruct y = ... or x = ...
                    const trimmed = ge.expr.trim();
                    if (/^x\s*=/i.test(trimmed)) {
                      latexPreview = `x = ${latexPreview}`;
                    } else {
                      latexPreview = `y = ${latexPreview}`;
                    }
                  }
                } catch { /* skip bad expressions */ }

                return (
                  <div key={ge.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => setGraphExprs(p => p.map(x => x.id === ge.id ? { ...x, enabled: !x.enabled } : x))}
                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border-subtle)', background: ge.enabled ? `${ge.color}1f` : 'transparent', color: ge.enabled ? ge.color : 'var(--text-muted)', cursor: 'pointer', minWidth: 42 }}
                        title={ge.enabled ? 'Hide expression' : 'Show expression'}
                      >
                        {ge.enabled ? 'On' : 'Off'}
                      </button>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: ge.color, flexShrink: 0, cursor: 'pointer' }}
                        onClick={() => { const c = GRAPH_COLORS[(GRAPH_COLORS.indexOf(ge.color) + 1) % GRAPH_COLORS.length]; setGraphExprs(p => p.map(e => e.id === ge.id ? { ...e, color: c } : e)); }} />
                      <input value={ge.expr} onChange={e => setGraphExprs(p => p.map(x => x.id === ge.id ? { ...x, expr: e.target.value } : x))}
                        placeholder="y = x^2"
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontFamily: '"JetBrains Mono", monospace', outline: 'none' }}
                        onKeyDown={e => e.key === 'Enter' && renderGraph()}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 58, textAlign: 'right' }}>
                        {(() => {
                          if (!ge.expr.trim()) return 'Empty';
                          if (isCustomFuncDefinition(ge.expr)) return 'Definition';
                          const normalized = normalizeGraphExpression(ge.expr);
                          if (!normalized) return 'Empty';
                          if (normalized.type === 'parametric') return 'Parametric';
                          return normalized.type === 'function' ? 'Function' : 'Relation';
                        })()}
                      </span>
                      {graphExprs.length > 1 && (
                        <button onClick={() => setGraphExprs(p => p.filter(x => x.id !== ge.id))}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                      )}
                    </div>
                    {/* LaTeX rendered preview */}
                    {latexPreview && (
                      <div style={{ paddingLeft: 76, fontSize: 13, color: ge.color, opacity: 0.9 }}>
                        <Latex latex={latexPreview} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setGraphExprs(p => [...p, { id: crypto.randomUUID(), expr: '', color: GRAPH_COLORS[p.length % GRAPH_COLORS.length], enabled: true }])}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  + Add expression
                </button>
                <button onClick={renderGraph}
                  style={{ fontSize: 12, padding: '5px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  ▶ Plot
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── UNIT CONVERTER ── */}
        {active === 'units' && (
          <div style={{ padding: '20px 24px', flex: 1, maxWidth: 540 }}>
            <WorkflowCard
              accent={SPECIAL_VIEW_META.units.accent}
              title={SPECIAL_VIEW_META.units.workflowTitle}
              steps={SPECIAL_VIEW_META.units.workflow}
            />
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
              Use this tab for quick conversions only — one value, one category, one clean result.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {UNIT_CATS.map((c, i) => (
                <button key={i} onClick={() => { setUnitCatIdx(i); setFromUnit(0); setToUnit(1); }}
                  style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border-subtle)', background: unitCatIdx === i ? '#f59e0b' : 'var(--bg-2)', color: unitCatIdx === i ? '#fff' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: unitCatIdx === i ? 700 : 400 }}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[{ lbl: 'From', idx: fromUnit, set: setFromUnit }, { lbl: 'To', idx: toUnit, set: setToUnit }].map(({ lbl, idx, set }) => (
                <div key={lbl} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>{lbl}</label>
                  <select value={idx} onChange={e => set(Number(e.target.value))}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}>
                    {unitCat.units.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
                  </select>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setFromUnit(toUnit); setToUnit(fromUnit); }}
                  style={{ fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  ⇄ Swap units
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', width: 30 }}>Val</label>
                <input type="number" value={unitValue} onChange={e => setUnitValue(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14 }} />
              </div>
              {unitResult && (
                <div style={{ padding: '16px 18px', borderRadius: 12, background: '#f59e0b14', border: '1.5px solid #f59e0b40', marginTop: 4 }}>
                  <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginBottom: 4 }}>Result</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>{unitResult} <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>{unitCat.units[toUnit].label}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{unitValue} {unitCat.units[fromUnit].label} = {unitResult} {unitCat.units[toUnit].label}</div>
                </div>
              )}
            </div>
          </div>
        )}

                {/* ── QUESTION SCAN ── */}
        {active === 'scan' && (
          <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
            <WorkflowCard accent={SPECIAL_VIEW_META.scan.accent} title={SPECIAL_VIEW_META.scan.workflowTitle} steps={SPECIAL_VIEW_META.scan.workflow} />
            <div style={{ display: 'flex', gap: 6, padding: '3px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', width: 'fit-content' }}>
              {(['upload', 'type'] as const).map(mode => (
                <button key={mode} onClick={() => setScanMode(mode)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'background 0.15s, color 0.15s', background: scanMode === mode ? '#38bdf8' : 'transparent', color: scanMode === mode ? '#fff' : 'var(--text-secondary)' }}>
                  {mode === 'upload' ? '📷 Upload file' : '✏️ Write question'}
                </button>
              ))}
            </div>
            {scanMode === 'upload' && (
              <>
                <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px dashed var(--border-subtle)', background: 'var(--bg-2)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Upload math-question files</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Best for screenshots, worksheets, or PDFs.</div>
                  <input type="file" accept="image/*,.pdf" style={{ fontSize: 13 }} onChange={e => { const f = e.target.files?.[0]; if (f) loadQuestionFromFile(f); }} />
                </div>
                {scanBusy && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>⏳ Reading…</div>}
                {scanError && <div style={{ fontSize: 13, color: '#f87171' }}>⚠️ {scanError}</div>}
                {scanExtracted && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setInput(scanExtracted); setActive('algebra'); inputRef.current?.focus(); }} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--bg-3)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Use in solver</button>
                      <button onClick={() => { setInput(scanExtracted); setActive('algebra'); setTimeout(() => { void solve(scanExtracted, 'algebra'); }, 0); }} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Solve now</button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Extracted text</div>
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{scanExtracted}</div>
                  </div>
                )}
              </>
            )}
            {scanMode === 'type' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Type any math question. Use <code>x^2</code>, <code>sqrt(x)</code>, <code>[[1,2],[3,4]]</code>. Preview renders live as you type.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {([{label:'^',insert:'^'},{label:'√',insert:'sqrt()'},{label:'/',insert:'/'},{label:'π',insert:'pi'},{label:'θ',insert:'theta'},{label:'α',insert:'alpha'},{label:'β',insert:'beta'},{label:'λ',insert:'lambda'},{label:'∞',insert:'inf'},{label:'∂',insert:'d/dx'},{label:'∫',insert:'integrate()'},{label:'sin',insert:'sin()'},{label:'cos',insert:'cos()'},{label:'tan',insert:'tan()'},{label:'ln',insert:'ln()'},{label:'log',insert:'log()'},{label:'e^x',insert:'exp()'},{label:'|x|',insert:'abs()'},{label:'≤',insert:' <= '},{label:'≥',insert:' >= '},{label:'≠',insert:' != '},{label:'[[]]',insert:'[[1,2],[3,4]]'},{label:"y'",insert:"y'"},{label:"y''",insert:"y''"},{label:'Σ',insert:'sum()'},{label:'det',insert:'det()'},{label:'inv',insert:'inv()'}] as Array<{label:string;insert:string}>).map(sym => (
                    <button key={sym.label+sym.insert} onClick={() => { const ta=document.getElementById('math-question-input') as HTMLTextAreaElement|null; if(!ta){setTypeInput(prev=>prev+sym.insert);return;} const s=ta.selectionStart??typeInput.length,e2=ta.selectionEnd??typeInput.length; setTypeInput(typeInput.slice(0,s)+sym.insert+typeInput.slice(e2)); setTimeout(()=>{ta.focus();ta.setSelectionRange(s+sym.insert.length,s+sym.insert.length);},0); }} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace' }}>{sym.label}</button>
                  ))}
                </div>
                <textarea id="math-question-input" value={typeInput} onChange={e => setTypeInput(e.target.value)}
                  placeholder="e.g.  solve x^2 - 5x + 6 = 0  or  det([[1,2],[3,4]])  or  derivative of sin(x^2)"
                  rows={4} style={{ padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-primary)', fontSize: 14, fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.6, outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' as const }} />
                {typeInput.trim() && (
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', minHeight: 48 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>Preview</div>
                    <MathText>{autoWrapMath(typeInput)}</MathText>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={!typeInput.trim()} onClick={() => { setInput(typeInput); setActive('algebra'); inputRef.current?.focus(); }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: typeInput.trim() ? 'pointer' : 'default', opacity: typeInput.trim() ? 1 : 0.4 }}>Use in solver</button>
                  <button disabled={!typeInput.trim()} onClick={() => { const q=typeInput.trim(); setInput(q); setActive('algebra'); setTimeout(()=>{ void solve(q,'algebra'); },0); }} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#fff', fontSize: 13, fontWeight: 700, cursor: typeInput.trim() ? 'pointer' : 'default', opacity: typeInput.trim() ? 1 : 0.4 }}>Solve now</button>
                  <button disabled={!typeInput.trim()} onClick={() => setTypeInput('')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: typeInput.trim() ? 'pointer' : 'default', opacity: typeInput.trim() ? 1 : 0.4 }}>Clear</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VISUAL ANALYZER ── */}
        {active === 'visual' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <VisualAnalyzer />
          </div>
        )}

        {/* ── MATLAB LAB ── */}
        {active === 'matlab' && (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <MatlabLab onGraphExpression={(expr) => { replaceGraphWith(expr); setActive('graph'); }} />
          </div>
        )}

      </div>
    </div>
  );
}

export default MathSolverPage;
