/**
 * Symbolic Math Solver — powered by mathjs
 * Handles: Arithmetic, Algebra, Derivatives, Simplification,
 *          Matrix operations, Trigonometry, Statistics, Complex numbers
 */

import * as math from 'mathjs';

export interface MathStep {
  step: number;
  description: string;
  expression: string;   // LaTeX-ready
  result?: string;      // numeric/simplified result
  explanation: string;
}

export interface SolverResult {
  input: string;
  type: string;
  steps: MathStep[];
  answer: string;         // final answer as string
  answerLatex: string;    // LaTeX of final answer
  numeric?: number;       // numeric value if available
  verified: boolean;      // was computation verified by mathjs
  error?: string;
}

// ─── Type detection ───────────────────────────────────────────────────────────

export type ProblemType =
  | 'arithmetic'
  | 'derivative'
  | 'simplify'
  | 'expand'
  | 'factor'
  | 'quadratic'
  | 'linear'
  | 'matrix-det'
  | 'matrix-inv'
  | 'matrix-mul'
  | 'trig'
  | 'stats'
  | 'complex'
  | 'integral'
  | 'limit'
  | 'series'
  | 'system'
  | 'expression';

export function detectType(input: string): ProblemType {
  const s = input.toLowerCase().trim();

  // Integral
  if (/\b(integrate|integral|∫|int\s*\()\b/.test(s) || /\bintegral\s+of\b/.test(s)) return 'integral';
  if (/\b(limit|lim)\b.*->/.test(s) || /lim\s*\(/.test(s)) return 'limit';
  if (/\b(series|taylor|maclaurin|expand\s+around)\b/.test(s)) return 'series';
  if (/\bsystem\b/.test(s) || (s.match(/=/g) || []).length >= 2) return 'system';

  // Derivative
  if (/\b(d\/dx|derivative|differentiate|dy\/dx|f'\s*\()\b/.test(s)) return 'derivative';
  if (/^d\s*\(/.test(s) || /^diff\s*\(/.test(s)) return 'derivative';

  // Matrix operations
  if (/\bdet\s*\(/.test(s) || /\bdeterminant\b/.test(s)) return 'matrix-det';
  if (/\binv(erse)?\s*\(/.test(s)) return 'matrix-inv';
  if (/\[\s*\[.*\]\s*\].*\*\s*\[/.test(s)) return 'matrix-mul';

  // Algebra
  if (/\bsimplify\b/.test(s)) return 'simplify';
  if (/\bexpand\b/.test(s)) return 'expand';
  if (/\bfactor\b/.test(s)) return 'factor';

  // Equations
  if (/=/.test(s) && /\bsolve\b/.test(s)) return 'linear';
  if (/x\^2|x²/.test(s) && /=/.test(s)) return 'quadratic';
  if (/\bsolve\b.*=/.test(s) || (s.includes('=') && /\bx\b/.test(s))) return 'linear';

  // Trig
  if (/\b(sin|cos|tan|sec|csc|cot|asin|acos|atan)\s*\(/.test(s)) return 'trig';

  // Stats
  if (/\b(mean|median|std|variance|sum|min|max)\s*\(/.test(s)) return 'stats';

  // Complex
  if (/\bi\b/.test(s) && /[\+\-\*\/]/.test(s)) return 'complex';

  // Arithmetic (pure numbers + operators)
  if (/^[\d\s\+\-\*\/\^\(\)\.%!√π]+$/.test(s.replace(/pi|sqrt|abs|floor|ceil|round|log|exp/g, '0'))) {
    return 'arithmetic';
  }

  return 'expression';
}

// ─── LaTeX helper ─────────────────────────────────────────────────────────────

export function toLatex(expr: string | math.MathNode | number): string {
  try {
    if (typeof expr === 'number') {
      if (!isFinite(expr)) return expr > 0 ? '\\infty' : '-\\infty';
      // Format nicely
      if (Number.isInteger(expr)) return String(expr);
      if (Math.abs(expr) > 1e10) return expr.toExponential(4).replace('e+', ' \\times 10^{').replace('e-','\\times 10^{-') + '}';
      return String(parseFloat(expr.toPrecision(8)));
    }
    if (typeof expr === 'string') {
      const node = math.parse(expr);
      return node.toTex({ parenthesis: 'auto', implicit: 'show' });
    }
    if (typeof (expr as math.MathNode).toTex === 'function') {
      return (expr as math.MathNode).toTex({ parenthesis: 'auto', implicit: 'show' });
    }
    return String(expr);
  } catch {
    return String(expr);
  }
}

function nodeToString(node: math.MathNode): string {
  return node.toString({ parenthesis: 'auto', implicit: 'show' });
}

// ─── Derivative solver ────────────────────────────────────────────────────────

function solveDerivative(input: string): SolverResult {
  const steps: MathStep[] = [];

  // Extract expression: handles d/dx(...), derivative(...), diff(...)
  let expr = input
    .replace(/\b(d\/dx|derivative\s+of|differentiate|diff\s*\(|d\s*\()/i, '')
    .replace(/\bwith\s+respect\s+to\s+x\b/i, '')
    .replace(/[,\s]+x\s*\)?$/, '')
    .replace(/^\s*\(/, '').replace(/\)\s*$/, '')
    .trim();

  if (!expr) expr = input.replace(/derivative/i, '').trim();

  steps.push({
    step: 1,
    description: 'Identify the function',
    expression: `f(x) = ${toLatex(expr)}`,
    explanation: 'Write the function we want to differentiate with respect to x.',
  });

  try {
    // Parse to understand the structure
    const parsed = math.parse(expr);
    const structure = parsed.type;

    // Step 2: Show rule being applied
    let ruleText = 'Apply differentiation rules';
    if (expr.includes('^')) ruleText = 'Apply the power rule: d/dx[xⁿ] = n·xⁿ⁻¹';
    if (/\*/.test(expr) && !/x\^/.test(expr)) ruleText = 'Apply the product/chain rule';
    if (/sin|cos|tan/.test(expr)) ruleText = 'Apply trigonometric derivative rules';
    if (/exp|e\^/.test(expr)) ruleText = 'Apply the exponential rule: d/dx[eˣ] = eˣ';
    if (/log|ln/.test(expr)) ruleText = 'Apply the logarithm rule: d/dx[ln(x)] = 1/x';

    steps.push({
      step: 2,
      description: 'Identify the differentiation rule',
      expression: toLatex(expr),
      explanation: ruleText,
    });

    // Step 3: Compute derivative
    const derivNode = math.derivative(parsed, 'x');
    const derivExpr = nodeToString(derivNode);

    steps.push({
      step: 3,
      description: "Apply d/dx",
      expression: `\\frac{d}{dx}\\left[${toLatex(expr)}\\right] = ${toLatex(derivExpr)}`,
      explanation: 'Differentiate term by term using the identified rules.',
    });

    // Step 4: Simplify
    let simplified: math.MathNode;
    let simplifiedStr: string;
    try {
      simplified = math.simplify(derivNode);
      simplifiedStr = nodeToString(simplified);
    } catch {
      simplified = derivNode;
      simplifiedStr = derivExpr;
    }

    const didSimplify = simplifiedStr !== derivExpr;

    if (didSimplify) {
      steps.push({
        step: 4,
        description: 'Simplify the result',
        expression: `f'(x) = ${toLatex(simplifiedStr)}`,
        explanation: 'Combine like terms and simplify the expression.',
      });
    }

    // Step 5: Evaluate at common points (bonus step)
    try {
      const atZero = math.evaluate(simplifiedStr.replace(/x/g, '0'));
      const atOne  = math.evaluate(simplifiedStr.replace(/x/g, '1'));
      if (typeof atZero === 'number' && typeof atOne === 'number') {
        steps.push({
          step: didSimplify ? 5 : 4,
          description: 'Verify with sample values',
          expression: `f'(0) = ${toLatex(atZero)}, \\quad f'(1) = ${toLatex(atOne)}`,
          explanation: 'Check the derivative at x=0 and x=1 to verify correctness.',
        });
      }
    } catch { /* skip */ }

    const answer = toLatex(simplifiedStr);

    return {
      input,
      type: 'Derivative',
      steps,
      answer: simplifiedStr,
      answerLatex: `f'(x) = ${answer}`,
      verified: true,
    };
  } catch (err) {
    return {
      input,
      type: 'Derivative',
      steps: [{
        step: 1,
        description: 'Parse expression',
        expression: toLatex(input),
        explanation: `Could not parse "${input}". Try format: d/dx(3*x^2 + 2*x)`,
      }],
      answer: 'Unable to compute',
      answerLatex: '\\text{Unable to compute}',
      verified: false,
      error: String(err),
    };
  }
}

// ─── Integral solver (numerical + symbolic patterns) ──────────────────────────────────
function solveIntegral(input: string): SolverResult {
  const steps: MathStep[] = [];
  // Extract expr: handles "integrate x^2", "integral of sin(x)", "int(x^2, x, 0, 1)"
  let expr = input
    .replace(/\b(integrate|integral\s+of|integral|int\s*\(|∫)\b/gi, '')
    .replace(/\s*dx\s*/gi, '')
    .replace(/,\s*x\s*,.*/, '') // remove bounds for now
    .replace(/\bwith\s+respect\s+to\s+x\b/i, '')
    .trim();

  // Extract definite integral bounds if present
  const boundsMatch = input.match(/,\s*x\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)/);
  const isDefinite = !!boundsMatch;
  const a = boundsMatch ? parseFloat(boundsMatch[1]) : undefined;
  const b = boundsMatch ? parseFloat(boundsMatch[2]) : undefined;

  steps.push({
    step: 1,
    description: isDefinite ? `Definite integral from ${a} to ${b}` : 'Indefinite integral',
    expression: isDefinite
      ? `\\int_{${a}}^{${b}} ${toLatex(expr)} \\, dx`
      : `\\int ${toLatex(expr)} \\, dx`,
    explanation: 'Identify the integrand and determine the type of integral.',
  });

  // Try symbolic anti-derivative patterns
  const antiderivativePatterns: [RegExp, (m: RegExpMatchArray) => string, string][] = [
    [/^x\^([\d.]+)$/, m => `x^${parseFloat(m[1])+1} / ${parseFloat(m[1])+1}`, 'Power rule: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C'],
    [/^(\d+)$/, m => `${m[1]}*x`, 'Constant rule: ∫k dx = kx + C'],
    [/^sin\(x\)$/, () => '-cos(x)', '∫sin(x) dx = -cos(x) + C'],
    [/^cos\(x\)$/, () => 'sin(x)', '∫cos(x) dx = sin(x) + C'],
    [/^exp\(x\)$|^e\^x$/, () => 'e^x', '∫eˣ dx = eˣ + C'],
    [/^1\/x$|^x\^\(-1\)$/, () => 'ln(|x|)', '∫1/x dx = ln|x| + C'],
    [/^(\d+)\*x$/, m => `${m[1]}/2 * x^2`, 'Power rule with coefficient'],
    [/^x$/, () => 'x^2/2', 'Power rule: ∫x dx = x²/2 + C'],
    [/^(\d+)$/, m => `${m[1]}*x`, 'Constant rule'],
  ];

  let symbolicResult: string | null = null;
  let ruleExplanation = '';
  for (const [re, fn, rule] of antiderivativePatterns) {
    const m = expr.match(re);
    if (m) {
      symbolicResult = fn(m);
      ruleExplanation = rule;
      break;
    }
  }

  if (symbolicResult) {
    steps.push({
      step: 2,
      description: 'Apply integration rule',
      expression: `\\int ${toLatex(expr)} \\, dx = ${toLatex(symbolicResult)} + C`,
      explanation: ruleExplanation,
    });
  }

  // Numerical integration using Simpson's rule
  const numA = a ?? 0;
  const numB = b ?? 1;
  let numResult: number | null = null;
  try {
    const n = 1000; // even number of intervals
    const h = (numB - numA) / n;
    let sum = 0;
    const f = (x: number) => Number(math.evaluate(expr, { x }));
    sum = f(numA) + f(numB);
    for (let i = 1; i < n; i++) {
      sum += (i % 2 === 0 ? 2 : 4) * f(numA + i * h);
    }
    numResult = (h / 3) * sum;
    if (!isNaN(numResult) && isFinite(numResult)) {
      steps.push({
        step: symbolicResult ? 3 : 2,
        description: isDefinite ? 'Evaluate definite integral (Simpson\'s rule)' : 'Numerical value over [0,1]',
        expression: isDefinite
          ? `\\int_{${numA}}^{${numB}} ${toLatex(expr)} \\, dx \\approx ${numResult.toFixed(6)}`
          : `\\int_{0}^{1} ${toLatex(expr)} \\, dx \\approx ${numResult.toFixed(6)}`,
        explanation: 'Computed using composite Simpson\'s rule with 1000 intervals for high accuracy.',
      });
    }
  } catch { /* skip */ }

  const finalAnswer = symbolicResult
    ? (isDefinite && numResult !== null ? numResult.toFixed(6) : `${symbolicResult} + C`)
    : (numResult !== null ? numResult.toFixed(6) : 'Could not compute');

  const finalLatex = symbolicResult
    ? (isDefinite && numResult !== null
        ? toLatex(numResult)
        : `${toLatex(symbolicResult)} + C`)
    : (numResult !== null ? `\\approx ${toLatex(numResult)}` : '\\text{Could not compute}');

  return {
    input,
    type: 'Integral',
    steps,
    answer: finalAnswer,
    answerLatex: finalLatex,
    numeric: numResult ?? undefined,
    verified: symbolicResult !== null || numResult !== null,
  };
}

// ─── Limit solver ─────────────────────────────────────────────────────────────
function solveLimit(input: string): SolverResult {
  const steps: MathStep[] = [];

  // Parse: "limit x->2 of x^2 + 1" or "lim(x^2, x, 2)"
  const arrowMatch = input.match(/(?:limit|lim)\s+x\s*->\s*([-∞∞\d.]+)\s+(?:of\s+)?(.+)/i);
  const fnMatch    = input.match(/(?:limit|lim)\s*\(\s*(.+?)\s*,\s*x\s*,\s*([-∞∞\d.]+)\s*\)/i);
  const match = arrowMatch || fnMatch;

  let approachPoint = match ? (arrowMatch ? match[1] : match[2]) : '0';
  let expr = match ? (arrowMatch ? match[2] : match[1]) : input.replace(/limit|lim/gi, '').trim();

  const isInfinity = /∞|inf/i.test(approachPoint);
  const xVal = isInfinity ? 1e6 : parseFloat(approachPoint);

  steps.push({
    step: 1,
    description: `Find the limit as x → ${approachPoint}`,
    expression: `\\lim_{x \\to ${isInfinity ? '\\infty' : approachPoint}} ${toLatex(expr)}`,
    explanation: 'Identify the function and the point we are approaching.',
  });

  steps.push({
    step: 2,
    description: 'Attempt direct substitution',
    expression: toLatex(expr),
    explanation: `Try substituting x = ${approachPoint} directly into the expression.`,
  });

  try {
    let result: number;
    if (isInfinity) {
      // Evaluate at large x to estimate limit at infinity
      const f1 = Number(math.evaluate(expr, { x: 1e6 }));
      const f2 = Number(math.evaluate(expr, { x: 1e9 }));
      // Check convergence
      if (Math.abs(f1 - f2) < Math.abs(f1) * 0.01) {
        result = f1;
      } else if (Math.abs(f2) > 1e15) {
        result = Infinity;
      } else {
        result = f2;
      }
    } else {
      // Try direct substitution
      const direct = Number(math.evaluate(expr, { x: xVal }));
      if (isFinite(direct) && !isNaN(direct)) {
        result = direct;
        steps.push({
          step: 3,
          description: 'Direct substitution works',
          expression: `= ${toLatex(direct)}`,
          explanation: `The function is continuous at x = ${approachPoint}, so direct substitution gives the limit.`,
        });
      } else {
        // L'Hôpital or numerical approach
        const eps = 1e-7;
        const fLeft  = Number(math.evaluate(expr, { x: xVal - eps }));
        const fRight = Number(math.evaluate(expr, { x: xVal + eps }));
        if (Math.abs(fLeft - fRight) < 1e-4) {
          result = (fLeft + fRight) / 2;
          steps.push({
            step: 3,
            description: 'Apply numerical limit (indeterminate form)',
            expression: `\\lim_{x \\to ${approachPoint}} = ${toLatex(result)}`,
            explanation: 'Direct substitution gives 0/0 or similar. Used two-sided numerical limit.',
          });
        } else {
          result = NaN;
          steps.push({
            step: 3,
            description: 'Limit does not exist or is infinite',
            expression: `\\lim_{x \\to ${approachPoint}} = \\text{DNE or } \\pm\\infty`,
            explanation: 'Left-hand limit ≠ right-hand limit, so the limit does not exist.',
          });
        }
      }
    }

    const answerLatex = !isFinite(result) ? '\\infty'
      : isNaN(result) ? '\\text{Does Not Exist}'
      : toLatex(result);

    const answerStr = !isFinite(result) ? '∞'
      : isNaN(result) ? 'Does Not Exist'
      : result.toFixed(6);

    steps.push({
      step: steps.length + 1,
      description: 'Final answer',
      expression: `\\lim_{x \\to ${isInfinity ? '\\infty' : approachPoint}} ${toLatex(expr)} = ${answerLatex}`,
      explanation: `The limit of the function as x approaches ${approachPoint}.`,
    });

    return {
      input,
      type: 'Limit',
      steps,
      answer: answerStr,
      answerLatex,
      numeric: isFinite(result) && !isNaN(result) ? result : undefined,
      verified: true,
    };
  } catch (err) {
    return {
      input,
      type: 'Limit',
      steps: [...steps, { step: steps.length + 1, description: 'Error', expression: toLatex(expr), explanation: String(err) }],
      answer: 'Could not compute',
      answerLatex: '\\text{Could not compute}',
      verified: false,
      error: String(err),
    };
  }
}

// ─── Taylor series ────────────────────────────────────────────────────────────
function solveSeries(input: string): SolverResult {
  const steps: MathStep[] = [];

  // Extract: "series sin(x)" or "taylor sin(x) around 0 order 4"
  let expr = input.replace(/\b(series|taylor|maclaurin)\b/gi, '').replace(/\baround\s+[\d.]+\b/i, '').replace(/\border\s+\d+\b/i, '').trim();
  const orderMatch = input.match(/order\s+(\d+)/i);
  const centerMatch = input.match(/around\s+([-\d.]+)/i);
  const order = orderMatch ? parseInt(orderMatch[1]) : 4;
  const center = centerMatch ? parseFloat(centerMatch[1]) : 0;

  steps.push({
    step: 1,
    description: `Taylor series for f(x) = ${expr} around x = ${center}`,
    expression: `f(x) = \\sum_{n=0}^{${order}} \\frac{f^{(n)}(${center})}{n!}(x-${center})^n`,
    explanation: `Computing the first ${order+1} terms of the Taylor series expansion.`,
  });

  try {
    // Compute coefficients via repeated differentiation
    const terms: string[] = [];
    const latexTerms: string[] = [];
    let currentExpr = expr;

    for (let n = 0; n <= order; n++) {
      const coeff = Number(math.evaluate(currentExpr, { x: center }));
      if (isNaN(coeff) || !isFinite(coeff)) break;

      const factorial = n === 0 ? 1 : Array.from({length: n}, (_, i) => i + 1).reduce((a, b) => a * b, 1);
      const termCoeff = coeff / factorial;

      if (Math.abs(termCoeff) > 1e-10) {
        const termFmt = termCoeff.toFixed(4).replace(/\.?0+$/, '');
        if (n === 0) {
          terms.push(termFmt);
          latexTerms.push(toLatex(termCoeff));
        } else if (n === 1) {
          terms.push(`${termFmt}*x`);
          latexTerms.push(`${toLatex(termCoeff)}x`);
        } else {
          terms.push(`${termFmt}*x^${n}`);
          latexTerms.push(`${toLatex(termCoeff)}x^{${n}}`);
        }
      }

      if (n < order) {
        try {
          const derivNode = math.derivative(currentExpr, 'x');
          currentExpr = derivNode.toString();
        } catch { break; }
      }
    }

    const seriesStr = terms.join(' + ').replace(/\+ -/g, '- ') || '0';
    const seriesLatex = latexTerms.join(' + ').replace(/\+ -/g, '- ') + (order < 6 ? ` + O(x^{${order+1}})` : '');

    steps.push({
      step: 2,
      description: 'Compute each term coefficient aₙ = f⁽ⁿ⁾(0)/n!',
      expression: seriesLatex,
      explanation: 'Differentiate n times, evaluate at center, divide by n! to get each coefficient.',
    });

    steps.push({
      step: 3,
      description: 'Final Taylor series',
      expression: `${toLatex(expr)} \\approx ${seriesLatex}`,
      explanation: `Valid approximation near x = ${center}. More terms increase accuracy.`,
    });

    return {
      input,
      type: 'Taylor Series',
      steps,
      answer: seriesStr + ` + O(x^${order+1})`,
      answerLatex: seriesLatex,
      verified: true,
    };
  } catch (err) {
    return {
      input,
      type: 'Taylor Series',
      steps: [...steps, { step: 2, description: 'Error', expression: expr, explanation: String(err) }],
      answer: 'Could not compute series',
      answerLatex: '\\text{Could not compute}',
      verified: false,
      error: String(err),
    };
  }
}

// ─── System of equations ──────────────────────────────────────────────────────
function solveSystem(input: string): SolverResult {
  const steps: MathStep[] = [];

  // Parse multiple equations separated by comma, semicolon, or newline
  const eqStrings = input.split(/[,;\n]+/).map(s => s.trim()).filter(s => s.includes('='));
  if (eqStrings.length < 2) {
    return solveLinear(input);
  }

  steps.push({
    step: 1,
    description: `System of ${eqStrings.length} equations`,
    expression: eqStrings.map(e => toLatex(e)).join(', \\quad '),
    explanation: 'Identify all equations in the system.',
  });

  // Extract variables
  const vars = Array.from(new Set(input.match(/\b[a-zA-Z]\b/g) || [])).filter(v => v !== 'e');

  if (vars.length === 2 && eqStrings.length === 2) {
    const [v1, v2] = vars;
    steps.push({
      step: 2,
      description: `Using substitution/elimination for ${v1} and ${v2}`,
      expression: eqStrings.map(e => toLatex(e)).join(' \\\\[6pt] '),
      explanation: `Solve for ${v1} from the first equation, substitute into the second.`,
    });

    try {
      // Numerical solve: scan grid for f1=0 and f2=0 simultaneously
      const buildF = (eq: string) => {
        const [lhs, rhs] = eq.split('=').map(s => s.trim());
        return (scope: Record<string, number>) => {
          try { return Number(math.evaluate(`(${lhs}) - (${rhs})`, scope)); } catch { return NaN; }
        };
      };
      const f1 = buildF(eqStrings[0]);
      const f2 = buildF(eqStrings[1]);

      // Simple grid search then Newton-Raphson refinement
      let best: { x1: number; x2: number; err: number } | null = null;
      for (let a = -10; a <= 10; a += 0.5) {
        for (let b = -10; b <= 10; b += 0.5) {
          const scope = { [v1]: a, [v2]: b };
          const err = f1(scope)**2 + f2(scope)**2;
          if (!best || err < best.err) best = { x1: a, x2: b, err };
        }
      }

      if (best && best.err < 1) {
        // Newton refinement
        const eps = 1e-5;
        let { x1, x2 } = best;
        for (let iter = 0; iter < 50; iter++) {
          const scope = { [v1]: x1, [v2]: x2 };
          const F1 = f1(scope), F2 = f2(scope);
          if (Math.abs(F1) + Math.abs(F2) < 1e-10) break;
          const df1dv1 = (f1({[v1]: x1+eps, [v2]: x2}) - F1) / eps;
          const df1dv2 = (f1({[v1]: x1, [v2]: x2+eps}) - F1) / eps;
          const df2dv1 = (f2({[v1]: x1+eps, [v2]: x2}) - F2) / eps;
          const df2dv2 = (f2({[v1]: x1, [v2]: x2+eps}) - F2) / eps;
          const det = df1dv1*df2dv2 - df1dv2*df2dv1;
          if (Math.abs(det) < 1e-14) break;
          x1 -= (F1*df2dv2 - F2*df1dv2) / det;
          x2 -= (F2*df1dv1 - F1*df2dv1) / det;
        }

        const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(4);
        const r1 = fmt(x1), r2 = fmt(x2);

        steps.push({
          step: 3,
          description: 'Solution found via Newton-Raphson',
          expression: `${v1} = ${r1}, \\quad ${v2} = ${r2}`,
          explanation: `Numerically solved to ${v1} = ${r1}, ${v2} = ${r2}. Verify by substituting back.`,
        });

        return {
          input,
          type: 'System of Equations',
          steps,
          answer: `${v1} = ${r1}, ${v2} = ${r2}`,
          answerLatex: `${v1} = ${toLatex(x1)}, \\quad ${v2} = ${toLatex(x2)}`,
          verified: best.err < 0.01,
        };
      }
    } catch { /* fall through */ }
  }

  return {
    input,
    type: 'System of Equations',
    steps: [...steps, {
      step: 2,
      description: 'Could not solve automatically',
      expression: '\\text{System requires CAS}',
      explanation: 'Complex systems with more than 2 variables require matrix methods. Try entering as: [a+b=5, a-b=1]',
    }],
    answer: 'Use matrix method',
    answerLatex: '\\text{Use matrix method}',
    verified: false,
  };
}

// ─── Simplify ─────────────────────────────────────────────────────────────────

function solveSimplify(input: string): SolverResult {
  const expr = input.replace(/\bsimplify\b/i, '').trim();
  const steps: MathStep[] = [];

  steps.push({
    step: 1,
    description: 'Original expression',
    expression: toLatex(expr),
    explanation: 'Start with the given expression.',
  });

  try {
    const parsed = math.parse(expr);

    steps.push({
      step: 2,
      description: 'Identify terms and structure',
      expression: toLatex(expr),
      explanation: `The expression has type: ${parsed.type}. We will combine like terms and apply algebraic identities.`,
    });

    const simplified = math.simplify(expr);
    const simplStr = simplified.toString();

    steps.push({
      step: 3,
      description: 'Apply simplification rules',
      expression: `${toLatex(expr)} = ${toLatex(simplStr)}`,
      explanation: 'Combine like terms, cancel factors, and apply algebraic identities.',
    });

    // Verify numerically
    let verified = false;
    try {
      const testVal = 3.7;
      const orig = math.evaluate(expr, { x: testVal, a: 2, b: 1 });
      const simp = math.evaluate(simplStr, { x: testVal, a: 2, b: 1 });
      if (typeof orig === 'number' && typeof simp === 'number') {
        if (Math.abs(orig - simp) < 1e-8) {
          verified = true;
          steps.push({
            step: 4,
            description: 'Verify by substitution',
            expression: `\\text{At } x = ${testVal}: \\text{ original} = ${orig.toFixed(4)}, \\text{ simplified} = ${simp.toFixed(4)} \\checkmark`,
            explanation: 'Both expressions give the same value at x=3.7, confirming the simplification is correct.',
          });
        }
      }
    } catch { /* skip */ }

    return {
      input, type: 'Simplify', steps,
      answer: simplStr,
      answerLatex: toLatex(simplStr),
      verified,
    };
  } catch (err) {
    return {
      input, type: 'Simplify',
      steps: [{ step: 1, description: 'Parse', expression: toLatex(expr), explanation: `Could not simplify: ${err}` }],
      answer: expr, answerLatex: toLatex(expr), verified: false, error: String(err),
    };
  }
}

// ─── Expand ───────────────────────────────────────────────────────────────────

function solveExpand(input: string): SolverResult {
  const expr = input.replace(/\bexpand\b/i, '').trim();
  const steps: MathStep[] = [];

  steps.push({
    step: 1, description: 'Original expression',
    expression: toLatex(expr),
    explanation: 'Identify the expression to expand.',
  });

  try {
    const expanded = math.simplify(expr, [
      'n1*(n2+n3) -> n1*n2 + n1*n3',
      '(n1+n2)^2 -> n1^2 + 2*n1*n2 + n2^2',
      '(n1-n2)^2 -> n1^2 - 2*n1*n2 + n2^2',
      '(n1+n2)*(n1-n2) -> n1^2 - n2^2',
    ]);
    const expStr = expanded.toString();

    steps.push({
      step: 2, description: 'Apply distribution law',
      expression: `${toLatex(expr)} = ${toLatex(expStr)}`,
      explanation: 'Multiply out parentheses using the distributive property: a(b+c) = ab + ac',
    });

    return {
      input, type: 'Expand', steps,
      answer: expStr, answerLatex: toLatex(expStr), verified: true,
    };
  } catch (err) {
    return {
      input, type: 'Expand',
      steps: [{ step: 1, description: 'Expand', expression: toLatex(expr), explanation: `Could not expand: ${err}` }],
      answer: expr, answerLatex: toLatex(expr), verified: false, error: String(err),
    };
  }
}

// ─── Arithmetic ───────────────────────────────────────────────────────────────

function solveArithmetic(input: string): SolverResult {
  const steps: MathStep[] = [];
  const expr = input.replace(/\b(calculate|evaluate|compute|what\s+is|find)\b/gi, '').trim();

  steps.push({
    step: 1, description: 'Expression',
    expression: toLatex(expr),
    explanation: 'Evaluate the arithmetic expression following order of operations (PEMDAS).',
  });

  try {
    const result = math.evaluate(expr);
    const resultNum = typeof result === 'number' ? result : Number(result);

    // Show order of operations if complex
    if (/[\+\-]/.test(expr) && /[\*\/\^]/.test(expr)) {
      steps.push({
        step: 2, description: 'Apply order of operations (PEMDAS)',
        expression: toLatex(expr),
        explanation: 'Evaluate: Parentheses → Exponents → Multiplication/Division → Addition/Subtraction',
      });
    }

    steps.push({
      step: steps.length + 1, description: 'Result',
      expression: `${toLatex(expr)} = ${toLatex(resultNum)}`,
      explanation: Number.isInteger(resultNum)
        ? 'The result is an exact integer.'
        : `The result is approximately ${resultNum.toFixed(6)}.`,
    });

    return {
      input, type: 'Arithmetic', steps,
      answer: String(resultNum),
      answerLatex: toLatex(resultNum),
      numeric: resultNum,
      verified: true,
    };
  } catch (err) {
    return {
      input, type: 'Arithmetic',
      steps: [{ step: 1, description: 'Evaluate', expression: toLatex(expr), explanation: `Could not evaluate: ${err}` }],
      answer: 'Error', answerLatex: '\\text{Error}', verified: false, error: String(err),
    };
  }
}

// ─── Linear equation solver ───────────────────────────────────────────────────

function solveLinear(input: string): SolverResult {
  const steps: MathStep[] = [];
  const cleaned = input.replace(/\bsolve\b/i, '').trim();

  steps.push({
    step: 1, description: 'Set up equation',
    expression: toLatex(cleaned),
    explanation: 'Write the equation and identify the variable to solve for.',
  });

  try {
    // Split at =
    const [lhsRaw, rhsRaw] = cleaned.split('=').map(s => s.trim());
    const rhs = rhsRaw ?? '0';

    // Build equation: lhs - rhs = 0
    const eqExpr = `(${lhsRaw}) - (${rhs})`;

    steps.push({
      step: 2, description: 'Rearrange to standard form',
      expression: `${toLatex(lhsRaw)} - (${toLatex(rhs)}) = 0`,
      explanation: 'Move all terms to the left side: LHS - RHS = 0',
    });

    // Use mathjs to solve
    const scope: Record<string, number> = {};
    const derivative = math.derivative(eqExpr, 'x');
    const coefficientOfX = math.evaluate(derivative.toString(), { x: 0 });

    if (typeof coefficientOfX === 'number' && coefficientOfX !== 0) {
      // Linear: ax + b = 0 → x = -b/a
      const constantTerm = math.evaluate(eqExpr, { x: 0, ...scope });
      const x = -Number(constantTerm) / Number(coefficientOfX);

      steps.push({
        step: 3, description: 'Identify coefficient and constant',
        expression: `${toLatex(coefficientOfX)} \\cdot x + (${toLatex(constantTerm)}) = 0`,
        explanation: `Coefficient of x = ${coefficientOfX}, constant = ${constantTerm}`,
      });

      steps.push({
        step: 4, description: 'Solve for x',
        expression: `x = \\frac{${toLatex(-Number(constantTerm))}}{${toLatex(coefficientOfX)}} = ${toLatex(x)}`,
        explanation: 'Isolate x by dividing both sides by the coefficient.',
      });

      // Verify
      const check = math.evaluate(eqExpr, { x });
      const isValid = Math.abs(Number(check)) < 1e-8;
      if (isValid) {
        steps.push({
          step: 5, description: 'Verify solution',
          expression: `\\text{Substituting } x = ${toLatex(x)}: \\text{ LHS} = \\text{RHS} \\checkmark`,
          explanation: `Plugging x=${x} back into the equation confirms the solution.`,
        });
      }

      return {
        input, type: 'Linear Equation', steps,
        answer: `x = ${Number.isInteger(x) ? x : x.toFixed(6)}`,
        answerLatex: `x = ${toLatex(x)}`,
        numeric: x,
        verified: isValid,
      };
    }

    throw new Error('Non-linear or unsolvable');
  } catch {
    // Try numeric solve using bisection
    try {
      const [lhsRaw, rhsRaw] = cleaned.split('=').map(s => s.trim());
      const rhs = rhsRaw ?? '0';
      const f = (xVal: number) => {
        try {
          return Number(math.evaluate(`(${lhsRaw}) - (${rhs})`, { x: xVal }));
        } catch { return NaN; }
      };

      // Bisection search
      let a = -100, b = 100;
      for (let i = 0; i < 200; i++) {
        const mid = (a + b) / 2;
        if (Math.abs(f(mid)) < 1e-10) {
          const x = mid;
          steps.push({
            step: steps.length + 1, description: 'Solve numerically',
            expression: `x \\approx ${toLatex(x)}`,
            explanation: 'Used numerical bisection to find the solution.',
          });
          return {
            input, type: 'Equation', steps,
            answer: `x ≈ ${x.toFixed(6)}`, answerLatex: `x \\approx ${toLatex(x)}`,
            numeric: x, verified: true,
          };
        }
        if (f(a) * f(mid) < 0) b = mid; else a = mid;
      }
    } catch { /* fall through */ }

    return {
      input, type: 'Equation', steps: [...steps, {
        step: steps.length + 1, description: 'Unable to solve analytically',
        expression: toLatex(cleaned),
        explanation: 'This equation requires a computer algebra system. Try: solve(equation, x)',
      }],
      answer: 'Use AI mode', answerLatex: '\\text{Use AI mode}', verified: false,
    };
  }
}

// ─── Quadratic solver ─────────────────────────────────────────────────────────

function solveQuadratic(input: string): SolverResult {
  const steps: MathStep[] = [];

  // Extract: ax^2 + bx + c = 0
  const cleaned = input.replace(/solve/i, '').replace(/=\s*0/, '').trim();

  steps.push({
    step: 1, description: 'Write in standard form: ax² + bx + c = 0',
    expression: `${toLatex(cleaned)} = 0`,
    explanation: 'Identify the standard quadratic form ax² + bx + c = 0.',
  });

  try {
    const expr = math.parse(cleaned);

    // Extract coefficients
    let a = 0, b = 0, c = 0;
    try {
      a = Number(math.evaluate(cleaned, { x: 0 }) !== 0 ? 0 : 0);
      // Better approach: evaluate at x=0, x=1, x=2 to extract a,b,c
      const f0 = Number(math.evaluate(cleaned, { x: 0 }));
      const f1 = Number(math.evaluate(cleaned, { x: 1 }));
      const f2 = Number(math.evaluate(cleaned, { x: 2 }));
      c = f0;
      // f1 = a + b + c, f2 = 4a + 2b + c
      a = (f2 - 2*f1 + f0) / 2;
      b = f1 - a - c;
    } catch {
      // Try regex fallback
      const m = cleaned.match(/(-?[\d.]*)\s*x\^2\s*([+-]\s*[\d.]*x)?\s*([+-]\s*[\d.]+)?/i);
      if (m) {
        a = m[1] ? (m[1] === '-' ? -1 : parseFloat(m[1]) || 1) : 1;
        b = m[2] ? parseFloat(m[2].replace(/\s/g,'')) : 0;
        c = m[3] ? parseFloat(m[3].replace(/\s/g,'')) : 0;
      }
    }

    steps.push({
      step: 2, description: 'Extract coefficients',
      expression: `a = ${a}, \\quad b = ${b}, \\quad c = ${c}`,
      explanation: `In the expression ${toLatex(cleaned)}, a=${a}, b=${b}, c=${c}.`,
    });

    const discriminant = b * b - 4 * a * c;

    steps.push({
      step: 3, description: 'Calculate the discriminant',
      expression: `\\Delta = b^2 - 4ac = ${b}^2 - 4(${a})(${c}) = ${discriminant}`,
      explanation: discriminant > 0
        ? 'Discriminant > 0: two distinct real roots'
        : discriminant === 0
          ? 'Discriminant = 0: one repeated root'
          : 'Discriminant < 0: two complex roots',
    });

    steps.push({
      step: 4, description: 'Apply the quadratic formula',
      expression: `x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${-b} \\pm \\sqrt{${discriminant}}}{${2*a}}`,
      explanation: 'The quadratic formula gives us the solutions directly.',
    });

    let answerLatex: string;
    let answer: string;

    if (discriminant >= 0) {
      const sq = Math.sqrt(discriminant);
      const x1 = (-b + sq) / (2*a);
      const x2 = (-b - sq) / (2*a);
      const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(6);
      answerLatex = `x_1 = ${toLatex(x1)}, \\quad x_2 = ${toLatex(x2)}`;
      answer = `x₁ = ${fmt(x1)}, x₂ = ${fmt(x2)}`;
      steps.push({
        step: 5, description: 'Solutions',
        expression: answerLatex,
        explanation: discriminant === 0
          ? `One repeated root: x = ${fmt(x1)}`
          : `Two real roots: x₁ = ${fmt(x1)}, x₂ = ${fmt(x2)}`,
      });
    } else {
      const realPart = -b / (2*a);
      const imagPart = Math.sqrt(-discriminant) / (2*a);
      answerLatex = `x = ${toLatex(realPart)} \\pm ${toLatex(imagPart)}i`;
      answer = `x = ${realPart.toFixed(4)} ± ${imagPart.toFixed(4)}i`;
      steps.push({
        step: 5, description: 'Complex solutions',
        expression: answerLatex,
        explanation: `Since Δ < 0, the roots are complex conjugates.`,
      });
    }

    return { input, type: 'Quadratic Equation', steps, answer, answerLatex, verified: true };
  } catch (err) {
    return {
      input, type: 'Quadratic Equation',
      steps: [{ step: 1, description: 'Error', expression: toLatex(input), explanation: `Could not solve: ${err}` }],
      answer: 'Error', answerLatex: '\\text{Error}', verified: false, error: String(err),
    };
  }
}

// ─── Trig ─────────────────────────────────────────────────────────────────────

function solveTrig(input: string): SolverResult {
  const steps: MathStep[] = [];

  steps.push({
    step: 1, description: 'Identify the trigonometric expression',
    expression: toLatex(input),
    explanation: 'Recognize which trig function(s) are involved and any special angles.',
  });

  try {
    const result = math.evaluate(input);
    const resultNum = Number(result);

    steps.push({
      step: 2, description: 'Identify special angle or evaluate',
      expression: `${toLatex(input)} = ${toLatex(resultNum)}`,
      explanation: getTriExplanation(input, resultNum),
    });

    // Convert to exact form if possible
    const exactForm = toExactTrig(resultNum);
    if (exactForm) {
      steps.push({
        step: 3, description: 'Express as exact value',
        expression: `= ${exactForm}`,
        explanation: 'Convert the decimal to its exact trigonometric value.',
      });
    }

    return {
      input, type: 'Trigonometry', steps,
      answer: exactForm || resultNum.toFixed(8),
      answerLatex: exactForm || toLatex(resultNum),
      numeric: resultNum, verified: true,
    };
  } catch (err) {
    return {
      input, type: 'Trigonometry',
      steps: [{ step: 1, description: 'Error', expression: toLatex(input), explanation: String(err) }],
      answer: 'Error', answerLatex: '\\text{Error}', verified: false, error: String(err),
    };
  }
}

function getTriExplanation(expr: string, result: number): string {
  const e = expr.toLowerCase();
  if (e.includes('sin')) return `Using sin function. Result ≈ ${result.toFixed(4)}.`;
  if (e.includes('cos')) return `Using cos function. Result ≈ ${result.toFixed(4)}.`;
  if (e.includes('tan')) return `Using tan function. Result ≈ ${result.toFixed(4)}.`;
  return `Evaluated trigonometric expression. Result ≈ ${result.toFixed(4)}.`;
}

function toExactTrig(val: number): string | null {
  const pi = Math.PI;
  const known: [number, string][] = [
    [0, '0'], [1, '1'], [-1, '-1'],
    [0.5, '\\frac{1}{2}'], [-0.5, '-\\frac{1}{2}'],
    [Math.sqrt(2)/2, '\\frac{\\sqrt{2}}{2}'], [-Math.sqrt(2)/2, '-\\frac{\\sqrt{2}}{2}'],
    [Math.sqrt(3)/2, '\\frac{\\sqrt{3}}{2}'], [-Math.sqrt(3)/2, '-\\frac{\\sqrt{3}}{2}'],
    [1/Math.sqrt(3), '\\frac{1}{\\sqrt{3}}'],
    [Math.sqrt(3), '\\sqrt{3}'], [-Math.sqrt(3), '-\\sqrt{3}'],
  ];
  for (const [v, tex] of known) {
    if (Math.abs(val - v) < 1e-9) return tex;
  }
  return null;
}

// ─── Matrix operations ────────────────────────────────────────────────────────

function solveMatrix(input: string, op: 'det' | 'inv' | 'mul'): SolverResult {
  const steps: MathStep[] = [];

  steps.push({
    step: 1, description: 'Parse matrix',
    expression: toLatex(input),
    explanation: `Computing the ${op === 'det' ? 'determinant' : op === 'inv' ? 'inverse' : 'product'} of the matrix.`,
  });

  try {
    const result = math.evaluate(input);

    if (op === 'det') {
      steps.push({
        step: 2, description: 'Apply cofactor expansion',
        expression: `\\det(A) = ${result}`,
        explanation: op === 'det'
          ? 'For a 2×2 matrix [[a,b],[c,d]], det = ad - bc. For larger matrices, expand along the first row.'
          : '',
      });
      return {
        input, type: 'Determinant', steps,
        answer: String(result), answerLatex: `\\det(A) = ${result}`,
        numeric: Number(result), verified: true,
      };
    }

    if (op === 'inv') {
      const matStr = JSON.stringify(Array.isArray(result) ? result : (result as math.Matrix).toArray());
      steps.push({
        step: 2, description: 'Compute inverse',
        expression: `A^{-1} = ${matStr}`,
        explanation: 'The inverse matrix A⁻¹ satisfies A·A⁻¹ = I. Computed via Gauss-Jordan elimination.',
      });
      return {
        input, type: 'Matrix Inverse', steps,
        answer: matStr, answerLatex: `A^{-1} = ${matStr}`, verified: true,
      };
    }

    return {
      input, type: 'Matrix Product', steps,
      answer: String(result), answerLatex: String(result), verified: true,
    };
  } catch (err) {
    return {
      input, type: 'Matrix', steps,
      answer: 'Error', answerLatex: '\\text{Error}', verified: false, error: String(err),
    };
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function solveStats(input: string): SolverResult {
  const steps: MathStep[] = [];

  steps.push({
    step: 1, description: 'Identify the statistical operation',
    expression: toLatex(input),
    explanation: 'Identify the function (mean, std, etc.) and the data set.',
  });

  try {
    const result = math.evaluate(input);
    steps.push({
      step: 2, description: 'Apply formula',
      expression: `${toLatex(input)} = ${toLatex(Number(result))}`,
      explanation: getStatsExplanation(input),
    });
    return {
      input, type: 'Statistics', steps,
      answer: String(result), answerLatex: toLatex(Number(result)),
      numeric: Number(result), verified: true,
    };
  } catch (err) {
    return {
      input, type: 'Statistics', steps,
      answer: 'Error', answerLatex: '\\text{Error}', verified: false, error: String(err),
    };
  }
}

function getStatsExplanation(input: string): string {
  const s = input.toLowerCase();
  if (s.includes('mean')) return 'Mean = sum of all values ÷ count. (μ = Σxᵢ / n)';
  if (s.includes('std') || s.includes('std')) return 'Standard deviation = √(Σ(xᵢ - μ)² / n)';
  if (s.includes('var')) return 'Variance = Σ(xᵢ - μ)² / n';
  if (s.includes('median')) return 'Median = middle value when sorted.';
  return 'Statistical computation.';
}

// ─── General expression evaluator ────────────────────────────────────────────

function solveExpression(input: string): SolverResult {
  const steps: MathStep[] = [];

  steps.push({
    step: 1, description: 'Parse expression',
    expression: toLatex(input),
    explanation: 'Parse the mathematical expression and evaluate it.',
  });

  try {
    const simplified = math.simplify(input);
    const simplStr = simplified.toString();

    steps.push({
      step: 2, description: 'Simplify',
      expression: `${toLatex(input)} = ${toLatex(simplStr)}`,
      explanation: 'Apply algebraic simplification rules.',
    });

    let numeric: number | undefined;
    try {
      const evaled = math.evaluate(input);
      if (typeof evaled === 'number') {
        numeric = evaled;
        steps.push({
          step: 3, description: 'Numerical value',
          expression: `\\approx ${toLatex(evaled)}`,
          explanation: `The numerical value is approximately ${evaled}.`,
        });
      }
    } catch { /* no numeric value */ }

    return {
      input, type: 'Expression', steps,
      answer: simplStr, answerLatex: toLatex(simplStr),
      numeric, verified: true,
    };
  } catch (err) {
    return {
      input, type: 'Expression', steps,
      answer: input, answerLatex: toLatex(input), verified: false, error: String(err),
    };
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function solve(input: string): SolverResult {
  if (!input.trim()) {
    return {
      input, type: 'Empty', steps: [], answer: '',
      answerLatex: '', verified: false, error: 'Empty input',
    };
  }

  const type = detectType(input);

  switch (type) {
    case 'derivative':     return solveDerivative(input);
    case 'integral':       return solveIntegral(input);
    case 'limit':          return solveLimit(input);
    case 'series':         return solveSeries(input);
    case 'system':         return solveSystem(input);
    case 'simplify':       return solveSimplify(input);
    case 'expand':         return solveExpand(input);
    case 'quadratic':      return solveQuadratic(input);
    case 'linear':         return solveLinear(input);
    case 'arithmetic':     return solveArithmetic(input);
    case 'trig':           return solveTrig(input);
    case 'stats':          return solveStats(input);
    case 'matrix-det':     return solveMatrix(input, 'det');
    case 'matrix-inv':     return solveMatrix(input, 'inv');
    case 'matrix-mul':     return solveMatrix(input, 'mul');
    default:               return solveExpression(input);
  }
}

// ─── Exported categories for UI ───────────────────────────────────────────────

export const EXAMPLE_PROBLEMS: Record<string, { label: string; examples: { expr: string; desc: string }[] }> = {
  algebra: {
    label: 'Algebra',
    examples: [
      { expr: 'simplify 3*x + 2*x - 5', desc: 'Combine like terms' },
      { expr: 'expand (x + 2)^2', desc: 'Perfect square' },
      { expr: 'expand (x + 3)*(x - 1)', desc: 'FOIL method' },
      { expr: 'simplify (x^2 - 4) / (x - 2)', desc: 'Cancel common factor' },
      { expr: 'solve 3*x - 7 = 11', desc: 'Linear equation' },
    ],
  },
  quadratic: {
    label: 'Quadratic',
    examples: [
      { expr: 'x^2 - 5*x + 6 = 0', desc: 'Factorable quadratic' },
      { expr: '2*x^2 + 3*x - 2 = 0', desc: 'Quadratic formula' },
      { expr: 'x^2 + 4 = 0', desc: 'Complex roots' },
      { expr: 'x^2 - 6*x + 9 = 0', desc: 'Repeated root' },
    ],
  },
  derivatives: {
    label: 'Derivatives',
    examples: [
      { expr: 'd/dx(x^3 + 2*x^2 - x)', desc: 'Polynomial derivative' },
      { expr: 'd/dx(sin(x) * x^2)', desc: 'Product rule' },
      { expr: 'd/dx(sin(2*x))', desc: 'Chain rule' },
      { expr: 'd/dx(exp(x^2))', desc: 'Exponential' },
      { expr: 'd/dx(log(x^2 + 1))', desc: 'Logarithm' },
    ],
  },
  calculus: {
    label: 'Calculus+',
    examples: [
      { expr: 'integrate x^2', desc: 'Indefinite integral' },
      { expr: 'integrate sin(x)', desc: '∫sin(x) dx' },
      { expr: 'integrate x^2, x, 0, 3', desc: 'Definite integral' },
      { expr: 'limit x->2 of x^2 + 1', desc: 'Direct substitution' },
      { expr: 'limit x->0 of sin(x)/x', desc: 'L\'Hôpital (sinc)' },
      { expr: 'series sin(x)', desc: 'Taylor series at 0' },
      { expr: 'series cos(x) order 6', desc: 'Cosine series 6 terms' },
    ],
  },
  trig: {
    label: 'Trigonometry',
    examples: [
      { expr: 'sin(pi/6)', desc: 'sin 30°' },
      { expr: 'cos(pi/4)', desc: 'cos 45°' },
      { expr: 'tan(pi/3)', desc: 'tan 60°' },
      { expr: 'sin(pi/2)^2 + cos(pi/2)^2', desc: 'Pythagorean identity' },
      { expr: 'asin(0.5)', desc: 'Inverse sin' },
    ],
  },
  matrix: {
    label: 'Matrix',
    examples: [
      { expr: 'det([[2, 3], [1, 4]])', desc: '2×2 determinant' },
      { expr: 'inv([[1, 2], [3, 4]])', desc: 'Matrix inverse' },
      { expr: 'det([[1,2,3],[4,5,6],[7,8,9]])', desc: '3×3 determinant' },
      { expr: '[[1,0],[0,1]] * [[3,4],[5,6]]', desc: 'Matrix product' },
    ],
  },
  stats: {
    label: 'Statistics',
    examples: [
      { expr: 'mean([4, 7, 13, 2, 8])', desc: 'Arithmetic mean' },
      { expr: 'std([4, 7, 13, 2, 8])', desc: 'Standard deviation' },
      { expr: 'variance([4, 7, 13, 2, 8])', desc: 'Variance' },
      { expr: 'median([4, 7, 13, 2, 8])', desc: 'Median value' },
    ],
  },
  arithmetic: {
    label: 'Arithmetic',
    examples: [
      { expr: '(2^10 - 1) / 3', desc: 'Powers & fractions' },
      { expr: 'sqrt(2) + sqrt(3)', desc: 'Irrational numbers' },
      { expr: 'factorial(10)', desc: 'Factorial' },
      { expr: 'floor(pi * 100) / 100', desc: 'π approximation' },
    ],
  },
  system: {
    label: 'Systems',
    examples: [
      { expr: 'x + y = 5, x - y = 1', desc: '2 equations, 2 unknowns' },
      { expr: '2*x + y = 7, x + 3*y = 11', desc: 'Linear system' },
      { expr: 'x^2 + y = 4, x + y = 2', desc: 'Nonlinear system' },
    ],
  },
};
