// Enhanced Smart Content Generation for University-Level Study
// Supports Bloom's Taxonomy, advanced question types, and academic analysis

import { solveMath, formatMathSolution, extractMathProblems } from '@/lib/math/solver';

// ============================================
// TYPES
// ============================================

export type ToolMode = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes' | 'math' | 'flashcards' | 'essay' | 'planner';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

export type QuestionType =
  | 'mcq'
  | 'short-answer'
  | 'explanation'
  | 'definition'
  | 'true-false'
  | 'compare-contrast'
  | 'cause-effect'
  | 'case-study'
  | 'essay'
  | 'calculation'
  | 'diagram-label'
  | 'sequence'
  | 'matching';

export type Difficulty = 'introductory' | 'intermediate' | 'advanced' | 'expert';

export type SubjectArea = 'science' | 'humanities' | 'social-science' | 'business' | 'technical' | 'general';

export interface GeneratedQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
  correctIndex?: number;
  sourceSentence: string;
  keywords: string[];
  difficulty: Difficulty;
  bloomLevel: BloomLevel;
  topic?: string;
  explanation?: string;
  rubric?: string[];
  points?: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  category: string;
  difficulty: Difficulty;
  keywords: string[];
}

export interface GeneratedContent {
  mode: ToolMode;
  questions: GeneratedQuestion[];
  flashcards?: Flashcard[];
  sourceText: string;
  keyTopics: string[];
  displayText: string;
  subjectArea: SubjectArea;
  learningObjectives?: string[];
}

// ============================================
// ACADEMIC PATTERNS & DETECTION
// ============================================

// Academic signal words by subject
const SUBJECT_INDICATORS = {
  science: [
    /\b(?:hypothesis|experiment|variable|control|data|observation|theory|law|molecule|atom|cell|organism|evolution|genetics|physics|chemistry|biology|ecosystem|reaction|compound|element|energy|force|mass|velocity|acceleration)\b/i,
    /\b(?:DNA|RNA|protein|enzyme|photosynthesis|mitosis|meiosis|electron|proton|neutron|quantum|thermodynamic|kinetic|potential)\b/i,
  ],
  humanities: [
    /\b(?:philosophy|ethics|morality|aesthetics|metaphysics|epistemology|ontology|rhetoric|narrative|protagonist|symbolism|theme|motif|allegory|irony|satire)\b/i,
    /\b(?:renaissance|enlightenment|modernism|postmodernism|romanticism|realism|existentialism|phenomenology|hermeneutics)\b/i,
  ],
  'social-science': [
    /\b(?:society|culture|behavior|psychology|sociology|anthropology|economics|political|democracy|capitalism|socialism|institution|norm|deviance|stratification)\b/i,
    /\b(?:cognitive|behavioral|social|developmental|clinical|industrial|organizational|perception|memory|learning|motivation|emotion|personality)\b/i,
  ],
  business: [
    /\b(?:market|strategy|management|finance|investment|ROI|revenue|profit|loss|stakeholder|shareholder|competitive|advantage|SWOT|Porter|supply|demand)\b/i,
    /\b(?:marketing|branding|segmentation|positioning|B2B|B2C|KPI|metrics|analytics|entrepreneurship|startup|venture|capital)\b/i,
  ],
  technical: [
    /\b(?:algorithm|data structure|complexity|O\(n\)|recursion|iteration|API|database|SQL|network|protocol|architecture|design pattern|framework)\b/i,
    /\b(?:function|class|object|inheritance|polymorphism|encapsulation|interface|module|component|service|microservice)\b/i,
  ],
};

// Bloom's Taxonomy question stems
const BLOOM_QUESTION_STEMS: Record<BloomLevel, string[]> = {
  remember: [
    'Define {term}.',
    'What is {term}?',
    'List the key characteristics of {term}.',
    'Identify {term} in the following context.',
    'State the definition of {term}.',
    'Name the main components of {term}.',
    'Recall the key facts about {term}.',
  ],
  understand: [
    'Explain the concept of {term} in your own words.',
    'Summarize the main ideas related to {term}.',
    'Describe how {term} works.',
    'Interpret the significance of {term}.',
    'Classify {term} according to its characteristics.',
    'Compare {term1} and {term2}.',
    'Paraphrase the definition of {term}.',
  ],
  apply: [
    'How would you use {term} to solve this problem?',
    'Apply the concept of {term} to a real-world scenario.',
    'Demonstrate how {term} functions in practice.',
    'Calculate/Solve using the principles of {term}.',
    'Illustrate {term} with a specific example.',
    'How would {term} be implemented in {context}?',
  ],
  analyze: [
    'Analyze the relationship between {term1} and {term2}.',
    'What are the underlying assumptions of {term}?',
    'Differentiate between {term1} and {term2}.',
    'Examine the causes and effects of {term}.',
    'What evidence supports the claim about {term}?',
    'Identify the components and structure of {term}.',
    'What patterns can you identify in {term}?',
  ],
  evaluate: [
    'Evaluate the effectiveness of {term}.',
    'Critique the strengths and weaknesses of {term}.',
    'Justify the importance of {term}.',
    'Assess the validity of the argument regarding {term}.',
    'What are the implications of {term}?',
    'Judge the appropriateness of {term} in this context.',
    'Defend or refute the claim that {term}.',
  ],
  create: [
    'Design a solution using the principles of {term}.',
    'Propose an alternative approach to {term}.',
    'Develop a hypothesis about {term}.',
    'Construct a model that demonstrates {term}.',
    'Formulate a plan to address {term}.',
    'Synthesize your understanding of {term} into a new framework.',
    'Create an original example that illustrates {term}.',
  ],
};

