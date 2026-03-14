import { buildBalancedDocumentContext, buildRagContext, retrieveFromIndex, retrieveRelevantChunks, type RAGIndex, type RetrievedChunk } from './retrieve';

export type GenerationMode =
  | 'summarize'
  | 'rephrase'
  | 'notes'
  | 'quiz'
  | 'mcq'
  | 'flashcards'
  | 'assignment'
  | 'outline'
  | 'exam'
  | 'practice';

function getModeFocus(mode: GenerationMode, count?: number) {
  const amount = count ?? 5;
  switch (mode) {
    case 'quiz':
      return `key concepts, facts, definitions, and questions for a ${amount}-question quiz`;
    case 'mcq':
      return `key concepts, facts, definitions, and distractor-worthy details for ${amount} multiple choice questions`;
    case 'flashcards':
      return `important terms, definitions, formulas, dates, and memorization-ready facts for ${amount} flashcards`;
    case 'assignment':
      return `major concepts, explanations, and assignment-worthy prompts for ${amount} questions`;
    case 'exam':
      return `high-yield exam material, definitions, worked examples, and likely assessment points for ${amount} exam questions`;
    case 'practice':
      return 'practice-worthy concepts, worked examples, and problem-solving steps';
    case 'summarize':
      return 'main ideas, arguments, and essential supporting details';
    case 'notes':
      return 'key concepts, definitions, examples, and structured study notes';
    case 'rephrase':
      return 'the clearest explanations of the most important ideas';
    case 'outline':
      return 'section structure, headings, topics, and learning objectives';
    default:
      return 'important study content';
  }
}

export function buildGenerationSources(mode: GenerationMode, text: string, options?: Record<string, unknown>, index?: RAGIndex): RetrievedChunk[] {
  if (text.length < 3500) {
    return buildBalancedDocumentContext(text, 6);
  }

  const count = typeof options?.count === 'number' ? options.count : undefined;
  const focus = String(options?.focus ?? getModeFocus(mode, count));

  if (mode === 'quiz' || mode === 'mcq' || mode === 'flashcards' || mode === 'assignment' || mode === 'exam' || mode === 'practice') {
    return index ? retrieveFromIndex(index, focus, 6) : retrieveRelevantChunks(text, focus, 6);
  }

  return buildBalancedDocumentContext(text, 6);
}

export function buildGenerationContext(mode: GenerationMode, text: string, options?: Record<string, unknown>, index?: RAGIndex) {
  if (text.length < 3500) return text;
  const sources = buildGenerationSources(mode, text, options, index);
  return mode === 'summarize' || mode === 'notes' || mode === 'rephrase' || mode === 'outline'
    ? `Use this balanced cross-section of the document:\n\n${buildRagContext(sources)}`
    : `Use these retrieved sections from the document:\n\n${buildRagContext(sources)}`;
}
