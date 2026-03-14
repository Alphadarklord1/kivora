'use client';

import { useEffect, useRef, useState } from 'react';
import { createCard, gradeCard, getDeckStats, loadDecks, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { mdToHtml } from '@/lib/utils/md';

// ── Flashcard parser ─────────────────────────────────────────────────────────
export function parseFlashcards(content: string): Array<{ front: string; back: string }> {
  const pipeLines = content
    .split(/\n/)
    .map(l => l.replace(/^\d+[.)]\s*/, '').trim())
    .filter(l => /front:/i.test(l) && /back:/i.test(l));
  if (pipeLines.length > 0) {
    return pipeLines.map(l => ({
      front: (l.match(/front:\s*(.*?)(?:\s*\|\s*back:|$)/i)?.[1] ?? '').trim(),
      back:  (l.match(/back:\s*(.*?)$/i)?.[1] ?? '').trim(),
    })).filter(c => c.front);
  }
  return content
    .split(/---+/)
    .map(block => ({
      front: block.match(/\*?\*?Front:\*?\*?\s*([\s\S]*?)(?=\*?\*?Back:|$)/i)?.[1]?.trim() ?? '',
      back:  block.match(/\*?\*?Back:\*?\*?\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '',
    }))
    .filter(c => c.front);
}

// ── Fuzzy match for Write mode ───────────────────────────────────────────────
function fuzzyMatch(input: string, correct: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const a = norm(input);
  const b = norm(correct);
  if (!a) return false;
  if (a === b) return true;
  if (b.includes(a) || a.includes(b)) return true;
  const aWords = a.split(' ').filter(w => w.length > 2);
  const bWords = new Set(b.split(' ').filter(w => w.length > 2));
  if (aWords.length === 0 || bWords.size === 0) return false;
  const overlap = aWords.filter(w => bWords.has(w)).length;
  return overlap / Math.max(aWords.length, bWords.size) >= 0.6;
}

// ── CSV / text import parser ─────────────────────────────────────────────────
function parseImportText(text: string): Array<{ front: string; back: string }> | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results: Array<{ front: string; back: string }> = [];
  for (const line of lines) {
    const tabIdx = line.indexOf('\t');
    const commaIdx = line.indexOf(',');
    let front = '', back = '';
    if (tabIdx > 0) {
      front = line.slice(0, tabIdx).trim();
      back  = line.slice(tabIdx + 1).trim();
    } else if (commaIdx > 0) {
      front = line.slice(0, commaIdx).trim();
      back  = line.slice(commaIdx + 1).trim();
    } else {
      return null;
    }
    if (front && back) results.push({ front, back });
  }
  return results.length > 0 ? results : null;
}

// ── Test question type ───────────────────────────────────────────────────────
interface TestQuestion {
  type: 'mcq' | 'tf' | 'written';
  cardId: string;
  question: string;
  correctAnswer: string;
  options?: string[];
}

function buildTestQuestions(deck: SRSDeck): TestQuestion[] {
  const cards    = [...deck.cards].sort(() => Math.random() - 0.5);
  const allBacks = deck.cards.map(c => c.back);
  return cards.map(card => {
    const r           = Math.random();
    const canMCQ      = deck.cards.length >= 4;
    const canTF       = deck.cards.length >= 2;
    if (r < 0.55 && canMCQ) {
      const distractors = allBacks
        .filter(b => b !== card.back)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      const options = [card.back, ...distractors].sort(() => Math.random() - 0.5);
      return { type: 'mcq' as const, cardId: card.id, question: card.front, correctAnswer: card.back, options };
    } else if (r < 0.75 && canTF) {
      const isTrue     = Math.random() > 0.5;
      const wrongBacks = allBacks.filter(b => b !== card.back);
      const falseBack  = wrongBacks[Math.floor(Math.random() * wrongBacks.length)] ?? card.back;
      const statement  = isTrue ? card.back : falseBack;
      return {
        type: 'tf' as const,
        cardId:        card.id,
        question:      `${card.front} → "${statement}"`,
        correctAnswer: isTrue ? 'True' : 'False',
        options:       ['True', 'False'],
      };
    } else {
      return { type: 'written' as const, cardId: card.id, question: card.front, correctAnswer: card.back };
    }
  });
}

// ── SM-2 Flashcard view ──────────────────────────────────────────────────────
type Phase = 'preview' | 'review' | 'done' | 'match' | 'learn' | 'write' | 'test' | 'stats' | 'import';

