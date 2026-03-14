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

type MatlabTemplate = {
  label: string;
  command: string;
  description: string;
};

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
  if (n === 3) {
    const [a, b, c] = matrix[0];
    const [d, e, f] = matrix[1];
    const [g, h, i] = matrix[2];
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }
  return null;
}

function inverse2x2(matrix: Matrix): Matrix | null {
  if (matrix.length !== 2 || matrix[0].length !== 2) return null;
  const det = determinant(matrix);
  if (!det) return null;
  const [[a, b], [c, d]] = matrix;
  return [
    [d / det, -b / det],
    [-c / det, a / det],
  ];
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

function parseVector(input: string): number[] | null {
  const matrix = parseMatrix(input);
  if (!matrix) return null;
  if (matrix[0].length === 1) return matrix.map(row => row[0]);
  if (matrix.length === 1) return [...matrix[0]];
  return null;
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

function serializeMatrixBuilder(values: string[][]) {
  return `[${values.map((row) => row.map((cell) => cell || '0').join(' ')).join('; ')}]`;
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

const MATLAB_TEMPLATES: MatlabTemplate[] = [
  { label: 'A = [1 2; 3 4]', command: 'A = [1 2; 3 4]', description: 'Create a matrix in the workspace.' },
  { label: 'B = [5 6; 7 8]', command: 'B = [5 6; 7 8]', description: 'Create a second matrix for comparison.' },
  { label: 'A * B', command: 'A * B', description: 'Multiply two matrices from the workspace.' },
  { label: 'det(A)', command: 'det(A)', description: 'Compute a determinant.' },
  { label: 'inv(A)', command: 'inv(A)', description: 'Find a 2x2 inverse.' },
  { label: 'eig(A)', command: 'eig(A)', description: 'Estimate 2x2 eigenvalues.' },
  { label: 'transpose(A)', command: 'transpose(A)', description: 'Transpose a matrix.' },
  { label: 'solve(A,b)', command: 'solve(A,b)', description: 'Solve a linear system after defining A and b.' },
  { label: 'plot(sin(x) + x^2)', command: 'plot(sin(x) + x^2)', description: 'Send a graphable expression to the Graph tab.' },
];

function evaluateCommandExpression(expr: string, vars: Record<string, MatlabValue>): MatlabValue | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const literalMatrix = parseMatrix(trimmed);
  if (literalMatrix) return literalMatrix;

  const numberLiteral = Number(trimmed);
  if (!Number.isNaN(numberLiteral) && Number.isFinite(numberLiteral)) return numberLiteral;

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
    if (fn === 'inv' && isMatrix(arg)) return inverse2x2(arg);
    if (fn === 'transpose' && isMatrix(arg)) return transposeMatrix(arg);
    if (fn === 'eig' && isMatrix(arg)) {
      const eig = eigen2x2(arg);
      if (!eig) return null;
      return [[eig.lambda1], [eig.lambda2]];
    }
    if (fn === 'sqrt' && !isMatrix(arg)) return Math.sqrt(arg);
    if (fn === 'sin' && !isMatrix(arg)) return Math.sin(arg);
    if (fn === 'cos' && !isMatrix(arg)) return Math.cos(arg);
    if (fn === 'tan' && !isMatrix(arg)) return Math.tan(arg);
    if (fn === 'log' && !isMatrix(arg)) return Math.log(arg);
    return null;
  }

  const binary = trimmed.match(/^(.+)\s*([+\-*])\s*(.+)$/);
  if (binary) {
    const left = evaluateCommandExpression(binary[1], vars);
    const right = evaluateCommandExpression(binary[3], vars);
    const op = binary[2] as '+' | '-' | '*';
    if (left == null || right == null) return null;

    if (!isMatrix(left) && !isMatrix(right)) {
      if (op === '+') return left + right;
      if (op === '-') return left - right;
      return left * right;
    }
    if (isMatrix(left) && isMatrix(right)) {
      if (op === '+') return addMatrices(left, right);
      if (op === '-') return subtractMatrices(left, right);
      return multiplyMatrices(left, right);
    }
    if (isMatrix(left) && !isMatrix(right)) {
      if (op === '*' || op === '+' || op === '-') return scalarMatrixOp(left, right, op);
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
  const t = useCallback((key: string) => {
    const ar: Record<string, string> = {
      'MATLAB Lab': 'مختبر MATLAB',
      'Matrix operations, quick plots, and MATLAB-style inputs.': 'عمليات المصفوفات ورسوم سريعة وإدخال بأسلوب MATLAB.',
      'Plot Expression': 'رسم التعبير',
      'Matrix A': 'المصفوفة A',
      'Matrix B': 'المصفوفة B',
      'Operations': 'العمليات',
      'Linear System / Power': 'نظام خطي / أس',
      'Result': 'النتيجة',
      'Command Window': 'نافذة الأوامر',
      'Live Script Lite': 'السكربت المباشر (خفيف)',
      'Run Script': 'تشغيل السكربت',
      'Running...': 'جارٍ التشغيل...',
      'Command History': 'سجل الأوامر',
      'No commands yet.': 'لا توجد أوامر بعد.',
      'Variables Workspace': 'مساحة المتغيرات',
      'No variables in workspace yet. Assign with `A = [1 2; 3 4]`.': 'لا توجد متغيرات بعد. أضف متغيرًا مثل: `A = [1 2; 3 4]`.',
      'Name': 'الاسم',
      'Type': 'النوع',
      'Shape': 'الأبعاد',
      'Preview': 'معاينة',
      'Run': 'تشغيل',
      'Use `Enter` to run. Use `↑/↓` for command history. Commands: `clear`, `clc`.': 'استخدم `Enter` للتشغيل و`↑/↓` للتنقل في السجل. أوامر: `clear` و`clc`.',
      'One command per line. `%` and `//` are treated as comments.': 'أمر واحد في كل سطر. `%` و`//` يعتبران تعليقًا.',
      'Vector Field': 'حقل متجهات',
      'Grid': 'الشبكة',
      'Scale': 'المقياس',
      'Solve Ax = b': 'حل Ax = b',
      'A^n': 'A^n',
      'Workspace cleared.': 'تم مسح مساحة المتغيرات.',
      'History cleared.': 'تم مسح سجل الأوامر.',
      'Matrix A is invalid. Use MATLAB format like [1 2; 3 4].': 'المصفوفة A غير صالحة. استخدم صيغة MATLAB مثل [1 2; 3 4].',
      'Matrix B is invalid. Use MATLAB format like [5 6; 7 8].': 'المصفوفة B غير صالحة. استخدم صيغة MATLAB مثل [5 6; 7 8].',
      'Vector b is invalid. Use format like [1; 2] or [1 2].': 'المتجه b غير صالح. استخدم [1; 2] أو [1 2].',
      'Operation failed. Check matrix sizes (A+B requires same size, A*B requires columns of A = rows of B).': 'فشلت العملية. تحقق من أبعاد المصفوفات.',
      'Run an operation to see output.': 'شغّل عملية لعرض النتيجة.',
      'Enter a valid matrix A to preview a heatmap.': 'أدخل مصفوفة A صحيحة لعرض الخريطة الحرارية.',
      'Command templates': 'قوالب الأوامر',
      'Supported syntax': 'الصياغة المدعومة',
      'Matrix builder': 'منشئ المصفوفات',
      'Apply to Matrix A': 'تطبيق على المصفوفة A',
      'Apply to Matrix B': 'تطبيق على المصفوفة B',
      'Load Matrix A': 'تحميل المصفوفة A',
      'Use a template to seed the command window or hand a plot straight to the Graph tab.': 'استخدم قالباً لملء نافذة الأوامر أو لإرسال الرسم مباشرة إلى تبويب Graph.',
      'Core commands: assignments, det, inv, trace, rank, norm, eig, transpose, solve(A,b), and plot(expr).': 'الأوامر الأساسية: الإسناد و det و inv و trace و rank و norm و eig و transpose و solve(A,b) و plot(expr).',
      'The matrix builder is meant for fast 2x2 or 3x3 study cases, not full MATLAB table editing.': 'منشئ المصفوفات مخصص لحالات الدراسة السريعة 2x2 أو 3x3 وليس لتحرير جداول MATLAB الكاملة.',
    };
    return isArabic ? (ar[key] || key) : key;
  }, [isArabic]);

  const [matrixA, setMatrixA] = useState('[1 2; 3 4]');
  const [matrixB, setMatrixB] = useState('[5 6; 7 8]');
  const [builderRows, setBuilderRows] = useState(2);
  const [builderCols, setBuilderCols] = useState(2);
  const [builderValues, setBuilderValues] = useState<string[][]>(() => Array.from({ length: 2 }, () => Array(2).fill('0')));
  const [expression, setExpression] = useState('sin(x) + x^2');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [fieldU, setFieldU] = useState('y');
  const [fieldV, setFieldV] = useState('-x');
  const [gridSize, setGridSize] = useState(9);
  const [fieldScale, setFieldScale] = useState(0.7);
  const [vectorB, setVectorB] = useState('[1; 1]');
  const [powerN, setPowerN] = useState(2);
  const [restoredSession] = useState<MatlabSession | null>(() => loadStoredSession());
  const [command, setCommand] = useState(restoredSession?.command || 'A = [1 2; 3 4]');
  const [scriptText, setScriptText] = useState(restoredSession?.script || 'A = [1 2; 3 4]\nB = A^2\ndet(B)');
  const [runtimeVars, setRuntimeVars] = useState<Record<string, MatlabValue>>(
    restoredSession?.variables && typeof restoredSession.variables === 'object' ? restoredSession.variables : {}
  );
  const [history, setHistory] = useState<MatlabHistoryItem[]>(
    Array.isArray(restoredSession?.history) ? restoredSession.history.slice(-100) : []
  );
  const [, setHistoryIndex] = useState<number>(-1);
  const [runningScript, setRunningScript] = useState(false);
  const commandInputRef = useRef<HTMLInputElement | null>(null);

  const resizeBuilder = useCallback((rows: number, cols: number) => {
    setBuilderRows(rows);
    setBuilderCols(cols);
    setBuilderValues((prev) =>
      Array.from({ length: rows }, (_, rowIndex) =>
        Array.from({ length: cols }, (_, colIndex) => prev[rowIndex]?.[colIndex] ?? '0'),
      ),
    );
  }, []);

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

  useEffect(() => {
    try {
      const session: MatlabSession = {
        variables: runtimeVars,
        history: history.slice(-100),
        script: scriptText,
        command,
      };
      writeCompatStorage(localStorage, storageKeys.matlabSession, JSON.stringify(session));
    } catch {
      // Ignore storage write failures (quota/private mode).
    }
  }, [runtimeVars, history, scriptText, command]);

  const parsedA = useMemo(() => parseMatrix(matrixA), [matrixA]);
  const parsedB = useMemo(() => parseMatrix(matrixB), [matrixB]);

  const matrixHeatmap = useMemo(() => {
    if (!parsedA) return null;
    const flat = parsedA.flat();
    const min = Math.min(...flat);
    const max = Math.max(...flat);
    const range = max - min || 1;
    return { matrix: parsedA, min, max, range };
  }, [parsedA]);

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
    return { points, size };
  }, [fieldU, fieldV, gridSize, evalField]);

  const pushHistory = useCallback((item: MatlabHistoryItem) => {
    setHistory(prev => [...prev.slice(-99), item]);
  }, []);

  const runSingleCommand = useCallback((rawCommand: string, source: 'command' | 'script' = 'command'): MatlabHistoryItem => {
    const text = rawCommand.trim();
    if (!text) {
      return {
        command: rawCommand,
        output: '',
        timestamp: new Date().toISOString(),
      };
    }

    if (text.toLowerCase() === 'clear') {
      setRuntimeVars({});
      return {
        command: rawCommand,
        output: t('Workspace cleared.'),
        timestamp: new Date().toISOString(),
      };
    }

    if (text.toLowerCase() === 'clc') {
      setHistory([]);
      return {
        command: rawCommand,
        output: t('History cleared.'),
        timestamp: new Date().toISOString(),
      };
    }

    const plotMatch = text.match(/^plot\((.+)\)$/i);
    if (plotMatch) {
      const plotExpression = plotMatch[1].trim();
      setExpression(plotExpression);
      onGraphExpression?.(plotExpression);
      return {
        command: rawCommand,
        output: `Sent ${plotExpression} to the Graph tab.`,
        timestamp: new Date().toISOString(),
      };
    }

    const assignMatch = text.match(/^([A-Za-z]\w*)\s*=\s*(.+)$/);
    if (assignMatch) {
      const varName = assignMatch[1];
      const expr = assignMatch[2];
      let computed: MatlabValue | null = null;
      let output = '';

      setRuntimeVars(prev => {
        computed = evaluateCommandExpression(expr, prev);
        if (computed === null) return prev;
        output = `${varName} = ${formatValue(computed)}`;
        return { ...prev, [varName]: computed };
      });

      if (computed === null) {
        return {
          command: rawCommand,
          output: source === 'script' ? `Script line failed: "${rawCommand}"` : `Could not evaluate: ${expr}`,
          error: true,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        command: rawCommand,
        output,
        timestamp: new Date().toISOString(),
      };
    }

    let evaluated: MatlabValue | null = null;
    setRuntimeVars(prev => {
      evaluated = evaluateCommandExpression(text, prev);
      return prev;
    });

    if (evaluated === null) {
      return {
        command: rawCommand,
        output: source === 'script' ? `Script line failed: "${rawCommand}"` : `Could not evaluate: ${text}`,
        error: true,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      command: rawCommand,
      output: formatValue(evaluated),
      timestamp: new Date().toISOString(),
    };
  }, [onGraphExpression, t]);

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

  const applyTemplate = useCallback((template: MatlabTemplate) => {
    if (template.command.startsWith('plot(')) {
      const expr = template.command.replace(/^plot\(/, '').replace(/\)$/, '');
      setExpression(expr);
      onGraphExpression?.(expr);
    }
    setCommand(template.command);
    commandInputRef.current?.focus();
  }, [onGraphExpression]);

  const applyBuilderToMatrix = useCallback((target: 'A' | 'B') => {
    const serialized = serializeMatrixBuilder(builderValues);
    if (target === 'A') {
      setMatrixA(serialized);
      return;
    }
    setMatrixB(serialized);
  }, [builderValues]);

  const loadBuilderFromA = useCallback(() => {
    const parsed = parseMatrix(matrixA);
    if (!parsed) return;
    resizeBuilder(parsed.length, parsed[0]?.length || 0);
    setBuilderValues(parsed.map((row) => row.map((value) => String(value))));
  }, [matrixA, resizeBuilder]);

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

  const handleMatrixOp = (op: 'add' | 'sub' | 'mul' | 'transA' | 'detA' | 'invA' | 'traceA' | 'rankA' | 'normA' | 'powA' | 'solveAxB' | 'eig2A') => {
    setError('');
    if (!parsedA) {
      setError(t('Matrix A is invalid. Use MATLAB format like [1 2; 3 4].'));
      return;
    }

    if (['add', 'sub', 'mul'].includes(op) && !parsedB) {
      setError(t('Matrix B is invalid. Use MATLAB format like [5 6; 7 8].'));
      return;
    }

    let output: string | null = null;
    if (op === 'add') {
      const res = addMatrices(parsedA, parsedB!);
      output = res ? formatMatrix(res) : null;
    }
    if (op === 'sub') {
      const res = subtractMatrices(parsedA, parsedB!);
      output = res ? formatMatrix(res) : null;
    }
    if (op === 'mul') {
      const res = multiplyMatrices(parsedA, parsedB!);
      output = res ? formatMatrix(res) : null;
    }
    if (op === 'transA') {
      output = formatMatrix(transposeMatrix(parsedA));
    }
    if (op === 'detA') {
      const det = determinant(parsedA);
      output = det === null ? null : `det(A) = ${det}`;
    }
    if (op === 'invA') {
      const inv = inverse2x2(parsedA);
      output = inv ? formatMatrix(inv) : null;
    }
    if (op === 'traceA') {
      const tr = traceMatrix(parsedA);
      output = tr === null ? null : `trace(A) = ${Number(tr.toFixed(6))}`;
    }
    if (op === 'rankA') {
      output = `rank(A) = ${rankMatrix(parsedA)}`;
    }
    if (op === 'normA') {
      output = `||A||_F = ${Number(matrixNormFro(parsedA).toFixed(6))}`;
    }
    if (op === 'powA') {
      const pw = matrixPower(parsedA, powerN);
      output = pw ? formatMatrix(pw) : null;
    }
    if (op === 'solveAxB') {
      const b = parseVector(vectorB);
      if (!b) {
        setError(t('Vector b is invalid. Use format like [1; 2] or [1 2].'));
        return;
      }
      const sol = solveLinearSystem(parsedA, b);
      output = sol ? `x = [${sol.map(v => Number(v.toFixed(6))).join(', ')}]` : null;
    }
    if (op === 'eig2A') {
      const eig = eigen2x2(parsedA);
      output = eig ? `eig(A) = [${Number(eig.lambda1.toFixed(6))}, ${Number(eig.lambda2.toFixed(6))}]` : null;
    }

    if (!output) {
      setError(t('Operation failed. Check matrix sizes (A+B requires same size, A*B requires columns of A = rows of B).'));
      return;
    }
    setResult(output);
  };

  return (
    <div className="matlab-lab">
      <div className="lab-header">
        <div>
          <h3>{t('MATLAB Lab')}</h3>
          <p>{t('Matrix operations, quick plots, and MATLAB-style inputs.')}</p>
        </div>
        {onGraphExpression && (
          <button className="btn secondary" onClick={() => onGraphExpression(expression)}>
            📈 {t('Plot Expression')}
          </button>
        )}
      </div>

      <div className="lab-grid">
        <section className="lab-card wide">
          <h4>{t('Command templates')}</h4>
          <p className="hint">{t('Use a template to seed the command window or hand a plot straight to the Graph tab.')}</p>
          <div className="template-grid">
            {MATLAB_TEMPLATES.map((template) => (
              <button key={template.command} className="template-card" onClick={() => applyTemplate(template)}>
                <strong>{template.label}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="lab-card">
          <h4>{t('Supported syntax')}</h4>
          <ul className="syntax-list">
            <li>{t('Core commands: assignments, det, inv, trace, rank, norm, eig, transpose, solve(A,b), and plot(expr).')}</li>
            <li>{t('The matrix builder is meant for fast 2x2 or 3x3 study cases, not full MATLAB table editing.')}</li>
            <li>Use `A = [1 2; 3 4]`, `b = [1; 2]`, then `solve(A,b)` for linear systems.</li>
          </ul>
        </section>

        <section className="lab-card">
          <h4>{t('Matrix builder')}</h4>
          <div className="builder-toolbar">
            <label>
              Rows
              <select value={builderRows} onChange={(e) => resizeBuilder(Number(e.target.value), builderCols)}>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
            <label>
              Cols
              <select value={builderCols} onChange={(e) => resizeBuilder(builderRows, Number(e.target.value))}>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>
          <div className="builder-grid" style={{ gridTemplateColumns: `repeat(${builderCols}, minmax(0, 1fr))` }}>
            {builderValues.map((row, rowIndex) =>
              row.map((value, colIndex) => (
                <input
                  key={`${rowIndex}-${colIndex}`}
                  value={value}
                  onChange={(e) =>
                    setBuilderValues((prev) =>
                      prev.map((currentRow, currentRowIndex) =>
                        currentRowIndex === rowIndex
                          ? currentRow.map((cell, currentColIndex) => (currentColIndex === colIndex ? e.target.value : cell))
                          : currentRow,
                      ),
                    )
                  }
                />
              )),
            )}
          </div>
          <div className="builder-actions">
            <button className="btn secondary" onClick={() => applyBuilderToMatrix('A')}>{t('Apply to Matrix A')}</button>
            <button className="btn secondary" onClick={() => applyBuilderToMatrix('B')}>{t('Apply to Matrix B')}</button>
            <button className="btn secondary" onClick={loadBuilderFromA}>{t('Load Matrix A')}</button>
          </div>
        </section>

        <section className="lab-card">
          <h4>{t('Matrix A')}</h4>
          <textarea
            value={matrixA}
            onChange={(e) => setMatrixA(e.target.value)}
            rows={4}
          />
          <p className="hint">Format: `[1 2; 3 4]` or rows on new lines.</p>
        </section>

        <section className="lab-card">
          <h4>{t('Matrix B')}</h4>
          <textarea
            value={matrixB}
            onChange={(e) => setMatrixB(e.target.value)}
            rows={4}
          />
          <p className="hint">Use for A + B, A - B, A * B.</p>
        </section>

        <section className="lab-card">
          <h4>{t('Operations')}</h4>
          <div className="button-grid">
            <button className="btn" onClick={() => handleMatrixOp('add')}>A + B</button>
            <button className="btn" onClick={() => handleMatrixOp('sub')}>A - B</button>
            <button className="btn" onClick={() => handleMatrixOp('mul')}>A * B</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('transA')}>A&apos;</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('detA')}>det(A)</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('invA')}>inv(A) (2x2)</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('traceA')}>trace(A)</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('rankA')}>rank(A)</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('normA')}>norm(A)</button>
            <button className="btn secondary" onClick={() => handleMatrixOp('eig2A')}>eig(A) (2x2)</button>
          </div>
          {error && <div className="error">{error}</div>}
        </section>

        <section className="lab-card">
          <h4>{t('Linear System / Power')}</h4>
          <label>b vector (Ax = b)</label>
          <input
            value={vectorB}
            onChange={(e) => setVectorB(e.target.value)}
            placeholder="[1; 2]"
          />
          <button className="btn" onClick={() => handleMatrixOp('solveAxB')}>{t('Solve Ax = b')}</button>
          <label>Power n</label>
          <input
            type="number"
            min={0}
            max={8}
            value={powerN}
            onChange={(e) => setPowerN(Number(e.target.value))}
          />
          <button className="btn secondary" onClick={() => handleMatrixOp('powA')}>{t('A^n')}</button>
          <p className="hint">`A^n` supports non-negative integers and square matrices.</p>
        </section>

        <section className="lab-card wide">
          <h4>{t('Result')}</h4>
          <pre>{result || t('Run an operation to see output.')}</pre>
        </section>

        <section className="lab-card wide">
          <h4>{t('Command Window')}</h4>
          <div className="command-row">
            <span className="command-prompt">&gt;&gt;</span>
            <input
              ref={commandInputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={onCommandKeyDown}
              placeholder={isArabic ? 'اكتب أمر MATLAB مثل A=[1 2;3 4] أو det(A)' : 'Type MATLAB-style command, e.g. A=[1 2;3 4] or det(A)'}
            />
            <button className="btn" onClick={runCommand}>{t('Run')}</button>
          </div>
          <p className="hint">{t('Use `Enter` to run. Use `↑/↓` for command history. Commands: `clear`, `clc`.')}</p>
        </section>

        <section className="lab-card wide">
          <h4>{t('Live Script Lite')}</h4>
          <textarea
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            rows={6}
          />
          <div className="script-actions">
            <button className="btn" onClick={runScript} disabled={runningScript}>
              {runningScript ? t('Running...') : t('Run Script')}
            </button>
            <p className="hint">{t('One command per line. `%` and `//` are treated as comments.')}</p>
          </div>
        </section>

        <section className="lab-card wide">
          <h4>{t('Command History')}</h4>
          <div className="history-list">
            {history.length === 0 ? (
              <p className="hint">{t('No commands yet.')}</p>
            ) : (
              history
                .slice()
                .reverse()
                .map((item, idx) => (
                  <div key={`${item.timestamp}-${idx}`} className={`history-item${item.error ? ' history-error' : ''}`}>
                    <button
                      type="button"
                      className="history-command"
                      onClick={() => {
                        setCommand(item.command);
                        commandInputRef.current?.focus();
                      }}
                    >
                      &gt;&gt; {item.command}
                    </button>
                    <pre>{item.output}</pre>
                  </div>
                ))
            )}
          </div>
        </section>

        <section className="lab-card wide">
          <h4>{t('Variables Workspace')}</h4>
          {variableRows.length === 0 ? (
            <p className="hint">{t('No variables in workspace yet. Assign with `A = [1 2; 3 4]`.')}</p>
          ) : (
            <div className="workspace-table-wrap">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>{t('Name')}</th>
                    <th>{t('Type')}</th>
                    <th>{t('Shape')}</th>
                    <th>{t('Preview')}</th>
                  </tr>
                </thead>
                <tbody>
                  {variableRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.type}</td>
                      <td>{row.shape}</td>
                      <td>{row.preview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lab-card wide">
          <h4>{t('Plot Expression')}</h4>
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="sin(x) + x^2"
          />
          <p className="hint">Supports MATLAB-style `.^`, `.*`, `./` (normalized in Math Solver).</p>
        </section>

        <section className="lab-card wide">
          <h4>{isArabic ? 'خريطة حرارة المصفوفة' : 'Matrix Plot (Heatmap)'}</h4>
          {matrixHeatmap ? (
            <div className="heatmap">
              {matrixHeatmap.matrix.map((row, i) => (
                <div key={i} className="heatmap-row">
                  {row.map((value, j) => {
                    const t = (value - matrixHeatmap.min) / matrixHeatmap.range;
                    const hue = 210 - t * 220;
                    return (
                      <div
                        key={j}
                        className="heatmap-cell"
                        style={{ background: `hsl(${hue} 70% 60%)` }}
                        title={`A(${i + 1},${j + 1}) = ${value}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">{t('Enter a valid matrix A to preview a heatmap.')}</p>
          )}
        </section>

        <section className="lab-card wide">
          <h4>{t('Vector Field')}</h4>
          <div className="field-controls">
            <div>
              <label>u(x,y)</label>
              <input value={fieldU} onChange={(e) => setFieldU(e.target.value)} />
            </div>
            <div>
              <label>v(x,y)</label>
              <input value={fieldV} onChange={(e) => setFieldV(e.target.value)} />
            </div>
            <div>
              <label>{t('Grid')}</label>
              <input
                type="number"
                min={3}
                max={15}
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
              />
            </div>
            <div>
              <label>{t('Scale')}</label>
              <input
                type="number"
                step={0.1}
                min={0.2}
                max={2}
                value={fieldScale}
                onChange={(e) => setFieldScale(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field-canvas">
            <svg viewBox="-10 -10 20 20" role="img" aria-label="Vector field">
              <line x1="-9.5" y1="0" x2="9.5" y2="0" stroke="currentColor" strokeOpacity="0.2" />
              <line x1="0" y1="-9.5" x2="0" y2="9.5" stroke="currentColor" strokeOpacity="0.2" />
              {fieldData.points.map((p, idx) => {
                const mag = Math.sqrt(p.u * p.u + p.v * p.v) || 1;
                const ux = (p.u / mag) * fieldScale;
                const vy = (p.v / mag) * fieldScale;
                return (
                  <g key={idx} transform={`translate(${p.x},${-p.y})`}>
                    <line
                      x1={0}
                      y1={0}
                      x2={ux}
                      y2={-vy}
                      stroke="currentColor"
                      strokeOpacity="0.6"
                      strokeWidth="0.08"
                    />
                    <circle cx={ux} cy={-vy} r="0.15" fill="currentColor" opacity="0.4" />
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="hint">Example: u = y, v = -x (circular field).</p>
        </section>
      </div>

      <style jsx>{`
        .matlab-lab {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .lab-header {
          display: flex;
          justify-content: space-between;
          gap: var(--space-3);
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .lab-header h3 {
          margin: 0 0 var(--space-1);
        }

        .lab-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .lab-grid {
          display: grid;
          gap: var(--space-3);
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .lab-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .lab-card.wide {
          grid-column: 1 / -1;
        }

        textarea, input {
          width: 100%;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: var(--space-2);
          font-family: var(--font-mono, monospace);
          background: var(--bg-inset);
        }

        pre {
          background: var(--bg-inset);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          font-family: var(--font-mono, monospace);
          font-size: var(--font-meta);
          white-space: pre-wrap;
          margin: 0;
        }

        .heatmap {
          display: inline-flex;
          flex-direction: column;
          gap: 4px;
          padding: var(--space-2);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          width: fit-content;
        }

        .heatmap-row {
          display: flex;
          gap: 4px;
        }

        .heatmap-cell {
          width: 22px;
          height: 22px;
          border-radius: 4px;
          border: 1px solid rgba(15, 23, 42, 0.08);
        }

        .field-controls {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--space-2);
        }

        .field-controls label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          display: block;
          margin-bottom: 4px;
        }

        .field-canvas {
          margin-top: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          padding: var(--space-3);
        }

        .field-canvas svg {
          width: 100%;
          height: 260px;
          color: var(--text-primary);
        }

        .button-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: var(--space-2);
        }

        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--space-2);
        }

        .template-card {
          display: grid;
          gap: 6px;
          text-align: left;
          padding: var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-inset) 84%, transparent);
          color: var(--text-primary);
          cursor: pointer;
        }

        .template-card strong {
          font-family: var(--font-mono, monospace);
          font-size: var(--font-meta);
        }

        .template-card span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          line-height: 1.45;
        }

        .syntax-list {
          margin: 0;
          padding-left: 1.1rem;
          color: var(--text-secondary);
          display: grid;
          gap: 0.45rem;
          line-height: 1.6;
        }

        .builder-toolbar {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-2);
        }

        .builder-toolbar label {
          display: grid;
          gap: 6px;
          color: var(--text-muted);
          font-size: var(--font-tiny);
        }

        .builder-toolbar select {
          width: 100%;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          padding: var(--space-2);
          background: var(--bg-inset);
          color: var(--text-primary);
        }

        .builder-grid {
          display: grid;
          gap: var(--space-2);
        }

        .builder-grid input {
          text-align: center;
        }

        .builder-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .hint {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .error {
          background: var(--error-muted);
          color: var(--error);
          font-size: var(--font-meta);
          padding: var(--space-2);
          border-radius: var(--radius-md);
        }

        .command-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: var(--space-2);
          align-items: center;
        }

        .command-prompt {
          font-family: var(--font-mono, monospace);
          color: var(--text-secondary);
          font-size: var(--font-meta);
        }

        .script-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          flex-wrap: wrap;
        }

        .history-list {
          display: grid;
          gap: var(--space-2);
          max-height: 320px;
          overflow: auto;
          padding-right: var(--space-1);
        }

        .history-item {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-2);
          display: grid;
          gap: var(--space-1);
        }

        .history-error {
          border-color: color-mix(in srgb, var(--error) 40%, transparent);
        }

        .history-command {
          border: 0;
          background: transparent;
          text-align: left;
          cursor: pointer;
          font-family: var(--font-mono, monospace);
          color: var(--text-primary);
          font-size: var(--font-meta);
          padding: 0;
        }

        .workspace-table-wrap {
          overflow-x: auto;
        }

        .workspace-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--font-meta);
        }

        .workspace-table th,
        .workspace-table td {
          padding: var(--space-2);
          border-bottom: 1px solid var(--border-subtle);
          text-align: left;
          white-space: nowrap;
        }

        .workspace-table th {
          color: var(--text-muted);
          font-weight: 600;
        }

        @media (max-width: 600px) {
          .lab-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .heatmap-cell {
            width: 18px;
            height: 18px;
          }

          .field-canvas svg {
            height: 220px;
          }
        }
      `}</style>
    </div>
  );
}
