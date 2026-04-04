/**
 * YouTube transcript extraction.
 *
 * Fetches the auto-generated or manual captions for a YouTube video
 * by parsing the ytInitialPlayerResponse embedded in the page HTML.
 * No API key required — works for any publicly accessible video.
 */

export interface YouTubeTranscriptResult {
  videoId: string;
  title: string;
  channelName: string;
  transcript: string;
  wordCount: number;
  durationSeconds: number | null;
}

/** Extract the YouTube video ID from a URL (watch?v=ID or youtu.be/ID). */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1).split('/')[0];
      return id.length === 11 ? id : null;
    }
    if (u.hostname.includes('youtube.com')) {
      // /watch?v=ID, /shorts/ID, /embed/ID, /live/ID
      const v = u.searchParams.get('v');
      if (v?.length === 11) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const after = parts.findIndex(p => ['shorts', 'embed', 'live', 'v'].includes(p));
      if (after >= 0 && parts[after + 1]?.length === 11) return parts[after + 1];
    }
  } catch {
    // invalid URL
  }
  return null;
}

export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Fetch and parse the caption track XML from YouTube.
 * Returns plain text (no timestamps).
 */
async function fetchCaptionTrackText(trackUrl: string): Promise<string> {
  const res = await fetch(trackUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KivoraBot/1.0; +https://kivora.app)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Caption track fetch failed (${res.status})`);
  const xml = await res.text();

  // Parse <text start="..." dur="...">...content...</text> entries
  const textParts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m =>
    m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, '') // strip inner tags like <b>, <i>
      .trim(),
  ).filter(Boolean);

  // Join words, collapsing duplicate adjacent lines (YouTube sometimes repeats)
  const deduped: string[] = [];
  for (const part of textParts) {
    if (deduped[deduped.length - 1] !== part) deduped.push(part);
  }
  return deduped.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Main entry point: fetch the YouTube page, extract player response,
 * find English captions, and return the transcript as plain text.
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<YouTubeTranscriptResult> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!pageRes.ok) throw new Error(`YouTube page fetch failed (${pageRes.status})`);
  const html = await pageRes.text();

  // Extract ytInitialPlayerResponse JSON
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*(?:var|const|let)\s+\w+|<\/script>)/);
  if (!playerMatch) throw new Error('Could not find player data on this YouTube page. The video may be age-restricted or region-locked.');

  let playerData: Record<string, unknown>;
  try {
    playerData = JSON.parse(playerMatch[1]) as Record<string, unknown>;
  } catch {
    throw new Error('Could not parse YouTube player data.');
  }

  // Extract video title
  const videoDetails = playerData.videoDetails as Record<string, unknown> | undefined;
  const title = typeof videoDetails?.title === 'string' ? videoDetails.title : 'YouTube Video';
  const channelName = typeof videoDetails?.author === 'string' ? videoDetails.author : '';
  const durationStr = typeof videoDetails?.lengthSeconds === 'string' ? videoDetails.lengthSeconds : null;
  const durationSeconds = durationStr ? parseInt(durationStr, 10) : null;

  // Find caption tracks
  type CaptionTrack = { baseUrl?: string; languageCode?: string; name?: { simpleText?: string }; kind?: string };
  const captions = playerData.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } | undefined;
  const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

  if (!tracks.length) {
    throw new Error('This video has no captions available. Try a video with auto-generated or manual subtitles.');
  }

  // Prefer English manual captions, then English auto-generated, then first available
  const englishManual = tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr');
  const englishAuto   = tracks.find(t => t.languageCode?.startsWith('en') && t.kind === 'asr');
  const track = englishManual ?? englishAuto ?? tracks[0];

  if (!track.baseUrl) throw new Error('Could not find a usable caption track URL.');

  const transcript = await fetchCaptionTrackText(track.baseUrl);
  if (!transcript) throw new Error('Caption track was empty.');

  return {
    videoId,
    title,
    channelName,
    transcript,
    wordCount: transcript.split(/\s+/).length,
    durationSeconds,
  };
}
