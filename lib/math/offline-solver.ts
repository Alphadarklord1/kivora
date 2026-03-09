// Comprehensive Offline Math Solver
// Supports: Arithmetic, Algebra, Calculus (derivatives, integrals), Linear Algebra basics

export interface MathStep {
  step: number;
  description: string;
  expression: string;  // LaTeX formatted
  explanation: string;
}

export interface MathSolution {
  problem: string;
  problemType: string;
  steps: MathStep[];
  finalAnswer: string;  // LaTeX formatted
  isOffline: boolean;
}

// ============ Problem Type Detection ============

export function detectProblemType(problem: string): string {
  const p = problem.toLowerCase();

  // Derivatives
  if (/\b(derivative|differentiate|d\/dx|f'\s*\(|find\s+f'|dy\/dx)\b/i.test(p)) {
    return 'derivative';
  }

  // Integrals
  if (/\b(integra(l|te)|antiderivative|∫)\b/i.test(p)) {
    if (/\b(definite|from|to|bounds|evaluate)\b/i.test(p)) {
      return 'definite-integral';
    }
    return 'indefinite-integral';
  }

  // Limits
  if (/\b(limit|lim|approaches|→)\b/i.test(p)) {
    return 'limit';
  }

  // Linear Algebra
  if (/\b(matrix|matrices|determinant|det|eigenvalue|eigenvector|inverse)\b/i.test(p)) {
    return 'linear-algebra';
  }
  if (/\b(vector|dot\s*product|cross\s*product|magnitude)\b/i.test(p)) {
    return 'vectors';
  }

  // Series
  if (/\b(series|sum|∑|taylor|maclaurin|convergence)\b/i.test(p)) {
    return 'series';
  }

  // Equations
  if (/\b(solve|find\s+x|equation)\b/i.test(p)) {
    if (/x\^2|x²|quadratic/i.test(p)) {
      return 'quadratic';
    }
    if (/\bsystem\b/i.test(p)) {
      return 'system';
    }
    return 'linear-equation';
  }

  // Simplify/Evaluate
  if (/\b(simplify|expand|factor)\b/i.test(p)) {
    return 'simplify';
  }

  if (/\b(evaluate|calculate|compute|what\s+is)\b/i.test(p)) {
    return 'arithmetic';
  }

  // Default to arithmetic if it looks like an expression
  if (/[\d+\-*/^()]+/.test(p)) {
    return 'arithmetic';
  }

  return 'general';
}

// ============ Expression Parser ============

interface Token {
  type: 'number' | 'variable' | 'operator' | 'function' | 'paren';
  value: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  expr = expr.replace(/\s+/g, '');

