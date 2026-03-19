import type { MathCategoryId } from './types';

export type MathCategoryConfig = {
  id: MathCategoryId;
  label: string;
  supportedActions: string[];
  practicePrompt: string;
  examples: Array<{ expr: string; desc: string }>;
};

export const MATH_CATEGORY_ORDER: MathCategoryId[] = [
  'algebra',
  'geometry',
  'calculus',
  'trigonometry',
  'sequences-series',
  'linear-algebra',
  'statistics',
  'vectors',
  'matrices',
  'differential-equations',
  'discrete',
  'physics',
];

export const MATH_CATEGORIES: Record<MathCategoryId, MathCategoryConfig> = {
  algebra: {
    id: 'algebra',
    label: 'Algebra',
    supportedActions: ['Solve equation', 'Quadratic roots', 'Systems', 'Inequalities', 'Simplify expression', 'Factor / expand'],
    practicePrompt: 'Create algebra practice questions with worked answers, one inequality, and one harder extension question.',
    examples: [
      { expr: '2x + 5 = 11', desc: 'Solve a linear equation' },
      { expr: '2x + 5 <= 11', desc: 'Solve a linear inequality' },
      { expr: 'simplify (x^2 - 4) / (x - 2)', desc: 'Simplify a rational expression' },
      { expr: 'expand (x + 3)(x - 1)', desc: 'Expand brackets' },
      { expr: 'x^2 - 5x + 6 = 0', desc: 'Solve a quadratic equation' },
      { expr: 'system x + y = 3; x - y = 1', desc: 'Solve simultaneous equations' },
      { expr: 'factor x^2 - 5x + 6', desc: 'Factor a quadratic expression' },
    ],
  },
  geometry: {
    id: 'geometry',
    label: 'Geometry',
    supportedActions: ['Pythagorean theorem', 'Distance', 'Midpoint', 'Line through points', 'Circle equation', 'Triangle area', 'Sphere volume'],
    practicePrompt: 'Create geometry and analytic-geometry practice for high-school and first-year undergraduate students with coordinate geometry, circles, and one applied measurement problem.',
    examples: [
      { expr: 'hypotenuse 3 4', desc: 'Use the Pythagorean theorem' },
      { expr: 'distance (0,0) (3,4)', desc: 'Find the distance between two points' },
      { expr: 'midpoint of (0,0) and (6,4)', desc: 'Find the midpoint of a segment' },
      { expr: 'line through (1,2) and (4,6)', desc: 'Build a line equation from two points' },
      { expr: 'equation of circle: center (2,-3), radius 5', desc: 'Write a graphable circle equation' },
      { expr: 'area of triangle with sides 3, 4, 5', desc: 'Compute triangle area from the sides' },
      { expr: 'volume of sphere with radius 7', desc: 'Compute the volume of a sphere' },
    ],
  },
  calculus: {
    id: 'calculus',
    label: 'Calculus',
    supportedActions: ['Derivative', 'Integral', 'Limit'],
    practicePrompt: 'Create calculus practice problems with short worked solutions and one conceptual check.',
    examples: [
      { expr: 'derivative of x^3', desc: 'Differentiate a power' },
      { expr: 'integral of sin(x) dx', desc: 'Find an antiderivative' },
      { expr: 'integral from 0 to pi of sin(x) dx', desc: 'Evaluate a definite integral' },
      { expr: 'limit x->0 of sin(x)/x', desc: 'Evaluate a classic limit' },
      { expr: 'derivative of x^2 + 2x + 1', desc: 'Differentiate a polynomial' },
    ],
  },
  trigonometry: {
    id: 'trigonometry',
    label: 'Trigonometry',
    supportedActions: ['Exact values', 'Trig identities', 'Angles', 'Graphs'],
    practicePrompt: 'Create high-school and first-year undergraduate trigonometry practice with short worked answers and one identity check.',
    examples: [
      { expr: 'sin(pi/6)', desc: 'Evaluate an exact trig value' },
      { expr: 'cos(pi/3)', desc: 'Work with common angles' },
      { expr: 'sin(pi/6)^2 + cos(pi/6)^2', desc: 'Check a trig identity' },
      { expr: 'tan(pi/4)', desc: 'Evaluate tangent at a standard angle' },
    ],
  },
  'sequences-series': {
    id: 'sequences-series',
    label: 'Sequences & Series',
    supportedActions: ['Arithmetic nth term', 'Arithmetic sum', 'Geometric nth term', 'Geometric sum'],
    practicePrompt: 'Create sequence and series practice for school and first-year undergraduate students with nth-term questions, finite sums, and one interpretation question.',
    examples: [
      { expr: 'arithmetic nth 3 2 10', desc: 'Find the 10th term of an arithmetic sequence' },
      { expr: 'arithmetic sum 3 2 10', desc: 'Find a finite arithmetic series sum' },
      { expr: 'geometric nth 2 3 5', desc: 'Find the 5th term of a geometric sequence' },
      { expr: 'geometric sum 2 3 5', desc: 'Find a finite geometric series sum' },
    ],
  },
  'linear-algebra': {
    id: 'linear-algebra',
    label: 'Linear Algebra',
    supportedActions: ['Matrix multiplication', 'Determinant', 'Inverse'],
    practicePrompt: 'Generate linear algebra practice focused on matrices, determinants, and interpreting results.',
    examples: [
      { expr: '[[1,2],[3,4]] * [[2,0],[1,2]]', desc: 'Multiply two matrices' },
      { expr: 'det([[2,3],[1,4]])', desc: 'Find a determinant' },
      { expr: 'inv([[1,2],[3,5]])', desc: 'Find a matrix inverse' },
    ],
  },
  statistics: {
    id: 'statistics',
    label: 'Statistics',
    supportedActions: ['Mean', 'Median', 'Variance', 'Standard deviation', 'Combinations', 'Permutations'],
    practicePrompt: 'Generate high-school and first-year undergraduate statistics practice from small datasets, counting methods, and one interpretation question.',
    examples: [
      { expr: 'mean([4, 7, 13, 2, 8])', desc: 'Compute a mean' },
      { expr: 'median([4, 7, 13, 2, 8])', desc: 'Find a median' },
      { expr: 'std([4, 7, 13, 2, 8])', desc: 'Compute a standard deviation' },
      { expr: 'combinations(5, 2)', desc: 'Count combinations' },
      { expr: 'permutations(5, 2)', desc: 'Count ordered arrangements' },
    ],
  },
  vectors: {
    id: 'vectors',
    label: 'Vectors',
    supportedActions: ['Dot product', 'Magnitude', 'Similarity'],
    practicePrompt: 'Create vector questions using dot product, magnitude, and geometric interpretation.',
    examples: [
      { expr: 'dot product [3,2] [1,4]', desc: 'Compute a dot product' },
      { expr: 'magnitude [3,4]', desc: 'Find a vector magnitude' },
      { expr: 'dot product [2,1] [3,5]', desc: 'Another dot product example' },
    ],
  },
  matrices: {
    id: 'matrices',
    label: 'Matrices',
    supportedActions: ['Multiply', 'Determinant', 'Inverse'],
    practicePrompt: 'Create matrix practice problems that mirror exam-style computation and interpretation.',
    examples: [
      { expr: '[[1,2],[3,4]] * [[5,6],[7,8]]', desc: 'Matrix multiplication' },
      { expr: 'det([[1,2],[3,4]])', desc: '2x2 determinant' },
      { expr: 'inv([[2,1],[1,1]])', desc: 'Matrix inverse' },
    ],
  },
  'differential-equations': {
    id: 'differential-equations',
    label: 'Differential Equations',
    supportedActions: ['2nd-order homogeneous', 'Exponential ODE', 'First-order linear', 'Direct integration'],
    practicePrompt: 'Create differential equations practice with characteristic equation method and first-order ODEs, including worked solutions.',
    examples: [
      { expr: "y'' + 3y' + 2y = 0", desc: '2nd-order homogeneous ODE' },
      { expr: "y'' + y = 0", desc: 'Pure oscillator ODE' },
      { expr: "y' = -2y", desc: 'Exponential decay' },
      { expr: 'dy/dx = 3x^2', desc: 'Direct integration' },
      { expr: "y' + 2y = 4", desc: 'First-order linear ODE' },
    ],
  },
  discrete: {
    id: 'discrete',
    label: 'Discrete Math',
    supportedActions: ['GCD / LCM', 'Combinations', 'Permutations', 'Fibonacci', 'Modular arithmetic'],
    practicePrompt: 'Create discrete mathematics practice covering combinatorics, number theory, and sequences with full worked solutions.',
    examples: [
      { expr: 'gcd(48, 36)', desc: 'Greatest common divisor' },
      { expr: 'lcm(12, 18)', desc: 'Least common multiple' },
      { expr: 'C(10, 3)', desc: 'Combinations' },
      { expr: 'P(5, 2)', desc: 'Permutations' },
      { expr: 'fibonacci(10)', desc: 'Fibonacci number' },
      { expr: '2^10 mod 7', desc: 'Modular exponentiation' },
    ],
  },
  physics: {
    id: 'physics',
    label: 'Physics',
    supportedActions: ["Ohm's Law", 'Kinetic Energy', 'Projectile Range', 'Wave Speed', "Newton's 2nd Law", 'Potential Energy'],
    practicePrompt: 'Create physics formula practice covering mechanics and electricity with substitution steps and unit tracking.',
    examples: [
      { expr: 'ohm V=12 I=3', desc: "Ohm's Law — find R" },
      { expr: 'KE m=10 v=5', desc: 'Kinetic energy' },
      { expr: 'projectile v=50 theta=45', desc: 'Projectile range' },
      { expr: 'wave f=440 lambda=0.78', desc: 'Wave speed' },
      { expr: 'force m=5 a=3', desc: "Newton's 2nd Law" },
      { expr: 'PE m=10 h=5', desc: 'Gravitational PE' },
    ],
  },
};

