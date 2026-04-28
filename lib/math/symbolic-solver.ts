import * as math from 'mathjs';
import nerdamer from 'nerdamer';
import 'nerdamer/Algebra.js';
import 'nerdamer/Calculus.js';
import 'nerdamer/Solve.js';
import { formatMathExpression } from './latex';
import type { MathCategoryId, SolverResult } from './types';

const MULTIPLY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/×/g, '*'],
  [/÷/g, '/'],
  [/−/g, '-'],
  [/π/gi, 'pi'],
  [/√/g, 'sqrt'],
  [/∞/g, 'inf'],
];

function escapeLatex(value: string) {
  return value
    .replace(/\\/g, '\\backslash ')
    .replace(/_/g, '\\_')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#');
}

export function normalizeMathInput(input: string) {
  let normalized = input.trim();
  for (const [pattern, replacement] of MULTIPLY_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/\s+/g, ' ')
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/([a-zA-Z)])(\d)/g, '$1*$2')
    .replace(/\)\(/g, ')*(')
    .replace(/\bpi\b/gi, 'pi')
    .replace(/\be\^x\b/gi, 'exp(x)')
    .replace(/\be\^\(([^)]+)\)/gi, 'exp($1)')
    .replace(/\bderivative of\b/gi, 'derivative of ')
    .replace(/\bdifferentiation of\b/gi, 'derivative of ')
    .replace(/\bdifferentiate\b/gi, 'derivative of ')
    .replace(/\bintegral of\b/gi, 'integral of ')
    .replace(/\s*=\s*/g, ' = ')
    .replace(/^lim\s+/i, 'limit ')
    .trim();

  return normalized;
}

function stripLeadingKeyword(input: string, keyword: string) {
  return input.replace(new RegExp(`^${keyword}\\s+`, 'i'), '').trim();
}

function nerdamerLatex(expr: string) {
  try {
    return nerdamer.convertToLaTeX(expr);
  } catch {
    return null;
  }
}

function expressionToLatex(expr: string) {
  // Plain decimals must NOT round-trip through nerdamer — it converts
  // them to ugly rational fractions ("1.530734" → "765367/500000",
  // "67.5" → "135/2"). Numeric answers are already formatted by
  // formatNumber upstream; just emit them as-is.
  if (/^-?\d+(?:\.\d+)?$/.test(expr.trim())) return expr.trim();
  const nerd = nerdamerLatex(expr);
  if (nerd) return nerd;

  try {
    return math.parse(expr).toTex({ parenthesis: 'auto', implicit: 'show' });
  } catch {
    return escapeLatex(expr);
  }
}

function matrixToLatex(matrixValue: number[][]) {
  const rows = matrixValue.map((row) => row.map((cell) => formatNumber(cell)).join(' & ')).join(' \\\\ ');
  return `\\begin{bmatrix}${rows}\\end{bmatrix}`;
}

function vectorToLatex(vector: number[]) {
  return `\\begin{bmatrix}${vector.map((cell) => formatNumber(cell)).join(' \\\\ ')}\\end{bmatrix}`;
}

function matrixShape(matrixValue: number[][]) {
  return `${matrixValue.length}×${matrixValue[0]?.length ?? 0}`;
}

function matrixToAnswerString(matrixValue: number[][]) {
  return matrixValue.map((row) => `[${row.map((v) => formatNumber(v)).join(', ')}]`).join(' | ');
}

function formatNumber(value: number) {
  // NaN must be handled BEFORE the Infinity check, otherwise it falls
  // through to `value > 0 ? '∞' : '-∞'` (NaN > 0 is false) and the user
  // sees "-∞" for an undefined result like 0/0. That was the long-
  // standing reason 0/0 problems looked solved with a confident-looking
  // negative-infinity answer.
  if (Number.isNaN(value)) return 'undefined';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(6)).toString();
}

function isNearlyZero(value: number, tolerance = 1e-9) {
  return Math.abs(value) < tolerance;
}

function resultToLatex(result: string | number | number[] | number[][]) {
  if (typeof result === 'number') return expressionToLatex(formatNumber(result));
  if (Array.isArray(result) && Array.isArray(result[0])) return matrixToLatex(result as number[][]);
  if (Array.isArray(result)) return vectorToLatex(result as number[]);
  return expressionToLatex(result);
}