// Academic transition and signal words
const ACADEMIC_SIGNALS = {
  definition: [
    /\b(\w+)\s+(?:is|are|was|were)\s+(?:defined as|a type of|a kind of|a form of|characterized by)\b/i,
    /\b(?:definition of|meaning of|refers to|denotes|signifies)\s+(\w+)/i,
    /\b(\w+)\s*[:\-–]\s*(?:a|an|the)\s+\w+/i,
    /\bthe term\s+(\w+)\s+(?:means|refers to|describes)/i,
    /\b(\w+)\s+can be understood as\b/i,
  ],
  causation: [
    /\b(?:because|since|due to|as a result of|owing to|caused by|leads to|results in|consequently|therefore|thus|hence)\b/i,
    /\b(?:if|when|whenever)\s+.+\s+(?:then|will|would|can|may)\b/i,
    /\b(?:effect|impact|influence|consequence|outcome|result)\s+(?:of|on)\b/i,
  ],
  comparison: [
    /\b(?:compared to|in contrast|unlike|similar to|different from|whereas|while|although|however|on the other hand)\b/i,
    /\b(?:both|neither|either|likewise|similarly|conversely|alternatively)\b/i,
    /\b(?:more|less|greater|fewer|higher|lower|better|worse)\s+than\b/i,
  ],
  importance: [
    /\b(?:important|significant|crucial|essential|fundamental|key|primary|critical|vital|necessary|pivotal)\b/i,
    /\b(?:notably|significantly|importantly|crucially|essentially|particularly|especially)\b/i,
  ],
  sequence: [
    /\b(?:first|second|third|finally|lastly|next|then|subsequently|previously|initially|ultimately)\b/i,
    /\b(?:step|stage|phase|process|procedure|sequence)\s*\d*/i,
    /\b(?:before|after|during|meanwhile|simultaneously)\b/i,
  ],
  evidence: [
    /\b(?:according to|research shows|studies indicate|evidence suggests|data reveals|experiments demonstrate)\b/i,
    /\b(?:for example|such as|including|specifically|in particular|namely|e\.g\.|i\.e\.)\b/i,
    /\b(?:\d+%|\d+\s*percent|majority|minority|significant portion)\b/i,
  ],
  theory: [
    /\b(?:theory|hypothesis|model|framework|paradigm|principle|law|theorem|postulate|axiom)\b/i,
    /\b(?:proposes|suggests|argues|claims|maintains|asserts|contends|posits)\b/i,
  ],
  formula: [
    /[A-Z]\s*=\s*[^,.\n]+/,
    /\b(?:formula|equation|expression|function|where|given that)\b/i,
    /[∑∏∫∂√π∞±≤≥≠≈∈∀∃]/,
    /\b\w+\s*\([^)]+\)\s*=\s*[^,.\n]+/,
  ],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function splitSentences(text: string): string[] {
  const t = (text || '').replace(/\r/g, ' ').trim();
  if (!t) return [];

  try {
    const raw = t.split(/(?<=[.!?])\s+/);
    if (raw && raw.length > 1) {
      return raw.map(s => s.trim()).filter(s => s.length > 10);
    }
  } catch {
    // fallback for Safari
  }

  return t
    .split(/[.!?]+\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

function normalizeText(s: string): string {
  return (s || '')
    .replace(/[\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================
// SUBJECT DETECTION
// ============================================

function detectSubjectArea(text: string): SubjectArea {
  const scores: Record<SubjectArea, number> = {
    science: 0,
    humanities: 0,
    'social-science': 0,
    business: 0,
    technical: 0,
    general: 0,
  };

  for (const [subject, patterns] of Object.entries(SUBJECT_INDICATORS)) {
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        scores[subject as SubjectArea] += matches.length * 2;
      }
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore < 3) return 'general';

  const detected = Object.entries(scores).find(([_, score]) => score === maxScore);
  return (detected?.[0] as SubjectArea) || 'general';
}

// ============================================
// STOP WORDS (Extended)
// ============================================

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'without', 'from', 'into', 'over', 'under',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'may', 'might', 'must', 'will', 'shall',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'you', 'your', 'we', 'our', 'i', 'me', 'my', 'as', 'than', 'also', 'such', 'not', 'no', 'yes',
  'more', 'most', 'less', 'least', 'very', 'much', 'many', 'some', 'any', 'each', 'every', 'have', 'has', 'had', 'having', 'about', 'which', 'what', 'who', 'whom',
  'there', 'here', 'where', 'how', 'why', 'all', 'both', 'other', 'another', 'same', 'different', 'new', 'old', 'first', 'last', 'long', 'short', 'own', 'just',
  'only', 'even', 'still', 'already', 'always', 'never', 'often', 'sometimes', 'usually', 'really', 'quite', 'rather', 'however', 'although', 'though',
  'after', 'before', 'since', 'until', 'during', 'through', 'between', 'among', 'against', 'within', 'throughout', 'despite', 'towards', 'upon',
]);

// ============================================
// ENHANCED KEYWORD EXTRACTION
// ============================================

interface KeywordInfo {
  word: string;
  frequency: number;
  isCapitalized: boolean;
  isAcademicTerm: boolean;
  contexts: string[];
  relatedTerms: string[];
  category: 'concept' | 'entity' | 'process' | 'term' | 'general';
}

function extractKeywordsEnhanced(text: string, max = 30): KeywordInfo[] {
  const sentences = splitSentences(text);
  const wordInfo = new Map<string, KeywordInfo>();

  // Find n-grams (2-3 word phrases)
  const ngrams = new Map<string, number>();

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);

    // Extract bigrams and trigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`.toLowerCase().replace(/[^a-z\s]/g, '');
      if (bigram.split(' ').every(w => w.length >= 3 && !STOP_WORDS.has(w))) {
        ngrams.set(bigram, (ngrams.get(bigram) || 0) + 1);
      }

      if (i < words.length - 2) {
        const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`.toLowerCase().replace(/[^a-z\s]/g, '');
        if (trigram.split(' ').filter(w => !STOP_WORDS.has(w)).length >= 2) {
          ngrams.set(trigram, (ngrams.get(trigram) || 0) + 1);
        }
      }
    }

    // Single word extraction
    for (const word of words) {
      const cleaned = word.replace(/[^a-zA-Z0-9-]/g, '');
      const lower = cleaned.toLowerCase();

      if (lower.length < 3 || lower.length > 30) continue;
      if (STOP_WORDS.has(lower)) continue;
      if (/^\d+$/.test(lower)) continue;

      const isCapitalized = /^[A-Z]/.test(cleaned) && !/^[A-Z]+$/.test(cleaned);
      const isAcademicTerm = checkIfAcademicTerm(lower);

      // Determine category
      let category: KeywordInfo['category'] = 'general';
      if (isAcademicTerm) category = 'concept';
      else if (isCapitalized) category = 'entity';
      else if (/(?:tion|sion|ment|ness|ity|ance|ence)$/.test(lower)) category = 'concept';
      else if (/(?:ing|ize|ify|ate)$/.test(lower)) category = 'process';

      if (!wordInfo.has(lower)) {
        wordInfo.set(lower, {
          word: cleaned,
          frequency: 0,
          isCapitalized,
          isAcademicTerm,
          contexts: [],
          relatedTerms: [],
          category,
        });
      }

      const info = wordInfo.get(lower)!;
      info.frequency++;
      if (info.contexts.length < 3) {
        info.contexts.push(normalizeText(sentence));
      }
      if (isCapitalized && !info.isCapitalized) {
        info.isCapitalized = true;
        info.word = cleaned;
      }
    }
  }

  // Add high-frequency n-grams as keywords
  for (const [ngram, count] of ngrams) {
    if (count >= 2) {
      const words = ngram.split(' ');
      const capitalized = words.map(w => capitalizeFirst(w)).join(' ');
      wordInfo.set(ngram, {
        word: capitalized,
        frequency: count,
        isCapitalized: false,
        isAcademicTerm: true,
        contexts: [],
        relatedTerms: [],
        category: 'concept',
      });
    }
  }

  // Score and sort keywords
  const scored = Array.from(wordInfo.values()).map(info => ({
    ...info,
    score: calculateKeywordScore(info),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Find related terms
  const topKeywords = scored.slice(0, max);
  for (const kw of topKeywords) {
    for (const context of kw.contexts) {
      for (const other of topKeywords) {
        if (other.word !== kw.word && context.toLowerCase().includes(other.word.toLowerCase())) {
          if (!kw.relatedTerms.includes(other.word)) {
            kw.relatedTerms.push(other.word);
          }
        }
      }
    }
  }

  return topKeywords;
}

function checkIfAcademicTerm(word: string): boolean {
  const academicSuffixes = [
    'ology', 'ography', 'onomy', 'ometry', 'osis', 'itis', 'ism', 'ist',
    'tion', 'sion', 'ment', 'ence', 'ance', 'ity', 'ness', 'ship',
    'thesis', 'genesis', 'synthesis', 'analysis', 'lysis',
  ];

  return academicSuffixes.some(suffix => word.endsWith(suffix));
}

function calculateKeywordScore(info: KeywordInfo): number {
  let score = info.frequency * 10;

  if (info.isCapitalized) score += 15;
  if (info.isAcademicTerm) score += 20;
  if (info.category === 'concept') score += 15;
  if (info.category === 'entity') score += 10;
  if (info.word.includes(' ')) score += 25; // N-grams are valuable

  // Penalize very common words
  if (info.frequency > 20) score -= 10;

  return score;
}

// ============================================
// SENTENCE SCORING (Enhanced)
// ============================================

interface ScoredSentence {
  text: string;
  score: number;
  signals: {
    hasDefinition: boolean;
    hasCausation: boolean;
    hasComparison: boolean;
    hasImportance: boolean;
    hasSequence: boolean;
    hasEvidence: boolean;
    hasTheory: boolean;
    hasFormula: boolean;
  };
  keywords: string[];
  topic?: string;
  suggestedBloomLevel: BloomLevel;
  questionTypes: QuestionType[];
}

function scoreSentence(sentence: string, allKeywords: Map<string, number>): ScoredSentence {
  let score = 0;
  const text = normalizeText(sentence);

  const signals = {
    hasDefinition: ACADEMIC_SIGNALS.definition.some(p => p.test(text)),
    hasCausation: ACADEMIC_SIGNALS.causation.some(p => p.test(text)),
    hasComparison: ACADEMIC_SIGNALS.comparison.some(p => p.test(text)),
    hasImportance: ACADEMIC_SIGNALS.importance.some(p => p.test(text)),
    hasSequence: ACADEMIC_SIGNALS.sequence.some(p => p.test(text)),
    hasEvidence: ACADEMIC_SIGNALS.evidence.some(p => p.test(text)),
    hasTheory: ACADEMIC_SIGNALS.theory.some(p => p.test(text)),
    hasFormula: ACADEMIC_SIGNALS.formula.some(p => p.test(text)),
  };

  // Score based on signals
  if (signals.hasDefinition) score += 40;
  if (signals.hasCausation) score += 35;
  if (signals.hasComparison) score += 30;
  if (signals.hasImportance) score += 25;
  if (signals.hasEvidence) score += 30;
  if (signals.hasTheory) score += 35;
  if (signals.hasFormula) score += 40;
  if (signals.hasSequence) score += 15;

  // Keyword density
  const words = text.toLowerCase().split(/\s+/);
  const sentenceKeywords: string[] = [];

  for (const word of words) {
    const cleanWord = word.replace(/[^a-z0-9]/g, '');
    if (allKeywords.has(cleanWord)) {
      score += allKeywords.get(cleanWord)! * 3;
      sentenceKeywords.push(cleanWord);
    }
  }

  // Optimal length bonus
  const wordCount = words.length;
  if (wordCount >= 12 && wordCount <= 40) score += 15;
  else if (wordCount < 8 || wordCount > 60) score -= 15;

  // Determine suggested Bloom level and question types
  const { bloomLevel, questionTypes } = determineLearningLevel(signals, sentenceKeywords);

  return {
    text,
    score,
    signals,
    keywords: sentenceKeywords,
    topic: sentenceKeywords[0],
    suggestedBloomLevel: bloomLevel,
    questionTypes,
  };
}

function determineLearningLevel(signals: ScoredSentence['signals'], keywords: string[]): {
  bloomLevel: BloomLevel;
  questionTypes: QuestionType[];
} {
  const questionTypes: QuestionType[] = [];
  let bloomLevel: BloomLevel = 'understand';

  if (signals.hasDefinition) {
    bloomLevel = 'remember';
    questionTypes.push('definition', 'mcq', 'matching');
  }

  if (signals.hasCausation) {
    bloomLevel = 'analyze';
    questionTypes.push('cause-effect', 'short-answer', 'explanation');
  }

  if (signals.hasComparison) {
    bloomLevel = 'analyze';
    questionTypes.push('compare-contrast', 'essay');
  }

  if (signals.hasEvidence) {
    bloomLevel = 'evaluate';
    questionTypes.push('short-answer', 'essay');
  }

  if (signals.hasTheory) {
    bloomLevel = 'evaluate';
    questionTypes.push('explanation', 'essay', 'case-study');
  }

  if (signals.hasFormula) {
    bloomLevel = 'apply';
    questionTypes.push('calculation', 'short-answer');
  }

  if (signals.hasSequence) {
    questionTypes.push('sequence', 'mcq');
  }

  if (questionTypes.length === 0) {
    questionTypes.push('mcq', 'short-answer', 'true-false');
  }

  return { bloomLevel, questionTypes };
}

// ============================================
// SMART DISTRACTOR GENERATION
// ============================================

function generateSmartDistractors(
  correctAnswer: string,
  allKeywords: KeywordInfo[],
  sourceText: string,
  count = 3
): string[] {
  const distractors: string[] = [];
  const correct = correctAnswer.toLowerCase();
  const correctInfo = allKeywords.find(k => k.word.toLowerCase() === correct);

  // Strategy 1: Use related terms (plausible but wrong)
  if (correctInfo?.relatedTerms) {
    for (const related of correctInfo.relatedTerms) {
      if (distractors.length >= count) break;
      if (related.toLowerCase() !== correct) {
        distractors.push(related);
      }
    }
  }

  // Strategy 2: Similar category keywords
  const sameCategory = allKeywords
    .filter(k => k.word.toLowerCase() !== correct)
    .filter(k => correctInfo ? k.category === correctInfo.category : true)
    .filter(k => Math.abs(k.word.length - correctAnswer.length) <= 5)
    .slice(0, count * 2);

  for (const kw of sameCategory) {
    if (distractors.length >= count) break;
    if (!distractors.includes(kw.word)) {
      distractors.push(kw.word);
    }
  }

  // Strategy 3: Any remaining keywords
  if (distractors.length < count) {
    const remaining = allKeywords
      .filter(k => k.word.toLowerCase() !== correct)
      .filter(k => !distractors.includes(k.word))
      .slice(0, count - distractors.length);

    for (const kw of remaining) {
      distractors.push(kw.word);
    }
  }

  // Strategy 4: Contextual alternatives
  if (distractors.length < count) {
    const contextualFillers = [
      'None of the above',
      'All of the above',
      'Cannot be determined from the text',
      'Both A and B',
    ];
    for (const filler of contextualFillers) {
      if (distractors.length >= count) break;
      distractors.push(filler);
    }
  }

  return shuffleArray(distractors).slice(0, count);
}

// ============================================
// QUESTION GENERATORS (Enhanced)
// ============================================

function generateConceptMCQs(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[],
  count = 10
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const usedSentences = new Set<string>();

  // Sort by score, prioritize high-value sentences
  const sorted = [...scoredSentences]
    .filter(s => s.keywords.length > 0 && s.text.length > 30)
    .sort((a, b) => b.score - a.score);

  for (const sentence of sorted) {
    if (questions.length >= count) break;
    if (usedSentences.has(sentence.text)) continue;

    usedSentences.add(sentence.text);

    // Find best keyword to test
    const targetKeyword = sentence.keywords.find(k => {
      const info = keywords.find(kw => kw.word.toLowerCase() === k);
      return info && info.category !== 'general';
    }) || sentence.keywords[0];

    if (!targetKeyword) continue;

    const keywordInfo = keywords.find(k => k.word.toLowerCase() === targetKeyword);
    const actualWord = keywordInfo?.word || targetKeyword;

    // Generate different question types based on sentence signals
    let question: GeneratedQuestion;

    if (sentence.signals.hasDefinition) {
      // Definition-based MCQ
      const stem = `What is the definition of "${actualWord}"?`;
      const correctOption = sentence.text;
      const distractorSentences = scoredSentences
        .filter(s => s.text !== sentence.text && s.keywords.some(k => k !== targetKeyword))
        .slice(0, 3)
        .map(s => s.text.slice(0, 100) + (s.text.length > 100 ? '...' : ''));

      const allOptions = shuffleArray([correctOption, ...distractorSentences].slice(0, 4));

      question = {
        id: generateId(),
        type: 'mcq',
        question: stem,
        options: allOptions,
        correctAnswer: correctOption,
        correctIndex: allOptions.indexOf(correctOption),
        sourceSentence: sentence.text,
        keywords: sentence.keywords,
        difficulty: 'intermediate',
        bloomLevel: 'remember',
        topic: sentence.topic,
        explanation: `The correct answer is based on the definition provided in the source text.`,
      };
    } else if (sentence.signals.hasCausation) {
      // Cause-effect MCQ
      const stem = sentence.text.replace(
        new RegExp('\\b' + escapeRegExp(actualWord) + '\\b', 'ig'),
        '_____'
      );

      const distractors = generateSmartDistractors(actualWord, keywords, sentence.text);
      const allOptions = shuffleArray([actualWord, ...distractors]);

      question = {
        id: generateId(),
        type: 'mcq',
        question: `Complete the cause-effect relationship:\n"${stem}"`,
        options: allOptions,
        correctAnswer: actualWord,
        correctIndex: allOptions.indexOf(actualWord),
        sourceSentence: sentence.text,
        keywords: sentence.keywords,
        difficulty: 'advanced',
        bloomLevel: 'analyze',
        topic: sentence.topic,
        explanation: `This question tests understanding of causal relationships.`,
      };
    } else {
      // Standard fill-in-blank MCQ
      const stem = sentence.text.replace(
        new RegExp('\\b' + escapeRegExp(actualWord) + '\\b', 'ig'),
        '_____'
      );

      const distractors = generateSmartDistractors(actualWord, keywords, sentence.text);
      const allOptions = shuffleArray([actualWord, ...distractors]);

      let difficulty: Difficulty = 'intermediate';
      if (sentence.signals.hasImportance) difficulty = 'introductory';
      if (sentence.signals.hasTheory || sentence.signals.hasFormula) difficulty = 'advanced';

      question = {
        id: generateId(),
        type: 'mcq',
        question: `Fill in the blank:\n"${stem}"`,
        options: allOptions,
        correctAnswer: actualWord,
        correctIndex: allOptions.indexOf(actualWord),
        sourceSentence: sentence.text,
        keywords: sentence.keywords,
        difficulty,
        bloomLevel: sentence.suggestedBloomLevel,
        topic: sentence.topic,
      };
    }

    questions.push(question);
  }

  return questions;
}

function generateBloomQuestions(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[],
  targetLevel: BloomLevel,
  count = 4
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const stems = BLOOM_QUESTION_STEMS[targetLevel];
  const usedKeywords = new Set<string>();

  // Filter sentences appropriate for the Bloom level
  const suitableSentences = scoredSentences
    .filter(s => s.suggestedBloomLevel === targetLevel || s.keywords.length > 0)
    .sort((a, b) => b.score - a.score);

  for (const sentence of suitableSentences) {
    if (questions.length >= count) break;

    const availableKeywords = sentence.keywords.filter(k => !usedKeywords.has(k));
    if (availableKeywords.length === 0) continue;

    const targetKeyword = availableKeywords[0];
    usedKeywords.add(targetKeyword);

    const keywordInfo = keywords.find(k => k.word.toLowerCase() === targetKeyword);
    const actualWord = keywordInfo?.word || capitalizeFirst(targetKeyword);

    // Select appropriate question stem
    const stem = stems[Math.floor(Math.random() * stems.length)]
      .replace('{term}', actualWord)
      .replace('{term1}', actualWord)
      .replace('{term2}', keywordInfo?.relatedTerms[0] || 'related concepts')
      .replace('{context}', 'the given context');

    const difficulty: Difficulty =
      targetLevel === 'remember' ? 'introductory' :
      targetLevel === 'understand' || targetLevel === 'apply' ? 'intermediate' :
      targetLevel === 'analyze' ? 'advanced' : 'expert';

    const questionType: QuestionType =
      targetLevel === 'remember' ? 'definition' :
      targetLevel === 'understand' ? 'explanation' :
      targetLevel === 'apply' ? 'short-answer' :
      targetLevel === 'analyze' ? 'compare-contrast' :
      targetLevel === 'evaluate' ? 'essay' : 'case-study';

    questions.push({
      id: generateId(),
      type: questionType,
      question: stem,
      correctAnswer: sentence.text,
      sourceSentence: sentence.text,
      keywords: sentence.keywords,
      difficulty,
      bloomLevel: targetLevel,
      topic: sentence.topic,
      explanation: `Reference: "${sentence.text.slice(0, 150)}${sentence.text.length > 150 ? '...' : ''}"`,
      points: targetLevel === 'create' ? 15 : targetLevel === 'evaluate' ? 12 : targetLevel === 'analyze' ? 10 : 5,
    });
  }

  return questions;
}

function generateEssayQuestions(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[],
  count = 3
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];

  // Find sentences with comparison or theoretical content
  const essaySentences = scoredSentences
    .filter(s => s.signals.hasComparison || s.signals.hasTheory || s.signals.hasCausation)
    .sort((a, b) => b.score - a.score);

  const topKeywords = keywords.slice(0, 5).map(k => k.word);

  // Generate essay prompts
  const essayPrompts = [
    `Analyze the relationship between ${topKeywords[0] || 'the main concept'} and ${topKeywords[1] || 'related factors'}. Discuss the implications and provide examples from the text.`,
    `Critically evaluate the arguments presented regarding ${topKeywords[0] || 'the central theme'}. What are the strengths and limitations of this perspective?`,
    `Compare and contrast the different aspects of ${topKeywords[0] || 'the topic'} discussed in the text. How do these elements interact?`,
    `Synthesize the key concepts presented in the text and propose how ${topKeywords[0] || 'these ideas'} could be applied to a real-world scenario.`,
    `Examine the evidence provided for ${topKeywords[0] || 'the main claims'} in the text. How convincing is this evidence and why?`,
  ];

  for (let i = 0; i < Math.min(count, essayPrompts.length); i++) {
    const sourceSentence = essaySentences[i]?.text || scoredSentences[0]?.text || '';

    questions.push({
      id: generateId(),
      type: 'essay',
      question: essayPrompts[i],
      correctAnswer: 'Open-ended response expected',
      sourceSentence,
      keywords: topKeywords,
      difficulty: 'expert',
      bloomLevel: i === 0 ? 'analyze' : i === 1 ? 'evaluate' : 'create',
      topic: topKeywords[0],
      points: 20,
      rubric: [
        'Thesis/Argument clarity (20%): Clear, focused thesis that addresses the prompt',
        'Evidence & Analysis (30%): Uses specific examples from text with thorough analysis',
        'Critical Thinking (25%): Demonstrates original insight and evaluation',
        'Organization (15%): Logical structure with clear transitions',
        'Writing Quality (10%): Grammar, spelling, academic tone',
      ],
    });
  }

  return questions;
}

function generateCaseStudyQuestions(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[],
  subjectArea: SubjectArea
): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  const topKeywords = keywords.slice(0, 3).map(k => k.word);

  // Create scenario based on subject area
  const scenarios: Record<SubjectArea, string> = {
    science: `A research team is investigating ${topKeywords[0] || 'a phenomenon'}. They have collected data showing ${topKeywords[1] || 'certain patterns'}. Using the concepts from your reading:`,
    humanities: `Consider a situation where ${topKeywords[0] || 'the concept'} is applied in a contemporary context. A debate has emerged about ${topKeywords[1] || 'its interpretation'}. Based on your reading:`,
    'social-science': `A community is experiencing issues related to ${topKeywords[0] || 'social dynamics'}. Researchers have observed ${topKeywords[1] || 'behavioral patterns'}. Applying the theories discussed:`,
    business: `A company is facing challenges with ${topKeywords[0] || 'market conditions'}. They need to make decisions regarding ${topKeywords[1] || 'strategic options'}. Using the frameworks from your reading:`,
    technical: `A development team is designing a system that involves ${topKeywords[0] || 'technical requirements'}. They encounter issues with ${topKeywords[1] || 'implementation'}. Based on the concepts covered:`,
    general: `Consider a scenario where ${topKeywords[0] || 'the main concept'} is relevant. Challenges arise regarding ${topKeywords[1] || 'practical application'}. Using your knowledge:`,
  };

  const scenario = scenarios[subjectArea];
  const caseQuestions = [
    'What are the key factors that need to be considered in this situation?',
    'How would you apply the concepts from the reading to address this challenge?',
    'What potential outcomes would you predict, and why?',
    'What additional information would you need to make a more informed decision?',
  ];

  questions.push({
    id: generateId(),
    type: 'case-study',
    question: `**Case Study**\n\n${scenario}\n\n${caseQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    correctAnswer: 'Open-ended case study response',
    sourceSentence: scoredSentences[0]?.text || '',
    keywords: topKeywords,
    difficulty: 'expert',
    bloomLevel: 'apply',
    topic: topKeywords[0],
    points: 25,
    rubric: [
      'Problem Identification (20%): Accurately identifies key issues',
      'Concept Application (30%): Correctly applies relevant theories/concepts',
      'Analysis Depth (25%): Thorough examination of factors and relationships',
      'Solution Quality (15%): Practical, well-reasoned recommendations',
      'Communication (10%): Clear, organized presentation',
    ],
  });

  return questions;
}

function generateFlashcards(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[],
  count = 20
): Flashcard[] {
  const flashcards: Flashcard[] = [];
  const usedTerms = new Set<string>();

  // Priority 1: Definition-based flashcards
  const definitions = scoredSentences.filter(s => s.signals.hasDefinition);
  for (const sentence of definitions) {
    if (flashcards.length >= count) break;

    const mainKeyword = sentence.keywords[0];
    if (!mainKeyword || usedTerms.has(mainKeyword)) continue;
    usedTerms.add(mainKeyword);

    const keywordInfo = keywords.find(k => k.word.toLowerCase() === mainKeyword);
    const term = keywordInfo?.word || capitalizeFirst(mainKeyword);

    flashcards.push({
      id: generateId(),
      front: `Define: ${term}`,
      back: sentence.text,
      category: 'Definition',
      difficulty: 'introductory',
      keywords: [term],
    });
  }

  // Priority 2: Keyword-based flashcards
  for (const kw of keywords) {
    if (flashcards.length >= count) break;
    if (usedTerms.has(kw.word.toLowerCase())) continue;
    if (!kw.contexts.length) continue;

    usedTerms.add(kw.word.toLowerCase());

    flashcards.push({
      id: generateId(),
      front: `What is ${kw.word}?`,
      back: kw.contexts[0],
      category: kw.category === 'concept' ? 'Concept' : kw.category === 'process' ? 'Process' : 'Term',
      difficulty: kw.isAcademicTerm ? 'intermediate' : 'introductory',
      keywords: [kw.word, ...kw.relatedTerms.slice(0, 2)],
    });
  }

  // Priority 3: Cause-effect flashcards
  const causalSentences = scoredSentences.filter(s => s.signals.hasCausation);
  for (const sentence of causalSentences) {
    if (flashcards.length >= count) break;

    const keywords = sentence.keywords.slice(0, 2);
    if (keywords.length < 1) continue;

    flashcards.push({
      id: generateId(),
      front: `Explain the cause-effect relationship involving ${keywords.join(' and ')}`,
      back: sentence.text,
      category: 'Cause & Effect',
      difficulty: 'advanced',
      keywords: sentence.keywords,
    });
  }

  return flashcards;
}

// ============================================
// LEARNING OBJECTIVES GENERATOR
// ============================================

function generateLearningObjectives(keywords: KeywordInfo[], scoredSentences: ScoredSentence[]): string[] {
  const objectives: string[] = [];
  const topKeywords = keywords.slice(0, 5);

  // Bloom's taxonomy-based objectives
  if (scoredSentences.some(s => s.signals.hasDefinition)) {
    objectives.push(`Define and identify key terms including ${topKeywords.slice(0, 3).map(k => k.word).join(', ')}`);
  }

  objectives.push(`Explain the main concepts and their relationships`);

  if (scoredSentences.some(s => s.signals.hasCausation)) {
    objectives.push(`Analyze cause-and-effect relationships within the material`);
  }

  if (scoredSentences.some(s => s.signals.hasComparison)) {
    objectives.push(`Compare and contrast different perspectives or elements`);
  }

  objectives.push(`Apply learned concepts to new situations or problems`);
  objectives.push(`Evaluate the significance and implications of key ideas`);

  return objectives.slice(0, 5);
}

// ============================================
// DISPLAY FORMATTERS (Enhanced)
// ============================================

function formatMCQDisplay(questions: GeneratedQuestion[]): string {
  if (questions.length === 0) {
    return 'MCQ Assessment\n\nCould not generate questions. Please provide more detailed academic content.';
  }

  const lines = [
    '='.repeat(60),
    '                    MULTIPLE CHOICE ASSESSMENT',
    '='.repeat(60),
    '',
    `Total Questions: ${questions.length}`,
    `Difficulty Distribution: ${getDifficultyDistribution(questions)}`,
    '',
    '-'.repeat(60),
    '',
  ];

  const letters = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`QUESTION ${i + 1} [${q.difficulty.toUpperCase()}] [${q.bloomLevel.toUpperCase()}]`);
    lines.push('-'.repeat(40));
    lines.push(q.question);
    lines.push('');

    if (q.options) {
      for (let j = 0; j < q.options.length; j++) {
        const marker = j === q.correctIndex ? '*' : ' ';
        lines.push(`  ${marker}${letters[j]}) ${q.options[j]}`);
      }
    }

    lines.push('');
    lines.push(`   Correct Answer: ${letters[q.correctIndex || 0]}) ${q.correctAnswer}`);
    if (q.explanation) {
      lines.push(`   Explanation: ${q.explanation}`);
    }
    lines.push(`   Topic: ${q.topic || 'General'}`);
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('');
  }

  return lines.join('\n');
}

