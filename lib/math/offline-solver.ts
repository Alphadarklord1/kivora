import * as math from 'mathjs';
import nerdamer from 'nerdamer';
import 'nerdamer/Calculus.js';

type OfflineStep = {
  description: string;
  expression?: string;
  explanation?: string;
};

type OfflineSolveResult = {
  problemType: string;
  finalAnswer: string;
  steps: OfflineStep[];
};

function formatNumber(value: number) {
  if (Number.isNaN(value)) return 'undefined';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(4)).toString();
}

function parseDefiniteIntegral(problem: string) {
  const match = problem.match(/^integral\s+from\s+(.+?)\s+to\s+(.+?)\s+of\s+(.+?)\s+dx$/i);
  if (!match) return null;

  const [, lowerRaw, upperRaw, integrandRaw] = match;
  return {
    lower: lowerRaw.trim(),
    upper: upperRaw.trim(),
    integrand: integrandRaw.trim(),
  };
}

export function solveOffline(problem: string): OfflineSolveResult {
  const definite = parseDefiniteIntegral(problem.trim());
  if (definite) {
    // Bad integrands (e.g. 1/x integrated across 0) used to throw mid-
    // computation and reach the route as an uncaught 500. Wrap each
    // mathjs call so we can surface a real explanation instead.
    let antiderivative: string;
    let upperValue: number;
    let lowerValue: number;
    try {
      antiderivative = nerdamer.integrate(definite.integrand, 'x').toString();
      upperValue = Number(math.evaluate(antiderivative, { x: Number(definite.upper) }));
      lowerValue = Number(math.evaluate(antiderivative, { x: Number(definite.lower) }));
    } catch {
      return {
        problemType: 'definite-integral',
        finalAnswer: 'Unable to integrate',
        steps: [
          { description: 'Could not compute the antiderivative or evaluate at the bounds', expression: `∫[${definite.lower}→${definite.upper}] ${definite.integrand} dx` },
        ],
      };
    }
    const value = upperValue - lowerValue;
    if (!Number.isFinite(value)) {
      return {
        problemType: 'definite-integral',
        finalAnswer: Number.isNaN(value) ? 'undefined' : (value > 0 ? '∞' : '-∞'),
        steps: [
          {
            description: 'Definite integral is undefined or diverges',
            expression: `∫[${definite.lower}→${definite.upper}] ${definite.integrand} dx`,
            explanation: 'The antiderivative could not be evaluated cleanly — typically caused by a singularity inside the bounds (e.g. 1/x across 0).',
          },
        ],
      };
    }

    return {
      problemType: 'definite-integral',
      finalAnswer: formatNumber(value),
      steps: [
        {
          description: 'Identify the integrand f(x)',
          expression: `f(x) = ${definite.integrand}`,
          explanation: 'We need to evaluate the definite integral from ' + definite.lower + ' to ' + definite.upper,
        },
        {
          description: 'Find the antiderivative F(x) = ∫ f(x) dx',
          expression: `F(x) = ${antiderivative} + C`,
          explanation: 'Use integration rules (power rule, chain rule, etc.) to find F(x)',
        },
        {
          description: 'Apply the Fundamental Theorem of Calculus',
          expression: `∫[${definite.lower}→${definite.upper}] f(x)dx = F(${definite.upper}) − F(${definite.lower})`,
          explanation: 'The definite integral equals F(upper) − F(lower) where F is any antiderivative',
        },
        {
          description: 'Substitute the bounds',
          expression: `F(${definite.upper}) = ${formatNumber(upperValue)},  F(${definite.lower}) = ${formatNumber(lowerValue)}`,
          explanation: 'Evaluate the antiderivative at each bound',
        },
        {
          description: 'Compute the result',
          expression: `${formatNumber(upperValue)} − ${formatNumber(lowerValue)} = ${formatNumber(value)}`,
          explanation: 'Subtract to get the signed area under the curve',
        },
      ],
    };
  }

  const indefiniteMatch = problem.trim().match(/^integr(?:al|ate)\s+(?:of\s+)?(.+?)\s+dx$/i);
  if (indefiniteMatch) {
    const integrand = indefiniteMatch[1].trim();
    let antiderivative: string;
    try {
      antiderivative = nerdamer.integrate(integrand, 'x').toString();
    } catch {
      return {
        problemType: 'indefinite-integral',
        finalAnswer: 'Unable to integrate',
        steps: [{ description: 'Antiderivative not found', expression: `∫ ${integrand} dx`, explanation: 'The offline integrator could not handle this form. Try expanding or substituting first.' }],
      };
    }
    return {
      problemType: 'indefinite-integral',
      finalAnswer: `${antiderivative} + C`,
      steps: [
        {
          description: 'Identify the integrand',
          expression: `∫ ${integrand} dx`,
        },
        {
          description: 'Apply an antiderivative rule',
          expression: `${antiderivative} + C`,
        },
      ],
    };
  }

  // Bad inputs (typos, mismatched parens, unsupported tokens) used to
  // bubble a raw mathjs error all the way to the API route — which had
  // no catch and would 500. Now we return a labelled "unparseable"
  // result the UI can render gracefully.
  let numeric: number;
  try {
    numeric = Number(math.evaluate(problem));
  } catch {
    return {
      problemType: 'expression',
      finalAnswer: 'Unable to parse',
      steps: [
        {
          description: 'Could not evaluate the expression',
          expression: problem,
          explanation: 'Check the syntax — common issues are mismatched parentheses, unsupported operators, or unrecognised function names.',
        },
      ],
    };
  }
  if (Number.isNaN(numeric)) {
    return {
      problemType: 'expression',
      finalAnswer: 'undefined',
      steps: [
        {
          description: 'Indeterminate result',
          expression: problem,
          explanation: 'The expression evaluates to NaN — for example 0/0 or log(0). Re-check the inputs.',
        },
      ],
    };
  }
  if (!Number.isFinite(numeric)) {
    return {
      problemType: 'expression',
      finalAnswer: numeric > 0 ? '∞' : '-∞',
      steps: [
        {
          description: 'Diverges',
          expression: problem,
          explanation: 'The expression evaluates to infinity — typically a division by zero. Check the denominator.',
        },
      ],
    };
  }
  return {
    problemType: 'expression',
    finalAnswer: formatNumber(numeric),
    steps: [
      {
        description: 'Evaluate the expression',
        expression: problem,
      },
    ],
  };
}
