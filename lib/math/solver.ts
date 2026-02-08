// Math Solver - Supports up to Calculus II
// Parses mathematical expressions and provides step-by-step solutions

export interface MathProblem {
  type: 'arithmetic' | 'algebra' | 'equation' | 'derivative' | 'integral' | 'limit' | 'unknown';
  original: string;
  parsed: string;
  variables: string[];
}

export interface MathStep {
  description: string;
  expression: string;
  explanation?: string;
}

export interface MathSolution {
  problem: MathProblem;
  steps: MathStep[];
  answer: string;
  answerType: 'numeric' | 'expression' | 'explanation';
}

// ============================================
// PARSING
// ============================================

function cleanExpression(expr: string): string {
  return expr
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'Math.PI')
    .replace(/e(?![a-z])/gi, 'Math.E')
    .trim();
}

function identifyProblemType(expr: string): MathProblem {
  const cleaned = cleanExpression(expr);
  const variables = extractVariables(cleaned);

  // Check for calculus keywords
  if (/d\/dx|derivative|differentiate|d\(|f'\(/i.test(expr)) {
    return { type: 'derivative', original: expr, parsed: cleaned, variables };
  }

  if (/∫|integral|integrate|antiderivative/i.test(expr)) {
    return { type: 'integral', original: expr, parsed: cleaned, variables };
  }

  if (/lim|limit|→|->|approaches/i.test(expr)) {
    return { type: 'limit', original: expr, parsed: cleaned, variables };
  }

  // Check for equation (has = sign)
  if (cleaned.includes('=') && !cleaned.startsWith('=')) {
    return { type: 'equation', original: expr, parsed: cleaned, variables };
  }

  // Check for algebra (has variables)
  if (variables.length > 0) {
    return { type: 'algebra', original: expr, parsed: cleaned, variables };
  }

  // Pure arithmetic
  if (/^[\d\s+\-*/().^]+$/.test(cleaned.replace(/Math\.(PI|E|sqrt|sin|cos|tan|log|abs|pow)/g, ''))) {
    return { type: 'arithmetic', original: expr, parsed: cleaned, variables: [] };
  }

  return { type: 'unknown', original: expr, parsed: cleaned, variables };
}

function extractVariables(expr: string): string[] {
  const cleaned = expr
    .replace(/Math\.(PI|E|sqrt|sin|cos|tan|log|ln|abs|pow)/gi, '')
    .replace(/\d+/g, '');

  const matches = cleaned.match(/[a-z]/gi) || [];
  return [...new Set(matches.map(v => v.toLowerCase()))];
}

// ============================================
// ARITHMETIC SOLVER
// ============================================

function solveArithmetic(problem: MathProblem): MathSolution {
  const steps: MathStep[] = [];
  let expr = problem.parsed;

  steps.push({
    description: 'Original expression',
    expression: problem.original,
  });

  // Handle special functions
  expr = expr
    .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
    .replace(/sin\(([^)]+)\)/g, 'Math.sin($1)')
    .replace(/cos\(([^)]+)\)/g, 'Math.cos($1)')
    .replace(/tan\(([^)]+)\)/g, 'Math.tan($1)')
    .replace(/log\(([^)]+)\)/g, 'Math.log10($1)')
    .replace(/ln\(([^)]+)\)/g, 'Math.log($1)')
    .replace(/abs\(([^)]+)\)/g, 'Math.abs($1)');

  try {
    // Safely evaluate
    const result = Function(`"use strict"; return (${expr})`)();

    if (typeof result === 'number' && !isNaN(result)) {
      const formatted = Number.isInteger(result) ? result.toString() : result.toFixed(6).replace(/\.?0+$/, '');

      steps.push({
        description: 'Calculate',
        expression: `= ${formatted}`,
        explanation: 'Evaluated the arithmetic expression',
      });

      return {
        problem,
        steps,
        answer: formatted,
        answerType: 'numeric',
      };
    }
  } catch {
    // Fall through to error
  }

  steps.push({
    description: 'Error',
    expression: 'Could not evaluate expression',
    explanation: 'Check for syntax errors or unsupported operations',
  });

  return {
    problem,
    steps,
    answer: 'Unable to solve',
    answerType: 'explanation',
  };
}