function formatQuizDisplay(questions: GeneratedQuestion[]): string {
  if (questions.length === 0) {
    return 'Quiz\n\nCould not generate questions. Please provide more detailed content.';
  }

  const lines = [
    '='.repeat(60),
    '                    SHORT ANSWER QUIZ',
    '='.repeat(60),
    '',
    `Total Questions: ${questions.length}`,
    `Estimated Time: ${questions.length * 3} minutes`,
    '',
    'Instructions: Answer each question in 2-4 sentences.',
    '',
    '-'.repeat(60),
    '',
  ];

  let totalPoints = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const points = q.points || 5;
    totalPoints += points;

    lines.push(`${i + 1}. [${points} points] [${q.bloomLevel.toUpperCase()}]`);
    lines.push('');
    lines.push(`   ${q.question}`);
    lines.push('');
    lines.push('   Answer: ' + '_'.repeat(50));
    lines.push('   ' + '_'.repeat(57));
    lines.push('   ' + '_'.repeat(57));
    lines.push('');

    if (q.explanation) {
      lines.push(`   Reference: ${q.explanation}`);
    }
    lines.push('');
  }

  lines.push('-'.repeat(60));
  lines.push(`Total Points: ${totalPoints}`);

  return lines.join('\n');
}

function formatEssayDisplay(questions: GeneratedQuestion[]): string {
  if (questions.length === 0) {
    return 'Essay Questions\n\nCould not generate questions.';
  }

  const lines = [
    '='.repeat(60),
    '                    ESSAY QUESTIONS',
    '='.repeat(60),
    '',
    'Instructions: Choose ONE of the following essay prompts.',
    'Write a well-organized response of 500-750 words.',
    '',
    '-'.repeat(60),
    '',
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`OPTION ${i + 1}: [${q.points || 20} points] [${q.bloomLevel.toUpperCase()}]`);
    lines.push('');
    lines.push(q.question);
    lines.push('');

    if (q.rubric) {
      lines.push('GRADING RUBRIC:');
      for (const criterion of q.rubric) {
        lines.push(`  - ${criterion}`);
      }
    }
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('');
  }

  return lines.join('\n');
}

