export type NormalizedGraphExpression =
  | { type: 'function';   value: string }
  | { type: 'implicit';   value: string }
  | { type: 'parametric'; valueX: string; valueY: string; tMin: number; tMax: number };

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
 * Normalises a raw graph expression string into a typed structure.
 * Returns null for empty strings and custom function definitions
 * (those are registered in the shared scope, not plotted directly).
 */
export function normalizeGraphExpression(expr: string): NormalizedGraphExpression | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  if (isCustomFuncDefinition(trimmed)) return null;

  const parametric = trimmed.match(/^x\s*=\s*(.+?),\s*y\s*=\s*(.+)$/i);
  if (parametric) {
    return { type: 'parametric', valueX: parametric[1].trim(), valueY: parametric[2].trim(), tMin: 0, tMax: 2 * Math.PI };
  }

  const explicit = trimmed.match(/^y\s*=\s*(.+)$/i);
  if (explicit) {
    return { type: 'function', value: explicit[1].trim() };
  }

  const vertical = trimmed.match(/^x\s*=\s*(.+)$/i);
  if (vertical) {
    return { type: 'implicit', value: `x - (${vertical[1].trim()})` };
  }

  if (trimmed.includes('=')) {
    const [lhs, rhs] = trimmed.split('=').map(part => part.trim());
    if (!lhs || !rhs) return null;
    return { type: 'implicit', value: `(${lhs}) - (${rhs})` };
  }

  return { type: 'function', value: trimmed };
}

/**
 * Scans a list of graph expressions, registers any custom function
 * definitions into a mathjs scope object, and returns it.
 * Requires a mathjs instance to be passed in to avoid a hard import.
 */
export function buildSharedScope(
  expressions: GraphExpression[],
  mathEvaluate: (expr: string, scope: Record<string, unknown>) => void,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const ge of expressions) {
    if (!ge.enabled) continue;
    const t = ge.expr.trim();
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
