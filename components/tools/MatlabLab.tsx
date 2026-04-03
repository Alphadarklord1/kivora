'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSettings } from '@/providers/SettingsProvider';
import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

interface MatlabLabProps {
  onGraphExpression?: (expression: string) => void;
}

type Matrix = number[][];

interface FieldPoint {
  x: number;
  y: number;
  u: number;
  v: number;
}

interface Eigen2Result {
  lambda1: number;
  lambda2: number;
}

type MatlabValue = number | Matrix;

type MatlabVariable = {
  name: string;
  type: 'scalar' | 'matrix';
  shape: string;
  preview: string;
  value: MatlabValue;
};

type MatlabHistoryItem = {
  command: string;
  output: string;
  error?: boolean;
  timestamp: string;
};

const DEMO_SCRIPT = '% Matrix operations demo\nA = [2 1 0; 1 3 1; 0 1 2];\ndet(A)\ninv(A)\neig(A)\nrref([A eye(3)])\nlu(A)\n\n% Solve Ax = b\nb = [1; 2; 3];\nx = A\\b\nA * x';
const CHIP_GROUPS = [
  {
    label: 'Matrices',
    chips: ['A = [1 2; 3 4]', 'B = [5 6; 7 8]', 'A + B', 'A * B', 'A .* B', 'A / 2', "A'"],
  },
  {
    label: 'Linear Algebra',
    chips: ['det(A)', 'inv(A)', 'eig(A)', 'rref(A)', 'lu(A)', 'qr(A)', 'rank(A)', 'trace(A)'],
  },
  {
    label: 'Build & Index',
    chips: ['eye(3)', 'zeros(3)', 'ones(2,3)', '1:5', '0:0.5:2', 'linspace(0,1,5)', 'A(1,2)', 'A(1,:)'],
  },
  {
    label: 'Vectors',
    chips: ['v = [3 1 4 1 5]', 'sort(v)', 'cumsum(v)', 'diff(v)', 'dot(u,v)', 'cross([1 0 0],[0 1 0])'],
  },
  {
    label: 'Solve & Stats',
    chips: ['solve(A,b)', 'A\\b', 'sum(A)', 'mean(A)', 'max(A)', 'min(A)', 'prod(v)', 'norm(A)'],
  },
] as const;

interface MatlabSession {
  variables: Record<string, MatlabValue>;
  history: MatlabHistoryItem[];
  script: string;
  command: string;
}

function loadStoredSession(): MatlabSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = readCompatStorage(localStorage, storageKeys.matlabSession);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MatlabSession;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseMatrix(input: string): Matrix | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('[') && trimmed.endsWith(']'))) return null;

  const content = trimmed.replace(/^\[/, '').replace(/\]$/, '');
  const rowParts = content.split(/;|\n/).map(r => r.trim()).filter(Boolean);
  if (rowParts.length === 0) return null;

  const matrix: Matrix = rowParts.map(row => {
    const cols = row.split(/,|\s+/).map(v => v.trim()).filter(Boolean);
    return cols.map(value => Number(value));
  });

  const width = matrix[0]?.length || 0;
  if (!width) return null;
  if (matrix.some(row => row.length !== width || row.some(v => Number.isNaN(v)))) {
    return null;
  }

  return matrix;
}

function formatMatrix(matrix: Matrix): string {
  return matrix.map(row => row.map(n => Number(n.toFixed(4))).join('\t')).join('\n');
}

function addMatrices(a: Matrix, b: Matrix): Matrix | null {
  if (a.length !== b.length || a[0].length !== b[0].length) return null;
  return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}

function subtractMatrices(a: Matrix, b: Matrix): Matrix | null {
  if (a.length !== b.length || a[0].length !== b[0].length) return null;
  return a.map((row, i) => row.map((v, j) => v - b[i][j]));
}

function multiplyMatrices(a: Matrix, b: Matrix): Matrix | null {
  if (a[0].length !== b.length) return null;
  const result: Matrix = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b[0].length; j++) {
      for (let k = 0; k < b.length; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

function transposeMatrix(a: Matrix): Matrix {
  return a[0].map((_, j) => a.map(row => row[j]));
}

function determinant(matrix: Matrix): number | null {
  const n = matrix.length;
  if (n !== matrix[0].length) return null;
  if (n === 1) return matrix[0][0];
  if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  // Gaussian elimination with partial pivoting for nxn
  const a = matrix.map(row => [...row]);
  let det = 1;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(a[pivotRow][col]) < 1e-10) return 0;
    if (pivotRow !== col) { [a[col], a[pivotRow]] = [a[pivotRow], a[col]]; det *= -1; }
    det *= a[col][col];
    const pivot = a[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = a[r][col] / pivot;
      for (let c = col; c < n; c++) a[r][c] -= factor * a[col][c];
    }
  }
  return det;
}

function inverseMatrix(matrix: Matrix): Matrix | null {
  const n = matrix.length;
  if (n !== matrix[0].length) return null;
  // Gauss-Jordan elimination on augmented [A | I]
  const aug: number[][] = matrix.map((row, i) =>
    [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]
  );
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(aug[pivotRow][col]) < 1e-10) return null; // singular
    [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
    const pivot = aug[col][col];
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let c = 0; c < 2 * n; c++) aug[r][c] -= factor * aug[col][c];
    }
  }
  return aug.map(row => row.slice(n));
}

function traceMatrix(matrix: Matrix): number | null {
  if (matrix.length !== matrix[0].length) return null;
  return matrix.reduce((sum, row, i) => sum + row[i], 0);
}

function matrixNormFro(matrix: Matrix): number {
  let sumSquares = 0;
  for (const row of matrix) {
    for (const v of row) sumSquares += v * v;
  }
  return Math.sqrt(sumSquares);
}

function solveLinearSystem(matrix: Matrix, b: number[]): number[] | null {
  const n = matrix.length;
  if (n === 0 || matrix[0].length !== n || b.length !== n) return null;

  const a = matrix.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(a[pivotRow][col]) < 1e-10) return null;
    [a[col], a[pivotRow]] = [a[pivotRow], a[col]];

    const pivot = a[col][col];
    for (let c = col; c <= n; c++) a[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r][col];
      for (let c = col; c <= n; c++) {
        a[r][c] -= factor * a[col][c];
      }
    }
  }

  return a.map(row => row[n]);
}

function rankMatrix(input: Matrix): number {
  const a = input.map(row => [...row]);
  const rows = a.length;
  const cols = a[0].length;
  let rank = 0;
  let row = 0;
  const eps = 1e-10;

  for (let col = 0; col < cols && row < rows; col++) {
    let pivot = row;
    for (let r = row + 1; r < rows; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < eps) continue;
    [a[row], a[pivot]] = [a[pivot], a[row]];

    const div = a[row][col];
    for (let c = col; c < cols; c++) a[row][c] /= div;

    for (let r = 0; r < rows; r++) {
      if (r === row) continue;
      const factor = a[r][col];
      for (let c = col; c < cols; c++) {
        a[r][c] -= factor * a[row][c];
      }
    }
    row++;
    rank++;
  }
  return rank;
}

function identityMatrix(n: number): Matrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

function matrixPower(matrix: Matrix, power: number): Matrix | null {
  if (power < 0 || !Number.isInteger(power)) return null;
  if (matrix.length !== matrix[0].length) return null;
  if (power === 0) return identityMatrix(matrix.length);
  let out = matrix.map(row => [...row]);
  for (let i = 1; i < power; i++) {
    const next = multiplyMatrices(out, matrix);
    if (!next) return null;
    out = next;
  }
  return out;
}

function splitArguments(args: string): string[] {
  const parts: string[] = [];
  let current = '';
  let bracketDepth = 0;
  let parenDepth = 0;

  for (const char of args) {
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1);

    if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}


function eigen2x2(matrix: Matrix): Eigen2Result | null {
  if (matrix.length !== 2 || matrix[0].length !== 2) return null;
  const [[a, b], [c, d]] = matrix;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  return { lambda1: (tr + root) / 2, lambda2: (tr - root) / 2 };
}

function isMatrix(value: MatlabValue): value is Matrix {
  return Array.isArray(value);
}

function formatValue(value: MatlabValue): string {
  if (isMatrix(value)) return formatMatrix(value);
  return Number(value.toFixed(8)).toString();
}

function matrixShape(value: MatlabValue): string {
  if (!isMatrix(value)) return '1x1';
  return `${value.length}x${value[0]?.length || 0}`;
}

function matrixPreview(value: MatlabValue): string {
  if (!isMatrix(value)) return Number(value.toFixed(6)).toString();
  const firstRow = value[0] || [];
  return `[${firstRow.slice(0, 3).map(v => Number(v.toFixed(3))).join(', ')}${firstRow.length > 3 ? ', …' : ''}]`;
}