function formatFlashcardsDisplay(flashcards: Flashcard[]): string {
  if (flashcards.length === 0) {
    return 'Flashcards\n\nCould not generate flashcards.';
  }

  const lines = [
    '='.repeat(60),
    '                    STUDY FLASHCARDS',
    '='.repeat(60),
    '',
    `Total Cards: ${flashcards.length}`,
    '',
    'Study Tips:',
    '- Review cards in random order',
    '- Use spaced repetition',
    '- Say answers aloud before flipping',
    '',
    '-'.repeat(60),
    '',
  ];

  // Group by category
  const byCategory = new Map<string, Flashcard[]>();
  for (const card of flashcards) {
    if (!byCategory.has(card.category)) {
      byCategory.set(card.category, []);
    }
    byCategory.get(card.category)!.push(card);
  }

  for (const [category, cards] of byCategory) {
    lines.push(`[${category.toUpperCase()}]`);
    lines.push('');

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      lines.push(`Card ${i + 1} (${card.difficulty})`);
      lines.push('-'.repeat(30));
      lines.push(`FRONT: ${card.front}`);
      lines.push('');
      lines.push(`BACK: ${card.back}`);
      lines.push('');
      lines.push(`Keywords: ${card.keywords.join(', ')}`);
      lines.push('');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatSummaryDisplay(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[],
  learningObjectives: string[]
): string {
  const lines = [
    '='.repeat(60),
    '                    COMPREHENSIVE SUMMARY',
    '='.repeat(60),
    '',
  ];

  // Learning Objectives
  lines.push('LEARNING OBJECTIVES');
  lines.push('-'.repeat(40));
  for (let i = 0; i < learningObjectives.length; i++) {
    lines.push(`${i + 1}. ${learningObjectives[i]}`);
  }
  lines.push('');

  // Executive Summary
  lines.push('EXECUTIVE SUMMARY');
  lines.push('-'.repeat(40));
  const topSentences = [...scoredSentences]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const s of topSentences) {
    lines.push(`- ${s.text}`);
  }
  lines.push('');

  // Key Concepts
  lines.push('KEY CONCEPTS & DEFINITIONS');
  lines.push('-'.repeat(40));
  const conceptKeywords = keywords.filter(k => k.category === 'concept' || k.isAcademicTerm).slice(0, 10);
  for (const kw of conceptKeywords) {
    lines.push(`- ${kw.word}: ${kw.contexts[0]?.slice(0, 100) || 'Important term in this material'}...`);
  }
  lines.push('');

  // Relationships & Connections
  const withRelations = keywords.filter(k => k.relatedTerms.length > 0).slice(0, 5);
  if (withRelations.length > 0) {
    lines.push('CONCEPT RELATIONSHIPS');
    lines.push('-'.repeat(40));
    for (const kw of withRelations) {
      lines.push(`- ${kw.word} <-> ${kw.relatedTerms.slice(0, 3).join(', ')}`);
    }
    lines.push('');
  }

  // Key Facts & Evidence
  const evidenceSentences = scoredSentences.filter(s => s.signals.hasEvidence).slice(0, 5);
  if (evidenceSentences.length > 0) {
    lines.push('KEY FACTS & EVIDENCE');
    lines.push('-'.repeat(40));
    for (const s of evidenceSentences) {
      lines.push(`- ${s.text}`);
    }
    lines.push('');
  }

  // Quick Review Questions
  lines.push('QUICK REVIEW QUESTIONS');
  lines.push('-'.repeat(40));
  const reviewKeywords = keywords.slice(0, 4);
  for (const kw of reviewKeywords) {
    lines.push(`- What is ${kw.word}? _______________`);
  }
  lines.push('- How do the main concepts relate to each other? _______________');
  lines.push('');

  return lines.join('\n');
}

function formatNotesDisplay(
  scoredSentences: ScoredSentence[],
  keywords: KeywordInfo[]
): string {
  const lines = [
    '='.repeat(60),
    '                    CORNELL NOTES',
    '='.repeat(60),
    '',
    'Date: ____________  Topic: ____________  Class: ____________',
    '',
    '+' + '-'.repeat(20) + '+' + '-'.repeat(37) + '+',
    '| CUES/QUESTIONS     | NOTES                                 |',
    '+' + '-'.repeat(20) + '+' + '-'.repeat(37) + '+',
  ];

  // Organize by topic clusters
  const topicMap = new Map<string, ScoredSentence[]>();
  for (const s of scoredSentences) {
    const topic = s.topic || 'General';
    if (!topicMap.has(topic)) {
      topicMap.set(topic, []);
    }
    topicMap.get(topic)!.push(s);
  }

  // Create notes sections
  for (const [topic, sentences] of topicMap) {
    if (sentences.length < 2) continue;

    const sorted = sentences.sort((a, b) => b.score - a.score).slice(0, 4);
    const keywordInfo = keywords.find(k => k.word.toLowerCase() === topic);

    // Cue column
    const cue = `What is ${keywordInfo?.word || capitalizeFirst(topic)}?`;

    lines.push('|' + ' '.repeat(20) + '|' + ' '.repeat(37) + '|');
    lines.push(`| ${cue.padEnd(18).slice(0, 18)} |`);

    // Notes column
    for (const s of sorted) {
      const prefix = s.signals.hasDefinition ? '[DEF]' :
                     s.signals.hasCausation ? '[C/E]' :
                     s.signals.hasEvidence ? '[EVI]' : '[-]';
      const noteText = `${prefix} ${s.text.slice(0, 60)}...`;
      lines.push(`|${' '.repeat(20)}| ${noteText.slice(0, 35).padEnd(35)} |`);
    }

    lines.push('+' + '-'.repeat(20) + '+' + '-'.repeat(37) + '+');
  }

  // Summary section
  lines.push('');
  lines.push('SUMMARY (Write in your own words):');
  lines.push('-'.repeat(60));
  lines.push('');
  lines.push('Main ideas:');
  lines.push('1. _________________________________________________');
  lines.push('2. _________________________________________________');
  lines.push('3. _________________________________________________');
  lines.push('');
  lines.push('Key vocabulary:');
  for (const kw of keywords.slice(0, 6)) {
    lines.push(`- ${kw.word}: _________________________________`);
  }
  lines.push('');
  lines.push('Questions I still have:');
  lines.push('- _________________________________________________');
  lines.push('');

  return lines.join('\n');
}

function formatAssignmentDisplay(text: string, keywords: KeywordInfo[]): string {
  const topKeywords = keywords.slice(0, 5).map(k => k.word);
  const preview = normalizeText(text).slice(0, 400) + (text.length > 400 ? '...' : '');

  return [
    '='.repeat(60),
    '                    ASSIGNMENT ANALYSIS',
    '='.repeat(60),
    '',
    'KEY TERMS IDENTIFIED:',
    topKeywords.map(k => `- ${k}`).join('\n'),
    '',
    '-'.repeat(60),
    '',
    '1. TASK BREAKDOWN',
    '-'.repeat(40),
    '[ ] Read and understand the full prompt',
    '[ ] Identify all requirements and deliverables',
    '[ ] Note word count/page requirements',
    '[ ] Check due date and plan timeline',
    '[ ] Review grading rubric carefully',
    '',
    '2. RESEARCH PHASE',
    '-'.repeat(40),
    '[ ] Gather relevant sources (minimum 5-8 for university level)',
    '[ ] Take notes on key arguments and evidence',
    '[ ] Identify potential counterarguments',
    '[ ] Organize sources by theme/relevance',
    '',
    '3. WRITING STRUCTURE',
    '-'.repeat(40),
    'INTRODUCTION (10%):',
    '  - Hook: Engaging opening statement',
    '  - Context: Background information',
    '  - Thesis: Clear argument/position',
    '',
    'BODY PARAGRAPHS (70%):',
    '  For each main point:',
    '  - Topic sentence (claim)',
    '  - Evidence (quotes, data, examples)',
    '  - Analysis (explain significance)',
    '  - Transition to next point',
    '',
    'CONCLUSION (10%):',
    '  - Restate thesis (new words)',
    '  - Summarize key arguments',
    '  - Broader implications/call to action',
    '',
    '4. ACADEMIC STANDARDS',
    '-'.repeat(40),
    '[ ] Use formal academic tone',
    '[ ] Cite all sources properly (APA/MLA/Chicago)',
    '[ ] Avoid first person unless specified',
    '[ ] Define technical terms',
    '[ ] Include in-text citations',
    '[ ] Create bibliography/works cited',
    '',
    '5. REVISION CHECKLIST',
    '-'.repeat(40),
    '[ ] Does the thesis directly answer the prompt?',
    '[ ] Is each paragraph focused on one main idea?',
    '[ ] Are all claims supported with evidence?',
    '[ ] Are transitions smooth between sections?',
    '[ ] Is the conclusion more than just summary?',
    '[ ] Proofread for grammar and spelling',
    '[ ] Check formatting requirements',
    '[ ] Run plagiarism check',
    '',
    '-'.repeat(60),
    'ASSIGNMENT PREVIEW:',
    '-'.repeat(60),
    preview,
  ].join('\n');
}

function formatPopQuizDisplay(questions: GeneratedQuestion[]): string {
  if (questions.length === 0) {
    return 'Pop Quiz\n\nCould not generate questions.';
  }

  const lines = [
    '='.repeat(60),
    '                    QUICK POP QUIZ',
    '='.repeat(60),
    '',
    'Time Limit: 5 minutes',
    'Instructions: Answer quickly without looking at notes!',
    '',
    '-'.repeat(60),
    '',
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`${i + 1}) ${q.question}`);

    if (q.type === 'true-false' && q.options) {
      lines.push('   ( ) True    ( ) False');
    } else if (q.options) {
      for (let j = 0; j < q.options.length; j++) {
        lines.push(`   ${String.fromCharCode(65 + j)}) ${q.options[j]}`);
      }
    } else {
      lines.push('   Answer: ________________________________');
    }
    lines.push('');
  }

  lines.push('-'.repeat(60));
  lines.push('ANSWER KEY:');
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`${i + 1}) ${q.correctAnswer}`);
  }

  return lines.join('\n');
}

