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

// ── Helpers ─────────────────────────────────────────────────────────────────

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 30);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z][a-z-']{3,}\b/g) ?? [];
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their',
  'there', 'which', 'when', 'will', 'also', 'more', 'some', 'such', 'than',
  'into', 'over', 'after', 'being', 'each', 'most', 'then', 'both', 'through',
  'where', 'those', 'would', 'could', 'should', 'these', 'other', 'many',
  'about', 'above', 'before', 'between', 'while', 'under', 'further', 'once',
  'here', 'same', 'just', 'because', 'however', 'although', 'therefore',
]);

function termFrequency(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of words(text)) {
    if (!STOP_WORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return freq;
}

function topKeywords(text: string, n = 10): string[] {
  const freq = termFrequency(text);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

/** Score a sentence by TF-weighted keyword density */
function scoreSentence(s: string, freq: Map<string, number>): number {
  const ws = words(s).filter(w => !STOP_WORDS.has(w));
  if (!ws.length) return 0;
  const tfSum = ws.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0);
  return tfSum / ws.length;
}

/** Pick top n sentences by importance score, preserving original order */
function extractKeySentences(text: string, n: number): string[] {
  const sents = sentences(text);
  if (sents.length <= n) return sents;
  const freq = termFrequency(text);

  // Position bonus: first sentence of document + first sentence of each paragraph
  const paraFirsts = new Set<string>();
  for (const p of paragraphs(text)) {
    const ps = sentences(p);
    if (ps[0]) paraFirsts.add(ps[0]);
  }

  const scored = sents.map((s, i) => ({
    s, i,
    score: scoreSentence(s, freq)
      * (i === 0 ? 1.5 : 1)           // document lead bonus
      * (paraFirsts.has(s) ? 1.3 : 1) // para lead bonus
      * (i === sents.length - 1 ? 1.2 : 1), // conclusion bonus
  }));

  const topIdx = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.i)
    .sort((a, b) => a - b); // re-sort by original order

  return topIdx.map(i => sents[i]);
}

