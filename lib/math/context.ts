import type { MathContext } from './types';

export const MATH_CONTEXT_KEY = 'kivora_math_context';

const MAX_CONTEXT_LENGTH = 30000;

function getStorage() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export function readMathContext(): MathContext | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(MATH_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MathContext>;
    if (!parsed.fileId || !parsed.fileName) return null;
    return {
      fileId: parsed.fileId,
      fileName: parsed.fileName,
      extractedText: String(parsed.extractedText || ''),
      sourceFolderId: parsed.sourceFolderId ?? null,
      sourceTopicId: parsed.sourceTopicId ?? null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeMathContext(context: Omit<MathContext, 'updatedAt'>) {
  const storage = getStorage();
  if (!storage) return;

  const payload: MathContext = {
    ...context,
    extractedText: context.extractedText.slice(0, MAX_CONTEXT_LENGTH),
    updatedAt: new Date().toISOString(),
  };

  storage.setItem(MATH_CONTEXT_KEY, JSON.stringify(payload));
}

export function clearMathContext() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(MATH_CONTEXT_KEY);
}