export const MATH_SYMBOL_GROUPS: Array<{
  id: 'basic' | 'algebra' | 'calculus' | 'trigonometry' | 'matrices' | 'vectors' | 'greek';
  label: string;
  symbols: Array<{ label: string; insert: string }>;
}> = [
  {
    id: 'basic',
    label: 'Basic',
    symbols: [
      { label: 'x²', insert: '^2' },
      { label: 'xʸ', insert: '^()' },
      { label: '√', insert: 'sqrt()' },
      { label: '|x|', insert: 'abs()' },
      { label: 'π', insert: 'pi' },
      { label: '∞', insert: 'inf' },
      { label: '÷', insert: '/' },
      { label: '×', insert: '*' },
    ],
  },
  {
    id: 'algebra',
    label: 'Algebra',
    symbols: [
      { label: '=', insert: ' = ' },
      { label: '≤', insert: ' <= ' },
      { label: '≥', insert: ' >= ' },
      { label: '≠', insert: ' != ' },
      { label: '( )', insert: '()' },
      { label: '[ ]', insert: '[]' },
      { label: 'factor', insert: 'factor ' },
      { label: 'simplify', insert: 'simplify ' },
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    symbols: [
      { label: 'd/dx', insert: 'derivative of ()' },
      { label: '∫', insert: 'integral of () dx' },
      { label: '∫ₐᵇ', insert: 'integral from a to b of () dx' },
      { label: 'lim', insert: 'limit x->0 of ()' },
      { label: 'sin', insert: 'sin()' },
      { label: 'cos', insert: 'cos()' },
      { label: 'tan', insert: 'tan()' },
      { label: 'ln', insert: 'log()' },
    ],
  },
  {
    id: 'trigonometry',
    label: 'Trigonometry',
    symbols: [
      { label: 'sin', insert: 'sin()' },
      { label: 'cos', insert: 'cos()' },
      { label: 'tan', insert: 'tan()' },
      { label: 'sin²+cos²', insert: 'sin()^2 + cos()^2' },
      { label: 'π/6', insert: 'pi/6' },
      { label: 'π/4', insert: 'pi/4' },
      { label: 'π/3', insert: 'pi/3' },
      { label: 'θ', insert: 'theta' },
    ],
  },
  {
    id: 'matrices',
    label: 'Matrices',
    symbols: [
      { label: '[[]]', insert: '[[1,2],[3,4]]' },
      { label: 'det', insert: 'det()' },
      { label: 'inv', insert: 'inv()' },
      { label: 'A·B', insert: '[[1,2],[3,4]] * [[5,6],[7,8]]' },
    ],
  },
  {
    id: 'vectors',
    label: 'Vectors',
    symbols: [
      { label: '⟨v⟩', insert: '[3,4]' },
      { label: 'u·v', insert: 'dot product [3,2] [1,4]' },
      { label: '|v|', insert: 'magnitude [3,4]' },
      { label: 'θ', insert: 'angle between [a,b] [c,d]' },
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    symbols: [
      { label: 'α', insert: 'alpha' },
      { label: 'β', insert: 'beta' },
      { label: 'θ', insert: 'theta' },
      { label: 'λ', insert: 'lambda' },
      { label: 'μ', insert: 'mu' },
      { label: 'σ', insert: 'sigma' },
    ],
  },
];