// ============================================
// EQUATION SOLVER
// ============================================

function solveLinearEquation(problem: MathProblem): MathSolution {
  const steps: MathStep[] = [];
  const [left, right] = problem.parsed.split('=').map(s => s.trim());

  steps.push({
    description: 'Original equation',
    expression: `${left} = ${right}`,
  });

  // Simple linear equation: ax + b = c or ax = c
  const variable = problem.variables[0] || 'x';

  // Parse coefficients
  const varRegex = new RegExp(`([+-]?\\d*)\\*?${variable}`, 'g');

  let leftCoef = 0;
  let leftConst = 0;
  let rightCoef = 0;
  let rightConst = 0;

  // Parse left side
  const tempLeft = left.replace(varRegex, (_m, coef) => {
    leftCoef += coef === '' || coef === '+' ? 1 : coef === '-' ? -1 : parseFloat(coef);
    return '';
  });
  leftConst = tempLeft ? eval(tempLeft) || 0 : 0;

  // Parse right side
  const tempRight = right.replace(varRegex, (_m, coef) => {
    rightCoef += coef === '' || coef === '+' ? 1 : coef === '-' ? -1 : parseFloat(coef);
    return '';
  });
  rightConst = tempRight ? eval(tempRight) || 0 : 0;

  steps.push({
    description: 'Identify coefficients',
    expression: `Left: ${leftCoef}${variable} + ${leftConst}, Right: ${rightCoef}${variable} + ${rightConst}`,
  });

  // Move variables to left, constants to right
  const finalCoef = leftCoef - rightCoef;
  const finalConst = rightConst - leftConst;

  steps.push({
    description: 'Rearrange terms',
    expression: `${finalCoef}${variable} = ${finalConst}`,
    explanation: `Move all ${variable} terms to left, constants to right`,
  });

  if (finalCoef === 0) {
    if (finalConst === 0) {
      return {
        problem,
        steps,
        answer: 'Infinite solutions (identity)',
        answerType: 'explanation',
      };
    } else {
      return {
        problem,
        steps,
        answer: 'No solution (contradiction)',
        answerType: 'explanation',
      };
    }
  }

  const solution = finalConst / finalCoef;

  steps.push({
    description: 'Solve for ' + variable,
    expression: `${variable} = ${finalConst} / ${finalCoef} = ${solution}`,
    explanation: 'Divide both sides by the coefficient',
  });

  return {
    problem,
    steps,
    answer: `${variable} = ${Number.isInteger(solution) ? solution : solution.toFixed(4).replace(/\.?0+$/, '')}`,
    answerType: 'expression',
  };
}

function solveQuadratic(problem: MathProblem): MathSolution {
  const steps: MathStep[] = [];

  steps.push({
    description: 'Original equation',
    expression: problem.original,
  });

  // Try to parse ax² + bx + c = 0
  const variable = problem.variables[0] || 'x';

  // Coefficients for quadratic equation ax² + bx + c = 0
  // This is simplified - in production you'd want a proper parser

  steps.push({
    description: 'Standard form',
    expression: `a${variable}² + b${variable} + c = 0`,
    explanation: 'Quadratic equation in standard form',
  });

  steps.push({
    description: 'Apply quadratic formula',
    expression: `${variable} = (-b ± √(b² - 4ac)) / 2a`,
  });

  steps.push({
    description: 'Note',
    expression: 'For complex quadratics, expand and identify a, b, c manually',
    explanation: 'Then use the quadratic formula: x = (-b ± √(b² - 4ac)) / 2a',
  });

  return {
    problem,
    steps,
    answer: 'Use quadratic formula with identified coefficients',
    answerType: 'explanation',
  };
}

// ============================================
// DERIVATIVE SOLVER
// ============================================

interface DerivativeRule {
  pattern: RegExp;
  name: string;
  apply: (match: RegExpMatchArray, variable: string) => { result: string; explanation: string };
}

