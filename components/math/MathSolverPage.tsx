'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import * as math from 'mathjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const functionPlot = typeof window !== 'undefined' ? require('function-plot') : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MathStep {
  step: number;
  description: string;
  latex: string;
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
type SpecialView = 'formulas' | 'graph' | 'units';
type ActiveView = TopicId | SpecialView;

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

function restyleGraphCanvas(target: HTMLDivElement | null) {
  if (!target) return;
  const svg = target.querySelector('svg');
  if (!svg) return;
  const theme = document.documentElement.getAttribute('data-theme');
  const dark = theme === 'blue' || theme === 'black' || theme === 'dark';
  const background = dark ? '#10192d' : '#ffffff';
  const axis = dark ? '#dbe4f5' : '#111827';
  const grid = dark ? '#31415e' : '#dbe4f0';
  const labels = dark ? '#dbe4f5' : '#1f2937';

  svg.style.background = background;
  svg.querySelectorAll('.x.axis path, .y.axis path').forEach(node => {
    (node as SVGElement).setAttribute('stroke', axis);
    (node as SVGElement).setAttribute('stroke-width', '1.6');
  });
  svg.querySelectorAll('.x.axis line, .y.axis line').forEach(node => {
    (node as SVGElement).setAttribute('stroke', axis);
    (node as SVGElement).setAttribute('stroke-width', '1.25');
  });
  svg.querySelectorAll('.x.grid line, .y.grid line').forEach(node => {
    (node as SVGElement).setAttribute('stroke', grid);
  });
  svg.querySelectorAll('text').forEach(node => {
    (node as SVGElement).setAttribute('fill', labels);
  });
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

export function MathSolverPage() {
  const [active, setActive] = useState<ActiveView>('algebra');
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
    { id: '1', expr: 'x^2', color: GRAPH_COLORS[0], enabled: true },
  ]);
  const [_graphInput, _setGraphInput] = useState('');
  const graphRef = useRef<HTMLDivElement>(null);
  const [graphError, setGraphError] = useState('');
  const [xDomain, setXDomain] = useState<[number, number]>([-12, 12]);
  const [yDomain, setYDomain] = useState<[number, number]>([-10, 10]);
  const [themeTick, setThemeTick] = useState(0);

  // Unit converter state
  const [unitCatIdx, setUnitCatIdx] = useState(0);
  const [fromUnit, setFromUnit] = useState(0);
  const [toUnit, setToUnit] = useState(1);
  const [unitValue, setUnitValue] = useState('1');

  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => setThemeTick(v => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const replaceGraphWith = useCallback((expr: string) => {
    setGraphExprs([{ id: crypto.randomUUID(), expr, color: GRAPH_COLORS[0], enabled: true }]);
  }, []);

  // ── Solver ─────────────────────────────────────────────────────────────────

  const solve = useCallback(async (problem: string = input) => {
    const p = problem.trim();
    if (!p) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/math/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: p, category: TOPICS.find(t => t.id === active)?.id ?? null }),
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
      setResult({ answer: '', answerLatex: '', steps: [], graphExpr: null, category: String(active), engine: 'error', error: 'Network error — check that the AI model is running.' });
    } finally {
      setLoading(false);
    }
  }, [input, active, replaceGraphWith]);

  // ── Graph rendering ────────────────────────────────────────────────────────

  const renderGraph = useCallback(() => {
    if (!graphRef.current || !functionPlot) return;
    const enabled = graphExprs.filter(e => e.enabled && e.expr.trim());
    if (enabled.length === 0) {
      graphRef.current.innerHTML = '';
      setGraphError('');
      return;
    }
    setGraphError('');
    try {
      const fns = enabled
        .map(e => {
          const normalized = normalizeGraphExpression(e.expr);
          if (!normalized) return null;
          if (normalized.type === 'implicit') {
            return { fn: normalized.value, fnType: 'implicit', color: e.color, sampler: 'builtIn' };
          }
          return { fn: normalized.value, color: e.color, sampler: 'builtIn', nSamples: 500 };
        })
        .filter(Boolean);
      if (fns.length === 0) {
        graphRef.current.innerHTML = '';
        return;
      }
      functionPlot({
        target: graphRef.current,
        width: graphRef.current.clientWidth || 600,
        height: 380,
        xAxis: { domain: xDomain },
        yAxis: { domain: yDomain },
        grid: true,
        data: fns,
      });
      restyleGraphCanvas(graphRef.current);
    } catch (err) {
      setGraphError(String(err));
    }
  }, [graphExprs, xDomain, yDomain]);

  useEffect(() => {
    if (active === 'graph') renderGraph();
  }, [active, renderGraph, themeTick]);

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
  const _currentFormulas = FORMULAS[active as string] ?? [];
  const activeTitle = currentTopic?.label ?? (active === 'formulas' ? 'Formula Sheets' : active === 'graph' ? 'Graph Plotter' : 'Unit Converter');
  const activeSubtitle =
    active === 'formulas'
      ? 'Quick-reference formulas organized by topic, ready to review before homework or exams.'
      : active === 'graph'
        ? 'Plot functions, vertical lines, and implicit relations with a cleaner graphing workflow.'
        : active === 'units'
          ? 'Convert the common units students need most, with a simpler focused tool.'
          : 'Solve one problem at a time with examples, symbols, and step-by-step output.';

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
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: 4 }} title={sidebarOpen ? 'Collapse' : 'Expand'}>
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <div style={{ padding: '0 0 8px' }}>
          {TOPICS.map(t => <NavItem key={t.id} id={t.id} icon={t.icon} label={t.label} color={t.color} />)}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 14px' }} />
          <NavItem id="formulas" icon="📚" label="Formula Sheets" />
          <NavItem id="graph"    icon="📈" label="Graph Plotter"  color="#22c55e" />
          <NavItem id="units"    icon="⚖" label="Unit Converter" color="#f59e0b" />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div style={S.main}>

        {/* Header */}
        <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>{currentTopic?.icon ?? (active === 'formulas' ? '📚' : active === 'graph' ? '📈' : '⚖')}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>
              {activeTitle}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {activeSubtitle}
            </div>
          </div>
          <button onClick={() => setShowHistory(h => !h)}
            style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: showHistory ? 'var(--primary)1a' : 'transparent', color: showHistory ? 'var(--primary)' : 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
            🕐 History
          </button>
        </div>

        {/* History drawer */}
        {showHistory && (
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-2)' }}>
            {history.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No history yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {history.map(h => (
                  <button key={h.id} onClick={() => { setInput(h.problem); setShowHistory(false); setActive((h.category as ActiveView) ?? 'algebra'); setTimeout(() => solve(h.problem), 0); }}
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
        {active !== 'formulas' && active !== 'graph' && active !== 'units' && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>

            {/* Quick examples */}
            {currentTopic && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {currentTopic.examples.map(ex => (
                  <button key={ex} onClick={() => { setInput(ex); solve(ex); }}
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
                    <div style={{ padding: '18px 20px', borderRadius: 14, background: `${currentTopic?.color ?? 'var(--primary)'}0d`, border: `1.5px solid ${currentTopic?.color ?? 'var(--primary)'}30` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: currentTopic?.color ?? 'var(--primary)', marginBottom: 8 }}>Answer</div>
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
                        {result.steps.map((step, i) => (
                          <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', alignItems: 'flex-start' }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: currentTopic?.color ?? 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{step.step ?? i + 1}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>{step.description}</div>
                              {step.latex && (
                                <div style={{ overflowX: 'auto', padding: '6px 0', marginBottom: 4 }}>
                                  <Latex latex={step.latex} display />
                                </div>
                              )}
                              {step.explanation && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step.explanation}</div>}
                            </div>
                          </div>
                        ))}
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
                        onClick={() => { setInput(`Explain: ${f.title}`); setActive(topic.id as TopicId); void solve(`Explain: ${f.title}`); }}
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Parabola', expr: 'y = x^2' },
                  { label: 'Sine', expr: 'y = sin(x)' },
                  { label: 'Circle', expr: 'x^2 + y^2 = 25' },
                  { label: 'Vertical line', expr: 'x = 2' },
                ].map(preset => (
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

            <div ref={graphRef} style={{ width: '100%', height: 420, borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden' }} />
            {graphError && <div style={{ fontSize: 12, color: '#ef4444' }}>⚠ {graphError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {graphExprs.map((ge, _i) => (
                <div key={ge.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
              ))}
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
      </div>
    </div>
  );
}

// Evaluate graph expression numerically (used for axis labels)
function _evalAt(expr: string, x: number): string {
  try {
    const r = math.evaluate(expr, { x });
    return typeof r === 'number' ? Number(r.toFixed(4)).toString() : String(r);
  } catch { return '—'; }
}
void _evalAt; // suppress unused warning

export default MathSolverPage;
