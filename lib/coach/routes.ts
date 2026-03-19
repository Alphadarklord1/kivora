export type CoachPanel = 'review' | 'manage';

type SearchParamsInput = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toQueryString(searchParams: SearchParamsInput) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (typeof value === 'string') {
      query.set(key, value);
    }
  }
  return query.toString();
}

export function buildCoachUrl(options: {
  setId?: string | null;
  panel?: CoachPanel | null;
  imported?: boolean | null;
  importUrl?: string | null;
}) {
  const query = new URLSearchParams();
  if (options.setId) query.set('set', options.setId);
  if (options.panel) query.set('panel', options.panel);
  if (options.imported) query.set('imported', '1');
  if (options.importUrl) query.set('importUrl', options.importUrl);
  const serialized = query.toString();
  return serialized ? `/coach?${serialized}` : '/coach';
}

export function buildCoachHomeRedirect(searchParams: SearchParamsInput) {
  const query = toQueryString(searchParams);
  return query ? `/coach?${query}` : '/coach';
}

export function buildCoachLegacySetRedirect(deckId: string, searchParams: SearchParamsInput) {
  const mode = firstParam(searchParams.mode);
  const imported = firstParam(searchParams.imported) === '1';
  const importUrl = firstParam(searchParams.importUrl) ?? null;
  return buildCoachUrl({
    setId: deckId,
    panel: mode === 'review' ? 'review' : 'manage',
    imported,
    importUrl,
  });
}