/** Extract definition-like patterns: "X is Y", "X refers to Y", "X means Y" */
function extractDefinitions(text: string): Array<{ term: string; definition: string }> {
  const defs: Array<{ term: string; definition: string }> = [];
  const patterns = [
    /\b([A-Z][a-zA-Z\s]{2,30})\s+(?:is|are|refers? to|means?|denotes?|represents?)\s+([^.!?]{20,120})/g,
    /\b([A-Z][a-zA-Z\s]{2,20}),?\s+(?:also known as|or|i\.e\.)\s+([^,;.]{10,60})/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && defs.length < 12) {
      const term = m[1].trim().replace(/\s+/g, ' ');
      const def  = m[2].trim();
      if (term.split(' ').length <= 5) {
        defs.push({ term, definition: def });
      }
    }
  }
  // Deduplicate by term
  const seen = new Set<string>();
  return defs.filter(d => {
    const key = d.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** Build simple question from a sentence using the most important keyword */
function sentenceToQuestion(s: string, allKeywords: string[]): { q: string; a: string } | null {
  // Try: "What does X refer to?" for definition sentences
  const defMatch = s.match(/\b([A-Z][a-zA-Z\s]{2,25})\s+(?:is|are|refers? to|means?)\s+(.+)/);
  if (defMatch) {
    return {
      q: `What is ${defMatch[1].trim()}?`,
      a: `${defMatch[1].trim()} is ${defMatch[2].trim()}`,
    };
  }

  // Try: find a prominent keyword in the sentence and blank it
  const sentWords = s.match(/\b[A-Za-z]{5,}\b/g) ?? [];
  const prominent = sentWords.find(w => allKeywords.includes(w.toLowerCase()))
    ?? sentWords[Math.floor(sentWords.length / 3)]
    ?? sentWords[0];
  if (!prominent) return null;

  const blanked = s.replace(prominent, '________');
  return { q: `Complete: "${blanked}"`, a: prominent };
}

// ── Generators ──────────────────────────────────────────────────────────────

function generateSummary(text: string): string {
  const paras = paragraphs(text);
  const sents = sentences(text);
  if (!sents.length) return 'No content to summarize.';

  const kws = topKeywords(text, 8);
  const keySents = extractKeySentences(text, 5);

  // Build structured summary
  const parts: string[] = ['## Summary\n'];

  // Opening: always include first sentence
  if (keySents[0]) {
    parts.push(keySents[0]);
  }

  // Middle: 2–3 key sentences
  if (keySents.length > 2) {
    parts.push('\n\n' + keySents.slice(1, -1).join(' '));
  }

  // Closing: last key sentence (often conclusion)
  if (keySents.length > 1) {
    parts.push('\n\n' + keySents[keySents.length - 1]);
  }

  // Key concepts
  if (kws.length) {
    parts.push(`\n\n---\n**Key concepts:** ${kws.map(k => `\`${k}\``).join(' · ')}`);
  }

  // Word/sentence count context
  parts.push(`\n\n_Summarized ${sents.length} sentences across ${Math.max(paras.length, 1)} section(s)._`);

  return parts.join('');
}

function generateRephrase(text: string): string {
  const sents = sentences(text);
  if (!sents.length) return 'No content to rephrase.';

  const kws = topKeywords(text, 6);
  const key = extractKeySentences(text, Math.min(8, sents.length));
  const defs = extractDefinitions(text);

  const parts: string[] = ['## Simplified Rewrite\n'];

  // Main points as plain bullet list
  parts.push('**Main Points:**\n');
  for (const s of key.slice(0, 6)) {
    // Simplify by shortening to core clause
    const simplified = s.length > 120 ? s.slice(0, 120).replace(/,\s*\w+$/, '') + '…' : s;
    parts.push(`- ${simplified}`);
  }

  // Definitions found
  if (defs.length) {
    parts.push('\n\n**Definitions:**\n');
    for (const d of defs.slice(0, 4)) {
      parts.push(`- **${d.term}** — ${d.definition}`);
    }
  }

  // Key terms
  if (kws.length) {
    parts.push(`\n\n**Key terms to know:** ${kws.join(', ')}`);
  }

  return parts.join('\n');
}

function generateNotes(text: string): string {
  const paras = paragraphs(text);
  const sents = sentences(text);
  if (!sents.length) return 'No content to extract notes from.';

  const kws = topKeywords(text, 8);
  const defs = extractDefinitions(text);
  const freq = termFrequency(text);

  const parts: string[] = ['## Study Notes\n'];

  if (paras.length >= 2) {
    // Organize by paragraph sections
    paras.slice(0, 5).forEach((para, i) => {
      const ps = sentences(para);
      if (!ps.length) return;
      // Use first sentence as section heading concept
      const heading = ps[0].slice(0, 60).replace(/[.!?]$/, '');
      parts.push(`\n### ${i + 1}. ${heading}…\n`);
      // Bullet remaining sentences
      const scored = ps.slice(1).map(s => ({ s, score: scoreSentence(s, freq) }))
        .sort((a, b) => b.score - a.score);
      for (const { s } of scored.slice(0, 3)) {
        parts.push(`- ${s}`);
      }
    });
  } else {
    // Flat bullet list from key sentences
    parts.push('**Key Points:**\n');
    for (const s of extractKeySentences(text, 10)) {
      parts.push(`- ${s}`);
    }
  }

  // Definitions section
  if (defs.length) {
    parts.push('\n\n---\n### 📖 Definitions\n');
    for (const d of defs.slice(0, 6)) {
      parts.push(`- **${d.term}**: ${d.definition}`);
    }
  }

  // Key terms
  if (kws.length) {
    parts.push(`\n\n---\n**Key Terms:** ${kws.map(k => `_${k}_`).join(', ')}`);
  }

  return parts.join('\n');
}