const derivativeRules: DerivativeRule[] = [
  {
    // Constant
    pattern: /^(\d+)$/,
    name: 'Constant Rule',
    apply: () => ({ result: '0', explanation: 'The derivative of a constant is 0' }),
  },
  {
    // x^n (power rule)
    pattern: /^x\^(\d+)$|^x\*\*(\d+)$/,
    name: 'Power Rule',
    apply: (match) => {
      const n = parseInt(match[1] || match[2]);
      if (n === 1) return { result: '1', explanation: 'd/dx(x) = 1' };
      if (n === 2) return { result: `${n}x`, explanation: `d/dx(x²) = 2x` };
      return { result: `${n}x^${n-1}`, explanation: `d/dx(x^n) = n·x^(n-1)` };
    },
  },
  {
    // Just x
    pattern: /^x$/,
    name: 'Power Rule',
    apply: () => ({ result: '1', explanation: 'd/dx(x) = 1' }),
  },
  {
    // ax^n
    pattern: /^(\d+)x\^(\d+)$|^(\d+)x\*\*(\d+)$/,
    name: 'Power Rule with Coefficient',
    apply: (match) => {
      const a = parseInt(match[1] || match[3]);
      const n = parseInt(match[2] || match[4]);
      const newCoef = a * n;
      if (n === 1) return { result: `${a}`, explanation: `d/dx(${a}x) = ${a}` };
      if (n === 2) return { result: `${newCoef}x`, explanation: `d/dx(${a}x²) = ${newCoef}x` };
      return { result: `${newCoef}x^${n-1}`, explanation: `d/dx(ax^n) = a·n·x^(n-1)` };
    },
  },
  {
    // sin(x)
    pattern: /^sin\(x\)$/,
    name: 'Trigonometric Rule',
    apply: () => ({ result: 'cos(x)', explanation: 'd/dx(sin(x)) = cos(x)' }),
  },
  {
    // cos(x)
    pattern: /^cos\(x\)$/,
    name: 'Trigonometric Rule',
    apply: () => ({ result: '-sin(x)', explanation: 'd/dx(cos(x)) = -sin(x)' }),
  },
  {
    // e^x
    pattern: /^e\^x$|^Math\.E\*\*x$/,
    name: 'Exponential Rule',
    apply: () => ({ result: 'e^x', explanation: 'd/dx(e^x) = e^x' }),
  },
  {
    // ln(x)
    pattern: /^ln\(x\)$|^log\(x\)$/,
    name: 'Logarithmic Rule',
    apply: () => ({ result: '1/x', explanation: 'd/dx(ln(x)) = 1/x' }),
  },
];

