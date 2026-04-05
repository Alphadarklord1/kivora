export type NormalizedGraphExpression =
  | { type: 'function';   value: string; domain?: string }
  | { type: 'implicit';   value: string }
  | { type: 'parametric'; valueX: string; valueY: string; tMin: number; tMax: number }
  | { type: 'point';      x: number; y: number };

export interface GraphExpression {
  id: string;
  expr: string;
  color: string;
  enabled: boolean;
}

/**
 * Returns true if the expression is a custom function definition,
 * e.g. `f(x) = x^2 + 1` or `g(t) = sin(t)`.
 * Excludes x(…) and y(…) which are reserved for parametric syntax.
 */
export function isCustomFuncDefinition(expr: string): boolean {
  const t = expr.trim();
  if (!t) return false;
  const m = t.match(/^([a-zA-Z]\w*)\s*\(([a-zA-Z])\)\s*=/);
  if (!m) return false;
  const name = m[1].toLowerCase();
  return name !== 'x' && name !== 'y';
}

/**
 * Returns true if the expression is a slider/constant definition,
 * e.g. `a = 2.5` or `n = -3`.
 */
export function isSliderDefinition(expr: string): boolean {
  const match = expr.trim().match(/^([a-zA-Z])\s*=\s*-?(?:\d+(?:\.\d+)?|\.\d+)$/);
  if (!match) return false;
  return !/^[xy]$/i.test(match[1]);
}

/**
 * Normalises a raw graph expression string into a typed structure.
 * Returns null for empty strings, custom function definitions, and slider defs
 * (those are registered in the shared scope, not plotted directly).
 *
 * Supports:
 *  - Points:              (3, -2)
 *  - Domain restrictions: y = sqrt(x) {x >= 0}
 *  - Parametric:          x = cos(t), y = sin(t)
 *  - Functions:           y = x^2   or   x = 3
 *  - Implicit relations:  x^2 + y^2 = 25
 */
export function normalizeGraphExpression(expr: string): NormalizedGraphExpression | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  if (isCustomFuncDefinition(trimmed)) return null;
  if (isSliderDefinition(trimmed)) return null;

  // Point: (3, 4) or (-1.5, 2.7)
  const pointMatch = trimmed.match(/^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/);
  if (pointMatch) {
    return { type: 'point', x: parseFloat(pointMatch[1]), y: parseFloat(pointMatch[2]) };
  }

  // Strip optional domain restriction  { condition }  from the end
  let core = trimmed;
  let domain: string | undefined;
  const domainMatch = trimmed.match(/^(.*?)\s*\{([^}]+)\}\s*$/);
  if (domainMatch) {
    core = domainMatch[1].trim();
    domain = domainMatch[2].trim();
  }

  const parametric = core.match(/^x\s*=\s*(.+?),\s*y\s*=\s*(.+)$/i);
  if (parametric) {
    return { type: 'parametric', valueX: parametric[1].trim(), valueY: parametric[2].trim(), tMin: 0, tMax: 2 * Math.PI };
  }

  const explicit = core.match(/^y\s*=\s*(.+)$/i);
  if (explicit) {
    return domain
      ? { type: 'function', value: explicit[1].trim(), domain }
      : { type: 'function', value: explicit[1].trim() };
  }

  const vertical = core.match(/^x\s*=\s*(.+)$/i);
  if (vertical) {
    return { type: 'implicit', value: `x - (${vertical[1].trim()})` };
  }

  if (core.includes('=')) {
    const [lhs, rhs] = core.split('=').map(part => part.trim());
    if (!lhs || !rhs) return null;
    return { type: 'implicit', value: `(${lhs}) - (${rhs})` };
  }

  return domain
    ? { type: 'function', value: core, domain }
    : { type: 'function', value: core };
}

/**
 * Scans a list of graph expressions, registers any custom function
 * definitions and slider/constant values into a mathjs scope object,
 * and returns it.
 * Requires a mathjs instance to be passed in to avoid a hard import.
 */
export function buildSharedScope(
  expressions: GraphExpression[],
  mathEvaluate: (expr: string, scope: Record<string, unknown>) => unknown,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const ge of expressions) {
    if (!ge.enabled) continue;
    const t = ge.expr.trim();

    // Slider / constant: a = 2.5
    const constMatch = t.match(/^([a-zA-Z])\s*=\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/);
    if (constMatch && !/^[xy]$/i.test(constMatch[1])) {
      scope[constMatch[1]] = parseFloat(constMatch[2]);
      continue;
    }

    // Custom function definition: f(x) = x^2 + 1
    const defMatch = t.match(/^([a-zA-Z]\w*)\s*\(([a-zA-Z])\)\s*=\s*(.+)$/);
    if (defMatch) {
      const name = defMatch[1].toLowerCase();
      if (name !== 'x' && name !== 'y') {
        try {
          mathEvaluate(`${defMatch[1]}(${defMatch[2]}) = ${defMatch[3]}`, scope);
        } catch { /* skip malformed definitions */ }
      }
    }
  }
  return scope;
}
