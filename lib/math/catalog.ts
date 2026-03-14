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
  'calculus',
  'linear-algebra',
  'statistics',
  'vectors',
  'matrices',
];

export const MATH_CATEGORIES: Record<MathCategoryId, MathCategoryConfig> = {
  algebra: {
    id: 'algebra',
    label: 'Algebra',
    supportedActions: ['Solve equation', 'Simplify expression', 'Factor / expand'],
    practicePrompt: 'Create algebra practice questions with worked answers and one harder extension question.',
    examples: [
      { expr: '2x + 5 = 11', desc: 'Solve a linear equation' },
      { expr: 'simplify (x^2 - 4) / (x - 2)', desc: 'Simplify a rational expression' },
      { expr: 'expand (x + 3)(x - 1)', desc: 'Expand brackets' },
      { expr: 'factor x^2 - 5x + 6', desc: 'Factor a quadratic expression' },
    ],
  },
  calculus: {
    id: 'calculus',
    label: 'Calculus',
    supportedActions: ['Derivative', 'Integral', 'Limit'],
    practicePrompt: 'Create calculus practice problems with short worked solutions and one conceptual check.',
    examples: [
      { expr: 'derivative of x^3', desc: 'Differentiate a power' },
      { expr: 'integral of sin(x)', desc: 'Find an antiderivative' },
      { expr: 'limit x->0 of sin(x)/x', desc: 'Evaluate a classic limit' },
      { expr: 'derivative of x^2 + 2x + 1', desc: 'Differentiate a polynomial' },
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
    supportedActions: ['Mean', 'Median', 'Variance', 'Standard deviation'],
    practicePrompt: 'Generate statistics practice from small datasets with answer keys and one interpretation question.',
    examples: [
      { expr: 'mean([4, 7, 13, 2, 8])', desc: 'Compute a mean' },
      { expr: 'median([4, 7, 13, 2, 8])', desc: 'Find a median' },
      { expr: 'std([4, 7, 13, 2, 8])', desc: 'Compute a standard deviation' },
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
};

export const MATH_SYMBOL_GROUPS: Array<{
  id: 'basic' | 'algebra' | 'calculus' | 'matrices' | 'vectors' | 'greek';
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
      { label: 'd/dx', insert: 'derivative of ' },
      { label: '∫', insert: 'integral of ' },
      { label: '∫ₐᵇ', insert: 'integral from a to b of ' },
      { label: 'lim', insert: 'limit x->0 of ' },
      { label: 'sin', insert: 'sin()' },
      { label: 'cos', insert: 'cos()' },
      { label: 'tan', insert: 'tan()' },
      { label: 'ln', insert: 'log()' },
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