  while (i < expr.length) {
    const char = expr[i];

    // Numbers (including decimals)
    if (/\d/.test(char) || (char === '.' && /\d/.test(expr[i + 1]))) {
      let num = '';
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === '.')) {
        num += expr[i++];
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Variables
    if (/[a-zA-Z]/.test(char)) {
      let name = '';
      while (i < expr.length && /[a-zA-Z\d]/.test(expr[i])) {
        name += expr[i++];
      }
      // Check if it's a function
      if (['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'sqrt', 'abs'].includes(name.toLowerCase())) {
        tokens.push({ type: 'function', value: name.toLowerCase() });
      } else {
        tokens.push({ type: 'variable', value: name });
      }
      continue;
    }

    // Operators
    if (['+', '-', '*', '/', '^'].includes(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    // Parentheses
    if (['(', ')'].includes(char)) {
      tokens.push({ type: 'paren', value: char });
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

// ============ Arithmetic Evaluation ============

function evaluateArithmetic(expr: string): { result: number; steps: MathStep[] } {
  const steps: MathStep[] = [];
  let current = expr.trim();

  // Handle parentheses first
  let parenMatch;
  let stepNum = 1;

  while ((parenMatch = current.match(/\(([^()]+)\)/))) {
    const inner = parenMatch[1];
    const innerResult = evaluateSimpleExpr(inner);
    steps.push({
      step: stepNum++,
      description: 'Evaluate parentheses',
      expression: `(${inner}) = ${innerResult}`,
      explanation: `Calculate the expression inside the parentheses: ${inner} = ${innerResult}`
    });
    current = current.replace(parenMatch[0], innerResult.toString());
  }

  // Handle exponents
  let expMatch;
  while ((expMatch = current.match(/(-?\d+\.?\d*)\s*\^\s*(-?\d+\.?\d*)/))) {
    const base = parseFloat(expMatch[1]);
    const exp = parseFloat(expMatch[2]);
    const result = Math.pow(base, exp);
    steps.push({
      step: stepNum++,
      description: 'Calculate exponent',
      expression: `${base}^{${exp}} = ${result}`,
      explanation: `${base} raised to the power of ${exp} equals ${result}`
    });
    current = current.replace(expMatch[0], result.toString());
  }

  // Handle multiplication and division
  let multDivMatch;
  while ((multDivMatch = current.match(/(-?\d+\.?\d*)\s*([*/])\s*(-?\d+\.?\d*)/))) {
    const a = parseFloat(multDivMatch[1]);
    const op = multDivMatch[2];
    const b = parseFloat(multDivMatch[3]);
    const result = op === '*' ? a * b : a / b;
    const opName = op === '*' ? 'Multiply' : 'Divide';
    steps.push({
      step: stepNum++,
      description: opName,
      expression: `${a} ${op === '*' ? '\\times' : '\\div'} ${b} = ${result}`,
      explanation: `${a} ${op === '*' ? 'times' : 'divided by'} ${b} equals ${result}`
    });
    current = current.replace(multDivMatch[0], result.toString());
  }

  // Handle addition and subtraction
  const finalResult = evaluateSimpleExpr(current);
  if (current.includes('+') || current.includes('-')) {
    steps.push({
      step: stepNum++,
      description: 'Add/Subtract',
      expression: `${current} = ${finalResult}`,
      explanation: `Evaluate the remaining addition and subtraction`
    });
  }

  return { result: finalResult, steps };
}

function evaluateSimpleExpr(expr: string): number {
  // Simple evaluation for basic +/- operations
  try {
    // Safe evaluation using Function
    const sanitized = expr.replace(/[^0-9+\-*/().]/g, '');
    return new Function('return ' + sanitized)();
  } catch {
    return NaN;
  }
}

// ============ Derivative Solver ============

interface DerivativeRule {
  pattern: RegExp;
  derivative: (match: RegExpMatchArray, variable: string) => string;
  name: string;
  explanation: string;
}

const derivativeRules: DerivativeRule[] = [
  // Constant
  {
    pattern: /^(-?\d+\.?\d*)$/,
    derivative: () => '0',
    name: 'Constant Rule',
    explanation: 'The derivative of a constant is 0'
  },
  // Power rule: x^n
  {
    pattern: /^([a-zA-Z])\^(\d+)$/,
    derivative: (m) => {
      const n = parseInt(m[2]);
      if (n === 1) return '1';
      if (n === 2) return `2${m[1]}`;
      return `${n}${m[1]}^{${n - 1}}`;
    },
    name: 'Power Rule',
    explanation: 'If f(x) = x^n, then f\'(x) = n*x^(n-1)'
  },
  // Coefficient * x^n
  {
    pattern: /^(-?\d+\.?\d*)([a-zA-Z])\^(\d+)$/,
    derivative: (m) => {
      const coef = parseFloat(m[1]);
      const n = parseInt(m[3]);
      const newCoef = coef * n;
      if (n === 1) return `${newCoef}`;
      if (n === 2) return `${newCoef}${m[2]}`;
      return `${newCoef}${m[2]}^{${n - 1}}`;
    },
    name: 'Power Rule with Coefficient',
    explanation: 'If f(x) = a*x^n, then f\'(x) = a*n*x^(n-1)'
  },
  // Simple x
  {
    pattern: /^([a-zA-Z])$/,
    derivative: () => '1',
    name: 'Power Rule (n=1)',
    explanation: 'The derivative of x is 1'
  },
  // Coefficient * x
  {
    pattern: /^(-?\d+\.?\d*)([a-zA-Z])$/,
    derivative: (m) => m[1],
    name: 'Constant Multiple Rule',
    explanation: 'If f(x) = a*x, then f\'(x) = a'
  },
  // sin(x)
  {
    pattern: /^sin\(([a-zA-Z])\)$/,
    derivative: (m) => `\\cos(${m[1]})`,
    name: 'Sine Rule',
    explanation: 'The derivative of sin(x) is cos(x)'
  },
  // cos(x)
  {
    pattern: /^cos\(([a-zA-Z])\)$/,
    derivative: (m) => `-\\sin(${m[1]})`,
    name: 'Cosine Rule',
    explanation: 'The derivative of cos(x) is -sin(x)'
  },
  // tan(x)
  {
    pattern: /^tan\(([a-zA-Z])\)$/,
    derivative: (m) => `\\sec^2(${m[1]})`,
    name: 'Tangent Rule',
    explanation: 'The derivative of tan(x) is sec^2(x)'
  },
  // e^x
  {
    pattern: /^e\^([a-zA-Z])$/,
    derivative: (m) => `e^{${m[1]}}`,
    name: 'Exponential Rule',
    explanation: 'The derivative of e^x is e^x'
  },
  // ln(x)
  {
    pattern: /^ln\(([a-zA-Z])\)$/,
    derivative: (m) => `\\frac{1}{${m[1]}}`,
    name: 'Natural Log Rule',
    explanation: 'The derivative of ln(x) is 1/x'
  },
  // sqrt(x) = x^(1/2)
  {
    pattern: /^sqrt\(([a-zA-Z])\)$/,
    derivative: (m) => `\\frac{1}{2\\sqrt{${m[1]}}}`,
    name: 'Square Root Rule',
    explanation: 'The derivative of sqrt(x) is 1/(2*sqrt(x))'
  }
];

function solveDerivative(problem: string): MathSolution {
  const steps: MathStep[] = [];
  const expr = problem.toLowerCase()
    .replace(/find\s+the\s+derivative\s+of/i, '')
    .replace(/differentiate/i, '')
    .replace(/d\/dx/i, '')
    .replace(/f\(x\)\s*=\s*/i, '')
    .replace(/y\s*=\s*/i, '')
    .trim();

  const variable = expr.match(/[a-zA-Z]/)?.[0] || 'x';

  steps.push({
    step: 1,
    description: 'Identify the function',
    expression: `f(${variable}) = ${expr}`,
    explanation: `We need to find \\frac{d}{d${variable}}[${expr}]`
  });

  // Check if it's a sum/difference of terms
  const terms = expr.split(/(?=[+-])/);

  if (terms.length > 1) {
    steps.push({
      step: 2,
      description: 'Apply Sum/Difference Rule',
      expression: `\\frac{d}{d${variable}}[${terms.join(' ')}] = ${terms.map(t => `\\frac{d}{d${variable}}[${t.trim()}]`).join(' + ')}`,
      explanation: 'The derivative of a sum is the sum of derivatives'
    });

    const derivatives: string[] = [];
    let stepNum = 3;

    for (const term of terms) {
      const cleanTerm = term.trim().replace(/^\+/, '');
      let found = false;

      for (const rule of derivativeRules) {
        const match = cleanTerm.match(rule.pattern);
        if (match) {
          const deriv = rule.derivative(match, variable);
          derivatives.push(deriv);
          steps.push({
            step: stepNum++,
            description: rule.name,
            expression: `\\frac{d}{d${variable}}[${cleanTerm}] = ${deriv}`,
            explanation: rule.explanation
          });
          found = true;
          break;
        }
      }

      if (!found) {
        derivatives.push(`\\frac{d}{d${variable}}[${cleanTerm}]`);
      }
    }

    const finalAnswer = derivatives.join(' + ').replace(/\+ -/g, '- ');

    steps.push({
      step: stepNum,
      description: 'Combine terms',
      expression: `f'(${variable}) = ${finalAnswer}`,
      explanation: 'Combine all the derivatives'
    });

    return {
      problem,
      problemType: 'derivative',
      steps,
      finalAnswer,
      isOffline: true
    };
  }

  // Single term
  for (const rule of derivativeRules) {
    const match = expr.match(rule.pattern);
    if (match) {
      const deriv = rule.derivative(match, variable);
      steps.push({
        step: 2,
        description: rule.name,
        expression: `\\frac{d}{d${variable}}[${expr}] = ${deriv}`,
        explanation: rule.explanation
      });

      return {
        problem,
        problemType: 'derivative',
        steps,
        finalAnswer: deriv,
        isOffline: true
      };
    }
  }

  // Fallback
  return {
    problem,
    problemType: 'derivative',
    steps: [{
      step: 1,
      description: 'Complex derivative',
      expression: `\\frac{d}{d${variable}}[${expr}]`,
      explanation: 'This derivative requires the product rule, quotient rule, or chain rule. Please use AI mode for step-by-step solution.'
    }],
    finalAnswer: `\\frac{d}{d${variable}}[${expr}]`,
    isOffline: true
  };
}

// ============ Integral Solver ============

const integralRules: { pattern: RegExp; integral: (m: RegExpMatchArray, v: string) => string; name: string; explanation: string }[] = [
  // Constant
  {
    pattern: /^(-?\d+\.?\d*)$/,
    integral: (m, v) => `${m[1]}${v}`,
    name: 'Constant Rule',
    explanation: 'The integral of a constant k is kx'
  },
  // x^n
  {
    pattern: /^([a-zA-Z])\^(\d+)$/,
    integral: (m) => {
      const n = parseInt(m[2]);
      return `\\frac{${m[1]}^{${n + 1}}}{${n + 1}}`;
    },
    name: 'Power Rule',
    explanation: 'The integral of x^n is x^(n+1)/(n+1) for n ≠ -1'
  },
  // Simple x
  {
    pattern: /^([a-zA-Z])$/,
    integral: (m) => `\\frac{${m[1]}^2}{2}`,
    name: 'Power Rule (n=1)',
    explanation: 'The integral of x is x^2/2'
  },
  // Coefficient * x^n
  {
    pattern: /^(-?\d+\.?\d*)([a-zA-Z])\^(\d+)$/,
    integral: (m) => {
      const coef = parseFloat(m[1]);
      const n = parseInt(m[3]);
      return `\\frac{${coef}${m[2]}^{${n + 1}}}{${n + 1}}`;
    },
    name: 'Power Rule with Coefficient',
    explanation: 'The integral of ax^n is ax^(n+1)/(n+1)'
  },
  // Coefficient * x
  {
    pattern: /^(-?\d+\.?\d*)([a-zA-Z])$/,
    integral: (m) => `\\frac{${m[1]}${m[2]}^2}{2}`,
    name: 'Power Rule with Coefficient',
    explanation: 'The integral of ax is ax^2/2'
  },
  // sin(x)
  {
    pattern: /^sin\(([a-zA-Z])\)$/,
    integral: (m) => `-\\cos(${m[1]})`,
    name: 'Sine Rule',
    explanation: 'The integral of sin(x) is -cos(x)'
  },
  // cos(x)
  {
    pattern: /^cos\(([a-zA-Z])\)$/,
    integral: (m) => `\\sin(${m[1]})`,
    name: 'Cosine Rule',
    explanation: 'The integral of cos(x) is sin(x)'
  },
  // e^x
  {
    pattern: /^e\^([a-zA-Z])$/,
    integral: (m) => `e^{${m[1]}}`,
    name: 'Exponential Rule',
    explanation: 'The integral of e^x is e^x'
  },
  // 1/x
  {
    pattern: /^1\/([a-zA-Z])$/,
    integral: (m) => `\\ln|${m[1]}|`,
    name: 'Reciprocal Rule',
    explanation: 'The integral of 1/x is ln|x|'
  },
  // sec^2(x)
  {
    pattern: /^sec\^2\(([a-zA-Z])\)$/,
    integral: (m) => `\\tan(${m[1]})`,
    name: 'Secant Squared Rule',
    explanation: 'The integral of sec^2(x) is tan(x)'
  }
];

function parseBoundValue(raw: string): number | null {
  const sanitized = raw
    .trim()
    .toLowerCase()
    .replace(/π/g, 'pi')
    .replace(/\binfinity\b/g, 'Infinity')
    .replace(/\binf\b/g, 'Infinity')
    .replace(/\bpi\b/g, `${Math.PI}`);

  if (!/^[0-9+\-*/().\sInfinity]+$/.test(sanitized)) {
    return null;
  }

  try {
    const value = new Function(`return (${sanitized});`)();
    return Number.isFinite(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

function parseDefiniteIntegral(problem: string): { lower: number; upper: number; integrand: string; variable: string } | null {
  const normalized = problem.trim();
  const patterns = [
    /integral\s+from\s+(.+?)\s+to\s+(.+?)\s+of\s+(.+?)\s*d([a-zA-Z])$/i,
    /integral\s*\[\s*(.+?)\s*,\s*(.+?)\s*\]\s*(.+?)\s*d([a-zA-Z])$/i,
    /∫\s*_\{?(.+?)\}?\s*\^\{?(.+?)\}?\s*(.+?)\s*d([a-zA-Z])$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const lower = parseBoundValue(match[1]);
    const upper = parseBoundValue(match[2]);
    if (lower === null || upper === null) return null;

    return {
      lower,
      upper,
      integrand: match[3].trim(),
      variable: match[4],
    };
  }

  return null;
}

function evaluateAntiderivativeAt(term: string, value: number, variable: string): number | null {
  const cleanTerm = term.trim().replace(/^\+/, '');

  let match = cleanTerm.match(/^(-?\d+\.?\d*)$/);
  if (match) {
    return parseFloat(match[1]) * value;
  }

  match = cleanTerm.match(new RegExp(`^(${variable})\\^(\\d+)$`, 'i'));
  if (match) {
    const n = parseInt(match[2], 10);
    return (value ** (n + 1)) / (n + 1);
  }

  match = cleanTerm.match(new RegExp(`^(-?\\d+\\.?\\d*)(${variable})\\^(\\d+)$`, 'i'));
  if (match) {
    const coef = parseFloat(match[1]);
    const n = parseInt(match[3], 10);
    return (coef * (value ** (n + 1))) / (n + 1);
  }

  match = cleanTerm.match(new RegExp(`^(${variable})$`, 'i'));
  if (match) {
    return (value ** 2) / 2;
  }

  match = cleanTerm.match(new RegExp(`^(-?\\d+\\.?\\d*)(${variable})$`, 'i'));
  if (match) {
    return (parseFloat(match[1]) * (value ** 2)) / 2;
  }

  match = cleanTerm.match(new RegExp(`^sin\\((${variable})\\)$`, 'i'));
  if (match) {
    return -Math.cos(value);
  }

  match = cleanTerm.match(new RegExp(`^cos\\((${variable})\\)$`, 'i'));
  if (match) {
    return Math.sin(value);
  }

  match = cleanTerm.match(new RegExp(`^e\\^(${variable})$`, 'i'));
  if (match) {
    return Math.exp(value);
  }

  match = cleanTerm.match(new RegExp(`^1\\/(${variable})$`, 'i'));
  if (match) {
    return value === 0 ? null : Math.log(Math.abs(value));
  }

  match = cleanTerm.match(new RegExp(`^sec\\^2\\((${variable})\\)$`, 'i'));
  if (match) {
    return Math.tan(value);
  }

  return null;
}

function solveIntegral(problem: string, isDefinite: boolean = false): MathSolution {
  const steps: MathStep[] = [];
  const parsedDefinite = isDefinite ? parseDefiniteIntegral(problem) : null;
  const variable = parsedDefinite?.variable || 'x';
  const expr = (parsedDefinite?.integrand || problem).toLowerCase()
    .replace(/integrate|integral\s+of|∫/gi, '')
    .replace(/integral\s+from\s+.+?\s+to\s+.+?\s+of/gi, '')
    .replace(/integral\s*\[\s*.+?\s*,\s*.+?\s*\]/gi, '')
    .replace(/d[a-zA-Z]$/i, '')
    .replace(/dx|dy|dz|dt/gi, '')
    .trim();

  steps.push({
    step: 1,
    description: isDefinite ? 'Identify the definite integral' : 'Identify the integrand',
    expression: parsedDefinite
      ? `\\int_{${parsedDefinite.lower}}^{${parsedDefinite.upper}} ${expr} \\, d${variable}`
      : `\\int ${expr} \\, d${variable}`,
    explanation: isDefinite
      ? `We need to find the antiderivative of ${expr} and evaluate it from ${parsedDefinite?.lower} to ${parsedDefinite?.upper}`
      : `We need to find the antiderivative of ${expr}`
  });

  // Check if it's a sum/difference of terms
  const terms = expr.split(/(?=[+-])/);

  if (terms.length > 1) {
    steps.push({
      step: 2,
      description: 'Apply Sum/Difference Rule',
      expression: `\\int [${terms.join(' ')}] \\, d${variable} = ${terms.map(t => `\\int ${t.trim()} \\, d${variable}`).join(' + ')}`,
      explanation: 'The integral of a sum is the sum of integrals'
    });

    const integrals: string[] = [];
    let stepNum = 3;

    for (const term of terms) {
      const cleanTerm = term.trim().replace(/^\+/, '');
      let found = false;

      for (const rule of integralRules) {
        const match = cleanTerm.match(rule.pattern);
        if (match) {
          const integ = rule.integral(match, variable);
          integrals.push(integ);
          steps.push({
            step: stepNum++,
            description: rule.name,
            expression: `\\int ${cleanTerm} \\, d${variable} = ${integ}`,
            explanation: rule.explanation
          });
          found = true;
          break;
        }
      }

      if (!found) {
        integrals.push(`\\int ${cleanTerm} \\, d${variable}`);
      }
    }

    const antiderivative = integrals.join(' + ').replace(/\+ -/g, '- ');
    let finalAnswer = `${antiderivative} + C`;

    if (isDefinite && parsedDefinite) {
      const upperValue = terms.reduce((sum, term) => {
        const value = evaluateAntiderivativeAt(term, parsedDefinite.upper, variable);
        return value === null ? Number.NaN : sum + value;
      }, 0);
      const lowerValue = terms.reduce((sum, term) => {
        const value = evaluateAntiderivativeAt(term, parsedDefinite.lower, variable);
        return value === null ? Number.NaN : sum + value;
      }, 0);

      if (!Number.isNaN(upperValue) && !Number.isNaN(lowerValue)) {
        const result = upperValue - lowerValue;
        steps.push({
          step: stepNum++,
          description: 'Evaluate the bounds',
          expression: `F(${parsedDefinite.upper}) - F(${parsedDefinite.lower}) = ${upperValue.toFixed(4)} - ${lowerValue.toFixed(4)} = ${result.toFixed(4)}`,
          explanation: 'Substitute the upper and lower bounds into the antiderivative and subtract.'
        });
        finalAnswer = Number.isInteger(result) ? String(result) : result.toFixed(4);
      } else {
        finalAnswer = `\\left[${antiderivative}\\right]_{${parsedDefinite.lower}}^{${parsedDefinite.upper}}`;
      }
    }

    steps.push({
      step: stepNum,
      description: isDefinite ? 'Combine terms' : 'Combine terms and add constant',
      expression: isDefinite
        ? `\\int_{${parsedDefinite?.lower}}^{${parsedDefinite?.upper}} ${expr} \\, d${variable} = ${finalAnswer}`
        : `\\int ${expr} \\, d${variable} = ${finalAnswer}`,
      explanation: isDefinite
        ? 'Combine the antiderivatives and apply the evaluation bounds.'
        : 'Combine all antiderivatives and add the constant of integration C'
    });

    return {
      problem,
      problemType: isDefinite ? 'definite-integral' : 'indefinite-integral',
      steps,
      finalAnswer,
      isOffline: true
    };
  }

  // Single term
  for (const rule of integralRules) {
    const match = expr.match(rule.pattern);
    if (match) {
      const integ = rule.integral(match, variable);
      steps.push({
        step: 2,
        description: rule.name,
        expression: `\\int ${expr} \\, d${variable} = ${integ}`,
        explanation: rule.explanation
      });

      let finalAnswer = integ + ' + C';

      if (isDefinite && parsedDefinite) {
        const upperValue = evaluateAntiderivativeAt(expr, parsedDefinite.upper, variable);
        const lowerValue = evaluateAntiderivativeAt(expr, parsedDefinite.lower, variable);

        if (upperValue !== null && lowerValue !== null) {
          const result = upperValue - lowerValue;
          steps.push({
            step: 3,
            description: 'Evaluate the bounds',
            expression: `F(${parsedDefinite.upper}) - F(${parsedDefinite.lower}) = ${upperValue.toFixed(4)} - ${lowerValue.toFixed(4)} = ${result.toFixed(4)}`,
            explanation: 'Substitute the upper and lower bounds into the antiderivative and subtract.'
          });
          finalAnswer = Number.isInteger(result) ? String(result) : result.toFixed(4);
        } else {
          finalAnswer = `\\left[${integ}\\right]_{${parsedDefinite.lower}}^{${parsedDefinite.upper}}`;
        }
      }

      steps.push({
        step: isDefinite ? 4 : 3,
        description: isDefinite ? 'Final evaluation' : 'Add constant of integration',
        expression: finalAnswer,
        explanation: isDefinite
          ? 'This is the value of the definite integral.'
          : 'Don\'t forget the constant of integration for indefinite integrals'
      });

      return {
        problem,
        problemType: isDefinite ? 'definite-integral' : 'indefinite-integral',
        steps,
        finalAnswer,
        isOffline: true
      };
    }
  }

  // Fallback
  return {
    problem,
    problemType: isDefinite ? 'definite-integral' : 'indefinite-integral',
    steps: [{
      step: 1,
      description: 'Complex integral',
      expression: isDefinite && parsedDefinite
        ? `\\int_{${parsedDefinite.lower}}^{${parsedDefinite.upper}} ${expr} \\, d${variable}`
        : `\\int ${expr} \\, d${variable}`,
      explanation: 'This integral requires advanced techniques like u-substitution, integration by parts, or partial fractions. Please use AI mode for step-by-step solution.'
    }],
    finalAnswer: isDefinite && parsedDefinite
      ? `\\int_{${parsedDefinite.lower}}^{${parsedDefinite.upper}} ${expr} \\, d${variable}`
      : `\\int ${expr} \\, d${variable}`,
    isOffline: true
  };
}

// ============ Quadratic Equation Solver ============

function solveQuadratic(problem: string): MathSolution {
  const steps: MathStep[] = [];

  // Try to extract coefficients from various formats
  let a = 1, b = 0, c = 0;

  // Format: ax^2 + bx + c = 0
  const standardMatch = problem.match(/(-?\d*)x\^2\s*([+-]\s*\d*)x\s*([+-]\s*\d+)\s*=\s*0/i);
  if (standardMatch) {
    a = standardMatch[1] === '' || standardMatch[1] === '-' ? (standardMatch[1] === '-' ? -1 : 1) : parseFloat(standardMatch[1]);
    b = parseFloat(standardMatch[2].replace(/\s/g, ''));
    c = parseFloat(standardMatch[3].replace(/\s/g, ''));
  }

  steps.push({
    step: 1,
    description: 'Identify coefficients',
    expression: `ax^2 + bx + c = 0 \\text{ where } a=${a}, b=${b}, c=${c}`,
    explanation: 'A quadratic equation has the form ax^2 + bx + c = 0'
  });

  // Calculate discriminant
  const discriminant = b * b - 4 * a * c;
  steps.push({
    step: 2,
    description: 'Calculate discriminant',
    expression: `\\Delta = b^2 - 4ac = (${b})^2 - 4(${a})(${c}) = ${discriminant}`,
    explanation: 'The discriminant tells us about the nature of the roots'
  });

  steps.push({
    step: 3,
    description: 'Apply quadratic formula',
    expression: `x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${-b} \\pm \\sqrt{${discriminant}}}{${2 * a}}`,
    explanation: 'The quadratic formula gives us the solutions'
  });

  let finalAnswer: string;

  if (discriminant > 0) {
    const sqrtDisc = Math.sqrt(discriminant);
    const x1 = (-b + sqrtDisc) / (2 * a);
    const x2 = (-b - sqrtDisc) / (2 * a);

    // Check if we can simplify
    const isWhole1 = Number.isInteger(x1) || Math.abs(x1 - Math.round(x1)) < 0.0001;
    const isWhole2 = Number.isInteger(x2) || Math.abs(x2 - Math.round(x2)) < 0.0001;

    if (isWhole1 && isWhole2) {
      finalAnswer = `x_1 = ${Math.round(x1)}, \\quad x_2 = ${Math.round(x2)}`;
    } else if (Number.isInteger(sqrtDisc)) {
      finalAnswer = `x_1 = \\frac{${-b} + ${sqrtDisc}}{${2 * a}} = ${x1.toFixed(4)}, \\quad x_2 = \\frac{${-b} - ${sqrtDisc}}{${2 * a}} = ${x2.toFixed(4)}`;
    } else {
      finalAnswer = `x = \\frac{${-b} \\pm \\sqrt{${discriminant}}}{${2 * a}}`;
    }

    steps.push({
      step: 4,
      description: 'Two real solutions',
      expression: finalAnswer,
      explanation: `Since the discriminant is positive (${discriminant} > 0), there are two distinct real solutions`
    });
  } else if (discriminant === 0) {
    const x = -b / (2 * a);
    finalAnswer = `x = ${Number.isInteger(x) ? x : x.toFixed(4)}`;
    steps.push({
      step: 4,
      description: 'One repeated solution',
      expression: finalAnswer,
      explanation: 'Since the discriminant is 0, there is exactly one solution (a repeated root)'
    });
  } else {
    const realPart = -b / (2 * a);
    const imagPart = Math.sqrt(-discriminant) / (2 * a);
    finalAnswer = `x = ${realPart.toFixed(2)} \\pm ${imagPart.toFixed(2)}i`;
    steps.push({
      step: 4,
      description: 'Two complex solutions',
      expression: finalAnswer,
      explanation: `Since the discriminant is negative (${discriminant} < 0), there are two complex conjugate solutions`
    });
  }

  return {
    problem,
    problemType: 'quadratic',
    steps,
    finalAnswer,
    isOffline: true
  };
}

// ============ Linear Equation Solver ============

function solveLinearEquation(problem: string): MathSolution {
  const steps: MathStep[] = [];

  // Try to parse: ax + b = c or ax = b
  const match = problem.match(/(-?\d*)x\s*([+-]\s*\d+)?\s*=\s*(-?\d+)/i);

  if (match) {
    const a = match[1] === '' || match[1] === '-' ? (match[1] === '-' ? -1 : 1) : parseFloat(match[1]);
    const b = match[2] ? parseFloat(match[2].replace(/\s/g, '')) : 0;
    const c = parseFloat(match[3]);

    steps.push({
      step: 1,
      description: 'Identify the equation',
      expression: `${a}x ${b >= 0 ? '+' : ''} ${b} = ${c}`,
      explanation: 'We need to isolate x'
    });

    if (b !== 0) {
      steps.push({
        step: 2,
        description: 'Subtract constant from both sides',
        expression: `${a}x = ${c} - (${b}) = ${c - b}`,
        explanation: `Move the constant term to the right side`
      });
    }

    const result = (c - b) / a;
    steps.push({
      step: b !== 0 ? 3 : 2,
      description: 'Divide by coefficient',
      expression: `x = \\frac{${c - b}}{${a}} = ${Number.isInteger(result) ? result : result.toFixed(4)}`,
      explanation: 'Divide both sides by the coefficient of x'
    });

    return {
      problem,
      problemType: 'linear-equation',
      steps,
      finalAnswer: `x = ${Number.isInteger(result) ? result : result.toFixed(4)}`,
      isOffline: true
    };
  }

  return {
    problem,
    problemType: 'linear-equation',
    steps: [{
      step: 1,
      description: 'Parse equation',
      expression: problem,
      explanation: 'Could not parse this equation format. Please try writing it as ax + b = c'
    }],
    finalAnswer: 'Unable to solve',
    isOffline: true
  };
}

// ============ Main Solver Function ============

export function solveOffline(problem: string): MathSolution {
  const problemType = detectProblemType(problem);

  switch (problemType) {
    case 'derivative':
      return solveDerivative(problem);

    case 'indefinite-integral':
    case 'definite-integral':
      return solveIntegral(problem, problemType === 'definite-integral');

    case 'quadratic':
      return solveQuadratic(problem);

    case 'linear-equation':
      return solveLinearEquation(problem);

    case 'arithmetic': {
      const expr = problem.replace(/calculate|evaluate|compute|what\s+is/gi, '').trim();
      const { result, steps } = evaluateArithmetic(expr);

      return {
        problem,
        problemType: 'arithmetic',
        steps,
        finalAnswer: isNaN(result) ? 'Unable to evaluate' : result.toString(),
        isOffline: true
      };
    }

    case 'limit':
      return {
        problem,
        problemType: 'limit',
        steps: [
          {
            step: 1,
            description: 'Identify the limit',
            expression: problem,
            explanation: 'First, try direct substitution. If that results in an indeterminate form (0/0, ∞/∞), apply L\'Hôpital\'s Rule or algebraic manipulation.'
          },
          {
            step: 2,
            description: 'Common techniques',
            expression: '\\text{Direct substitution, factoring, L\'Hôpital\'s Rule}',
            explanation: 'For complex limits, use AI mode for step-by-step solution.'
          }
        ],
        finalAnswer: 'Use AI mode for detailed solution',
        isOffline: true
      };

    case 'linear-algebra':
    case 'vectors':
    case 'series':
    case 'system':
      return {
        problem,
        problemType,
        steps: [{
          step: 1,
          description: 'Advanced topic',
          expression: problem,
          explanation: `This ${problemType.replace('-', ' ')} problem requires advanced computations. Please use AI mode for detailed step-by-step solution.`
        }],
        finalAnswer: 'Use AI mode for detailed solution',
        isOffline: true
      };

    default:
      return {
        problem,
        problemType: 'general',
        steps: [{
          step: 1,
          description: 'Problem identified',
          expression: problem,
          explanation: 'For best results with this problem type, please use AI mode.'
        }],
        finalAnswer: 'Use AI mode for detailed solution',
        isOffline: true
      };
  }
}
