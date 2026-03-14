function escapeBareText(value: string) {
  return value
    .replace(/\\/g, '\\backslash ')
    .replace(/_/g, '\\_')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#');
}

function basicTextToLatex(text: string): string {
  let latex = text;

  latex = latex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
  latex = latex.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');
  latex = latex.replace(/([a-zA-Z])\/([a-zA-Z\d])/g, '\\frac{$1}{$2}');

  latex = latex.replace(/\^(\d+)/g, '^{$1}');
  latex = latex.replace(/\^([a-zA-Z])/g, '^{$1}');

  latex = latex.replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');
  latex = latex.replace(/cbrt\(([^)]+)\)/gi, '\\sqrt[3]{$1}');
  latex = latex.replace(/nthroot\((\d+),\s*([^)]+)\)/gi, '\\sqrt[$1]{$2}');

  latex = latex.replace(/\bsin\b/g, '\\sin');
  latex = latex.replace(/\bcos\b/g, '\\cos');
  latex = latex.replace(/\btan\b/g, '\\tan');
  latex = latex.replace(/\bcot\b/g, '\\cot');
  latex = latex.replace(/\bsec\b/g, '\\sec');
  latex = latex.replace(/\bcsc\b/g, '\\csc');
  latex = latex.replace(/\barcsin\b/gi, '\\arcsin');
  latex = latex.replace(/\barccos\b/gi, '\\arccos');
  latex = latex.replace(/\barctan\b/gi, '\\arctan');
  latex = latex.replace(/\bln\b/g, '\\ln');
  latex = latex.replace(/\blog\b/g, '\\log');
  latex = latex.replace(/\bexp\b/g, '\\exp');
  latex = latex.replace(/\bsum\b/gi, '\\sum');
  latex = latex.replace(/\bprod\b/gi, '\\prod');

  latex = latex.replace(/\balpha\b/gi, '\\alpha');
  latex = latex.replace(/\bbeta\b/gi, '\\beta');
  latex = latex.replace(/\bgamma\b/gi, '\\gamma');
  latex = latex.replace(/\bdelta\b/gi, '\\delta');
  latex = latex.replace(/\bepsilon\b/gi, '\\epsilon');
  latex = latex.replace(/\btheta\b/gi, '\\theta');
  latex = latex.replace(/\blambda\b/gi, '\\lambda');
  latex = latex.replace(/\bmu\b/gi, '\\mu');
  latex = latex.replace(/\bpi\b/gi, '\\pi');
  latex = latex.replace(/\bsigma\b/gi, '\\sigma');
  latex = latex.replace(/\bphi\b/gi, '\\phi');
  latex = latex.replace(/\bomega\b/gi, '\\omega');

  latex = latex.replace(/\binfinity\b/gi, '\\infty');
  latex = latex.replace(/\binf\b/gi, '\\infty');

  latex = latex.replace(/∂/g, '\\partial');
  latex = latex.replace(/partial/gi, '\\partial');

  latex = latex.replace(/\*/g, ' \\cdot ');
  latex = latex.replace(/\+-/g, '\\pm');
  latex = latex.replace(/±/g, '\\pm');
  latex = latex.replace(/->/g, '\\rightarrow');
  latex = latex.replace(/=>/g, '\\Rightarrow');
  latex = latex.replace(/<=/g, '\\leq');
  latex = latex.replace(/>=/g, '\\geq');
  latex = latex.replace(/!=/g, '\\neq');
  latex = latex.replace(/~=/g, '\\approx');
  latex = latex.replace(/\|([^|]+)\|/g, '\\left|$1\\right|');

  const matrixMatch = latex.match(/\[\[([^\]]+)\](,\s*\[[^\]]+\])*\]/);
  if (matrixMatch) {
    const matrixStr = matrixMatch[0];
    const rows = matrixStr.match(/\[([^\]]+)\]/g);
    if (rows) {
      const matrixContent = rows
        .map((row) => row.replace(/[\[\]]/g, '').split(',').join(' & '))
        .join(' \\\\ ');
      latex = latex.replace(matrixStr, `\\begin{bmatrix} ${matrixContent} \\end{bmatrix}`);
    }
  }

  return latex;
}

function wrapExpression(expr: string) {
  return basicTextToLatex(expr.trim());
}

function formatNaturalMath(text: string): string | null {
  const trimmed = text.trim();
  const systemMatch = trimmed.match(/^(?:solve\s+system|system)\s+(.+)$/i);
  if (systemMatch) {
    const equations = systemMatch[1]
      .split(/[;\n]+/)
      .map((equation) => equation.trim())
      .filter(Boolean);
    if (equations.length >= 2) {
      return `\\left\\{\\begin{aligned}${equations.map((equation) => equation.split('=').map((side) => wrapExpression(side.trim())).join(' &= ')).join(' \\\\ ')}\\end{aligned}\\right.`;
    }
  }

  const definiteIntegral = trimmed.match(/^integral\s+from\s+(.+?)\s+to\s+(.+?)\s+of\s+(.+?)(?:\s+d([a-zA-Z]))?$/i);
  if (definiteIntegral) {
    const [, lower, upper, integrand, variable] = definiteIntegral;
    const dx = variable || 'x';
    return `\\int_{${wrapExpression(lower)}}^{${wrapExpression(upper)}} ${wrapExpression(integrand)}\\, d${dx}`;
  }

  const indefiniteIntegral = trimmed.match(/^integral\s+of\s+(.+?)(?:\s+d([a-zA-Z]))?$/i);
  if (indefiniteIntegral) {
    const [, integrand, variable] = indefiniteIntegral;
    const dx = variable || 'x';
    return `\\int ${wrapExpression(integrand)}\\, d${dx}`;
  }

  const derivative = trimmed.match(/^derivative\s+of\s+(.+)$/i);
  if (derivative) {
    return `\\frac{d}{dx}\\left(${wrapExpression(derivative[1])}\\right)`;
  }

  const limit = trimmed.match(/^limit\s+([a-zA-Z]+)\s*->\s*(.+?)\s+of\s+(.+)$/i);
  if (limit) {
    const [, variable, approach, expr] = limit;
    return `\\lim_{${variable} \\to ${wrapExpression(approach)}} ${wrapExpression(expr)}`;
  }

  return null;
}

export function formatMathExpression(expr: string): string {
  if (!expr) return '';
  if (expr.includes('\\')) return expr;

  const natural = formatNaturalMath(expr);
  if (natural) return natural;

  const withEquals = expr.includes('=')
    ? expr.split('=').map((part) => basicTextToLatex(part.trim())).join(' = ')
    : basicTextToLatex(expr);

  return withEquals || escapeBareText(expr);
}
