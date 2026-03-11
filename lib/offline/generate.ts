/**
 * Deterministic offline content generation.
 * Used as the final fallback when no AI model (local or cloud) is available.
 * Produces structured, usable study output purely from the input text.
 */

export type ToolMode =
  | 'summarize'
  | 'rephrase'
  | 'notes'
  | 'quiz'
  | 'mcq'
  | 'flashcards'
  | 'assignment';

// ── helpers ────────────────────────────────────────────────────────────────

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z][a-z-']{3,}\b/g) ?? [];
}

function topKeywords(text: string, n = 8): string[] {
  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their',
    'there', 'which', 'when', 'will', 'also', 'more', 'some', 'such', 'than',
    'into', 'over', 'after', 'being', 'each', 'most', 'then', 'both', 'through',
    'where', 'those', 'would', 'could', 'should', 'these', 'other', 'many',
  ]);
  const freq: Record<string, number> = {};
  for (const w of words(text)) {
    if (!stopWords.has(w)) freq[w] = (freq[w] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

// ── generators ─────────────────────────────────────────────────────────────

function generateSummary(text: string): string {
  const sents = sentences(text);
  if (!sents.length) return 'No content to summarize.';

  // Pick first sentence, one from the middle, and the last sentence
  const picked: string[] = [sents[0]];
  if (sents.length > 3) picked.push(sents[Math.floor(sents.length / 2)]);
  if (sents.length > 1) picked.push(sents[sents.length - 1]);

  const kws = topKeywords(text);
  const kwLine = kws.length ? `\n\n**Key concepts:** ${kws.join(', ')}.` : '';

  return `**Summary**\n\n${picked.join(' ')}${kwLine}`;
}

function generateRephrase(text: string): string {
  const sents = sentences(text).slice(0, 6);
  if (!sents.length) return 'No content to rephrase.';

  const rephrased = sents.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `**Rephrased (simplified)**\n\n${rephrased}\n\n_Note: For best results, use the AI model for natural rephrasing._`;
}

function generateNotes(text: string): string {
  const sents = sentences(text);
  if (!sents.length) return 'No content to extract notes from.';

  const kws = topKeywords(text, 6);
  const bullets = sents.slice(0, 10).map(s => `• ${s}`).join('\n');
  const kwSection = kws.length ? `\n\n**Key terms:** ${kws.map(k => `_${k}_`).join(', ')}` : '';

  return `**Study Notes**\n\n${bullets}${kwSection}`;
}

function generateQuiz(text: string, count = 5): string {
  const sents = sentences(text);
  if (sents.length < 2) return 'Not enough content to generate a quiz.';

  const picked = sents.slice(0, count);
  const questions = picked.map((s, i) => {
    // Convert statement to a simple question by blanking a keyword
    const ws = s.match(/\b[A-Za-z]{5,}\b/g) ?? [];
    const blank = ws[Math.floor(ws.length / 2)] || ws[0] || 'concept';
    const question = s.replace(blank, '_______');
    return `**Q${i + 1}.** ${question}\n**Answer:** ${blank}`;
  });

  return `**Quiz (${count} Questions)**\n\n${questions.join('\n\n')}`;
}

function generateMCQ(text: string, count = 5): string {
  const sents = sentences(text);
  if (sents.length < 2) return 'Not enough content to generate MCQs.';

  const kws = topKeywords(text, 20);
  const questions = sents.slice(0, count).map((s, i) => {
    const ws = s.match(/\b[A-Za-z]{5,}\b/g) ?? [];
    const answer = ws[Math.floor(ws.length / 2)] || ws[0] || 'concept';
    // Generate 3 distractor options from keywords
    const distractors = kws.filter(k => k !== answer.toLowerCase()).slice(0, 3);
    while (distractors.length < 3) distractors.push(`option${distractors.length + 1}`);

    const allOptions = [answer, ...distractors].sort(() => 0.5 - Math.random());
    const letterMap = ['A', 'B', 'C', 'D'];
    const correctLetter = letterMap[allOptions.indexOf(answer)];

    const stem = s.replace(answer, '_______');
    const opts = allOptions.map((opt, j) => `   ${letterMap[j]}) ${opt}`).join('\n');
    return `**Q${i + 1}.** ${stem}\n${opts}\n   ✓ **Answer: ${correctLetter}) ${answer}**`;
  });

  return `**Multiple Choice Questions**\n\n${questions.join('\n\n')}`;
}

function generateFlashcards(text: string, count = 6): string {
  const sents = sentences(text).slice(0, count);
  if (!sents.length) return 'Not enough content to generate flashcards.';

  const kws = topKeywords(text, count + 4);
  const cards = sents.map((s, i) => {
    const front = kws[i] ? `What is **${kws[i]}**?` : `Explain: "${s.slice(0, 40)}…"`;
    const back   = s;
    return `**Card ${i + 1}**\n🟦 **Front:** ${front}\n🟩 **Back:** ${back}`;
  });

  return `**Flashcards (${cards.length})**\n\n${cards.join('\n\n---\n\n')}`;
}

function generateAssignment(text: string, count = 5): string {
  const sents = sentences(text);
  if (!sents.length) return 'No content to generate an assignment from.';

  const kws = topKeywords(text);
  const questionTemplates = [
    (kw: string) => `Define and explain the concept of **${kw}** in your own words. Give one example.`,
    (kw: string) => `Compare and contrast **${kw}** with a related concept from the material.`,
    (kw: string) => `Why is **${kw}** important in this context? Support your answer with evidence from the text.`,
    (kw: string) => `Describe a real-world application of **${kw}**.`,
    (kw: string) => `Critically evaluate the role of **${kw}** in the broader topic.`,
    (_kw: string, s: string) => `Analyse the following statement and discuss its implications:\n_"${s}"_`,
  ];

  const qs = Array.from({ length: Math.min(count, kws.length + 1) }, (_, i) => {
    const t = questionTemplates[i % questionTemplates.length];
    const q = t(kws[i] ?? kws[0] ?? 'concept', sents[i] ?? sents[0]);
    return `**${i + 1}.** ${q}`;
  });

  return `**Assignment**\n\n*Answer each question in full sentences. Cite your material where possible.*\n\n${qs.join('\n\n')}`;
}

// ── public API ─────────────────────────────────────────────────────────────

// Backward-compatible rich types (used by AI client, LLM route, and tool components)

export type RewriteOptions = {
  tone?: 'formal' | 'informal' | 'academic' | 'professional' | 'energetic' | 'concise';
  customInstruction?: string;
};

export type GeneratedQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  correctIndex: number;
  type?: 'mcq' | 'true-false' | 'short-answer' | 'explanation' | 'definition' | string;
  sourceSentence?: string;
  keywords?: string[];
  difficulty?: 'introductory' | 'intermediate' | 'advanced' | 'expert';
  bloomLevel?: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  topic?: string;
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
  category?: string;
  difficulty?: 'introductory' | 'intermediate' | 'advanced' | 'expert';
  keywords?: string[];
};

export type GeneratedContent = {
  mode: ToolMode;
  displayText: string;
  questions: GeneratedQuestion[];
  flashcards: Flashcard[];
  keyTopics: string[];
  learningObjectives: string[];
  subjectArea: 'science' | 'humanities' | 'social-science' | 'business' | 'technical' | 'general';
  sourceText: string;
  rewriteMeta?: { tone: string; customInstruction?: string };
};

/**
 * Returns a structured GeneratedContent object (backward-compatible with old API).
 * Use `offlineGenerate` for the simple string output.
 */
export function getGeneratedContent(
  mode: ToolMode,
  text: string,
  _options?: RewriteOptions,
): GeneratedContent {
  const count = 5;
  let displayText: string;
  switch (mode) {
    case 'summarize':  displayText = generateSummary(text); break;
    case 'rephrase':   displayText = generateRephrase(text); break;
    case 'notes':      displayText = generateNotes(text); break;
    case 'quiz':       displayText = generateQuiz(text, count); break;
    case 'mcq':        displayText = generateMCQ(text, count); break;
    case 'flashcards': displayText = generateFlashcards(text, count); break;
    case 'assignment': displayText = generateAssignment(text, count); break;
    default:           displayText = generateSummary(text);
  }
  const kws = topKeywords(text);
  const sents = sentences(text);
  return {
    mode,
    displayText,
    questions: [],
    flashcards: [],
    keyTopics: kws,
    learningObjectives: sents.slice(0, 3).map(s => `Understand: ${s.slice(0, 80)}`),
    subjectArea: 'general',
    sourceText: text,
  };
}

/** Alias retained for backward compatibility with older components. */
export const generateSmartContent = getGeneratedContent;

export function offlineGenerate(
  mode: ToolMode,
  text: string,
  options?: Record<string, unknown>,
): string {
  const count = (options?.count as number | undefined) ?? 5;

  switch (mode) {
    case 'summarize':  return generateSummary(text);
    case 'rephrase':   return generateRephrase(text);
    case 'notes':      return generateNotes(text);
    case 'quiz':       return generateQuiz(text, count);
    case 'mcq':        return generateMCQ(text, count);
    case 'flashcards': return generateFlashcards(text, count);
    case 'assignment': return generateAssignment(text, count);
    default:           return generateSummary(text);
  }
}
