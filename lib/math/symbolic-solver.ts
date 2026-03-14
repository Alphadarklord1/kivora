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
    .replace(/\bintegral of\b/gi, 'integral of ')
    .replace(/\s*=\s*/g, ' = ')
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

function formatNumber(value: number) {
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
  if (category === 'statistics' || category === 'vectors' || category === 'matrices' || category === 'linear-algebra') {
    return undefined;
  }

  if (normalizedInput.includes('=')) {
    const [lhs, rhs] = normalizedInput.split('=').map((part) => part.trim());
    if (lhs && rhs && /x/.test(`${lhs}${rhs}`)) {
      return `(${lhs}) - (${rhs})`;
    }
  }

  const candidate = normalizedInput
    .replace(/^derivative of\s+/i, '')
    .replace(/^integral\s+from\s+.+?\s+to\s+.+?\s+of\s+/i, '')
    .replace(/^integral of\s+/i, '')
    .replace(/^limit\s+[^ ]+\s+of\s+/i, '')
    .replace(/\s+dx$/i, '')
    .trim();

  return /x/.test(candidate) ? candidate : undefined;
}

function categoryFromProblem(normalizedInput: string): MathCategoryId {
  const lower = normalizedInput.toLowerCase();
  if (/dot product|magnitude|angle between|\[[^\]]+\]\s*\[[^\]]+\]/i.test(normalizedInput)) return 'vectors';
  if (/\[\[[^\]]+\]\]/.test(normalizedInput) || /\bdet\(|\binv\(/.test(lower)) return 'matrices';
  if (/mean\(|median\(|variance\(|std\(|combinations\(|permutations\(/.test(lower)) return 'statistics';
  if (/hypotenuse|distance\s*\(|distance between|area circle|circumference circle|area triangle|area rectangle|pythagorean/.test(lower)) return 'geometry';
  if (/derivative|integral|limit|d\/dx|\bint\b|\blim\b/.test(lower)) return 'calculus';
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
    candidate === 'matrices'
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

  const distance = lower.match(/^distance\s*\((.+?),(.+?)\)\s*\((.+?),(.+?)\)$/);
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
    result.explanation = 'Computed the distance between the two points.';
    return result;
  }

  const areaCircle = lower.match(/^area circle radius\s+(.+)$/);
  if (areaCircle) {
    const r = Number(math.evaluate(areaCircle[1]));
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

  const circumference = lower.match(/^circumference circle radius\s+(.+)$/);
  if (circumference) {
    const r = Number(math.evaluate(circumference[1]));
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

  const triangleArea = lower.match(/^area triangle base\s+(.+?)\s+height\s+(.+)$/);
  if (triangleArea) {
    const base = Number(math.evaluate(triangleArea[1]));
    const height = Number(math.evaluate(triangleArea[2]));
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

  return {
    ...result,
    verified: false,
    answer: 'Unsupported geometry problem',
    answerLatex: '\\text{Unsupported geometry problem}',
    explanation: 'Try hypotenuse 3 4, distance (0,0) (3,4), area circle radius 5, or area triangle base 10 height 4.',
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

function solveDerivative(normalizedInput: string): SolverResult {
  const result = baseResult('calculus', normalizedInput, 'nerdamer');
  const expression = normalizedInput
    .replace(/^derivative of\s+/i, '')
    .replace(/^d\/dx\s*/i, '')
    .replace(/^d\s*\(\s*/i, '')
    .replace(/\)$/g, '')
    .trim();

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
    .replace(/^integrate\s+/i, '')
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
  const point = Number(rawValue);
  const epsilon = 1e-6;
  const left = Number(math.evaluate(expression, { [variable]: point - epsilon }));
  const right = Number(math.evaluate(expression, { [variable]: point + epsilon }));
  const estimate = (left + right) / 2;

  result.steps.push({
    step: 1,
    description: 'State the limit',
    expression: `\\lim_{${variable}\\to ${expressionToLatex(rawValue)}} ${expressionToLatex(expression)}`,
    explanation: 'Read the approaching value and the function carefully before substituting.',
  });
  result.steps.push({
    step: 2,
    description: 'Check both sides near the target value',
    expression: `${variable}=${formatNumber(point - epsilon)} \Rightarrow ${formatNumber(left)}, \quad ${variable}=${formatNumber(point + epsilon)} \Rightarrow ${formatNumber(right)}`,
    explanation: 'Evaluate values just to the left and right to estimate the common trend.',
  });

  result.answer = formatNumber(estimate);
  result.answerLatex = expressionToLatex(formatNumber(estimate));
  result.explanation = 'Estimated the limit numerically from both sides. This is a strong approximation when both sides agree.';
  result.graphExpr = expression;
  return result;
}

function solveVectorProblem(normalizedInput: string): SolverResult {
  const result = baseResult('vectors', normalizedInput, 'mathjs');
  const dotMatch = normalizedInput.match(/dot product\s*(\[[^\]]+\])\s*(?:and\s*)?(\[[^\]]+\])/i) || normalizedInput.match(/^(\[[^\]]+\])\s*(\[[^\]]+\])$/);
  const magnitudeMatch = normalizedInput.match(/^magnitude\s*(\[[^\]]+\])$/i);
  const angleMatch = normalizedInput.match(/^angle between\s*(\[[^\]]+\])\s*(\[[^\]]+\])$/i);

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
      expression: `${vectorToLatex(left)} \cdot ${vectorToLatex(right)}`,
      explanation: 'A dot product multiplies matching components and then adds them.',
    });
    result.steps.push({
      step: 2,
      description: 'Multiply matching entries',
      expression: pieces.join(' + '),
      explanation: 'Take each component pair and multiply them in order.',
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

  if (angleMatch) {
    const left = parseVector(angleMatch[1]);
    const right = parseVector(angleMatch[2]);
    if (!left || !right || left.length !== right.length) {
      return { ...result, verified: false, answer: 'Vector dimensions do not match', answerLatex: '\\text{Vector dimensions do not match}', explanation: 'Angle calculation needs vectors of the same length.' };
    }
    const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
    const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
    const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
    const radians = Math.acos(dot / (leftMagnitude * rightMagnitude));
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
      expression: `\\cos(\\theta) = \\frac{${formatNumber(dot)}}{${formatNumber(leftMagnitude)} \\cdot ${formatNumber(rightMagnitude)}}`,
      explanation: 'Now evaluate the inverse cosine.',
    });
    result.answer = `${formatNumber(degrees)}°`;
    result.answerLatex = `${expressionToLatex(formatNumber(degrees))}^{\\circ}`;
    result.explanation = 'Computed the angle between the vectors using cosine similarity geometry.';
    return result;
  }

  return { ...result, verified: false, answer: 'Unsupported vector problem', answerLatex: '\\text{Unsupported vector problem}', explanation: 'Try dot product [a,b] [c,d], magnitude [a,b], or angle between [a,b] [c,d].' };
}

function solveMatrixProblem(normalizedInput: string, category: MathCategoryId): SolverResult {
  const result = baseResult(category, normalizedInput, 'mathjs');

  if (/^det\(/i.test(normalizedInput)) {
    const matrixText = normalizedInput.replace(/^det\(/i, '').replace(/\)$/,'');
    const matrix = parseMatrix(matrixText);
    if (!matrix) {
      return { ...result, verified: false, answer: 'Invalid matrix', answerLatex: '\\text{Invalid matrix}', explanation: 'Use format: det([[1,2],[3,4]])' };
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
    result.answer = JSON.stringify(inverseArray);
    result.answerLatex = matrixToLatex(inverseArray);
    result.explanation = 'Computed the matrix inverse exactly with mathjs.';
    return result;
  }

  const parts = normalizedInput.split('*').map((part) => part.trim());
  if (parts.length === 2 && parts.every((part) => part.startsWith('[['))) {
    const left = parseMatrix(parts[0]);
    const right = parseMatrix(parts[1]);
    if (!left || !right) {
      return { ...result, verified: false, answer: 'Invalid matrix format', answerLatex: '\\text{Invalid matrix format}', explanation: 'Use format like [[1,2],[3,4]] * [[5,6],[7,8]].' };
    }
    const product = math.multiply(left, right) as math.MathCollection;
    const productArray = Array.isArray(product) ? product as number[][] : (product as math.Matrix).toArray() as number[][];
    result.steps.push({
      step: 1,
      description: 'Align both matrices',
      expression: `${matrixToLatex(left)} \cdot ${matrixToLatex(right)}`,
      explanation: 'Matrix multiplication combines rows from the first matrix with columns from the second.',
    });
    result.steps.push({
      step: 2,
      description: 'Multiply rows by columns',
      expression: matrixToLatex(productArray),
      explanation: 'Each output entry is a row-column dot product.',
    });
    result.answer = JSON.stringify(productArray);
    result.answerLatex = matrixToLatex(productArray);
    result.explanation = 'Computed the matrix product using mathjs matrix multiplication.';
    return result;
  }

  return { ...result, verified: false, answer: 'Unsupported matrix problem', answerLatex: '\\text{Unsupported matrix problem}', explanation: 'Try determinant, inverse, or multiplying two matrices.' };
}

function solveTrigonometry(normalizedInput: string): SolverResult {
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
  const evaluated = math.evaluate(normalizedInput) as number;
  const lower = normalizedInput.toLowerCase();

  result.steps.push({
    step: 1,
    description: 'Identify the statistic',
    expression: expressionToLatex(normalizedInput),
    explanation: 'Read the dataset and the requested statistical operation.',
  });
  result.steps.push({
    step: 2,
    description: 'Evaluate the dataset',
    expression: `${expressionToLatex(normalizedInput)} = ${expressionToLatex(formatNumber(Number(evaluated)))}`,
    explanation: lower.includes('mean')
      ? 'The mean averages all values in the dataset.'
      : lower.includes('median')
        ? 'The median is the middle value after sorting.'
        : lower.includes('combinations')
          ? 'Combinations count selections where order does not matter.'
          : lower.includes('permutations')
            ? 'Permutations count ordered arrangements.'
        : lower.includes('variance')
          ? 'Variance measures spread around the mean.'
          : 'Standard deviation is the square root of the variance.',
  });

  result.answer = formatNumber(Number(evaluated));
  result.answerLatex = expressionToLatex(result.answer);
  result.explanation = 'Computed the requested statistic directly from the dataset.';
  return result;
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

export function solveMathProblem(problem: string, requestedCategory?: string | null): SolverResult {
  const normalizedInput = normalizeMathInput(problem);
  const category = detectMathCategory(normalizedInput, requestedCategory);
  const lower = normalizedInput.toLowerCase();

  try {
    if (lower.startsWith('derivative of') || lower.startsWith('d/dx')) return solveDerivative(normalizedInput);
    if (lower.startsWith('integral from') || lower.startsWith('integral of') || lower.startsWith('integrate')) return solveIntegral(normalizedInput);
    if (lower.startsWith('limit ')) return solveLimit(normalizedInput);
    if (/hypotenuse|distance\s*\(|distance between|area circle|circumference circle|area triangle|area rectangle|pythagorean/.test(lower)) return solveGeometryProblem(normalizedInput);
    if (/arithmetic (?:nth|sum)|geometric (?:nth|sum)|sequence|series/.test(lower)) return solveSequenceSeries(normalizedInput);
    if (lower.startsWith('system ') || lower.startsWith('solve system ') || (normalizedInput.includes(';') && normalizedInput.includes('='))) return solveSystem(normalizedInput);
    if (/dot product|magnitude|angle between|^\[[^\]]+\]\s*\[[^\]]+\]$/i.test(normalizedInput)) return solveVectorProblem(normalizedInput);
    if (/^det\(|^inv\(|^\[\[/.test(normalizedInput)) return solveMatrixProblem(normalizedInput, category === 'linear-algebra' ? 'linear-algebra' : 'matrices');
    if (/mean\(|median\(|variance\(|std\(|combinations\(|permutations\(/.test(lower)) return solveStatisticsProblem(normalizedInput);
    if (category === 'trigonometry' || /\bsin\(|\bcos\(|\btan\(|\bcot\(|\bsec\(|\bcsc\(/.test(lower)) return solveTrigonometry(normalizedInput);
    if (/^(simplify|expand|factor)\b/i.test(lower)) return solveTransform(normalizedInput);
    if (/(<=|>=|<|>)/.test(normalizedInput)) return solveInequality(normalizedInput);
    if (normalizedInput.includes('=') && (lower.includes('x^2') || lower.includes('x**2'))) return solveQuadraticEquation(normalizedInput, category);
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
