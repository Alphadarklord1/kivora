'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { consumePodcastHandoff } from '@/lib/podcast/handoff';

type Style = 'summary' | 'deep-dive' | 'qa';
type PlayerState = 'idle' | 'playing' | 'paused';

// ── Voice classification ───────────────────────────────────────────────────
// macOS / iOS ship a long list of novelty voices ("Albert", "Trinoids",
// "Bubbles" etc) that are useless for a study podcast. The raw voice name
// the OS exposes is also unhelpful — "Microsoft Zira Desktop - English
// (United States)" tells the student nothing about how it sounds. We
// classify each voice into a clean shape: gender, region, quality tier,
// plus a single-line label the user can read at a glance.

const NOVELTY_NAMES = [
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos',
  'Deranged', 'Good News', 'Hysterical', 'Pipe Organ', 'Trinoids',
  'Whisper', 'Zarvox', 'Jester', 'Junior', 'Princess', 'Ralph', 'Kathy',
  'Bruce', 'Bahh', 'Wobble', 'Organ',
];

const FEMALE_NAMES = /^(Samantha|Karen|Moira|Tessa|Allison|Ava|Susan|Zira|Aria|Jenny|Catherine|Sonia|Libby|Olivia|Veena|Fiona|Vicki|Victoria|Serena|Rishi|Susan|Kate|Helena|Monica|Anna|Eva|Yelda|Yuna|Nathalie|Alice)$/i;
const MALE_NAMES   = /^(Daniel|Tom|Aaron|Fred|Alex|David|Mark|Guy|Ryan|Brandon|Christopher|Eric|Jacob|Roger|Albert|Jorge|Carlos|Diego|Junior|Bruce)$/i;

function isEnglish(v: SpeechSynthesisVoice): boolean {
  return v.lang.toLowerCase().startsWith('en');
}

function isNovelty(v: SpeechSynthesisVoice): boolean {
  return NOVELTY_NAMES.some((n) => v.name.includes(n));
}

function isPremium(v: SpeechSynthesisVoice): boolean {
  return /(premium|enhanced|neural|natural|google|wavenet|online)/i.test(v.name);
}

function detectGender(name: string): 'Female' | 'Male' | '' {
  // Strip "Microsoft …", "(United States)", "(Premium)" decoration so the
  // heuristic only sees the actual voice name.
  const core = name
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/\s*Desktop\s*$/i, '')
    .replace(/\s*Online\s*$/i, '')
    .replace(/\s*-\s*English.*$/i, '')
    .trim()
    .split(/\s+/)[0];
  if (FEMALE_NAMES.test(core)) return 'Female';
  if (MALE_NAMES.test(core)) return 'Male';
  if (/female|woman/i.test(name)) return 'Female';
  if (/male|man/i.test(name)) return 'Male';
  return '';
}

function detectRegion(lang: string): string {
  const code = (lang.split('-')[1] ?? '').toUpperCase();
  return ({ US: 'US', GB: 'UK', AU: 'AU', IN: 'India', CA: 'Canada', IE: 'Ireland', NZ: 'NZ', ZA: 'SA' } as Record<string, string>)[code] ?? code ?? 'EN';
}

interface ClassifiedVoice {
  voice:   SpeechSynthesisVoice;
  label:   string;
  gender:  string;
  region:  string;
  premium: boolean;
  recommended: boolean;
}

function classify(v: SpeechSynthesisVoice, isRecommendation: boolean): ClassifiedVoice {
  const gender  = detectGender(v.name);
  const region  = detectRegion(v.lang);
  const premium = isPremium(v);
  const tier    = premium ? '★ Natural' : 'Standard';
  const label   = `${gender || '—'} · ${region} · ${tier}${isRecommendation ? '   (recommended)' : ''}`;
  return { voice: v, label, gender, region, premium, recommended: isRecommendation };
}

