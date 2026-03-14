import * as math from 'mathjs';
import nerdamer from 'nerdamer';
import 'nerdamer/Algebra.js';
import 'nerdamer/Calculus.js';
import 'nerdamer/Solve.js';
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
    .replace(/^integral of\s+/i, '')
    .replace(/^limit\s+[^ ]+\s+of\s+/i, '')
    .trim();

  return /x/.test(candidate) ? candidate : undefined;
}

function categoryFromProblem(normalizedInput: string): MathCategoryId {
  const lower = normalizedInput.toLowerCase();
  if (/dot product|magnitude|angle between|\[[^\]]+\]\s*\[[^\]]+\]/i.test(normalizedInput)) return 'vectors';
  if (/\[\[[^\]]+\]\]/.test(normalizedInput) || /\bdet\(|\binv\(/.test(lower)) return 'matrices';
  if (/mean\(|median\(|variance\(|std\(/.test(lower)) return 'statistics';
  if (/derivative|integral|limit|d\/dx|\bint\b|\blim\b/.test(lower)) return 'calculus';
  if (/matrix|determinant|inverse/.test(lower)) return 'linear-algebra';
  return 'algebra';
}

export function detectMathCategory(problem: string, requested?: string | null): MathCategoryId {
  const candidate = (requested || '').toLowerCase().trim();
  if (candidate === 'algebra' || candidate === 'calculus' || candidate === 'linear-algebra' || candidate === 'statistics' || candidate === 'vectors' || candidate === 'matrices') {
    return candidate;
  }
  return categoryFromProblem(normalizeMathInput(problem));
}

function baseResult(category: MathCategoryId, normalizedInput: string, engine: SolverResult['engine']): SolverResult {
  return {
    category,
    normalizedInput,
    previewLatex: normalizedInput.includes('=')
      ? normalizedInput.split('=').map((part) => expressionToLatex(part.trim())).join(' = ')
      : expressionToLatex(normalizedInput),
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
      explanation: 'Try a more explicit mathjs-style input like sqrt(x), sin(x), or 2*x + 5 = 11.',
    };
  }
}

export function solveMathProblem(problem: string, requestedCategory?: string | null): SolverResult {
  const normalizedInput = normalizeMathInput(problem);
  const category = detectMathCategory(normalizedInput, requestedCategory);
  const lower = normalizedInput.toLowerCase();

  try {
    if (lower.startsWith('derivative of') || lower.startsWith('d/dx')) return solveDerivative(normalizedInput);
    if (lower.startsWith('integral of') || lower.startsWith('integrate')) return solveIntegral(normalizedInput);
    if (lower.startsWith('limit ')) return solveLimit(normalizedInput);
    if (/dot product|magnitude|angle between|^\[[^\]]+\]\s*\[[^\]]+\]$/i.test(normalizedInput)) return solveVectorProblem(normalizedInput);
    if (/^det\(|^inv\(|^\[\[/.test(normalizedInput)) return solveMatrixProblem(normalizedInput, category === 'linear-algebra' ? 'linear-algebra' : 'matrices');
    if (/mean\(|median\(|variance\(|std\(/.test(lower)) return solveStatisticsProblem(normalizedInput);
    if (/^(simplify|expand|factor)\b/i.test(lower)) return solveTransform(normalizedInput);
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