function getDifficultyDistribution(questions: GeneratedQuestion[]): string {
  const dist: Record<string, number> = {};
  for (const q of questions) {
    dist[q.difficulty] = (dist[q.difficulty] || 0) + 1;
  }
  return Object.entries(dist).map(([k, v]) => `${k}: ${v}`).join(', ');
}

// ============================================
// MAIN GENERATION FUNCTION
// ============================================

export function generateSmartContent(mode: ToolMode, text: string): GeneratedContent {
  const cleaned = normalizeText(text);
  const sentences = splitSentences(cleaned);
  const keywords = extractKeywordsEnhanced(cleaned);
  const subjectArea = detectSubjectArea(cleaned);

  // Create keyword frequency map
  const keywordFreq = new Map<string, number>();
  for (const kw of keywords) {
    keywordFreq.set(kw.word.toLowerCase(), kw.frequency);
  }

  // Score all sentences
  const scoredSentences = sentences.map(s => scoreSentence(s, keywordFreq));

  // Extract key topics and learning objectives
  const keyTopics = keywords.slice(0, 8).map(k => k.word);
  const learningObjectives = generateLearningObjectives(keywords, scoredSentences);

  let questions: GeneratedQuestion[] = [];
  let flashcards: Flashcard[] | undefined;
  let displayText = '';

  switch (mode) {
    case 'mcq':
      // Generate diverse MCQs with different Bloom levels
      questions = [
        ...generateConceptMCQs(scoredSentences, keywords, 6),
        ...generateBloomQuestions(scoredSentences, keywords, 'understand', 2),
        ...generateBloomQuestions(scoredSentences, keywords, 'apply', 2),
      ];
      displayText = formatMCQDisplay(questions);
      break;

    case 'quiz':
      questions = [
        ...generateBloomQuestions(scoredSentences, keywords, 'remember', 2),
        ...generateBloomQuestions(scoredSentences, keywords, 'understand', 3),
        ...generateBloomQuestions(scoredSentences, keywords, 'analyze', 2),
        ...generateBloomQuestions(scoredSentences, keywords, 'evaluate', 1),
      ];
      displayText = formatQuizDisplay(questions);
      break;

    case 'pop':
      const tfQuestions = scoredSentences
        .filter(s => s.signals.hasImportance || s.signals.hasDefinition)
        .slice(0, 3)
        .map(s => ({
          id: generateId(),
          type: 'true-false' as QuestionType,
          question: `True or False: ${s.text}`,
          options: ['True', 'False'],
          correctAnswer: 'True',
          correctIndex: 0,
          sourceSentence: s.text,
          keywords: s.keywords,
          difficulty: 'introductory' as Difficulty,
          bloomLevel: 'remember' as BloomLevel,
          topic: s.topic,
        }));

      questions = [
        ...tfQuestions,
        ...generateConceptMCQs(scoredSentences, keywords, 2),
      ];
      displayText = formatPopQuizDisplay(questions);
      break;

    case 'essay':
      questions = [
        ...generateEssayQuestions(scoredSentences, keywords, 3),
        ...generateCaseStudyQuestions(scoredSentences, keywords, subjectArea),
      ];
      displayText = formatEssayDisplay(questions);
      break;

    case 'flashcards':
      flashcards = generateFlashcards(scoredSentences, keywords, 20);
      displayText = formatFlashcardsDisplay(flashcards);
      break;

    case 'summarize':
      displayText = formatSummaryDisplay(scoredSentences, keywords, learningObjectives);
      break;

    case 'notes':
      displayText = formatNotesDisplay(scoredSentences, keywords);
      break;

    case 'assignment':
      displayText = formatAssignmentDisplay(cleaned, keywords);
      break;

    case 'math':
      displayText = generateMathSolutions(cleaned);
      break;
  }

  return {
    mode,
    questions,
    flashcards,
    sourceText: cleaned,
    keyTopics,
    displayText,
    subjectArea,
    learningObjectives,
  };
}

