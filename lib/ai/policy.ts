export type StudyAiMode =
  | 'assignment'
  | 'summarize'
  | 'explain'
  | 'mcq'
  | 'quiz'
  | 'notes'
  | 'math'
  | 'flashcards'
  | 'essay'
  | 'planner'
  | 'rephrase'
  // Workspace-side aliases that flow through the same scope policy.
  // Keeping ToolMode and StudyAiMode aligned avoids cascading casts in
  // lib/ai/client.ts and downstream callers.
  | 'outline'
  | 'practice'
  | 'exam';

export type AiScopeErrorCode = 'OUT_OF_SCOPE' | 'INSUFFICIENT_STUDY_INPUT' | 'INVALID_MODE';

export type AiScopeInput = {
  mode: string;
  text: string;
  source?: 'workspace' | 'tools' | 'analytics' | 'planner' | 'unknown';
};

export type AiScopeAllowed = {
  allowed: true;
};

export type AiScopeBlocked = {
  allowed: false;
  errorCode: AiScopeErrorCode;
  reason: string;
  suggestionModes: StudyAiMode[];
};

export type AiScopeDecision = AiScopeAllowed | AiScopeBlocked;

export const KIVORA_ALLOWED_AI_MODES: StudyAiMode[] = [
  'assignment',
  'summarize',
  'mcq',
  'quiz',
  'notes',
  'math',
  'flashcards',
  'essay',
  'planner',
  'rephrase',
];

const allowedModes = new Set<string>(KIVORA_ALLOWED_AI_MODES);

const MODE_MIN_LENGTH: Partial<Record<StudyAiMode, number>> = {
  assignment: 30,
  summarize: 40,
  mcq: 40,
  quiz: 40,
  notes: 40,
  math: 6,
  flashcards: 40,
  essay: 40,
  planner: 20,
  rephrase: 8,
};

const MATH_SIGNAL = /(?:\d|[+\-*/=^]|integral|derivative|limit|matrix|vector|equation|theorem|proof|det|rank|trace|sin|cos|tan|sqrt|∫|\blim\b|معادلة|تكامل|مصفوفة|اشتقاق)/i;

const ACADEMIC_ANCHOR = /(?:lecture|chapter|course|exam|assignment|topic|concept|definition|research|study|summary|quiz|notes|syllabus|homework|theory|analysis|المحاضرة|المقرر|الاختبار|الواجب|ملخص|ملاحظات|موضوع|مفهوم|دراسة|شرح)/i;

