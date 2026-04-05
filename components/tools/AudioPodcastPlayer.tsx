'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟\n])\s+|\n{2,}/)
    .map(s => s.trim())
    .filter(s => s.length > 2);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '');
}

function detectArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function browserSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.speechSynthesis.speak === 'function' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** Filter browser voices to only the pleasant-sounding ones */
function getQualityVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const good = all.filter(v =>
    v.name.includes('Neural') ||
    v.name.includes('Natural') ||
    v.name.includes('Enhanced') ||
    v.name.includes('Premium') ||
    v.name.startsWith('Google') ||
    (v.name.startsWith('Microsoft') && v.name.includes('Online')) ||
    v.name.includes('Samantha') ||
    v.name.includes('Daniel') ||
    v.name.includes('Karen') ||
    v.name.includes('Moira')
  );
  return good.length > 0 ? good : all;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// OpenAI TTS voices with display labels
const OPENAI_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Warm · Female'       },
  { id: 'shimmer', label: 'Shimmer', desc: 'Expressive · Female' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Clear · Neutral'     },
  { id: 'echo',    label: 'Echo',    desc: 'Steady · Male'       },
  { id: 'onyx',    label: 'Onyx',    desc: 'Deep · Male'         },
  { id: 'fable',   label: 'Fable',   desc: 'Storytelling · Male' },
  { id: 'sage',    label: 'Sage',    desc: 'Calm · Neutral'      },
  { id: 'coral',   label: 'Coral',   desc: 'Bright · Female'     },
];