function scalarMatrixOp(matrix: Matrix, scalar: number, op: '+' | '-' | '*'): Matrix {
  return matrix.map(row => row.map(v => {
    if (op === '+') return v + scalar;
    if (op === '-') return v - scalar;
    return v * scalar;
  }));
}

function scalarFirstMatrixOp(scalar: number, matrix: Matrix, op: '+' | '-'): Matrix {
  return matrix.map(row => row.map(v => (op === '+' ? scalar + v : scalar - v)));
}

// ── New: rref ─────────────────────────────────────────────────────────────────
function rref(matrix: Matrix): Matrix {
  const m = matrix.map(row => [...row]);
  const rows = m.length;
  const cols = m[0]?.length ?? 0;
  const eps = 1e-10;
  let pivot = 0;
  for (let col = 0; col < cols && pivot < rows; col++) {
    let maxR = pivot;
    for (let r = pivot + 1; r < rows; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxR][col])) maxR = r;
    }
    if (Math.abs(m[maxR][col]) < eps) continue;
    [m[pivot], m[maxR]] = [m[maxR], m[pivot]];
    const scale = m[pivot][col];
    for (let c = 0; c < cols; c++) m[pivot][c] /= scale;
    for (let r = 0; r < rows; r++) {
      if (r === pivot) continue;
      const f = m[r][col];
      for (let c = 0; c < cols; c++) m[r][c] -= f * m[pivot][c];
    }
    pivot++;
  }
  return m;
}

// ── New: QR decomposition (Gram-Schmidt) ──────────────────────────────────────
function qrDecomp(A: Matrix): { Q: Matrix; R: Matrix } | null {
  const m = A.length;
  const n = A[0]?.length ?? 0;
  if (!m || !n) return null;
  const qCols: number[][] = [];
  const R: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    let v = A.map(row => row[j]);
    for (let i = 0; i < j; i++) {
      const dot = v.reduce((s, x, k) => s + x * qCols[i][k], 0);
      R[i][j] = dot;
      v = v.map((x, k) => x - dot * qCols[i][k]);
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    R[j][j] = norm;
    qCols.push(norm < 1e-10 ? Array(m).fill(0) : v.map(x => x / norm));
  }
  const Q: Matrix = Array.from({ length: m }, (_, i) => qCols.map(col => col[i]));
  return { Q, R };
}

// ── New: eig for nxn via QR iteration ────────────────────────────────────────
function eigNxN(matrix: Matrix): number[] | null {
  const n = matrix.length;
  if (n !== matrix[0]?.length) return null;
  if (n === 1) return [matrix[0][0]];
  if (n === 2) { const r = eigen2x2(matrix); return r ? [r.lambda1, r.lambda2] : null; }
  let A = matrix.map(row => [...row]);
  for (let iter = 0; iter < 150 * n; iter++) {
    const qr = qrDecomp(A);
    if (!qr) break;
    const rq = multiplyMatrices(qr.R, qr.Q);
    if (!rq) break;
    A = rq;
  }
  return A.map((row, i) => parseFloat(row[i].toFixed(8)));
}

// ── New: LU decomposition with partial pivoting ───────────────────────────────
function luDecomp(matrix: Matrix): { L: Matrix; U: Matrix; P: Matrix } | null {
  const n = matrix.length;
  if (n !== matrix[0]?.length) return null;
  const L = identityMatrix(n);
  const U = matrix.map(row => [...row]);
  const P = identityMatrix(n);
  for (let col = 0; col < n; col++) {
    let maxR = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(U[r][col]) > Math.abs(U[maxR][col])) maxR = r;
    }
    if (maxR !== col) {
      [U[col], U[maxR]] = [U[maxR], U[col]];
      [P[col], P[maxR]] = [P[maxR], P[col]];
      for (let c = 0; c < col; c++) { const t = L[col][c]; L[col][c] = L[maxR][c]; L[maxR][c] = t; }
    }
    if (Math.abs(U[col][col]) < 1e-10) continue;
    for (let r = col + 1; r < n; r++) {
      L[r][col] = U[r][col] / U[col][col];
      for (let c = col; c < n; c++) U[r][c] -= L[r][col] * U[col][c];
    }
  }
  return { L, U, P };
}

// ── New: element-wise ops ─────────────────────────────────────────────────────
function elemWiseMul(a: Matrix, b: Matrix): Matrix | null {
  if (a.length !== b.length || (a[0]?.length ?? 0) !== (b[0]?.length ?? 0)) return null;
  return a.map((row, i) => row.map((v, j) => v * b[i][j]));
}
function elemWiseDiv(a: Matrix, b: Matrix): Matrix | null {
  if (a.length !== b.length || (a[0]?.length ?? 0) !== (b[0]?.length ?? 0)) return null;
  return a.map((row, i) => row.map((v, j) => b[i][j] === 0 ? Infinity : v / b[i][j]));
}
function elemWisePow(a: Matrix, exp: number): Matrix {
  return a.map(row => row.map(v => Math.pow(v, exp)));
}

// ── New: colon range ─────────────────────────────────────────────────────────
function colonRange(start: number, step: number, stop: number): Matrix {
  if (step === 0) return [[]];
  const arr: number[] = [];
  for (let v = start; step > 0 ? v <= stop + 1e-9 : v >= stop - 1e-9; v += step) {
    arr.push(parseFloat(v.toFixed(10)));
    if (arr.length > 10_000) break;
  }
  return [arr];
}

function explainMatrixFailure(expr: string, vars: Record<string, MatlabValue>): string | null {
  const trimmed = expr.trim();

  const transposeMatch = trimmed.match(/^transpose\((.+)\)$/i);
  if (transposeMatch) {
    const value = vars[transposeMatch[1].trim()] ?? evaluateCommandExpression(transposeMatch[1].trim(), vars);
    if (!value || !isMatrix(value)) return 'transpose(...) needs a matrix input.';
    return null;
  }

  const detMatch = trimmed.match(/^det\((.+)\)$/i);
  if (detMatch) {
    const value = vars[detMatch[1].trim()] ?? evaluateCommandExpression(detMatch[1].trim(), vars);
    if (!value || !isMatrix(value)) return 'det(...) needs a matrix input.';
    if (value.length !== value[0]?.length) return `Determinant needs a square matrix. You entered ${value.length}x${value[0]?.length ?? 0}.`;
    return null;
  }

  const invMatch = trimmed.match(/^inv\((.+)\)$/i);
  if (invMatch) {
    const value = vars[invMatch[1].trim()] ?? evaluateCommandExpression(invMatch[1].trim(), vars);
    if (!value || !isMatrix(value)) return 'inv(...) needs a matrix input.';
    if (value.length !== value[0]?.length) return `Inverse needs a square matrix. You entered ${value.length}x${value[0]?.length ?? 0}.`;
    if (determinant(value) === 0) return 'This matrix is singular, so it has no inverse.';
    return null;
  }

  const binary = trimmed.match(/^(.+)\s*([+\-*])\s*(.+)$/);
  if (!binary) return null;
  const left = vars[binary[1].trim()] ?? evaluateCommandExpression(binary[1].trim(), vars);
  const right = vars[binary[3].trim()] ?? evaluateCommandExpression(binary[3].trim(), vars);
  const op = binary[2] as '+' | '-' | '*';
  if (!left || !right || !isMatrix(left) || !isMatrix(right)) return null;

  if ((op === '+' || op === '-') && (left.length !== right.length || left[0]?.length !== right[0]?.length)) {
    return `${op === '+' ? 'Addition' : 'Subtraction'} needs matching shapes. You entered ${left.length}x${left[0]?.length ?? 0} and ${right.length}x${right[0]?.length ?? 0}.`;
  }
  if (op === '*' && left[0]?.length !== right.length) {
    return `Multiplication needs columns(A) = rows(B). You entered ${left.length}x${left[0]?.length ?? 0} and ${right.length}x${right[0]?.length ?? 0}.`;
  }
  return null;
}

function explainVectorFailure(expr: string, vars: Record<string, MatlabValue>): string | null {
  const dotMatch = expr.match(/^dot\((.+),\s*(.+)\)$/i);
  if (dotMatch) {
    const left = vars[dotMatch[1].trim()] ?? evaluateCommandExpression(dotMatch[1].trim(), vars);
    const right = vars[dotMatch[2].trim()] ?? evaluateCommandExpression(dotMatch[2].trim(), vars);
    if (!left || !right || !isMatrix(left) || !isMatrix(right)) return 'dot(...) needs two vector-style matrix inputs.';
    const l = left.flat();
    const r = right.flat();
    if (l.length !== r.length) return `Dot product needs matching vector lengths. You entered ${l.length} and ${r.length}.`;
    return null;
  }

  const crossMatch = expr.match(/^cross\((.+),\s*(.+)\)$/i);
  if (crossMatch) {
    const left = vars[crossMatch[1].trim()] ?? evaluateCommandExpression(crossMatch[1].trim(), vars);
    const right = vars[crossMatch[2].trim()] ?? evaluateCommandExpression(crossMatch[2].trim(), vars);
    if (!left || !right || !isMatrix(left) || !isMatrix(right)) return 'cross(...) needs two vector-style matrix inputs.';
    const l = left.flat();
    const r = right.flat();
    if (l.length !== 3 || r.length !== 3) return 'Cross product needs exactly two 3D vectors.';
    return null;
  }

  return null;
}