function solveDerivative(problem: MathProblem): MathSolution {
  const steps: MathStep[] = [];

  // Extract the function to differentiate
  const func = problem.parsed
    .replace(/d\/dx\s*\(?/i, '')
    .replace(/derivative\s*of\s*/i, '')
    .replace(/differentiate\s*/i, '')
    .replace(/f'\(x\)\s*=?\s*/i, '')
    .replace(/\)$/, '')
    .trim();

  steps.push({
    description: 'Function to differentiate',
    expression: `f(x) = ${func}`,
  });

  // Try to match derivative rules
  const cleanFunc = cleanExpression(func);

  for (const rule of derivativeRules) {
    const match = cleanFunc.match(rule.pattern);
    if (match) {
      const { result, explanation } = rule.apply(match, 'x');

      steps.push({
        description: `Apply ${rule.name}`,
        expression: explanation,
      });

      steps.push({
        description: 'Result',
        expression: `f'(x) = ${result}`,
      });

      return {
        problem,
        steps,
        answer: `f'(x) = ${result}`,
        answerType: 'expression',
      };
    }
  }

  // Handle sum/difference (basic)
  if (cleanFunc.includes('+') || cleanFunc.includes('-')) {
    steps.push({
      description: 'Sum/Difference Rule',
      expression: 'd/dx[f(x) + g(x)] = f\'(x) + g\'(x)',
      explanation: 'Differentiate each term separately',
    });
  }

  // Handle product (basic guidance)
  if (cleanFunc.includes('*') && !cleanFunc.includes('**')) {
    steps.push({
      description: 'Product Rule',
      expression: 'd/dx[f(x)·g(x)] = f\'(x)·g(x) + f(x)·g\'(x)',
      explanation: 'Apply the product rule for multiplication',
    });
  }

  // Chain rule guidance
  steps.push({
    description: 'Common Derivative Rules',
    expression: `
• Power Rule: d/dx(x^n) = n·x^(n-1)
• Sum Rule: d/dx[f+g] = f' + g'
• Product Rule: d/dx[f·g] = f'·g + f·g'
• Chain Rule: d/dx[f(g(x))] = f'(g(x))·g'(x)
• d/dx(sin x) = cos x
• d/dx(cos x) = -sin x
• d/dx(e^x) = e^x
• d/dx(ln x) = 1/x`,
  });

  return {
    problem,
    steps,
    answer: 'Apply the appropriate derivative rules step by step',
    answerType: 'explanation',
  };
}

// ============================================
// INTEGRAL SOLVER
// ============================================

function solveIntegral(problem: MathProblem): MathSolution {
  const steps: MathStep[] = [];

  // Extract the function to integrate
  const func = problem.parsed
    .replace(/∫/g, '')
    .replace(/integral\s*of\s*/i, '')
    .replace(/integrate\s*/i, '')
    .replace(/dx$/i, '')
    .trim();

  steps.push({
    description: 'Function to integrate',
    expression: `∫ ${func} dx`,
  });

  const cleanFunc = cleanExpression(func);

  // Basic integral rules
  const integralRules = [
    { pattern: /^(\d+)$/, result: (m: RegExpMatchArray) => `${m[1]}x + C`, rule: 'Constant Rule' },
    { pattern: /^x$/, result: () => 'x²/2 + C', rule: 'Power Rule' },
    { pattern: /^x\^(\d+)$/, result: (m: RegExpMatchArray) => {
      const n = parseInt(m[1]);
      return `x^${n+1}/${n+1} + C`;
    }, rule: 'Power Rule' },
    { pattern: /^(\d+)x$/, result: (m: RegExpMatchArray) => `${m[1]}x²/2 + C`, rule: 'Power Rule with Coefficient' },
    { pattern: /^sin\(x\)$/, result: () => '-cos(x) + C', rule: 'Trigonometric Rule' },
    { pattern: /^cos\(x\)$/, result: () => 'sin(x) + C', rule: 'Trigonometric Rule' },
    { pattern: /^e\^x$/, result: () => 'e^x + C', rule: 'Exponential Rule' },
    { pattern: /^1\/x$/, result: () => 'ln|x| + C', rule: 'Logarithmic Rule' },
  ];

  for (const rule of integralRules) {
    const match = cleanFunc.match(rule.pattern);
    if (match) {
      const result = rule.result(match);

      steps.push({
        description: `Apply ${rule.rule}`,
        expression: `∫ x^n dx = x^(n+1)/(n+1) + C (for n ≠ -1)`,
      });

      steps.push({
        description: 'Result',
        expression: result,
      });

      return {
        problem,
        steps,
        answer: result,
        answerType: 'expression',
      };
    }
  }

  // General guidance
  steps.push({
    description: 'Common Integration Rules',
    expression: `
• Power Rule: ∫ x^n dx = x^(n+1)/(n+1) + C
• ∫ e^x dx = e^x + C
• ∫ 1/x dx = ln|x| + C
• ∫ sin(x) dx = -cos(x) + C
• ∫ cos(x) dx = sin(x) + C
• ∫ sec²(x) dx = tan(x) + C`,
  });

  steps.push({
    description: 'Integration Techniques',
    expression: `
• Substitution: Use for composite functions
• Integration by Parts: ∫ u dv = uv - ∫ v du
• Partial Fractions: For rational functions
• Trigonometric Substitution: For √(a²-x²), √(a²+x²), √(x²-a²)`,
  });

  return {
    problem,
    steps,
    answer: 'Apply appropriate integration technique',
    answerType: 'explanation',
  };
}

// ============================================
// LIMIT SOLVER
// ============================================

function solveLimit(problem: MathProblem): MathSolution {
  const steps: MathStep[] = [];

  steps.push({
    description: 'Limit problem',
    expression: problem.original,
  });

  steps.push({
    description: 'Approach',
    expression: `
1. Try direct substitution first
2. If 0/0 or ∞/∞, apply L'Hôpital's Rule
3. Factor and simplify if possible
4. Use limit laws for sums, products, quotients`,
  });

  steps.push({
    description: 'Limit Laws',
    expression: `
• lim[f(x) + g(x)] = lim f(x) + lim g(x)
• lim[f(x) · g(x)] = lim f(x) · lim g(x)
• lim[f(x)/g(x)] = lim f(x) / lim g(x) (if lim g(x) ≠ 0)
• lim c = c (constant)
• lim x = a (as x → a)`,
  });

  steps.push({
    description: "L'Hôpital's Rule",
    expression: "If lim f(x)/g(x) = 0/0 or ∞/∞, then lim f(x)/g(x) = lim f'(x)/g'(x)",
  });

  return {
    problem,
    steps,
    answer: 'Apply limit laws or L\'Hôpital\'s Rule',
    answerType: 'explanation',
  };
}

// ============================================
// MAIN SOLVER
// ============================================

export function solveMath(input: string): MathSolution {
  const problem = identifyProblemType(input);

  switch (problem.type) {
    case 'arithmetic':
      return solveArithmetic(problem);

    case 'equation':
      if (problem.parsed.includes('**2') || problem.parsed.includes('^2')) {
        return solveQuadratic(problem);
      }
      return solveLinearEquation(problem);

    case 'algebra':
      return {
        problem,
        steps: [
          { description: 'Expression', expression: problem.original },
          { description: 'Simplify', expression: 'Combine like terms and factor where possible' },
        ],
        answer: 'Simplify the algebraic expression',
        answerType: 'explanation',
      };

    case 'derivative':
      return solveDerivative(problem);

    case 'integral':
      return solveIntegral(problem);

    case 'limit':
      return solveLimit(problem);

    default:
      return {
        problem,
        steps: [
          { description: 'Input', expression: input },
          { description: 'Unable to identify problem type', expression: 'Please format as a clear mathematical expression' },
        ],
        answer: 'Could not parse the problem',
        answerType: 'explanation',
      };
  }
}

// Format solution for display
export function formatMathSolution(solution: MathSolution): string {
  const lines: string[] = [];

  lines.push('🧮 Math Solver');
  lines.push('');
  lines.push(`Problem Type: ${solution.problem.type.charAt(0).toUpperCase() + solution.problem.type.slice(1)}`);
  lines.push('');
  lines.push('━━━ Solution Steps ━━━');
  lines.push('');

  for (let i = 0; i < solution.steps.length; i++) {
    const step = solution.steps[i];
    lines.push(`Step ${i + 1}: ${step.description}`);
    lines.push(`   ${step.expression}`);
    if (step.explanation) {
      lines.push(`   → ${step.explanation}`);
    }
    lines.push('');
  }

  lines.push('━━━ Answer ━━━');
  lines.push('');
  lines.push(`📌 ${solution.answer}`);

  return lines.join('\n');
}

// Extract math problems from text
export function extractMathProblems(text: string): string[] {
  const problems: string[] = [];

  // Look for equations
  const equationPattern = /[a-z0-9\s+\-*/^()=]+\s*=\s*[a-z0-9\s+\-*/^()]+/gi;
  const equations = text.match(equationPattern) || [];
  problems.push(...equations.map(e => e.trim()));

  // Look for derivative notation
  const derivativePattern = /d\/dx\s*\([^)]+\)|derivative\s+of\s+[^\n.]+|f'\([^)]+\)/gi;
  const derivatives = text.match(derivativePattern) || [];
  problems.push(...derivatives.map(d => d.trim()));

  // Look for integral notation
  const integralPattern = /∫[^∫]+dx|integral\s+of\s+[^\n.]+|integrate\s+[^\n.]+/gi;
  const integrals = text.match(integralPattern) || [];
  problems.push(...integrals.map(i => i.trim()));

  // Look for arithmetic expressions
  const arithmeticPattern = /\d+\s*[+\-*/^]\s*[\d+\-*/^()\s]+/g;
  const arithmetic = text.match(arithmeticPattern) || [];
  problems.push(...arithmetic.map(a => a.trim()).filter(a => a.length < 50));

  return [...new Set(problems)].slice(0, 10);
}