function generateQuiz(text: string, count = 5): string {
  const sents = sentences(text);
  if (sents.length < 2) return 'Not enough content to generate a quiz.';

  const kws = topKeywords(text, 20);
  const keySents = extractKeySentences(text, Math.min(count + 2, sents.length));
  const defs = extractDefinitions(text);

  const questions: Array<{ q: string; a: string }> = [];

  // First: use extracted definitions for definition questions
  for (const d of defs.slice(0, Math.ceil(count / 2))) {
    questions.push({
      q: `What is **${d.term}**?`,
      a: `${d.term} is ${d.definition}`,
    });
  }

  // Then: convert key sentences to questions
  for (const s of keySents) {
    if (questions.length >= count) break;
    const q = sentenceToQuestion(s, kws);
    if (q) questions.push(q);
  }

  // Pad with generic comprehension questions
  const genericTemplates = [
    'Explain the main idea of the passage in your own words.',
    `What role does **${kws[0] ?? 'the main concept'}** play in this topic?`,
    `How does **${kws[1] ?? 'the key concept'}** relate to **${kws[2] ?? 'the topic'}**?`,
    'What are the key implications of the information presented?',
    `Give an example of how **${kws[0] ?? 'this concept'}** applies in a real-world context.`,
  ];

  for (const t of genericTemplates) {
    if (questions.length >= count) break;
    questions.push({ q: t, a: '(Use the source material to construct your answer.)' });
  }

  const formatted = questions.slice(0, count).map((item, i) =>
    `**Q${i + 1}.** ${item.q}\n\n> **Answer:** ${item.a}`,
  );

  return `## Quiz (${formatted.length} Questions)\n\n${formatted.join('\n\n---\n\n')}`;
}

function generateMCQ(text: string, count = 5): string {
  const sents = sentences(text);
  if (sents.length < 2) return 'Not enough content to generate MCQs.';

  const kws = topKeywords(text, 24);
  const keySents = extractKeySentences(text, Math.min(count + 3, sents.length));
  const defs = extractDefinitions(text);

  const questions: string[] = [];

  // Definition-based MCQs (best quality)
  for (const d of defs.slice(0, Math.ceil(count / 2))) {
    if (questions.length >= count) break;
    const answer = d.term;
    // Distractors: other terms from definitions or top keywords
    const pool = [...defs.map(x => x.term), ...kws].filter(k => k !== answer);
    const distractors = pool.slice(0, 3);
    while (distractors.length < 3) distractors.push(`Option ${distractors.length + 1}`);

    const opts = shuffle([answer, ...distractors.slice(0, 3)]);
    const letters = ['A', 'B', 'C', 'D'];
    const correctLetter = letters[opts.indexOf(answer)];

    questions.push(
      `**Q${questions.length + 1}.** Which of the following best describes: "${d.definition.slice(0, 80)}…"?\n` +
      opts.map((o, i) => `   ${letters[i]}) ${o}`).join('\n') +
      `\n   ✓ **Answer: ${correctLetter}) ${answer}**`,
    );
  }

  // Sentence fill-in MCQs
  for (const s of keySents) {
    if (questions.length >= count) break;
    const ws = s.match(/\b[A-Za-z]{5,}\b/g) ?? [];
    const answer = ws.find(w => kws.includes(w.toLowerCase())) ?? ws[Math.floor(ws.length / 3)] ?? ws[0];
    if (!answer) continue;

    const stem = s.replace(answer, '________');
    const distractors = kws.filter(k => k !== answer.toLowerCase()).slice(0, 3);
    while (distractors.length < 3) distractors.push(`${answer.slice(0, 3)}…`);

    const opts = shuffle([answer, ...distractors.map(d => d)]);
    const letters = ['A', 'B', 'C', 'D'];
    const correctLetter = letters[opts.indexOf(answer)];

    questions.push(
      `**Q${questions.length + 1}.** ${stem}\n` +
      opts.map((o, i) => `   ${letters[i]}) ${o}`).join('\n') +
      `\n   ✓ **Answer: ${correctLetter}) ${answer}**`,
    );
  }

  // Pad with concept questions
  if (questions.length < count && kws.length >= 2) {
    const q =
      `**Q${questions.length + 1}.** Which concept is most central to this passage?\n` +
      kws.slice(0, 4).map((k, i) => `   ${'ABCD'[i]}) ${k}`).join('\n') +
      `\n   ✓ **Answer: A) ${kws[0]}** _(based on frequency analysis)_`;
    questions.push(q);
  }

  return `## Multiple Choice Questions\n\n${questions.slice(0, count).join('\n\n---\n\n')}`;
}