function evaluateCommandExpression(expr: string, vars: Record<string, MatlabValue>): MatlabValue | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const literalMatrix = parseMatrix(trimmed);
  if (literalMatrix) return literalMatrix;

  const numberLiteral = Number(trimmed);
  if (!Number.isNaN(numberLiteral) && Number.isFinite(numberLiteral)) return numberLiteral;

  // Built-in constants
  if (trimmed === 'pi' || trimmed === 'PI') return Math.PI;
  if (trimmed === 'e' && vars['e'] === undefined) return Math.E;
  if (trimmed === 'inf' || trimmed === 'Inf' || trimmed === 'Infinity') return Infinity;
  if (trimmed === 'nan' || trimmed === 'NaN') return NaN;
  if (trimmed === 'true') return 1;
  if (trimmed === 'false') return 0;

  // Colon range: start:stop  or  start:step:stop
  const colonParts = trimmed.split(':');
  if (colonParts.length === 2 || colonParts.length === 3) {
    const nums = colonParts.map(p => {
      const v = vars[p.trim()];
      if (v !== undefined && !isMatrix(v)) return v;
      return Number(p.trim());
    });
    if (nums.every(n => !Number.isNaN(n) && Number.isFinite(n))) {
      if (colonParts.length === 2) return colonRange(nums[0], 1, nums[1]);
      return colonRange(nums[0], nums[1], nums[2]);
    }
  }

  // Element indexing: varName(i,j) or varName(i) or varName(i,:) or varName(:,j)
  const indexMatch = trimmed.match(/^([A-Za-z]\w*)\(([^)]+)\)$/);
  if (indexMatch && !['zeros','ones','eye','linspace','mod','atan2','power','pow','cross','dot','diag','rref','eig','lu','qr','det','inv','trace','rank','norm','transpose','solve','sqrt','sin','cos','tan','asin','acos','atan','log','ln','log2','log10','exp','abs','floor','ceil','round','sign','sum','mean','max','min','size','length','numel','cumsum','prod','diff','sort','find','any','all','repmat','reshape'].includes(indexMatch[1].toLowerCase())) {
    const varVal = vars[indexMatch[1]];
    if (varVal && isMatrix(varVal)) {
      const idxParts = splitArguments(indexMatch[2]).map(p => p.trim());
      const ri = idxParts[0] === ':' ? null : Number(idxParts[0]) - 1;
      const ci = idxParts.length > 1 ? (idxParts[1] === ':' ? null : Number(idxParts[1]) - 1) : null;
      if (idxParts.length === 1 && ri !== null && !Number.isNaN(ri)) {
        // Single index — treat matrix as column-major vector
        const flat = varVal.flat();
        return flat[ri] ?? null;
      }
      if (idxParts.length === 2) {
        if (ri !== null && ci !== null && !Number.isNaN(ri) && !Number.isNaN(ci)) {
          return varVal[ri]?.[ci] ?? null;
        }
        if (ri === null && ci !== null && !Number.isNaN(ci)) {
          // (:, j) → column vector
          return varVal.map(row => [row[ci]]);
        }
        if (ri !== null && !Number.isNaN(ri) && ci === null) {
          // (i, :) → row vector
          return [varVal[ri] ?? []];
        }
      }
    }
  }

  // transpose: A'
  if (/^[A-Za-z]\w*'$/.test(trimmed)) {
    const varName = trimmed.slice(0, -1);
    const value = vars[varName];
    if (!value || !isMatrix(value)) return null;
    return transposeMatrix(value);
  }

  // power: A^n
  const powMatch = trimmed.match(/^([A-Za-z]\w*)\^(\d+)$/);
  if (powMatch) {
    const [, varName, p] = powMatch;
    const value = vars[varName];
    if (!value || !isMatrix(value)) return null;
    return matrixPower(value, Number(p));
  }

  const fnMatch = trimmed.match(/^([a-zA-Z_]\w*)\((.*)\)$/);
  if (fnMatch) {
    const fn = fnMatch[1].toLowerCase();
    const argRaw = fnMatch[2].trim();
    if (['zeros', 'ones', 'eye', 'linspace', 'mod', 'atan2', 'power', 'pow', 'cross', 'dot', 'diag'].includes(fn)) {
      // handled below by the multi-argument path
    } else {
    if (fn === 'solve') {
      const [leftRaw, rightRaw] = splitArguments(argRaw);
      if (!leftRaw || !rightRaw) return null;
      const left = vars[leftRaw] ?? evaluateCommandExpression(leftRaw, vars);
      const right = vars[rightRaw] ?? evaluateCommandExpression(rightRaw, vars);
      if (!left || !right || !isMatrix(left)) return null;
      const rightVector = isMatrix(right)
        ? right.length === 1
          ? [...right[0]]
          : right[0]?.length === 1
            ? right.map((row) => row[0])
            : null
        : [right];
      if (!rightVector) return null;
      const solved = solveLinearSystem(left, rightVector);
      return solved ? solved.map((value) => [value]) : null;
    }

    const arg = vars[argRaw] ?? evaluateCommandExpression(argRaw, vars);
    if (arg == null) return null;

    if (fn === 'det' && isMatrix(arg)) return determinant(arg);
    if (fn === 'trace' && isMatrix(arg)) return traceMatrix(arg);
    if (fn === 'rank' && isMatrix(arg)) return rankMatrix(arg);
    if (fn === 'norm' && isMatrix(arg)) return matrixNormFro(arg);
    if (fn === 'inv' && isMatrix(arg)) return inverseMatrix(arg);
    if (fn === 'transpose' && isMatrix(arg)) return transposeMatrix(arg);
    if (fn === 'rref' && isMatrix(arg)) return rref(arg);
    if (fn === 'eig' && isMatrix(arg)) {
      const vals = eigNxN(arg);
      if (!vals) return null;
      return vals.map(v => [v]);
    }
    if (fn === 'lu' && isMatrix(arg)) {
      const res = luDecomp(arg);
      if (!res) return null;
      // Return U; L and P printed in the output handler
      return res.U;
    }
    if (fn === 'qr' && isMatrix(arg)) {
      const res = qrDecomp(arg);
      if (!res) return null;
      return res.R; // Return R; Q printed in output handler
    }
    if (fn === 'cumsum' && isMatrix(arg)) {
      const flat = arg.flat();
      let acc = 0;
      return [flat.map(v => { acc += v; return acc; })];
    }
    if (fn === 'prod' && isMatrix(arg)) {
      return arg.flat().reduce((p, v) => p * v, 1);
    }
    if (fn === 'diff' && isMatrix(arg)) {
      const flat = arg.flat();
      if (flat.length < 2) return [[]];
      return [flat.slice(1).map((v, i) => v - flat[i])];
    }
    if (fn === 'sort' && isMatrix(arg)) {
      const flat = [...arg.flat()].sort((a, b) => a - b);
      return [flat];
    }
    if (fn === 'find' && isMatrix(arg)) {
      const indices: number[] = [];
      arg.flat().forEach((v, i) => { if (v !== 0) indices.push(i + 1); });
      return indices.length ? [indices] : [[]];
    }
    if (fn === 'any' && isMatrix(arg)) return arg.flat().some(v => v !== 0) ? 1 : 0;
    if (fn === 'all' && isMatrix(arg)) return arg.flat().every(v => v !== 0) ? 1 : 0;
    if (fn === 'fliplr' && isMatrix(arg)) return arg.map(row => [...row].reverse());
    if (fn === 'flipud' && isMatrix(arg)) return [...arg].reverse();
    if (fn === 'triu' && isMatrix(arg)) return arg.map((row, i) => row.map((v, j) => j >= i ? v : 0));
    if (fn === 'tril' && isMatrix(arg)) return arg.map((row, i) => row.map((v, j) => j <= i ? v : 0));
    if (fn === 'diag' && !isMatrix(arg)) return [[arg]]; // scalar → 1×1 matrix
    // Scalar math functions
    if (!isMatrix(arg)) {
      if (fn === 'sqrt') return Math.sqrt(arg);
      if (fn === 'sin') return Math.sin(arg);
      if (fn === 'cos') return Math.cos(arg);
      if (fn === 'tan') return Math.tan(arg);
      if (fn === 'asin') return Math.asin(arg);
      if (fn === 'acos') return Math.acos(arg);
      if (fn === 'atan') return Math.atan(arg);
      if (fn === 'log' || fn === 'ln') return Math.log(arg);
      if (fn === 'log2') return Math.log2(arg);
      if (fn === 'log10') return Math.log10(arg);
      if (fn === 'exp') return Math.exp(arg);
      if (fn === 'abs') return Math.abs(arg);
      if (fn === 'floor') return Math.floor(arg);
      if (fn === 'ceil') return Math.ceil(arg);
      if (fn === 'round') return Math.round(arg);
      if (fn === 'sign') return Math.sign(arg);
    }
    // Matrix element-wise
    if (isMatrix(arg)) {
      if (fn === 'abs') return arg.map(row => row.map(v => Math.abs(v)));
      if (fn === 'floor') return arg.map(row => row.map(v => Math.floor(v)));
      if (fn === 'ceil') return arg.map(row => row.map(v => Math.ceil(v)));
      if (fn === 'round') return arg.map(row => row.map(v => Math.round(v)));
      if (fn === 'sqrt') return arg.map(row => row.map(v => Math.sqrt(v)));
      if (fn === 'exp') return arg.map(row => row.map(v => Math.exp(v)));
      // sum / mean / max / min over all elements
      if (fn === 'sum') { const flat = arg.flat(); return flat.reduce((a, v) => a + v, 0); }
      if (fn === 'mean') { const flat = arg.flat(); return flat.reduce((a, v) => a + v, 0) / flat.length; }
      if (fn === 'max') return Math.max(...arg.flat());
      if (fn === 'min') return Math.min(...arg.flat());
      if (fn === 'size') return [[arg.length, arg[0]?.length ?? 0]];
      if (fn === 'length') return Math.max(arg.length, arg[0]?.length ?? 0);
      if (fn === 'numel') return arg.length * (arg[0]?.length ?? 0);
    }
    return null;
    }
  }

  // Multi-arg built-ins handled before the single-arg block above
  const multiArgFnMatch = trimmed.match(/^([a-zA-Z_]\w*)\((.*)\)$/);
  if (multiArgFnMatch) {
    const fn2 = multiArgFnMatch[1].toLowerCase();
    const argRaw2 = multiArgFnMatch[2].trim();
    const parts = splitArguments(argRaw2).map(p => {
      const v = vars[p] ?? evaluateCommandExpression(p, vars);
      return typeof v === 'number' ? v : null;
    });
    if (fn2 === 'zeros') {
      const r = parts[0] ?? null; const c = parts[1] ?? r;
      if (r !== null && c !== null) return Array.from({ length: r }, () => Array(c).fill(0) as number[]);
    }
    if (fn2 === 'ones') {
      const r = parts[0] ?? null; const c = parts[1] ?? r;
      if (r !== null && c !== null) return Array.from({ length: r }, () => Array(c).fill(1) as number[]);
    }
    if (fn2 === 'eye') {
      const n2 = parts[0] ?? null;
      if (n2 !== null) return identityMatrix(n2);
    }
    if (fn2 === 'linspace') {
      const [a2, b2, n2] = parts;
      if (a2 !== null && b2 !== null) {
        const steps = n2 !== null ? Math.max(2, Math.round(n2)) : 5;
        const arr: number[] = Array.from({ length: steps }, (_, i) => a2 + (i / (steps - 1)) * (b2 - a2));
        return [arr];
      }
    }
    if (fn2 === 'mod') {
      const [a2, b2] = parts;
      if (a2 !== null && b2 !== null) return ((a2 % b2) + b2) % b2;
    }
    if (fn2 === 'atan2') {
      const [a2, b2] = parts;
      if (a2 !== null && b2 !== null) return Math.atan2(a2, b2);
    }
    if (fn2 === 'power' || fn2 === 'pow') {
      const [a2, b2] = parts;
      if (a2 !== null && b2 !== null) return Math.pow(a2, b2);
    }
    if (fn2 === 'cross') {
      // 3-element vector cross product
      const leftRaw2 = splitArguments(argRaw2)[0];
      const rightRaw2 = splitArguments(argRaw2)[1];
      if (leftRaw2 && rightRaw2) {
        const lv = vars[leftRaw2] ?? evaluateCommandExpression(leftRaw2, vars);
        const rv = vars[rightRaw2] ?? evaluateCommandExpression(rightRaw2, vars);
        const lu = isMatrix(lv) ? lv.flat() : null;
        const ru = isMatrix(rv) ? rv.flat() : null;
        if (lu && ru && lu.length === 3 && ru.length === 3) {
          return [[
            lu[1] * ru[2] - lu[2] * ru[1],
            lu[2] * ru[0] - lu[0] * ru[2],
            lu[0] * ru[1] - lu[1] * ru[0],
          ]];
        }
      }
    }
    if (fn2 === 'dot') {
      const leftRaw2 = splitArguments(argRaw2)[0];
      const rightRaw2 = splitArguments(argRaw2)[1];
      if (leftRaw2 && rightRaw2) {
        const lv = vars[leftRaw2] ?? evaluateCommandExpression(leftRaw2, vars);
        const rv = vars[rightRaw2] ?? evaluateCommandExpression(rightRaw2, vars);
        const lu = isMatrix(lv) ? lv.flat() : null;
        const ru = isMatrix(rv) ? rv.flat() : null;
        if (lu && ru && lu.length === ru.length) {
          return lu.reduce((sum, v, i) => sum + v * ru[i], 0);
        }
      }
    }
    if (fn2 === 'diag') {
      const v2 = vars[argRaw2] ?? evaluateCommandExpression(argRaw2, vars);
      if (isMatrix(v2)) {
        if (v2.length === 1) {
          const n2 = v2[0].length;
          return Array.from({ length: n2 }, (_, i) => Array.from({ length: n2 }, (_, j) => i === j ? v2[0][i] : 0));
        }
        const diag2 = Math.min(v2.length, v2[0]?.length ?? 0);
        return Array.from({ length: diag2 }, (_, i) => [v2[i][i]]);
      }
    }
    // reshape(A, r, c)
    if (fn2 === 'reshape') {
      const rawParts = splitArguments(argRaw2);
      const mVal = vars[rawParts[0]?.trim() ?? ''] ?? evaluateCommandExpression(rawParts[0]?.trim() ?? '', vars);
      const rVal = parts[1]; const cVal = parts[2];
      if (mVal && isMatrix(mVal) && rVal !== null && cVal !== null) {
        const flat = mVal.flat();
        if (flat.length !== rVal * cVal) return null;
        const out: Matrix = [];
        for (let i = 0; i < rVal; i++) out.push(flat.slice(i * cVal, (i + 1) * cVal));
        return out;
      }
    }
    // repmat(A, r, c)
    if (fn2 === 'repmat') {
      const rawParts = splitArguments(argRaw2);
      const mVal = vars[rawParts[0]?.trim() ?? ''] ?? evaluateCommandExpression(rawParts[0]?.trim() ?? '', vars);
      const rVal = parts[1]; const cVal = parts[2] ?? parts[1];
      if (mVal && isMatrix(mVal) && rVal !== null && cVal !== null) {
        const rowTile: Matrix = mVal.map(row => Array.from({ length: cVal }, () => row).flat());
        return Array.from({ length: rVal }, () => rowTile).flat();
      }
    }
    // horzcat(A, B) or vertcat(A, B)
    if (fn2 === 'horzcat' || fn2 === 'vertcat') {
      const rawParts = splitArguments(argRaw2);
      const mats = rawParts.map(p => { const v = vars[p.trim()] ?? evaluateCommandExpression(p.trim(), vars); return v && isMatrix(v) ? v : null; });
      if (mats.every(Boolean)) {
        if (fn2 === 'horzcat') {
          const rows = mats[0]!.length;
          if (mats.every(m => m!.length === rows)) return mats[0]!.map((row, i) => mats.flatMap(m => m![i]));
        } else {
          const cols = mats[0]![0]?.length ?? 0;
          if (mats.every(m => (m![0]?.length ?? 0) === cols)) return mats.flat() as Matrix;
        }
      }
    }
  }

  // Backslash left division: A\b  (solve Ax = b)
  const backslashMatch = trimmed.match(/^(.+?)\\(.+)$/);
  if (backslashMatch) {
    const lv = evaluateCommandExpression(backslashMatch[1].trim(), vars);
    const rv = evaluateCommandExpression(backslashMatch[2].trim(), vars);
    if (lv && isMatrix(lv) && rv) {
      const bVec = isMatrix(rv)
        ? rv.length === 1 ? [...rv[0]] : rv[0]?.length === 1 ? rv.map(r => r[0]) : null
        : [rv];
      if (bVec) {
        const sol = solveLinearSystem(lv, bVec);
        return sol ? sol.map(v => [v]) : null;
      }
    }
  }

  // Element-wise ops: A .* B, A ./ B, A .^ n
  const elemPowMatch = trimmed.match(/^(.+?)\s*\.\^s*(.+)$/);
  if (elemPowMatch) {
    const lv = evaluateCommandExpression(elemPowMatch[1].trim(), vars);
    const rv = evaluateCommandExpression(elemPowMatch[2].trim(), vars);
    if (lv && isMatrix(lv) && rv !== null && !isMatrix(rv)) return elemWisePow(lv, rv);
    if (lv && isMatrix(lv) && rv && isMatrix(rv)) return lv.map((row, i) => row.map((v, j) => Math.pow(v, rv[i][j])));
  }
  const elemMulMatch = trimmed.match(/^(.+?)\s*\.\*\s*(.+)$/);
  if (elemMulMatch) {
    const lv = evaluateCommandExpression(elemMulMatch[1].trim(), vars);
    const rv = evaluateCommandExpression(elemMulMatch[2].trim(), vars);
    if (lv && rv && isMatrix(lv) && isMatrix(rv)) return elemWiseMul(lv, rv);
    if (lv && rv && !isMatrix(lv) && !isMatrix(rv)) return lv * rv;
  }
  const elemDivMatch = trimmed.match(/^(.+?)\s*\.\s*\/\s*(.+)$/);
  if (elemDivMatch) {
    const lv = evaluateCommandExpression(elemDivMatch[1].trim(), vars);
    const rv = evaluateCommandExpression(elemDivMatch[2].trim(), vars);
    if (lv && rv && isMatrix(lv) && isMatrix(rv)) return elemWiseDiv(lv, rv);
  }

  const binary = trimmed.match(/^(.+)\s*([+\-*/])\s*(.+)$/);
  if (binary) {
    const left = evaluateCommandExpression(binary[1], vars);
    const right = evaluateCommandExpression(binary[3], vars);
    const op = binary[2] as '+' | '-' | '*' | '/';
    if (left == null || right == null) return null;

    if (!isMatrix(left) && !isMatrix(right)) {
      if (op === '+') return left + right;
      if (op === '-') return left - right;
      if (op === '*') return left * right;
      if (op === '/') return right === 0 ? NaN : left / right;
    }
    if (isMatrix(left) && isMatrix(right)) {
      if (op === '+') return addMatrices(left, right);
      if (op === '-') return subtractMatrices(left, right);
      return multiplyMatrices(left, right);
    }
    if (isMatrix(left) && !isMatrix(right)) {
      if (op === '*') return scalarMatrixOp(left, right, '*');
      if (op === '+') return scalarMatrixOp(left, right, '+');
      if (op === '-') return scalarMatrixOp(left, right, '-');
      if (op === '/') return right === 0 ? null : left.map(row => row.map(v => v / right));
    }
    if (!isMatrix(left) && isMatrix(right)) {
      if (op === '+') return scalarFirstMatrixOp(left, right, '+');
      if (op === '-') return scalarFirstMatrixOp(left, right, '-');
      if (op === '*') return scalarMatrixOp(right, left, '*');
    }
    return null;
  }

  const variableOnly = vars[trimmed];
  if (variableOnly !== undefined) return variableOnly;

  return null;
}