function generateMathSolutions(text: string): string {
  const lines: string[] = [
    '='.repeat(60),
    '                    MATH PROBLEM SOLVER',
    '='.repeat(60),
    '',
  ];

  const problems = extractMathProblems(text);

  if (problems.length === 0) {
    const solution = solveMath(text);
    return formatMathSolution(solution);
  }

  lines.push(`Found ${problems.length} math problem(s):`, '');

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    const solution = solveMath(problem);

    lines.push('-'.repeat(60));
    lines.push(`PROBLEM ${i + 1}: ${problem}`);
    lines.push('-'.repeat(60));
    lines.push('');

    for (let j = 0; j < solution.steps.length; j++) {
      const step = solution.steps[j];
      lines.push(`Step ${j + 1}: ${step.description}`);
      lines.push(`   ${step.expression}`);
      if (step.explanation) {
        lines.push(`   -> ${step.explanation}`);
      }
      lines.push('');
    }

    lines.push(`ANSWER: ${solution.answer}`);
    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('');
  lines.push('MATH REFERENCE:');
  lines.push('-'.repeat(40));
  lines.push('Derivatives:');
  lines.push('  d/dx(x^n) = n*x^(n-1)');
  lines.push('  d/dx(sin x) = cos x');
  lines.push('  d/dx(e^x) = e^x');
  lines.push('');
  lines.push('Integrals:');
  lines.push('  int x^n dx = x^(n+1)/(n+1) + C');
  lines.push('  int sin x dx = -cos x + C');
  lines.push('  int e^x dx = e^x + C');

  return lines.join('\n');
}

