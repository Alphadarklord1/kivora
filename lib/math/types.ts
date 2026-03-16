export type MathCategoryId =
  | 'algebra'
  | 'geometry'
  | 'calculus'
  | 'trigonometry'
  | 'sequences-series'
  | 'linear-algebra'
  | 'statistics'
  | 'vectors'
  | 'matrices';

export interface MathStep {
  step: number;
  description: string;
  expression: string;
  explanation: string;
}

export interface SolverResult {
  category: MathCategoryId;
  normalizedInput: string;
  previewLatex: string;
  answer: string;
  answerLatex: string;
  steps: MathStep[];
  explanation: string;
  graphExpr?: string;
  verified: boolean;
  engine: 'mathjs' | 'nerdamer' | 'hybrid' | 'ai';
  error?: string;
}

export interface MathSolveRequest {
  problem: string;
  category?: MathCategoryId | string;
  contextFileId?: string | null;
  contextText?: string | null;
}

export interface MathContext {
  fileId: string;
  fileName: string;
  extractedText: string;
  sourceFolderId?: string | null;
  sourceTopicId?: string | null;
  updatedAt: string;
}