function parseVector(text: string) {
  const parsed = text
    .replace(/[\[\]]/g, '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  return parsed.length ? parsed : null;
}

function parseMatrix(text: string) {
  try {
    const parsed = JSON.parse(text.replace(/\s+/g, ''));
    if (!Array.isArray(parsed) || !parsed.every((row) => Array.isArray(row))) return null;
    return parsed.map((row) => row.map((value) => Number(value)));
  } catch {
    return null;
  }
}

function parseScalar(text: string) {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : null;
}

function extractQuadraticCoefficients(expression: string) {
  try {
    const c = Number(math.evaluate(expression, { x: 0 }));
    const f1 = Number(math.evaluate(expression, { x: 1 }));
    const fNeg1 = Number(math.evaluate(expression, { x: -1 }));
    if (![c, f1, fNeg1].every(Number.isFinite)) return null;
    const a = (f1 + fNeg1 - (2 * c)) / 2;
    const b = f1 - a - c;
    if (isNearlyZero(a)) return null;
    return { a, b, c };
  } catch {
    return null;
  }
}

function extractLinearCoefficients(expression: string) {
  try {
    const intercept = Number(math.evaluate(expression, { x: 0 }));
    const atOne = Number(math.evaluate(expression, { x: 1 }));
    if (![intercept, atOne].every(Number.isFinite)) return null;
    const coefficient = atOne - intercept;
    return { coefficient, intercept };
  } catch {
    return null;
  }
}

function exactTrigAnswer(compactInput: string) {
  const exactValues: Record<string, { answer: string; latex: string; explanation: string }> = {
    'sin(pi/6)': { answer: '1/2', latex: '\\frac{1}{2}', explanation: 'Using the unit circle, \\(\\sin(\\pi/6)\\) is the y-coordinate of the 30° point.' },
    'sin(pi/4)': { answer: 'sqrt(2)/2', latex: '\\frac{\\sqrt{2}}{2}', explanation: 'At 45°, sine and cosine are both \\(\\sqrt{2}/2\\) on the unit circle.' },
    'sin(pi/3)': { answer: 'sqrt(3)/2', latex: '\\frac{\\sqrt{3}}{2}', explanation: 'At 60°, sine is \\(\\sqrt{3}/2\\) from the 30-60-90 triangle.' },
    'cos(pi/6)': { answer: 'sqrt(3)/2', latex: '\\frac{\\sqrt{3}}{2}', explanation: 'At 30°, cosine is the x-coordinate on the unit circle.' },
    'cos(pi/4)': { answer: 'sqrt(2)/2', latex: '\\frac{\\sqrt{2}}{2}', explanation: 'At 45°, cosine matches sine and equals \\(\\sqrt{2}/2\\).' },
    'cos(pi/3)': { answer: '1/2', latex: '\\frac{1}{2}', explanation: 'At 60°, cosine is \\(1/2\\) from the unit circle.' },
    'tan(pi/6)': { answer: 'sqrt(3)/3', latex: '\\frac{\\sqrt{3}}{3}', explanation: 'Tangent at 30° is \\(\\sin(\\pi/6)/\\cos(\\pi/6)\\).' },
    'tan(pi/4)': { answer: '1', latex: '1', explanation: 'At 45°, sine and cosine are equal, so tangent is 1.' },
    'tan(pi/3)': { answer: 'sqrt(3)', latex: '\\sqrt{3}', explanation: 'At 60°, tangent is \\(\\sqrt{3}\\) from the 30-60-90 triangle.' },
  };
  return exactValues[compactInput] ?? null;
}

function deriveGraphExpression(normalizedInput: string, category: MathCategoryId) {
  if (
    category === 'statistics' ||
    category === 'vectors' ||
    category === 'matrices' ||
    category === 'linear-algebra' ||
    category === 'discrete' ||
    category === 'physics' ||
    category === 'sequences-series' ||
    category === 'differential-equations'
  ) {
    return undefined;
  }

  const lower = normalizedInput.trim().toLowerCase();
  if (
    /^(solve|find|evaluate|calculate|determine|simplify|factor|expand|complete(?:ing)? the square|integral|integrate|derivative|differentiate|limit|prove|show)\b/.test(lower) ||
    /\barea\b|\bvolume\b|\bhypotenuse\b|\bmidpoint\b|\bdistance\b/.test(lower)
  ) {
    return undefined;
  }

  const explicitGraph = normalizedInput.match(/^\s*([xy])\s*=\s*(.+)$/i);
  if (explicitGraph) {
    return `${explicitGraph[1]} = ${explicitGraph[2].trim()}`;
  }

  if (normalizedInput.includes('=')) {
    const [lhs, rhs] = normalizedInput.split('=').map((part) => part.trim());
    if (lhs && rhs && /x/.test(`${lhs}${rhs}`) && !/\b[a-z]+\s*=/.test(normalizedInput)) {
      return `(${lhs}) - (${rhs})`;
    }
    return undefined;
  }

  const candidate = normalizedInput
    .replace(/^derivative of\s+/i, '')
    .replace(/^integral\s+from\s+.+?\s+to\s+.+?\s+of\s+/i, '')
    .replace(/^integral of\s+/i, '')
    .replace(/^limit\s+[^ ]+\s+of\s+/i, '')
    .replace(/\s+dx$/i, '')
    .trim();

  return /x/.test(candidate) && !/[?]/.test(candidate) ? candidate : undefined;
}

function categoryFromProblem(normalizedInput: string): MathCategoryId {
  const lower = normalizedInput.toLowerCase();
  // Differential equations
  if (/y''|y'|dy\/dx|d\^2y|ode|differential/.test(lower)) return 'differential-equations';
  // Discrete math
  if (/\bgcd\(|\blcm\(|\bfibonacci\(|\bfib\(|combinations?\(|permutations?\(|ncr\(|npr\(|\bmod\b/.test(lower)) return 'discrete';
  // Physics
  if (/\bohm\b|kinetic.energy|\bke\b|projectile|\bwave\b|wave\s*speed|wavelength|\bf\s*=\s*m\s*a\b|\bforce\b|potential.energy|\bpe\b|newton/.test(lower)) return 'physics';
  if (/dot product|magnitude|angle between|unit vector|normalize|^dot\(|^cross\(|^norm\(|\[[^\]]+\]\s*(?:\+|\-)?\s*\[[^\]]+\]/i.test(normalizedInput)) return 'vectors';
  if (/\[\[[^\]]+\]\]/.test(normalizedInput) || /\bdet\(|\binv\(|\btranspose\(/.test(lower)) return 'matrices';
  if (/mean\(|median\(|variance\(|std\(/.test(lower)) return 'statistics';
  if (/hypotenuse|distance\s*\(|distance between|midpoint of|line through|equation of circle|area circle|circumference circle|area triangle|area rectangle|volume of sphere|pythagorean/.test(lower)) return 'geometry';
  if (/derivative|integral|limit|d\/dx|\bint\b|\blim\b|differentiat|\bdiff\b/.test(lower)) return 'calculus';
  if (/\bsin\(|\bcos\(|\btan\(|\bcot\(|\bsec\(|\bcsc\(/.test(lower)) return 'trigonometry';
  if (/arithmetic (?:nth|sum)|geometric (?:nth|sum)|sequence|series/.test(lower)) return 'sequences-series';
  if (/matrix|determinant|inverse/.test(lower)) return 'linear-algebra';
  return 'algebra';
}

export function detectMathCategory(problem: string, requested?: string | null): MathCategoryId {
  const candidate = (requested || '').toLowerCase().trim();
  if (
    candidate === 'algebra' ||
    candidate === 'geometry' ||
    candidate === 'calculus' ||
    candidate === 'trigonometry' ||
    candidate === 'sequences-series' ||
    candidate === 'linear-algebra' ||
    candidate === 'statistics' ||
    candidate === 'vectors' ||
    candidate === 'matrices' ||
    candidate === 'differential-equations' ||
    candidate === 'discrete' ||
    candidate === 'physics'
  ) {
    return candidate;
  }
  return categoryFromProblem(normalizeMathInput(problem));
}

function baseResult(category: MathCategoryId, normalizedInput: string, engine: SolverResult['engine']): SolverResult {
  return {
    category,
    normalizedInput,
    previewLatex: formatMathExpression(normalizedInput),
    answer: '',
    answerLatex: '',
    steps: [],
    explanation: '',
    graphExpr: deriveGraphExpression(normalizedInput, category),
    verified: true,
    engine,
  };
}

function solveEquation(normalizedInput: string, category: MathCategoryId): SolverResult {
  const result = baseResult(category, normalizedInput, 'hybrid');
  const equation = stripLeadingKeyword(normalizedInput, 'solve');
  const [lhs, rhs] = equation.split('=').map((part) => part.trim());
  if (!lhs || !rhs) {
    return { ...result, verified: false, error: 'Equation is incomplete.' };
  }

  const canonical = `${lhs} = ${rhs}`;
  result.steps.push({
    step: 1,
    description: 'Write the equation in standard form',
    expression: `${expressionToLatex(lhs)} = ${expressionToLatex(rhs)}`,
    explanation: 'Start with the original equation and identify the variable to solve for.',
  });

  try {
    const solutions = nerdamer(`${lhs}=(${rhs})`).solveFor('x').toString();
    const cleaned = solutions.replace(/[\[\]]/g, '').split(',').map((item) => item.trim()).filter(Boolean);
    if (!cleaned.length) throw new Error('No symbolic solution returned');

    const rearranged = `(${lhs}) - (${rhs})`;
    result.steps.push({
      step: 2,
      description: 'Rearrange everything onto one side',
      expression: `${expressionToLatex(rearranged)} = 0`,
      explanation: 'Move the right-hand side to the left so we can solve the equation consistently.',
    });

    result.steps.push({
      step: 3,
      description: 'Solve for x',
      expression: cleaned.map((value) => `x = ${expressionToLatex(value)}`).join(', \quad '),
      explanation: 'Use symbolic solving to isolate x and check the exact solution set.',
    });

    result.answer = cleaned.map((value) => `x = ${value}`).join(', ');
    result.answerLatex = cleaned.map((value) => `x = ${expressionToLatex(value)}`).join(', \quad ');
    result.explanation = `Solved ${canonical} exactly and isolated x.`;

    // Fix 3b: Add log notation note when log() is used without explicit base
    if (/\blog\s*\(/.test(normalizedInput) && !/log10|log_10|\bln\b/.test(normalizedInput)) {
      result.steps.push({
        step: result.steps.length + 1,
        description: 'Note on log notation',
        expression: '\\log(x) \\equiv \\ln(x)',
        explanation: 'In this solver, log() means the natural logarithm (base e). For base-10 logarithm, use log10(x).',
      });
    }

    return result;
  } catch (error) {
    result.verified = false;
    result.error = error instanceof Error ? error.message : 'Could not solve equation';
    result.steps.push({
      step: 2,
      description: 'Fallback to numeric reasoning',
      expression: expressionToLatex(equation),
      explanation: 'The symbolic solver could not finish this equation cleanly. Try a more explicit format or move it into MATLAB Flow.',
    });
    result.answer = 'Unable to solve';
    result.answerLatex = '\\text{Unable to solve}';
    result.explanation = 'The solver could not isolate the variable with confidence.';
    return result;
  }
}

function solveSystem(normalizedInput: string): SolverResult {
  const result = baseResult('algebra', normalizedInput, 'nerdamer');
  const rawSystem = normalizedInput.replace(/^solve\s+system\s+/i, '').replace(/^system\s+/i, '').trim();
  const equations = rawSystem
    .split(/[;\n]+/)
    .map((equation) => equation.trim())
    .filter(Boolean);

  if (equations.length < 2) {
    return {
      ...result,
      verified: false,
      answer: 'Provide at least two equations',
      answerLatex: '\\text{Provide at least two equations}',
      explanation: 'Use a format like: system x + y = 3; x - y = 1',
    };
  }

  const variables = Array.from(new Set((rawSystem.match(/[a-zA-Z]/g) || []).filter((symbol) => ['x', 'y', 'z'].includes(symbol.toLowerCase()))));
  result.steps.push({
    step: 1,
    description: 'Write the simultaneous equations',
    expression: `\\left\\{\\begin{aligned}${equations.map((equation) => equation.split('=').map((side) => expressionToLatex(side.trim())).join(' &= ')).join(' \\\\ ')}\\end{aligned}\\right.`,
    explanation: 'Start by listing all equations in the system clearly.',
  });

  try {
    const solved = (nerdamer as unknown as { solveEquations?: (items: string[]) => Array<[string, string | number]> }).solveEquations?.(equations) ?? [];
    const solutionPairs = Array.isArray(solved) ? solved : [];
    if (!solutionPairs.length) throw new Error('No solution returned');

    result.steps.push({
      step: 2,
      description: 'Solve the system simultaneously',
      expression: solutionPairs
        .map(([variable, value]) => `${expressionToLatex(String(variable))} = ${expressionToLatex(String(value))}`)
        .join(', \\quad '),
      explanation: variables.length > 1
        ? 'Use elimination or substitution to isolate each variable consistently across the system.'
        : 'Solve for the remaining variable directly.',
    });

    result.answer = solutionPairs.map(([variable, value]) => `${variable} = ${value}`).join(', ');
    result.answerLatex = solutionPairs
      .map(([variable, value]) => `${expressionToLatex(String(variable))} = ${expressionToLatex(String(value))}`)
      .join(', \\quad ');
    result.explanation = 'Solved the simultaneous equations together so the variable values satisfy every equation in the system.';
    return result;
  } catch (error) {
    return {
      ...result,
      verified: false,
      error: error instanceof Error ? error.message : 'Unable to solve system',
      answer: 'Unable to solve system',
      answerLatex: '\\text{Unable to solve system}',
      explanation: 'Try separating each equation with a semicolon, for example: system x + y = 3; x - y = 1',
    };
  }
}

function solveQuadraticEquation(normalizedInput: string, category: MathCategoryId): SolverResult {
  const result = baseResult(category, normalizedInput, 'hybrid');
  const [lhs, rhs] = normalizedInput.split('=').map((part) => part.trim());
  if (!lhs || !rhs) {
    return { ...result, verified: false, answer: 'Equation is incomplete', answerLatex: '\\text{Equation is incomplete}', explanation: 'Provide a full quadratic equation like x^2 - 5x + 6 = 0.' };
  }

  const standardExpression = `(${lhs}) - (${rhs})`;
  const coefficients = extractQuadraticCoefficients(standardExpression);
  if (!coefficients) {
    return solveEquation(normalizedInput, category);
  }

  const { a, b, c } = coefficients;
  const discriminant = (b ** 2) - (4 * a * c);
  const symbolicSolutions = nerdamer(`${lhs}=(${rhs})`).solveFor('x').toString();
  const cleaned = symbolicSolutions.replace(/[\[\]]/g, '').split(',').map((item) => item.trim()).filter(Boolean);

  result.steps.push({
    step: 1,
    description: 'Rewrite in standard quadratic form',
    expression: `${expressionToLatex(standardExpression)} = 0`,
    explanation: 'A quadratic equation is easiest to solve in the form ax^2 + bx + c = 0.',
  });
  result.steps.push({
    step: 2,
    description: 'Identify the coefficients',
    expression: `a = ${expressionToLatex(formatNumber(a))},\\; b = ${expressionToLatex(formatNumber(b))},\\; c = ${expressionToLatex(formatNumber(c))}`,
    explanation: 'Read the coefficients directly from the standard form.',
  });
  result.steps.push({
    step: 3,
    description: 'Compute the discriminant',
    expression: `\\Delta = b^2 - 4ac = (${expressionToLatex(formatNumber(b))})^2 - 4(${expressionToLatex(formatNumber(a))})(${expressionToLatex(formatNumber(c))}) = ${expressionToLatex(formatNumber(discriminant))}`,
    explanation: 'The discriminant tells us how many real roots the quadratic has.',
  });

  if (cleaned.length) {
    result.steps.push({
      step: 4,
      description: 'Apply the quadratic formula',
      expression: cleaned.map((value) => `x = ${expressionToLatex(value)}`).join(', \\quad '),
      explanation: discriminant > 0
        ? 'Because the discriminant is positive, the equation has two real roots.'
        : discriminant === 0
          ? 'Because the discriminant is zero, the quadratic has one repeated root.'
          : 'Because the discriminant is negative, the roots are complex.',
    });
    result.answer = cleaned.map((value) => `x = ${value}`).join(', ');
    result.answerLatex = cleaned.map((value) => `x = ${expressionToLatex(value)}`).join(', \\quad ');
    result.explanation = 'Solved the quadratic with coefficient matching and the discriminant, then confirmed the exact roots symbolically.';
    return result;
  }

  return solveEquation(normalizedInput, category);
}

function solveCubicEquation(problem: string): SolverResult | null {
  // Matches: ax^3 + bx^2 + cx + d = 0
  const match = problem.match(
    /^([+-]?\s*\d*\.?\d*)\s*[x*]\^?\s*3\s*([+-]\s*\d*\.?\d*)\s*[x*]\^?\s*2\s*([+-]\s*\d*\.?\d*)\s*[x*]\s*([+-]\s*\d*\.?\d*)\s*=\s*0$/i,
  );
  if (!match) return null;

  const a = parseFloat(match[1].replace(/\s/g, '') || '1') || 1;
  const b = parseFloat(match[2].replace(/\s/g, '') || '0') || 0;
  const c = parseFloat(match[3].replace(/\s/g, '') || '0') || 0;
  const d = parseFloat(match[4].replace(/\s/g, '') || '0') || 0;

  // Use mathjs polynomial root finding
  try {
    // Depress: t = x - b/(3a)
    const p = (3 * a * c - b * b) / (3 * a * a);
    const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);
    const disc = -(4 * p * p * p + 27 * q * q);
    const shift = -b / (3 * a);

    const roots: number[] = [];

    if (Math.abs(disc) < 1e-10) {
      // Repeated roots
      const u = Math.cbrt(-q / 2);
      roots.push(2 * u + shift, -u + shift);
    } else if (disc > 0) {
      // 3 real roots via trigonometric method
      const m = 2 * Math.sqrt(-p / 3);
      for (let k = 0; k < 3; k++) {
        const t = m * Math.cos((1 / 3) * Math.acos((3 * q) / (p * m)) - (2 * Math.PI * k) / 3);
        roots.push(t + shift);
      }
    } else {
      // 1 real root via Cardano
      const sqrt_disc = Math.sqrt(-disc / 108);
      const u = Math.cbrt(-q / 2 + sqrt_disc);
      const v = Math.cbrt(-q / 2 - sqrt_disc);
      roots.push(u + v + shift);
    }

    const realRoots = roots
      .filter((r, i, arr) => arr.findIndex(x => Math.abs(x - r) < 1e-9) === i)
      .sort((a, b) => a - b)
      .map(r => Number(r.toFixed(6)));

    const rootStr = realRoots.map(r => `x = ${r}`).join(', ');

    return {
      category: 'algebra',
      normalizedInput: problem,
      previewLatex: problem,
      answer: rootStr,
      answerLatex: realRoots.map(r => `x = ${r}`).join(',\\;'),
      steps: [
        { step: 1, description: 'Identify coefficients', expression: `a=${a}, b=${b}, c=${c}, d=${d}`, explanation: 'Cubic: ax³ + bx² + cx + d = 0' },
        { step: 2, description: 'Depress to t³ + pt + q = 0', expression: `p = ${p.toFixed(4)}, q = ${q.toFixed(4)}`, explanation: 'Substitute x = t - b/(3a) to remove quadratic term' },
        { step: 3, description: 'Discriminant Δ = −(4p³ + 27q²)', expression: `Δ = ${disc.toFixed(4)}`, explanation: disc > 0 ? 'Δ > 0: three distinct real roots — use trigonometric method' : disc < 0 ? 'Δ < 0: one real root, two complex — use Cardano' : 'Δ = 0: repeated roots' },
        { step: 4, description: 'Real roots', expression: rootStr, explanation: 'Shift back: x = t + b/(3a)' },
      ],
      explanation: `Cubic equation solved. Real roots: ${rootStr}`,
      graphExpr: `${a}*x^3 + ${b}*x^2 + ${c}*x + ${d}`,
      verified: true,
      engine: 'mathjs',
      error: undefined,
    };
  } catch {
    return null;
  }
}

function solveQuarticEquation(problem: string): SolverResult | null {
  // Matches: ax^4 + bx^3 + cx^2 + dx + e = 0 (coefficients may be 0)
  // Use companion matrix eigenvalue approach via numerical iteration
  const match = problem.match(
    /^([+-]?\s*\d*\.?\d*)\s*[x*]\^?\s*4\s*([+-]\s*\d*\.?\d*)\s*[x*]\^?\s*3\s*([+-]\s*\d*\.?\d*)\s*[x*]\^?\s*2\s*([+-]\s*\d*\.?\d*)\s*[x*]\s*([+-]\s*\d*\.?\d*)\s*=\s*0$/i,
  );
  if (!match) return null;

  const a = parseFloat(match[1].replace(/\s/g, '') || '1') || 1;
  const b = parseFloat(match[2].replace(/\s/g, '') || '0') || 0;
  const c = parseFloat(match[3].replace(/\s/g, '') || '0') || 0;
  const d = parseFloat(match[4].replace(/\s/g, '') || '0') || 0;
  const e = parseFloat(match[5].replace(/\s/g, '') || '0') || 0;

  // Normalize: divide by a
  const B = b / a, C = c / a, D = d / a, E = e / a;

  try {
    // Use numerical Newton's method to find roots
    function polyVal(x: number): number {
      return x * x * x * x + B * x * x * x + C * x * x + D * x + E;
    }
    function polyDeriv(x: number): number {
      return 4 * x * x * x + 3 * B * x * x + 2 * C * x + D;
    }

    // Newton's method from multiple starting points
    const candidates = [-3, -1, 0, 1, 3, -B / 4];
    const roots: number[] = [];

    for (const start of candidates) {
      let x = start;
      for (let iter = 0; iter < 80; iter++) {
        const f = polyVal(x);
        const fp = polyDeriv(x);
        if (Math.abs(fp) < 1e-14) break;
        const dx = -f / fp;
        x += dx;
        if (Math.abs(dx) < 1e-11) break;
      }
      if (Math.abs(polyVal(x)) < 1e-6) {
        const rounded = Number(x.toFixed(6));
        if (!roots.some(r => Math.abs(r - rounded) < 1e-5)) {
          roots.push(rounded);
        }
      }
    }

    if (roots.length === 0) return null;
    roots.sort((a, b) => a - b);
    const rootStr = roots.map(r => `x = ${r}`).join(', ');

    return {
      category: 'algebra',
      normalizedInput: problem,
      previewLatex: problem,
      answer: rootStr,
      answerLatex: roots.map(r => `x = ${r}`).join(',\\;'),
      steps: [
        { step: 1, description: 'Identify coefficients', expression: `a=${a}, b=${b}, c=${c}, d=${d}, e=${e}`, explanation: 'Quartic: ax⁴ + bx³ + cx² + dx + e = 0' },
        { step: 2, description: 'Normalise by leading coefficient', expression: `x⁴ + ${B.toFixed(3)}x³ + ${C.toFixed(3)}x² + ${D.toFixed(3)}x + ${E.toFixed(3)} = 0`, explanation: 'Divide every term by a' },
        { step: 3, description: 'Apply Newton\'s method from multiple starting points', expression: `${roots.length} real root${roots.length !== 1 ? 's' : ''} found`, explanation: 'Iterative root-finding converges to each real root' },
        { step: 4, description: 'Real roots', expression: rootStr, explanation: 'Verified by back-substitution' },
      ],
      explanation: `Quartic equation solved. Real roots: ${rootStr}`,
      graphExpr: `${a}*x^4 + ${b}*x^3 + ${c}*x^2 + ${d}*x + ${e}`,
      verified: true,
      engine: 'mathjs',
      error: undefined,
    };
  } catch {
    return null;
  }
}

function flipInequality(sign: string) {
  if (sign === '<') return '>';
  if (sign === '>') return '<';
  if (sign === '<=') return '>=';
  if (sign === '>=') return '<=';
  return sign;
}

function solveInequality(normalizedInput: string): SolverResult {
  const result = baseResult('algebra', normalizedInput, 'hybrid');
  const match = normalizedInput.match(/^(.+?)\s*(<=|>=|<|>)\s*(.+)$/);
  if (!match) {
    return {
      ...result,
      verified: false,
      answer: 'Unable to parse inequality',
      answerLatex: '\\text{Unable to parse inequality}',
      explanation: 'Use a format like 2x + 5 <= 11.',
    };
  }

  const [, lhs, sign, rhs] = match;
  const standardExpression = `(${lhs.trim()}) - (${rhs.trim()})`;
  const coefficients = extractLinearCoefficients(standardExpression);
  if (!coefficients || isNearlyZero(coefficients.coefficient)) {
    return {
      ...result,
      verified: false,
      answer: 'Inequality not supported yet',
      answerLatex: '\\text{Inequality not supported yet}',
      explanation: 'Right now Kivora handles linear one-variable inequalities like 2x + 5 <= 11.',
    };
  }

  const { coefficient, intercept } = coefficients;
  const boundary = -intercept / coefficient;
  const finalSign = coefficient < 0 ? flipInequality(sign) : sign;

  result.steps.push({
    step: 1,
    description: 'Move everything to one side',
    expression: `${expressionToLatex(standardExpression)} ${sign} 0`,
    explanation: 'Put the inequality in a standard form so the x-term is easier to isolate.',
  });
  result.steps.push({
    step: 2,
    description: 'Identify the x coefficient and constant term',
    expression: `${expressionToLatex(formatNumber(coefficient))}x + ${expressionToLatex(formatNumber(intercept))} ${sign} 0`,
    explanation: 'This is a linear inequality, so we isolate x by undoing the constant and the coefficient.',
  });

  if (coefficient < 0) {
    result.steps.push({
      step: 3,
      description: 'Divide by a negative number and reverse the sign',
      expression: `x ${finalSign} ${expressionToLatex(formatNumber(boundary))}`,
      explanation: 'Dividing an inequality by a negative number reverses the direction of the inequality sign.',
    });
  } else {
    result.steps.push({
      step: 3,
      description: 'Divide by the positive coefficient',
      expression: `x ${finalSign} ${expressionToLatex(formatNumber(boundary))}`,
      explanation: 'Because the coefficient is positive, the inequality direction stays the same.',
    });
  }

  result.answer = `x ${finalSign} ${formatNumber(boundary)}`;
  result.answerLatex = `x ${finalSign.replace('<=', '\\leq').replace('>=', '\\geq')} ${expressionToLatex(formatNumber(boundary))}`;
  result.explanation = 'Solved the linear inequality by isolating x and preserving or reversing the inequality sign as needed.';
  return result;
}

function solveGeometryProblem(normalizedInput: string): SolverResult {
  const result = baseResult('geometry', normalizedInput, 'mathjs');
  const lower = normalizedInput.toLowerCase();

  const lineFromPoints = (x1: number, y1: number, x2: number, y2: number) => {
    if (isNearlyZero(x2 - x1)) return `x = ${formatNumber(x1)}`;
    const m = (y2 - y1) / (x2 - x1);
    const b = y1 - (m * x1);
    return `y = ${formatNumber(m)} * x ${b < 0 ? '-' : '+'} ${formatNumber(Math.abs(b))}`;
  };

  const hypotenuse = lower.match(/^hypotenuse\s+(.+?)\s+(.+)$/);
  if (hypotenuse) {
    const a = Number(math.evaluate(hypotenuse[1]));
    const b = Number(math.evaluate(hypotenuse[2]));
    const c = Math.sqrt((a ** 2) + (b ** 2));
    result.steps.push({
      step: 1,
      description: 'Use the Pythagorean theorem',
      expression: `c^2 = ${expressionToLatex(formatNumber(a))}^2 + ${expressionToLatex(formatNumber(b))}^2`,
      explanation: 'For a right triangle, the square of the hypotenuse equals the sum of the squares of the legs.',
    });
    result.steps.push({
      step: 2,
      description: 'Take the square root',
      expression: `c = \\sqrt{${expressionToLatex(formatNumber(a ** 2))} + ${expressionToLatex(formatNumber(b ** 2))}} = ${expressionToLatex(formatNumber(c))}`,
      explanation: 'Compute the length of the hypotenuse from the two perpendicular sides.',
    });
    result.answer = formatNumber(c);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the hypotenuse using the Pythagorean theorem.';
    return result;
  }

  // Accept all the phrasings the panel + a typing user might produce:
  //   "distance (3,2) (2,4)", "distance between (3,2) and (2,4)",
  //   "distance from (3,2) to (2,4)", "distance (3,2) to (2,4)".
  const distance = lower.match(
    /^distance(?:\s+(?:between|from))?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*(?:and|to|,)?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/,
  );
  if (distance) {
    const x1 = Number(math.evaluate(distance[1]));
    const y1 = Number(math.evaluate(distance[2]));
    const x2 = Number(math.evaluate(distance[3]));
    const y2 = Number(math.evaluate(distance[4]));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const answer = Math.sqrt((dx ** 2) + (dy ** 2));
    result.steps.push({
      step: 1,
      description: 'Use the distance formula',
      expression: `d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}`,
      explanation: 'Distance between two points comes from the Pythagorean theorem on the horizontal and vertical changes.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the coordinates',
      expression: `d = \\sqrt{(${expressionToLatex(formatNumber(x2))}-${expressionToLatex(formatNumber(x1))})^2 + (${expressionToLatex(formatNumber(y2))}-${expressionToLatex(formatNumber(y1))})^2} = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Compute the horizontal and vertical differences and then take the square root.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.graphExpr = lineFromPoints(x1, y1, x2, y2);
    result.explanation = 'Computed the distance between the two points.';
    return result;
  }

  // Tolerate spacing inside parens and accept "between"/"to" as
  // alternatives to "and", same as the distance regex.
  const midpoint = lower.match(
    /^midpoint(?:\s+of)?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*(?:and|to|,|between)?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/,
  );
  if (midpoint) {
    const x1 = Number(math.evaluate(midpoint[1]));
    const y1 = Number(math.evaluate(midpoint[2]));
    const x2 = Number(math.evaluate(midpoint[3]));
    const y2 = Number(math.evaluate(midpoint[4]));
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    result.steps.push({
      step: 1,
      description: 'Use the midpoint formula',
      expression: 'M = \\left(\\frac{x_1+x_2}{2},\\frac{y_1+y_2}{2}\\right)',
      explanation: 'Average the x-coordinates and the y-coordinates separately.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the coordinates',
      expression: `M = \\left(\\frac{${expressionToLatex(formatNumber(x1))}+${expressionToLatex(formatNumber(x2))}}{2},\\frac{${expressionToLatex(formatNumber(y1))}+${expressionToLatex(formatNumber(y2))}}{2}\\right) = \\left(${expressionToLatex(formatNumber(midX))},${expressionToLatex(formatNumber(midY))}\\right)`,
      explanation: 'The midpoint sits halfway between the two endpoints of the segment.',
    });
    result.answer = `(${formatNumber(midX)}, ${formatNumber(midY)})`;
    result.answerLatex = `\\left(${expressionToLatex(formatNumber(midX))}, ${expressionToLatex(formatNumber(midY))}\\right)`;
    result.graphExpr = lineFromPoints(x1, y1, x2, y2);
    result.explanation = 'Computed the midpoint of the segment and prepared the line through the points for graphing.';
    return result;
  }

  const line = lower.match(
    /^line\s+(?:through|from)\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*(?:and|to|,)?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/,
  );
  if (line) {
    const x1 = Number(math.evaluate(line[1]));
    const y1 = Number(math.evaluate(line[2]));
    const x2 = Number(math.evaluate(line[3]));
    const y2 = Number(math.evaluate(line[4]));
    const graphExpr = lineFromPoints(x1, y1, x2, y2);

    result.steps.push({
      step: 1,
      description: 'Compute the slope',
      expression: isNearlyZero(x2 - x1)
        ? 'x_2 - x_1 = 0'
        : `m = \\frac{${expressionToLatex(formatNumber(y2))}-${expressionToLatex(formatNumber(y1))}}{${expressionToLatex(formatNumber(x2))}-${expressionToLatex(formatNumber(x1))}}`,
      explanation: isNearlyZero(x2 - x1)
        ? 'Because the x-values are the same, the line is vertical.'
        : 'Use rise over run to determine the slope of the line.',
    });
    result.steps.push({
      step: 2,
      description: 'Write the line equation',
      expression: expressionToLatex(graphExpr.replace(/^y\s*=\s*/i, '').replace(/^x\s*=\s*/i, (match) => match)),
      explanation: isNearlyZero(x2 - x1)
        ? 'A vertical line has the form x = constant.'
        : 'Substitute one point into point-slope form and simplify.',
    });
    result.answer = graphExpr;
    result.answerLatex = expressionToLatex(graphExpr);
    result.graphExpr = graphExpr;
    result.explanation = 'Built the line equation through the two points and sent it to the graph plotter.';
    return result;
  }

  // Accept "area circle radius 5", "area of a circle with radius 5",
  // "find area of circle radius=5", "circle area radius 5", etc.
  const areaCircle = lower.match(
    /(?:area|find\s+(?:the\s+)?area)(?:\s+of)?\s+(?:a\s+|the\s+)?circle(?:\s+(?:with|having))?\s+(?:radius|r)\s*=?\s*(.+?)\s*$/,
  ) ?? lower.match(/circle\s+area(?:\s+(?:with|having))?\s+(?:radius|r)\s*=?\s*(.+?)\s*$/);
  if (areaCircle) {
    const r = Number(math.evaluate(areaCircle[1]));
    if (!Number.isFinite(r) || r <= 0) {
      return {
        ...result,
        verified: false,
        answer: 'Invalid radius',
        answerLatex: '\\text{Invalid radius}',
        explanation: 'Radius must be a positive number. Example: area of circle radius 5.',
      };
    }
    const answer = Math.PI * r * r;
    result.steps.push({
      step: 1,
      description: 'Use the area formula for a circle',
      expression: `A = \\pi r^2`,
      explanation: 'Circle area depends on pi times the square of the radius.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the radius',
      expression: `A = \\pi (${expressionToLatex(formatNumber(r))})^2 = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Square the radius and multiply by pi.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the circle area from its radius.';
    return result;
  }

  const circumference = lower.match(
    /(?:circumference|perimeter|find\s+(?:the\s+)?(?:circumference|perimeter))(?:\s+of)?\s+(?:a\s+|the\s+)?circle(?:\s+(?:with|having))?\s+(?:radius|r)\s*=?\s*(.+?)\s*$/,
  ) ?? lower.match(/circle\s+circumference(?:\s+(?:with|having))?\s+(?:radius|r)\s*=?\s*(.+?)\s*$/);
  if (circumference) {
    const r = Number(math.evaluate(circumference[1]));
    if (!Number.isFinite(r) || r <= 0) {
      return {
        ...result,
        verified: false,
        answer: 'Invalid radius',
        answerLatex: '\\text{Invalid radius}',
        explanation: 'Radius must be a positive number. Example: circumference of circle radius 5.',
      };
    }
    const answer = 2 * Math.PI * r;
    result.steps.push({
      step: 1,
      description: 'Use the circumference formula',
      expression: `C = 2\\pi r`,
      explanation: 'Circle circumference is the distance around the circle.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the radius',
      expression: `C = 2\\pi (${expressionToLatex(formatNumber(r))}) = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Multiply the radius by 2π.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the circumference from the radius.';
    return result;
  }

  // Match a much wider range of natural phrasings the user might type:
  //   "area triangle base 5 height 6", "area of triangle base 5 height 6",
  //   "area of a triangle with base 5 and height 6",
  //   "find the area of a triangle whose base is 5 and height is 6"
  // The previous strict regex only caught the first form. Any other
  // phrasing fell through to the general expression solver, which
  // returned the entire sentence as the "answer" — exactly the bug the
  // user reported.
  const triangleArea = lower.match(
    /(?:area|find\s+(?:the\s+)?area)(?:\s+of)?\s+(?:a\s+|the\s+)?triangle(?:\s+(?:with|whose|having|where))?\s+(?:base\s+(?:is\s+|=\s*)?|b\s*=\s*)(.+?)\s+(?:and\s+)?(?:height\s+(?:is\s+|=\s*)?|h\s*=\s*)(.+?)\s*$/,
  );
  if (triangleArea) {
    const base = Number(math.evaluate(triangleArea[1]));
    const height = Number(math.evaluate(triangleArea[2]));
    if (!Number.isFinite(base) || !Number.isFinite(height) || base <= 0 || height <= 0) {
      return {
        ...result,
        verified: false,
        answer: 'Invalid base or height',
        answerLatex: '\\text{Invalid base or height}',
        explanation: 'Both the base and the height must be positive numbers. Example: area of triangle base 5 height 6.',
      };
    }
    const answer = 0.5 * base * height;
    result.steps.push({
      step: 1,
      description: 'Use the triangle area formula',
      expression: `A = \\frac{1}{2}bh`,
      explanation: 'Triangle area is half the product of the base and vertical height.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute base and height',
      expression: `A = \\frac{1}{2}(${expressionToLatex(formatNumber(base))})(${expressionToLatex(formatNumber(height))}) = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Multiply the base and height, then divide by two.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the triangle area from the base and height.';
    return result;
  }

  // Same widening for Heron's formula — accept "area of triangle with
  // sides 3, 4, 5", "triangle area sides 3 4 5", "find area of triangle
  // sides 3, 4, 5", commas optional.
  const triangleSides = lower.match(
    /(?:area|find\s+(?:the\s+)?area)(?:\s+of)?\s+(?:a\s+|the\s+)?triangle(?:\s+(?:with|having))?\s+sides?\s+(.+?)\s*[,\s]\s*(.+?)\s*[,\s]\s*(.+?)\s*$/,
  );
  if (triangleSides) {
    const a = Number(math.evaluate(triangleSides[1]));
    const b = Number(math.evaluate(triangleSides[2]));
    const c = Number(math.evaluate(triangleSides[3]));
    if (![a, b, c].every((v) => Number.isFinite(v) && v > 0)) {
      return {
        ...result,
        verified: false,
        answer: 'Invalid triangle sides',
        answerLatex: '\\text{Invalid triangle sides}',
        explanation: 'All three sides must be positive numbers. Example: area of triangle with sides 3, 4, 5.',
      };
    }
    // Triangle inequality: each side must be less than the sum of the
    // other two. Without this check, Heron's formula returns 0 (or NaN
    // pre-clamp) for degenerate "triangles" like 1, 2, 5.
    if (a + b <= c || a + c <= b || b + c <= a) {
      return {
        ...result,
        verified: false,
        answer: 'Sides do not form a valid triangle',
        answerLatex: '\\text{Sides do not form a valid triangle}',
        explanation: 'The triangle inequality requires that any two sides sum to more than the third. Re-check the side lengths.',
      };
    }
    const s = (a + b + c) / 2;
    const answer = Math.sqrt(Math.max(s * (s - a) * (s - b) * (s - c), 0));

    result.steps.push({
      step: 1,
      description: "Use Heron's formula",
      expression: 'A = \\sqrt{s(s-a)(s-b)(s-c)},\\quad s = \\frac{a+b+c}{2}',
      explanation: 'When all three sides are known, Heron’s formula gives the area directly.',
    });
    result.steps.push({
      step: 2,
      description: 'Compute the semiperimeter',
      expression: `s = \\frac{${expressionToLatex(formatNumber(a))}+${expressionToLatex(formatNumber(b))}+${expressionToLatex(formatNumber(c))}}{2} = ${expressionToLatex(formatNumber(s))}`,
      explanation: 'Add the three sides and divide by two.',
    });
    result.steps.push({
      step: 3,
      description: 'Substitute into the area formula',
      expression: `A = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Substitute the semiperimeter and sides into Heron’s formula and simplify.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the triangle area from the three side lengths.';
    return result;
  }

  const circleEquation = lower.match(/^equation of circle:\s*center\s*\((.+?),(.+?)\)\s*,\s*radius\s+(.+)$/);
  if (circleEquation) {
    const h = Number(math.evaluate(circleEquation[1]));
    const k = Number(math.evaluate(circleEquation[2]));
    const r = Number(math.evaluate(circleEquation[3]));
    const graphExpr = `(x - (${formatNumber(h)}))^2 + (y - (${formatNumber(k)}))^2 = ${formatNumber(r ** 2)}`;

    result.steps.push({
      step: 1,
      description: 'Use the standard circle form',
      expression: '(x-h)^2 + (y-k)^2 = r^2',
      explanation: 'A circle is defined by its center and radius in standard form.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the center and radius',
      expression: expressionToLatex(graphExpr),
      explanation: 'Replace h, k, and r with the given values.',
    });
    result.answer = graphExpr;
    result.answerLatex = expressionToLatex(graphExpr);
    result.graphExpr = graphExpr;
    result.explanation = 'Built the circle equation and prepared it for the graph plotter.';
    return result;
  }

  const sphere = lower.match(/^volume of sphere with radius\s+(.+)$/);
  if (sphere) {
    const r = Number(math.evaluate(sphere[1]));
    const answer = (4 / 3) * Math.PI * (r ** 3);

    result.steps.push({
      step: 1,
      description: 'Use the sphere volume formula',
      expression: 'V = \\frac{4}{3}\\pi r^3',
      explanation: 'A sphere’s volume depends on the cube of its radius.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the radius',
      expression: `V = \\frac{4}{3}\\pi (${expressionToLatex(formatNumber(r))})^3 = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Cube the radius, then multiply by 4π/3.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the sphere volume from the radius.';
    return result;
  }

  // Rectangle area + perimeter — the panel button generates
  // "Area and perimeter of rectangle 5 3" but no handler existed for
  // it, so the user got "Unsupported geometry problem". Also accepts
  // "area of rectangle length 5 width 3" and "area rectangle 5 by 3".
  const rectangle = lower.match(
    /(?:area(?:\s+and\s+perimeter)?|find\s+(?:the\s+)?area)(?:\s+of)?\s+(?:a\s+|the\s+)?rectangle(?:\s+(?:with|having))?\s+(?:length\s+(?:is\s+|=\s*)?|l\s*=\s*)?(.+?)(?:\s+(?:by|x|×)\s+|\s+(?:and\s+)?(?:width\s+(?:is\s+|=\s*)?|w\s*=\s*)?|\s+)(.+?)\s*$/,
  );
  if (rectangle) {
    const length = Number(math.evaluate(rectangle[1]));
    const width = Number(math.evaluate(rectangle[2]));
    if (![length, width].every((v) => Number.isFinite(v) && v > 0)) {
      return {
        ...result,
        verified: false,
        answer: 'Invalid rectangle dimensions',
        answerLatex: '\\text{Invalid rectangle dimensions}',
        explanation: 'Length and width must be positive numbers. Example: area of rectangle 5 by 3.',
      };
    }
    const area = length * width;
    const perimeter = 2 * (length + width);
    result.steps.push({
      step: 1,
      description: 'Use the rectangle area and perimeter formulas',
      expression: 'A = lw,\\quad P = 2(l + w)',
      explanation: 'Area is length times width; perimeter is twice the sum.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute length and width',
      expression: `A = (${expressionToLatex(formatNumber(length))})(${expressionToLatex(formatNumber(width))}) = ${expressionToLatex(formatNumber(area))}`,
      explanation: 'Multiply the two sides to get the area.',
    });
    result.steps.push({
      step: 3,
      description: 'Compute the perimeter',
      expression: `P = 2(${expressionToLatex(formatNumber(length))} + ${expressionToLatex(formatNumber(width))}) = ${expressionToLatex(formatNumber(perimeter))}`,
      explanation: 'Add the two sides and double for the full perimeter.',
    });
    result.answer = `A = ${formatNumber(area)}, P = ${formatNumber(perimeter)}`;
    result.answerLatex = `A = ${expressionToLatex(formatNumber(area))},\\quad P = ${expressionToLatex(formatNumber(perimeter))}`;
    result.explanation = 'Computed the rectangle area and perimeter from length and width.';
    return result;
  }

  // SAS triangle — "Solve triangle: a=5, b=7, C=60°" — the panel button
  // sends this exact form. Uses the law of cosines for the third side
  // and the law of sines for the remaining angles.
  const sasTriangle = lower.match(
    /^solve\s+triangle\s*:\s*a\s*=\s*([\-\d.]+)\s*,\s*b\s*=\s*([\-\d.]+)\s*,\s*c\s*=\s*([\-\d.]+)\s*°?\s*$/,
  );
  if (sasTriangle) {
    const a = Number(sasTriangle[1]);
    const b = Number(sasTriangle[2]);
    const angleCdeg = Number(sasTriangle[3]);
    if (![a, b, angleCdeg].every(Number.isFinite) || a <= 0 || b <= 0 || angleCdeg <= 0 || angleCdeg >= 180) {
      return {
        ...result,
        verified: false,
        answer: 'Invalid triangle inputs',
        answerLatex: '\\text{Invalid triangle inputs}',
        explanation: 'Sides must be positive and the included angle must be between 0° and 180°.',
      };
    }
    const angleC = (angleCdeg * Math.PI) / 180;
    const c = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(angleC));
    const angleA = Math.asin((a * Math.sin(angleC)) / c) * 180 / Math.PI;
    const angleB = 180 - angleCdeg - angleA;
    const area = 0.5 * a * b * Math.sin(angleC);
    result.steps.push({
      step: 1,
      description: 'Apply the law of cosines for the third side',
      expression: `c^2 = a^2 + b^2 - 2ab\\cos(C)`,
      explanation: 'When two sides and the included angle are known, the third side comes from the law of cosines.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute and simplify',
      expression: `c = \\sqrt{${formatNumber(a)}^2 + ${formatNumber(b)}^2 - 2(${formatNumber(a)})(${formatNumber(b)})\\cos(${formatNumber(angleCdeg)}°)} = ${expressionToLatex(formatNumber(c))}`,
      explanation: 'Plug the two sides and the included angle into the formula and evaluate.',
    });
    result.steps.push({
      step: 3,
      description: 'Use the law of sines for the remaining angles',
      expression: `A = ${expressionToLatex(formatNumber(angleA))}°,\\quad B = ${expressionToLatex(formatNumber(angleB))}°`,
      explanation: 'Once one side / angle pair is known, the other angles follow from sin(A)/a = sin(C)/c.',
    });
    result.steps.push({
      step: 4,
      description: 'Triangle area',
      expression: `\\text{Area} = \\tfrac{1}{2}ab\\sin(C) = ${expressionToLatex(formatNumber(area))}`,
      explanation: 'Half the product of two sides times the sine of the included angle.',
    });
    result.answer = `c = ${formatNumber(c)}, A = ${formatNumber(angleA)}°, B = ${formatNumber(angleB)}°, Area = ${formatNumber(area)}`;
    result.answerLatex = `c = ${expressionToLatex(formatNumber(c))},\\; A = ${expressionToLatex(formatNumber(angleA))}°,\\; B = ${expressionToLatex(formatNumber(angleB))}°`;
    result.explanation = 'Solved the SAS triangle with the law of cosines and the law of sines.';
    return result;
  }

  return {
    ...result,
    verified: false,
    answer: 'Unsupported geometry problem',
    answerLatex: '\\text{Unsupported geometry problem}',
    explanation: 'Try line through (1,2) and (4,6), equation of circle: center (2,-3), radius 5, midpoint of (1,2) and (4,6), area of triangle with sides 3, 4, 5, area of rectangle 5 by 3, or solve triangle: a=5, b=7, C=60°.',
  };
}

function solveSequenceSeries(normalizedInput: string): SolverResult {
  const result = baseResult('sequences-series', normalizedInput, 'mathjs');
  const arithmeticNth = normalizedInput.match(/^arithmetic nth\s+(.+?)\s+(.+?)\s+(.+)$/i);
  const arithmeticSum = normalizedInput.match(/^arithmetic sum\s+(.+?)\s+(.+?)\s+(.+)$/i);
  const geometricNth = normalizedInput.match(/^geometric nth\s+(.+?)\s+(.+?)\s+(.+)$/i);
  const geometricSum = normalizedInput.match(/^geometric sum\s+(.+?)\s+(.+?)\s+(.+)$/i);

  const evaluateTerms = (matches: RegExpMatchArray) => ({
    a1: Number(math.evaluate(matches[1])),
    step: Number(math.evaluate(matches[2])),
    n: Number(math.evaluate(matches[3])),
  });

  if (arithmeticNth) {
    const { a1, step, n } = evaluateTerms(arithmeticNth);
    const answer = a1 + ((n - 1) * step);
    result.steps.push({
      step: 1,
      description: 'Use the arithmetic nth-term formula',
      expression: `a_n = a_1 + (n-1)d`,
      explanation: 'For an arithmetic sequence, each term increases by a constant difference d.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the known values',
      expression: `a_${formatNumber(n)} = ${expressionToLatex(formatNumber(a1))} + (${expressionToLatex(formatNumber(n - 1))})(${expressionToLatex(formatNumber(step))}) = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Plug in the first term, common difference, and required term number.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Found the nth term of the arithmetic sequence.';
    return result;
  }

  if (arithmeticSum) {
    const { a1, step, n } = evaluateTerms(arithmeticSum);
    const nth = a1 + ((n - 1) * step);
    const answer = (n / 2) * (a1 + nth);
    result.steps.push({
      step: 1,
      description: 'Find the last term if needed',
      expression: `a_n = ${expressionToLatex(formatNumber(nth))}`,
      explanation: 'The sum formula uses the first and nth term.',
    });
    result.steps.push({
      step: 2,
      description: 'Use the arithmetic sum formula',
      expression: `S_n = \\frac{n}{2}(a_1 + a_n) = \\frac{${expressionToLatex(formatNumber(n))}}{2}(${expressionToLatex(formatNumber(a1))} + ${expressionToLatex(formatNumber(nth))}) = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Arithmetic series sums average the first and last term, then multiply by the number of terms.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the finite sum of the arithmetic series.';
    return result;
  }

  if (geometricNth) {
    const { a1, step, n } = evaluateTerms(geometricNth);
    const answer = a1 * (step ** (n - 1));
    result.steps.push({
      step: 1,
      description: 'Use the geometric nth-term formula',
      expression: `a_n = a_1 r^{n-1}`,
      explanation: 'For a geometric sequence, each term is multiplied by the common ratio r.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the known values',
      expression: `a_${formatNumber(n)} = ${expressionToLatex(formatNumber(a1))} \\cdot ${expressionToLatex(formatNumber(step))}^{${expressionToLatex(formatNumber(n - 1))}} = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Raise the common ratio to n-1 and multiply by the first term.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Found the nth term of the geometric sequence.';
    return result;
  }

  if (geometricSum) {
    const { a1, step, n } = evaluateTerms(geometricSum);
    const answer = step === 1 ? a1 * n : a1 * ((1 - (step ** n)) / (1 - step));
    result.steps.push({
      step: 1,
      description: 'Use the finite geometric series formula',
      expression: step === 1
        ? `S_n = na_1`
        : `S_n = a_1\\frac{1-r^n}{1-r}`,
      explanation: 'A geometric series uses the ratio r to sum repeated multiplication patterns.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the values',
      expression: step === 1
        ? `S_${formatNumber(n)} = ${expressionToLatex(formatNumber(n))} \\cdot ${expressionToLatex(formatNumber(a1))} = ${expressionToLatex(formatNumber(answer))}`
        : `S_${formatNumber(n)} = ${expressionToLatex(formatNumber(a1))}\\frac{1-${expressionToLatex(formatNumber(step))}^{${expressionToLatex(formatNumber(n))}}}{1-${expressionToLatex(formatNumber(step))}} = ${expressionToLatex(formatNumber(answer))}`,
      explanation: 'Substitute the first term, ratio, and number of terms carefully.',
    });
    result.answer = formatNumber(answer);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the finite geometric series sum.';
    return result;
  }

  return {
    ...result,
    verified: false,
    answer: 'Unsupported sequence or series problem',
    answerLatex: '\\text{Unsupported sequence or series problem}',
    explanation: 'Try arithmetic nth 3 2 10, arithmetic sum 3 2 10, geometric nth 2 3 5, or geometric sum 2 3 5.',
  };
}

function solveExponentialEquation(normalizedInput: string, category: MathCategoryId): SolverResult | null {
  // Matches: a^x = b  (e.g. 2^x = 16, e^x = 7, 3^x = 27)
  const match = normalizedInput.match(/^([0-9e.]+)\^x\s*=\s*([0-9e.\-+*/()]+)$/i);
  if (!match) return null;

  const base = match[1].toLowerCase() === 'e' ? Math.E : parseFloat(match[1]);
  let rhs: number;
  try { rhs = Number(math.evaluate(match[2])); } catch { return null; }
  if (!Number.isFinite(base) || base <= 0 || base === 1 || !Number.isFinite(rhs) || rhs <= 0) return null;

  const x = Math.log(rhs) / Math.log(base);
  const result = baseResult(category === 'calculus' ? 'algebra' : category, normalizedInput, 'mathjs');
  const baseStr = match[1].toLowerCase() === 'e' ? 'e' : formatNumber(base);

  result.steps.push({
    step: 1, description: 'Write the exponential equation',
    expression: `${baseStr}^{x} = ${expressionToLatex(formatNumber(rhs))}`,
    explanation: 'Identify the base and the right-hand side value.',
  });
  result.steps.push({
    step: 2, description: 'Take the logarithm of both sides',
    expression: `x \\cdot \\ln(${baseStr}) = \\ln(${expressionToLatex(formatNumber(rhs))})`,
    explanation: 'Apply ln to both sides. Use the power rule: ln(aˣ) = x·ln(a).',
  });
  result.steps.push({
    step: 3, description: 'Solve for x',
    expression: `x = \\frac{\\ln(${expressionToLatex(formatNumber(rhs))})}{\\ln(${baseStr})} = ${expressionToLatex(formatNumber(x))}`,
    explanation: `Divide both sides by ln(${baseStr}).`,
  });

  // Check if x is a nice integer
  const rounded = Math.round(x);
  const isExact = Math.abs(x - rounded) < 1e-9;
  result.answer = isExact ? `x = ${rounded}` : `x ≈ ${formatNumber(x)}`;
  result.answerLatex = isExact ? `x = ${rounded}` : `x \\approx ${expressionToLatex(formatNumber(x))}`;
  result.explanation = `Solved the exponential equation using logarithms.`;
  result.graphExpr = `${baseStr}^x - ${formatNumber(rhs)}`;
  return result;
}

function solveDerivative(normalizedInput: string): SolverResult {
  const result = baseResult('calculus', normalizedInput, 'nerdamer');
  let expression = normalizedInput
    .replace(/^derivative of\s+/i, '')
    .replace(/^differentiation of\s+/i, '')
    .replace(/^differentiate\s+/i, '')
    .replace(/^diff\s+/i, '')
    .replace(/^d\/dx\s*/i, '')
    .replace(/^d\s*\(\s*/i, '')
    .replace(/\)$/g, '')
    .replace(/^\((.+)\)$/, '$1')
    .trim();

  // Handle diff(expr, var) form
  const diffCallMatch = expression.match(/^diff\s*\(\s*(.+?)\s*,\s*[a-zA-Z]\s*\)$/i);
  if (diffCallMatch) expression = diffCallMatch[1];

  result.steps.push({
    step: 1,
    description: 'Identify the function',
    expression: `f(x) = ${expressionToLatex(expression)}`,
    explanation: 'We first write the function in a clean symbolic form.',
  });

  const derivative = nerdamer.diff(expression, 'x').toString();
  const simplified = nerdamer(derivative).toString();

  result.steps.push({
    step: 2,
    description: 'Differentiate with respect to x',
    expression: `\\frac{d}{dx}\\left(${expressionToLatex(expression)}\\right) = ${expressionToLatex(derivative)}`,
    explanation: 'Apply the derivative rules term-by-term.',
  });

  if (simplified !== derivative) {
    result.steps.push({
      step: 3,
      description: 'Simplify the derivative',
      expression: `${expressionToLatex(derivative)} = ${expressionToLatex(simplified)}`,
      explanation: 'Simplify the symbolic result into a cleaner final form.',
    });
  }

  result.answer = simplified;
  result.answerLatex = expressionToLatex(simplified);
  result.explanation = 'Used symbolic differentiation to produce an exact derivative.';
  result.graphExpr = expression;
  return result;
}

function solveIntegral(normalizedInput: string): SolverResult {
  const result = baseResult('calculus', normalizedInput, 'nerdamer');
  const definiteMatch = normalizedInput.match(/^integral\s+from\s+(.+?)\s+to\s+(.+?)\s+of\s+(.+?)(?:\s+d([a-zA-Z]))?$/i);
  if (definiteMatch) {
    const [, lowerBound, upperBound, integrand, rawVariable] = definiteMatch;
    const variable = rawVariable || 'x';
    const antiderivative = nerdamer.integrate(integrand.trim(), variable).toString();
    const lowerValue = Number(math.evaluate(lowerBound));
    const upperValue = Number(math.evaluate(upperBound));

    if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) {
      return {
        ...result,
        verified: false,
        answer: 'Bounds must evaluate numerically',
        answerLatex: '\\text{Bounds must evaluate numerically}',
        explanation: 'Use numeric or standard constants like pi in the upper and lower limits.',
      };
    }

    const upperEval = Number(math.evaluate(antiderivative, { [variable]: upperValue }));
    const lowerEval = Number(math.evaluate(antiderivative, { [variable]: lowerValue }));
    const definiteValue = upperEval - lowerEval;

    result.steps.push({
      step: 1,
      description: 'Identify the definite integral',
      expression: formatMathExpression(normalizedInput),
      explanation: 'Read the lower limit, upper limit, and integrand before integrating.',
    });
    result.steps.push({
      step: 2,
      description: 'Find the antiderivative',
      expression: `\\int ${expressionToLatex(integrand.trim())}\\, d${variable} = ${expressionToLatex(antiderivative)}`,
      explanation: 'Compute an antiderivative of the integrand first.',
    });
    result.steps.push({
      step: 3,
      description: 'Evaluate at the bounds',
      expression: `\\left[${expressionToLatex(antiderivative)}\\right]_{${expressionToLatex(lowerBound)}}^{${expressionToLatex(upperBound)}} = ${expressionToLatex(formatNumber(definiteValue))}`,
      explanation: 'Substitute the upper and lower limits into the antiderivative and subtract.',
    });

    result.answer = formatNumber(definiteValue);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the definite integral by evaluating the antiderivative at the upper and lower bounds.';
    result.graphExpr = integrand.trim();
    return result;
  }

  const expression = normalizedInput
    .replace(/^integral of\s+/i, '')
    .replace(/^integral\s+/i, '')
    .replace(/^integrate\s+/i, '')
    .replace(/^int\s+/i, '')
    .replace(/\s+dx$/i, '')
    .trim();

  result.steps.push({
    step: 1,
    description: 'Identify the integrand',
    expression: `\\int ${expressionToLatex(expression)}\\,dx`,
    explanation: 'We start by isolating the function we want to integrate.',
  });

  const antiderivative = nerdamer.integrate(expression, 'x').toString();
  const simplified = nerdamer(antiderivative).toString();

  result.steps.push({
    step: 2,
    description: 'Apply an antiderivative rule',
    expression: `\\int ${expressionToLatex(expression)}\\,dx = ${expressionToLatex(antiderivative)} + C`,
    explanation: 'Use symbolic integration to produce the antiderivative.',
  });

  if (simplified !== antiderivative) {
    result.steps.push({
      step: 3,
      description: 'Simplify the antiderivative',
      expression: `${expressionToLatex(antiderivative)} = ${expressionToLatex(simplified)}`,
      explanation: 'Rewrite the result in a cleaner exact form.',
    });
  }

  result.answer = `${simplified} + C`;
  result.answerLatex = `${expressionToLatex(simplified)} + C`;
  result.explanation = 'Computed an exact antiderivative and added the constant of integration.';
  result.graphExpr = expression;
  return result;
}

function solveLimit(normalizedInput: string): SolverResult {
  const result = baseResult('calculus', normalizedInput, 'mathjs');
  const match = normalizedInput.match(/^limit\s+(.+?)\s+of\s+(.+)$/i);
  if (!match) {
    return { ...result, verified: false, answer: 'Unable to parse limit', answerLatex: '\\text{Unable to parse limit}', explanation: 'Use format: limit x->0 of sin(x)/x' };
  }

  const approach = match[1].trim();
  const expression = match[2].trim();
  const [, variable, rawValue] = approach.match(/^([a-zA-Z]+)\s*->\s*(.+)$/) || ['', 'x', '0'];
  const epsilon = 1e-6;

  result.steps.push({
    step: 1,
    description: 'State the limit',
    expression: `\\lim_{${variable}\\to ${expressionToLatex(rawValue)}} ${expressionToLatex(expression)}`,
    explanation: 'Read the approaching value and the function carefully before substituting.',
  });

  // Handle symbolic approach values: infinity, -infinity
  const lowerRaw = rawValue.toLowerCase().trim();
  if (lowerRaw === 'inf' || lowerRaw === 'infinity' || lowerRaw === '+inf') {
    try {
      const atLarge = Number(math.evaluate(expression, { [variable]: 1e12 }));
      const atLarger = Number(math.evaluate(expression, { [variable]: 1e15 }));
      const estimate = Number.isFinite(atLarger) ? atLarger : atLarge;
      result.steps.push({
        step: 2,
        description: 'Evaluate at very large values',
        expression: `${variable}=10^{12} \\Rightarrow ${formatNumber(atLarge)}, \\quad ${variable}=10^{15} \\Rightarrow ${formatNumber(atLarger)}`,
        explanation: 'Substitute very large numbers to estimate the limit as the variable grows without bound.',
      });
      result.answer = formatNumber(estimate);
      result.answerLatex = expressionToLatex(formatNumber(estimate));
      result.explanation = 'Estimated the limit at infinity numerically.';
    } catch {
      result.verified = false;
      result.answer = 'Unable to evaluate limit at infinity';
      result.answerLatex = '\\text{Unable to evaluate limit at infinity}';
      result.explanation = 'Could not evaluate the expression at large values.';
    }
    result.graphExpr = expression;
    return result;
  }

  if (lowerRaw === '-inf' || lowerRaw === '-infinity') {
    try {
      const atSmall = Number(math.evaluate(expression, { [variable]: -1e12 }));
      result.steps.push({
        step: 2,
        description: 'Evaluate at very large negative values',
        expression: `${variable}=-10^{12} \\Rightarrow ${formatNumber(atSmall)}`,
        explanation: 'Substitute very large negative numbers to estimate the limit.',
      });
      result.answer = formatNumber(atSmall);
      result.answerLatex = expressionToLatex(formatNumber(atSmall));
      result.explanation = 'Estimated the limit at negative infinity numerically.';
    } catch {
      result.verified = false;
      result.answer = 'Unable to evaluate limit at -infinity';
      result.answerLatex = '\\text{Unable to evaluate}';
      result.explanation = 'Could not evaluate the expression at large negative values.';
    }
    result.graphExpr = expression;
    return result;
  }

  const point = Number(math.evaluate(rawValue));
  if (!Number.isFinite(point)) {
    return {
      ...result,
      verified: false,
      answer: 'Could not parse the approach value',
      answerLatex: '\\text{Could not parse the approach value}',
      explanation: `Use a numeric value or "inf" for infinity. Example: limit x->0 of sin(x)/x`,
    };
  }

  const left = Number(math.evaluate(expression, { [variable]: point - epsilon }));
  const right = Number(math.evaluate(expression, { [variable]: point + epsilon }));
  const estimate = (left + right) / 2;

  result.steps.push({
    step: 2,
    description: 'Check both sides near the target value',
    expression: `${variable}=${formatNumber(point - epsilon)} \\Rightarrow ${formatNumber(left)}, \\quad ${variable}=${formatNumber(point + epsilon)} \\Rightarrow ${formatNumber(right)}`,
    explanation: 'Evaluate values just to the left and right to estimate the common trend.',
  });

  if (!Number.isFinite(estimate)) {
    result.steps.push({
      step: 3,
      description: 'Limit does not exist or is infinite',
      expression: `\\lim_{${variable}\\to ${expressionToLatex(rawValue)}} ${expressionToLatex(expression)} = \\text{DNE or } \\pm\\infty`,
      explanation: 'The function is undefined or diverges at this point. Check for a vertical asymptote.',
    });
    result.answer = 'Does not exist (or ±∞)';
    result.answerLatex = '\\pm\\infty \\text{ or DNE}';
    result.explanation = 'The function diverges or is undefined at the given point.';
    result.graphExpr = expression;
    return result;
  }

  result.answer = formatNumber(estimate);
  result.answerLatex = expressionToLatex(formatNumber(estimate));
  result.explanation = 'Estimated the limit numerically from both sides. This is a strong approximation when both sides agree.';
  result.graphExpr = expression;
  return result;
}

function solveVectorProblem(normalizedInput: string): SolverResult {
  const result = baseResult('vectors', normalizedInput, 'mathjs');
  const dotMatch =
    normalizedInput.match(/dot product\s*(\[[^\]]+\])\s*(?:and\s*)?(\[[^\]]+\])/i) ||
    normalizedInput.match(/^dot\((\[[^\]]+\]),\s*(\[[^\]]+\])\)$/i) ||
    normalizedInput.match(/^(\[[^\]]+\])\s*(\[[^\]]+\])$/);
  const magnitudeMatch =
    normalizedInput.match(/^magnitude\s*(\[[^\]]+\])$/i) ||
    normalizedInput.match(/^norm\((\[[^\]]+\])\)$/i);
  const angleMatch = normalizedInput.match(/^angle between\s*(\[[^\]]+\])\s*(\[[^\]]+\])$/i);
  const crossMatch = normalizedInput.match(/^cross\((\[[^\]]+\]),\s*(\[[^\]]+\])\)$/i) || normalizedInput.match(/^cross product\s*(\[[^\]]+\])\s*(?:and\s*)?(\[[^\]]+\])$/i);
  const unitMatch = normalizedInput.match(/^(?:unit vector|normalize)\s*(\[[^\]]+\])$/i);
  const addSubtractMatch = normalizedInput.match(/^(\[[^\]]+\])\s*([+\-])\s*(\[[^\]]+\])$/);

  if (addSubtractMatch) {
    const left = parseVector(addSubtractMatch[1]);
    const right = parseVector(addSubtractMatch[3]);
    const op = addSubtractMatch[2];
    if (!left || !right || left.length !== right.length) {
      return { ...result, verified: false, answer: 'Vector dimensions do not match', answerLatex: '\\text{Vector dimensions do not match}', explanation: 'Vector addition and subtraction require the same number of components.' };
    }
    const combined = left.map((value, index) => op === '+' ? value + right[index] : value - right[index]);
    result.steps.push({
      step: 1,
      description: 'Write the vectors componentwise',
      expression: `${vectorToLatex(left)} ${op} ${vectorToLatex(right)}`,
      explanation: `Both vectors are ${left.length}D, so we can combine matching entries.`,
    });
    result.steps.push({
      step: 2,
      description: op === '+' ? 'Add matching components' : 'Subtract matching components',
      expression: combined.map((value, index) => `${formatNumber(left[index])} ${op} ${formatNumber(right[index])} = ${formatNumber(value)}`).join(', \\quad '),
      explanation: 'Work entry by entry across the vectors.',
    });
    result.answer = `[${combined.map((value) => formatNumber(value)).join(', ')}]`;
    result.answerLatex = vectorToLatex(combined);
    result.explanation = `Computed the vector ${op === '+' ? 'sum' : 'difference'} component by component.`;
    return result;
  }

  if (dotMatch) {
    const left = parseVector(dotMatch[1]);
    const right = parseVector(dotMatch[2]);
    if (!left || !right || left.length !== right.length) {
      return { ...result, verified: false, answer: 'Vector dimensions do not match', answerLatex: '\\text{Vector dimensions do not match}', explanation: 'Dot product requires two vectors of the same length.' };
    }

    const pieces = left.map((value, index) => `${formatNumber(value)} \\times ${formatNumber(right[index])}`);
    const total = left.reduce((sum, value, index) => sum + value * right[index], 0);

    result.steps.push({
      step: 1,
      description: 'Write both vectors',
      expression: `${vectorToLatex(left)} \\cdot ${vectorToLatex(right)}`,
      explanation: 'A dot product multiplies matching components and then adds them.',
    });
    result.steps.push({
      step: 2,
      description: 'Multiply matching entries',
      expression: pieces.join(' + '),
      explanation: `Multiply each pair: ${pieces.join(' + ')}.`,
    });
    result.steps.push({
      step: 3,
      description: 'Add the products',
      expression: `${pieces.join(' + ')} = ${formatNumber(total)}`,
      explanation: 'Sum the products to get the final dot product.',
    });

    result.answer = formatNumber(total);
    result.answerLatex = expressionToLatex(formatNumber(total));
    result.explanation = 'Computed the dot product directly from the vector components.';
    return result;
  }

  if (crossMatch) {
    const left = parseVector(crossMatch[1]);
    const right = parseVector(crossMatch[2]);
    if (!left || !right || left.length !== 3 || right.length !== 3) {
      return { ...result, verified: false, answer: 'Cross product needs 3D vectors', answerLatex: '\\text{Cross product needs 3D vectors}', explanation: 'Use format: cross([a,b,c], [d,e,f]) with exactly three components in each vector.' };
    }
    const cross = [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0],
    ];
    result.steps.push({
      step: 1,
      description: 'Write the 3D vectors',
      expression: `${vectorToLatex(left)} \\times ${vectorToLatex(right)}`,
      explanation: 'Cross product is defined for 3D vectors and returns a perpendicular vector.',
    });
    result.steps.push({
      step: 2,
      description: 'Compute the determinant-style components',
      expression: `\\left(${formatNumber(cross[0])},\\ ${formatNumber(cross[1])},\\ ${formatNumber(cross[2])}\\right)`,
      explanation: 'Use the standard 3D cross-product formula component by component.',
    });
    result.answer = `[${cross.map((value) => formatNumber(value)).join(', ')}]`;
    result.answerLatex = vectorToLatex(cross);
    result.explanation = 'Computed the cross product of the two 3D vectors.';
    return result;
  }

  if (magnitudeMatch) {
    const vector = parseVector(magnitudeMatch[1]);
    if (!vector) {
      return { ...result, verified: false, answer: 'Invalid vector', answerLatex: '\\text{Invalid vector}', explanation: 'Use format: magnitude [3,4]' };
    }
    const squares = vector.map((value) => value * value);
    const magnitude = Math.sqrt(squares.reduce((sum, value) => sum + value, 0));
    result.steps.push({
      step: 1,
      description: 'Square each component',
      expression: squares.map((value) => formatNumber(value)).join(' + '),
      explanation: 'Magnitude uses the square root of the sum of squares.',
    });
    result.steps.push({
      step: 2,
      description: 'Take the square root',
      expression: `\\sqrt{${squares.map((value) => formatNumber(value)).join(' + ')}} = ${expressionToLatex(formatNumber(magnitude))}`,
      explanation: 'This produces the vector length.',
    });
    result.answer = formatNumber(magnitude);
    result.answerLatex = expressionToLatex(formatNumber(magnitude));
    result.explanation = 'Computed the vector magnitude from its Euclidean length.';
    return result;
  }

  if (unitMatch) {
    const vector = parseVector(unitMatch[1]);
    if (!vector) {
      return { ...result, verified: false, answer: 'Invalid vector', answerLatex: '\\text{Invalid vector}', explanation: 'Use format: unit vector [3,4]' };
    }
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (isNearlyZero(magnitude)) {
      return { ...result, verified: false, answer: 'Zero vector has no unit vector', answerLatex: '\\text{Zero vector has no unit vector}', explanation: 'You cannot normalize the zero vector because its magnitude is 0.' };
    }
    const normalized = vector.map((value) => value / magnitude);
    result.steps.push({
      step: 1,
      description: 'Find the magnitude first',
      expression: `|\\mathbf{v}| = ${expressionToLatex(formatNumber(magnitude))}`,
      explanation: 'A unit vector divides each component by the original vector length.',
    });
    result.steps.push({
      step: 2,
      description: 'Divide each component by the magnitude',
      expression: `\\hat{\\mathbf{v}} = ${vectorToLatex(vector)} \\cdot \\frac{1}{${expressionToLatex(formatNumber(magnitude))}} = ${vectorToLatex(normalized)}`,
      explanation: 'This rescales the vector to length 1 while keeping the same direction.',
    });
    result.answer = `[${normalized.map((value) => formatNumber(value)).join(', ')}]`;
    result.answerLatex = vectorToLatex(normalized);
    result.explanation = 'Computed the unit vector by normalizing the original vector.';
    return result;
  }

  if (angleMatch) {
    const left = parseVector(angleMatch[1]);
    const right = parseVector(angleMatch[2]);
    if (!left || !right || left.length !== right.length) {
      return { ...result, verified: false, answer: 'Vector dimensions do not match', answerLatex: '\\text{Vector dimensions do not match}', explanation: 'Angle calculation needs vectors of the same length.' };
    }
    const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
    const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
    const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
    if (isNearlyZero(leftMagnitude) || isNearlyZero(rightMagnitude)) {
      return { ...result, verified: false, answer: 'Angle undefined for zero vector', answerLatex: '\\text{Angle undefined for zero vector}', explanation: 'At least one vector has magnitude 0, so the angle is undefined.' };
    }
    const cosine = Math.max(-1, Math.min(1, dot / (leftMagnitude * rightMagnitude)));
    const radians = Math.acos(cosine);
    const degrees = radians * (180 / Math.PI);
    result.steps.push({
      step: 1,
      description: 'Use the cosine formula',
      expression: `\\cos(\\theta) = \\frac{u \\cdot v}{|u||v|}`,
      explanation: 'Find the angle from the dot product and both magnitudes.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute the values',
      expression: `\\cos(\\theta) = \\frac{${formatNumber(dot)}}{${formatNumber(leftMagnitude)} \\cdot ${formatNumber(rightMagnitude)}} = ${expressionToLatex(formatNumber(cosine))}`,
      explanation: 'Now evaluate the inverse cosine.',
    });
    result.answer = `${formatNumber(degrees)}°`;
    result.answerLatex = `${expressionToLatex(formatNumber(degrees))}^{\\circ}`;
    result.explanation = 'Computed the angle between the vectors using cosine similarity geometry.';
    return result;
  }

  return { ...result, verified: false, answer: 'Unsupported vector problem', answerLatex: '\\text{Unsupported vector problem}', explanation: 'Try vector addition/subtraction, dot(...), cross(...), norm(...), unit vector [...], or angle between [a,b] [c,d].' };
}

function solveMatrixProblem(normalizedInput: string, category: MathCategoryId): SolverResult {
  const result = baseResult(category, normalizedInput, 'mathjs');

  if (/^det\(/i.test(normalizedInput)) {
    const matrixText = normalizedInput.replace(/^det\(/i, '').replace(/\)$/,'');
    const matrix = parseMatrix(matrixText);
    if (!matrix) {
      return { ...result, verified: false, answer: 'Invalid matrix', answerLatex: '\\text{Invalid matrix}', explanation: 'Use format: det([[1,2],[3,4]])' };
    }
    if (matrix.length !== matrix[0]?.length) {
      return { ...result, verified: false, answer: 'Square matrix required', answerLatex: '\\text{Square matrix required}', explanation: `Determinants only exist for square matrices. You entered ${matrixShape(matrix)}.` };
    }
    const determinant = Number(math.det(matrix));
    result.steps.push({
      step: 1,
      description: 'Write the matrix',
      expression: `A = ${matrixToLatex(matrix)}`,
      explanation: 'The determinant summarizes scaling and invertibility for a square matrix.',
    });
    result.steps.push({
      step: 2,
      description: 'Compute the determinant',
      expression: `\\det(A) = ${expressionToLatex(formatNumber(determinant))}`,
      explanation: 'Evaluate the determinant directly from the matrix entries.',
    });
    result.answer = formatNumber(determinant);
    result.answerLatex = expressionToLatex(formatNumber(determinant));
    result.explanation = 'Computed the determinant using matrix operations.';
    return result;
  }

  if (/^inv\(/i.test(normalizedInput)) {
    const matrixText = normalizedInput.replace(/^inv\(/i, '').replace(/\)$/,'');
    const matrix = parseMatrix(matrixText);
    if (!matrix) {
      return { ...result, verified: false, answer: 'Invalid matrix', answerLatex: '\\text{Invalid matrix}', explanation: 'Use format: inv([[1,2],[3,4]])' };
    }
    if (matrix.length !== matrix[0]?.length) {
      return { ...result, verified: false, answer: 'Square matrix required', answerLatex: '\\text{Square matrix required}', explanation: `Only square matrices can have inverses. You entered ${matrixShape(matrix)}.` };
    }
    const determinantValue = Number(math.det(matrix));
    if (isNearlyZero(determinantValue)) {
      return { ...result, verified: false, answer: 'Matrix is singular', answerLatex: '\\text{Matrix is singular}', explanation: 'This matrix has determinant 0, so it is not invertible.' };
    }
    const inverse = math.inv(matrix) as math.MathCollection;
    const inverseArray = Array.isArray(inverse) ? inverse as number[][] : (inverse as math.Matrix).toArray() as number[][];
    result.steps.push({
      step: 1,
      description: 'Write the matrix',
      expression: `A = ${matrixToLatex(matrix)}`,
      explanation: 'An inverse exists only for a square matrix with non-zero determinant.',
    });
    result.steps.push({
      step: 2,
      description: 'Compute the inverse',
      expression: `A^{-1} = ${matrixToLatex(inverseArray)}`,
      explanation: 'The inverse matrix reverses the original linear transformation.',
    });
    result.answer = matrixToAnswerString(inverseArray);
    result.answerLatex = matrixToLatex(inverseArray);
    result.explanation = 'Computed the matrix inverse exactly with mathjs.';
    return result;
  }

  if (/^transpose\(/i.test(normalizedInput)) {
    const matrixText = normalizedInput.replace(/^transpose\(/i, '').replace(/\)$/,'');
    const matrix = parseMatrix(matrixText);
    if (!matrix) {
      return { ...result, verified: false, answer: 'Invalid matrix', answerLatex: '\\text{Invalid matrix}', explanation: 'Use format: transpose([[1,2,3],[4,5,6]])' };
    }
    const transposed = math.transpose(matrix) as math.MathCollection;
    const transposedArray = Array.isArray(transposed) ? transposed as number[][] : (transposed as math.Matrix).toArray() as number[][];
    result.steps.push({
      step: 1,
      description: 'Write the matrix',
      expression: `A = ${matrixToLatex(matrix)}`,
      explanation: `The original matrix has shape ${matrixShape(matrix)}.`,
    });
    result.steps.push({
      step: 2,
      description: 'Swap rows and columns',
      expression: `A^{T} = ${matrixToLatex(transposedArray)}`,
      explanation: `Transpose flips the matrix to shape ${matrixShape(transposedArray)}.`,
    });
    result.answer = matrixToAnswerString(transposedArray);
    result.answerLatex = matrixToLatex(transposedArray);
    result.explanation = 'Computed the transpose by swapping rows and columns.';
    return result;
  }

  const scalarLeftMatch = normalizedInput.match(/^(-?\d+(?:\.\d+)?)\s*\*\s*(\[\[.*\]\])$/);
  if (scalarLeftMatch) {
    const scalar = parseScalar(scalarLeftMatch[1]);
    const matrix = parseMatrix(scalarLeftMatch[2]);
    if (scalar === null || !matrix) {
      return { ...result, verified: false, answer: 'Invalid scalar multiply format', answerLatex: '\\text{Invalid scalar multiply format}', explanation: 'Use format like 3 * [[1,2],[3,4]].' };
    }
    const scaled = matrix.map((row) => row.map((value) => value * scalar));
    result.steps.push({
      step: 1,
      description: 'Write the scalar and matrix',
      expression: `${expressionToLatex(formatNumber(scalar))} \\cdot ${matrixToLatex(matrix)}`,
      explanation: `Multiply each entry in the ${matrixShape(matrix)} matrix by the scalar.`,
    });
    result.steps.push({
      step: 2,
      description: 'Scale every entry',
      expression: matrixToLatex(scaled),
      explanation: 'Scalar multiplication changes every matrix entry by the same factor.',
    });
    result.answer = matrixToAnswerString(scaled);
    result.answerLatex = matrixToLatex(scaled);
    result.explanation = 'Computed the scalar multiple of the matrix.';
    return result;
  }

  const scalarRightMatch = normalizedInput.match(/^(\[\[.*\]\])\s*\*\s*(-?\d+(?:\.\d+)?)$/);
  if (scalarRightMatch) {
    return solveMatrixProblem(`${scalarRightMatch[2]} * ${scalarRightMatch[1]}`, category);
  }

  const matrixBinaryMatch = normalizedInput.match(/^(\[\[.*\]\])\s*([+\-*])\s*(\[\[.*\]\])$/);
  if (matrixBinaryMatch) {
    const left = parseMatrix(matrixBinaryMatch[1]);
    const op = matrixBinaryMatch[2];
    const right = parseMatrix(matrixBinaryMatch[3]);
    if (!left || !right) {
      return { ...result, verified: false, answer: 'Invalid matrix format', answerLatex: '\\text{Invalid matrix format}', explanation: 'Use format like [[1,2],[3,4]] + [[5,6],[7,8]].' };
    }

    if ((op === '+' || op === '-') && (left.length !== right.length || left[0]?.length !== right[0]?.length)) {
      return { ...result, verified: false, answer: 'Matrix sizes must match', answerLatex: '\\text{Matrix sizes must match}', explanation: `For ${op === '+' ? 'addition' : 'subtraction'}, both matrices must have the same shape. You entered ${matrixShape(left)} and ${matrixShape(right)}.` };
    }

    if (op === '*' && left[0]?.length !== right.length) {
      return { ...result, verified: false, answer: 'Inner dimensions do not match', answerLatex: '\\text{Inner dimensions do not match}', explanation: `Matrix multiplication needs columns(A) = rows(B). You entered ${matrixShape(left)} and ${matrixShape(right)}.` };
    }

    const computed = op === '+'
      ? math.add(left, right)
      : op === '-'
        ? math.subtract(left, right)
        : math.multiply(left, right);
    const computedArray = Array.isArray(computed) ? computed as number[][] : (computed as math.Matrix).toArray() as number[][];
    result.steps.push({
      step: 1,
      description: 'Align both matrices',
      expression: `${matrixToLatex(left)} ${op === '*' ? '\\cdot' : op} ${matrixToLatex(right)}`,
      explanation: op === '*'
        ? `A is ${matrixShape(left)} and B is ${matrixShape(right)}, so the shared inner dimension is ${left[0]?.length}.`
        : `Both matrices have shape ${matrixShape(left)}, so entrywise ${op === '+' ? 'addition' : 'subtraction'} is valid.`,
    });
    result.steps.push({
      step: 2,
      description: op === '*'
        ? 'Multiply rows by columns'
        : `${op === '+' ? 'Add' : 'Subtract'} matching entries`,
      expression: matrixToLatex(computedArray),
      explanation: op === '*'
        ? 'Each output entry is a row-column dot product.'
        : 'Combine each pair of corresponding entries to get the result matrix.',
    });
    result.answer = matrixToAnswerString(computedArray);
    result.answerLatex = matrixToLatex(computedArray);
    result.explanation = op === '*'
      ? 'Computed the matrix product using compatible dimensions.'
      : `Computed the matrix ${op === '+' ? 'sum' : 'difference'} entry by entry.`;
    return result;
  }

  return { ...result, verified: false, answer: 'Unsupported matrix problem', answerLatex: '\\text{Unsupported matrix problem}', explanation: 'Try add/subtract, multiply, scalar multiply, transpose, determinant, or inverse.' };
}

// ── Trigonometry: closed-form solvers for the catalog actions ────────────────
//
// These extend the original exact-value + identity matcher with four explicit
// problem types the UI advertises: solving sin/cos/tan(x) = c on [0, 2π),
// Law of Sines, Law of Cosines, and amplitude/period extraction for sinusoids.
// Each returns a SolverResult with verified: true so the API route doesn't
// fall through to the AI cascade.

const TWO_PI = 2 * Math.PI;

function normalizeAngleRadians(value: number): number {
  let v = value % TWO_PI;
  if (v < 0) v += TWO_PI;
  return v;
}

function formatRadians(value: number): string {
  // Express small rational multiples of π exactly when we recognize them.
  const ratio = value / Math.PI;
  if (Math.abs(ratio) < 1e-9) return '0';
  for (const denom of [1, 2, 3, 4, 6, 8, 12]) {
    const num = ratio * denom;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const n = Math.round(num);
      if (denom === 1) return n === 1 ? 'π' : n === -1 ? '-π' : `${n}π`;
      if (n === 1) return `π/${denom}`;
      if (n === -1) return `-π/${denom}`;
      return `${n}π/${denom}`;
    }
  }
  return formatNumber(value);
}

function formatRadiansLatex(value: number): string {
  const ratio = value / Math.PI;
  if (Math.abs(ratio) < 1e-9) return '0';
  for (const denom of [1, 2, 3, 4, 6, 8, 12]) {
    const num = ratio * denom;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      const n = Math.round(num);
      if (denom === 1) return n === 1 ? '\\pi' : n === -1 ? '-\\pi' : `${n}\\pi`;
      if (n === 1) return `\\frac{\\pi}{${denom}}`;
      if (n === -1) return `-\\frac{\\pi}{${denom}}`;
      return `\\frac{${n}\\pi}{${denom}}`;
    }
  }
  return formatNumber(value);
}

function parseRhsScalar(rhs: string): number | null {
  const trimmed = rhs.trim();
  // Handle bare decimals/integers and common fractions like 1/2, sqrt(2)/2, etc.
  try {
    const v = Number(math.evaluate(trimmed));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Solve `sin(x) = c`, `cos(x) = c`, `tan(x) = c` for x ∈ [0, 2π).
 *
 * Roots:
 *   sin: principal = arcsin(c); other = π - principal     (only if |c| ≤ 1)
 *   cos: principal = arccos(c); other = 2π - principal     (only if |c| ≤ 1)
 *   tan: principal = arctan(c); other = principal + π       (always defined)
 */
function solveTrigEquation(normalizedInput: string): SolverResult | null {
  const compact = normalizedInput.toLowerCase().replace(/\s+/g, '');
  const m = compact.match(/^(sin|cos|tan)\(x\)=([^=]+)$/);
  if (!m) return null;

  const fn = m[1] as 'sin' | 'cos' | 'tan';
  const c = parseRhsScalar(m[2]);
  if (c === null) return null;

  const result = baseResult('trigonometry', normalizedInput, 'mathjs');

  // Domain check for sin/cos.
  if ((fn === 'sin' || fn === 'cos') && Math.abs(c) > 1) {
    return {
      ...result,
      verified: true,
      answer: 'No real solutions',
      answerLatex: '\\text{No real solutions}',
      explanation: `${fn}(x) is bounded between -1 and 1, so the equation has no real solution when |c| > 1.`,
      steps: [
        {
          step: 1,
          description: 'Check the range of the trig function',
          expression: `|c| = ${formatNumber(Math.abs(c))} > 1`,
          explanation: `${fn}(x) ∈ [-1, 1] for all real x.`,
        },
      ],
    };
  }

  let roots: number[] = [];
  let principalLabel = '';
  let symmetryLabel = '';

  if (fn === 'sin') {
    const p = Math.asin(c);
    roots = [normalizeAngleRadians(p), normalizeAngleRadians(Math.PI - p)];
    principalLabel = 'arcsin(c)';
    symmetryLabel = 'π − arcsin(c)';
  } else if (fn === 'cos') {
    const p = Math.acos(c);
    roots = [normalizeAngleRadians(p), normalizeAngleRadians(-p)];
    principalLabel = 'arccos(c)';
    symmetryLabel = '2π − arccos(c)';
  } else {
    const p = Math.atan(c);
    roots = [normalizeAngleRadians(p), normalizeAngleRadians(p + Math.PI)];
    principalLabel = 'arctan(c)';
    symmetryLabel = 'arctan(c) + π';
  }

  // Deduplicate (e.g. sin(x) = 1 → only π/2; cos(x) = 1 → only 0).
  const unique = Array.from(new Set(roots.map((r) => Math.round(r * 1e9) / 1e9))).sort((a, b) => a - b);
  const formatted = unique.map(formatRadians);
  const formattedLatex = unique.map(formatRadiansLatex);

  return {
    ...result,
    answer: `x ∈ {${formatted.join(', ')}}`,
    answerLatex: `x \\in \\left\\{ ${formattedLatex.join(', ')} \\right\\}`,
    explanation: `Closed-form solution of ${fn}(x) = ${formatNumber(c)} on [0, 2π).`,
    steps: [
      {
        step: 1,
        description: 'Identify the principal value',
        expression: `${fn}^{-1}(${formatNumber(c)})`,
        explanation: `The principal value (${principalLabel}) is the first root from the inverse function.`,
      },
      {
        step: 2,
        description: 'Apply trig symmetry to find the second root in [0, 2π)',
        expression: symmetryLabel,
        explanation: `${fn} is periodic; the second root in one period comes from ${symmetryLabel}.`,
      },
      {
        step: 3,
        description: 'List all roots in [0, 2π)',
        expression: `x \\in \\left\\{ ${formattedLatex.join(', ')} \\right\\}`,
        explanation: 'After normalizing each angle into the standard interval, deduplicate to get the final set.',
      },
    ],
  };
}

function parseLawValues(input: string): Record<string, number> {
  // Pull out tokens like "a=3", "B=45", "C=60deg" — case-sensitive on the
  // variable name (capital letters are angles; lowercase are sides).
  const out: Record<string, number> = {};
  const re = /\b([a-cA-C])\s*=\s*(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const key = m[1];
    const val = Number(m[2]);
    if (Number.isFinite(val)) out[key] = val;
  }
  return out;
}

const DEG = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Law of Sines: a/sin(A) = b/sin(B) = c/sin(C).
 * Angles given in degrees by default. Handles AAS, ASA, and the SSA case
 * (which can produce zero, one, or two valid triangles).
 */
function solveLawOfSines(normalizedInput: string): SolverResult | null {
  if (!/law\s*of\s*sines/i.test(normalizedInput)) return null;
  const v = parseLawValues(normalizedInput);
  const result = baseResult('trigonometry', normalizedInput, 'mathjs');

  // We need at least one (side, opposite-angle) pair to compute the common ratio.
  const pairs: Array<['a' | 'b' | 'c', 'A' | 'B' | 'C']> = [['a', 'A'], ['b', 'B'], ['c', 'C']];
  const knownPair = pairs.find(([s, a]) => v[s] !== undefined && v[a] !== undefined);
  if (!knownPair) {
    return {
      ...result,
      verified: false,
      error: 'Law of Sines requires at least one matching side/angle pair (e.g., a and A).',
      answer: 'Not enough information',
      answerLatex: '\\text{Not enough information}',
      explanation: 'Provide values like "law of sines a=3 A=45 B=60" — at least one side with its opposite angle is required.',
    };
  }

  const [sKey, aKey] = knownPair;
  const ratio = v[sKey] / Math.sin(v[aKey] * DEG);

  // Try to fill in the unknowns and detect SSA ambiguity.
  const computed: Array<{ label: string; value: string; latex: string }> = [];
  let ambiguousNote = '';

  for (const [s, a] of pairs) {
    if (s === sKey && a === aKey) continue;
    const haveSide = v[s] !== undefined;
    const haveAngle = v[a] !== undefined;
    if (haveSide && haveAngle) continue;

    if (haveAngle && !haveSide) {
      // Solve for the side: side = ratio * sin(angle).
      const side = ratio * Math.sin(v[a] * DEG);
      computed.push({
        label: s,
        value: formatNumber(side),
        latex: `${s} = ${formatNumber(side)}`,
      });
    } else if (haveSide && !haveAngle) {
      // SSA: angle = arcsin(side / ratio). Could be ambiguous.
      const sinValue = v[s] / ratio;
      if (Math.abs(sinValue) > 1 + 1e-9) {
        return {
          ...result,
          answer: 'No triangle exists',
          answerLatex: '\\text{No valid triangle}',
          explanation: `For the given values, sin(${a}) would need to be ${formatNumber(sinValue)}, which is outside [-1, 1].`,
          steps: [
            {
              step: 1,
              description: `Apply law of sines to solve for angle ${a}`,
              expression: `\\sin(${a}) = \\frac{${s}}{${sKey}/\\sin(${aKey})} = ${formatNumber(sinValue)}`,
              explanation: 'Sine cannot exceed 1 in magnitude, so no triangle can satisfy these constraints.',
            },
          ],
        };
      }
      const principal = Math.asin(Math.max(-1, Math.min(1, sinValue))) * RAD2DEG;
      const supplement = 180 - principal;
      // Both are valid only if the supplementary angle plus the known angle is < 180.
      const validSupplement = supplement + v[aKey] < 180 - 1e-6 && supplement > 1e-6;
      if (validSupplement && Math.abs(principal - supplement) > 1e-6) {
        computed.push({
          label: a,
          value: `${formatNumber(principal)}° or ${formatNumber(supplement)}°`,
          latex: `${a} = ${formatNumber(principal)}° \\text{ or } ${formatNumber(supplement)}°`,
        });
        ambiguousNote = ' This is the ambiguous SSA case — two triangles satisfy the constraints.';
      } else {
        computed.push({
          label: a,
          value: `${formatNumber(principal)}°`,
          latex: `${a} = ${formatNumber(principal)}°`,
        });
      }
    }
  }

  return {
    ...result,
    answer: computed.length
      ? computed.map((c) => `${c.label} = ${c.value}`).join('; ')
      : `Common ratio = ${formatNumber(ratio)}`,
    answerLatex: computed.length
      ? computed.map((c) => c.latex).join(', \\quad ')
      : `\\frac{${sKey}}{\\sin(${aKey})} = ${formatNumber(ratio)}`,
    explanation: `Used the law of sines with the (${sKey}, ${aKey}) pair as the common ratio.${ambiguousNote}`,
    steps: [
      {
        step: 1,
        description: 'State the law of sines',
        expression: '\\frac{a}{\\sin(A)} = \\frac{b}{\\sin(B)} = \\frac{c}{\\sin(C)}',
        explanation: 'Each side over the sine of its opposite angle equals the same constant for any triangle.',
      },
      {
        step: 2,
        description: 'Compute the common ratio from known values',
        expression: `\\frac{${sKey}}{\\sin(${aKey})} = \\frac{${formatNumber(v[sKey])}}{\\sin(${formatNumber(v[aKey])}°)} = ${formatNumber(ratio)}`,
        explanation: 'Plug in the matching side and angle to find the constant for this triangle.',
      },
      ...computed.map((c, i) => ({
        step: 3 + i,
        description: `Solve for ${c.label}`,
        expression: c.latex,
        explanation: 'Apply the same ratio to the remaining unknown.',
      })),
    ],
  };
}

/**
 * Law of Cosines: c² = a² + b² − 2ab·cos(C).
 *
 * Two common modes:
 *   SAS — given two sides + included angle, find the third side.
 *   SSS — given all three sides, find any angle.
 */
function solveLawOfCosines(normalizedInput: string): SolverResult | null {
  if (!/law\s*of\s*cos(?:ines)?/i.test(normalizedInput)) return null;
  const v = parseLawValues(normalizedInput);
  const result = baseResult('trigonometry', normalizedInput, 'mathjs');

  const sides = (['a', 'b', 'c'] as const).filter((k) => v[k] !== undefined);
  const angles = (['A', 'B', 'C'] as const).filter((k) => v[k] !== undefined);

  // SSS — solve for whichever angle the user implicitly wants. Default to all three.
  if (sides.length === 3 && angles.length === 0) {
    const { a, b, c } = v as { a: number; b: number; c: number };
    const A = Math.acos((b * b + c * c - a * a) / (2 * b * c)) * RAD2DEG;
    const B = Math.acos((a * a + c * c - b * b) / (2 * a * c)) * RAD2DEG;
    const C = Math.acos((a * a + b * b - c * c) / (2 * a * b)) * RAD2DEG;
    return {
      ...result,
      answer: `A = ${formatNumber(A)}°, B = ${formatNumber(B)}°, C = ${formatNumber(C)}°`,
      answerLatex: `A = ${formatNumber(A)}°,\\ B = ${formatNumber(B)}°,\\ C = ${formatNumber(C)}°`,
      explanation: 'SSS case — used the law of cosines rearranged for each angle.',
      steps: [
        {
          step: 1,
          description: 'Rearrange the law of cosines for an angle',
          expression: '\\cos(A) = \\frac{b^2 + c^2 - a^2}{2bc}',
          explanation: 'Solve the law of cosines for the cosine of the angle opposite the named side.',
        },
        {
          step: 2,
          description: 'Apply to each angle',
          expression: `A = ${formatNumber(A)}°,\\ B = ${formatNumber(B)}°,\\ C = ${formatNumber(C)}°`,
          explanation: 'Repeat for B (rearranged for side b) and C (rearranged for side c).',
        },
      ],
    };
  }

  // SAS — two sides + the included angle.
  // Convention: capital letter angle X is opposite lowercase side x.
  // For SAS we expect e.g. a, b, and C → solve for c.
  if (sides.length === 2 && angles.length === 1) {
    const angleKey = angles[0];
    const oppositeSide = angleKey.toLowerCase() as 'a' | 'b' | 'c';
    const otherSides = (['a', 'b', 'c'] as const).filter((k) => k !== oppositeSide);
    if (sides.includes(otherSides[0]) && sides.includes(otherSides[1])) {
      const s1 = v[otherSides[0]];
      const s2 = v[otherSides[1]];
      const angleDeg = v[angleKey];
      const oppositeSquared = s1 * s1 + s2 * s2 - 2 * s1 * s2 * Math.cos(angleDeg * DEG);
      const opposite = Math.sqrt(Math.max(0, oppositeSquared));
      return {
        ...result,
        answer: `${oppositeSide} = ${formatNumber(opposite)}`,
        answerLatex: `${oppositeSide} = ${formatNumber(opposite)}`,
        explanation: `SAS case — applied c² = a² + b² − 2ab·cos(C) with ${angleKey} as the included angle.`,
        steps: [
          {
            step: 1,
            description: 'State the law of cosines',
            expression: `${oppositeSide}^2 = ${otherSides[0]}^2 + ${otherSides[1]}^2 - 2 \\cdot ${otherSides[0]} \\cdot ${otherSides[1]} \\cdot \\cos(${angleKey})`,
            explanation: 'The square of any side equals the sum of squares of the other two minus twice their product times the cosine of the included angle.',
          },
          {
            step: 2,
            description: 'Substitute the known values',
            expression: `${oppositeSide}^2 = ${formatNumber(s1)}^2 + ${formatNumber(s2)}^2 - 2(${formatNumber(s1)})(${formatNumber(s2)})\\cos(${formatNumber(angleDeg)}°)`,
            explanation: 'Plug in the two sides and the included angle.',
          },
          {
            step: 3,
            description: 'Solve for the opposite side',
            expression: `${oppositeSide} = \\sqrt{${formatNumber(oppositeSquared)}} = ${formatNumber(opposite)}`,
            explanation: 'Take the positive square root.',
          },
        ],
      };
    }
  }

  return {
    ...result,
    verified: false,
    error: 'Law of Cosines requires SAS (two sides + included angle) or SSS (three sides).',
    answer: 'Not enough information',
    answerLatex: '\\text{Not enough information}',
    explanation: 'Provide values like "law of cosines a=3 b=4 C=60" or "law of cosines a=3 b=4 c=5".',
  };
}

/**
 * Extract amplitude, period, phase shift, and vertical shift from
 * y = A·sin(B·x + C) + D (or cos / tan variants).
 */
function solveAmplitudePeriod(normalizedInput: string): SolverResult | null {
  if (!/amplitude|period/i.test(normalizedInput)) return null;
  const compact = normalizedInput.toLowerCase().replace(/\s+/g, '');

  // Match optional A coefficient, the trig function, B coefficient on x, optional + C, optional + D.
  // Examples accepted:
  //   amplitude 2*sin(3*x)
  //   period of 5sin(2x+pi/4)
  //   amplitude and period of -3cos(x/2 - pi)+1
  const re = /(-?\d*\.?\d*)\*?(sin|cos|tan)\(\s*(-?\d*\.?\d*)\*?x\s*([+\-][^)]*)?\)\s*([+\-]\s*\d+(?:\.\d+)?)?/;
  const m = compact.match(re);
  if (!m) return null;

  const aStr = m[1];
  const fn = m[2] as 'sin' | 'cos' | 'tan';
  const bStr = m[3];
  const phaseStr = m[4];
  const dStr = m[5];

  const A = aStr === '' || aStr === '-' || aStr === '+' ? (aStr === '-' ? -1 : 1) : Number(aStr);
  const B = bStr === '' || bStr === '-' || bStr === '+' ? (bStr === '-' ? -1 : 1) : Number(bStr);
  if (!Number.isFinite(A) || !Number.isFinite(B) || B === 0) return null;

  let C = 0;
  if (phaseStr) {
    try {
      C = Number(math.evaluate(phaseStr.replace(/\s+/g, '')));
    } catch {
      C = 0;
    }
  }
  const D = dStr ? Number(dStr.replace(/\s+/g, '')) : 0;

  const amplitude = Math.abs(A);
  const period = (fn === 'tan' ? Math.PI : TWO_PI) / Math.abs(B);
  const phaseShift = -C / B;

  const result = baseResult('trigonometry', normalizedInput, 'mathjs');
  return {
    ...result,
    answer: `amplitude = ${formatNumber(amplitude)}, period = ${formatRadians(period)}, phase shift = ${formatRadians(phaseShift)}, vertical shift = ${formatNumber(D)}`,
    answerLatex: `\\text{amp}=${formatNumber(amplitude)},\\ \\text{period}=${formatRadiansLatex(period)},\\ \\text{phase}=${formatRadiansLatex(phaseShift)},\\ \\text{vshift}=${formatNumber(D)}`,
    explanation: `Parsed y = A·${fn}(B·x + C) + D with A=${formatNumber(A)}, B=${formatNumber(B)}, C=${formatNumber(C)}, D=${formatNumber(D)}.`,
    graphExpr: normalizedInput,
    steps: [
      {
        step: 1,
        description: 'Match the standard form',
        expression: `y = A \\cdot \\${fn}(B x + C) + D`,
        explanation: 'Compare the input against the standard sinusoid form to read off coefficients.',
      },
      {
        step: 2,
        description: 'Read off A, B, C, D',
        expression: `A = ${formatNumber(A)},\\ B = ${formatNumber(B)},\\ C = ${formatNumber(C)},\\ D = ${formatNumber(D)}`,
        explanation: 'A controls amplitude, B controls period, C is the inner phase, D is the vertical shift.',
      },
      {
        step: 3,
        description: 'Apply the standard formulas',
        expression: `\\text{amp}=|A|,\\ \\text{period}=\\frac{${fn === 'tan' ? '\\pi' : '2\\pi'}}{|B|},\\ \\text{phase}=-\\frac{C}{B}`,
        explanation: `${fn === 'tan' ? 'Tangent has period π' : 'Sine and cosine have period 2π'}; phase shift inverts the inner sign.`,
      },
    ],
  };
}

function solveTrigonometry(normalizedInput: string): SolverResult {
  // Specialised problem types — try each before falling through to the
  // generic numeric/identity path. Each returns null when its pattern
  // doesn't match, so the cost is just a few regex tests.
  const trigEq = solveTrigEquation(normalizedInput);
  if (trigEq) return trigEq;
  const lawSines = solveLawOfSines(normalizedInput);
  if (lawSines) return lawSines;
  const lawCos = solveLawOfCosines(normalizedInput);
  if (lawCos) return lawCos;
  const ampPeriod = solveAmplitudePeriod(normalizedInput);
  if (ampPeriod) return ampPeriod;

  const result = baseResult('trigonometry', normalizedInput, 'hybrid');
  const compact = normalizedInput.toLowerCase().replace(/\s+/g, '');
  const exact = exactTrigAnswer(compact);
  const identityMatch = compact.match(/^sin\((.+)\)\^2\+cos\(\1\)\^2$/);

  result.steps.push({
    step: 1,
    description: 'Identify the trigonometric expression',
    expression: expressionToLatex(normalizedInput),
    explanation: 'Start by recognizing whether this is a unit-circle value, an identity, or a numeric evaluation.',
  });

  if (identityMatch) {
    result.steps.push({
      step: 2,
      description: 'Apply the Pythagorean identity',
      expression: `\\sin^2(${expressionToLatex(identityMatch[1])}) + \\cos^2(${expressionToLatex(identityMatch[1])}) = 1`,
      explanation: 'For any angle θ, the identity sin²θ + cos²θ = 1 always holds.',
    });
    result.answer = '1';
    result.answerLatex = '1';
    result.explanation = 'Used the core trigonometric identity sin²θ + cos²θ = 1.';
    return result;
  }

  if (exact) {
    result.steps.push({
      step: 2,
      description: 'Use the unit circle exact value',
      expression: `${expressionToLatex(normalizedInput)} = ${exact.latex}`,
      explanation: exact.explanation,
    });
    result.answer = exact.answer;
    result.answerLatex = exact.latex;
    result.explanation = 'Matched the expression to a standard-angle exact value from the unit circle.';
    result.graphExpr = /x/.test(normalizedInput) ? normalizedInput : undefined;
    return result;
  }

  try {
    const numeric = Number(math.evaluate(normalizedInput));
    result.steps.push({
      step: 2,
      description: 'Evaluate the trigonometric expression',
      expression: `${expressionToLatex(normalizedInput)} = ${expressionToLatex(formatNumber(numeric))}`,
      explanation: 'Evaluate the trig expression numerically when it is not one of the standard exact values.',
    });
    result.answer = formatNumber(numeric);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Evaluated the trigonometric expression numerically.';
    result.graphExpr = /x/.test(normalizedInput) ? normalizedInput : undefined;
    return result;
  } catch (error) {
    return {
      ...result,
      verified: false,
      error: error instanceof Error ? error.message : 'Unsupported trigonometry problem',
      answer: 'Unable to evaluate trig expression',
      answerLatex: '\\text{Unable to evaluate trig expression}',
      explanation: 'Try a direct trig expression like sin(pi/6), tan(pi/4), or a standard identity.',
    };
  }
}

function solveStatisticsProblem(normalizedInput: string): SolverResult {
  const result = baseResult('statistics', normalizedInput, 'mathjs');
  const lower = normalizedInput.toLowerCase();

  const formulaHint = lower.includes('mean')
    ? { formula: '\\bar{x} = \\frac{\\sum x_i}{n}', explanation: 'The mean is the sum of all values divided by the count.' }
    : lower.includes('median')
      ? { formula: '\\text{median} = \\text{middle value after sorting}', explanation: 'Sort the values; the median is the middle one (or average of two middle values).' }
      : lower.includes('variance')
        ? { formula: '\\sigma^2 = \\frac{\\sum (x_i - \\bar{x})^2}{n}', explanation: 'Variance is the average of the squared deviations from the mean.' }
        : lower.includes('std')
          ? { formula: '\\sigma = \\sqrt{\\frac{\\sum (x_i - \\bar{x})^2}{n}}', explanation: 'Standard deviation is the square root of the variance.' }
          : { formula: expressionToLatex(normalizedInput), explanation: 'Apply the statistical formula to the dataset.' };

  result.steps.push({
    step: 1,
    description: 'Identify the statistical measure',
    expression: formulaHint.formula,
    explanation: formulaHint.explanation,
  });

  try {
    const evaluated = math.evaluate(normalizedInput) as number;
    const numericResult = Number(evaluated);
    if (!Number.isFinite(numericResult)) {
      throw new Error('Result is not a finite number');
    }
    result.steps.push({
      step: 2,
      description: 'Apply to the dataset',
      expression: `${expressionToLatex(normalizedInput)} = ${expressionToLatex(formatNumber(numericResult))}`,
      explanation: 'Substitute the dataset values into the formula and compute.',
    });
    result.answer = formatNumber(numericResult);
    result.answerLatex = expressionToLatex(result.answer);
    result.explanation = 'Computed the requested statistic directly from the dataset.';
    return result;
  } catch (error) {
    return {
      ...result,
      verified: false,
      error: error instanceof Error ? error.message : 'Could not evaluate statistics expression',
      answer: 'Unable to evaluate',
      answerLatex: '\\text{Unable to evaluate}',
      explanation: 'Try: mean([4,7,13,2,8]), median([1,2,3,4,5]), std([4,7,13,2,8]), variance([4,7,13,2,8])',
    };
  }
}

function solveTransform(normalizedInput: string): SolverResult {
  const result = baseResult('algebra', normalizedInput, 'nerdamer');
  const transform = normalizedInput.split(' ')[0].toLowerCase();
  const expression = normalizedInput.slice(transform.length).trim();

  result.steps.push({
    step: 1,
    description: 'Start with the original expression',
    expression: expressionToLatex(expression),
    explanation: 'Write the expression before applying any symbolic transformation.',
  });

  let transformed = expression;
  if (transform === 'simplify') transformed = nerdamer(expression).toString();
  if (transform === 'expand') transformed = nerdamer(expression).expand().toString();
  if (transform === 'factor') transformed = nerdamer.factor(expression).toString();

  result.steps.push({
    step: 2,
    description: `Apply ${transform}`,
    expression: `${expressionToLatex(expression)} = ${expressionToLatex(transformed)}`,
    explanation: `Use symbolic ${transform} rules to rewrite the expression more cleanly.`,
  });

  result.answer = transformed;
  result.answerLatex = expressionToLatex(transformed);
  result.explanation = `Applied ${transform} to the expression.`;
  result.graphExpr = deriveGraphExpression(transformed, 'algebra');
  return result;
}

function solveDifferentialEquation(normalizedInput: string): SolverResult {
  const result = baseResult('differential-equations', normalizedInput, 'hybrid');
  // Strip common leading keywords
  const rawInput = normalizedInput.replace(/^(solve|find|calculate|compute)\s+/i, '').trim();

  // Helper: parse a coefficient string like '', '+', '-', '3', '-2', '+2*'
  const parseCoeff = (s: string): number => {
    const t = s.replace(/\s|\*/g, '');
    if (!t || t === '+') return 1;
    if (t === '-') return -1;
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 1;
  };

  // 2nd order homogeneous: ay'' + by' + cy = 0
  // After normalisation, coefficients get * inserted: "3*y''" etc.
  const ho2 = rawInput.match(
    /^([-\d.]*)\s*\*?\s*y''\s*(?:([+-]\s*[\d.]*)\s*\*?\s*y'\s*)?([+-]\s*[\d.]*)\s*\*?\s*y\s*=\s*0\s*$/i,
  );
  if (ho2) {
    const a = parseCoeff(ho2[1]);
    const b = ho2[2] !== undefined ? parseCoeff(ho2[2]) : 0;
    const c = parseCoeff(ho2[3]);
    const disc = b * b - 4 * a * c;

    const charEq = `${a === 1 ? '' : formatNumber(a)}r^{2}${b >= 0 ? ' + ' : ' - '}${Math.abs(b) === 1 ? '' : formatNumber(Math.abs(b))}r${c >= 0 ? ' + ' : ' - '}${formatNumber(Math.abs(c))} = 0`;
    result.steps.push({
      step: 1,
      description: 'Assume solution y = e^{rx} and write the characteristic equation',
      expression: charEq,
      explanation: 'Substituting y = e^{rx} converts the ODE into an algebraic characteristic equation.',
    });
    result.steps.push({
      step: 2,
      description: 'Apply the quadratic formula',
      expression: `r = \\frac{${formatNumber(-b)} \\pm \\sqrt{${formatNumber(disc)}}}{${formatNumber(2 * a)}}`,
      explanation: `Discriminant Δ = b² − 4ac = ${formatNumber(b)}² − 4(${formatNumber(a)})(${formatNumber(c)}) = ${formatNumber(disc)}.`,
    });

    let answer = '';
    let answerLatex = '';
    if (disc > 1e-9) {
      const r1 = (-b + Math.sqrt(disc)) / (2 * a);
      const r2 = (-b - Math.sqrt(disc)) / (2 * a);
      result.steps.push({
        step: 3,
        description: 'Two distinct real roots',
        expression: `r_1 = ${formatNumber(r1)}, \\quad r_2 = ${formatNumber(r2)}`,
        explanation: 'Δ > 0 gives two distinct real roots, producing two independent exponential solutions.',
      });
      result.steps.push({
        step: 4,
        description: 'Write the general solution',
        expression: `y = C_1 e^{${formatNumber(r1)}x} + C_2 e^{${formatNumber(r2)}x}`,
        explanation: 'The general solution is a linear combination of the two independent solutions.',
      });
      answer = `y = C1·e^(${formatNumber(r1)}x) + C2·e^(${formatNumber(r2)}x)`;
      answerLatex = `y = C_1 e^{${formatNumber(r1)}x} + C_2 e^{${formatNumber(r2)}x}`;
    } else if (Math.abs(disc) <= 1e-9) {
      const r = -b / (2 * a);
      result.steps.push({
        step: 3,
        description: 'Repeated root (Δ = 0)',
        expression: `r = ${formatNumber(r)}`,
        explanation: 'One repeated root. The second independent solution is x·e^{rx}.',
      });
      result.steps.push({
        step: 4,
        description: 'Write the general solution',
        expression: `y = (C_1 + C_2 x)e^{${formatNumber(r)}x}`,
        explanation: 'With a double root the solution uses (C₁ + C₂x)e^{rx}.',
      });
      answer = `y = (C1 + C2·x)·e^(${formatNumber(r)}x)`;
      answerLatex = `y = (C_1 + C_2 x)e^{${formatNumber(r)}x}`;
    } else {
      const alpha = -b / (2 * a);
      const beta = Math.sqrt(-disc) / (2 * a);
      result.steps.push({
        step: 3,
        description: 'Complex conjugate roots (Δ < 0)',
        expression: `r = ${formatNumber(alpha)} \\pm ${formatNumber(beta)}i`,
        explanation: `α = -b/(2a) = ${formatNumber(alpha)}, β = √|Δ|/(2a) = ${formatNumber(beta)}.`,
      });
      result.steps.push({
        step: 4,
        description: "Apply Euler's formula",
        expression: `y = e^{${formatNumber(alpha)}x}\\!\\left(C_1 \\cos(${formatNumber(beta)}x) + C_2 \\sin(${formatNumber(beta)}x)\\right)`,
        explanation: "Euler's formula e^{(α+βi)x} = e^{αx}(cos βx + i sin βx) gives the real-valued general solution.",
      });
      answer = `y = e^(${formatNumber(alpha)}x)·[C1·cos(${formatNumber(beta)}x) + C2·sin(${formatNumber(beta)}x)]`;
      answerLatex = `y = e^{${formatNumber(alpha)}x}\\!\\left(C_1\\cos(${formatNumber(beta)}x)+C_2\\sin(${formatNumber(beta)}x)\\right)`;
    }
    result.answer = answer;
    result.answerLatex = answerLatex;
    result.explanation = 'Solved the 2nd-order homogeneous ODE using the characteristic equation method.';
    return result;
  }

  // 1st order exponential: y' = k*y
  const expMatch = rawInput.match(/^(?:y'|dy\/dx)\s*=\s*([-\d.]*)\s*\*?\s*y\s*$/i);
  if (expMatch) {
    const kStr = expMatch[1].replace(/\s/g, '');
    const k = !kStr || kStr === '+' ? 1 : kStr === '-' ? -1 : parseFloat(kStr);
    if (Number.isFinite(k)) {
      result.steps.push({
        step: 1,
        description: 'Identify the exponential ODE',
        expression: `\\frac{dy}{dx} = ${formatNumber(k)}y`,
        explanation: `dy/dx = ky is the standard growth/decay ODE. k = ${formatNumber(k)}.`,
      });
      result.steps.push({
        step: 2,
        description: 'Separate variables',
        expression: `\\frac{dy}{y} = ${formatNumber(k)}\\,dx`,
        explanation: 'Divide both sides by y and write dx on the right.',
      });
      result.steps.push({
        step: 3,
        description: 'Integrate both sides',
        expression: `\\ln|y| = ${formatNumber(k)}x + C_0`,
        explanation: '∫ dy/y = ln|y|, ∫ k dx = kx.',
      });
      result.steps.push({
        step: 4,
        description: 'Exponentiate and absorb the constant',
        expression: `y = Ce^{${formatNumber(k)}x}`,
        explanation: 'e^{ln|y|} = |y|, so y = ±e^{C₀}·e^{kx} = Ce^{kx} where C absorbs the ± and e^{C₀}.',
      });
      result.answer = `y = C·e^(${formatNumber(k)}x)`;
      result.answerLatex = `y = Ce^{${formatNumber(k)}x}`;
      result.explanation = 'Solved y\' = ky by separating variables; the solution is exponential.';
      return result;
    }
  }

  // 1st order: dy/dx = f(x) — direct integration (no y on RHS)
  const directMatch = rawInput.match(/^(?:y'|dy\/dx)\s*=\s*(.+)$/i);
  if (directMatch) {
    const rhs = directMatch[1].trim();
    if (!/\by\b/i.test(rhs)) {
      result.steps.push({
        step: 1,
        description: 'Identify as a directly integrable ODE',
        expression: `\\frac{dy}{dx} = ${expressionToLatex(rhs)}`,
        explanation: 'The RHS depends only on x, so integrate both sides directly.',
      });
      try {
        const integral = nerdamer(`integrate(${rhs}, x)`).toString();
        result.steps.push({
          step: 2,
          description: 'Integrate the right-hand side',
          expression: `y = \\int ${expressionToLatex(rhs)}\\,dx = ${expressionToLatex(integral)} + C`,
          explanation: 'Add the constant of integration C for the general solution.',
        });
        result.answer = `y = ${integral} + C`;
        result.answerLatex = `y = ${expressionToLatex(integral)} + C`;
      } catch {
        result.steps.push({
          step: 2,
          description: 'Write the integral form',
          expression: `y = \\int ${expressionToLatex(rhs)}\\,dx + C`,
          explanation: 'Integrate the RHS to get y.',
        });
        result.answer = `y = ∫(${rhs}) dx + C`;
        result.answerLatex = `y = \\int ${expressionToLatex(rhs)}\\,dx + C`;
      }
      result.explanation = 'Solved the first-order ODE by direct integration.';
      return result;
    }
  }

  // 1st order linear: y' + P*y = Q (constant coefficients)
  const folMatch = rawInput.match(/^y'\s*([+-]\s*[\d.]+\s*\*?)\s*y\s*=\s*([-\d.]+)\s*$/i);
  if (folMatch) {
    const P = parseFloat(folMatch[1].replace(/\s|\*/g, ''));
    const Q = parseFloat(folMatch[2]);
    if (Number.isFinite(P) && Number.isFinite(Q)) {
      result.steps.push({
        step: 1,
        description: 'Write in standard linear form y\' + P·y = Q',
        expression: `y' + ${formatNumber(P)}y = ${formatNumber(Q)}`,
        explanation: 'P = ' + formatNumber(P) + ' and Q = ' + formatNumber(Q) + ' are constants.',
      });
      result.steps.push({
        step: 2,
        description: 'Compute the integrating factor μ = e^{∫P dx}',
        expression: `\\mu(x) = e^{${formatNumber(P)}x}`,
        explanation: 'Multiplying by μ turns the left side into d/dx[μy].',
      });
      result.steps.push({
        step: 3,
        description: 'Multiply both sides by μ and integrate',
        expression: `\\frac{d}{dx}\\!\\left[e^{${formatNumber(P)}x}y\\right] = ${formatNumber(Q)}e^{${formatNumber(P)}x} \\implies e^{${formatNumber(P)}x}y = \\frac{${formatNumber(Q)}}{${formatNumber(P)}}e^{${formatNumber(P)}x} + C`,
        explanation: 'Integrate both sides with respect to x.',
      });
      const particular = Q / P;
      result.steps.push({
        step: 4,
        description: 'Divide by μ to isolate y',
        expression: `y = ${formatNumber(particular)} + Ce^{-${formatNumber(P)}x}`,
        explanation: `Particular solution is Q/P = ${formatNumber(particular)}; homogeneous part is Ce^{-Px}.`,
      });
      result.answer = `y = ${formatNumber(particular)} + C·e^(-${formatNumber(P)}x)`;
      result.answerLatex = `y = ${formatNumber(particular)} + Ce^{-${formatNumber(P)}x}`;
      result.explanation = 'Solved the first-order linear ODE using the integrating factor method.';
      return result;
    }
  }

  // Fallback — show supported forms
  result.verified = false;
  result.steps.push({
    step: 1,
    description: 'Supported differential equation forms',
    expression: `y'' + py' + qy = 0 \\qquad y' = ky \\qquad y' + py = q \\qquad \\tfrac{dy}{dx} = f(x)`,
    explanation: 'Enter a 2nd-order homogeneous ODE, an exponential ODE, or a 1st-order linear ODE.',
  });
  result.answer = "Try: y'' + 3y' + 2y = 0  |  y' = -2y  |  dy/dx = 3x^2";
  result.answerLatex = "\\text{Try: } y'' + 3y' + 2y = 0 \\text{ or } y' = -2y";
  result.explanation = 'Input a recognized ODE format to get a step-by-step solution.';
  return result;
}

function solveDiscreteMath(normalizedInput: string): SolverResult {
  const result = baseResult('discrete', normalizedInput, 'mathjs');
  const rawInput = normalizedInput.replace(/^(solve|find|calculate|compute)\s+/i, '').trim();
  const lower = rawInput.toLowerCase();

  // GCD: gcd(a, b) — Euclidean algorithm
  const gcdMatch = lower.match(/^gcd\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/);
  if (gcdMatch) {
    let a = Math.abs(parseInt(gcdMatch[1]));
    let b = Math.abs(parseInt(gcdMatch[2]));
    const origA = a, origB = b;
    result.steps.push({
      step: 1,
      description: 'Set up the Euclidean algorithm',
      expression: `\\gcd(${origA},\\,${origB})`,
      explanation: 'GCD(a, b): repeatedly replace (a, b) with (b, a mod b) until b = 0.',
    });
    let stepNum = 2;
    const maxSteps = 20;
    while (b !== 0 && stepNum <= maxSteps) {
      const q = Math.floor(a / b);
      const r = a % b;
      result.steps.push({
        step: stepNum++,
        description: `Apply division: ${a} = ${b} × ${q} + ${r}`,
        expression: `${a} = ${b} \\times ${q} + ${r} \\implies \\gcd(${a},${b}) = \\gcd(${b},${r})`,
        explanation: `Replace (${a}, ${b}) with (${b}, ${r}).`,
      });
      a = b;
      b = r;
    }
    result.steps.push({
      step: stepNum,
      description: 'Remainder is 0 — algorithm terminates',
      expression: `\\gcd(${origA},\\,${origB}) = ${a}`,
      explanation: `When the remainder reaches 0, the last non-zero remainder is the GCD.`,
    });
    result.answer = String(a);
    result.answerLatex = `\\gcd(${origA},\\,${origB}) = ${a}`;
    result.explanation = `GCD of ${origA} and ${origB} found by the Euclidean algorithm.`;
    return result;
  }

  // LCM: lcm(a, b)
  const lcmMatch = lower.match(/^lcm\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/);
  if (lcmMatch) {
    const a = Math.abs(parseInt(lcmMatch[1]));
    const b = Math.abs(parseInt(lcmMatch[2]));
    const gcdFn = (x: number, y: number): number => (y === 0 ? x : gcdFn(y, x % y));
    const g = gcdFn(a, b);
    const lcmVal = (a / g) * b;
    result.steps.push({
      step: 1,
      description: 'Use the relationship LCM × GCD = a × b',
      expression: `\\text{lcm}(a,b) = \\frac{a \\times b}{\\gcd(a,b)}`,
      explanation: 'This avoids computing prime factorisations.',
    });
    result.steps.push({
      step: 2,
      description: 'Find GCD first',
      expression: `\\gcd(${a}, ${b}) = ${g}`,
      explanation: 'Apply the Euclidean algorithm.',
    });
    result.steps.push({
      step: 3,
      description: 'Compute LCM',
      expression: `\\text{lcm}(${a},${b}) = \\frac{${a} \\times ${b}}{${g}} = ${lcmVal}`,
      explanation: `LCM = (${a} × ${b}) / ${g} = ${lcmVal}.`,
    });
    result.answer = String(lcmVal);
    result.answerLatex = `\\text{lcm}(${a},${b}) = ${lcmVal}`;
    result.explanation = `LCM of ${a} and ${b} is ${lcmVal}.`;
    return result;
  }

  // Combinations: C(n, k) or nCr(n,k) or combinations(n,k)
  const combMatch = lower.match(/^(?:c\(|ncr\(|combinations?\()(-?\d+)\s*,\s*(-?\d+)\)$/);
  if (combMatch) {
    const n = parseInt(combMatch[1]);
    const k = parseInt(combMatch[2]);
    if (n < 0 || k < 0 || k > n) {
      return { ...result, verified: false, answer: 'Invalid: need 0 ≤ k ≤ n', answerLatex: '\\text{Invalid: need } 0 \\le k \\le n', explanation: 'Combinations require 0 ≤ k ≤ n.' };
    }
    const factFn = (x: number): number => (x <= 1 ? 1 : x * factFn(x - 1));
    const nFact = factFn(n), kFact = factFn(k), nkFact = factFn(n - k);
    const val = nFact / (kFact * nkFact);
    result.steps.push({
      step: 1,
      description: 'Write the combination formula',
      expression: `\\binom{n}{k} = \\frac{n!}{k!\\,(n-k)!}`,
      explanation: `C(n, k) counts the ways to choose k items from n items where order does not matter.`,
    });
    result.steps.push({
      step: 2,
      description: 'Substitute n = ' + n + ', k = ' + k,
      expression: `\\binom{${n}}{${k}} = \\frac{${n}!}{${k}!\\cdot${n - k}!}`,
      explanation: `n = ${n}, k = ${k}, n − k = ${n - k}.`,
    });
    result.steps.push({
      step: 3,
      description: 'Evaluate the factorials',
      expression: `= \\frac{${nFact}}{${kFact} \\times ${nkFact}} = ${val}`,
      explanation: `${n}! = ${nFact}, ${k}! = ${kFact}, ${n - k}! = ${nkFact}.`,
    });
    result.answer = String(val);
    result.answerLatex = `\\binom{${n}}{${k}} = ${val}`;
    result.explanation = `C(${n}, ${k}) = ${val} ways to choose ${k} from ${n}.`;
    return result;
  }

  // Permutations: P(n, k) or nPr(n,k) or permutations(n,k)
  const permMatch = lower.match(/^(?:p\(|npr\(|permutations?\()(-?\d+)\s*,\s*(-?\d+)\)$/);
  if (permMatch) {
    const n = parseInt(permMatch[1]);
    const k = parseInt(permMatch[2]);
    if (n < 0 || k < 0 || k > n) {
      return { ...result, verified: false, answer: 'Invalid: need 0 ≤ k ≤ n', answerLatex: '\\text{Invalid: need } 0 \\le k \\le n', explanation: 'Permutations require 0 ≤ k ≤ n.' };
    }
    const factFn = (x: number): number => (x <= 1 ? 1 : x * factFn(x - 1));
    const nFact = factFn(n), nkFact = factFn(n - k);
    const val = nFact / nkFact;
    result.steps.push({
      step: 1,
      description: 'Write the permutation formula',
      expression: `P(n,k) = \\frac{n!}{(n-k)!}`,
      explanation: 'P(n, k) counts ordered arrangements of k items chosen from n.',
    });
    result.steps.push({
      step: 2,
      description: 'Substitute n = ' + n + ', k = ' + k,
      expression: `P(${n},${k}) = \\frac{${n}!}{(${n}-${k})!} = \\frac{${nFact}}{${nkFact}}`,
      explanation: `${n}! = ${nFact}, (${n} − ${k})! = ${nkFact}.`,
    });
    result.steps.push({
      step: 3,
      description: 'Evaluate',
      expression: `P(${n},${k}) = ${val}`,
      explanation: `${nFact} / ${nkFact} = ${val} ordered arrangements.`,
    });
    result.answer = String(val);
    result.answerLatex = `P(${n},${k}) = ${val}`;
    result.explanation = `P(${n}, ${k}) = ${val} ordered arrangements.`;
    return result;
  }

  // Fibonacci: fibonacci(n) or F(n) or fib(n)
  const fibMatch = lower.match(/^(?:fibonacci|fib|f)\s*\(\s*(\d+)\s*\)$/);
  if (fibMatch) {
    const n = parseInt(fibMatch[1]);
    if (n < 0 || n > 50) {
      return { ...result, verified: false, answer: 'n must be between 0 and 50', answerLatex: '\\text{n must be between 0 and 50}', explanation: 'Input n in range 0–50.' };
    }
    let a = 0, b = 1;
    const seq: number[] = [0, 1];
    for (let i = 2; i <= n; i++) { [a, b] = [b, a + b]; seq.push(b); }
    const val = n === 0 ? 0 : n === 1 ? 1 : b;
    result.steps.push({
      step: 1,
      description: 'Fibonacci recurrence: F(n) = F(n−1) + F(n−2)',
      expression: 'F(0)=0,\\quad F(1)=1,\\quad F(n)=F(n-1)+F(n-2)',
      explanation: 'Each term is the sum of the two preceding terms.',
    });
    result.steps.push({
      step: 2,
      description: 'Compute iteratively',
      expression: seq.slice(0, Math.min(seq.length, 12)).map((v, i) => `F(${i})=${v}`).join(',\\;') + (seq.length > 12 ? ',\\;\\ldots' : ''),
      explanation: `Computing term by term up to n = ${n}.`,
    });
    result.steps.push({
      step: 3,
      description: 'Read off the result',
      expression: `F(${n}) = ${val}`,
      explanation: `The ${n}th Fibonacci number is ${val}.`,
    });
    result.answer = String(val);
    result.answerLatex = `F(${n}) = ${val}`;
    result.explanation = `The ${n}th Fibonacci number is ${val}.`;
    return result;
  }

  // Modular arithmetic: a mod m or a^b mod m
  const modExpMatch = lower.match(/^(\d+)\s*\^\s*(\d+)\s*mod\s*(\d+)$/);
  if (modExpMatch) {
    const base = parseInt(modExpMatch[1]);
    const exp = parseInt(modExpMatch[2]);
    const mod = parseInt(modExpMatch[3]);
    // Fast exponentiation
    let res = 1, b2 = base % mod, e = exp;
    const steps2: string[] = [];
    while (e > 0) {
      if (e % 2 === 1) { res = (res * b2) % mod; steps2.push(`result × ${b2} mod ${mod} = ${res}`); }
      b2 = (b2 * b2) % mod;
      e = Math.floor(e / 2);
    }
    result.steps.push({
      step: 1,
      description: 'Use fast modular exponentiation',
      expression: `${base}^{${exp}} \\bmod ${mod}`,
      explanation: 'Repeated squaring computes modular powers efficiently without evaluating large numbers.',
    });
    result.steps.push({
      step: 2,
      description: 'Squaring and reducing steps',
      expression: steps2.slice(0, 6).map((s) => `\\text{${s}}`).join(',\\;'),
      explanation: 'At each step, square the current base mod m; multiply into result when bit is 1.',
    });
    result.steps.push({
      step: 3,
      description: 'Final result',
      expression: `${base}^{${exp}} \\equiv ${res} \\pmod{${mod}}`,
      explanation: `${base}^${exp} mod ${mod} = ${res}.`,
    });
    result.answer = String(res);
    result.answerLatex = `${base}^{${exp}} \\equiv ${res} \\pmod{${mod}}`;
    result.explanation = `${base}^${exp} mod ${mod} = ${res}.`;
    return result;
  }

  const modMatch = lower.match(/^(\d+)\s*mod\s*(\d+)$/);
  if (modMatch) {
    const a2 = parseInt(modMatch[1]);
    const m2 = parseInt(modMatch[2]);
    const q = Math.floor(a2 / m2);
    const r2 = a2 % m2;
    result.steps.push({
      step: 1,
      description: 'Write the division algorithm: a = q·m + r',
      expression: `${a2} = ${q} \\times ${m2} + ${r2}`,
      explanation: `Divide ${a2} by ${m2}: quotient q = ${q}, remainder r = ${r2}.`,
    });
    result.steps.push({
      step: 2,
      description: 'The remainder is the modulo result',
      expression: `${a2} \\bmod ${m2} = ${r2}`,
      explanation: `a mod m = a − m·⌊a/m⌋ = ${a2} − ${m2}·${q} = ${r2}.`,
    });
    result.answer = String(r2);
    result.answerLatex = `${a2} \\bmod ${m2} = ${r2}`;
    result.explanation = `${a2} mod ${m2} = ${r2}.`;
    return result;
  }

  // Fallback
  result.verified = false;
  result.steps.push({
    step: 1,
    description: 'Supported discrete math inputs',
    expression: `\\gcd(48,18) \\quad \\text{lcm}(12,18) \\quad C(10,3) \\quad P(5,2) \\quad F(10) \\quad 2^{10} \\bmod 7`,
    explanation: 'Try GCD, LCM, combinations, permutations, Fibonacci, or modular arithmetic.',
  });
  result.answer = 'Try: gcd(48,18)  C(10,3)  fibonacci(10)  2^10 mod 7';
  result.answerLatex = '\\text{Try: gcd(48,18) or C(10,3) or fibonacci(10)}';
  result.explanation = 'Enter a recognised discrete math expression.';
  return result;
}

function solvePhysics(normalizedInput: string): SolverResult {
  const result = baseResult('physics', normalizedInput, 'mathjs');
  const rawInput = normalizedInput.replace(/^(solve|find|calculate|compute)\s+/i, '').trim();
  const lower = rawInput.toLowerCase();

  // Helper: extract named param from input, e.g. "v=50" or "v = 50"
  const getParam = (name: string): number | null => {
    const m = lower.match(new RegExp(`${name}\\s*=\\s*(-?[\\d.]+)`));
    return m ? parseFloat(m[1]) : null;
  };

  // Ohm's Law: V = I*R — solve for missing variable
  if (/\bohm\b|v\s*=\s*i\s*\*?\s*r|voltage|resistance|current/i.test(lower)) {
    const V = getParam('v');
    const I = getParam('i');
    const R = getParam('r');
    result.steps.push({
      step: 1,
      description: "Ohm's Law formula",
      expression: 'V = I \\times R',
      explanation: "Ohm's Law relates voltage (V), current (I), and resistance (R).",
    });
    if (V !== null && I !== null && R === null) {
      const Rc = V / I;
      result.steps.push({ step: 2, description: 'Solve for R', expression: `R = \\frac{V}{I} = \\frac{${V}}{${I}} = ${formatNumber(Rc)}\\,\\Omega`, explanation: 'Divide voltage by current.' });
      result.answer = `R = ${formatNumber(Rc)} Ω`; result.answerLatex = `R = ${formatNumber(Rc)}\\,\\Omega`; result.explanation = `Resistance R = ${formatNumber(Rc)} Ω.`;
    } else if (V !== null && R !== null && I === null) {
      const Ic = V / R;
      result.steps.push({ step: 2, description: 'Solve for I', expression: `I = \\frac{V}{R} = \\frac{${V}}{${R}} = ${formatNumber(Ic)}\\,\\text{A}`, explanation: 'Divide voltage by resistance.' });
      result.answer = `I = ${formatNumber(Ic)} A`; result.answerLatex = `I = ${formatNumber(Ic)}\\,\\text{A}`; result.explanation = `Current I = ${formatNumber(Ic)} A.`;
    } else if (I !== null && R !== null && V === null) {
      const Vc = I * R;
      result.steps.push({ step: 2, description: 'Solve for V', expression: `V = I \\times R = ${I} \\times ${R} = ${formatNumber(Vc)}\\,\\text{V}`, explanation: 'Multiply current by resistance.' });
      result.answer = `V = ${formatNumber(Vc)} V`; result.answerLatex = `V = ${formatNumber(Vc)}\\,\\text{V}`; result.explanation = `Voltage V = ${formatNumber(Vc)} V.`;
    } else {
      result.steps.push({ step: 2, description: 'Enter two known values', expression: 'V=12\\,I=3 \\;\\text{ or }\\; V=12\\,R=4 \\;\\text{ or }\\; I=3\\,R=4', explanation: 'Provide any two of V, I, R to solve for the third.' });
      result.verified = false; result.answer = 'Provide two of: V=..., I=..., R=...'; result.answerLatex = "\\text{Provide two of V, I, R}";
    }
    result.explanation = result.explanation || "Ohm's Law V = IR.";
    return result;
  }

  // Kinetic Energy: KE = ½mv²
  if (/\bke\b|kinetic\s*energy|½\s*m|0\.5\s*m/i.test(lower)) {
    const m = getParam('m');
    const v = getParam('v');
    const ke = getParam('ke');
    result.steps.push({
      step: 1,
      description: 'Kinetic energy formula',
      expression: 'KE = \\frac{1}{2}mv^2',
      explanation: 'Kinetic energy depends on mass m (kg) and speed v (m/s).',
    });
    if (m !== null && v !== null) {
      const keVal = 0.5 * m * v * v;
      result.steps.push({ step: 2, description: 'Substitute values', expression: `KE = \\frac{1}{2} \\times ${m} \\times ${v}^2 = \\frac{1}{2} \\times ${m} \\times ${v * v} = ${formatNumber(keVal)}\\,\\text{J}`, explanation: `m = ${m} kg, v = ${v} m/s.` });
      result.answer = `KE = ${formatNumber(keVal)} J`; result.answerLatex = `KE = ${formatNumber(keVal)}\\,\\text{J}`; result.explanation = `KE = ${formatNumber(keVal)} J.`;
    } else if (ke !== null && m !== null) {
      const vVal = Math.sqrt((2 * ke) / m);
      result.steps.push({ step: 2, description: 'Solve for v', expression: `v = \\sqrt{\\frac{2\\cdot KE}{m}} = \\sqrt{\\frac{2 \\times ${ke}}{${m}}} = ${formatNumber(vVal)}\\,\\text{m/s}`, explanation: 'Rearrange KE = ½mv².' });
      result.answer = `v = ${formatNumber(vVal)} m/s`; result.answerLatex = `v = ${formatNumber(vVal)}\\,\\text{m/s}`; result.explanation = `Speed v = ${formatNumber(vVal)} m/s.`;
    } else if (ke !== null && v !== null) {
      const mVal = (2 * ke) / (v * v);
      result.steps.push({ step: 2, description: 'Solve for m', expression: `m = \\frac{2\\cdot KE}{v^2} = \\frac{2 \\times ${ke}}{${v}^2} = ${formatNumber(mVal)}\\,\\text{kg}`, explanation: 'Rearrange KE = ½mv².' });
      result.answer = `m = ${formatNumber(mVal)} kg`; result.answerLatex = `m = ${formatNumber(mVal)}\\,\\text{kg}`; result.explanation = `Mass m = ${formatNumber(mVal)} kg.`;
    } else {
      result.verified = false; result.answer = 'Provide two of: m=..., v=..., KE=...'; result.answerLatex = '\\text{Provide two of m, v, KE}'; result.explanation = 'KE = ½mv².';
      result.steps.push({ step: 2, description: 'Example', expression: 'KE\\;m=10\\;v=5 \\implies KE = 250\\,\\text{J}', explanation: 'Provide m and v to compute KE.' });
    }
    return result;
  }

  // Projectile Range: R = v₀²sin(2θ)/g
  if (/projectile|range.*theta|range.*angle|v.*theta/i.test(lower)) {
    const v0 = getParam('v') ?? getParam('v0');
    const theta = getParam('theta') ?? getParam('angle');
    const g = getParam('g') ?? 9.81;
    result.steps.push({
      step: 1,
      description: 'Projectile range formula',
      expression: 'R = \\frac{v_0^2 \\sin(2\\theta)}{g}',
      explanation: 'R is the horizontal range for a projectile launched at angle θ with speed v₀ (g ≈ 9.81 m/s²).',
    });
    if (v0 !== null && theta !== null) {
      const thetaRad = theta * Math.PI / 180;
      const R = (v0 * v0 * Math.sin(2 * thetaRad)) / g;
      result.steps.push({ step: 2, description: 'Substitute values', expression: `R = \\frac{${v0}^2 \\times \\sin(2 \\times ${theta}^\\circ)}{${formatNumber(g)}} = \\frac{${formatNumber(v0 * v0)} \\times ${formatNumber(Math.sin(2 * thetaRad))}}{${formatNumber(g)}}`, explanation: `θ = ${theta}° = ${formatNumber(thetaRad)} rad.` });
      result.steps.push({ step: 3, description: 'Compute range', expression: `R = ${formatNumber(R)}\\,\\text{m}`, explanation: `At ${theta}°, range = ${formatNumber(R)} m.` });
      result.answer = `R = ${formatNumber(R)} m`; result.answerLatex = `R = ${formatNumber(R)}\\,\\text{m}`; result.explanation = `Projectile range = ${formatNumber(R)} m.`;
    } else {
      result.verified = false; result.answer = 'Provide v=... theta=... (and optionally g=...)'; result.answerLatex = '\\text{Provide v and theta}'; result.explanation = 'Example: projectile v=50 theta=45';
      result.steps.push({ step: 2, description: 'Example', expression: 'v_0=50\\,\\text{m/s},\\;\\theta=45^\\circ \\implies R \\approx 255\\,\\text{m}', explanation: '45° gives maximum range.' });
    }
    return result;
  }

  // Wave Speed: v = f·λ
  if (/wave|freq|wavelength|lambda/i.test(lower)) {
    const f = getParam('f');
    const lambda = getParam('lambda') ?? getParam('wavelength') ?? getParam('l');
    const wv = getParam('v') ?? getParam('wave');
    result.steps.push({
      step: 1,
      description: 'Wave speed formula',
      expression: 'v = f \\times \\lambda',
      explanation: 'Wave speed v (m/s) equals frequency f (Hz) times wavelength λ (m).',
    });
    if (f !== null && lambda !== null) {
      const speed = f * lambda;
      result.steps.push({ step: 2, description: 'Substitute', expression: `v = ${f} \\times ${lambda} = ${formatNumber(speed)}\\,\\text{m/s}`, explanation: '' });
      result.answer = `v = ${formatNumber(speed)} m/s`; result.answerLatex = `v = ${formatNumber(speed)}\\,\\text{m/s}`; result.explanation = `Wave speed = ${formatNumber(speed)} m/s.`;
    } else if (wv !== null && f !== null) {
      const lVal = wv / f;
      result.steps.push({ step: 2, description: 'Solve for λ', expression: `\\lambda = \\frac{v}{f} = \\frac{${wv}}{${f}} = ${formatNumber(lVal)}\\,\\text{m}`, explanation: '' });
      result.answer = `λ = ${formatNumber(lVal)} m`; result.answerLatex = `\\lambda = ${formatNumber(lVal)}\\,\\text{m}`; result.explanation = `Wavelength = ${formatNumber(lVal)} m.`;
    } else if (wv !== null && lambda !== null) {
      const fVal = wv / lambda;
      result.steps.push({ step: 2, description: 'Solve for f', expression: `f = \\frac{v}{\\lambda} = \\frac{${wv}}{${lambda}} = ${formatNumber(fVal)}\\,\\text{Hz}`, explanation: '' });
      result.answer = `f = ${formatNumber(fVal)} Hz`; result.answerLatex = `f = ${formatNumber(fVal)}\\,\\text{Hz}`; result.explanation = `Frequency = ${formatNumber(fVal)} Hz.`;
    } else {
      result.verified = false; result.answer = 'Provide two of: f=..., lambda=..., v=...'; result.answerLatex = '\\text{Provide two of f, lambda, v}'; result.explanation = 'v = fλ.';
      result.steps.push({ step: 2, description: 'Example', expression: 'f=440\\;\\lambda=0.78 \\implies v \\approx 343\\,\\text{m/s}', explanation: 'Standard A440 Hz tone in air.' });
    }
    return result;
  }

  // Newton's Second Law: F = ma
  if (/\bf\s*=\s*m\s*a\b|force|newton|acceleration|\bma\b/i.test(lower)) {
    const F = getParam('f');
    const m2 = getParam('m');
    const a2 = getParam('a');
    result.steps.push({
      step: 1,
      description: "Newton's Second Law",
      expression: 'F = m \\times a',
      explanation: 'Force (N) = mass (kg) × acceleration (m/s²).',
    });
    if (m2 !== null && a2 !== null) {
      const Fv = m2 * a2;
      result.steps.push({ step: 2, description: 'Compute F', expression: `F = ${m2} \\times ${a2} = ${formatNumber(Fv)}\\,\\text{N}`, explanation: '' });
      result.answer = `F = ${formatNumber(Fv)} N`; result.answerLatex = `F = ${formatNumber(Fv)}\\,\\text{N}`; result.explanation = `Force = ${formatNumber(Fv)} N.`;
    } else if (F !== null && m2 !== null) {
      const av = F / m2;
      result.steps.push({ step: 2, description: 'Solve for a', expression: `a = \\frac{F}{m} = \\frac{${F}}{${m2}} = ${formatNumber(av)}\\,\\text{m/s}^2`, explanation: '' });
      result.answer = `a = ${formatNumber(av)} m/s²`; result.answerLatex = `a = ${formatNumber(av)}\\,\\text{m/s}^2`; result.explanation = `Acceleration = ${formatNumber(av)} m/s².`;
    } else if (F !== null && a2 !== null) {
      const mv = F / a2;
      result.steps.push({ step: 2, description: 'Solve for m', expression: `m = \\frac{F}{a} = \\frac{${F}}{${a2}} = ${formatNumber(mv)}\\,\\text{kg}`, explanation: '' });
      result.answer = `m = ${formatNumber(mv)} kg`; result.answerLatex = `m = ${formatNumber(mv)}\\,\\text{kg}`; result.explanation = `Mass = ${formatNumber(mv)} kg.`;
    } else {
      result.verified = false; result.answer = 'Provide two of: F=..., m=..., a=...'; result.answerLatex = '\\text{Provide two of F, m, a}'; result.explanation = 'F = ma.';
      result.steps.push({ step: 2, description: 'Example', expression: 'm=10\\;a=2 \\implies F=20\\,\\text{N}', explanation: '' });
    }
    return result;
  }

  // Gravitational PE: PE = mgh
  if (/\bpe\b|potential\s*energy|mgh/i.test(lower)) {
    const m3 = getParam('m');
    const g2 = getParam('g') ?? 9.81;
    const h = getParam('h');
    const pe = getParam('pe');
    result.steps.push({
      step: 1,
      description: 'Gravitational potential energy',
      expression: 'PE = mgh',
      explanation: 'PE (J) = mass (kg) × g (m/s²) × height h (m).',
    });
    if (m3 !== null && h !== null) {
      const peVal = m3 * g2 * h;
      result.steps.push({ step: 2, description: 'Substitute', expression: `PE = ${m3} \\times ${formatNumber(g2)} \\times ${h} = ${formatNumber(peVal)}\\,\\text{J}`, explanation: '' });
      result.answer = `PE = ${formatNumber(peVal)} J`; result.answerLatex = `PE = ${formatNumber(peVal)}\\,\\text{J}`; result.explanation = `PE = ${formatNumber(peVal)} J.`;
    } else if (pe !== null && m3 !== null) {
      const hv = pe / (m3 * g2);
      result.steps.push({ step: 2, description: 'Solve for h', expression: `h = \\frac{PE}{mg} = \\frac{${pe}}{${m3}\\times${formatNumber(g2)}} = ${formatNumber(hv)}\\,\\text{m}`, explanation: '' });
      result.answer = `h = ${formatNumber(hv)} m`; result.answerLatex = `h = ${formatNumber(hv)}\\,\\text{m}`; result.explanation = `Height h = ${formatNumber(hv)} m.`;
    } else {
      result.verified = false; result.answer = 'Provide m=... h=... (g defaults to 9.81)'; result.answerLatex = '\\text{Provide m and h}'; result.explanation = 'PE = mgh.';
      result.steps.push({ step: 2, description: 'Example', expression: 'm=5\\;h=10 \\implies PE = 490.5\\,\\text{J}', explanation: '' });
    }
    return result;
  }

  // Fallback — list supported physics formulas
  result.verified = false;
  result.steps.push({
    step: 1,
    description: 'Supported physics formulas',
    expression: `V{=}IR \\quad KE{=}\\tfrac{1}{2}mv^2 \\quad F{=}ma \\quad PE{=}mgh \\quad R{=}\\tfrac{v_0^2\\sin2\\theta}{g} \\quad v{=}f\\lambda`,
    explanation: "Ohm's Law, kinetic energy, Newton's 2nd Law, potential energy, projectile range, wave speed.",
  });
  result.answer = "Try: ohm V=12 I=3  |  KE m=10 v=5  |  projectile v=50 theta=45  |  wave f=440 lambda=0.78";
  result.answerLatex = "\\text{Try: ohm V=12 I=3 or KE m=10 v=5}";
  result.explanation = 'Enter a physics formula keyword and known variable values.';
  return result;
}

function solveGeneralExpression(normalizedInput: string, category: MathCategoryId): SolverResult {
  const result = baseResult(category, normalizedInput, category === 'algebra' ? 'hybrid' : 'mathjs');

  result.steps.push({
    step: 1,
    description: 'Normalize the expression',
    expression: expressionToLatex(normalizedInput),
    explanation: 'Rewrite the input so the parser can read the operators and variables clearly.',
  });

  try {
    const simplified = nerdamer(normalizedInput).toString();
    result.steps.push({
      step: 2,
      description: 'Simplify symbolically',
      expression: `${expressionToLatex(normalizedInput)} = ${expressionToLatex(simplified)}`,
      explanation: 'Use symbolic simplification to reduce the expression before evaluating.',
    });

    let numeric: number | null = null;
    try {
      const evaluated = math.evaluate(normalizedInput) as number;
      numeric = Number(evaluated);
      if (Number.isFinite(numeric)) {
        result.steps.push({
          step: 3,
          description: 'Evaluate numerically',
          expression: `${expressionToLatex(simplified)} = ${expressionToLatex(formatNumber(numeric))}`,
          explanation: 'When the expression has no unresolved variables, we can compute a numeric result.',
        });
      }
    } catch {
      numeric = null;
    }

    // Catch numeric anomalies explicitly so the user sees a real
    // explanation instead of the symbolic fallback. Previously 0/0
    // fell through to nerdamer's literal "0/0" string, and 2/0
    // surfaced as a confident "∞" with no context.
    if (numeric !== null && Number.isNaN(numeric)) {
      result.verified = false;
      result.answer = 'undefined';
      result.answerLatex = '\\text{undefined}';
      result.explanation = 'The expression evaluates to an indeterminate form (e.g. 0/0). Check the inputs — there may be a removable singularity or a typo.';
      result.steps.push({
        step: 3,
        description: 'Result is undefined',
        expression: '\\text{undefined}',
        explanation: 'Numeric evaluation produced NaN, which means the expression has no defined value.',
      });
      return result;
    }
    if (numeric !== null && !Number.isFinite(numeric)) {
      result.verified = false;
      result.answer = numeric > 0 ? '∞ (undefined)' : '-∞ (undefined)';
      result.answerLatex = numeric > 0 ? '\\infty' : '-\\infty';
      result.explanation = 'The expression diverges — e.g. division by zero. Check whether you meant a limit, or revisit the denominator.';
      result.steps.push({
        step: 3,
        description: 'Result diverges',
        expression: result.answerLatex,
        explanation: 'Numeric evaluation produced infinity, typically from division by zero or unbounded growth.',
      });
      return result;
    }

    result.answer = numeric !== null && Number.isFinite(numeric) ? formatNumber(numeric) : simplified;
    result.answerLatex = resultToLatex(result.answer);
    result.explanation = numeric !== null && Number.isFinite(numeric)
      ? 'Simplified the expression and evaluated it numerically.'
      : 'Simplified the expression symbolically.';
    return result;
  } catch (error) {
    return {
      ...result,
      verified: false,
      error: error instanceof Error ? error.message : 'Unable to parse expression',
      answer: 'Unable to parse expression',
      answerLatex: '\\text{Unable to parse expression}',
      explanation: 'Try a clearer input like sqrt(x), sin(pi/6), system x + y = 3; x - y = 1, or 2*x + 5 = 11.',
    };
  }
}

function solveCompleteSquare(normalizedInput: string): SolverResult {
  const result = baseResult('algebra', normalizedInput, 'hybrid');
  const expr = normalizedInput
    .replace(/^complete\s+the\s+square\s+(?:of\s+|for\s+)?/i, '')
    .replace(/^completing\s+the\s+square\s+(?:of\s+|for\s+)?/i, '')
    .trim();

  // Parse as ax^2 + bx + c (= 0 optional)
  const hasEq = expr.includes('=');
  const lhs = hasEq ? expr.split('=')[0].trim() : expr;

  const coeffs = extractQuadraticCoefficients(lhs);
  if (!coeffs) {
    return {
      ...result,
      verified: false,
      answer: 'Could not parse as a quadratic',
      answerLatex: '\\text{Could not parse as a quadratic}',
      explanation: 'Use format: complete the square x^2 + 6x + 5',
    };
  }

  const { a, b, c } = coeffs;
  // Without this guard a === 0 produces h = -b/0 = ±Infinity and
  // k = NaN, which propagated into the rendered steps as "-∞" or
  // "undefined" — confusing because the input looked harmless to the user.
  if (a === 0) {
    return {
      ...result,
      verified: false,
      answer: 'Not a quadratic — leading coefficient is 0',
      answerLatex: '\\text{Not a quadratic — leading coefficient is 0}',
      explanation: 'Completing the square requires the x² term to be present. With a = 0 this is a linear expression; solve it with the equation solver instead.',
    };
  }
  const h = -b / (2 * a);
  const k = c - (b * b) / (4 * a);

  result.steps.push({
    step: 1, description: 'Write in standard form ax² + bx + c',
    expression: `${expressionToLatex(formatNumber(a))}x^2 + ${expressionToLatex(formatNumber(b))}x + ${expressionToLatex(formatNumber(c))}`,
    explanation: `Identify a = ${formatNumber(a)}, b = ${formatNumber(b)}, c = ${formatNumber(c)}.`,
  });
  result.steps.push({
    step: 2, description: 'Find h = −b/(2a)',
    expression: `h = \\frac{-${expressionToLatex(formatNumber(b))}}{2 \\cdot ${expressionToLatex(formatNumber(a))}} = ${expressionToLatex(formatNumber(h))}`,
    explanation: 'This is the x-coordinate of the vertex.',
  });
  result.steps.push({
    step: 3, description: 'Find k = c − b²/(4a)',
    expression: `k = ${expressionToLatex(formatNumber(c))} - \\frac{(${expressionToLatex(formatNumber(b))})^2}{4 \\cdot ${expressionToLatex(formatNumber(a))}} = ${expressionToLatex(formatNumber(k))}`,
    explanation: 'This is the y-coordinate of the vertex.',
  });
  result.steps.push({
    step: 4, description: 'Write in vertex form a(x − h)² + k',
    expression: `${a === 1 ? '' : expressionToLatex(formatNumber(a))}(x - ${expressionToLatex(formatNumber(h))})^2 + ${expressionToLatex(formatNumber(k))}`,
    explanation: 'The completed square (vertex form) reveals the vertex of the parabola.',
  });

  const vertexForm = `${a === 1 ? '' : formatNumber(a)}(x - ${formatNumber(h)})^2 + ${formatNumber(k)}`;
  result.answer = vertexForm;
  result.answerLatex = `${a === 1 ? '' : expressionToLatex(formatNumber(a))}\\left(x - ${expressionToLatex(formatNumber(h))}\\right)^2 + ${expressionToLatex(formatNumber(k))}`;
  result.explanation = `Vertex form: vertex at (${formatNumber(h)}, ${formatNumber(k)}).`;
  result.graphExpr = lhs;
  return result;
}

export function solveMathProblem(problem: string, requestedCategory?: string | null): SolverResult {
  const normalizedInput = normalizeMathInput(problem);
  const category = detectMathCategory(normalizedInput, requestedCategory);
  const lower = normalizedInput.toLowerCase();

  try {
    // Differential equations — check early before general equation matching
    if (category === 'differential-equations' || /y''|dy\/dx/i.test(normalizedInput) || (/y'/.test(normalizedInput) && normalizedInput.includes('='))) return solveDifferentialEquation(normalizedInput);
    // Discrete math
    if (category === 'discrete' || /^gcd\(|^lcm\(|^fibonacci\(|^fib\(|^f\(\d|^c\(\d|^p\(\d|^ncr\(|^npr\(|combinations?\(|permutations?\(|\d+\s*mod\s*\d|^\d+\^[\d]+\s*mod/.test(lower)) return solveDiscreteMath(normalizedInput);
    // Physics
    if (category === 'physics' || /\bohm\b|kinetic.energy|\bke\b|projectile|\bwave\b|wave\s*speed|wavelength|\bforce\b|\bf\s*=\s*m\s*a\b|potential.energy|\bpe\b|newton/.test(lower)) return solvePhysics(normalizedInput);
    if (
      lower.startsWith('derivative of') ||
      lower.startsWith('d/dx') ||
      lower.startsWith('differentiate ') ||
      lower.startsWith('differentiation of ') ||
      /^diff\s+[a-zA-Z(]/.test(lower)
    ) return solveDerivative(normalizedInput);
    if (
      lower.startsWith('integral from') ||
      lower.startsWith('integral of') ||
      lower.startsWith('integral ') ||
      lower.startsWith('integrate') ||
      /^int\s+/.test(lower)
    ) return solveIntegral(normalizedInput);
    if (lower.startsWith('limit ') || lower.startsWith('lim ')) return solveLimit(normalizedInput.replace(/^lim\s+/i, 'limit '));
    // Geometry dispatch — accept the phrasings the panel preset buttons
    // generate (e.g. "Area of triangle with sides 2, 2, 1") as well as
    // anything a user might type. The previous pattern required `area
    // triangle` to be adjacent, so the panel-generated "Area of triangle
    // ..." fell through to the general expression solver and the user
    // saw "(2 · Area · of · sides · triangle · with, 2, 1)" because
    // mathjs treated the words as variable names.
    if (
      /hypotenuse|distance\s*(?:between|from|\()|midpoint(?:\s+of)?|line\s+(?:through|from)|equation of (?:a\s+|the\s+)?circle|circumference|pythagorean|volume of (?:a\s+|the\s+)?sphere|area(?:\s+and\s+perimeter)?\s+(?:of\s+)?(?:a\s+|the\s+)?(?:triangle|rectangle|circle|square|parallelogram|trapezoid|trapezium)|(?:triangle|rectangle|circle|square|parallelogram|trapezoid|trapezium)\s+area|^solve\s+triangle\s*:/i
        .test(lower)
    ) return solveGeometryProblem(normalizedInput);
    if (/arithmetic (?:nth|sum)|geometric (?:nth|sum)|sequence|series/.test(lower)) return solveSequenceSeries(normalizedInput);
    if (lower.startsWith('system ') || lower.startsWith('solve system ') || (normalizedInput.includes(';') && normalizedInput.includes('='))) return solveSystem(normalizedInput);
    if (
      category === 'vectors' ||
      /dot product|magnitude|angle between|unit vector|normalize|^dot\(|^cross\(|^norm\(|^\[[^\]]+\]\s*[\+\-]\s*\[[^\]]+\]|^\[[^\]]+\]\s*\[[^\]]+\]$/i.test(normalizedInput)
    ) return solveVectorProblem(normalizedInput);
    if (
      category === 'matrices' ||
      category === 'linear-algebra' ||
      /^det\(|^inv\(|^transpose\(|^\[\[/.test(normalizedInput) ||
      /^-?\d+(?:\.\d+)?\s*\*\s*\[\[/.test(normalizedInput)
    ) {
      return solveMatrixProblem(normalizedInput, category === 'linear-algebra' ? 'linear-algebra' : 'matrices');
    }
    if (/mean\(|median\(|variance\(|std\(|combinations\(|permutations\(/.test(lower)) return solveStatisticsProblem(normalizedInput);
    if (category === 'trigonometry' || /\bsin\(|\bcos\(|\btan\(|\bcot\(|\bsec\(|\bcsc\(/.test(lower)) return solveTrigonometry(normalizedInput);
    if (/^complete.*square|^completing.*square/i.test(lower)) return solveCompleteSquare(normalizedInput);
    if (/^(simplify|expand|factor)\b/i.test(lower)) return solveTransform(normalizedInput);
    if (/(<=|>=|<|>)/.test(normalizedInput)) return solveInequality(normalizedInput);
    if (normalizedInput.includes('=') && (lower.includes('x^3') || lower.includes('x**3'))) {
      const cubicResult = solveCubicEquation(normalizedInput);
      if (cubicResult) return cubicResult;
    }
    if (normalizedInput.includes('=') && (lower.includes('x^4') || lower.includes('x**4'))) {
      const quarticResult = solveQuarticEquation(normalizedInput);
      if (quarticResult) return quarticResult;
    }
    if (normalizedInput.includes('=') && (lower.includes('x^2') || lower.includes('x**2'))) return solveQuadraticEquation(normalizedInput, category);
    // Exponential equation: a^x = b
    if (normalizedInput.includes('=')) {
      const expResult = solveExponentialEquation(normalizedInput, category);
      if (expResult) return expResult;
    }
    if (normalizedInput.includes('=')) return solveEquation(normalizedInput, category);
    return solveGeneralExpression(normalizedInput, category);
  } catch (error) {
    const failed = baseResult(category, normalizedInput, 'hybrid');
    failed.verified = false;
    failed.error = error instanceof Error ? error.message : 'Math solver failed';
    failed.answer = 'Unable to solve';
    failed.answerLatex = '\\text{Unable to solve}';
    failed.explanation = 'The math engine could not safely complete this problem. Try MATLAB Flow for advanced numeric work.';
    failed.steps.push({
      step: 1,
      description: 'Solver failed',
      expression: failed.previewLatex,
      explanation: failed.explanation,
    });
    return failed;
  }
}