function generateFlashcards(text: string, count = 6): string {
  const sents = sentences(text);
  if (!sents.length) return 'Not enough content to generate flashcards.';

  const kws = topKeywords(text, count + 6);
  const defs = extractDefinitions(text);
  const cards: Array<{ front: string; back: string }> = [];

  // Definition-based cards (highest quality)
  for (const d of defs.slice(0, count)) {
    cards.push({
      front: `What is **${d.term}**?`,
      back: d.definition,
    });
  }

  // Keyword + context cards
  const freq = termFrequency(text);
  for (const kw of kws) {
    if (cards.length >= count) break;
    // Find the sentence that best defines/explains this keyword
    const containing = sents
      .filter(s => s.toLowerCase().includes(kw))
      .sort((a, b) => scoreSentence(b, freq) - scoreSentence(a, freq));
    if (containing[0]) {
      cards.push({
        front: `Explain **${kw}** in the context of this material.`,
        back: containing[0],
      });
    }
  }

  // Fill remaining with key-sentence pairs
  for (const s of extractKeySentences(text, count)) {
    if (cards.length >= count) break;
    const ws = s.match(/\b[A-Z][a-zA-Z]{3,}\b/g) ?? [];
    const concept = ws[0] ?? kws[cards.length] ?? 'concept';
    cards.push({
      front: `What does the passage say about **${concept}**?`,
      back: s,
    });
  }

  const formatted = cards.slice(0, count).map((card, i) =>
    `### Card ${i + 1}\n🟦 **Front:** ${card.front}\n\n🟩 **Back:** ${card.back}`,
  );

  return `## Flashcards (${formatted.length} cards)\n\n${formatted.join('\n\n---\n\n')}`;
}

function generateAssignment(text: string, count = 5): string {
  const sents = sentences(text);
  if (!sents.length) return 'No content to generate an assignment from.';

  const kws = topKeywords(text, 10);
  const defs = extractDefinitions(text);
  const keySents = extractKeySentences(text, 6);

  const questionTemplates: Array<(kw: string, s: string) => string> = [
    (kw) => `Define and explain the concept of **${kw}** in your own words. Provide at least one specific example from the material.`,
    (kw) => `Compare and contrast **${kw}** with a related concept mentioned in the text. Use evidence from the material to support your answer.`,
    (kw) => `Why is **${kw}** significant in the context of this topic? What would change if this concept did not exist or apply?`,
    (kw) => `Describe a real-world application of **${kw}**. Explain how the principles from the material are relevant.`,
    (kw) => `Critically evaluate the importance of **${kw}** in the broader field. What are its strengths and limitations?`,
    (_kw, s) => `Analyse the following statement and discuss its implications:\n\n> _"${s}"_\n\nDo you agree or disagree? Support your position with evidence.`,
    (kw) => `Summarise the key arguments the text makes about **${kw}**. What conclusion does the author seem to reach?`,
  ];

  // Use definition terms for deeper questions where available
  const questionSources = [
    ...defs.slice(0, 3).map(d => ({ kw: d.term, s: `${d.term} is ${d.definition}` })),
    ...kws.slice(0, count).map((kw, i) => ({ kw, s: keySents[i] ?? keySents[0] ?? kw })),
  ];

  const qs = questionSources.slice(0, count).map((src, i) => {
    const tpl = questionTemplates[i % questionTemplates.length];
    return `**${i + 1}.** ${tpl(src.kw, src.s)}`;
  });

  const rubric = [
    '| Criterion | Marks |',
    '|-----------|-------|',
    ...qs.map((_, i) => `| Question ${i + 1}: accuracy and use of evidence | ${Math.floor(100 / qs.length)} |`),
  ].join('\n');

  return [
    '## Assignment\n',
    '*Instructions: Answer each question in full sentences. Cite specific examples from the material where possible. Aim for 100–200 words per question.*\n',
    qs.join('\n\n'),
    '\n\n---\n### Marking Rubric\n',
    rubric,
  ].join('\n');
}

// ── Utility ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Public API ───────────────────────────────────────────────────────────────

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