const LOCAL_AR: Record<string, string> = {
  'Study Audio':   'الصوت الدراسي',
  'Play':          'تشغيل',
  'Pause':         'إيقاف مؤقت',
  'Stop':          'إيقاف',
  'Resume':        'استئناف',
  'Speed':         'السرعة',
  'Voice':         'الصوت',
  'Clear':         'مسح',
  'sentences':     'جمل',
  'Ready':         'جاهز',
  'Playing':       'يعمل',
  'Paused':        'متوقف',
  'Done':          'انتهى',
  'Loading…':      'جارٍ التحميل…',
  'AI Voice':      'صوت الذكاء الاصطناعي',
  'Browser Voice': 'صوت المتصفح',
  'Paste or type your study content here…': 'الصق أو اكتب محتواك الدراسي هنا…',
  'Paste notes, summaries, or any study text and listen while you review.':
    'الصق الملاحظات أو الملخصات أو أي نص دراسي واستمع إليه أثناء المراجعة.',
  'of': 'من',
  'Text': 'النص',
  'AI voice is unavailable right now. Switched to browser voice.': 'صوت الذكاء الاصطناعي غير متاح الآن. تم التبديل إلى صوت المتصفح.',
  'Browser speech is not available on this device.': 'النطق عبر المتصفح غير متاح على هذا الجهاز.',
  'AI voice is unavailable right now. Browser speech is also not supported here.': 'صوت الذكاء الاصطناعي غير متاح الآن، كما أن النطق عبر المتصفح غير مدعوم هنا.',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AudioPodcastPlayer({ initialText = '' }: { initialText?: string }) {
  const { t, isRTL } = useI18n(LOCAL_AR);

  const [text, setText] = useState(initialText);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'done'>('idle');
  const [speed, setSpeed] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');

  // Engine: 'openai' uses /api/tts, 'browser' uses Web Speech API
  const [engine, setEngine] = useState<'openai' | 'browser'>('openai');
  const [openaiVoice, setOpenaiVoice] = useState('nova');
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState('');

  // OpenAI playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map()); // idx → blob URL

  // Web Speech fallback
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Shared
  const sentencesRef = useRef<string[]>([]);
  const idxRef = useRef(-1);
  const statusRef = useRef<'idle' | 'loading' | 'playing' | 'paused' | 'done'>('idle');
  const sentenceEls = useRef<(HTMLDivElement | null)[]>([]);

  // ── Init audio element ──────────────────────────────────────────────────

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // ── Load browser voices ─────────────────────────────────────────────────

  useEffect(() => {
    if (!browserSpeechSupported()) return;
    function load() {
      const all = window.speechSynthesis.getVoices();
      if (all.length > 0) setBrowserVoices(getQualityVoices(all));
    }
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const sentences = useMemo(
    () => splitIntoSentences(stripMarkdown(text)),
    [text],
  );

  const activeBrowserVoice = useMemo(() => {
    if (selectedBrowserVoice) return selectedBrowserVoice;
    if (browserVoices.length === 0) return '';
    const isAr = detectArabic(text);
    return (
      (isAr
        ? browserVoices.find(v => v.lang.startsWith('ar'))
        : browserVoices.find(v => v.lang.startsWith('en')))?.name
      ?? browserVoices[0]?.name
      ?? ''
    );
  }, [browserVoices, selectedBrowserVoice, text]);

  function stopAll() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    setErrorMessage('');
    setStatus('idle'); statusRef.current = 'idle';
    setCurrentIdx(-1); idxRef.current = -1;
  }

  function updateText(nextText: string) {
    stopAll();
    setText(nextText);
  }

  // ── Re-parse sentences when text changes ────────────────────────────────

  useEffect(() => {
    sentencesRef.current = sentences;
    sentenceEls.current = sentences.map(() => null);
    // Clear audio cache when text changes
    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    statusRef.current = 'idle';
    idxRef.current = -1;
  }, [sentences]);

  // ── OpenAI TTS fetch ─────────────────────────────────────────────────────

  const fetchSentenceAudio = useCallback(async (idx: number): Promise<string | null> => {
    const cached = audioCacheRef.current.get(idx);
    if (cached) return cached;

    const sents = sentencesRef.current;
    if (idx < 0 || idx >= sents.length) return null;

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sents[idx], voice: openaiVoice }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioCacheRef.current.set(idx, url);
      return url;
    } catch {
      return null;
    }
  }, [openaiVoice]);

  // Pre-fetch next N sentences in background
  const prefetch = useCallback((fromIdx: number, count = 2) => {
    for (let i = fromIdx; i < fromIdx + count; i++) {
      if (!audioCacheRef.current.has(i) && i < sentencesRef.current.length) {
        void fetchSentenceAudio(i);
      }
    }
  }, [fetchSentenceAudio]);

  // ── Playback: OpenAI engine ──────────────────────────────────────────────

  async function playOpenAIAt(idx: number) {
    const sents = sentencesRef.current;
    if (idx >= sents.length) {
      setCurrentIdx(-1); idxRef.current = -1;
      setStatus('done'); statusRef.current = 'done';
      return;
    }

    setStatus('loading'); statusRef.current = 'loading';
    setErrorMessage('');
    setCurrentIdx(idx); idxRef.current = idx;
    setTimeout(() => sentenceEls.current[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);

    const url = await fetchSentenceAudio(idx);

    // If fetch failed, fall back to browser
    if (!url) {
      switchToBrowserOrFail(idx, t('AI voice is unavailable right now. Switched to browser voice.'));
      return;
    }

    // If stopped/paused while loading, abort
    if (statusRef.current !== 'loading') return;

    const audio = audioRef.current;
    if (!audio) return;

    audio.src = url;
    audio.playbackRate = speed;

    setStatus('playing'); statusRef.current = 'playing';

    // Kick off pre-fetch for next sentences
    prefetch(idx + 1);

    audio.onended = () => {
      if (statusRef.current === 'playing') {
        void playOpenAIAt(idxRef.current + 1);
      }
    };

    audio.onerror = () => {
      if (statusRef.current === 'playing') {
        void playOpenAIAt(idxRef.current + 1);
      }
    };

    try {
      await audio.play();
    } catch {
      // Autoplay blocked or error — fall back
      switchToBrowserOrFail(idx, t('AI voice is unavailable right now. Switched to browser voice.'));
    }
  }

  // ── Playback: Browser engine ─────────────────────────────────────────────

  function playBrowserAt(idx: number) {
    if (!browserSpeechSupported()) {
      setErrorMessage(t('Browser speech is not available on this device.'));
      setStatus('idle');
      statusRef.current = 'idle';
      return;
    }
    const synth = window.speechSynthesis;
    const sents = sentencesRef.current;
    if (idx >= sents.length) {
      setCurrentIdx(-1); idxRef.current = -1;
      setStatus('done'); statusRef.current = 'done';
      return;
    }

    const utt = new SpeechSynthesisUtterance(sents[idx]);
    setErrorMessage('');
    utt.rate = speed;
    const voice = synth.getVoices().find(v => v.name === activeBrowserVoice);
    if (voice) utt.voice = voice;

    utt.onstart = () => {
      setCurrentIdx(idx); idxRef.current = idx;
      setStatus('playing'); statusRef.current = 'playing';
      setTimeout(() => sentenceEls.current[idx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
    };
    utt.onend = () => { if (statusRef.current === 'playing') playBrowserAt(idxRef.current + 1); };
    utt.onerror = () => { if (statusRef.current === 'playing') playBrowserAt(idxRef.current + 1); };

    utteranceRef.current = utt;
    synth.speak(utt);
  }

  function switchToBrowserOrFail(idx: number, message: string) {
    if (browserSpeechSupported()) {
      setEngine('browser');
      setErrorMessage(message);
      setStatus('loading');
      statusRef.current = 'loading';
      setTimeout(() => playBrowserAt(idx), 0);
      return;
    }

    setErrorMessage(t('AI voice is unavailable right now. Browser speech is also not supported here.'));
    setStatus('idle');
    statusRef.current = 'idle';
  }

  // ── Unified play/pause/stop ──────────────────────────────────────────────

  function play(fromIdx?: number) {
    const startIdx = fromIdx ?? (status === 'done' ? 0 : Math.max(0, currentIdx < 0 ? 0 : currentIdx));
    setErrorMessage('');
    setStatus('loading'); statusRef.current = 'loading';

    if (engine === 'openai') {
      void playOpenAIAt(startIdx);
    } else {
      if (!browserSpeechSupported()) {
        setErrorMessage(t('Browser speech is not available on this device.'));
        setStatus('idle');
        statusRef.current = 'idle';
        return;
      }
      window.speechSynthesis?.cancel();
      playBrowserAt(startIdx);
    }
  }

  function pause() {
    if (engine === 'openai') {
      audioRef.current?.pause();
    } else {
      window.speechSynthesis?.pause();
    }
    setStatus('paused'); statusRef.current = 'paused';
  }

  function resume() {
    if (engine === 'openai') {
      const audio = audioRef.current;
      if (audio) { audio.playbackRate = speed; void audio.play(); }
    } else {
      window.speechSynthesis?.resume();
    }
    setStatus('playing'); statusRef.current = 'playing';
  }

  // Update speed on flying audio
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Stop on unmount
  useEffect(() => () => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    audioCacheRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const progress = sentences.length > 0 && currentIdx >= 0
    ? ((currentIdx + 1) / sentences.length) * 100 : 0;

  const statusLabel =
    status === 'playing' ? t('Playing') :
    status === 'paused'  ? t('Paused') :
    status === 'loading' ? t('Loading…') :
    status === 'done'    ? t('Done') : t('Ready');

  const isArabicText = detectArabic(text);
  const dir = isArabicText || isRTL ? 'rtl' : 'ltr';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style jsx>{`
        .podcast-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-base);
          font-family: var(--font-sans, system-ui, sans-serif);
        }

        .player-bar {
          flex-shrink: 0;
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-subtle);
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .player-top {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .player-controls { display: flex; align-items: center; gap: 8px; }

        .ctrl-btn {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; border-radius: 50%;
          border: none; cursor: pointer; font-size: 15px;
          transition: background 0.15s, transform 0.1s; flex-shrink: 0;
        }
        .ctrl-btn:active { transform: scale(0.93); }
        .ctrl-btn.primary {
          background: var(--primary); color: #fff;
          width: 44px; height: 44px; font-size: 18px;
          box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 35%, transparent);
        }
        .ctrl-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .ctrl-btn.primary:not(:disabled):hover { filter: brightness(1.1); }
        .ctrl-btn.secondary {
          background: var(--surface); color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }
        .ctrl-btn.secondary:hover { background: var(--border-subtle); }
        .ctrl-btn.secondary:disabled { opacity: 0.4; cursor: not-allowed; }

        .player-meta {
          display: flex; align-items: center; gap: 8px;
          flex: 1; min-width: 0; flex-wrap: wrap;
        }

        .status-badge {
          font-size: 11px; font-weight: 700; padding: 3px 9px;
          border-radius: 99px; background: var(--surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary); white-space: nowrap;
        }
        .status-badge.playing {
          background: color-mix(in srgb, var(--primary) 12%, transparent);
          border-color: color-mix(in srgb, var(--primary) 30%, transparent);
          color: var(--primary);
        }
        .status-badge.loading {
          background: color-mix(in srgb, #f59e0b 10%, transparent);
          border-color: color-mix(in srgb, #f59e0b 28%, transparent);
          color: #b45309;
        }
        .status-badge.paused {
          background: color-mix(in srgb, #f59e0b 10%, transparent);
          border-color: color-mix(in srgb, #f59e0b 28%, transparent);
          color: #b45309;
        }
        .status-badge.done {
          background: color-mix(in srgb, #22c55e 10%, transparent);
          border-color: color-mix(in srgb, #22c55e 28%, transparent);
          color: #16a34a;
        }

        .engine-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px;
          border-radius: 99px; white-space: nowrap;
          background: color-mix(in srgb, var(--primary) 8%, transparent);
          border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
          color: var(--primary); cursor: pointer; letter-spacing: 0.03em;
        }
        .engine-badge:hover { filter: brightness(1.08); }

        .sentence-count { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

        .player-selects {
          display: flex; align-items: center; gap: 8px;
          flex-wrap: wrap; margin-left: auto;
        }
        [dir='rtl'] .player-selects { margin-left: 0; margin-right: auto; }

        .select-group {
          display: flex; align-items: center; gap: 5px;
          font-size: 12px; color: var(--text-secondary);
        }

        .player-select {
          font-size: 12px; padding: 4px 8px; border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--surface); color: var(--text-primary);
          cursor: pointer; max-width: 180px;
        }

        .progress-wrap {
          height: 4px; border-radius: 2px;
          background: var(--border-subtle); overflow: hidden;
        }
        .progress-fill {
          height: 100%; border-radius: 2px;
          background: linear-gradient(90deg, var(--primary), var(--accent, #7c53e8));
          transition: width 0.3s ease;
        }
        .progress-fill.loading-pulse {
          width: 100% !important;
          animation: pulse-bar 1.2s ease-in-out infinite;
          background: linear-gradient(90deg, var(--border-subtle), var(--primary), var(--border-subtle));
          background-size: 200% 100%;
        }
        @keyframes pulse-bar {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }

        .podcast-body { display: flex; flex: 1; min-height: 0; }

        .text-panel {
          width: 320px; flex-shrink: 0;
          border-right: 1px solid var(--border-subtle);
          display: flex; flex-direction: column;
          background: var(--bg-elevated);
        }
        [dir='rtl'] .text-panel { border-right: none; border-left: 1px solid var(--border-subtle); }

        .text-panel-header {
          padding: 12px 14px 8px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: var(--text-muted); display: flex;
          align-items: center; justify-content: space-between;
        }

        .clear-btn {
          font-size: 11px; padding: 2px 8px; border-radius: 5px;
          border: 1px solid var(--border-subtle);
          background: transparent; color: var(--text-muted); cursor: pointer;
        }
        .clear-btn:hover { color: var(--text-primary); background: var(--surface); }

        .text-input {
          flex: 1; resize: none; border: none; outline: none;
          background: transparent; color: var(--text-primary);
          font-size: 13px; line-height: 1.65;
          padding: 8px 14px 14px; font-family: inherit;
        }
        .text-input::placeholder { color: var(--text-muted); }

        .sentences-panel {
          flex: 1; min-width: 0; overflow-y: auto;
          padding: 16px 20px; display: flex;
          flex-direction: column; gap: 6px;
        }

        .sentence-row {
          padding: 9px 13px; border-radius: 8px;
          font-size: 14px; line-height: 1.65;
          color: var(--text-secondary); cursor: pointer;
          border: 1.5px solid transparent;
          transition: background 0.12s, border-color 0.12s, color 0.12s;
        }
        .sentence-row:hover { background: var(--surface); color: var(--text-primary); }
        .sentence-row.active {
          background: color-mix(in srgb, var(--primary) 10%, transparent);
          border-color: color-mix(in srgb, var(--primary) 30%, transparent);
          color: var(--text-primary); font-weight: 500;
        }
        .sentence-row.loading-row {
          background: color-mix(in srgb, #f59e0b 8%, transparent);
          border-color: color-mix(in srgb, #f59e0b 25%, transparent);
          color: var(--text-primary);
        }

        .empty-hint {
          text-align: center; color: var(--text-muted);
          font-size: 13px; padding: 48px 24px; line-height: 1.7;
        }

        @media (max-width: 680px) {
          .podcast-body { flex-direction: column; }
          .text-panel {
            width: 100%; border-right: none;
            border-bottom: 1px solid var(--border-subtle);
            max-height: 200px;
          }
          [dir='rtl'] .text-panel { border-left: none; }
          .player-selects { margin-left: 0; }
          .player-select { max-width: 130px; }
          .sentences-panel { padding: 12px; }
        }
      `}</style>

      <div className="podcast-root" dir={dir}>
        {/* ── Player bar ── */}
        <div className="player-bar">
          <div className="player-top">
            {/* Transport controls */}
            <div className="player-controls">
              {(status === 'idle' || status === 'done') && (
                <button className="ctrl-btn primary" onClick={() => play()} disabled={sentences.length === 0} aria-label={t('Play')}>▶</button>
              )}
              {status === 'loading' && (
                <button className="ctrl-btn primary" disabled aria-label={t('Loading…')} style={{ fontSize: 13 }}>…</button>
              )}
              {status === 'playing' && (
                <button className="ctrl-btn primary" onClick={pause} aria-label={t('Pause')}>⏸</button>
              )}
              {status === 'paused' && (
                <button className="ctrl-btn primary" onClick={resume} aria-label={t('Resume')}>▶</button>
              )}
              <button
                className="ctrl-btn secondary"
                onClick={stopAll}
                disabled={status === 'idle'}
                aria-label={t('Stop')}
              >⏹</button>
            </div>

            {/* Status + engine badge */}
            <div className="player-meta">
              <span className={`status-badge ${status}`}>{statusLabel}</span>
              <button
                className="engine-badge"
                onClick={() => {
                  if (engine === 'openai' && !browserSpeechSupported()) {
                    setErrorMessage(t('Browser speech is not available on this device.'));
                    return;
                  }
                  setErrorMessage('');
                  setEngine(e => e === 'openai' ? 'browser' : 'openai');
                }}
                title={engine === 'openai' ? 'Using AI voice (OpenAI TTS) — click to switch to browser voice' : 'Using browser voice — click to switch to AI voice'}
              >
                {engine === 'openai' ? `✦ ${t('AI Voice')}` : `🔊 ${t('Browser Voice')}`}
              </button>
              {sentences.length > 0 && currentIdx >= 0 && (
                <span className="sentence-count">{currentIdx + 1} {t('of')} {sentences.length} {t('sentences')}</span>
              )}
              {sentences.length > 0 && currentIdx < 0 && (
                <span className="sentence-count">{sentences.length} {t('sentences')}</span>
              )}
            </div>

            {/* Controls: speed + voice */}
            <div className="player-selects">
              <div className="select-group">
                <span>{t('Speed')}</span>
                <select className="player-select" value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{ width: 68 }}>
                  {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
                </select>
              </div>

              {engine === 'openai' ? (
                <div className="select-group">
                  <span>{t('Voice')}</span>
                  <select className="player-select" value={openaiVoice} onChange={e => setOpenaiVoice(e.target.value)}>
                    {OPENAI_VOICES.map(v => (
                      <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>
                    ))}
                  </select>
                </div>
              ) : (
                browserVoices.length > 0 ? (
                  <div className="select-group">
                    <span>{t('Voice')}</span>
                    <select className="player-select" value={activeBrowserVoice} onChange={e => setSelectedBrowserVoice(e.target.value)}>
                      {browserVoices.map(v => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="progress-wrap">
            <div className={`progress-fill${status === 'loading' ? ' loading-pulse' : ''}`} style={{ width: status === 'loading' ? undefined : `${progress}%` }} />
          </div>
          {errorMessage ? (
            <div className="status-badge paused" role="status" aria-live="polite">{errorMessage}</div>
          ) : null}
        </div>

        {/* ── Body ── */}
        <div className="podcast-body">
          {/* Text input */}
          <div className="text-panel">
            <div className="text-panel-header">
              <span>Text</span>
              {text && <button className="clear-btn" onClick={() => updateText('')}>{t('Clear')}</button>}
            </div>
            <textarea
              className="text-input"
              value={text}
              onChange={e => updateText(e.target.value)}
              placeholder={t('Paste or type your study content here…')}
              dir={dir}
              spellCheck={false}
            />
          </div>

          {/* Sentence list */}
          <div className="sentences-panel">
            {sentences.length === 0 ? (
              <div className="empty-hint">{t('Paste notes, summaries, or any study text and listen while you review.')}</div>
            ) : (
              sentences.map((s, i) => (
                <div
                  key={i}
                  ref={el => { sentenceEls.current[i] = el; }}
                  className={`sentence-row${currentIdx === i && status === 'loading' ? ' loading-row' : currentIdx === i ? ' active' : ''}`}
                  dir={detectArabic(s) ? 'rtl' : dir}
                  onClick={() => { stopAll(); setTimeout(() => play(i), 50); }}
                  title="Click to start from here"
                >
                  {s}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
