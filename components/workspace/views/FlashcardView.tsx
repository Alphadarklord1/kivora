'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCard, gradeCard, getDeckStats, getWorkloadForecast,
  loadDecks, saveDeck, loadSessions, recordSession, getStreak, loadReviewHistory,
  recordReviewHistory, getGoalPreferences, saveGoalPreferences, getDeckRetentionSummary,
  type SRSCard, type SRSDeck, type StudySession, type SRSReviewEvent,
} from '@/lib/srs/sm2';
import { parseFlashcards } from '@/lib/srs/parse';
import { deckToContent, exportDeckApkg, exportDeckCsv, syncDeckToCloud } from '@/lib/srs/deck-utils';
import { useI18n } from '@/lib/i18n/useI18n';
import { mdToHtml } from '@/lib/utils/md';
import { idbStore } from '@/lib/idb';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

function stableDeckId(input: string) {
  const bytes = new TextEncoder().encode(input);
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `deck-${(hash >>> 0).toString(36)}`;
}

// ── Fuzzy match ───────────────────────────────────────────────────────────────
function fuzzyMatch(input: string, correct: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const a = norm(input), b = norm(correct);
  if (!a) return false;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const aW = a.split(' ').filter(w => w.length > 2);
  const bW = new Set(b.split(' ').filter(w => w.length > 2));
  if (!aW.length || !bW.size) return false;
  return aW.filter(w => bW.has(w)).length / Math.max(aW.length, bW.size) >= 0.6;
}

// ── CSV / text import parser ──────────────────────────────────────────────────
function parseImportText(text: string): Array<{ front: string; back: string }> | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results: Array<{ front: string; back: string }> = [];
  for (const line of lines) {
    const tabIdx = line.indexOf('\t'), commaIdx = line.indexOf(',');
    let front = '', back = '';
    if (tabIdx > 0)         { front = line.slice(0, tabIdx).trim();   back = line.slice(tabIdx + 1).trim(); }
    else if (commaIdx > 0)  { front = line.slice(0, commaIdx).trim(); back = line.slice(commaIdx + 1).trim(); }
    else                    { return null; }
    if (front && back) results.push({ front, back });
  }
  return results.length > 0 ? results : null;
}

// ── Test question type ────────────────────────────────────────────────────────
interface TestQuestion { type: 'mcq' | 'tf' | 'written'; cardId: string; question: string; correctAnswer: string; options?: string[]; }

function buildTestQuestions(deck: SRSDeck): TestQuestion[] {
  const cards = [...deck.cards].sort(() => Math.random() - 0.5);
  const allBacks = deck.cards.map(c => c.back);
  return cards.map(card => {
    const r = Math.random();
    if (r < 0.55 && deck.cards.length >= 4) {
      const options = [card.back, ...allBacks.filter(b => b !== card.back).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
      return { type: 'mcq' as const, cardId: card.id, question: card.front, correctAnswer: card.back, options };
    } else if (r < 0.75 && deck.cards.length >= 2) {
      const isTrue   = Math.random() > 0.5;
      const falseB   = allBacks.filter(b => b !== card.back).sort(() => Math.random() - 0.5)[0] ?? card.back;
      return { type: 'tf' as const, cardId: card.id, question: `${card.front} → "${isTrue ? card.back : falseB}"`, correctAnswer: isTrue ? 'True' : 'False', options: ['True', 'False'] };
    } else {
      return { type: 'written' as const, cardId: card.id, question: card.front, correctAnswer: card.back };
    }
  });
}

// ── TTS ───────────────────────────────────────────────────────────────────────
function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { rate: 0.92 }));
}

// ── Share to Group button ─────────────────────────────────────────────────────

