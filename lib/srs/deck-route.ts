export type DeckStudyPhase = 'review' | 'stats' | 'import' | 'test' | 'write' | 'match' | 'learn';

const DECK_MODE_MAP: Record<string, DeckStudyPhase> = {
  review: 'review',
  stats: 'stats',
  import: 'import',
  test: 'test',
  write: 'write',
  match: 'match',
  learn: 'learn',
};

export function getDeckStudyPhaseFromMode(mode: string | null | undefined): DeckStudyPhase | null {
  if (!mode) return null;
  return DECK_MODE_MAP[mode] ?? null;
}
