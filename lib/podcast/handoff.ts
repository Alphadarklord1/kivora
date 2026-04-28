/**
 * Cross-route handoff for the Audio Podcast page.
 *
 * Used when a file (Workspace → Files) or a Library item is sent to
 * `/podcast` for narration. The payload is too large for a URL search
 * param, so we use sessionStorage and consume it on mount so a refresh
 * doesn't re-load stale content.
 */
const KEY = 'kivora-podcast-handoff';

export interface PodcastHandoff {
  title?: string;
  content: string;
}

export function stashPodcastHandoff(payload: PodcastHandoff): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage may be disabled (private mode) or full — silently skip;
    // the user lands on /podcast with empty fields and can paste manually.
  }
}

export function consumePodcastHandoff(): PodcastHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as PodcastHandoff;
    if (typeof parsed?.content !== 'string' || !parsed.content.trim()) return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      content: parsed.content,
    };
  } catch {
    return null;
  }
}
