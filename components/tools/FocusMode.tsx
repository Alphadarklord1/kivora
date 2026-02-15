'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

type NoiseType = 'white' | 'brown';

export function FocusMode() {
  const { t } = useI18n({
    'Focus session completed': 'اكتملت جلسة التركيز',
    'Focus Mode': 'وضع التركيز',
    'Stay on track with sessions, noise, and streaks.': 'حافظ على المسار مع الجلسات والضوضاء وسلسلة الأيام.',
    'Streak: {count} days': 'السلسلة: {count} يوم',
    'Pause': 'إيقاف مؤقت',
    'Start': 'ابدأ',
    'Reset': 'إعادة ضبط',
    'Noise': 'الضوضاء',
    'White or brown noise to block distractions.': 'ضوضاء بيضاء أو بنية لحجب المشتتات.',
    'White': 'بيضاء',
    'Brown': 'بنية',
    'Noise On': 'تشغيل الضوضاء',
    'Noise Off': 'إيقاف الضوضاء',
    'Volume': 'مستوى الصوت',
  });
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [noiseOn, setNoiseOn] = useState(false);
  const [noiseType, setNoiseType] = useState<NoiseType>('white');
  const [volume, setVolume] = useState(0.3);
  const [streak, setStreak] = useState(0);
  const audioRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const totalSeconds = 25 * 60;
  const remaining = minutes * 60 + seconds;
  const progress = useMemo(() => Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100), [remaining, totalSeconds]);

  const recordSession = useCallback(async () => {
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'focus',
          content: t('Focus session completed'),
          metadata: { minutes: 25, completedAt: new Date().toISOString() },
        }),
      });
      setStreak(prev => prev + 1);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSeconds(prev => {
        if (prev > 0) return prev - 1;
        setMinutes(m => {
          if (m > 0) return m - 1;
          setRunning(false);
          void recordSession();
          return 0;
        });
        return 59;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, recordSession]);

  useEffect(() => {
    fetch('/api/library', { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then((items: Array<{ mode: string; metadata?: { completedAt?: string } }>) => {
        const sessions = items.filter(i => i.mode === 'focus');
        const dates = sessions
          .map(s => s.metadata?.completedAt)
          .filter(Boolean)
          .map(date => new Date(date as string).toDateString());
        const unique = Array.from(new Set(dates)).sort();
        let currentStreak = 0;
        const today = new Date();
        for (let i = 0; i < 365; i++) {
          const check = new Date(today);
          check.setDate(today.getDate() - i);
          const key = check.toDateString();
          if (unique.includes(key)) currentStreak++;
          else if (i > 0) break;
        }
        setStreak(currentStreak);
      })
      .catch(() => setStreak(0));
  }, []);

  const startNoise = useCallback(() => {
    if (audioRef.current) return;
    const ctx = new AudioContext();
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (noiseType === 'brown') {
        lastOut = (lastOut + (0.02 * white)) / 1.02;
        data[i] = lastOut * 3.5;
      } else {
        data[i] = white;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(ctx.destination);
    source.start();
    audioRef.current = ctx;
    noiseRef.current = source;
    gainRef.current = gain;
  }, [noiseType, volume]);

  const stopNoise = useCallback(() => {
    noiseRef.current?.stop();
    audioRef.current?.close();
    noiseRef.current = null;
    audioRef.current = null;
    gainRef.current = null;
  }, []);

  useEffect(() => {
    if (noiseOn) startNoise();
    else stopNoise();
    return () => stopNoise();
  }, [noiseOn, startNoise, stopNoise]);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  const reset = () => {
    setMinutes(25);
    setSeconds(0);
    setRunning(false);
  };

  return (
    <div className="focus-mode">
      <div className="focus-card">
        <div>
          <h3>{t('Focus Mode')}</h3>
          <p>{t('Stay on track with sessions, noise, and streaks.')}</p>
        </div>
        <div className="streak">🔥 {t('Streak: {count} days', { count: streak })}</div>
      </div>

      <div className="timer-card">
        <div className="time">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</div>
        <div className="bar"><span style={{ width: `${progress}%` }} /></div>
        <div className="actions">
          <button className="btn" onClick={() => setRunning(prev => !prev)}>{running ? t('Pause') : t('Start')}</button>
          <button className="btn secondary" onClick={reset}>{t('Reset')}</button>
        </div>
      </div>

      <div className="noise-card">
        <div>
          <h4>{t('Noise')}</h4>
          <p>{t('White or brown noise to block distractions.')}</p>
        </div>
        <div className="noise-controls">
          <button className={`btn ${noiseType === 'white' ? '' : 'secondary'}`} onClick={() => setNoiseType('white')}>{t('White')}</button>
          <button className={`btn ${noiseType === 'brown' ? '' : 'secondary'}`} onClick={() => setNoiseType('brown')}>{t('Brown')}</button>
          <button className={`btn ${noiseOn ? '' : 'secondary'}`} onClick={() => setNoiseOn(prev => !prev)}>
            {noiseOn ? t('Noise On') : t('Noise Off')}
          </button>
        </div>
        <label>
          {t('Volume')}
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
      </div>

      <style jsx>{`
        .focus-mode { display: grid; gap: var(--space-3); }
        .focus-card, .timer-card, .noise-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
        }
        .focus-card { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
        h3 { margin: 0 0 var(--space-1); }
        p { margin: 0; color: var(--text-muted); font-size: var(--font-meta); }
        .streak { font-weight: 600; color: var(--primary); }
        .time { font-size: var(--font-2xl); font-weight: 700; margin-bottom: var(--space-2); }
        .bar { height: 6px; background: var(--bg-inset); border-radius: var(--radius-full); overflow: hidden; margin-bottom: var(--space-3); }
        .bar span { display: block; height: 100%; background: var(--primary); }
        .actions { display: flex; gap: var(--space-2); }
        .noise-controls { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0; }
        label { display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--font-meta); }
        input[type="range"] { width: 100%; }
        @media (max-width: 600px) { .focus-card { flex-direction: column; align-items: flex-start; } }
      `}</style>
    </div>
  );
}