function ShareToGroupButton({ deck, t }: { deck: SRSDeck; t: (k: string) => string }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<{ id: string; name: string; joinCode: string }[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading-groups' | 'sharing' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function openPicker() {
    setOpen(true);
    setStatus('loading-groups');
    try {
      const res = await fetch('/api/groups', { credentials: 'include' });
      const data = await res.json() as { id: string; name: string; joinCode: string }[];
      setGroups(Array.isArray(data) ? data : []);
      setSelectedCode(Array.isArray(data) && data.length > 0 ? data[0].joinCode : '');
    } catch { setGroups([]); }
    setStatus('idle');
  }

  function close() { setOpen(false); setStatus('idle'); setMsg(''); setSelectedCode(''); setGroups([]); }

  async function share() {
    if (!selectedCode) return;
    setStatus('sharing');
    try {
      const res = await fetch(`/api/groups/${selectedCode}/decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckName: deck.name,
          cardCount: deck.cards.length,
          content: deck.cards.map(c => `${c.front} | ${c.back}`).join('\n'),
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatus('done'); setMsg(t('Deck shared!'));
        setTimeout(close, 1800);
      } else { setStatus('error'); setMsg(data.error ?? t('Failed.')); }
    } catch { setStatus('error'); setMsg(t('Network error.')); }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => void openPicker()}>
        👥 {t('Groups')}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 8, padding: '4px 8px' }}>
      {status === 'loading-groups' ? (
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>…</span>
      ) : groups.length === 0 ? (
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('No groups — create or join one first.')}</span>
      ) : (
        <select
          value={selectedCode}
          onChange={e => setSelectedCode(e.target.value)}
          style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        >
          {groups.map(g => (
            <option key={g.id} value={g.joinCode}>{g.name}</option>
          ))}
        </select>
      )}
      {groups.length > 0 && (
        <button className="btn btn-primary btn-xs" disabled={status === 'sharing' || status === 'done'} onClick={() => void share()}>
          {status === 'sharing' ? '…' : status === 'done' ? '✓' : t('Share')}
        </button>
      )}
      <button className="btn btn-ghost btn-xs" onClick={close}>✕</button>
      {msg && <span style={{ fontSize: 11, color: status === 'error' ? '#ef4444' : '#22c55e' }}>{msg}</span>}
    </div>
  );
}

// ── Sync helpers ──────────────────────────────────────────────────────────────
const syncCache = new Map<string, number>(); // deckId → last sync timestamp

async function syncDeck(deck: SRSDeck) {
  const last = syncCache.get(deck.id) ?? 0;
  if (Date.now() - last < 3000) return; // debounce 3s
  syncCache.set(deck.id, Date.now());
  await syncDeckToCloud(deck);
}

async function syncSession(cards: number) {
  try {
    await fetch('/api/srs/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardsReviewed: cards, minutesStudied: 0 }) });
  } catch { /* offline */ }
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function StudyHeatmap({
  sessions,
  t,
  formatNumber,
}: {
  sessions: StudySession[];
  t: (key: string, params?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}) {
  const map = new Map(sessions.map(s => [s.date, s.cards]));
  const weeks: Array<Array<{ date: string; count: number }>> = [];
  const end   = new Date();
  const start = new Date(); start.setDate(end.getDate() - 364);
  // Align start to Sunday
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

  const cur = new Date(start);
  let week: Array<{ date: string; count: number }> = [];
  while (cur <= end) {
    const ds    = cur.toISOString().split('T')[0];
    const count = map.get(ds) ?? 0;
    week.push({ date: ds, count });
    if (week.length === 7) { weeks.push(week); week = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length > 0) weeks.push(week);

  const maxCards = Math.max(...sessions.map(s => s.cards), 1);
  const total    = sessions.reduce((s, r) => s + r.cards, 0);
  const active   = sessions.filter(s => s.cards > 0).length;

  function cellColor(count: number) {
    if (count === 0) return 'var(--surface-2)';
    const ratio = count / maxCards;
    if (ratio < 0.25) return '#52b78840';
    if (ratio < 0.5)  return '#52b78870';
    if (ratio < 0.75) return '#52b788b0';
    return '#52b788';
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 3, overflowX: 'auto', padding: '4px 0' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {week.map(day => (
              <div key={day.date} title={t('{date}: {count} cards', { date: day.date, count: formatNumber(day.count) })}
                style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(day.count), flexShrink: 0 }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 10, color: 'var(--text-3)' }}>
        <span>{t('{count} cards reviewed', { count: formatNumber(total) })}</span>
        <span>{t('{count} active days', { count: formatNumber(active) })}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
          <span>{t('Less')}</span>
          {[0, 0.25, 0.5, 0.75, 1].map(r => (
            <div key={r} style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(r * maxCards) }} />
          ))}
          <span>{t('More')}</span>
        </div>
      </div>
    </div>
  );
}

// ── Phase type ────────────────────────────────────────────────────────────────
type Phase = 'preview' | 'review' | 'done' | 'match' | 'learn' | 'write' | 'test' | 'stats' | 'import' | 'edit-card';

// ── Main component ────────────────────────────────────────────────────────────
export function FlashcardView({
  content = '',
  title,
  initialDeck = null,
  requestedPhase = null,
  initialImportUrl = null,
  onRequestedPhaseHandled,
  onDeckChange,
  showBrowseButton = true,
  showPublicActions = true,
}: {
  content?: string;
  title?: string;
  initialDeck?: SRSDeck | null;
  requestedPhase?: Exclude<Phase, 'done' | 'edit-card' | 'preview'> | null;
  initialImportUrl?: string | null;
  onRequestedPhaseHandled?: () => void;
  onDeckChange?: (deck: SRSDeck) => void;
  showBrowseButton?: boolean;
  showPublicActions?: boolean;
}) {
  const router = useRouter();
  const { t, formatDate, formatNumber } = useI18n({
    'Flashcards ({count} cards)': 'بطاقات تعليمية ({count} بطاقة)',
    'Imported deck': 'مجموعة مستوردة',
    'Imported ({count} cards)': 'مستورد ({count} بطاقة)',
    'Front': 'الوجه الأمامي',
    'Back': 'الوجه الخلفي',
    'Again': 'مرة أخرى',
    'Hard': 'صعب',
    'Good': 'جيد',
    'Easy': 'سهل',
    'Forgot — review soon': 'نسيت — راجع قريباً',
    'Recalled with effort': 'تذكرته بصعوبة',
    'Recalled correctly': 'تذكرته بشكل صحيح',
    'Instant recall — longer gap': 'تذكر فوري — فترة أطول',
    'Session complete!': 'اكتملت الجلسة!',
    '{correct}/{total} recalled ({percent}%)': 'تم تذكر {correct} من {total} ({percent}%)',
    '{count}-day streak!': 'سلسلة {count} أيام!',
    'New': 'جديد',
    'Learning': 'قيد التعلّم',
    'Mature': 'متقن',
    'Review {count} remaining': 'راجع {count} متبقية',
    'Browse all cards': 'تصفح كل البطاقات',
    'Daily goal': 'الهدف اليومي',
    '{done}/{goal} cards today': '{done}/{goal} بطاقة اليوم',
    '{done}/{goal} today': '{done}/{goal} اليوم',
    'Review': 'مراجعة',
    'Preview': 'معاينة',
    'Study all': 'ادرس الكل',
    'Study {count}': 'ادرس {count}',
    'Write': 'كتابة',
    'Test': 'اختبار',
    'Stats': 'الإحصاءات',
    'Import': 'استيراد',
    'Browse': 'استعراض',
    'Scholar Hub': 'مركز الباحث',
    'Share': 'مشاركة',
    'Shared': 'تمت المشاركة',
    'Error': 'خطأ',
    'Publish': 'نشر',
    'Publishing': 'جارٍ النشر',
    'Public': 'عام',
    'Retry': 'أعد المحاولة',
    'Copy': 'نسخ',
    'Export CSV': 'تصدير CSV',
    'Export Anki': 'تصدير Anki',
    'Public deck description': 'وصف المجموعة العامة',
    'Optional public deck description': 'وصف اختياري للمجموعة العامة',
    'Deck description': 'وصف المجموعة',
    'Add a short description for this deck': 'أضف وصفاً قصيراً لهذه المجموعة',
    'Rename deck': 'إعادة تسمية المجموعة',
    'Double-click to rename': 'انقر مرتين لإعادة التسمية',
    'Due cards — next 14 days': 'البطاقات المستحقة — خلال 14 يوماً',
    'Due cards — next 7 days': 'البطاقات المستحقة — خلال 7 أيام',
    'No cards due in the next week': 'لا توجد بطاقات مستحقة خلال الأسبوع القادم',
    'Study activity': 'نشاط الدراسة',
    'Card performance': 'أداء البطاقات',
    'Not yet reviewed': 'لم تتم مراجعتها بعد',
    'Loading decks…': 'جارٍ تحميل المجموعات…',
    'Search public decks': 'ابحث في المجموعات العامة',
    'Import deck': 'استيراد المجموعة',
    'Copy link': 'نسخ الرابط',
    'TTS on flip': 'النطق الصوتي عند القلب',
    'Next: {date} · {accuracy}% acc': 'التالي: {date} · دقة {accuracy}%',
    '{count} due today': '{count} مستحقة اليوم',
    '{count} new': '{count} جديد',
    '{count} learning': '{count} قيد التعلّم',
    '{count} mature': '{count} متقن',
    '{count} day': '{count} يوم',
    '{count} days': '{count} أيام',
    'Today': 'اليوم',
    'Tomorrow': 'غداً',
    'Progress — {name}': 'التقدم — {name}',
    'Total cards': 'إجمالي البطاقات',
    'Reviews': 'المراجعات',
    'Avg accuracy': 'متوسط الدقة',
    'Weak cards': 'بطاقات ضعيفة',
    '{count} weak': '{count} ضعيفة',
    '{count} reviews · next: {date}': '{count} مراجعات · التالي: {date}',
    'FSRS health': 'صحة FSRS',
    'Avg recall confidence': 'متوسط الثقة في التذكر',
    'Average stability': 'متوسط الثبات',
    'Image cards': 'بطاقات مصوّرة',
    'Recent reviews': 'آخر المراجعات',
    'No review history yet': 'لا يوجد سجل مراجعات بعد',
    'Next review: {date} · interval {count}d': 'المراجعة التالية: {date} · الفاصل {count} يوم',
    'Import cards': 'استيراد البطاقات',
    'One card per line. Separate term and definition with a comma or tab.': 'بطاقة واحدة في كل سطر. افصل بين المصطلح والتعريف بفاصلة أو بعلامة تبويب.',
    'Import from a Kivora shared review-set link': 'استيراد من رابط Kivora مشترك لمجموعة مراجعة',
    'Import link': 'استيراد الرابط',
    'Could not parse. Use "term, definition" or tab-separated per line.': 'تعذر التحليل. استخدم \"المصطلح، التعريف\" أو افصل بعلامة تبويب في كل سطر.',
    'No cards were found in that URL.': 'لم يتم العثور على بطاقات في هذا الرابط.',
    'Import failed': 'فشل الاستيراد',
    '{count} line detected': 'تم اكتشاف سطر واحد',
    '{count} lines detected': 'تم اكتشاف {count} أسطر',
    'Cancel': 'إلغاء',
    'Public deck library': 'مكتبة المجموعات العامة',
    'No public decks found yet. Publish one from the preview screen to seed the library.': 'لا توجد مجموعات عامة بعد. انشر مجموعة من شاشة المعاينة لبدء المكتبة.',
    '{count} cards': '{count} بطاقة',
    '{date}: {count} cards': '{date}: {count} بطاقة',
    '{count} cards reviewed': 'تمت مراجعة {count} بطاقة',
    '{count} active days': '{count} أيام نشطة',
    'Less': 'أقل',
    'More': 'أكثر',
    'Type the answer': 'اكتب الإجابة',
    'Mixed test': 'اختبار متنوع',
    'Match Game': 'لعبة المطابقة',
    '{matched}/{total} matched': 'تمت مطابقة {matched}/{total}',
    'All matched!': 'تمت المطابقة بالكامل!',
    'Completed in {count} seconds': 'اكتملت خلال {count} ثانية',
    'Play again': 'العب مرة أخرى',
    'Go back': 'رجوع',
    'Terms': 'المصطلحات',
    'Definitions': 'التعريفات',
    'Write mode complete!': 'اكتمل وضع الكتابة!',
    'Review these ({count})': 'راجع هذه ({count})',
    'Try again': 'حاول مرة أخرى',
    'Write the definition': 'اكتب التعريف',
    'Type your answer…': 'اكتب إجابتك…',
    'Enter to check · Shift+Enter for newline': 'اضغط Enter للتحقق · Shift+Enter لسطر جديد',
    'Check': 'تحقق',
    'Correct answer': 'الإجابة الصحيحة',
    'Looks correct!': 'تبدو صحيحة!',
    'Not quite right': 'ليست صحيحة تماماً',
    'Got wrong': 'إجابة خاطئة',
    'Got right': 'إجابة صحيحة',
    'Test complete!': 'اكتمل الاختبار!',
    '{correct}/{total} correct ({percent}%)': '{correct}/{total} صحيحة ({percent}%)',
    'Your answer': 'إجابتك',
    '(no answer)': '(بدون إجابة)',
    'New test': 'اختبار جديد',
    'Multiple Choice': 'اختيار من متعدد',
    'True / False': 'صح / خطأ',
    'Written': 'كتابي',
    'Type your answer and press Enter…': 'اكتب إجابتك ثم اضغط Enter…',
    'Submit': 'إرسال',
    'Correct': 'الصحيح',
    'Next': 'التالي',
    // Review mode
    'Show answer': 'أظهر الإجابة',
    'Tap to reveal · swipe to grade': 'اضغط للكشف · اسحب للتقييم',
    // Learn mode
    'Learn': 'تعلّم',
    'Learn complete!': 'اكتمل التعلم!',
    'All {count} cards correct!': 'صحّحت جميع البطاقات ({count})!',
    'Restart': 'إعادة البدء',
    // Edit card
    'Edit card': 'تعديل البطاقة',
    'Add image': 'إضافة صورة',
    'Save changes': 'حفظ التغييرات',
    // Write mode results
    '{correct}/{total} correct ({pct}%)': '{correct}/{total} صحيح ({pct}%)',
    // Deck settings
    'Deck settings': 'إعدادات المجموعة',
    'Show settings': 'إظهار الإعدادات',
    'Hide settings': 'إخفاء الإعدادات',
    // Add card
    'Add card': 'إضافة بطاقة',
    'Save card': 'حفظ البطاقة',
    'Term or question…': 'المصطلح أو السؤال…',
    'Definition or answer…': 'التعريف أو الإجابة…',
    '⌘↵ to save': '⌘↵ للحفظ',
  });
  const rawCards = initialDeck
    ? initialDeck.cards.map((card) => ({ front: card.front, back: card.back }))
    : parseFlashcards(content);

  // Core SRS
  const [deck,         setDeck]         = useState<SRSDeck | null>(null);
  const [sessionIdx,   setSessionIdx]   = useState(0);
  const [sessionQueue, setSessionQueue] = useState<string[]>([]); // card IDs in review order
  const [sessionBase,  setSessionBase]  = useState(0);            // original queue length (no re-queued Again cards)
  const [flip,         setFlip]         = useState(false);
  const [phase,        setPhase]        = useState<Phase>('preview');
  const [graded,       setGraded]       = useState<number[]>([]);
  // Rename
  const [renaming,   setRenaming]   = useState(false);
  const [nameInput,  setNameInput]  = useState('');
  const [descInput,  setDescInput]  = useState('');
  // Match
  const [matchSelected,     setMatchSelected]     = useState<string | null>(null);
  const [matchPaired,       setMatchPaired]       = useState<Set<string>>(new Set());
  const [matchFlash,        setMatchFlash]        = useState<{ id: string; ok: boolean } | null>(null);
  const [matchStart,        setMatchStart]        = useState(0);
  const [matchEnd,          setMatchEnd]          = useState(0);
  const [matchShuffledDefs, setMatchShuffledDefs] = useState<Array<{ id: string; text: string }>>([]);
  // Learn
  const [learnIdx,     setLearnIdx]     = useState(0);
  const [learnQueue,   setLearnQueue]   = useState<string[]>([]);
  const [learnOptions, setLearnOptions] = useState<string[]>([]);
  const [learnPicked,  setLearnPicked]  = useState<string | null>(null);
  const [learnCorrect, setLearnCorrect] = useState(0);
  const [learnTotal,   setLearnTotal]   = useState(0);
  // Write
  const [writeQueue,    setWriteQueue]    = useState<string[]>([]);
  const [writeIdx,      setWriteIdx]      = useState(0);
  const [writeInput,    setWriteInput]    = useState('');
  const [writeRevealed, setWriteRevealed] = useState(false);
  const [writeScores,   setWriteScores]   = useState<Array<{ cardId: string; got: boolean }>>([]);
  const writeRef = useRef<HTMLTextAreaElement>(null);
  // Test
  const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
  const [testAnswers,   setTestAnswers]   = useState<Record<number, string>>({});
  const [testIdx,       setTestIdx]       = useState(0);
  const [testDone,      setTestDone]      = useState(false);
  const [testWritten,   setTestWritten]   = useState('');
  // Import
  const [importText,  setImportText]  = useState('');
  const [importError, setImportError] = useState('');
  const [importUrl,   setImportUrl]   = useState(initialImportUrl ?? '');
  const [importUrlLoading, setImportUrlLoading] = useState(false);
  // Share
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [shareUrl,    setShareUrl]    = useState('');
  const [publicStatus, setPublicStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [publicUrl, setPublicUrl] = useState('');
  const [publicDescription, setPublicDescription] = useState('');
  // Stats
  const [sessions,    setSessions]    = useState<StudySession[]>([]);
  const [streak,      setStreak]      = useState(0);
  const [reviewHistory, setReviewHistory] = useState<SRSReviewEvent[]>([]);
  // Settings
  const [ttsEnabled, setTtsEnabled]   = useState(false);
  const [dailyGoal,  setDailyGoal]    = useState(20);
  // Edit card
  const [editCardId,   setEditCardId]   = useState<string | null>(null);
  const [editFront,    setEditFront]    = useState('');
  const [editBack,     setEditBack]     = useState('');
  const [editFrontImg, setEditFrontImg] = useState<string | null>(null); // IDB key
  const [editBackImg,  setEditBackImg]  = useState<string | null>(null); // IDB key
  const [frontImgUrl,  setFrontImgUrl]  = useState<string | null>(null); // object URL
  const [backImgUrl,   setBackImgUrl]   = useState<string | null>(null); // object URL
  // Image rendering for review card
  const [reviewFrontUrl, setReviewFrontUrl] = useState<string | null>(null);
  const [reviewBackUrl,  setReviewBackUrl]  = useState<string | null>(null);
  // Add-card inline form
  const [showAddCard, setShowAddCard] = useState(false);
  const [addFront,    setAddFront]    = useState('');
  const [addBack,     setAddBack]     = useState('');
  // Swipe
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Load deck on content change
  useEffect(() => {
    const explicitDeck = initialDeck ? { ...initialDeck, cards: [...initialDeck.cards] } : null;
    if (!explicitDeck && rawCards.length === 0) return;

    const deckId   = explicitDeck?.id ?? stableDeckId(content.slice(0, 240));
    const existing = explicitDeck ? loadDecks().find(d => d.id === explicitDeck.id) : loadDecks().find(d => d.id === deckId);
    const d = existing ?? explicitDeck ?? {
      id: deckId,
      name: title?.trim() || t('Flashcards ({count} cards)', { count: formatNumber(rawCards.length) }),
      cards: rawCards.map((c, i) => createCard(`${deckId}-${i}`, c.front, c.back)),
      createdAt: new Date().toISOString(),
    };
    if (!existing) saveDeck(d);
    setDeck(d);
    onDeckChange?.(d);
    setDescInput(d.description ?? '');
    setSessionIdx(0); setFlip(false); setPhase('preview'); setGraded([]);
    setMatchSelected(null); setMatchPaired(new Set()); setMatchFlash(null); setMatchEnd(0);
    setLearnIdx(0); setLearnQueue([]); setLearnPicked(null); setLearnCorrect(0); setLearnTotal(0);
    setWriteQueue([]); setWriteIdx(0); setWriteInput(''); setWriteRevealed(false); setWriteScores([]);
    setTestQuestions([]); setTestAnswers({}); setTestIdx(0); setTestDone(false); setTestWritten('');
    setImportText(''); setImportError('');
    // Load local sessions
    setSessions(loadSessions());
    setStreak(getStreak());
    setReviewHistory(loadReviewHistory(deckId));
    // Load settings
    try {
      const prefs = getGoalPreferences();
      setDailyGoal(prefs.dailyGoal);
      setTtsEnabled(localStorage.getItem('kivora-tts') === '1');
    } catch { /* noop */ }

    (async () => {
      try {
        const [deckRes, sessionsRes, prefsRes, historyRes] = await Promise.all([
          fetch('/api/srs', { cache: 'no-store' }),
          fetch('/api/srs/session', { cache: 'no-store' }),
          fetch('/api/srs/preferences', { cache: 'no-store' }),
          fetch(`/api/srs/review-history?deckId=${encodeURIComponent(deckId)}`, { cache: 'no-store' }),
        ]);
        if (deckRes.ok) {
          const remoteDecks = await deckRes.json() as SRSDeck[];
          const remoteDeck = remoteDecks.find((remote) => remote.id === deckId);
          if (remoteDeck) {
            saveDeck(remoteDeck);
            setDeck(remoteDeck);
            setDescInput(remoteDeck.description ?? '');
          }
        }
        if (sessionsRes.ok) {
          const payload = await sessionsRes.json() as { sessions?: StudySession[]; streak?: number };
          if (Array.isArray(payload.sessions)) setSessions(payload.sessions);
          if (typeof payload.streak === 'number') setStreak(payload.streak);
        }
        if (prefsRes.ok) {
          const prefs = await prefsRes.json() as { dailyGoal?: number };
          if (typeof prefs.dailyGoal === 'number' && prefs.dailyGoal > 0) {
            setDailyGoal(prefs.dailyGoal);
            saveGoalPreferences({ dailyGoal: prefs.dailyGoal });
          }
        }
        if (historyRes.ok) {
          const payload = await historyRes.json() as SRSReviewEvent[];
          if (Array.isArray(payload)) setReviewHistory(payload);
        }
      } catch {
        // Fall back to local data only.
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, initialDeck?.id, title]);

  // Load images for current review card
  useEffect(() => {
    if (!deck || phase !== 'review') return;
    const cardId = sessionQueue[sessionIdx] ?? deck.cards[sessionIdx]?.id;
    const card = deck.cards.find(c => c.id === cardId);
    if (!card) return;
    (async () => {
      if (card.frontImageKey) {
        const blob = await idbStore.get(card.frontImageKey);
        setReviewFrontUrl(blob ? URL.createObjectURL(blob.blob) : null);
      } else setReviewFrontUrl(null);
      if (card.backImageKey) {
        const blob = await idbStore.get(card.backImageKey);
        setReviewBackUrl(blob ? URL.createObjectURL(blob.blob) : null);
      } else setReviewBackUrl(null);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id, sessionIdx, phase]);

  // Share handler
  async function handleShare() {
    if (!deck || shareStatus === 'loading') return;
    setShareStatus('loading');
    try {
      const serializedDeck = deckToContent(deck);
      const libRes = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'flashcards',
          content: serializedDeck,
          metadata: {
            title: title ?? deck.name,
            description: deck.description ?? '',
            cardCount: deck.cards.length,
            sourceDeckId: deck.id,
            sourceDeckName: deck.name,
            savedFrom: '/workspace',
          },
        }),
      });
      if (!libRes.ok) throw new Error();
      const libItem = await libRes.json();
      broadcastInvalidate(LIBRARY_CHANNEL);
      const shareRes = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ libraryItemId: libItem.id, permission: 'view' }) });
      if (!shareRes.ok) throw new Error();
      const sd = await shareRes.json();
      const url: string = sd.shareUrl ?? `${window.location.origin}/share/${sd.shareToken}`;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch { /* URL still shown in UI */ }
      setShareStatus('done');
    } catch { setShareStatus('error'); }
  }

  const saveDeckState = useCallback((next: SRSDeck) => {
    saveDeck(next);
    setDeck(next);
    onDeckChange?.(next);
    void syncDeck(next);
  }, [onDeckChange]);

  useEffect(() => {
    if (initialImportUrl) setImportUrl(initialImportUrl);
  }, [initialImportUrl]);

  const launchPhase = useCallback((nextPhase: Exclude<Phase, 'done' | 'edit-card' | 'preview'>) => {
    if (!deck) return;
    switch (nextPhase) {
      case 'review': {
        const todayStr = new Date().toISOString().split('T')[0];
        const dueCards = deck.cards.filter(c => c.nextReview <= todayStr && c.repetitions > 0);
        const newCards  = deck.cards.filter(c => c.repetitions === 0);
        const initial   = [...dueCards, ...newCards];
        const queue     = (initial.length > 0 ? initial : deck.cards).map(c => c.id);
        setSessionQueue(queue);
        setSessionBase(queue.length);
        setSessionIdx(0);
        setFlip(false);
        setGraded([]);
        setPhase('review');
        break;
      }
      case 'write': {
        const queue = [...deck.cards].sort(() => Math.random() - 0.5).map((card) => card.id);
        setWriteQueue(queue);
        setWriteIdx(0);
        setWriteInput('');
        setWriteRevealed(false);
        setWriteScores([]);
        setPhase('write');
        break;
      }
      case 'test': {
        const questions = buildTestQuestions(deck);
        setTestQuestions(questions);
        setTestAnswers({});
        setTestIdx(0);
        setTestDone(false);
        setTestWritten('');
        setPhase('test');
        break;
      }
      case 'match': {
        const defs = [...deck.cards].sort(() => Math.random() - 0.5).map((card) => ({ id: card.id, text: card.back }));
        setMatchShuffledDefs(defs);
        setMatchSelected(null);
        setMatchPaired(new Set());
        setMatchFlash(null);
        setMatchStart(Date.now());
        setMatchEnd(0);
        setPhase('match');
        break;
      }
      case 'learn': {
        const queue = [...deck.cards.map((card) => card.id)].sort(() => Math.random() - 0.5);
        setLearnQueue(queue);
        setLearnIdx(0);
        setLearnPicked(null);
        setLearnCorrect(0);
        setLearnTotal(queue.length);
        setPhase('learn');
        break;
      }
      case 'stats':
        setSessions(loadSessions());
        setStreak(getStreak());
        setPhase('stats');
        break;
      case 'import':
        setImportText('');
        setImportError('');
        setPhase('import');
        break;
    }
  }, [deck]);

  useEffect(() => {
    if (!requestedPhase || !deck) return;
    launchPhase(requestedPhase);
    onRequestedPhaseHandled?.();
  }, [deck, launchPhase, onRequestedPhaseHandled, requestedPhase]);

  // ── Keyboard shortcuts ref — updated each render so the effect always has current values ─────
  const reviewKeyRef = useRef<{ flip: boolean; grade: (g: 0|1|2|3) => void; ttsBack: string }>({ flip: false, grade: () => {}, ttsBack: '' });

  useEffect(() => {
    if (phase !== 'review') return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlip(f => {
          if (!f && ttsEnabled) speak(reviewKeyRef.current.ttsBack);
          return true;
        });
      }
      if (!reviewKeyRef.current.flip) return;
      if (e.key === '1') reviewKeyRef.current.grade(0);
      else if (e.key === '2') reviewKeyRef.current.grade(1);
      else if (e.key === '3') reviewKeyRef.current.grade(2);
      else if (e.key === '4') reviewKeyRef.current.grade(3);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, ttsEnabled]);

  // ── Add card handler ─────────────────────────────────────────────────────────
  function handleAddCard() {
    if (!deck || !addFront.trim() || !addBack.trim()) return;
    const newCard = createCard(`manual-${crypto.randomUUID().slice(0, 12)}`, addFront.trim(), addBack.trim());
    saveDeckState({ ...deck, cards: [...deck.cards, newCard] });
    setAddFront('');
    setAddBack('');
    setShowAddCard(false);
  }

  if (!initialDeck && rawCards.length === 0) return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;
  if (!deck) return null;

  const stats        = getDeckStats(deck);
  const today        = new Date().toISOString().split('T')[0];
  // Use the stable session queue (built at review start). Falls back to all cards if queue not yet set.
  const allCards: SRSCard[] = sessionQueue.length > 0
    ? sessionQueue.map(id => deck.cards.find(c => c.id === id)).filter((c): c is SRSCard => !!c)
    : (() => {
        const sc = [...deck.cards.filter(c => c.nextReview <= today && c.repetitions > 0), ...deck.cards.filter(c => c.repetitions === 0)];
        return sc.length > 0 ? sc : deck.cards;
      })();
  const totalSession = sessionBase > 0 ? sessionBase : allCards.length;
  const forecastPreview = getWorkloadForecast(deck, 7);
  const forecastPreviewMax = Math.max(...forecastPreview, 1);
  const retentionSummary = getDeckRetentionSummary(deck);

  // Today's cards reviewed
  const todaySession = sessions.find(s => s.date === today);
  const todayCards   = todaySession?.cards ?? 0;
  const goalPct      = Math.min(100, Math.round((todayCards / dailyGoal) * 100));

  function doGrade(grade: 0 | 1 | 2 | 3) {
    const activeDeck = deck!;
    const card    = allCards[sessionIdx];
    const updated = gradeCard(card, grade);
    const reviewedAt = new Date().toISOString();
    const elapsedDays = card.lastReview
      ? Math.max(0, Math.round((Date.parse(reviewedAt) - Date.parse(card.lastReview)) / 86_400_000))
      : card.interval;
    const reviewEvent: SRSReviewEvent = {
      id: crypto.randomUUID(),
      deckId: activeDeck.id,
      cardId: card.id,
      grade,
      correct: grade >= 2,
      reviewedAt,
      nextReview: updated.nextReview,
      interval: updated.interval,
      elapsedDays: Math.max(0, elapsedDays),
      stability: updated.stability,
      difficulty: updated.fsrsDifficulty,
    };
    const nextDeck: SRSDeck = {
      ...activeDeck,
      cards: activeDeck.cards.map(c => c.id === updated.id ? updated : c),
      lastStudied: new Date().toISOString(),
    };
    saveDeckState(nextDeck);
    recordReviewHistory(reviewEvent);
    setReviewHistory((prev) => [reviewEvent, ...prev].slice(0, 120));
    setGraded(p => [...p, grade]);
    if (ttsEnabled && grade >= 2) speak(card.back);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(grade >= 2 ? [16] : [28, 18, 28]);
    }
    setFlip(false);
    // Record session locally + remotely
    recordSession(1);
    setSessions(loadSessions()); setStreak(getStreak());
    void syncSession(1);
    void fetch('/api/srs/review-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewEvent),
    }).catch(() => {});
    // "Again" → re-queue card at end of session so it appears again before the session ends
    if (grade === 0) {
      setSessionQueue(q => [...q, card.id]);
    }
    const nextIdx = sessionIdx + 1;
    const nextQueue = grade === 0 ? [...sessionQueue, card.id] : sessionQueue;
    if (nextIdx >= nextQueue.length) setTimeout(() => setPhase('done'), 100);
    else setTimeout(() => setSessionIdx(nextIdx), 120);
  }

  // Update ref each render so the keyboard handler has current values
  reviewKeyRef.current = { flip, grade: doGrade, ttsBack: allCards[sessionIdx]?.back ?? '' };

  function importParsedCards(cards: Array<{ front: string; back: string }>, name: string) {
    const importedDeck: SRSDeck = {
      id: `deck-${crypto.randomUUID().slice(0, 12)}`,
      name,
      description: t('Imported deck'),
      cards: cards.map((c, i) => createCard(`import-${i}-${crypto.randomUUID().slice(0, 8)}`, c.front, c.back)),
      createdAt: new Date().toISOString(),
    };
    saveDeckState(importedDeck);
    setDeck(importedDeck);
    setImportText('');
    setImportUrl('');
    setImportError('');
    setPhase('preview');
  }

  async function importFromUrl() {
    if (!importUrl.trim() || importUrlLoading) return;
    setImportUrlLoading(true);
    setImportError('');
    try {
      const res = await fetch('/api/srs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setImportError(payload?.error || t('Import failed'));
        return;
      }

      const cards = parseFlashcards(String(payload?.content ?? ''));
      if (cards.length === 0) {
        setImportError(t('No cards were found in that URL.'));
        return;
      }

      importParsedCards(cards, String(payload?.title ?? t('Imported deck')));
    } catch {
      setImportError(t('Import failed'));
    } finally {
      setImportUrlLoading(false);
    }
  }

  async function publishPublicDeck() {
    if (!deck || publicStatus === 'loading') return;
    setPublicStatus('loading');
    try {
      const contentText = deck.cards.map((card) => `Front: ${card.front} | Back: ${card.back}`).join('\n');
      const res = await fetch('/api/srs/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: deck.name,
          description: publicDescription,
          cardCount: deck.cards.length,
          content: contentText,
          sourceDeckId: deck.id,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Publish failed');
      setPublicUrl(payload?.shareUrl ?? '');
      setPublicStatus('done');
    } catch {
      setPublicStatus('error');
    }
  }

  const GRADES: Array<{ grade: 0|1|2|3; label: string; hint: string; color: string }> = [
    { grade: 0, label: 'Again', hint: 'Forgot — review soon',         color: '#e05252' },
    { grade: 1, label: 'Hard',  hint: 'Recalled with effort',         color: '#f59e0b' },
    { grade: 2, label: 'Good',  hint: 'Recalled correctly',           color: '#4f86f7' },
    { grade: 3, label: 'Easy',  hint: 'Instant recall — longer gap',  color: '#52b788' },
  ];

  function fmtInterval(days: number): string {
    if (days <= 0) return '<1d';
    if (days === 1) return '1d';
    if (days < 7)  return `${days}d`;
    if (days < 30) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}mo`;
  }

  // Swipe handlers (review mode)
  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current || !flip) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 60)  doGrade(2); // swipe right → Good
      if (dx < -60) doGrade(0); // swipe left  → Again
    } else {
      if (dy < -60) doGrade(3); // swipe up    → Easy
      if (dy > 60)  doGrade(1); // swipe down  → Hard
    }
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const correct = graded.filter(g => g >= 2).length;
    const pct     = Math.round((correct / graded.length) * 100);
    const ns      = getDeckStats({ ...deck!, cards: deck!.cards });

    // Grade breakdown counts
    const againCount = graded.filter(g => g === 0).length;
    const hardCount  = graded.filter(g => g === 1).length;
    const goodCount  = graded.filter(g => g === 2).length;
    const easyCount  = graded.filter(g => g === 3).length;

    // Earliest upcoming due date (excluding already-due cards)
    const today = new Date().toISOString().split('T')[0];
    const futureDue = deck?.cards
      .map(c => c.nextReview)
      .filter((d): d is string => !!d && d > today)
      .sort()[0];
    const daysUntilNext = futureDue
      ? Math.round((new Date(futureDue).getTime() - new Date(today).getTime()) / 86_400_000)
      : null;

    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{pct >= 80 ? '🎉' : pct >= 50 ? '📚' : '💪'}</div>
        <h3 style={{ margin: '0 0 6px' }}>{t('Session complete!')}</h3>
        <p style={{ color: 'var(--text-3)', margin: '0 0 8px' }}>{t('{correct}/{total} recalled ({percent}%)', { correct: formatNumber(correct), total: formatNumber(graded.length), percent: formatNumber(pct) })}</p>
        {streak > 0 && <p style={{ color: '#f59e0b', margin: '0 0 16px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>🔥 {t('{count}-day streak!', { count: formatNumber(streak) })}</p>}

        {/* Grade breakdown pills */}
        {graded.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: t('Again'), count: againCount, color: '#e05252', show: againCount > 0 },
              { label: t('Hard'),  count: hardCount,  color: '#f59e0b', show: hardCount  > 0 },
              { label: t('Good'),  count: goodCount,  color: '#4f86f7', show: goodCount  > 0 },
              { label: t('Easy'),  count: easyCount,  color: '#52b788', show: easyCount  > 0 },
            ].filter(g => g.show).map(g => (
              <span key={g.label} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: `${g.color}22`, color: g.color, fontWeight: 700 }}>
                {g.count} {g.label}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16, fontSize: 'var(--text-sm)' }}>
          {[{ label:t('New'), val:ns.new, color:'#4f86f7' }, { label:t('Learning'), val:ns.learning, color:'#f59e0b' }, { label:t('Mature'), val:ns.mature, color:'#52b788' }].map(s => (
            <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'10px 8px' }}>
              <div style={{ fontWeight:700, fontSize:'var(--text-lg)', color:s.color }}>{formatNumber(s.val)}</div>
              <div style={{ color:'var(--text-3)', fontSize:11 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Next review date */}
        {daysUntilNext !== null && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', margin: '0 0 12px' }}>
            {daysUntilNext === 1
              ? `📅 ${t('Next review due tomorrow')}`
              : `📅 ${t('Next review in {count} days ({date})', { count: daysUntilNext, date: futureDue! })}`}
          </p>
        )}

        {/* Daily goal progress */}
        <div style={{ marginBottom: 16, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
          {t('{done}/{goal} cards today', { done: formatNumber(todayCards), goal: formatNumber(dailyGoal) })}
          <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)', marginTop: 4, overflow: 'hidden' }}>
            <div style={{ width: `${goalPct}%`, height: '100%', background: goalPct >= 100 ? '#52b788' : '#4f86f7', transition: 'width 0.4s' }} />
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setSessionIdx(0); setFlip(false); setGraded([]); setPhase(ns.due > 0 ? 'review' : 'preview'); }}>
          {ns.due > 0 ? t('Review {count} remaining', { count: formatNumber(ns.due) }) : t('Browse all cards')}
        </button>
      </div>
    );
  }

  // ── Preview (browse) ─────────────────────────────────────────────────────────
  if (phase === 'preview') {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        {/* Deck header with rename */}
        <div className="flashcard-mobile-header" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {renaming ? (
            <input value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const nextName = nameInput.trim();
                  if (nextName) saveDeckState({ ...deck, name: nextName });
                  setRenaming(false);
                }
                if (e.key === 'Escape') setRenaming(false);
              }}
              autoFocus style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--accent)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--text-sm)', outline: 'none' }}
            />
          ) : (
            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer' }} onDoubleClick={() => { setNameInput(deck.name); setRenaming(true); }} title={t('Double-click to rename')}>
              📇 {deck.name}
            </span>
          )}
          {!renaming && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setNameInput(deck.name); setRenaming(true); }}>
              ✏️ {t('Rename deck')}
            </button>
          )}
          {[{ label:t('{count} new', { count: formatNumber(stats.new) }), color:'#4f86f7' }, { label:t('{count} learning', { count: formatNumber(stats.learning) }), color:'#f59e0b' }, { label:t('{count} mature', { count: formatNumber(stats.mature) }), color:'#52b788' }].map(b => (
            <span key={b.label} style={{ fontSize:10, padding:'2px 7px', borderRadius:12, background:`${b.color}22`, color:b.color, fontWeight:600 }}>{b.label}</span>
          ))}
          {retentionSummary.imageCards > 0 && (
            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:12, background:'rgba(168,85,247,0.14)', color:'#a855f7', fontWeight:600 }}>
              🖼 {t('{count} cards', { count: formatNumber(retentionSummary.imageCards) })}
            </span>
          )}
          {stats.due > 0 && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:12, background:'var(--accent-subtle,rgba(79,134,247,.12))', color:'var(--accent)', fontWeight:700, marginLeft:'auto' }}>{t('{count} due today', { count: formatNumber(stats.due) })}</span>}
          {streak > 0 && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:12, background:'#f59e0b22', color:'#f59e0b', fontWeight:700 }}>🔥 {t(streak === 1 ? '{count} day' : '{count} days', { count: formatNumber(streak) })}</span>}
        </div>

        {/* Daily goal bar */}
        {dailyGoal > 0 && (
          <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ width: `${goalPct}%`, height: '100%', background: goalPct >= 100 ? '#52b788' : '#4f86f7', transition: 'width 0.4s' }} />
            </div>
            <span>{t('{done}/{goal} today', { done: formatNumber(todayCards), goal: formatNumber(dailyGoal) })}{goalPct >= 100 ? ' ✓' : ''}</span>
          </div>
        )}

        {/* ── Action grid: 4×2, perfectly symmetric ─── */}
        <div className="flashcard-action-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 6, marginBottom: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => launchPhase('review')}>
            {stats.due > 0 ? `▶ ${t('Study {count}', { count: formatNumber(stats.due) })}` : `▶ ${t('Study all')}`}
          </button>
          <button className="btn btn-ghost btn-sm" title={t('Type the answer')} onClick={() => launchPhase('write')}>✍️ {t('Write')}</button>
          <button className="btn btn-ghost btn-sm" title={t('Mixed test')} onClick={() => launchPhase('test')}>🎯 {t('Test')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => launchPhase('match')}>🎮 {t('Match Game')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => launchPhase('learn')}>🎓 {t('Learn')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => launchPhase('stats')}>📊 {t('Stats')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => launchPhase('import')}>📥 {t('Import')}</button>
          {showBrowseButton ? (
            <button className="btn btn-ghost btn-sm" onClick={() => router.push('/coach')}>🧭 {t('Scholar Hub')}</button>
          ) : (
            <span />
          )}
        </div>

        {/* ── Compact tools / share row ─── */}
        <div className="flashcard-toolbar-row" style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => exportDeckCsv(deck)}>⬇ {t('Export CSV')}</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { void exportDeckApkg(deck); }}>📦 {t('Export Anki')}</button>
          <ShareToGroupButton deck={deck} t={t} />
          {showPublicActions && (
            <>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px', color: shareStatus==='done'?'#52b788':shareStatus==='error'?'#ef4444':undefined }} disabled={shareStatus==='loading'} onClick={handleShare}>
                {shareStatus==='loading'?'⏳':shareStatus==='done'?`✓ ${t('Shared')}`:shareStatus==='error'?`✗ ${t('Error')}`:`🔗 ${t('Share')}`}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 10px', color: publicStatus==='done'?'#52b788':publicStatus==='error'?'#ef4444':undefined }} disabled={publicStatus==='loading'} onClick={publishPublicDeck}>
                {publicStatus==='loading' ? `⏳ ${t('Publishing')}` : publicStatus==='done' ? `✓ ${t('Public')}` : publicStatus==='error' ? `✗ ${t('Retry')}` : `🚀 ${t('Publish')}`}
              </button>
            </>
          )}
          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={ttsEnabled} onChange={e => { setTtsEnabled(e.target.checked); try { localStorage.setItem('kivora-tts', e.target.checked ? '1' : '0'); } catch { /* noop */ } }} />
            {t('TTS on flip')}
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('Daily goal')}:
            <input type="number" min={1} max={500} value={dailyGoal} style={{ width: 50, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11 }}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v > 0) {
                  setDailyGoal(v);
                  saveGoalPreferences({ dailyGoal: v });
                  void fetch('/api/srs/preferences', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dailyGoal: v }),
                  }).catch(() => {});
                }
              }}
            />
          </label>
        </div>

        {/* Inline URL feedback */}
        {showPublicActions && shareStatus === 'done' && shareUrl && (
          <div style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginBottom:10, display:'flex', alignItems:'center', gap:8, background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:8, padding:'6px 10px' }}>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{shareUrl}</span>
            <button className="btn btn-ghost btn-sm" aria-label="Copy share link" style={{ padding:'2px 8px', fontSize:11, flexShrink:0 }} onClick={() => navigator.clipboard.writeText(shareUrl).catch(() => {})}>📋 {t('Copy')}</button>
          </div>
        )}
        {showPublicActions && publicStatus === 'done' && publicUrl && (
          <div style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginBottom:10, display:'flex', alignItems:'center', gap:8, background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:8, padding:'6px 10px' }}>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{publicUrl}</span>
            <button className="btn btn-ghost btn-sm" aria-label="Copy public link" style={{ padding:'2px 8px', fontSize:11, flexShrink:0 }} onClick={() => navigator.clipboard.writeText(publicUrl).catch(() => {})}>📋 {t('Copy')}</button>
          </div>
        )}

        {/* Description (publish) — shown only when publish flow is active */}
        {showPublicActions && (publicStatus === 'idle' || publicStatus === 'error') && (
          <div style={{ marginBottom: 10 }}>
            <input
              value={publicDescription}
              onChange={(e) => setPublicDescription(e.target.value)}
              placeholder={t('Optional public deck description')}
              style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)' }}
            />
          </div>
        )}

        {/* Deck description — always visible, saves on blur */}
        <div style={{ marginBottom: 14 }}>
          <textarea
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
            onBlur={() => {
              const nextDesc = descInput.trim();
              if ((deck.description ?? '') !== nextDesc) {
                saveDeckState({ ...deck, description: nextDesc });
              }
            }}
            placeholder={t('Add a short description for this deck')}
            style={{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, resize: 'vertical' }}
          />
        </div>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ fontWeight:600, fontSize:'var(--text-xs)', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1 }}>{t('Due cards — next 7 days')}</span>
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-3)' }}>{formatNumber(forecastPreview.reduce((sum, count) => sum + count, 0))}</span>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:56 }}>
            {forecastPreview.map((count, index) => {
              const date = new Date();
              date.setDate(date.getDate() + index);
              const label = index === 0 ? t('Today') : index === 1 ? t('Tomorrow') : formatDate(date, { weekday: 'short' });
              const height = count > 0 ? Math.max(8, Math.round((count / forecastPreviewMax) * 46)) : 4;
              return (
                <div key={`${label}-${index}`} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:9, color:'var(--text-3)', minHeight:12 }}>{count > 0 ? formatNumber(count) : ''}</div>
                  <div title={t('{date}: {count} cards', { date: label, count: formatNumber(count) })} style={{ width:'100%', height, borderRadius:3, background:count>0?(index===0?'#4f86f7':'#4f86f780'):'var(--surface-2)' }} />
                  <div style={{ fontSize:8, color:'var(--text-3)', lineHeight:1 }}>{label}</div>
                </div>
              );
            })}
          </div>
          {forecastPreview.every((count) => count === 0) && (
            <div style={{ marginTop:10, fontSize:'var(--text-xs)', color:'var(--text-3)' }}>{t('No cards due in the next week')}</div>
          )}
        </div>

        {/* Card grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 8 }}>
          {deck.cards.map((c, i) => {
            const mat = c.repetitions === 0 ? 'new' : c.interval >= 21 ? 'mature' : 'learning';
            const col = { new:'#4f86f7', learning:'#f59e0b', mature:'#52b788' }[mat];
            return (
              <div key={c.id} style={{ background:'var(--surface)', border:`1px solid var(--border-2)`, borderRadius:8, padding:'8px 10px', fontSize:'var(--text-xs)', borderLeft:`3px solid ${col}`, position:'relative', cursor:'pointer' }}
                onClick={() => {
                  const q = deck.cards.map(c => c.id);
                  setSessionQueue(q); setSessionBase(q.length);
                  setSessionIdx(i); setFlip(false); setPhase('review');
                }}>
                <button className="btn-icon" style={{ position:'absolute', top:4, right:4, fontSize:10, opacity:0.5, color:'var(--text-3)' }}
                  onClick={e => { e.stopPropagation(); setEditCardId(c.id); setEditFront(c.front); setEditBack(c.back); setEditFrontImg(c.frontImageKey ?? null); setEditBackImg(c.backImageKey ?? null); setFrontImgUrl(null); setBackImgUrl(null); setPhase('edit-card'); }}>✏️</button>
                <div style={{ fontWeight:600, marginBottom:3, paddingRight:16 }}>{c.front}</div>
                <div style={{ color:'var(--text-3)', marginBottom:4 }}>{c.back}</div>
                {(c.frontImageKey || c.backImageKey) && <div style={{ fontSize:10, color:'var(--text-3)' }}>🖼 {t('Image cards')}</div>}
                {c.repetitions > 0 && <div style={{ color:'var(--text-3)', fontSize:10 }}>{t('Next: {date} · {accuracy}% acc', { date: formatDate(c.nextReview), accuracy: formatNumber(Math.round((c.correctReviews / Math.max(1, c.totalReviews)) * 100)) })}</div>}
              </div>
            );
          })}
        </div>

        {/* ── Add card ─── */}
        <div style={{ marginTop: 14 }}>
          {!showAddCard ? (
            <button
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', borderStyle: 'dashed', color: 'var(--text-3)', justifyContent: 'center', gap: 6 }}
              onClick={() => setShowAddCard(true)}
            >
              + {t('Add card')}
            </button>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--accent)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>✨ {t('Add card')}</div>
              {(['Front', 'Back'] as const).map(face => (
                <div key={face}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{t(face)}</div>
                  <textarea
                    value={face === 'Front' ? addFront : addBack}
                    onChange={e => face === 'Front' ? setAddFront(e.target.value) : setAddBack(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAddCard(); }}
                    placeholder={face === 'Front' ? t('Term or question…') : t('Definition or answer…')}
                    style={{ width: '100%', minHeight: 56, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--text-sm)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none', display: 'block' }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddCard(false); setAddFront(''); setAddBack(''); }}>{t('Cancel')}</button>
                <button className="btn btn-primary btn-sm" disabled={!addFront.trim() || !addBack.trim()} onClick={handleAddCard}>
                  {t('Save card')}
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>{t('⌘↵ to save')}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Edit card ────────────────────────────────────────────────────────────────
  if (phase === 'edit-card') {
    const card = deck.cards.find(c => c.id === editCardId);
    if (!card) return null;

    async function handleImgUpload(face: 'front' | 'back', file: File) {
      const key  = `srs-img-${editCardId}-${face}`;
      await idbStore.put(key, { blob: file, name: file.name, type: file.type, size: file.size });
      const url = URL.createObjectURL(file);
      if (face === 'front') { setEditFrontImg(key); setFrontImgUrl(url); }
      else                  { setEditBackImg(key);  setBackImgUrl(url);  }
    }

    function handleSave() {
      const updated: SRSCard = { ...card!, front: editFront.trim() || card!.front, back: editBack.trim() || card!.back, frontImageKey: editFrontImg ?? undefined, backImageKey: editBackImg ?? undefined };
      saveDeckState({ ...deck!, cards: deck!.cards.map(c => c.id === editCardId ? updated : c) });
      setPhase('preview');
    }

    function removeImg(face: 'front' | 'back') {
      if (face === 'front') { setEditFrontImg(null); setFrontImgUrl(null); }
      else                  { setEditBackImg(null);  setBackImgUrl(null);  }
    }

    const imgStyle: React.CSSProperties = { width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 8, marginTop: 6, border: '1px solid var(--border-2)' };

    return (
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>✏️ {t('Edit card')}</span>
          <button className="btn-icon" style={{ marginLeft:'auto', fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>
        {(['front','back'] as const).map(face => (
          <div key={face} style={{ marginBottom: 14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{face === 'front' ? t('Front') : t('Back')}</div>
            <textarea value={face === 'front' ? editFront : editBack}
              onChange={e => face === 'front' ? setEditFront(e.target.value) : setEditBack(e.target.value)}
              style={{ width:'100%', minHeight:70, padding:'8px 12px', borderRadius:10, border:'1.5px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:'var(--text-sm)', fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none', display:'block' }}
            />
            {/* Image section */}
            {(face === 'front' ? frontImgUrl || editFrontImg : backImgUrl || editBackImg) ? (
              <div style={{ position:'relative', display:'inline-block', marginTop:6 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={face === 'front' ? (frontImgUrl ?? '') : (backImgUrl ?? '')} alt="" style={imgStyle} />
                <button style={{ position:'absolute', top:4, right:4, background:'#ef4444cc', color:'#fff', border:'none', borderRadius:4, padding:'2px 6px', fontSize:10, cursor:'pointer' }} onClick={() => removeImg(face)}>✕</button>
              </div>
            ) : (
              <label style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:6, fontSize:11, color:'var(--accent)', cursor:'pointer' }}>
                📷 {t('Add image')}
                <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImgUpload(face, f); }} />
              </label>
            )}
          </div>
        ))}
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>{t('Save changes')}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>{t('Cancel')}</button>
        </div>
      </div>
    );
  }

  // ── Write mode ───────────────────────────────────────────────────────────────
  if (phase === 'write') {
    if (writeIdx >= writeQueue.length && writeQueue.length > 0) {
      const correct = writeScores.filter(s => s.got).length;
      const pct     = writeScores.length > 0 ? Math.round(correct / writeScores.length * 100) : 0;
      const missed  = writeScores.filter(s => !s.got).map(s => deck.cards.find(c => c.id === s.cardId)).filter(Boolean) as SRSCard[];
      return (
        <div style={{ textAlign:'center', padding:'32px 20px', maxWidth:480, margin:'0 auto' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{pct >= 80 ? '✍️' : '📝'}</div>
          <h3 style={{ margin:'0 0 6px' }}>{t('Write mode complete!')}</h3>
          <p style={{ color:'var(--text-3)', margin:'0 0 16px' }}>{t('{correct}/{total} correct ({pct}%)', { correct: formatNumber(correct), total: formatNumber(writeScores.length), pct: formatNumber(pct) })}</p>
          {missed.length > 0 && (
            <div style={{ textAlign:'left', marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>{t('Review these ({count})', { count: formatNumber(missed.length) })}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {missed.map(c => (
                  <div key={c.id} style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderLeft:'3px solid #ef4444', borderRadius:8, padding:'8px 12px', fontSize:'var(--text-xs)', textAlign:'left' }}>
                    <div style={{ fontWeight:600, marginBottom:2 }}>{c.front}</div>
                    <div style={{ color:'var(--text-3)' }}>{c.back}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { const s=[...deck!.cards].sort(()=>Math.random()-.5).map(c=>c.id); setWriteQueue(s); setWriteIdx(0); setWriteInput(''); setWriteRevealed(false); setWriteScores([]); }}>↺ {t('Try again')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>{`← ${t('Go back')}`}</button>
          </div>
        </div>
      );
    }
    const wCard = deck.cards.find(c => c.id === writeQueue[writeIdx]);
    if (!wCard) return null;
    const isChecked = writeRevealed;
    const isCorrect = isChecked && fuzzyMatch(writeInput, wCard.back);
    const writePct  = Math.round(writeIdx / writeQueue.length * 100);

    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:540, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, height:5, borderRadius:3, background:'var(--surface-2)', overflow:'hidden' }}><div style={{ width:`${writePct}%`, height:'100%', borderRadius:3, background:'var(--accent)', transition:'width 0.4s' }} /></div>
          <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', whiteSpace:'nowrap' }}>{writeIdx}/{writeQueue.length}</span>
          <button className="btn-icon" style={{ fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1 }}>{`✍️ ${t('Write the definition')}`}</div>
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:12, padding:'20px 24px', textAlign:'center', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontWeight:600, fontSize:'var(--text-base)' }}>{wCard.front}</div>
        </div>
        <div>
          <textarea ref={writeRef} value={writeInput} disabled={isChecked} autoFocus
            onChange={e => setWriteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isChecked) { e.preventDefault(); setWriteRevealed(true); } }}
            placeholder={t('Type your answer…')}
            style={{ width:'100%', minHeight:80, padding:'10px 14px', borderRadius:10, resize:'vertical', border:`1.5px solid ${isChecked?(isCorrect?'#52b788':'#ef4444'):'var(--border-2)'}`, background:isChecked?(isCorrect?'color-mix(in srgb,#52b788 10%,var(--surface))':'color-mix(in srgb,#ef4444 10%,var(--surface))'):'var(--surface)', color:'var(--text)', fontSize:'var(--text-sm)', fontFamily:'inherit', boxSizing:'border-box', outline:'none', display:'block' }}
          />
          {!isChecked && <div style={{ fontSize:11, color:'var(--text-3)', marginTop:4 }}>{t('Enter to check · Shift+Enter for newline')}</div>}
        </div>
        {!isChecked ? (
          <button className="btn btn-primary btn-sm" style={{ alignSelf:'flex-end' }} disabled={!writeInput.trim()} onClick={() => setWriteRevealed(true)}>{`${t('Check')} →`}</button>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5 }}>{t('Correct answer')}</div>
              <div style={{ fontSize:'var(--text-sm)' }}>{wCard.back}</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <span style={{ flex:1, fontSize:'var(--text-sm)', fontWeight:600, color:isCorrect?'#52b788':'#ef4444' }}>{isCorrect?`✓ ${t('Looks correct!')}`:`✗ ${t('Not quite right')}`}</span>
              <button className="btn btn-ghost btn-sm" style={{ background:'color-mix(in srgb,#ef4444 12%,var(--surface))', color:'#ef4444' }} onClick={() => { setWriteScores(p=>[...p,{cardId:writeQueue[writeIdx],got:false}]); setWriteIdx(i=>i+1); setWriteInput(''); setWriteRevealed(false); setTimeout(()=>writeRef.current?.focus(),50); }}>{`✗ ${t('Got wrong')}`}</button>
              <button className="btn btn-primary btn-sm" style={{ background:'#52b788', borderColor:'#52b788' }} onClick={() => { setWriteScores(p=>[...p,{cardId:writeQueue[writeIdx],got:true}]); setWriteIdx(i=>i+1); setWriteInput(''); setWriteRevealed(false); setTimeout(()=>writeRef.current?.focus(),50); }}>{`✓ ${t('Got right')}`}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Test mode ────────────────────────────────────────────────────────────────
  if (phase === 'test') {
    if (testDone || (testQuestions.length > 0 && testIdx >= testQuestions.length)) {
      let correct = 0;
      testQuestions.forEach((q, i) => { const a = testAnswers[i] ?? ''; if (q.type === 'written' ? fuzzyMatch(a, q.correctAnswer) : a === q.correctAnswer) correct++; });
      const pct = testQuestions.length > 0 ? Math.round(correct / testQuestions.length * 100) : 0;
      return (
        <div style={{ maxWidth:560, margin:'0 auto' }}>
          <div style={{ textAlign:'center', padding:'20px 0 16px' }}>
            <div style={{ fontSize:48, marginBottom:10 }}>{pct>=80?'🎯':pct>=60?'📚':'💪'}</div>
            <h3 style={{ margin:'0 0 6px' }}>{t('Test complete!')}</h3>
            <p style={{ color:'var(--text-3)', margin:'0 0 16px' }}>{t('{correct}/{total} correct ({percent}%)', { correct: formatNumber(correct), total: formatNumber(testQuestions.length), percent: formatNumber(pct) })}</p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:20 }}>
            {testQuestions.map((q, i) => { const a = testAnswers[i]??''; const got = q.type==='written'?fuzzyMatch(a,q.correctAnswer):a===q.correctAnswer; return (
              <div key={i} style={{ background:'var(--surface)', borderRadius:8, padding:'10px 12px', fontSize:'var(--text-xs)', border:`1px solid ${got?'#52b78840':'#ef444440'}`, borderLeft:`3px solid ${got?'#52b788':'#ef4444'}` }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:10, padding:'1px 5px', borderRadius:6, background:q.type==='mcq'?'#4f86f720':q.type==='tf'?'#f59e0b20':'#52b78820', color:q.type==='mcq'?'#4f86f7':q.type==='tf'?'#f59e0b':'#52b788', fontWeight:600 }}>{q.type==='mcq'?'MCQ':q.type==='tf'?'T/F':t('Written')}</span>
                  <span style={{ fontWeight:600 }}>{q.question}</span>
                </div>
                <div style={{ color:'var(--text-3)' }}>{`${t('Your answer')}: `}<span style={{ color:got?'#52b788':'#ef4444' }}>{a||t('(no answer)')}</span></div>
                {!got&&<div style={{ color:'#52b788', marginTop:2 }}>✓ {q.correctAnswer}</div>}
              </div>
            ); })}
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { const qs=buildTestQuestions(deck!); setTestQuestions(qs); setTestAnswers({}); setTestIdx(0); setTestDone(false); setTestWritten(''); }}>{`↺ ${t('New test')}`}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>{`← ${t('Go back')}`}</button>
          </div>
        </div>
      );
    }
    if (testQuestions.length === 0) return null;
    const q = testQuestions[testIdx];
    const testPct = Math.round(testIdx / testQuestions.length * 100);
    const curAns  = testAnswers[testIdx];
    function answerTest(a: string) {
      setTestAnswers(prev => ({ ...prev, [testIdx]: a }));
      if (q.type !== 'written') setTimeout(() => { const last = testIdx + 1 >= testQuestions.length; if (last) setTestDone(true); else { setTestIdx(i=>i+1); setTestWritten(''); } }, 700);
    }
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:540, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ flex:1, height:5, borderRadius:3, background:'var(--surface-2)', overflow:'hidden' }}><div style={{ width:`${testPct}%`, height:'100%', borderRadius:3, background:'#f59e0b', transition:'width 0.4s' }} /></div>
          <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', whiteSpace:'nowrap' }}>{testIdx+1}/{testQuestions.length}</span>
          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, fontWeight:600, background:q.type==='mcq'?'#4f86f720':q.type==='tf'?'#f59e0b20':'#52b78820', color:q.type==='mcq'?'#4f86f7':q.type==='tf'?'#f59e0b':'#52b788' }}>{q.type==='mcq'?t('Multiple Choice'):q.type==='tf'?t('True / False'):t('Written')}</span>
          <button className="btn-icon" style={{ fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:12, padding:'20px 24px', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center' }}>
          <div style={{ fontWeight:600, fontSize:'var(--text-base)' }}>{q.question}</div>
        </div>
        {q.options && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {q.options.map((opt, oi) => {
              const picked = curAns === opt; const correct = opt === q.correctAnswer;
              let bg='var(--surface-2)', col='var(--text)', bdr='var(--border-2)';
              if (curAns) { if (picked && correct){bg='color-mix(in srgb,#52b788 20%,var(--surface))';col='#52b788';bdr='#52b788';} if (picked&&!correct){bg='color-mix(in srgb,#ef4444 20%,var(--surface))';col='#ef4444';bdr='#ef4444';} if (!picked&&correct){bg='color-mix(in srgb,#52b788 15%,var(--surface))';col='#52b788';bdr='#52b78860';} }
              return <div key={oi} onClick={() => !curAns && answerTest(opt)} style={{ padding:'12px 14px', borderRadius:10, cursor:curAns?'default':'pointer', background:bg, color:col, border:`1px solid ${bdr}`, fontSize:'var(--text-sm)', textAlign:'center', fontWeight:picked?600:400, transition:'all 0.15s' }}>{opt}</div>;
            })}
          </div>
        )}
        {q.type === 'written' && !curAns && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <input type="text" value={testWritten} autoFocus onChange={e=>setTestWritten(e.target.value)} onKeyDown={e=>e.key==='Enter'&&testWritten.trim()&&answerTest(testWritten.trim())} placeholder={t('Type your answer and press Enter…')} style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:'var(--text-sm)', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }} />
            <button className="btn btn-primary btn-sm" style={{ alignSelf:'flex-end' }} disabled={!testWritten.trim()} onClick={() => testWritten.trim()&&answerTest(testWritten.trim())}>{`${t('Submit')} →`}</button>
          </div>
        )}
        {q.type === 'written' && curAns && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', marginBottom:4 }}>{`${t('Your answer')}: `}<span style={{ color:fuzzyMatch(curAns,q.correctAnswer)?'#52b788':'#ef4444' }}>{curAns}</span></div>
              <div style={{ fontSize:'var(--text-xs)', color:'var(--text-3)' }}>{`${t('Correct')}: `}<span style={{ color:'#52b788' }}>{q.correctAnswer}</span></div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ alignSelf:'flex-end' }} onClick={() => { const last=testIdx+1>=testQuestions.length; if(last)setTestDone(true); else{setTestIdx(i=>i+1);setTestWritten('');} }}>{`${t('Next')} →`}</button>
          </div>
        )}
      </div>
    );
  }

  // ── Stats mode ───────────────────────────────────────────────────────────────
  if (phase === 'stats') {
    const totalRev  = deck.cards.reduce((s, c) => s + c.totalReviews, 0);
    const reviewed  = deck.cards.filter(c => c.totalReviews > 0);
    const avgAcc    = reviewed.length > 0 ? Math.round(reviewed.reduce((s,c) => s + c.correctReviews/c.totalReviews*100, 0) / reviewed.length) : null;
    const cardStats = deck.cards.map(c => ({ card:c, acc: c.totalReviews>0?Math.round(c.correctReviews/c.totalReviews*100):null, mat: c.repetitions===0?'new':c.interval>=21?'mature':'learning' })).sort((a,b) => (a.acc??999)-(b.acc??999));
    const weakCount = cardStats.filter(s => s.acc !== null && s.acc < 60).length;
    const forecast  = getWorkloadForecast(deck, 14);
    const maxFore   = Math.max(...forecast, 1);

    return (
      <div style={{ maxWidth:560, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{`📊 ${t('Progress — {name}', { name: deck.name })}`}</span>
          <button className="btn-icon" style={{ marginLeft:'auto', fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>

        {/* Summary */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:20 }}>
          {[{ label:t('Total cards'), val:formatNumber(deck.cards.length), color:'var(--text)' }, { label:t('Reviews'), val:formatNumber(totalRev), color:'#4f86f7' }, { label:t('Avg accuracy'), val:avgAcc!==null?`${formatNumber(avgAcc)}%`:'—', color:'#52b788' }, { label:t('Weak cards'), val:formatNumber(weakCount), color:weakCount>0?'#ef4444':'#52b788' }].map(s => (
            <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
              <div style={{ fontWeight:700, fontSize:'var(--text-lg)', color:s.color }}>{s.val}</div>
              <div style={{ color:'var(--text-3)', fontSize:10 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Streak & heatmap */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
            <span style={{ fontWeight:600, fontSize:'var(--text-xs)', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1 }}>{t('Study activity')}</span>
            {streak > 0 && <span style={{ fontSize:11, color:'#f59e0b', fontWeight:700 }}>🔥 {t('{count}-day streak!', { count: formatNumber(streak) })}</span>}
          </div>
          <StudyHeatmap sessions={sessions} t={t} formatNumber={formatNumber} />
        </div>

        {/* 14-day workload forecast */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:'var(--text-xs)', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{t('Due cards — next 14 days')}</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:50 }}>
            {forecast.map((count, i) => {
              const d = new Date(); d.setDate(d.getDate() + i);
              const label = i === 0 ? t('Today') : i === 1 ? t('Tomorrow') : formatDate(d, { month: 'numeric', day: 'numeric' });
              const h = count > 0 ? Math.max(6, Math.round(count / maxFore * 44)) : 4;
              return (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                  <div style={{ fontSize:9, color:'var(--text-3)', lineHeight:1 }}>{count ? formatNumber(count) : ''}</div>
                  <div title={t('{date}: {count} cards', { date: label, count: formatNumber(count) })} style={{ width:'100%', height:h, borderRadius:2, background:count>0?(i===0?'#4f86f7':'#4f86f780'):'var(--surface-2)', transition:'height 0.3s' }} />
                  <div style={{ fontSize:8, color:'var(--text-3)', lineHeight:1 }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'12px 10px' }}>
            <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{t('Avg recall confidence')}</div>
            <div style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'#4f86f7' }}>
              {retentionSummary.averageRetrievability !== null ? `${formatNumber(Math.round(retentionSummary.averageRetrievability * 100))}%` : '—'}
            </div>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'12px 10px' }}>
            <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{t('Average stability')}</div>
            <div style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'#52b788' }}>
              {retentionSummary.averageStability !== null ? `${formatNumber(retentionSummary.averageStability, { maximumFractionDigits: 1 })}d` : '—'}
            </div>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'12px 10px' }}>
            <div style={{ fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{t('Image cards')}</div>
            <div style={{ fontSize:'var(--text-lg)', fontWeight:700, color:'#a855f7' }}>
              {formatNumber(retentionSummary.imageCards)}
            </div>
          </div>
        </div>

        <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
          <div style={{ fontWeight:600, fontSize:'var(--text-xs)', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{t('Recent reviews')}</div>
          {reviewHistory.length === 0 ? (
            <div style={{ fontSize:'var(--text-sm)', color:'var(--text-3)' }}>{t('No review history yet')}</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {reviewHistory.slice(0, 6).map((event) => (
                <div key={event.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:8, background:'var(--surface-2)' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:event.correct ? '#52b788' : '#ef4444', minWidth:48 }}>
                    {t(GRADES[event.grade]?.label ?? 'Good')}
                  </span>
                  <span style={{ fontSize:11, color:'var(--text-3)', minWidth:88 }}>{formatDate(event.reviewedAt)}</span>
                  <span style={{ fontSize:11, color:'var(--text-2)' }}>{t('Next review: {date} · interval {count}d', { date: formatDate(event.nextReview), count: formatNumber(event.interval) })}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Per-card breakdown */}
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
          {t('Card performance')} {weakCount>0?`— ${t('{count} weak', { count: formatNumber(weakCount) })}`:''}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {cardStats.map(({ card, acc, mat }) => {
            const mc = { new:'#4f86f7', learning:'#f59e0b', mature:'#52b788' }[mat];
            const bc = acc===null?'#4f86f7':acc<50?'#ef4444':acc<75?'#f59e0b':'#52b788';
            return (
              <div key={card.id} style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:8, padding:'8px 12px', borderLeft:`3px solid ${mc}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:acc!==null?4:0 }}>
                  <div style={{ flex:1, fontWeight:600, fontSize:'var(--text-xs)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{card.front}</div>
                  <div style={{ fontSize:12, color:bc, fontWeight:700 }}>{acc!==null?`${formatNumber(acc)}%`:t('New')}</div>
                </div>
                {acc !== null && <div style={{ height:4, borderRadius:2, background:'var(--surface-2)', overflow:'hidden', marginBottom:4 }}><div style={{ width:`${acc}%`, height:'100%', background:bc, borderRadius:2 }} /></div>}
                <div style={{ fontSize:10, color:'var(--text-3)' }}>{card.totalReviews>0?t('{count} reviews · next: {date}', { count: formatNumber(card.totalReviews), date: formatDate(card.nextReview) }):t('Not yet reviewed')}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Import mode ──────────────────────────────────────────────────────────────
  if (phase === 'import') {
    const previewCount = importText.trim().split('\n').filter(Boolean).length;
    function handleImport() {
      const cards = parseImportText(importText);
      if (!cards) { setImportError(t('Could not parse. Use "term, definition" or tab-separated per line.')); return; }
      importParsedCards(cards, t('Imported ({count} cards)', { count: formatNumber(cards.length) }));
    }
    return (
      <div style={{ maxWidth:540, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <span style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{`📥 ${t('Import cards')}`}</span>
          <button className="btn-icon" style={{ marginLeft:'auto', fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>
        <div style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginBottom:12, lineHeight:1.7 }}>
          {t('One card per line. Separate term and definition with a comma or tab.')}<br />
          Example: <code style={{ background:'var(--surface-2)', padding:'1px 5px', borderRadius:4, fontSize:11 }}>Mitosis, Cell division producing two identical daughter cells</code>
        </div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <input
            type="url"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            placeholder={t('Import from a Kivora shared review-set link')}
            style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:'var(--text-sm)', boxSizing:'border-box', outline:'none' }}
          />
          <button className="btn btn-secondary btn-sm" disabled={!importUrl.trim() || importUrlLoading} onClick={importFromUrl}>
            {importUrlLoading ? '⏳' : t('Import link')}
          </button>
        </div>
        <div style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginBottom:12, lineHeight:1.7 }}>
          Quizlet works best as <strong>export → paste</strong>. Direct Quizlet links are kept as a legacy fallback and may be blocked.
        </div>
        <textarea value={importText} autoFocus onChange={e => { setImportText(e.target.value); setImportError(''); }}
          placeholder={'Term 1, Definition 1\nTerm 2, Definition 2'}
          style={{ width:'100%', minHeight:180, padding:'10px 14px', borderRadius:10, border:`1.5px solid ${importError?'#ef4444':'var(--border-2)'}`, background:'var(--surface)', color:'var(--text)', fontSize:'var(--text-sm)', fontFamily:'inherit', boxSizing:'border-box', resize:'vertical', outline:'none', display:'block' }}
        />
        {importError && <div style={{ fontSize:'var(--text-xs)', color:'#ef4444', marginTop:6 }}>{importError}</div>}
        {importText.trim() && !importError && <div style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginTop:6 }}>{t(previewCount === 1 ? '{count} line detected' : '{count} lines detected', { count: formatNumber(previewCount) })}</div>}
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn btn-primary btn-sm" disabled={!importText.trim()} onClick={handleImport}>{`${t('Import')} ${importText.trim()?t('{count} cards', { count: formatNumber(previewCount) }):''}`.trim()}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setImportText(''); setImportError(''); setPhase('preview'); }}>{t('Cancel')}</button>
        </div>
      </div>
    );
  }

  // ── Match game ───────────────────────────────────────────────────────────────
  if (phase === 'match') {
    const allMatched = matchPaired.size === deck.cards.length;
    const elapsed    = matchEnd > 0 ? Math.round((matchEnd - matchStart) / 1000) : Math.round((Date.now() - matchStart) / 1000);
    function handleMatchTerm(cardId: string) {
      if (matchPaired.has(cardId)) return;
      if (matchSelected === cardId) { setMatchSelected(null); return; }
      // Whether nothing was selected or a different term was — just select this one
      setMatchSelected(cardId);
    }
    function handleMatchDef(cardId: string) {
      if (matchPaired.has(cardId) || !matchSelected) return;
      if (matchSelected === cardId) { setMatchFlash({ id:cardId, ok:true }); setTimeout(() => { setMatchPaired(prev => { const n=new Set(prev); n.add(cardId); return n; }); setMatchSelected(null); setMatchFlash(null); if (deck && matchPaired.size+1===deck.cards.length) setMatchEnd(Date.now()); }, 300); }
      else { setMatchFlash({ id:cardId, ok:false }); setTimeout(() => setMatchFlash(null), 600); }
    }
    return (
      <div style={{ maxWidth:640, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <span style={{ fontWeight:600, fontSize:'var(--text-sm)' }}>{`🎮 ${t('Match Game')}`}</span>
          <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)' }}>{t('{matched}/{total} matched', { matched: formatNumber(matchPaired.size), total: formatNumber(deck.cards.length) })}</span>
          {!allMatched && <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', marginLeft:'auto' }}>⏱ {elapsed}s</span>}
          <button className="btn-icon" style={{ fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>
        {allMatched ? (
          <div style={{ textAlign:'center', padding:'32px 20px' }}>
            <div style={{ fontSize:48, marginBottom:10 }}>🎉</div>
            <h3 style={{ margin:'0 0 6px' }}>{t('All matched!')}</h3>
            <p style={{ color:'var(--text-3)' }}>{t('Completed in {count} seconds', { count: formatNumber(elapsed) })}</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { const d=[...deck.cards].sort(()=>Math.random()-.5).map(c=>({id:c.id,text:c.back})); setMatchShuffledDefs(d); setMatchSelected(null); setMatchPaired(new Set()); setMatchFlash(null); setMatchStart(Date.now()); setMatchEnd(0); }}>↺ {t('Play again')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>{`← ${t('Go back')}`}</button>
            </div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', marginBottom:2, textTransform:'uppercase', letterSpacing:1 }}>{t('Terms')}</div>
              {deck.cards.map(c => { const paired=matchPaired.has(c.id); const sel=matchSelected===c.id; const flash=matchFlash?.id===c.id; return <div key={c.id} onClick={()=>!paired&&handleMatchTerm(c.id)} style={{ padding:'10px 12px', borderRadius:8, cursor:paired?'default':'pointer', fontSize:'var(--text-xs)', lineHeight:1.4, transition:'all 0.15s', background:paired?'color-mix(in srgb,#52b788 15%,var(--surface))':sel?'var(--accent)':flash?(matchFlash?.ok?'#52b78820':'#ef444420'):'var(--surface-2)', color:paired?'#52b788':sel?'#fff':'var(--text)', border:`1px solid ${paired?'#52b78840':sel?'var(--accent)':'var(--border-2)'}`, opacity:paired?.6:1 }}>{paired?'✓ ':''}{c.front}</div>; })}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', marginBottom:2, textTransform:'uppercase', letterSpacing:1 }}>{t('Definitions')}</div>
              {matchShuffledDefs.map(def => { const paired=matchPaired.has(def.id); const flash=matchFlash?.id===def.id; const active=!!matchSelected&&!paired; return <div key={def.id} onClick={()=>!paired&&active&&handleMatchDef(def.id)} style={{ padding:'10px 12px', borderRadius:8, cursor:(!paired&&active)?'pointer':'default', fontSize:'var(--text-xs)', lineHeight:1.4, transition:'all 0.15s', background:paired?'color-mix(in srgb,#52b788 15%,var(--surface))':flash?(matchFlash?.ok?'#52b78820':'#ef444420'):active?'var(--surface)':'var(--surface-2)', color:paired?'#52b788':flash&&!matchFlash?.ok?'#ef4444':'var(--text)', border:`1px solid ${paired?'#52b78840':flash&&!matchFlash?.ok?'#ef4444':active?'var(--accent)':'var(--border-2)'}`, opacity:paired?.6:1, transform:flash&&!matchFlash?.ok?'translateX(-4px)':'none' }}>{paired?'✓ ':''}{def.text}</div>; })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Learn mode ───────────────────────────────────────────────────────────────
  if (phase === 'learn') {
    const learnDone = learnQueue.length === 0;
    function buildOpts(cardId: string): string[] {
      const correct = deck!.cards.find(c => c.id === cardId)?.back ?? '';
      const dist    = deck!.cards.filter(c => c.id !== cardId).map(c => c.back).sort(()=>Math.random()-.5).slice(0,3);
      return [correct, ...dist].sort(() => Math.random() - 0.5);
    }
    const lCardId = learnQueue[learnIdx] ?? null;
    const lCard   = deck.cards.find(c => c.id === lCardId) ?? null;
    const lOpts   = learnOptions.length === 4 ? learnOptions : (lCardId ? buildOpts(lCardId) : []);

    function pickAnswer(opt: string) {
      if (learnPicked) return;
      setLearnPicked(opt);
      const isRight = opt === lCard?.back;
      const nextId  = isRight ? null : lCardId!;
      setTimeout(() => {
        setLearnQueue(prev => { const w=prev.filter((_,i)=>i!==learnIdx); return nextId?[...w,nextId]:w; });
        if (isRight) setLearnCorrect(p=>p+1);
        setLearnIdx(0); setLearnPicked(null);
        const nId = learnQueue[learnIdx+(learnIdx+1<learnQueue.length?1:0)];
        if (nId && nId!==lCardId) setLearnOptions(buildOpts(nId)); else setLearnOptions([]);
      }, 900);
    }

    if (learnDone) {
      const acc = Math.round(learnCorrect/learnTotal*100);
      return (
        <div style={{ textAlign:'center', padding:'32px 20px', maxWidth:480, margin:'0 auto' }}>
          <div style={{ fontSize:48, marginBottom:10 }}>{acc===100?'🎉':acc>=70?'📚':'💪'}</div>
          <h3 style={{ margin:'0 0 6px' }}>{t('Learn complete!')}</h3>
          <p style={{ color:'var(--text-3)' }}>{t('All {count} cards correct!', { count: formatNumber(learnTotal) })}</p>
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { const ids=deck!.cards.map(c=>c.id).sort(()=>Math.random()-.5); setLearnQueue(ids); setLearnIdx(0); setLearnPicked(null); setLearnCorrect(0); setLearnTotal(ids.length); setLearnOptions([]); }}>↺ {t('Restart')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase('preview')}>{`← ${t('Go back')}`}</button>
          </div>
        </div>
      );
    }
    if (!lCard) return null;
    const lPct = Math.round((learnTotal - learnQueue.length) / learnTotal * 100);
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:540, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1, height:5, borderRadius:3, background:'var(--surface-2)', overflow:'hidden' }}><div style={{ width:`${lPct}%`, height:'100%', borderRadius:3, background:'#52b788', transition:'width 0.4s' }} /></div>
          <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', whiteSpace:'nowrap' }}>{learnTotal-learnQueue.length}/{learnTotal}</span>
          <button className="btn-icon" style={{ fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
        </div>
        <div style={{ background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:12, padding:'20px 24px', textAlign:'center', minHeight:100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontWeight:600, fontSize:'var(--text-base)' }}>{lCard.front}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {lOpts.map((opt, i) => {
            const isCor=opt===lCard.back, isPick=learnPicked===opt;
            let bg='var(--surface-2)', col='var(--text)', bdr='var(--border-2)';
            if (isPick&&isCor){bg='color-mix(in srgb,#52b788 20%,var(--surface))';col='#52b788';bdr='#52b788';}
            if (isPick&&!isCor){bg='color-mix(in srgb,#ef4444 20%,var(--surface))';col='#ef4444';bdr='#ef4444';}
            if (learnPicked&&!isPick&&isCor){bg='color-mix(in srgb,#52b788 20%,var(--surface))';col='#52b788';bdr='#52b788';}
            return <div key={i} onClick={() => pickAnswer(opt)} style={{ padding:'12px 14px', borderRadius:10, cursor:learnPicked?'default':'pointer', background:bg, color:col, border:`1px solid ${bdr}`, fontSize:'var(--text-sm)', lineHeight:1.4, transition:'all 0.15s', fontWeight:isPick?600:400 }}>{String.fromCharCode(65+i)}. {opt}</div>;
          })}
        </div>
      </div>
    );
  }

  // ── Review mode ──────────────────────────────────────────────────────────────
  const card      = allCards[Math.min(sessionIdx, allCards.length - 1)];
  const revPct    = Math.round(Math.min(sessionIdx, totalSession) / Math.max(totalSession, 1) * 100);
  const gradeIntervals = card
    ? ([0,1,2,3] as const).map(g => g === 0 ? '~10m' : fmtInterval(gradeCard(card, g).interval))
    : ['~10m', '?', '?', '?'];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14, maxWidth:540, margin:'0 auto' }}>
      <div className="flashcard-review-top" style={{ display:'flex', alignItems:'center', gap:10, flexWrap: 'wrap' }}>
        <div style={{ flex:1, height:5, borderRadius:3, background:'var(--surface-2)', overflow:'hidden' }}><div style={{ width:`${revPct}%`, height:'100%', borderRadius:3, background:'var(--accent)', transition:'width 0.4s' }} /></div>
        <span style={{ fontSize:'var(--text-xs)', color:'var(--text-3)', whiteSpace:'nowrap' }}>{sessionIdx+1}/{totalSession}</span>
        <button className="btn-icon" style={{ fontSize:11, color:'var(--text-3)' }} onClick={() => setPhase('preview')}>✕</button>
      </div>

      {/* Swipe hints */}
      {flip && <div style={{ display:'flex', justifyContent:'center', gap:16, fontSize:10, color:'var(--text-3)' }}>
        <span>← / 1 {t('Again')}</span><span>2 {t('Hard')}</span><span>3 {t('Good')}</span><span>4 / ↑ {t('Easy')}</span>
      </div>}

      <div className="flashcard-wrap" style={{ minHeight:200, userSelect:'none' }}
        onClick={() => { if (!flip) { setFlip(true); if (ttsEnabled) speak(card.back); } }}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className={`flashcard${flip ? ' flipped' : ''}`} style={{ minHeight:200 }}>
          <div className="flashcard-face">
            <div className="flashcard-label">{t('Front')}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {reviewFrontUrl && <img src={reviewFrontUrl} alt="" style={{ maxWidth:'100%', maxHeight:120, objectFit:'contain', borderRadius:8, marginBottom:8 }} />}
            <div className="flashcard-text">{card.front}</div>
            {!flip && <small style={{ marginTop:'auto', color:'var(--text-3)', paddingTop:12 }}>{t('Tap to reveal · swipe to grade')}</small>}
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="flashcard-label">{t('Back')}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {reviewBackUrl && <img src={reviewBackUrl} alt="" style={{ maxWidth:'100%', maxHeight:120, objectFit:'contain', borderRadius:8, marginBottom:8 }} />}
            <div className="flashcard-text">{card.back}</div>
            {ttsEnabled && <button style={{ marginTop:'auto', background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', fontSize:12 }} onClick={e => { e.stopPropagation(); speak(card.back); }}>🔊</button>}
          </div>
        </div>
      </div>

      {flip ? (
        <div className="flashcard-grade-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px,1fr))', gap:8 }}>
          {GRADES.map((g, gi) => (
            <button key={g.grade} onClick={() => doGrade(g.grade)} title={t(g.hint)}
              style={{ border:`1.5px solid ${g.color}40`, borderRadius:10, padding:'10px 4px 8px', cursor:'pointer', background:`${g.color}14`, color:g.color, fontWeight:700, fontSize:'var(--text-sm)', transition:'all 0.12s', lineHeight:1.2 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${g.color}28`; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${g.color}14`; (e.currentTarget as HTMLButtonElement).style.transform = ''; }}
            >
              <div style={{ fontSize:11, fontWeight:700, opacity:0.65, marginBottom:2 }}>{gradeIntervals[gi]}</div>
              {t(g.label)}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display:'flex', justifyContent:'center' }}>
          <button className="btn btn-secondary" style={{ minWidth: 160, padding: '10px 24px', fontSize: 'var(--text-base)', fontWeight: 600 }} onClick={() => { setFlip(true); if (ttsEnabled) speak(card.back); }}>{t('Show answer')}</button>
        </div>
      )}
    </div>
  );
}