export default function PodcastPage() {
  useEffect(() => { document.title = 'Audio Podcast — Kivora'; }, []);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [handoffMessage, setHandoffMessage] = useState('');

  // Pick up content sent over from a Workspace file or a Library item.
  // Consumed once — a refresh starts blank.
  useEffect(() => {
    const handoff = consumePodcastHandoff();
    if (!handoff) return;
    setNotes(handoff.content);
    if (handoff.title) setTitle(handoff.title);
    setHandoffMessage(handoff.title ? `Loaded "${handoff.title}"` : 'Loaded content from Kivora');
    const t = window.setTimeout(() => setHandoffMessage(''), 4000);
    return () => window.clearTimeout(t);
  }, []);
  const [style, setStyle] = useState<Style>('summary');
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [progress, setProgress] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [showAllVoices, setShowAllVoices] = useState(false);
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wordCountRef = useRef(0);
  const spokenWordsRef = useRef(0);

  useEffect(() => {
    const load = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length) {
        setVoices(available);
      }
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // Build the actual list shown in the dropdown. Default behaviour:
  //   - English only
  //   - No novelty / decorative voices (Albert, Trinoids, Bubbles…)
  //   - Premium / Natural / Neural ones float to the top with a ★
  //   - Best one is auto-selected on first load
  // The user can flip "Show all voices" to see the full OS list if they
  // want a non-English voice or a quirky one.
  const classifiedVoices = useMemo<ClassifiedVoice[]>(() => {
    if (voices.length === 0) return [];
    const filtered = voices.filter((v) => {
      if (showAllVoices) return true;
      return isEnglish(v) && !isNovelty(v);
    });
    // Pick the recommended voice — best-quality natural female-leaning
    // English voice tends to be the friendliest default for narration.
    const ranked = [...filtered].sort((a, b) => {
      const score = (v: SpeechSynthesisVoice) =>
        (isPremium(v) ? 4 : 0)
        + (detectGender(v.name) === 'Female' ? 2 : 0)
        + (v.lang === 'en-US' ? 1 : v.lang === 'en-GB' ? 0.5 : 0);
      return score(b) - score(a);
    });
    const recommendedName = ranked[0]?.name ?? '';
    return ranked.map((v) => classify(v, v.name === recommendedName));
  }, [voices, showAllVoices]);

  // Auto-select the recommended voice once the list lands. Don't override
  // a manual selection the user has already made.
  useEffect(() => {
    if (selectedVoice) return;
    const recommended = classifiedVoices.find((v) => v.recommended);
    if (recommended) setSelectedVoice(recommended.voice.name);
  }, [classifiedVoices, selectedVoice]);

  function previewSelectedVoice(voiceName: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    // Cancel any currently-playing preview / podcast playback.
    window.speechSynthesis.cancel();
    const v = voices.find((x) => x.name === voiceName);
    if (!v) return;
    const utter = new SpeechSynthesisUtterance(
      'This is what your podcast will sound like with this voice.',
    );
    utter.voice = v;
    utter.rate = speed;
    setPreviewVoice(voiceName);
    utter.onend = () => setPreviewVoice(null);
    utter.onerror = () => setPreviewVoice(null);
    window.speechSynthesis.speak(utter);
  }

  async function generate() {
    if (notes.trim().length < 20) {
      setError('Please enter at least 20 characters of study notes.');
      return;
    }
    setError('');
    setLoading(true);
    setScript('');
    setProgress(0);
    setPlayerState('idle');
    window.speechSynthesis.cancel();

    try {
      const res = await fetch('/api/podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: notes, title: title || undefined, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate podcast');
      setScript(data.script);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function buildUtterance(text: string) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = speed;
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) utter.voice = voice;
    wordCountRef.current = text.split(/\s+/).filter(Boolean).length;
    spokenWordsRef.current = 0;
    utter.onboundary = (e) => {
      if (e.name === 'word') {
        spokenWordsRef.current += 1;
        setProgress(Math.min(100, Math.round((spokenWordsRef.current / wordCountRef.current) * 100)));
      }
    };
    utter.onend = () => {
      setPlayerState('idle');
      setProgress(100);
    };
    utter.onerror = () => setPlayerState('idle');
    return utter;
  }

  function play() {
    if (!script) return;
    window.speechSynthesis.cancel();
    spokenWordsRef.current = 0;
    setProgress(0);
    const utter = buildUtterance(script);
    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
    setPlayerState('playing');
  }

  function pause() {
    window.speechSynthesis.pause();
    setPlayerState('paused');
  }

  function resume() {
    window.speechSynthesis.resume();
    setPlayerState('playing');
  }

  function stop() {
    window.speechSynthesis.cancel();
    setPlayerState('idle');
    setProgress(0);
    spokenWordsRef.current = 0;
  }

  return (
    <div className="podcast-page">
      <h1 className="page-title">Audio Podcast</h1>
      <p className="page-sub">Turn your study notes into a spoken podcast episode.</p>

      {handoffMessage && (
        <div
          role="status"
          style={{
            margin: '8px 0 14px',
            padding: '10px 14px',
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--accent, #4f8eff) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent, #4f8eff) 30%, transparent)',
            color: 'var(--text)',
            fontSize: 'var(--text-sm)',
          }}
        >
          ✨ {handoffMessage} — ready to generate.
        </div>
      )}

      <div className="card">
        <label className="field-label">Notes</label>
        <textarea
          className="notes-input"
          placeholder="Paste your study notes here..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={6}
        />

        <div className="row-fields">
          <div className="field">
            <label className="field-label">Episode title (optional)</label>
            <input
              className="text-input"
              placeholder="e.g. Chapter 4: Photosynthesis"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Style</label>
            <select className="select-input" value={style} onChange={e => setStyle(e.target.value as Style)}>
              <option value="summary">Summary</option>
              <option value="deep-dive">Deep Dive</option>
              <option value="qa">Q &amp; A</option>
            </select>
          </div>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <button className="btn-generate" onClick={generate} disabled={loading}>
          {loading ? 'Generating…' : 'Generate Podcast'}
        </button>
      </div>

      {script && (
        <div className="card player-card">
          <div className="player-controls">
            {playerState === 'idle' && (
              <button className="ctrl-btn primary" onClick={play}>▶ Play</button>
            )}
            {playerState === 'playing' && (
              <button className="ctrl-btn" onClick={pause}>⏸ Pause</button>
            )}
            {playerState === 'paused' && (
              <button className="ctrl-btn primary" onClick={resume}>▶ Resume</button>
            )}
            {playerState !== 'idle' && (
              <button className="ctrl-btn danger" onClick={stop}>■ Stop</button>
            )}
            {playerState !== 'idle' && (
              <button className="ctrl-btn" onClick={play}>↺ Restart</button>
            )}
          </div>

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-label">{progress}%</p>

          <div className="voice-row">
            {classifiedVoices.length > 0 && (
              <div className="field" style={{ flex: 2 }}>
                <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <span>Voice</span>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showAllVoices}
                      onChange={(e) => setShowAllVoices(e.target.checked)}
                      style={{ margin: 0 }}
                    />
                    Show all voices
                  </label>
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                  <select
                    className="select-input"
                    value={selectedVoice}
                    onChange={e => setSelectedVoice(e.target.value)}
                    disabled={playerState === 'playing'}
                    style={{ flex: 1 }}
                  >
                    {classifiedVoices.map(({ voice, label, recommended }) => (
                      <option key={voice.name} value={voice.name}>
                        {recommended ? '★ ' : ''}{label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      if (previewVoice === selectedVoice) {
                        window.speechSynthesis.cancel();
                        setPreviewVoice(null);
                      } else if (selectedVoice) {
                        previewSelectedVoice(selectedVoice);
                      }
                    }}
                    disabled={!selectedVoice || playerState === 'playing'}
                    title="Hear a one-line sample of this voice"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {previewVoice === selectedVoice ? '⏹ Stop' : '🔊 Preview'}
                  </button>
                </div>
                {!showAllVoices && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    Filtered to natural English voices. Tick &ldquo;Show all voices&rdquo; for the full OS list.
                  </div>
                )}
              </div>
            )}
            <div className="field">
              <label className="field-label">Speed: {speed}×</label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={e => setSpeed(parseFloat(e.target.value))}
                disabled={playerState === 'playing'}
                className="speed-slider"
              />
            </div>
          </div>

          <div className="script-box">
            <h3 className="script-heading">Script</h3>
            <p className="script-text">{script}</p>
          </div>
        </div>
      )}

      <style jsx>{`
        .podcast-page {
          max-width: 760px;
          margin: 0 auto;
          padding: var(--space-6) var(--space-4);
        }
        .page-title {
          font-size: var(--font-xl, 22px);
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 var(--space-1);
        }
        .page-sub {
          color: var(--text-secondary);
          margin: 0 0 var(--space-5);
          font-size: var(--font-sm);
        }
        .card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          margin-bottom: var(--space-4);
        }
        .field-label {
          display: block;
          font-size: var(--font-sm);
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: var(--space-1);
        }
        .notes-input {
          width: 100%;
          resize: vertical;
          font-family: inherit;
          font-size: var(--font-sm);
          color: var(--text-primary);
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          box-sizing: border-box;
          margin-bottom: var(--space-4);
        }
        .notes-input:focus {
          outline: none;
          border-color: var(--primary);
        }
        .row-fields {
          display: flex;
          gap: var(--space-4);
          margin-bottom: var(--space-4);
        }
        .field {
          flex: 1;
        }
        .text-input, .select-input {
          width: 100%;
          font-family: inherit;
          font-size: var(--font-sm);
          color: var(--text-primary);
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          box-sizing: border-box;
        }
        .text-input:focus, .select-input:focus {
          outline: none;
          border-color: var(--primary);
        }
        .error-msg {
          color: var(--error, #e53e3e);
          font-size: var(--font-sm);
          margin-bottom: var(--space-3);
        }
        .btn-generate {
          background: var(--primary);
          color: #fff;
          border: none;
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-5);
          font-size: var(--font-sm);
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-generate:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-generate:hover:not(:disabled) {
          opacity: 0.88;
        }
        .player-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .player-controls {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }
        .ctrl-btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          background: var(--bg-base);
          color: var(--text-primary);
          font-size: var(--font-sm);
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }
        .ctrl-btn.primary {
          background: var(--primary);
          color: #fff;
          border-color: var(--primary);
        }
        .ctrl-btn.danger {
          background: transparent;
          color: var(--error, #e53e3e);
          border-color: var(--error, #e53e3e);
        }
        .ctrl-btn:hover {
          opacity: 0.85;
        }
        .progress-bar {
          height: 6px;
          background: var(--bg-muted, var(--border-subtle));
          border-radius: 99px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--primary);
          border-radius: 99px;
          transition: width 0.3s ease;
        }
        .progress-label {
          font-size: var(--font-xs, 11px);
          color: var(--text-secondary);
          margin: 0;
          text-align: right;
        }
        .voice-row {
          display: flex;
          gap: var(--space-4);
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .speed-slider {
          width: 100%;
          accent-color: var(--primary);
        }
        .script-box {
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-4);
        }
        .script-heading {
          font-size: var(--font-sm);
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 var(--space-2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .script-text {
          font-size: var(--font-sm);
          color: var(--text-primary);
          line-height: 1.7;
          white-space: pre-wrap;
          margin: 0;
        }
        @media (max-width: 560px) {
          .row-fields, .voice-row { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
