'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import * as math from 'mathjs';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import { readMathContext } from '@/lib/math/context';

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

type NormalizedGraphExpression =
  | { type: 'function'; value: string }
  | { type: 'implicit'; value: string };

// ── Topic catalogue ───────────────────────────────────────────────────────────

const TOPICS = [
  {
    id: 'algebra',
    label: 'Algebra',
    icon: '𝑥',
    color: '#6366f1',
    examples: [
      'Solve x² + 5x + 6 = 0',
      'Factor 4x² - 9',
      'Simplify (2x + 3)² - (x - 1)²',
      'Solve |3x - 2| = 7',
      'Solve system: x + y = 5, 2x - y = 4',
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    icon: '∫',
    color: '#8b5cf6',
    examples: [
      'Differentiate x³ sin(x)',
      'Integrate x² ln(x) dx',
      'Limit of (sin x)/x as x → 0',
      'Find critical points of f(x) = x³ - 3x',
      'Taylor series of e^x at x = 0',
    ],
  },
  {
    id: 'statistics',
    label: 'Statistics',
    icon: 'σ',
    color: '#06b6d4',
    examples: [
      'Mean and SD of [4, 8, 15, 16, 23, 42]',
      'P(A∩B) given P(A)=0.4, P(B)=0.5, P(A∪B)=0.7',
      'Binomial P(X=3) with n=10, p=0.4',
      'Confidence interval for mean, n=25, x̄=50, s=8',
      'Chi-square test for independence',
    ],
  },
  {
    id: 'trigonometry',
    label: 'Trigonometry',
    icon: '∠',
    color: '#f59e0b',
    examples: [
      'Solve 2 sin(x) = 1 for x in [0, 2π]',
      'Simplify sin²(x) + cos²(x)',
      'Find cos(75°) exactly',
      'Solve triangle: a=5, b=7, C=60°',
      'Verify sin(2x) = 2 sin(x) cos(x)',
    ],
  },
  {
    id: 'geometry',
    label: 'Geometry',
    icon: '△',
    color: '#10b981',
    examples: [
      'Area of triangle with sides 3, 4, 5',
      'Equation of circle: center (2,-3), radius 5',
      'Distance between (1,2) and (4,6)',
      'Area of regular hexagon with side 4',
      'Volume of sphere with radius 7',
    ],
  },
  {
    id: 'linear-algebra',
    label: 'Linear Algebra',
    icon: '[]',
    color: '#ec4899',
    examples: [
      'Eigenvalues of [[2,1],[1,2]]',
      'Determinant of [[1,2,3],[4,5,6],[7,8,9]]',
      'Solve Ax=b: A=[[2,1],[1,3]], b=[5,10]',
      'Dot product of [1,2,3] and [4,5,6]',
      'Row reduce [[1,2,3],[4,5,6],[7,8,9]]',
    ],
  },
  {
    id: 'differential-equations',
    label: 'Diff. Equations',
    icon: "y'",
    color: '#f97316',
    examples: [
      "Solve dy/dx = 2xy",
      "Solve y'' - 3y' + 2y = 0",
      "Solve y' - y = e^x",
      "Initial value: y' = y, y(0) = 1",
      "Solve (x² + y²) dx + 2xy dy = 0",
    ],
  },
  {
    id: 'discrete',
    label: 'Discrete Math',
    icon: '#',
    color: '#14b8a6',
    examples: [
      'Find gcd(48, 36)',
      'Permutations of MISSISSIPPI',
      'C(10, 4) combinations',
      '2^100 mod 1000000007',
      'Fibonacci F(20)',
    ],
  },
  {
    id: 'physics',
    label: 'Physics',
    icon: '⚛',
    color: '#ef4444',
    examples: [
      'Projectile: v₀=20 m/s at 30°, find range',
      'Ohm\'s law: V=IR, R=10Ω, I=2A',
      'Kinetic energy at v=15 m/s, m=2 kg',
      'Wave: λ=0.5m, f=680 Hz, find speed',
      'Force on charge q=2μC in E=300 N/C',
    ],
  },
] as const;

type TopicId = typeof TOPICS[number]['id'];
type SpecialView = 'formulas' | 'graph' | 'units' | 'scan' | 'integrate';
type ActiveView = TopicId | SpecialView;

const DEFAULT_ACCENT = 'var(--primary)';

const SPECIAL_VIEW_META: Record<SpecialView, { title: string; subtitle: string; icon: string; accent: string; workflowTitle: string; workflow: WorkflowStep[] }> = {
  integrate: {
    title: 'Integration',
    subtitle: 'Compute indefinite and definite integrals with full step-by-step working and rendered LaTeX.',
    icon: '∫',
    accent: '#8b5cf6',
    workflowTitle: 'Integration workflow',
    workflow: [
      { label: 'Enter f(x)', detail: 'Type the integrand — e.g. x^2, sin(x), or x*e^x.' },
      { label: 'Choose type', detail: 'Pick indefinite (find the antiderivative) or definite (evaluate from a to b).' },
      { label: 'Set bounds', detail: 'For definite integrals enter the lower limit a and upper limit b.' },
      { label: 'Compute', detail: 'The symbolic engine finds the exact antiderivative and evaluates bounds when set.' },
    ],
  },
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
    subtitle: 'Plot functions, vertical lines, and implicit relations without the old graph-runtime crashes.',
    icon: '📈',
    accent: '#22c55e',
    workflowTitle: 'Graph workflow',
    workflow: [
      { label: 'Enter a relation', detail: 'Use forms like y = x^2, x = 2, or x^2 + y^2 = 25.' },
      { label: 'Plot it', detail: 'Hit Plot to render explicit functions and implicit relations in the same graph area.' },
      { label: 'Adjust the window', detail: 'Use Home and zoom controls to inspect shape, intercepts, and symmetry.' },
      { label: 'Compare multiple expressions', detail: 'Add extra rows to see how lines, curves, and relations interact.' },
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
    subtitle: 'Upload a screenshot or PDF of a math question, extract it, and send it to the solver.',
    icon: '🧾',
    accent: '#38bdf8',
    workflowTitle: 'Question-scan workflow',
    workflow: [
      { label: 'Upload a screenshot or PDF', detail: 'This tab only accepts images and PDFs that contain math questions.' },
      { label: 'Extract the question text', detail: 'Images use OCR and PDFs use text extraction so we can turn the file into solver-ready input.' },
      { label: 'Review what was captured', detail: 'Check the extracted question before sending it into the solver.' },
      { label: 'Solve it step by step', detail: 'Use “Solve now” to move the extracted text straight into the Solver tab.' },
    ],
  },
};

const SOLVER_WORKFLOW: WorkflowStep[] = [
  { label: 'Pick or type a problem', detail: 'Start from an example or enter your own question in plain math text.' },
  { label: 'Solve it', detail: 'Run the local solver first, then fall back to AI only when the result needs help.' },
  { label: 'Review the method', detail: 'Read each step and explanation so this feels like guided tutoring, not a black box.' },
  { label: 'Send graphable work to Graph', detail: 'If the result includes a graph expression, open it in the Graph tab instantly.' },
];

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

// ── Symbol pad ────────────────────────────────────────────────────────────────

const SYMBOL_GROUPS = [
  { label: 'Basic', symbols: ['√', '∛', 'π', 'e', '∞', '±', '×', '÷', '≤', '≥', '≠', '≈'] },
  { label: 'Algebra', symbols: ['²', '³', '^', '|x|', '(', ')', '[', ']', '{', '}', '∝', 'Σ'] },
  { label: 'Calculus', symbols: ['∫', '∂', '∑', '∏', 'd/dx', 'lim', '→', '∆', '∇', '∮', '⁻¹', '∞'] },
  { label: 'Trig', symbols: ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh'] },
  { label: 'Greek', symbols: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'σ', 'τ', 'φ', 'ω'] },
  { label: 'Logic', symbols: ['∧', '∨', '¬', '⇒', '⇔', '∀', '∃', '∈', '∉', '⊆', '⊇', '∅'] },
];

const GRAPH_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#0ea5e9'];
const GRAPH_PRESETS = [
  { label: 'Parabola', expr: 'y = x^2' },
  { label: 'Sine', expr: 'y = sin(x)' },
  { label: 'Circle', expr: 'x^2 + y^2 = 25' },
  { label: 'Vertical line', expr: 'x = 2' },
];

function normalizeGraphExpression(expr: string): NormalizedGraphExpression | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(/^y\s*=\s*(.+)$/i);
  if (explicit) {
    return { type: 'function', value: explicit[1].trim() };
  }

  const vertical = trimmed.match(/^x\s*=\s*(.+)$/i);
  if (vertical) {
    return { type: 'implicit', value: `x - (${vertical[1].trim()})` };
  }

  if (trimmed.includes('=')) {
    const [lhs, rhs] = trimmed.split('=').map(part => part.trim());
    if (!lhs || !rhs) return null;
    return { type: 'implicit', value: `(${lhs}) - (${rhs})` };
  }

  return { type: 'function', value: trimmed };
}

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
  integBounds?: { lower: number; upper: number; color: string },
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
  const evaluate = (expr: string, scope: Record<string, number>) => {
    const result = math.evaluate(expr, scope);
    return typeof result === 'number' ? result : Number(result);
  };

  const TICK_COUNT = 10;
  const gridLines = Array.from({ length: TICK_COUNT + 1 }, (_, index) => {
    const x = padding + (innerWidth * index) / TICK_COUNT;
    const y = padding + (innerHeight * index) / TICK_COUNT;
    const xVal = (xDomain[0] + (xRange * index) / TICK_COUNT).toFixed(1).replace(/\.0$/, '');
    const yVal = (yDomain[1] - (yRange * index) / TICK_COUNT).toFixed(1).replace(/\.0$/, '');
    return `
      <line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" stroke="${theme.grid}" stroke-width="1" opacity="0.6" />
      <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="${theme.grid}" stroke-width="1" opacity="0.6" />
      ${index % 2 === 0 ? `<text x="${x}" y="${height - padding + 14}" text-anchor="middle" fill="${theme.labels}" font-size="9" opacity="0.7">${xVal}</text>` : ''}
      ${index % 2 === 0 ? `<text x="${padding - 4}" y="${y + 3}" text-anchor="end" fill="${theme.labels}" font-size="9" opacity="0.7">${yVal}</text>` : ''}
    `;
  }).join('');

  const axisLines = `
    ${xDomain[0] <= 0 && xDomain[1] >= 0 ? `<line x1="${toSvgX(0)}" y1="${padding}" x2="${toSvgX(0)}" y2="${height - padding}" stroke="${theme.axis}" stroke-width="1.5" />` : ''}
    ${yDomain[0] <= 0 && yDomain[1] >= 0 ? `<line x1="${padding}" y1="${toSvgY(0)}" x2="${width - padding}" y2="${toSvgY(0)}" stroke="${theme.axis}" stroke-width="1.5" />` : ''}
  `;

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
        return segments.map(segment => `<path d="${segment}" fill="none" stroke="${expr.color}" stroke-width="2.4" stroke-linecap="round" />`).join('');
      }

      const threshold = Math.max((xRange + yRange) / 220, 0.08);
      const cols = 110;
      const rows = 80;
      const dots: string[] = [];

      for (let row = 0; row <= rows; row += 1) {
        for (let col = 0; col <= cols; col += 1) {
          const x = xDomain[0] + (xRange * col) / cols;
          const y = yDomain[0] + (yRange * row) / rows;
          try {
            const value = evaluate(normalized.value, { x, y });
            if (Number.isFinite(value) && Math.abs(value) <= threshold) {
              dots.push(`<circle cx="${toSvgX(x).toFixed(2)}" cy="${toSvgY(y).toFixed(2)}" r="1.3" fill="${expr.color}" opacity="0.82" />`);
            }
          } catch {
            // Ignore sample points that fail evaluation.
          }
        }
      }

      return dots.join('');
    })
    .join('');

  // Integration shading — drawn over grid/axis but under curve strokes
  let integShading = '';
  if (integBounds) {
    const { lower, upper, color: integColor } = integBounds;
    const firstFn = expressions.find(e => {
      if (!e.enabled || !e.expr.trim()) return false;
      const n = normalizeGraphExpression(e.expr);
      return n?.type === 'function';
    });
    if (firstFn) {
      const norm = normalizeGraphExpression(firstFn.expr)!;
      const N = 160;
      const aClamp = Math.max(lower, xDomain[0]);
      const bClamp = Math.min(upper, xDomain[1]);
      if (aClamp < bClamp) {
        const shadePts: string[] = [];
        const y0 = toSvgY(0);
        // Start at baseline
        shadePts.push(`M ${toSvgX(aClamp).toFixed(2)} ${y0.toFixed(2)}`);
        for (let i = 0; i <= N; i++) {
          const x = aClamp + ((bClamp - aClamp) * i) / N;
          try {
            const y = evaluate(norm.value, { x });
            if (!Number.isFinite(y)) continue;
            shadePts.push(`L ${toSvgX(x).toFixed(2)} ${toSvgY(y).toFixed(2)}`);
          } catch { /* skip */ }
        }
        // Close back to baseline
        shadePts.push(`L ${toSvgX(bClamp).toFixed(2)} ${y0.toFixed(2)} Z`);
        integShading = `
          <path d="${shadePts.join(' ')}" fill="${integColor}" opacity="0.22" />
          <line x1="${toSvgX(aClamp).toFixed(2)}" y1="${padding}" x2="${toSvgX(aClamp).toFixed(2)}" y2="${height - padding}" stroke="${integColor}" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.7" />
          <line x1="${toSvgX(bClamp).toFixed(2)}" y1="${padding}" x2="${toSvgX(bClamp).toFixed(2)}" y2="${height - padding}" stroke="${integColor}" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.7" />
          <text x="${toSvgX(aClamp).toFixed(2)}" y="${padding - 4}" text-anchor="middle" fill="${integColor}" font-size="10" font-weight="600">a=${lower}</text>
          <text x="${toSvgX(bClamp).toFixed(2)}" y="${padding - 4}" text-anchor="middle" fill="${integColor}" font-size="10" font-weight="600">b=${upper}</text>
        `;
      }
    }
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Math graph">
      <rect width="${width}" height="${height}" fill="${theme.background}" rx="14" ry="14" />
      ${gridLines}
      ${axisLines}
      ${integShading}
      ${layers}
      <text x="${padding}" y="${height - 8}" fill="${theme.labels}" font-size="11">x: [${xDomain[0]}, ${xDomain[1]}]</text>
      <text x="${width - padding}" y="${height - 8}" text-anchor="end" fill="${theme.labels}" font-size="11">y: [${yDomain[0]}, ${yDomain[1]}]</text>
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

// ── Main component ────────────────────────────────────────────────────────────

const MATH_SIDEBAR_KEY = 'kivora-math-sidebar';

export function MathSolverPage() {
  const [active, setActive] = useState<ActiveView>('algebra');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(MATH_SIDEBAR_KEY) !== 'closed'; } catch { return true; }
  });
  const [input, setInput] = useState('');
  const [symbolTab, setSymbolTab] = useState(0);
  const [showSymbols, setShowSymbols] = useState(false);
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
  // Integration bounds
  const [integMode, setIntegMode] = useState(false);
  const [integLower, setIntegLower] = useState('-1');
  const [integUpper, setIntegUpper] = useState('1');
  const [integResult, setIntegResult] = useState<string | null>(null);

  // ── Integration module state ────────────────────────────────────────────────
  const [intgFn, setIntgFn] = useState('x^2');
  const [intgVar, setIntgVar] = useState('x');
  const [intgType, setIntgType] = useState<'indefinite' | 'definite'>('indefinite');
  const [intgLower, setIntgLower] = useState('0');
  const [intgUpper, setIntgUpper] = useState('1');
  const [intgLoading, setIntgLoading] = useState(false);
  interface IntgStep { step: number; description: string; expression: string; explanation: string }
  const [intgSteps, setIntgSteps] = useState<IntgStep[]>([]);
  const [intgAnswer, setIntgAnswer] = useState('');
  const [intgAnswerLatex, setIntgAnswerLatex] = useState('');
  const [intgError, setIntgError] = useState('');
  const [intgNumerical, setIntgNumerical] = useState<string | null>(null);

  const [contextName, setContextName] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanFileName, setScanFileName] = useState('');
  const [scanError, setScanError] = useState('');
  const [scanExtracted, setScanExtracted] = useState('');
  const [scanSource, setScanSource] = useState<'image' | 'pdf' | null>(null);

  // Unit converter state
  const [unitCatIdx, setUnitCatIdx] = useState(0);
  const [fromUnit, setFromUnit] = useState(0);
  const [toUnit, setToUnit] = useState(1);
  const [unitValue, setUnitValue] = useState('1');

  useEffect(() => { setHistory(loadHistory()); }, []);

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
    setScanFileName(file.name);
    setScanSource(isImage ? 'image' : 'pdf');

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

  // ── Integration module ─────────────────────────────────────────────────────

  const runIntegration = useCallback(async () => {
    const fn = intgFn.trim();
    if (!fn) return;
    setIntgLoading(true);
    setIntgError('');
    setIntgSteps([]);
    setIntgAnswer('');
    setIntgAnswerLatex('');
    setIntgNumerical(null);

    const problem = intgType === 'definite'
      ? `integral from ${intgLower} to ${intgUpper} of ${fn} d${intgVar}`
      : `integrate ${fn} d${intgVar}`;

    try {
      const res = await fetch('/api/math/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, category: 'calculus' }),
      });
      const data = await res.json() as { answer?: string; answerLatex?: string; steps?: IntgStep[]; error?: string };
      if (data.error) { setIntgError(data.error); return; }
      setIntgAnswer(data.answer ?? '');
      setIntgAnswerLatex(data.answerLatex ?? data.answer ?? '');
      setIntgSteps(data.steps ?? []);

      // Numerical estimate for definite integral
      if (intgType === 'definite') {
        const a = parseFloat(intgLower);
        const b = parseFloat(intgUpper);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          const N = 2000;
          const h = (b - a) / N;
          let sum = 0;
          try {
            for (let i = 0; i <= N; i++) {
              const xv = a + h * i;
              const yv = math.evaluate(fn, { [intgVar]: xv });
              const val = typeof yv === 'number' ? yv : Number(yv);
              if (!Number.isFinite(val)) continue;
              const w = i === 0 || i === N ? 1 : i % 2 === 0 ? 2 : 4;
              sum += w * val;
            }
            setIntgNumerical(((h / 3) * sum).toFixed(8));
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setIntgError(err instanceof Error ? err.message : 'Solver error');
    } finally {
      setIntgLoading(false);
    }
  }, [intgFn, intgVar, intgType, intgLower, intgUpper]);

  // ── Graph rendering ────────────────────────────────────────────────────────

  const computeIntegral = useCallback((lower: number, upper: number): string => {
    const firstFn = graphExprs.find(e => {
      if (!e.enabled || !e.expr.trim()) return false;
      const n = normalizeGraphExpression(e.expr);
      return n?.type === 'function';
    });
    if (!firstFn) return 'No function to integrate';
    const norm = normalizeGraphExpression(firstFn.expr);
    if (!norm || norm.type !== 'function') return 'No function to integrate';
    // Adaptive Simpson's rule (N=1000 subintervals)
    const N = 1000;
    const h = (upper - lower) / N;
    let sum = 0;
    try {
      for (let i = 0; i <= N; i++) {
        const x = lower + h * i;
        const y = math.evaluate(norm.value, { x });
        const val = typeof y === 'number' ? y : Number(y);
        if (!Number.isFinite(val)) continue;
        const weight = i === 0 || i === N ? 1 : i % 2 === 0 ? 2 : 4;
        sum += weight * val;
      }
      const result = (h / 3) * sum;
      return Number.isFinite(result) ? result.toFixed(6) : 'undefined';
    } catch {
      return 'Error';
    }
  }, [graphExprs]);

  const renderGraph = useCallback(() => {
    if (!graphRef.current) return;
    const enabled = graphExprs.filter(e => e.enabled && e.expr.trim());
    if (enabled.length === 0) {
      graphRef.current.innerHTML = '';
      setGraphError('');
      return;
    }
    try {
      const lower = parseFloat(integLower);
      const upper = parseFloat(integUpper);
      const bounds = integMode && Number.isFinite(lower) && Number.isFinite(upper) && lower < upper
        ? { lower, upper, color: '#6366f1' }
        : undefined;
      graphRef.current.innerHTML = buildGraphSvg(enabled, xDomain, yDomain, bounds);
      if (bounds) {
        setIntegResult(computeIntegral(lower, upper));
      }
      setGraphError('');
    } catch (err) {
      graphRef.current.innerHTML = '';
      setGraphError(err instanceof Error ? err.message : String(err));
    }
  }, [graphExprs, xDomain, yDomain, integMode, integLower, integUpper, computeIntegral]);

  useEffect(() => {
    if (active === 'graph') renderGraph();
  }, [active, renderGraph, themeTick]);

  // Auto-plot with debounce when expressions or domain changes
  useEffect(() => {
    if (active !== 'graph') return;
    const t = setTimeout(() => renderGraph(), 320);
    return () => clearTimeout(t);
  }, [graphExprs, xDomain, yDomain, integMode, integLower, integUpper, active, renderGraph]);

  function resetGraphView() {
    setXDomain([-12, 12]);
    setYDomain([-10, 10]);
  }

  function zoomGraph(factor: number) {
    setXDomain(([min, max]) => [Number((min * factor).toFixed(2)), Number((max * factor).toFixed(2))]);
    setYDomain(([min, max]) => [Number((min * factor).toFixed(2)), Number((max * factor).toFixed(2))]);
  }

  // ── Symbol insertion ────────────────────────────────────────────────────────

  function insertSymbol(sym: string) {
    const el = inputRef.current;
    if (!el) { setInput(p => p + sym); return; }
    const s = el.selectionStart ?? input.length;
    const e = el.selectionEnd ?? s;
    const next = input.slice(0, s) + sym + input.slice(e);
    setInput(next);
    setTimeout(() => { el.focus(); el.setSelectionRange(s + sym.length, s + sym.length); }, 0);
  }

  // ── Computed ────────────────────────────────────────────────────────────────

  const currentTopic = TOPICS.find(t => t.id === active);
  const specialMeta = !currentTopic ? SPECIAL_VIEW_META[active as SpecialView] : null;
  const currentAccent = currentTopic?.color ?? specialMeta?.accent ?? DEFAULT_ACCENT;
  const activeTitle = currentTopic?.label ?? specialMeta?.title ?? 'Math';
  const activeSubtitle = currentTopic
    ? 'Solve one problem at a time with examples, symbols, and step-by-step output.'
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
      width: sidebarOpen ? 220 : 52,
      minWidth: sidebarOpen ? 220 : 52,
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
        onClick={() => setActive(id)}
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
          {TOPICS.map(t => <NavItem key={t.id} id={t.id} icon={t.icon} label={t.label} color={t.color} />)}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 14px' }} />
          <NavItem id="formulas"  icon="📚" label="Formula Sheets" />
          <NavItem id="graph"     icon="📈" label="Graph Plotter"  color="#22c55e" />
          <NavItem id="integrate" icon="∫"  label="Integration"    color="#8b5cf6" />
          <NavItem id="units"     icon="⚖" label="Unit Converter" color="#f59e0b" />
          <NavItem id="scan"      icon="🧾" label="Question Scan"  color="#38bdf8" />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={S.main}>

        {/* Header */}
        <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>{currentTopic?.icon ?? specialMeta?.icon ?? '∑'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
              {activeTitle}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {activeSubtitle}
            </div>
          </div>
          {history.length > 0 && (
            <button onClick={() => setShowHistory(h => !h)}
              style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${showHistory ? 'var(--primary)' : 'var(--border-subtle)'}`, background: showHistory ? 'color-mix(in srgb, var(--primary) 10%, var(--bg-elevated))' : 'var(--bg-elevated)', color: showHistory ? 'var(--primary)' : 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              🕐 History
              <span style={{ background: showHistory ? 'var(--primary)' : 'var(--border-mid, var(--border-subtle))', color: showHistory ? '#fff' : 'var(--text-muted)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>{history.length}</span>
            </button>
          )}
        </div>

        {/* History drawer */}
        {showHistory && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-2)' }}>
            {history.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No history yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {history.map(h => (
                  <button key={h.id} onClick={() => {
                    const nextCategory = (TOPICS.find(topic => topic.id === h.category)?.id ?? 'algebra') as TopicId;
                    setInput(h.problem);
                    setShowHistory(false);
                    setActive(nextCategory);
                    setTimeout(() => { void solve(h.problem, nextCategory); }, 0);
                  }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.problem}</span>
                    <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, flexShrink: 0 }}>{h.answer.slice(0, 30)}{h.answer.length > 30 ? '…' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SOLVER PHASE ── */}
        {active !== 'formulas' && active !== 'graph' && active !== 'units' && active !== 'scan' && active !== 'integrate' && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
            <WorkflowCard
              accent={currentAccent}
              title="Solver flow"
              steps={SOLVER_WORKFLOW}
            />

            {/* Quick examples */}
            {currentTopic && (
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

            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Best for: one problem, one result, and clear working steps.
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Press <strong style={{ color: 'var(--text-primary)' }}>Enter</strong> to solve, <strong style={{ color: 'var(--text-primary)' }}>Shift + Enter</strong> for a new line.
              </span>
            </div>

            {contextName && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)' }}>
                Linked workspace file: <strong style={{ color: 'var(--text-primary)' }}>{contextName}</strong>
              </div>
            )}

            {/* Input box */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void solve(); } }}
                    placeholder="Enter a math problem, equation, or expression… (Enter to solve)"
                    rows={2}
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: 12, resize: 'none',
                      border: `1.5px solid ${loading ? 'var(--primary)' : 'var(--border-subtle)'}`,
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 15,
                      fontFamily: '"JetBrains Mono", monospace', boxSizing: 'border-box', outline: 'none',
                      transition: 'border-color 0.15s',
                    }}
                  />
                </div>
                <button onClick={() => void solve()} disabled={loading || !input.trim()}
                  style={{
                    padding: '12px 20px', borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer',
                    background: loading ? 'var(--primary-muted, #6366f133)' : 'var(--primary)',
                    color: loading ? 'var(--primary)' : '#fff', fontWeight: 700, fontSize: 14,
                    transition: 'all 0.15s', flexShrink: 0, minWidth: 90, height: 52,
                  }}>
                  {loading ? '⏳' : '▶ Solve'}
                </button>
              </div>
              {/* Live LaTeX preview of the typed input */}
              {(() => {
                if (!input.trim()) return null;
                try {
                  const node = math.parse(input.trim());
                  const tex = node.toTex({ parenthesis: 'keep' });
                  return (
                    <div style={{ marginTop: 4, padding: '6px 12px', borderRadius: 8, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 14, overflowX: 'auto' }}>
                      <Latex latex={tex} display={false} />
                    </div>
                  );
                } catch { return null; }
              })()}
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <button onClick={() => setShowSymbols(s => !s)}
                  style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                  {showSymbols ? '▲ Hide symbols' : '▼ Symbols'}
                </button>
                {input && <button onClick={() => { setInput(''); setResult(null); inputRef.current?.focus(); }}
                  style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Clear</button>}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>Shift+Enter for new line</span>
              </div>
            </div>

            {/* Symbol pad */}
            {showSymbols && (
              <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {SYMBOL_GROUPS.map((g, i) => (
                    <button key={i} onClick={() => setSymbolTab(i)}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: symbolTab === i ? 'var(--primary)' : 'var(--bg-elevated)', color: symbolTab === i ? '#fff' : 'var(--text-secondary)', fontWeight: symbolTab === i ? 600 : 400 }}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {SYMBOL_GROUPS[symbolTab].symbols.map(s => (
                    <button key={s} onClick={() => insertSymbol(s)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace', minWidth: 38, transition: 'all 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget).style.borderColor = 'var(--primary)'; (e.currentTarget).style.color = 'var(--primary)'; }}
                      onMouseLeave={e => { (e.currentTarget).style.borderColor = 'var(--border-subtle)'; (e.currentTarget).style.color = 'var(--text-primary)'; }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent history chips */}
            {history.length > 0 && !loading && !result && (
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
                <div style={{ height: 60, borderRadius: 12, background: 'var(--bg-2)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                <div style={{ height: 40, borderRadius: 8, background: 'var(--bg-2)', animation: 'pulse 1.4s ease-in-out 0.2s infinite', width: '75%' }} />
                <div style={{ height: 40, borderRadius: 8, background: 'var(--bg-2)', animation: 'pulse 1.4s ease-in-out 0.4s infinite', width: '55%' }} />
                <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.error ? (
                  <div style={{ padding: '14px 18px', borderRadius: 10, background: '#ef444410', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13 }}>
                    ⚠ {result.error}
                  </div>
                ) : (
                  <>
                    {/* Answer card */}
                      <div style={{ padding: '18px 20px', borderRadius: 14, background: `${currentAccent}0d`, border: `1.5px solid ${currentAccent}30` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: currentAccent, marginBottom: 8 }}>Answer</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', overflowX: 'auto' }}>
                        {result.answerLatex ? <Latex latex={result.answerLatex} display /> : result.answer}
                      </div>
                      {result.engine === 'ai' && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>✨ AI-powered · {result.category}</div>}
                      {result.engine !== 'ai' && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>🔢 Symbolic solver · {result.engine}</div>}
                    </div>

                    {/* Steps */}
                    {result.steps.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Step-by-step solution</div>
                        {result.steps.map((step, i) => {
                          // Detect whether expression is already LaTeX (contains backslash or ^{}) or plain math
                          const expr = step.expression ?? '';
                          let exprLatex = expr;
                          if (expr && !expr.includes('\\') && !expr.includes('{')) {
                            // Try to parse as mathjs and convert to LaTeX
                            try { exprLatex = math.parse(expr).toTex({ parenthesis: 'keep' }); } catch { /* keep raw */ }
                          }
                          return (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', alignItems: 'flex-start' }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: currentAccent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{step.step ?? i + 1}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{step.description}</div>
                                {exprLatex && (
                                  <div style={{ overflowX: 'auto', padding: '8px 12px', marginBottom: 4, background: `${currentAccent}08`, borderRadius: 8, border: `1px solid ${currentAccent}20` }}>
                                    <Latex latex={exprLatex} display />
                                  </div>
                                )}
                                {step.explanation && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.explanation}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Graph CTA */}
                    {result.graphExpr && (
                      <button onClick={() => { setGraphExprs([{ id: '1', expr: result.graphExpr!, color: GRAPH_COLORS[0], enabled: true }]); setActive('graph'); }}
                        style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                        📈 View graph of {result.graphExpr}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── FORMULAS VIEW ── */}
        {active === 'formulas' && (
          <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto' }}>
            <WorkflowCard
              accent={SPECIAL_VIEW_META.formulas.accent}
              title={SPECIAL_VIEW_META.formulas.workflowTitle}
              steps={SPECIAL_VIEW_META.formulas.workflow}
            />
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', marginBottom: 18, fontSize: 12, color: 'var(--text-secondary)' }}>
              This tab is for revision speed: scan formulas, then click one to send it back into the solver for explanation or practice.
            </div>
            {TOPICS.map(topic => {
              const formulas = FORMULAS[topic.id] ?? [];
              if (formulas.length === 0) return null;
              return (
                <div key={topic.id} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${topic.color}40` }}>
                    <span style={{ fontSize: 18 }}>{topic.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: topic.color }}>{topic.label}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                    {formulas.map((f, i) => (
                      <div key={i}
                        style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'border-color 0.12s' }}
                        onClick={() => { setInput(`Explain: ${f.title}`); setActive(topic.id as TopicId); void solve(`Explain: ${f.title}`, topic.id as TopicId); }}
                        onMouseEnter={e => { (e.currentTarget).style.borderColor = topic.color; }}
                        onMouseLeave={e => { (e.currentTarget).style.borderColor = 'var(--border-subtle)'; }}
                        title="Click to solve / explain"
                      >
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{f.title}</div>
                        <div style={{ overflowX: 'auto', fontSize: 14 }}>
                          <Latex latex={f.latex} display />
                        </div>
                        {f.note && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{f.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
                Supported: <code>y = x^2</code>, <code>x = 2</code>, <code>x^2 + y^2 = 25</code>.
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

            {/* Integration controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 10, background: integMode ? '#6366f114' : 'var(--bg-2)', border: `1px solid ${integMode ? '#6366f140' : 'var(--border-subtle)'}` }}>
              <button
                onClick={() => { setIntegMode(m => !m); }}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, border: 'none', background: integMode ? '#6366f1' : 'var(--bg-elevated)', color: integMode ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: integMode ? 700 : 400 }}
              >
                ∫ Integration
              </button>
              {integMode && (
                <>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>a =</label>
                  <input
                    type="number"
                    value={integLower}
                    onChange={e => setIntegLower(e.target.value)}
                    style={{ width: 68, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}
                  />
                  <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>b =</label>
                  <input
                    type="number"
                    value={integUpper}
                    onChange={e => setIntegUpper(e.target.value)}
                    style={{ width: 68, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13 }}
                  />
                  {integResult !== null && (
                    <div style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>∫ f(x) dx ≈</span>
                      <strong style={{ color: '#6366f1', marginLeft: 4 }}>{integResult}</strong>
                    </div>
                  )}
                </>
              )}
              {!integMode && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Toggle to shade area under curve and compute ∫f(x)dx</span>
              )}
            </div>

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
                          const normalized = normalizeGraphExpression(ge.expr);
                          return normalized ? (normalized.type === 'function' ? 'Function' : 'Relation') : 'Empty';
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

        {/* ── INTEGRATION MODULE ── */}
        {active === 'integrate' && (
          <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
            <WorkflowCard
              accent="#8b5cf6"
              title={SPECIAL_VIEW_META.integrate.workflowTitle}
              steps={SPECIAL_VIEW_META.integrate.workflow}
            />

            {/* Type toggle */}
            <div style={{ display: 'flex', gap: 8 }}>
              {(['indefinite', 'definite'] as const).map(t => (
                <button key={t} onClick={() => setIntgType(t)}
                  style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: intgType === t ? 700 : 400, fontSize: 13, background: intgType === t ? '#8b5cf6' : 'var(--bg-2)', color: intgType === t ? '#fff' : 'var(--text-secondary)', transition: 'all 0.12s' }}>
                  {t === 'indefinite' ? '∫ f(x) dx' : '∫ₐᵇ f(x) dx'}
                </button>
              ))}
            </div>

            {/* Large rendered integral preview */}
            <div style={{ padding: '16px 20px', borderRadius: 14, background: '#8b5cf608', border: '1.5px solid #8b5cf630', minHeight: 56, display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => {
                if (!intgFn.trim()) return <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Enter f(x) below to see a preview</span>;
                try {
                  let tex = '';
                  if (intgType === 'definite') {
                    const fnNode = math.parse(intgFn.trim());
                    tex = `\\int_{${intgLower}}^{${intgUpper}} ${fnNode.toTex({ parenthesis: 'keep' })} \\, d${intgVar}`;
                  } else {
                    const fnNode = math.parse(intgFn.trim());
                    tex = `\\int ${fnNode.toTex({ parenthesis: 'keep' })} \\, d${intgVar}`;
                  }
                  return <Latex latex={tex} display />;
                } catch {
                  return <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{intgFn}</span>;
                }
              })()}
            </div>

            {/* Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 60 }}>f({intgVar}) =</label>
                <input
                  value={intgFn}
                  onChange={e => setIntgFn(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void runIntegration()}
                  placeholder="x^2, sin(x), x*e^x, …"
                  style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontFamily: '"JetBrains Mono", monospace', outline: 'none' }}
                />
                <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>d</label>
                <input
                  value={intgVar}
                  onChange={e => setIntgVar(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2) || 'x')}
                  style={{ width: 48, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, fontFamily: '"JetBrains Mono", monospace', textAlign: 'center', outline: 'none' }}
                />
              </div>

              {intgType === 'definite' && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Lower bound a =</label>
                  <input type="number" value={intgLower} onChange={e => setIntgLower(e.target.value)}
                    style={{ width: 80, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
                  <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Upper bound b =</label>
                  <input type="number" value={intgUpper} onChange={e => setIntgUpper(e.target.value)}
                    style={{ width: 80, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => void runIntegration()}
                disabled={intgLoading || !intgFn.trim()}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: intgLoading ? '#8b5cf650' : '#8b5cf6', color: '#fff', fontSize: 14, fontWeight: 700, cursor: intgLoading ? 'default' : 'pointer', transition: 'all 0.15s' }}>
                {intgLoading ? '⏳ Computing…' : '▶ Compute'}
              </button>
              <button
                onClick={() => { setIntgSteps([]); setIntgAnswer(''); setIntgAnswerLatex(''); setIntgError(''); setIntgNumerical(null); }}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                Clear
              </button>
              {/* Quick examples */}
              {(['x^2', 'sin(x)', 'e^x', 'x*ln(x)', '1/x', 'sqrt(x)'] as const).map(ex => (
                <button key={ex} onClick={() => setIntgFn(ex)}
                  style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                  {ex}
                </button>
              ))}
            </div>

            {intgError && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: '#ef444410', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13 }}>
                ⚠ {intgError}
              </div>
            )}

            {/* Result */}
            {intgAnswerLatex && !intgLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Main result card */}
                <div style={{ padding: '18px 20px', borderRadius: 14, background: '#8b5cf60d', border: '1.5px solid #8b5cf630' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8b5cf6', marginBottom: 10 }}>
                    {intgType === 'definite' ? 'Definite Integral Result' : 'Antiderivative'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', overflowX: 'auto' }}>
                    <Latex latex={intgAnswerLatex} display />
                  </div>
                  {intgNumerical && (
                    <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                      Numerical estimate (Simpson&apos;s rule, N=2000): <strong style={{ color: '#8b5cf6' }}>{intgNumerical}</strong>
                    </div>
                  )}
                </div>

                {/* Steps */}
                {intgSteps.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Step-by-step working</div>
                    {intgSteps.map((step, i) => {
                      const expr = step.expression ?? '';
                      let exprLatex = expr;
                      if (expr && !expr.includes('\\') && !expr.includes('{')) {
                        try { exprLatex = math.parse(expr).toTex({ parenthesis: 'keep' }); } catch { /* keep */ }
                      }
                      return (
                        <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', alignItems: 'flex-start' }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{step.step ?? i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{step.description}</div>
                            {exprLatex && (
                              <div style={{ overflowX: 'auto', padding: '8px 12px', marginBottom: 4, background: '#8b5cf608', borderRadius: 8, border: '1px solid #8b5cf620' }}>
                                <Latex latex={exprLatex} display />
                              </div>
                            )}
                            {step.explanation && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.explanation}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Send to graph button */}
                <button
                  onClick={() => { setGraphExprs([{ id: crypto.randomUUID(), expr: `y = ${intgFn}`, color: '#8b5cf6', enabled: true }]); setActive('graph'); }}
                  style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-2)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
                  📈 Plot f({intgVar}) = {intgFn} on Graph
                </button>
              </div>
            )}
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
            <WorkflowCard
              accent={SPECIAL_VIEW_META.scan.accent}
              title={SPECIAL_VIEW_META.scan.workflowTitle}
              steps={SPECIAL_VIEW_META.scan.workflow}
            />

            <div style={{ padding: '14px 16px', borderRadius: 12, border: '1px dashed var(--border-subtle)', background: 'var(--bg-2)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>
                Upload math-question files only
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Best for phone screenshots, worksheet captures, or PDFs that contain a single question or a short worked problem.
              </div>
              <input
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void loadQuestionFromFile(file);
                  }
                  event.currentTarget.value = '';
                }}
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
              />
            </div>

            {scanBusy && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)' }}>
                Extracting the question from <strong style={{ color: 'var(--text-primary)' }}>{scanFileName || 'your file'}</strong>…
              </div>
            )}

            {scanError && (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: '#ef444410', border: '1px solid #ef444440', fontSize: 12, color: '#ef4444' }}>
                ⚠ {scanError}
              </div>
            )}

            {scanExtracted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Extracted question
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {scanFileName || 'Uploaded file'} · {scanSource === 'image' ? 'Screenshot OCR' : 'PDF text extraction'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          setInput(scanExtracted);
                          setActive('algebra');
                          inputRef.current?.focus();
                        }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
                      >
                        Use in solver
                      </button>
                      <button
                        onClick={() => {
                          setInput(scanExtracted);
                          setActive('algebra');
                          setTimeout(() => { void solve(scanExtracted, 'algebra'); }, 0);
                        }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#38bdf8', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        Solve now
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Extracted text
                  </div>
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)', fontFamily: '"JetBrains Mono", monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
                    {scanExtracted}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MathSolverPage;