export function MatlabLab({ onGraphExpression }: MatlabLabProps = {}) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';

  const [fieldU, setFieldU] = useState('y');
  const [fieldV, setFieldV] = useState('-x');
  const [gridSize, setGridSize] = useState(9);
  const [fieldScale, setFieldScale] = useState(0.7);
  const [restoredSession] = useState<MatlabSession | null>(() => loadStoredSession());
  const [command, setCommand] = useState(restoredSession?.command || 'X = [1 0 2 1; 2 1 3 0; 0 1 1 2]');
  const [scriptText, setScriptText] = useState(restoredSession?.script || DEMO_SCRIPT);
  const [runtimeVars, setRuntimeVars] = useState<Record<string, MatlabValue>>(
    restoredSession?.variables && typeof restoredSession.variables === 'object' ? restoredSession.variables : {}
  );
  // Always-current ref so runSingleCommand can read vars without a stale closure
  const runtimeVarsRef = useRef<Record<string, MatlabValue>>(runtimeVars);
  const [history, setHistory] = useState<MatlabHistoryItem[]>(
    Array.isArray(restoredSession?.history) ? restoredSession.history.slice(-100) : []
  );
  const [, setHistoryIndex] = useState<number>(-1);
  const [runningScript, setRunningScript] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [selectedVar, setSelectedVar] = useState<string | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);


  const variableRows = useMemo<MatlabVariable[]>(() => {
    return Object.entries(runtimeVars)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({
        name,
        type: isMatrix(value) ? 'matrix' : 'scalar',
        shape: matrixShape(value),
        preview: matrixPreview(value),
        value,
      }));
  }, [runtimeVars]);

  const workspaceSummary = useMemo(() => {
    const matrixCount = variableRows.filter(row => row.type === 'matrix').length;
    const scalarCount = variableRows.length - matrixCount;
    return {
      total: variableRows.length,
      matrixCount,
      scalarCount,
      historyCount: history.length,
    };
  }, [history.length, variableRows]);

  // Keep vars ref in sync so runSingleCommand always sees the latest workspace
  useEffect(() => {
    runtimeVarsRef.current = runtimeVars;
  }, [runtimeVars]);

  // Auto-scroll terminal to bottom on new history items
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    try {
      const session: MatlabSession = {
        variables: runtimeVars,
        history: history.slice(-100),
        script: scriptText,
        command,
      };
      writeCompatStorage(localStorage, storageKeys.matlabSession, JSON.stringify(session));
    } catch { /* noop */ }
  }, [runtimeVars, history, scriptText, command]);

  // Heatmap for whichever variable the user clicked (auto-picks first matrix if none selected)
  const selectedHeatmap = useMemo(() => {
    const varName = selectedVar ?? Object.keys(runtimeVars).find(k => isMatrix(runtimeVars[k]));
    if (!varName) return null;
    const val = runtimeVars[varName];
    if (!val || !isMatrix(val)) return null;
    const flat = val.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    return { name: varName, matrix: val, min, max, range: max - min || 1 };
  }, [selectedVar, runtimeVars]);

  const normalizeExpression = (expr: string) => {
    let out = expr.trim();
    out = out.replace(/\^/g, '**');
    const funcs = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'log', 'ln', 'exp', 'abs'];
    for (const fn of funcs) {
      const re = new RegExp(`\\b${fn}\\b`, 'gi');
      out = out.replace(re, `Math.${fn === 'ln' ? 'log' : fn}`);
    }
    out = out.replace(/\bpi\b/gi, 'Math.PI');
    out = out.replace(/\be\b/g, 'Math.E');
    return out;
  };

  const evalField = useCallback((expr: string, x: number, y: number) => {
    const safe = normalizeExpression(expr);
    const fn = new Function('x', 'y', `return ${safe};`);
    const val = fn(x, y);
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) return 0;
    return val;
  }, []);

  const fieldData = useMemo(() => {
    const size = Math.max(3, Math.min(15, gridSize));
    const points: FieldPoint[] = [];
    const half = Math.floor(size / 2);
    for (let i = -half; i <= half; i++) {
      for (let j = -half; j <= half; j++) {
        const u = evalField(fieldU, i, j);
        const v = evalField(fieldV, i, j);
        points.push({ x: i, y: j, u, v });
      }
    }
    return { points };
  }, [fieldU, fieldV, gridSize, evalField]);

  const pushHistory = useCallback((item: MatlabHistoryItem) => {
    setHistory(prev => [...prev.slice(-99), item]);
  }, []);

  const runSingleCommand = useCallback((rawCommand: string, source: 'command' | 'script' = 'command'): MatlabHistoryItem => {
    const ts = new Date().toISOString();
    // Semicolon suppression — trailing ; silences output
    const silent = rawCommand.trimEnd().endsWith(';');
    const text = rawCommand.trim().replace(/;$/, '').trim();
    if (!text) return { command: rawCommand, output: '', timestamp: ts };

    if (text.toLowerCase() === 'clear') {
      runtimeVarsRef.current = {};
      setRuntimeVars({});
      setSelectedVar(null);
      return { command: rawCommand, output: silent ? '' : 'Workspace cleared.', timestamp: ts };
    }
    if (text.toLowerCase() === 'clc') {
      setHistory([]);
      return { command: rawCommand, output: '', timestamp: ts };
    }
    if (text.toLowerCase() === 'help') {
      const helpText = [
        'Available commands:',
        '  Arithmetic:   + - * / ^ (and .* ./ .^ for element-wise)',
        '  Matrices:     det(A)  inv(A)  transpose(A)  rank(A)  trace(A)  norm(A)',
        '  Decomp:       rref(A)  eig(A)  lu(A)  qr(A)',
        '  Solve:        solve(A,b)  A\\b',
        '  Build:        zeros(r,c)  ones(r,c)  eye(n)  linspace(a,b,n)',
        '  Vectors:      dot(u,v)  cross(u,v)  cumsum(v)  diff(v)  sort(v)  find(v)',
        '  Stats:        sum(A)  mean(A)  max(A)  min(A)  prod(A)',
        '  Logic:        any(A)  all(A)',
        '  Reshape:      diag(A)  triu(A)  tril(A)  reshape(A,r,c)  repmat(A,r,c)',
        '  Concat:       horzcat(A,B)  vertcat(A,B)',
        '  Indexing:     A(i,j)  A(i,:)  A(:,j)',
        '  Range:        1:5  0:0.5:2',
        '  Constants:    pi  e  inf',
        '  Plot:         plot(expr)',
        '  Control:      clear  clc  help',
        '  Semicolons:   append ; to suppress output',
      ].join('\n');
      return { command: rawCommand, output: helpText, timestamp: ts };
    }

    // disp(expr)
    const dispMatch = text.match(/^disp\((.+)\)$/i);
    if (dispMatch) {
      const val = evaluateCommandExpression(dispMatch[1].trim(), runtimeVarsRef.current);
      return { command: rawCommand, output: val !== null ? formatValue(val) : `${dispMatch[1].trim()} = (undefined)`, timestamp: ts };
    }
    // fprintf(fmt, ...) — just evaluate the first arg if it's a string-like
    const fprintfMatch = text.match(/^fprintf\((.+)\)$/i);
    if (fprintfMatch) {
      const val = evaluateCommandExpression(fprintfMatch[1].trim(), runtimeVarsRef.current);
      return { command: rawCommand, output: val !== null ? formatValue(val) : '', timestamp: ts };
    }
    // format short/long — acknowledge silently
    if (/^format\b/i.test(text)) return { command: rawCommand, output: silent ? '' : '(format command acknowledged)', timestamp: ts };

    const plotMatch = text.match(/^plot\((.+)\)$/i);
    if (plotMatch) {
      const plotExpr = plotMatch[1].trim();
      onGraphExpression?.(plotExpr);
      return { command: rawCommand, output: silent ? '' : `Sent "${plotExpr}" to Graph tab.`, timestamp: ts };
    }

    // lu(A) — show L, U, P
    const luPrintMatch = text.match(/^lu\((.+)\)$/i);
    if (luPrintMatch) {
      const val = runtimeVarsRef.current[luPrintMatch[1].trim()] ?? evaluateCommandExpression(luPrintMatch[1].trim(), runtimeVarsRef.current);
      if (val && isMatrix(val)) {
        const res = luDecomp(val);
        if (res) {
          if (!silent) {
            runtimeVarsRef.current = { ...runtimeVarsRef.current, L: res.L, U: res.U, P: res.P };
            setRuntimeVars({ ...runtimeVarsRef.current });
          }
          return { command: rawCommand, output: silent ? '' : `L =\n${formatMatrix(res.L)}\n\nU =\n${formatMatrix(res.U)}\n\nP =\n${formatMatrix(res.P)}`, timestamp: ts };
        }
      }
    }

    // qr(A) — show Q, R
    const qrPrintMatch = text.match(/^qr\((.+)\)$/i);
    if (qrPrintMatch) {
      const val = runtimeVarsRef.current[qrPrintMatch[1].trim()] ?? evaluateCommandExpression(qrPrintMatch[1].trim(), runtimeVarsRef.current);
      if (val && isMatrix(val)) {
        const res = qrDecomp(val);
        if (res) {
          if (!silent) {
            runtimeVarsRef.current = { ...runtimeVarsRef.current, Q: res.Q, R: res.R };
            setRuntimeVars({ ...runtimeVarsRef.current });
          }
          return { command: rawCommand, output: silent ? '' : `Q =\n${formatMatrix(res.Q)}\n\nR =\n${formatMatrix(res.R)}`, timestamp: ts };
        }
      }
    }

    const assignMatch = text.match(/^([A-Za-z]\w*)\s*=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const expr = assignMatch[2];
      const computed = evaluateCommandExpression(expr, runtimeVarsRef.current);
      if (computed === null) {
        const detail = explainMatrixFailure(expr, runtimeVarsRef.current) ?? explainVectorFailure(expr, runtimeVarsRef.current);
        return { command: rawCommand, output: detail ?? (source === 'script' ? `Line failed: "${rawCommand}"` : `Cannot evaluate: ${expr}`), error: true, timestamp: ts };
      }
      runtimeVarsRef.current = { ...runtimeVarsRef.current, [varName]: computed };
      setRuntimeVars({ ...runtimeVarsRef.current });
      return { command: rawCommand, output: silent ? '' : `${varName} =\n${formatValue(computed)}`, timestamp: ts };
    }

    const evaluated = evaluateCommandExpression(text, runtimeVarsRef.current);
    if (evaluated === null) {
      const detail = explainMatrixFailure(text, runtimeVarsRef.current) ?? explainVectorFailure(text, runtimeVarsRef.current);
      return { command: rawCommand, output: detail ?? (source === 'script' ? `Line failed: "${rawCommand}"` : `Unknown command: ${text}`), error: true, timestamp: ts };
    }
    // Track `ans`
    runtimeVarsRef.current = { ...runtimeVarsRef.current, ans: evaluated };
    setRuntimeVars({ ...runtimeVarsRef.current });
    return { command: rawCommand, output: silent ? '' : `ans =\n${formatValue(evaluated)}`, timestamp: ts };
  }, [onGraphExpression]);

  const runCommand = useCallback(() => {
    const item = runSingleCommand(command, 'command');
    if (item.command.trim()) {
      pushHistory(item);
      setHistoryIndex(-1);
    }
    if (!item.error) {
      setCommand('');
    }
  }, [command, pushHistory, runSingleCommand]);

  const clearWorkspace = useCallback(() => {
    runtimeVarsRef.current = {};
    setRuntimeVars({});
    setSelectedVar(null);
  }, []);

  const clearOutput = useCallback(() => {
    setHistory([]);
  }, []);

  const loadDemo = useCallback(() => {
    setShowScript(true);
    setScriptText(DEMO_SCRIPT);
    setCommand('X = [1 0 2 1; 2 1 3 0; 0 1 1 2]');
    commandInputRef.current?.focus();
  }, []);


  const runScript = useCallback(async () => {
    if (runningScript) return;
    const lines = scriptText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('%') && !line.startsWith('//'));

    if (lines.length === 0) return;

    setRunningScript(true);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const item = runSingleCommand(line, 'script');
      if (item.error) {
        pushHistory({
          ...item,
          output: `Line ${i + 1}: ${item.output}`,
        });
        break;
      }
      pushHistory(item);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    setRunningScript(false);
  }, [pushHistory, runSingleCommand, runningScript, scriptText]);

  const onCommandKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runCommand();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHistoryIndex(prev => {
        const next = prev < 0 ? history.length - 1 : Math.max(0, prev - 1);
        const nextCmd = history[next]?.command || '';
        setCommand(nextCmd);
        return next;
      });
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHistoryIndex(prev => {
        if (prev < 0) return -1;
        const next = prev + 1;
        if (next >= history.length) {
          setCommand('');
          return -1;
        }
        setCommand(history[next]?.command || '');
        return next;
      });
    }
  }, [history, runCommand]);
  return (
    <div className="ml-root" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="ml-hero">
        <div className="ml-hero-copy">
          <span className="ml-eyebrow">MathLab</span>
          <h3>Matrix, vector, and linear algebra playground</h3>
          <p>
            Keep matrix arithmetic, vector work, eig/det/inv, scripts, and plotting together in one MATLAB-style workspace.
          </p>
          <div className="ml-stats">
            <span>One combined lab</span>
            <span>{workspaceSummary.total} vars</span>
            <span>{workspaceSummary.matrixCount} matrices</span>
            <span>{workspaceSummary.scalarCount} scalars</span>
            <span>{workspaceSummary.historyCount} outputs</span>
          </div>
        </div>
        <div className="ml-hero-actions">
          <button className="ml-secondary-btn" onClick={loadDemo}>Load demo</button>
          <button className="ml-secondary-btn" onClick={clearWorkspace}>Clear workspace</button>
          <button className="ml-secondary-btn" onClick={clearOutput}>Clear output</button>
        </div>
      </div>

      <div className="ml-chip-groups">
        {CHIP_GROUPS.map(group => (
          <section key={group.label} className="ml-chip-group">
            <div className="ml-chip-group-label">{group.label}</div>
            <div className="ml-chips">
              {group.chips.map(chip => (
                <button
                  key={chip}
                  className="ml-chip"
                  onClick={() => { setCommand(chip); commandInputRef.current?.focus(); }}
                >
                  {chip}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="ml-body">
        {/* Left: REPL + Script */}
        <div className="ml-left">
          {/* Terminal */}
          <div className="ml-terminal">
            <div className="ml-terminal-output">
              {history.length === 0 ? (
                <span className="ml-terminal-empty">
                  No output yet. Click a chip above or type a command below.
                  <br />Try: <code>X = [1 0 2 1; 2 1 3 0; 0 1 1 2]</code> then <code>Y = [1 2; 0 1; 3 0; 2 1]</code> then <code>X * Y</code>
                </span>
              ) : (
                history.map((item, idx) => (
                  <div key={`${item.timestamp}-${idx}`} className={`ml-entry${item.error ? ' ml-entry-err' : ''}`}>
                    <button
                      className="ml-entry-cmd"
                      onClick={() => { setCommand(item.command); commandInputRef.current?.focus(); }}
                      title="Click to recall"
                    >
                      &gt;&gt; {item.command}
                    </button>
                    {item.output && <pre className="ml-entry-out">{item.output}</pre>}
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
            <div className="ml-terminal-input">
              <span className="ml-prompt">&gt;&gt;</span>
              <input
                ref={commandInputRef}
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={onCommandKeyDown}
                placeholder="e.g. A = [1 2; 3 4]  |  A + B  |  X * Y  |  det(A)"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="ml-run-btn" onClick={runCommand}>Run</button>
              <button className="ml-clr-btn" onClick={clearOutput} title="Clear output">✕</button>
            </div>
            <div className="ml-hint-bar">↑/↓ recalls history · <code>clear</code> wipes workspace · <code>clc</code> clears output · append <code>;</code> to suppress output · type <code>help</code> for all commands</div>
          </div>

          {/* Script editor (collapsible) */}
          <button className="ml-script-toggle" onClick={() => setShowScript(s => !s)}>
            {showScript ? '▾' : '▸'} Script Editor
          </button>
          {showScript && (
            <div className="ml-script-wrap">
              <textarea
                value={scriptText}
                onChange={e => setScriptText(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={'% Write multi-line code here\nA = [1 2; 3 4]\nB = A^2\ndet(B)'}
              />
              <div className="ml-script-bar">
                <button className="ml-run-btn" onClick={runScript} disabled={runningScript}>
                  {runningScript ? '⏳ Running…' : '▶ Run Script'}
                </button>
            <span className="ml-dim">% comments · one command per line · matrix examples include 3x4 by 4x2 multiplication</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Workspace + Visualizations */}
        <div className="ml-right">
          {/* Variables workspace */}
          <div className="ml-panel">
            <div className="ml-panel-hd">
              <span>Workspace</span>
              {Object.keys(runtimeVars).length > 0 && (
                <button className="ml-clear-btn" onClick={clearWorkspace}>
                  clear all
                </button>
              )}
            </div>
            {variableRows.length === 0 ? (
              <span className="ml-dim">No variables yet. Load the demo or run a matrix command to populate the workspace.</span>
            ) : (
              <table className="ml-ws-table">
                <thead>
                  <tr><th>Name</th><th>Shape</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {variableRows.map(row => (
                    <tr
                      key={row.name}
                      className={selectedVar === row.name ? 'ml-ws-sel' : ''}
                      onClick={() => setSelectedVar(prev => prev === row.name ? null : row.name)}
                      title={row.type === 'matrix' ? 'Click to toggle heatmap' : String(row.value)}
                    >
                      <td className="ml-ws-name">{row.name}</td>
                      <td className="ml-ws-shape">{row.shape}</td>
                      <td className="ml-ws-prev">{row.preview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Matrix heatmap — shows selected var or first matrix */}
          {selectedHeatmap && (
            <div className="ml-panel">
              <div className="ml-panel-hd">
                <span>Heatmap — <code>{selectedHeatmap.name}</code></span>
                <span className="ml-panel-meta">{selectedHeatmap.matrix.length}x{selectedHeatmap.matrix[0]?.length ?? 0}</span>
              </div>
              <div className="ml-heatmap">
                {selectedHeatmap.matrix.map((row, i) => (
                  <div key={i} className="ml-hm-row">
                    {row.map((v, j) => {
                      const t2 = (v - selectedHeatmap.min) / selectedHeatmap.range;
                      return (
                        <div
                          key={j}
                          className="ml-hm-cell"
                          style={{ background: `hsl(${210 - t2 * 220} 70% 60%)` }}
                          title={`(${i+1},${j+1}) = ${Number(v.toFixed(4))}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <span className="ml-dim">{selectedHeatmap.min.toFixed(3)} … {selectedHeatmap.max.toFixed(3)}</span>
            </div>
          )}

          {/* Vector field */}
          <div className="ml-panel">
            <div className="ml-panel-hd">
              <span>Vector Field</span>
              <span className="ml-panel-meta">{gridSize}x{gridSize} grid</span>
            </div>
            <div className="ml-vf-grid">
              <label>u(x,y)<input value={fieldU} onChange={e => setFieldU(e.target.value)} /></label>
              <label>v(x,y)<input value={fieldV} onChange={e => setFieldV(e.target.value)} /></label>
              <label>Grid<input type="number" min={3} max={15} value={gridSize} onChange={e => setGridSize(Number(e.target.value))} /></label>
              <label>Scale<input type="number" step={0.1} min={0.2} max={2} value={fieldScale} onChange={e => setFieldScale(Number(e.target.value))} /></label>
            </div>
            <div className="ml-vf-canvas">
              <svg viewBox="-10 -10 20 20" role="img" aria-label="Vector field">
                <line x1="-9.5" y1="0" x2="9.5" y2="0" stroke="currentColor" strokeOpacity="0.2" />
                <line x1="0" y1="-9.5" x2="0" y2="9.5" stroke="currentColor" strokeOpacity="0.2" />
                {fieldData.points.map((p, idx) => {
                  const mag = Math.sqrt(p.u * p.u + p.v * p.v) || 1;
                  const ux = (p.u / mag) * fieldScale;
                  const vy = (p.v / mag) * fieldScale;
                  return (
                    <g key={idx} transform={`translate(${p.x},${-p.y})`}>
                      <line x1={0} y1={0} x2={ux} y2={-vy} stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.08" />
                      <circle cx={ux} cy={-vy} r="0.15" fill="currentColor" opacity="0.4" />
                    </g>
                  );
                })}
              </svg>
            </div>
            <span className="ml-dim">Example: u = y, v = -x (circular field)</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ml-root {
          display: flex; flex-direction: column; gap: 14px;
          padding: 16px; height: 100%; box-sizing: border-box;
        }

        .ml-hero {
          display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          padding: 16px 18px; border: 1px solid var(--border-subtle); border-radius: 16px;
          background:
            radial-gradient(circle at top right, rgba(249,115,22,0.12), transparent 34%),
            linear-gradient(180deg, var(--bg-surface), var(--bg-inset));
        }
        .ml-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .ml-eyebrow {
          font-size: 10px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
          color: #f97316;
        }
        .ml-hero-copy h3 {
          margin: 0; font-size: 20px; line-height: 1.15; color: var(--text-primary);
        }
        .ml-hero-copy p {
          margin: 0; max-width: 680px; font-size: 13px; line-height: 1.55; color: var(--text-secondary);
        }
        .ml-stats { display: flex; flex-wrap: wrap; gap: 8px; }
        .ml-stats span {
          padding: 4px 10px; border-radius: 999px; background: var(--bg-2);
          border: 1px solid var(--border-subtle); font-size: 11px; color: var(--text-secondary);
        }
        .ml-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .ml-secondary-btn {
          padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.02); color: var(--text-secondary); cursor: pointer;
          font-size: 12px; font-weight: 600; transition: border-color 0.12s, color 0.12s, transform 0.12s;
        }
        .ml-secondary-btn:hover { border-color: #f97316; color: #f97316; transform: translateY(-1px); }
        .ml-focus-card {
          display: flex; justify-content: space-between; align-items: center; gap: 14px;
          padding: 12px 14px; border: 1px solid var(--border-subtle); border-radius: 14px;
          background: var(--bg-surface);
        }
        .ml-focus-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .ml-focus-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #f97316;
        }
        .ml-focus-copy p { margin: 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); max-width: 680px; }
        .ml-subcategories { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
        .ml-subcategory {
          padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border-subtle);
          background: var(--bg-2); color: var(--text-secondary); font-size: 11px; font-weight: 600; cursor: pointer;
          transition: border-color 0.12s, color 0.12s, background 0.12s, transform 0.12s;
        }
        .ml-subcategory:hover { border-color: #f97316; color: #f97316; transform: translateY(-1px); }
        .ml-subcategory.is-active { background: rgba(249,115,22,0.12); color: #f97316; border-color: rgba(249,115,22,0.4); }

        /* Chips */
        .ml-chip-groups {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
        }
        .ml-chip-group {
          display: flex; flex-direction: column; gap: 8px; padding: 12px;
          border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--bg-surface);
        }
        .ml-chip-group-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-muted);
        }
        .ml-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ml-chip {
          padding: 5px 10px; border-radius: 999px; font-size: 11px;
          font-family: var(--font-mono, monospace); border: 1px solid var(--border-subtle);
          background: var(--bg-2); color: var(--text-secondary); cursor: pointer;
          white-space: nowrap; transition: border-color 0.12s, color 0.12s, transform 0.12s, background 0.12s;
        }
        .ml-chip:hover { border-color: #f97316; color: #f97316; background: rgba(249,115,22,0.08); transform: translateY(-1px); }

        /* Body */
        .ml-body { display: flex; gap: 14px; flex: 1; min-height: 0; }
        .ml-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
        .ml-right { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }

        /* Terminal */
        .ml-terminal {
          display: flex; flex-direction: column;
          border: 1px solid var(--border-subtle); border-radius: 14px;
          overflow: hidden; background: var(--bg-inset); flex: 1; min-height: 280px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .ml-terminal-output {
          flex: 1; overflow-y: auto; padding: 12px 14px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .ml-terminal-empty {
          font-size: 12px; color: var(--text-muted);
          font-family: var(--font-mono, monospace); line-height: 1.8;
        }
        .ml-terminal-empty code {
          background: var(--bg-surface); padding: 1px 6px;
          border-radius: 4px; font-size: 11px; border: 1px solid var(--border-subtle);
        }
        .ml-entry { display: flex; flex-direction: column; gap: 2px; }
        .ml-entry-cmd {
          background: none; border: none; text-align: left; cursor: pointer;
          font-family: var(--font-mono, monospace); font-size: 12px;
          color: var(--text-muted); padding: 0; opacity: 0.75;
          transition: opacity 0.1s, color 0.1s;
        }
        .ml-entry-cmd:hover { opacity: 1; color: #f97316; }
        .ml-entry-out {
          margin: 0; font-family: var(--font-mono, monospace); font-size: 12px;
          color: var(--text-primary); white-space: pre-wrap;
          padding-left: 20px; line-height: 1.55; border-left: 2px solid var(--border-subtle);
        }
        .ml-entry-err .ml-entry-cmd { color: #f87171; opacity: 1; }
        .ml-entry-err .ml-entry-out { color: #f87171; border-left-color: #f87171; }

        /* Input row */
        .ml-terminal-input {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 10px; border-top: 1px solid var(--border-subtle);
          background: var(--bg-surface);
        }
        .ml-prompt {
          font-family: var(--font-mono, monospace); font-size: 13px;
          color: #f97316; font-weight: 700; flex-shrink: 0;
        }
        .ml-terminal-input input {
          flex: 1; border: none; background: transparent;
          font-family: var(--font-mono, monospace); font-size: 13px;
          color: var(--text-primary); outline: none; padding: 0; min-width: 0;
        }
        .ml-run-btn {
          padding: 5px 14px; border-radius: 6px; border: none;
          background: #f97316; color: #fff; font-size: 12px; font-weight: 600;
          cursor: pointer; flex-shrink: 0; transition: opacity 0.1s;
        }
        .ml-run-btn:hover { opacity: 0.88; }
        .ml-run-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ml-clr-btn {
          padding: 5px 9px; border-radius: 6px; flex-shrink: 0;
          border: 1px solid var(--border-subtle); background: none;
          color: var(--text-muted); font-size: 11px; cursor: pointer;
          transition: color 0.1s, border-color 0.1s;
        }
        .ml-clr-btn:hover { color: #f87171; border-color: #f87171; }
        .ml-hint-bar {
          font-size: 10px; color: var(--text-muted); padding: 3px 12px;
          background: var(--bg-2); border-top: 1px solid var(--border-subtle);
        }
        .ml-hint-bar code {
          background: var(--bg-surface); padding: 0 4px; border-radius: 3px;
          font-size: 9px; border: 1px solid var(--border-subtle);
        }

        /* Script */
        .ml-script-toggle {
          background: none; border: none; color: var(--text-secondary);
          font-size: 12px; font-weight: 600; cursor: pointer;
          text-align: left; padding: 2px 0;
          transition: color 0.1s;
        }
        .ml-script-toggle:hover { color: #f97316; }
        .ml-script-wrap { display: flex; flex-direction: column; gap: 6px; }
        .ml-script-wrap textarea {
          width: 100%; border: 1px solid var(--border-subtle); border-radius: 12px;
          padding: 10px 12px; font-family: var(--font-mono, monospace); font-size: 12px;
          background: var(--bg-inset); color: var(--text-primary);
          resize: vertical; outline: none; box-sizing: border-box; line-height: 1.6;
        }
        .ml-script-wrap textarea:focus { border-color: #f97316; }
        .ml-script-bar { display: flex; align-items: center; gap: 12px; }
        .ml-dim { font-size: 11px; color: var(--text-muted); }

        /* Right panels */
        .ml-panel {
          border: 1px solid var(--border-subtle); border-radius: 14px;
          padding: 12px; background: var(--bg-surface);
          display: flex; flex-direction: column; gap: 8px;
        }
        .ml-panel-hd {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--text-muted);
          display: flex; justify-content: space-between; align-items: center;
        }
        .ml-panel-meta {
          font-size: 10px; font-weight: 500; text-transform: none; letter-spacing: 0;
          color: var(--text-muted);
        }
        .ml-panel-hd code {
          font-size: 10px; background: var(--bg-2); padding: 1px 5px;
          border-radius: 3px; border: 1px solid var(--border-subtle);
          color: var(--text-secondary); font-weight: 400; text-transform: none;
          letter-spacing: 0;
        }
        .ml-clear-btn {
          background: none; border: 1px solid var(--border-subtle);
          color: var(--text-muted); font-size: 10px; padding: 2px 7px;
          border-radius: 4px; cursor: pointer; transition: color 0.1s, border-color 0.1s;
        }
        .ml-clear-btn:hover { color: #f87171; border-color: #f87171; }

        /* Workspace table */
        .ml-ws-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .ml-ws-table th {
          color: var(--text-muted); font-weight: 600; padding: 3px 4px;
          text-align: left; border-bottom: 1px solid var(--border-subtle); font-size: 10px;
        }
        .ml-ws-table td {
          padding: 5px 4px; border-bottom: 1px solid var(--border-subtle);
          color: var(--text-secondary); cursor: pointer;
        }
        .ml-ws-table tbody tr:hover td { background: var(--bg-2); }
        .ml-ws-sel td { background: rgba(249,115,22,0.07) !important; }
        .ml-ws-name { font-family: var(--font-mono, monospace); color: var(--text-primary) !important; font-weight: 600; }
        .ml-ws-shape { color: var(--text-muted) !important; font-size: 10px; }
        .ml-ws-prev {
          font-family: var(--font-mono, monospace); font-size: 10px;
          max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* Heatmap */
        .ml-heatmap { display: inline-flex; flex-direction: column; gap: 3px; }
        .ml-hm-row { display: flex; gap: 3px; }
        .ml-hm-cell { width: 20px; height: 20px; border-radius: 3px; cursor: default; }

        /* Vector field */
        .ml-vf-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
        }
        .ml-vf-grid label {
          font-size: 10px; color: var(--text-muted);
          display: flex; flex-direction: column; gap: 3px;
        }
        .ml-vf-grid input {
          border: 1px solid var(--border-subtle); border-radius: 6px;
          padding: 4px 6px; background: var(--bg-inset); color: var(--text-primary);
          font-size: 11px; font-family: var(--font-mono, monospace); outline: none;
        }
        .ml-vf-canvas { background: var(--bg-inset); border-radius: 8px; overflow: hidden; }
        .ml-vf-canvas svg { width: 100%; height: 190px; color: var(--text-primary); display: block; }

        @media (max-width: 700px) {
          .ml-hero { flex-direction: column; }
          .ml-hero-actions { justify-content: flex-start; }
          .ml-focus-card { flex-direction: column; align-items: flex-start; }
          .ml-subcategories { justify-content: flex-start; }
          .ml-chip-groups { grid-template-columns: 1fr; }
          .ml-body { flex-direction: column; }
          .ml-right { width: 100%; }
          .ml-terminal { min-height: 240px; }
        }
      `}</style>
    </div>
  );
}