// ============================================
// LEGACY SUPPORT
// ============================================

export function offlineGenerate(mode: ToolMode, text: string): string {
  const cleaned = (text || '').trim();

  if (!cleaned) {
    const emptyMessages: Record<ToolMode, string> = {
      assignment: 'Assignment Analysis\n\nPaste your assignment instructions and click Generate for a comprehensive breakdown.',
      summarize: 'Comprehensive Summary\n\nPaste lecture notes or reading material to generate learning objectives, key concepts, and review questions.',
      mcq: 'Multiple Choice Assessment\n\nPaste course content to generate university-level MCQs with varied difficulty and Bloom\'s taxonomy levels.',
      quiz: 'Short Answer Quiz\n\nPaste material to generate analysis and evaluation questions with point values.',
      pop: 'Pop Quiz\n\nPaste content for a quick 5-minute assessment with answer key.',
      notes: 'Cornell Notes\n\nPaste lecture content to generate organized notes with cues, summaries, and review questions.',
      math: 'Math Solver\n\nSupports:\n- Arithmetic & Algebra\n- Linear & Quadratic Equations\n- Derivatives (d/dx)\n- Integrals\n- Limits\n\nExamples:\n  2x + 5 = 15\n  d/dx(x^3 + 2x)\n  integral x^2 dx',
      flashcards: 'Study Flashcards\n\nPaste content to generate categorized flashcards for efficient memorization and spaced repetition.',
      essay: 'Essay Questions\n\nPaste content to generate essay prompts with grading rubrics and case studies.',
      planner: 'Study Planner\n\nCreate personalized study schedules based on your exam date, topics, and available study time.',
    };
    return emptyMessages[mode] || 'Please provide content to generate study materials.';
  }

  const content = generateSmartContent(mode, cleaned);
  return content.displayText;
}

export function getGeneratedContent(mode: ToolMode, text: string): GeneratedContent {
  return generateSmartContent(mode, (text || '').trim());
}