const BLOCKED_INTENT_PATTERNS: RegExp[] = [
  // Generic chat / entertainment
  /\b(?:tell me a joke|chat with me|small talk|what's up|how are you|roleplay|pretend you are)\b/i,
  /(?:احك(?:ي)?\s+نكتة|دردشة|سولف|لعب دور|تظاهر أنك|كيف حالك)/i,

  // Coding assistant intents
  /\b(?:write|debug|fix|refactor|build|create)\b.{0,48}\b(?:code|script|function|api|react|nextjs|javascript|python|java|c\+\+)\b/i,
  /\b(?:اكتب|اصلح|صحح|ابنِ|أنشئ)\b.{0,48}\b(?:كود|سكريبت|دالة|تطبيق|موقع|بايثون|جافاسكربت)\b/i,

  // Personal messaging / social writing
  /\b(?:write|draft|compose)\b.{0,48}\b(?:text message|dm|email to|message to|love letter|apology|bio)\b/i,
  /(?:اكتب|اكتب لي|صغ|جهز).{0,48}(?:رسالة|ايميل|اعتذار|سيرة ذاتية)/i,

  // Career docs
  /\b(?:resume|cv|cover letter|linkedin summary|job application)\b/i,
  /\b(?:سيرة ذاتية|خطاب تقديم|طلب وظيفة|لينكد.?إن)\b/i,

  // Professional advice outside study scope
  /\b(?:legal advice|medical advice|diagnose|investment advice|stock picks|tax advice)\b/i,
  /\b(?:استشارة قانونية|استشارة طبية|تشخيص|نصيحة استثمار|أسهم|ضرائب)\b/i,
];

const DEFAULT_SUGGESTIONS: StudyAiMode[] = ['summarize', 'notes', 'quiz'];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function suggestionsForMode(mode: StudyAiMode | null): StudyAiMode[] {
  if (!mode) return DEFAULT_SUGGESTIONS;
  if (mode === 'math') return ['math', 'notes', 'quiz'];
  if (mode === 'planner') return ['planner', 'summarize', 'quiz'];
  if (mode === 'assignment') return ['assignment', 'notes', 'quiz'];
  if (mode === 'rephrase') return ['rephrase', 'notes', 'summarize'];
  return [mode, ...DEFAULT_SUGGESTIONS.filter((item) => item !== mode)].slice(0, 3);
}

function asToolMode(mode: string): StudyAiMode | null {
  return allowedModes.has(mode) ? (mode as StudyAiMode) : null;
}

export function evaluateAiScope(input: AiScopeInput): AiScopeDecision {
  const normalizedMode = input.mode.trim().toLowerCase();
  const mode = asToolMode(normalizedMode);

  if (!mode) {
    return {
      allowed: false,
      errorCode: 'INVALID_MODE',
      reason: 'This AI tool mode is not supported in Kivora.',
      suggestionModes: DEFAULT_SUGGESTIONS,
    };
  }

  const text = normalizeText(input.text || '');
  if (text.length === 0) {
    return {
      allowed: false,
      errorCode: 'INSUFFICIENT_STUDY_INPUT',
      reason: 'Add more course material or assignment details so Kivora can generate study content.',
      suggestionModes: suggestionsForMode(mode),
    };
  }

  if (mode === 'math' && !MATH_SIGNAL.test(text)) {
    return {
      allowed: false,
      errorCode: 'OUT_OF_SCOPE',
      reason: 'Math mode accepts equations or math-focused study prompts only.',
      suggestionModes: ['math', 'notes', 'quiz'],
    };
  }

  // Inspect for clearly out-of-scope intents. Preserve academic prompts even if they include a blocked keyword.
  const boundedText = text.slice(0, 1600);
  const blockedIntent = BLOCKED_INTENT_PATTERNS.some((pattern) => pattern.test(boundedText));
  if (blockedIntent && !ACADEMIC_ANCHOR.test(boundedText) && mode !== 'rephrase') {
    return {
      allowed: false,
      errorCode: 'OUT_OF_SCOPE',
      reason: 'Kivora AI is restricted to academic learning and study-planning tasks.',
      suggestionModes: suggestionsForMode(mode),
    };
  }

  if (blockedIntent && mode === 'rephrase') {
    return {
      allowed: false,
      errorCode: 'OUT_OF_SCOPE',
      reason: 'Rephrase is available for safe writing improvements only.',
      suggestionModes: suggestionsForMode(mode),
    };
  }

  const minLength = MODE_MIN_LENGTH[mode] ?? 20;
  if (text.length < minLength) {
    return {
      allowed: false,
      errorCode: 'INSUFFICIENT_STUDY_INPUT',
      reason: 'Add more course material or assignment details so Kivora can generate study content.',
      suggestionModes: suggestionsForMode(mode),
    };
  }

  return { allowed: true };
}

export function getSupportedAiTasks(language: 'en' | 'ar' = 'en'): string[] {
  if (language === 'ar') {
    return [
      'تلخيص الدروس والمواد',
      'إنشاء أسئلة اختيار متعدد واختبارات قصيرة',
      'تنظيم ملاحظات الدراسة',
      'بناء بطاقات مراجعة',
      'تحليل الواجبات وخطط الدراسة',
      'حل مسائل الرياضيات التعليمية',
      'إعادة صياغة النص بأسلوب رسمي أو أكاديمي أو موجز',
    ];
  }

  return [
    'Summarize lectures and readings',
    'Generate MCQs and short quizzes',
    'Create structured study notes',
    'Build flashcards for revision',
    'Break down assignments and study plans',
    'Solve academic math problems',
    'Rephrase writing in formal, academic, or concise tone',
  ];
}