export function FlashcardView({ content, title }: { content: string; title?: string }) {
  const rawCards = parseFlashcards(content);

  // ── Core SRS state
  const [deck,       setDeck]       = useState<SRSDeck | null>(null);
  const [sessionIdx, setSessionIdx] = useState(0);
  const [flip,       setFlip]       = useState(false);
  const [phase,      setPhase]      = useState<Phase>('preview');
  const [graded,     setGraded]     = useState<number[]>([]);

  // ── Match game
  const [matchSelected,     setMatchSelected]     = useState<string | null>(null);
  const [matchPaired,       setMatchPaired]       = useState<Set<string>>(new Set());
  const [matchFlash,        setMatchFlash]        = useState<{ id: string; ok: boolean } | null>(null);
  const [matchStart,        setMatchStart]        = useState(0);
  const [matchEnd,          setMatchEnd]          = useState(0);
  const [matchShuffledDefs, setMatchShuffledDefs] = useState<Array<{ id: string; text: string }>>([]);

  // ── Learn mode
  const [learnIdx,     setLearnIdx]     = useState(0);
  const [learnQueue,   setLearnQueue]   = useState<string[]>([]);
  const [learnOptions, setLearnOptions] = useState<string[]>([]);
  const [learnPicked,  setLearnPicked]  = useState<string | null>(null);
  const [learnCorrect, setLearnCorrect] = useState(0);
  const [learnTotal,   setLearnTotal]   = useState(0);

  // ── Write mode
  const [writeQueue,    setWriteQueue]    = useState<string[]>([]);
  const [writeIdx,      setWriteIdx]      = useState(0);
  const [writeInput,    setWriteInput]    = useState('');
  const [writeRevealed, setWriteRevealed] = useState(false);
  const [writeScores,   setWriteScores]   = useState<Array<{ cardId: string; got: boolean }>>([]);
  const writeRef = useRef<HTMLTextAreaElement>(null);

  // ── Test mode
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [testAnswers,   setTestAnswers]   = useState<Record<number, string>>({});
  const [testIdx,       setTestIdx]       = useState(0);
  const [testDone,      setTestDone]      = useState(false);
  const [testWritten,   setTestWritten]   = useState('');

  // ── Import mode
  const [importText,  setImportText]  = useState('');
  const [importError, setImportError] = useState('');

  // ── Share
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [shareUrl,    setShareUrl]    = useState('');

  function makeStableDeckId(seed: string) {
    const bytes = new TextEncoder().encode(seed);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `deck-${btoa(binary).replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
  }

  // Build/load deck when content changes
  useEffect(() => {
    if (rawCards.length === 0) return;
    const deckId = makeStableDeckId(content.slice(0, 80));
    const existing = loadDecks().find(d => d.id === deckId);
    if (existing) {
      setDeck(existing);
    } else {
      const newDeck: SRSDeck = {
        id:        deckId,
        name:      `Flashcards (${rawCards.length} cards)`,
        cards:     rawCards.map((c, i) => createCard(`${deckId}-${i}`, c.front, c.back)),
        createdAt: new Date().toISOString(),
      };
      saveDeck(newDeck);
      setDeck(newDeck);
    }
    setSessionIdx(0); setFlip(false); setPhase('preview'); setGraded([]);
    setMatchSelected(null); setMatchPaired(new Set()); setMatchFlash(null); setMatchEnd(0);
    setLearnIdx(0); setLearnQueue([]); setLearnPicked(null); setLearnCorrect(0); setLearnTotal(0);
    setWriteQueue([]); setWriteIdx(0); setWriteInput(''); setWriteRevealed(false); setWriteScores([]);
    setTestQuestions([]); setTestAnswers({}); setTestIdx(0); setTestDone(false); setTestWritten('');
    setImportText(''); setImportError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // ── Share handler
  async function handleShare() {
    if (shareStatus === 'loading') return;
    setShareStatus('loading');
    try {
      const libRes = await fetch('/api/library', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          mode:     'flashcards',
          content,
          metadata: { title: title ?? deck?.name ?? 'Flashcards', cardCount: rawCards.length },
        }),
      });
      if (!libRes.ok) throw new Error('Failed to save to library');
      const libItem = await libRes.json();

      const shareRes = await fetch('/api/share', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ libraryItemId: libItem.id, permission: 'view' }),
      });
      if (!shareRes.ok) throw new Error('Failed to create share link');
      const shareData = await shareRes.json();
      const url: string = shareData.shareUrl ?? `${window.location.origin}/shared/${shareData.shareToken}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareStatus('done');
    } catch {
      setShareStatus('error');
    }
  }

  if (rawCards.length === 0)
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;
  if (!deck) return null;

  const stats        = getDeckStats(deck);
  const today        = new Date().toISOString().split('T')[0];
  const sessionCards = [
    ...deck.cards.filter(c => c.nextReview <= today && c.repetitions > 0),
    ...deck.cards.filter(c => c.repetitions === 0),
  ];
  const totalSession = sessionCards.length || deck.cards.length;
  const allCards     = sessionCards.length > 0 ? sessionCards : deck.cards;

  function doGrade(grade: 0 | 1 | 2 | 3) {
    const card    = allCards[sessionIdx];
    const updated = gradeCard(card, grade);
    const nextDeck: SRSDeck = {
      ...deck!,
      cards:       deck!.cards.map(c => c.id === updated.id ? updated : c),
      lastStudied: new Date().toISOString(),
    };
    saveDeck(nextDeck);
    setDeck(nextDeck);
    setGraded(p => [...p, grade]);
    setFlip(false);
    if (sessionIdx + 1 >= allCards.length) {
      setTimeout(() => setPhase('done'), 100);
    } else {
      setTimeout(() => setSessionIdx(i => i + 1), 120);
    }
  }

  const GRADES: Array<{ grade: 0|1|2|3; label: string; hint: string; color: string }> = [
    { grade: 0, label: 'Again', hint: 'Forgot — review tomorrow',    color: '#e05252' },
    { grade: 1, label: 'Hard',  hint: 'Recalled with effort',        color: '#f59e0b' },
    { grade: 2, label: 'Good',  hint: 'Recalled correctly',          color: '#4f86f7' },
    { grade: 3, label: 'Easy',  hint: 'Instant recall — longer gap', color: '#52b788' },
  ];

  // ── Done screen ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    const correct   = graded.filter(g => g >= 2).length;
    const pct       = Math.round((correct / graded.length) * 100);
    const nextStats = getDeckStats({ ...deck!, cards: deck!.cards });
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{pct >= 80 ? '🎉' : pct >= 50 ? '📚' : '💪'}</div>
        <h3 style={{ margin: '0 0 6px' }}>Session complete!</h3>
        <p style={{ color: 'var(--text-3)', margin: '0 0 20px' }}>
          {correct}/{graded.length} recalled correctly ({pct}%)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 24, fontSize: 'var(--text-sm)' }}>
          {[
            { label: 'New',      val: nextStats.new,      color: '#4f86f7' },
            { label: 'Learning', val: nextStats.learning, color: '#f59e0b' },
            { label: 'Mature',   val: nextStats.mature,   color: '#52b788' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 8px' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: s.color }}>{s.val}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {nextStats.due > 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 16 }}>
            {nextStats.due} card{nextStats.due !== 1 ? 's' : ''} still due today
          </div>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => {
          setSessionIdx(0); setFlip(false); setGraded([]);
          setPhase(nextStats.due > 0 ? 'review' : 'preview');
        }}>
          {nextStats.due > 0 ? `Review ${nextStats.due} remaining` : 'Browse all cards'}
        </button>
      </div>
    );
  }

  // ── Preview (browse all) mode ─────────────────────────────────────────────
  if (phase === 'preview') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Deck stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>📇 {deck.name}</span>
          {[
            { label: `${stats.new} new`,          color: '#4f86f7' },
            { label: `${stats.learning} learning`, color: '#f59e0b' },
            { label: `${stats.mature} mature`,     color: '#52b788' },
          ].map(b => (
            <span key={b.label} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: `${b.color}22`, color: b.color, fontWeight: 600 }}>
              {b.label}
            </span>
          ))}
          {stats.due > 0 && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--accent-subtle, rgba(79,134,247,0.12))', color: 'var(--accent)', fontWeight: 700, marginLeft: 'auto' }}>
              {stats.due} due today
            </span>
          )}
        </div>

        {/* Action buttons — 4-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
          <button className="btn btn-primary btn-sm"
            title="Spaced-repetition study session"
            onClick={() => { setSessionIdx(0); setFlip(false); setGraded([]); setPhase('review'); }}>
            {stats.due > 0 ? `▶ Study ${stats.due}` : `▶ Study all`}
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Type the answer — like Quizlet Write mode"
            onClick={() => {
              const shuffled = [...deck.cards].sort(() => Math.random() - 0.5).map(c => c.id);
              setWriteQueue(shuffled); setWriteIdx(0); setWriteInput('');
              setWriteRevealed(false); setWriteScores([]);
              setPhase('write');
            }}>
            ✍️ Write
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Mixed MCQ + True/False + Written test"
            onClick={() => {
              const qs = buildTestQuestions(deck);
              setTestQuestions(qs); setTestAnswers({}); setTestIdx(0); setTestDone(false); setTestWritten('');
              setPhase('test');
            }}>
            🎯 Test
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Match game — pair terms with definitions"
            onClick={() => {
              const defs = [...deck.cards].sort(() => Math.random() - 0.5).map(c => ({ id: c.id, text: c.back }));
              setMatchShuffledDefs(defs); setMatchSelected(null); setMatchPaired(new Set()); setMatchFlash(null);
              setMatchStart(Date.now()); setMatchEnd(0);
              setPhase('match');
            }}>
            🎮 Match
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Learn mode — adaptive MCQ until 100%"
            onClick={() => {
              const shuffled = [...deck.cards.map(c => c.id)].sort(() => Math.random() - 0.5);
              setLearnQueue(shuffled); setLearnIdx(0); setLearnPicked(null);
              setLearnCorrect(0); setLearnTotal(shuffled.length);
              setPhase('learn');
            }}>
            🎓 Learn
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Per-card accuracy and study history"
            onClick={() => setPhase('stats')}>
            📊 Stats
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Import cards from CSV or pasted text"
            onClick={() => { setImportText(''); setImportError(''); setPhase('import'); }}>
            📥 Import
          </button>
          <button className="btn btn-ghost btn-sm"
            title="Share this deck with a classmate"
            disabled={shareStatus === 'loading'}
            onClick={handleShare}
            style={{ color: shareStatus === 'done' ? '#52b788' : shareStatus === 'error' ? '#ef4444' : undefined }}>
            {shareStatus === 'loading' ? '⏳' : shareStatus === 'done' ? '✓ Copied!' : shareStatus === 'error' ? '✗ Error' : '🔗 Share'}
          </button>
        </div>

        {shareStatus === 'done' && shareUrl && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{shareUrl}</span>
            <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0, padding: '2px 8px', fontSize: 11 }}
              onClick={() => navigator.clipboard.writeText(shareUrl)}>📋 Copy</button>
          </div>
        )}

        {/* Card grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
          {deck.cards.map((c, i) => {
            const maturity = c.repetitions === 0 ? 'new' : c.interval >= 21 ? 'mature' : 'learning';
            const colors   = { new: '#4f86f7', learning: '#f59e0b', mature: '#52b788' };
            return (
              <div key={c.id}
                style={{ background: 'var(--surface)', border: `1px solid var(--border-2)`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 'var(--text-xs)', borderLeft: `3px solid ${colors[maturity]}` }}
                onClick={() => { setSessionIdx(i); setFlip(false); setPhase('review'); }}>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>{c.front}</div>
                <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>{c.back}</div>
                {c.repetitions > 0 && (
                  <div style={{ color: 'var(--text-3)', fontSize: 10 }}>
                    Next: {c.nextReview} · {Math.round((c.correctReviews / Math.max(1, c.totalReviews)) * 100)}% accuracy
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Write mode ────────────────────────────────────────────────────────────
  if (phase === 'write') {
    if (writeIdx >= writeQueue.length && writeQueue.length > 0) {
      const correct = writeScores.filter(s => s.got).length;
      const pct     = writeScores.length > 0 ? Math.round((correct / writeScores.length) * 100) : 0;
      const missed  = writeScores.filter(s => !s.got).map(s => deck.cards.find(c => c.id === s.cardId)).filter(Boolean);
      return (
        <div style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{pct >= 80 ? '✍️' : '📝'}</div>
          <h3 style={{ margin: '0 0 6px' }}>Write mode complete!</h3>
          <p style={{ color: 'var(--text-3)', margin: '0 0 16px' }}>
            {correct}/{writeScores.length} answered correctly ({pct}%)
          </p>
          {missed.length > 0 && (
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Review these ({missed.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {missed.map(card => card && (
                  <div key={card.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderLeft: '3px solid #ef4444', borderRadius: 8, padding: '8px 12px', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{card.front}</div>
                    <div style={{ color: 'var(--text-3)' }}>{card.back}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              const shuffled = [...deck!.cards].sort(() => Math.random() - 0.5).map(c => c.id);
              setWriteQueue(shuffled); setWriteIdx(0); setWriteInput('');
              setWriteRevealed(false); setWriteScores([]);
            }}>↺ Try again</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>← Back</button>
          </div>
        </div>
      );
    }

    const currentCardId = writeQueue[writeIdx];
    const currentCard   = deck.cards.find(c => c.id === currentCardId);
    if (!currentCard) return null;

    const isChecked  = writeRevealed;
    const isCorrect  = isChecked && fuzzyMatch(writeInput, currentCard.back);
    const writePct   = Math.round((writeIdx / writeQueue.length) * 100);

    function handleWriteCheck() {
      setWriteRevealed(true);
    }

    function handleWriteNext(got: boolean) {
      setWriteScores(prev => [...prev, { cardId: currentCardId, got }]);
      setWriteIdx(i => i + 1);
      setWriteInput('');
      setWriteRevealed(false);
      setTimeout(() => writeRef.current?.focus(), 50);
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540, margin: '0 auto' }}>
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${writePct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {writeIdx}/{writeQueue.length}
          </span>
          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {/* Prompt label */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>
          ✍️ Write mode — type the definition
        </div>

        {/* Card front */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '20px 24px', textAlign: 'center', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', lineHeight: 1.5 }}>{currentCard.front}</div>
        </div>

        {/* Answer textarea */}
        <div>
          <textarea
            ref={writeRef}
            value={writeInput}
            onChange={e => !isChecked && setWriteInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !isChecked) { e.preventDefault(); handleWriteCheck(); }
            }}
            placeholder="Type your answer…"
            disabled={isChecked}
            autoFocus
            style={{
              width: '100%', minHeight: 80, padding: '10px 14px', borderRadius: 10, resize: 'vertical',
              border: `1.5px solid ${isChecked ? (isCorrect ? '#52b788' : '#ef4444') : 'var(--border-2)'}`,
              background: isChecked
                ? (isCorrect ? 'color-mix(in srgb,#52b788 10%,var(--surface))' : 'color-mix(in srgb,#ef4444 10%,var(--surface))')
                : 'var(--surface)',
              color: 'var(--text)', fontSize: 'var(--text-sm)', fontFamily: 'inherit',
              boxSizing: 'border-box', outline: 'none', display: 'block',
            }}
          />
          {!isChecked && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Press Enter to check · Shift+Enter for new line
            </div>
          )}
        </div>

        {/* Check / Next actions */}
        {!isChecked ? (
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}
            onClick={handleWriteCheck} disabled={!writeInput.trim()}>
            Check →
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Correct answer
              </div>
              <div style={{ fontSize: 'var(--text-sm)' }}>{currentCard.back}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 600, color: isCorrect ? '#52b788' : '#ef4444' }}>
                {isCorrect ? '✓ Looks correct!' : '✗ Not quite right'}
              </span>
              <button className="btn btn-ghost btn-sm"
                style={{ background: 'color-mix(in srgb,#ef4444 12%,var(--surface))', color: '#ef4444' }}
                onClick={() => handleWriteNext(false)}>
                ✗ Got it wrong
              </button>
              <button className="btn btn-primary btn-sm"
                style={{ background: '#52b788', borderColor: '#52b788' }}
                onClick={() => handleWriteNext(true)}>
                ✓ Got it right
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Test mode ─────────────────────────────────────────────────────────────
  if (phase === 'test') {
    if (testDone || (testQuestions.length > 0 && testIdx >= testQuestions.length)) {
      let correct = 0;
      testQuestions.forEach((q, i) => {
        const ans = testAnswers[i] ?? '';
        if (q.type === 'written' ? fuzzyMatch(ans, q.correctAnswer) : ans === q.correctAnswer) correct++;
      });
      const pct = testQuestions.length > 0 ? Math.round((correct / testQuestions.length) * 100) : 0;

      return (
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', padding: '20px 0 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>{pct >= 80 ? '🎯' : pct >= 60 ? '📚' : '💪'}</div>
            <h3 style={{ margin: '0 0 6px' }}>Test complete!</h3>
            <p style={{ color: 'var(--text-3)', margin: '0 0 16px' }}>
              {correct}/{testQuestions.length} correct ({pct}%)
            </p>
          </div>

          {/* Review breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {testQuestions.map((q, i) => {
              const ans = testAnswers[i] ?? '';
              const got = q.type === 'written' ? fuzzyMatch(ans, q.correctAnswer) : ans === q.correctAnswer;
              return (
                <div key={i} style={{
                  background: 'var(--surface)', borderRadius: 8, padding: '10px 12px', fontSize: 'var(--text-xs)',
                  border: `1px solid ${got ? '#52b78840' : '#ef444440'}`, borderLeft: `3px solid ${got ? '#52b788' : '#ef4444'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 6, background: q.type === 'mcq' ? '#4f86f720' : q.type === 'tf' ? '#f59e0b20' : '#52b78820', color: q.type === 'mcq' ? '#4f86f7' : q.type === 'tf' ? '#f59e0b' : '#52b788', fontWeight: 600 }}>
                      {q.type === 'mcq' ? 'MCQ' : q.type === 'tf' ? 'T/F' : 'Written'}
                    </span>
                    <span style={{ fontWeight: 600 }}>{q.question}</span>
                  </div>
                  <div style={{ color: 'var(--text-3)' }}>
                    Your answer: <span style={{ color: got ? '#52b788' : '#ef4444' }}>{ans || '(no answer)'}</span>
                  </div>
                  {!got && <div style={{ color: '#52b788', marginTop: 2 }}>✓ Correct: {q.correctAnswer}</div>}
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              const qs = buildTestQuestions(deck!);
              setTestQuestions(qs); setTestAnswers({}); setTestIdx(0); setTestDone(false); setTestWritten('');
            }}>↺ New test</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>← Back</button>
          </div>
        </div>
      );
    }

    if (testQuestions.length === 0) return null;
    const q          = testQuestions[testIdx];
    const testPct    = Math.round((testIdx / testQuestions.length) * 100);
    const currentAns = testAnswers[testIdx];

    function answerTest(answer: string) {
      setTestAnswers(prev => ({ ...prev, [testIdx]: answer }));
      const isLast = testIdx + 1 >= testQuestions.length;
      if (q.type !== 'written') {
        setTimeout(() => {
          if (isLast) setTestDone(true);
          else { setTestIdx(i => i + 1); setTestWritten(''); }
        }, 700);
      }
      // written: advances only via "Next" button
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540, margin: '0 auto' }}>
        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${testPct}%`, height: '100%', borderRadius: 3, background: '#f59e0b', transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {testIdx + 1}/{testQuestions.length}
          </span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
            background: q.type === 'mcq' ? '#4f86f720' : q.type === 'tf' ? '#f59e0b20' : '#52b78820',
            color:      q.type === 'mcq' ? '#4f86f7'   : q.type === 'tf' ? '#f59e0b'   : '#52b788',
          }}>
            {q.type === 'mcq' ? 'Multiple Choice' : q.type === 'tf' ? 'True / False' : 'Written'}
          </span>
          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {/* Question */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '20px 24px', minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', lineHeight: 1.5 }}>{q.question}</div>
        </div>

        {/* MCQ / T/F options */}
        {q.options && (
          <div style={{ display: 'grid', gridTemplateColumns: q.type === 'tf' ? '1fr 1fr' : '1fr 1fr', gap: 8 }}>
            {q.options.map((opt, oi) => {
              const picked   = currentAns === opt;
              const correct  = opt === q.correctAnswer;
              let bg = 'var(--surface-2)', col = 'var(--text)', border = 'var(--border-2)';
              if (currentAns) {
                if (picked  && correct)  { bg = 'color-mix(in srgb,#52b788 20%,var(--surface))'; col = '#52b788'; border = '#52b788'; }
                if (picked  && !correct) { bg = 'color-mix(in srgb,#ef4444 20%,var(--surface))'; col = '#ef4444'; border = '#ef4444'; }
                if (!picked && correct)  { bg = 'color-mix(in srgb,#52b788 15%,var(--surface))'; col = '#52b788'; border = '#52b78860'; }
              }
              return (
                <div key={oi} onClick={() => !currentAns && answerTest(opt)}
                  style={{ padding: '12px 14px', borderRadius: 10, textAlign: 'center', transition: 'all 0.15s', lineHeight: 1.4,
                    cursor: currentAns ? 'default' : 'pointer', background: bg, color: col,
                    border: `1px solid ${border}`, fontSize: 'var(--text-sm)', fontWeight: picked ? 600 : 400,
                  }}>
                  {opt}
                </div>
              );
            })}
          </div>
        )}

        {/* Written answer */}
        {q.type === 'written' && !currentAns && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input type="text"
              value={testWritten}
              onChange={e => setTestWritten(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && testWritten.trim() && answerTest(testWritten.trim())}
              placeholder="Type your answer and press Enter…"
              autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
            />
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}
              onClick={() => testWritten.trim() && answerTest(testWritten.trim())}
              disabled={!testWritten.trim()}>
              Submit →
            </button>
          </div>
        )}

        {/* Written answer revealed */}
        {q.type === 'written' && currentAns && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>
                Your answer: <span style={{ color: fuzzyMatch(currentAns, q.correctAnswer) ? '#52b788' : '#ef4444' }}>{currentAns}</span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                Correct: <span style={{ color: '#52b788' }}>{q.correctAnswer}</span>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}
              onClick={() => {
                const isLast = testIdx + 1 >= testQuestions.length;
                if (isLast) setTestDone(true);
                else { setTestIdx(i => i + 1); setTestWritten(''); }
              }}>
              Next →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Stats mode ────────────────────────────────────────────────────────────
  if (phase === 'stats') {
    const totalReviews  = deck.cards.reduce((sum, c) => sum + c.totalReviews, 0);
    const reviewedCards = deck.cards.filter(c => c.totalReviews > 0);
    const avgAccuracy   = reviewedCards.length > 0
      ? Math.round(reviewedCards.reduce((sum, c) => sum + (c.correctReviews / c.totalReviews) * 100, 0) / reviewedCards.length)
      : null;

    const cardStats = deck.cards.map(c => ({
      card:    c,
      acc:     c.totalReviews > 0 ? Math.round((c.correctReviews / c.totalReviews) * 100) : null,
      mature:  c.repetitions === 0 ? 'new' : c.interval >= 21 ? 'mature' : 'learning',
    })).sort((a, b) => {
      // Weakest first (by acc, nulls = new = score 999)
      const sa = a.acc ?? 999;
      const sb = b.acc ?? 999;
      return sa - sb;
    });

    const weakCount = cardStats.filter(s => s.acc !== null && s.acc < 60).length;

    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>📊 Progress — {deck.name}</span>
          <button className="btn-icon" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Total cards', val: String(deck.cards.length),                     color: 'var(--text)' },
            { label: 'Reviews',     val: String(totalReviews),                           color: '#4f86f7' },
            { label: 'Avg accuracy',val: avgAccuracy !== null ? `${avgAccuracy}%` : '—', color: '#52b788' },
            { label: 'Weak cards',  val: String(weakCount),                              color: weakCount > 0 ? '#ef4444' : '#52b788' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: s.color }}>{s.val}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 10 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Card performance {weakCount > 0 ? `— ${weakCount} weak card${weakCount !== 1 ? 's' : ''}` : ''}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cardStats.map(({ card, acc, mature }) => {
            const matureColors: Record<string, string> = { new: '#4f86f7', learning: '#f59e0b', mature: '#52b788' };
            const barColor = acc === null ? '#4f86f7' : acc < 50 ? '#ef4444' : acc < 75 ? '#f59e0b' : '#52b788';
            return (
              <div key={card.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8,
                padding: '8px 12px', borderLeft: `3px solid ${matureColors[mature]}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: acc !== null ? 4 : 0 }}>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 'var(--text-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.front}
                  </div>
                  <div style={{ fontSize: 12, color: barColor, fontWeight: 700, flexShrink: 0 }}>
                    {acc !== null ? `${acc}%` : 'New'}
                  </div>
                </div>
                {acc !== null && (
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ width: `${acc}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.5s' }} />
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {card.totalReviews > 0
                    ? `${card.totalReviews} review${card.totalReviews !== 1 ? 's' : ''} · ${card.correctReviews} correct · next: ${card.nextReview}`
                    : 'Not yet reviewed'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Import mode ───────────────────────────────────────────────────────────
  if (phase === 'import') {
    const previewCount = importText.trim().split('\n').filter(Boolean).length;

    function handleImport() {
      const cards = parseImportText(importText);
      if (!cards) {
        setImportError('Could not parse. Use "term, definition" or "term\\tdefinition" (tab-separated) per line.');
        return;
      }
      const newDeck: SRSDeck = {
        ...deck!,
        name:  `Imported (${cards.length} cards)`,
        cards: cards.map((c, i) => createCard(`${deck!.id}-imp-${i}`, c.front, c.back)),
      };
      saveDeck(newDeck);
      setDeck(newDeck);
      setImportText('');
      setImportError('');
      setPhase('preview');
    }

    return (
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>📥 Import cards</span>
          <button className="btn-icon" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.7 }}>
          Paste one card per line. Separate term from definition with a <strong>comma</strong> or <strong>tab</strong>.<br />
          Example: <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>Mitosis, Cell division producing two identical daughter cells</code>
        </div>

        <textarea
          value={importText}
          onChange={e => { setImportText(e.target.value); setImportError(''); }}
          placeholder={'Term 1, Definition 1\nTerm 2, Definition 2\nTerm 3\tDefinition 3'}
          autoFocus
          style={{
            width: '100%', minHeight: 180, padding: '10px 14px', borderRadius: 10,
            border: `1.5px solid ${importError ? '#ef4444' : 'var(--border-2)'}`,
            background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--text-sm)',
            fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', outline: 'none', display: 'block',
          }}
        />
        {importError && (
          <div style={{ fontSize: 'var(--text-xs)', color: '#ef4444', marginTop: 6 }}>{importError}</div>
        )}
        {importText.trim() && !importError && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 6 }}>
            Preview: {previewCount} line{previewCount !== 1 ? 's' : ''} detected
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={!importText.trim()}>
            Import {importText.trim() ? `${previewCount} cards` : ''}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setImportText(''); setImportError(''); setPhase('preview'); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Match game mode ───────────────────────────────────────────────────────
  if (phase === 'match') {
    const allMatched = matchPaired.size === deck.cards.length;
    const elapsed    = matchEnd > 0 ? Math.round((matchEnd - matchStart) / 1000) : Math.round((Date.now() - matchStart) / 1000);

    function handleMatchTerm(cardId: string) {
      if (matchPaired.has(cardId)) return;
      if (matchSelected === cardId) { setMatchSelected(null); return; }
      if (!matchSelected) { setMatchSelected(cardId); return; }
      if (matchSelected === cardId) { setMatchSelected(null); return; }
      setMatchFlash({ id: cardId, ok: true });
      setTimeout(() => {
        setMatchPaired(prev => { const next = new Set(prev); next.add(cardId); return next; });
        setMatchSelected(null); setMatchFlash(null);
        if (deck && matchPaired.size + 1 === deck.cards.length) setMatchEnd(Date.now());
      }, 300);
    }

    function handleMatchDef(cardId: string) {
      if (matchPaired.has(cardId)) return;
      if (!matchSelected) return;
      if (matchSelected === cardId) {
        setMatchFlash({ id: cardId, ok: true });
        setTimeout(() => {
          setMatchPaired(prev => { const next = new Set(prev); next.add(cardId); return next; });
          setMatchSelected(null); setMatchFlash(null);
          if (deck && matchPaired.size + 1 === deck.cards.length) setMatchEnd(Date.now());
        }, 300);
      } else {
        setMatchFlash({ id: cardId, ok: false });
        setTimeout(() => { setMatchFlash(null); }, 600);
      }
    }

    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>🎮 Match Game</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{matchPaired.size}/{deck.cards.length} matched</span>
          {!allMatched && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginLeft: 'auto' }}>⏱ {elapsed}s</span>}
          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {allMatched ? (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
            <h3 style={{ margin: '0 0 6px' }}>All matched!</h3>
            <p style={{ color: 'var(--text-3)' }}>Completed in {elapsed} seconds</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => {
                const defs = [...deck.cards].sort(() => Math.random() - 0.5).map(c => ({ id: c.id, text: c.back }));
                setMatchShuffledDefs(defs); setMatchSelected(null); setMatchPaired(new Set());
                setMatchFlash(null); setMatchStart(Date.now()); setMatchEnd(0);
              }}>↺ Play again</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>← Back</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Terms</div>
              {deck.cards.map(c => {
                const paired  = matchPaired.has(c.id);
                const selTerm = matchSelected === c.id;
                const flash   = matchFlash?.id === c.id;
                return (
                  <div key={c.id} onClick={() => !paired && handleMatchTerm(c.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: paired ? 'default' : 'pointer',
                      fontSize: 'var(--text-xs)', lineHeight: 1.4, transition: 'all 0.15s',
                      background: paired ? 'color-mix(in srgb,#52b788 15%,var(--surface))' : selTerm ? 'var(--accent)' : flash ? (matchFlash?.ok ? '#52b78820' : '#ef444420') : 'var(--surface-2)',
                      color: paired ? '#52b788' : selTerm ? '#fff' : 'var(--text)',
                      border: `1px solid ${paired ? '#52b78840' : selTerm ? 'var(--accent)' : 'var(--border-2)'}`,
                      opacity: paired ? 0.6 : 1,
                    }}>
                    {paired ? '✓ ' : ''}{c.front}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>Definitions</div>
              {matchShuffledDefs.map(def => {
                const paired = matchPaired.has(def.id);
                const flash  = matchFlash?.id === def.id;
                const active = !!matchSelected && !paired;
                return (
                  <div key={def.id} onClick={() => !paired && active && handleMatchDef(def.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 8, cursor: (!paired && active) ? 'pointer' : 'default',
                      fontSize: 'var(--text-xs)', lineHeight: 1.4, transition: 'all 0.15s',
                      background: paired ? 'color-mix(in srgb,#52b788 15%,var(--surface))' : flash ? (matchFlash?.ok ? '#52b78820' : '#ef444420') : active ? 'var(--surface)' : 'var(--surface-2)',
                      color: paired ? '#52b788' : flash && !matchFlash?.ok ? '#ef4444' : 'var(--text)',
                      border: `1px solid ${paired ? '#52b78840' : flash && !matchFlash?.ok ? '#ef4444' : active ? 'var(--accent)' : 'var(--border-2)'}`,
                      opacity: paired ? 0.6 : 1,
                      transform: flash && !matchFlash?.ok ? 'translateX(-4px)' : 'none',
                    }}>
                    {paired ? '✓ ' : ''}{def.text}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Learn mode ────────────────────────────────────────────────────────────
  if (phase === 'learn') {
    const learnDone = learnQueue.length === 0;

    function buildOptions(cardId: string): string[] {
      const correct     = deck!.cards.find(c => c.id === cardId)?.back ?? '';
      const distractors = deck!.cards
        .filter(c => c.id !== cardId)
        .map(c => c.back)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      return [correct, ...distractors].sort(() => Math.random() - 0.5);
    }

    const currentCardId = learnQueue[learnIdx] ?? null;
    const currentCard   = deck.cards.find(c => c.id === currentCardId) ?? null;
    const learnOpts     = learnOptions.length === 4
      ? learnOptions
      : (currentCardId ? buildOptions(currentCardId) : []);

    function pickAnswer(opt: string) {
      if (learnPicked) return;
      setLearnPicked(opt);
      const correct  = currentCard?.back ?? '';
      const isRight  = opt === correct;
      const nextId   = isRight ? null : currentCardId!;
      setTimeout(() => {
        setLearnQueue(prev => {
          const without = prev.filter((_, i) => i !== learnIdx);
          return nextId ? [...without, nextId] : without;
        });
        if (isRight) setLearnCorrect(p => p + 1);
        setLearnIdx(0);
        setLearnPicked(null);
        const nextCardId = learnQueue[learnIdx + (learnIdx + 1 < learnQueue.length ? 1 : 0)];
        if (nextCardId && nextCardId !== currentCardId) setLearnOptions(buildOptions(nextCardId));
        else setLearnOptions([]);
      }, 900);
    }

    if (learnDone) {
      const acc = Math.round((learnCorrect / learnTotal) * 100);
      return (
        <div style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>{acc === 100 ? '🎉' : acc >= 70 ? '📚' : '💪'}</div>
          <h3 style={{ margin: '0 0 6px' }}>Learn complete!</h3>
          <p style={{ color: 'var(--text-3)' }}>You got all {learnTotal} cards right</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              const ids = deck!.cards.map(c => c.id).sort(() => Math.random() - 0.5);
              setLearnQueue(ids); setLearnIdx(0); setLearnPicked(null);
              setLearnCorrect(0); setLearnTotal(ids.length); setLearnOptions([]);
            }}>↺ Restart</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>← Back</button>
          </div>
        </div>
      );
    }

    if (!currentCard) return null;
    const learnPct = Math.round(((learnTotal - learnQueue.length) / learnTotal) * 100);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${learnPct}%`, height: '100%', borderRadius: 3, background: '#52b788', transition: 'width 0.4s' }} />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {learnTotal - learnQueue.length}/{learnTotal}
          </span>
          <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '20px 24px', textAlign: 'center', minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', lineHeight: 1.5 }}>{currentCard.front}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {learnOpts.map((opt, i) => {
            const isCorrect = opt === currentCard.back;
            const isPicked  = learnPicked === opt;
            let bg = 'var(--surface-2)', col = 'var(--text)', border = 'var(--border-2)';
            if (isPicked && isCorrect)  { bg = 'color-mix(in srgb,#52b788 20%,var(--surface))'; col = '#52b788'; border = '#52b788'; }
            if (isPicked && !isCorrect) { bg = 'color-mix(in srgb,#ef4444 20%,var(--surface))'; col = '#ef4444'; border = '#ef4444'; }
            if (learnPicked && !isPicked && isCorrect) { bg = 'color-mix(in srgb,#52b788 20%,var(--surface))'; col = '#52b788'; border = '#52b788'; }
            return (
              <div key={i} onClick={() => pickAnswer(opt)}
                style={{ padding: '12px 14px', borderRadius: 10, cursor: learnPicked ? 'default' : 'pointer', background: bg, color: col, border: `1px solid ${border}`, fontSize: 'var(--text-sm)', lineHeight: 1.4, transition: 'all 0.15s', fontWeight: isPicked ? 600 : 400 }}>
                {String.fromCharCode(65 + i)}. {opt}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Review mode ───────────────────────────────────────────────────────────
  const card      = allCards[Math.min(sessionIdx, allCards.length - 1)];
  const reviewPct = Math.round((sessionIdx / totalSession) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 540, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
          <div style={{ width: `${reviewPct}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
          {sessionIdx + 1}/{totalSession}
        </span>
        <button className="btn-icon" style={{ fontSize: 11, color: 'var(--text-3)' }}
          title="Back to overview" onClick={() => setPhase('preview')}>✕</button>
      </div>

      <div className="flashcard-wrap" style={{ minHeight: 200 }} onClick={() => !flip && setFlip(true)}>
        <div className={`flashcard${flip ? ' flipped' : ''}`} style={{ minHeight: 200 }}>
          <div className="flashcard-face">
            <div className="flashcard-label">Front</div>
            <div className="flashcard-text">{card.front}</div>
            {!flip && <small style={{ marginTop: 'auto', color: 'var(--text-3)', paddingTop: 12 }}>Click to reveal answer</small>}
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="flashcard-label">Back</div>
            <div className="flashcard-text">{card.back}</div>
          </div>
        </div>
      </div>

      {flip ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {GRADES.map(g => (
            <button key={g.grade} onClick={() => doGrade(g.grade)} title={g.hint}
              style={{
                border: 'none', borderRadius: 8, padding: '8px 4px', cursor: 'pointer',
                background: `${g.color}18`, color: g.color, fontWeight: 600, fontSize: 'var(--text-xs)',
                transition: 'background 0.12s',
              }}>
              {g.label}
              <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.8, marginTop: 2 }}>{g.hint.split('—')[0].trim()}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFlip(true)}>Show answer</button>
        </div>
      )}
    </div>
  );
}
