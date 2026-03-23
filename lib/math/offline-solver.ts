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
  if (!Number.isFinite(value)) return String(value);
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
    const antiderivative = nerdamer.integrate(definite.integrand, 'x').toString();
    const upperValue = Number(math.evaluate(antiderivative, { x: Number(definite.upper) }));
    const lowerValue = Number(math.evaluate(antiderivative, { x: Number(definite.lower) }));
    const value = upperValue - lowerValue;

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
    const antiderivative = nerdamer.integrate(integrand, 'x').toString();
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

  const numeric = Number(math.evaluate(problem));
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
