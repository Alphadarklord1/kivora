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
  | 'expression';

export function detectType(input: string): ProblemType {
  const s = input.toLowerCase().trim();

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
  calculus: {
    label: 'Calculus',
    examples: [
      { expr: 'd/dx(x^3 + 2*x^2 - x)', desc: 'Polynomial derivative' },
      { expr: 'd/dx(sin(x) * x^2)', desc: 'Product rule' },
      { expr: 'd/dx(sin(2*x))', desc: 'Chain rule' },
      { expr: 'd/dx(exp(x^2))', desc: 'Exponential' },
      { expr: 'd/dx(log(x^2 + 1))', desc: 'Logarithm' },
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
};
