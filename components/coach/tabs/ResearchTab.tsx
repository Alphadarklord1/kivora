'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { writeScholarContext } from '@/lib/coach/scholar-context';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { ResearchMode, ResearchRanking, TopicResearchResult, CitationFormat } from '@/lib/coach/research';
import { formatCitations, buildMyBibUrl, buildMyBibCiteUrl } from '@/lib/coach/research';
import type { ResolvedPaper } from '@/lib/coach/doi';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';
import styles from '@/app/(dashboard)/coach/page.module.css';

interface SavedSourceRow {
  id: string;
  title: string;
  url: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  abstract: string | null;
  sourceType: string | null;
  notes: string | null;
  savedAt: string;
}

interface RecentTopicEntry {
  topic: string;
  savedAt: string;
  sourceCount: number;
}

type ReportSeed = {
  topic: string;
  reportType?: 'essay' | 'report' | 'literature_review';
  wordCount?: number;
  keyPoints?: string;
};

const RECENT_TOPICS_KEY = 'kivora.scholar.recent-topics';

function loadRecentTopics(): RecentTopicEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_TOPICS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentTopicEntry => Boolean(item?.topic && typeof item.topic === 'string'))
      .slice(0, 6);
  } catch {
    return [];
  }
}

function toBibTeX(s: SavedSourceRow): string {
  const key = [
    s.authors?.split(';')[0]?.split(',')[0]?.trim().replace(/\s+/g, '') ?? 'Unknown',
    s.year ?? 'nd',
    s.title.split(/\s+/).slice(0, 3).join(''),
  ].join('').replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);

  const type = s.sourceType === 'arxiv' ? '@misc' : '@article';
  const lines: string[] = [
    `${type}{${key},`,
    `  title     = {${s.title}},`,
    ...(s.authors ? [`  author    = {${s.authors}},`] : []),
    ...(s.journal  ? [`  journal   = {${s.journal}},`] : []),
    ...(s.year     ? [`  year      = {${s.year}},`] : []),
    ...(s.doi      ? [`  doi       = {${s.doi}},`] : []),
    `  url       = {${s.url}},`,
    `}`,
  ];
  return lines.join('\n');
}

function toAPA(s: SavedSourceRow): string {
  const authPart = s.authors ?? 'Unknown';
  const yearPart = s.year ? `(${s.year})` : '(n.d.)';
  const journalPart = s.journal ? `. ${s.journal}` : '';
  return `${authPart} ${yearPart}. ${s.title}${journalPart}. ${s.url}`;
}

const LOCAL_AR: Record<string, string> = {
  'Could not load suggestions': 'تعذر تحميل الاقتراحات',
  'Could not load reading suggestions': 'تعذر تحميل اقتراحات القراءة',
  'Could not research this topic': 'تعذر البحث في هذا الموضوع',
  'Research brief ready from {count} sources': 'أصبح ملخص البحث جاهزًا من {count} مصدر',
  'No explanation returned': 'لم يتم إرجاع شرح',
  'Deep dive failed': 'فشل التعمق في السؤال',
  'Research brief downloaded': 'تم تنزيل ملخص البحث',
  'Could not export to Word': 'تعذر التصدير إلى Word',
  'Could not save to library': 'تعذر الحفظ في المكتبة',
  'Research brief saved to Library': 'تم حفظ ملخص البحث في المكتبة',
  'Could not save to Library': 'تعذر الحفظ في المكتبة',
  'Could not save source': 'تعذر حفظ المصدر',
  'Could not copy to clipboard': 'تعذر النسخ إلى الحافظة',
  'Could not save': 'تعذر الحفظ',
  'Q&A thread saved to Library': 'تم حفظ سلسلة الأسئلة والأجوبة في المكتبة',
  'Could not save thread': 'تعذر حفظ السلسلة',
  'Could not remove source': 'تعذر إزالة المصدر',
  'Network connection issue — try again in a moment.': 'هناك مشكلة في الاتصال بالشبكة — حاول مرة أخرى بعد قليل.',
  'Identifier not found': 'لم يتم العثور على المعرّف',
  'Search any topic — photosynthesis, French Revolution, quadratic equations…': 'ابحث عن أي موضوع — البناء الضوئي أو الثورة الفرنسية أو المعادلات التربيعية…',
  'Offline': 'غير متصل',
  'Searching…': 'جارٍ البحث…',
  'Search': 'بحث',
  'Advanced': 'متقدم',
  'Clear': 'مسح',
  'sources': 'مصادر',
  'citations': 'استشهادات',
  'via': 'عبر',
  'Auto': 'تلقائي',
  'Manual links': 'روابط يدوية',
  'Hybrid': 'مختلط',
  'Academic first': 'أكاديمي أولًا',
  'Broad web': 'ويب واسع',
  'Balanced': 'متوازن',
  'Search the web': 'ابحث في الويب',
  'One URL per line\nhttps://example.com/article': 'رابط واحد في كل سطر\nhttps://example.com/article',
  'Offline privacy mode is on — topic research requires internet. Use Workspace tools for fully local work.': 'وضع الخصوصية دون اتصال مفعّل — البحث في الموضوعات يحتاج إلى الإنترنت. استخدم أدوات Workspace للعمل المحلي بالكامل.',
  'Researching': 'جارٍ البحث في',
  'Comparing sources and synthesizing answer': 'جارٍ مقارنة المصادر وصياغة الإجابة',
  'Search any study topic': 'ابحث عن أي موضوع دراسي',
  'Scholar Hub compares multiple sources, ranks stronger ones higher, and keeps every claim grounded with visible citations.': 'يقارن Scholar Hub بين عدة مصادر، ويرفع ترتيب الأقوى منها، ويجعل كل معلومة مدعومة باستشهادات ظاهرة.',
  'Answer': 'الإجابة',
  'Synthesized from {sources} ranked sources with {citations} visible citations': 'تمت صياغتها من {sources} مصادر مرتبة مع {citations} استشهادات ظاهرة',
  'Saving…': 'جارٍ الحفظ…',
  'Save': 'حفظ',
  'Send to Workspace': 'إرسال إلى Workspace',
  'Research handoff ready in Workspace': 'أصبح تسليم البحث جاهزًا في Workspace',
  'Source handoff ready in Workspace': 'أصبح تسليم المصدر جاهزًا في Workspace',
  'Exporting…': 'جارٍ التصدير…',
  'Word': 'Word',
  'Open Writing Studio with this topic pre-filled': 'افتح Writing Studio مع تعبئة هذا الموضوع مسبقًا',
  'Write report': 'اكتب تقريرًا',
  'Report builder': 'منشئ التقرير',
  'Turn this research into a draft brief before you open Writing Studio.': 'حوّل هذا البحث إلى موجز مسودة قبل فتح استوديو الكتابة.',
  'Essay': 'مقال',
  'Report': 'تقرير',
  'Lit Review': 'مراجعة أدبية',
  'Report type': 'نوع التقرير',
  'Target words': 'عدد الكلمات المستهدف',
  'Build from key ideas': 'ابنِ من الأفكار الرئيسية',
  'Open builder': 'افتح المنشئ',
  'Build in Writing Studio': 'ابنِ في استوديو الكتابة',
  'Report builder ready in Writing Studio': 'أصبح منشئ التقرير جاهزًا في استوديو الكتابة',
  'Overview': 'نظرة عامة',
  'Ranking mode': 'نمط الترتيب',
  'Key takeaways': 'أهم الخلاصات',
  'points': 'نقاط',
  'Citations used': 'الاستشهادات المستخدمة',
  'Jump straight to the evidence': 'انتقل مباشرة إلى الدليل',
  'Export as:': 'تصدير بصيغة:',
  'Copied': 'تم النسخ',
  'Copy': 'نسخ',
  'Open MyBib to build a full bibliography for this topic': 'افتح MyBib لبناء قائمة مراجع كاملة لهذا الموضوع',
  'Ask next': 'اسأل بعد ذلك',
  'Follow the same source set': 'تابع على نفس مجموعة المصادر',
  'Follow-up thread': 'سلسلة المتابعة',
  'answers': 'إجابات',
  'Save to Library': 'حفظ في المكتبة',
  'Ask a follow-up': 'اطرح سؤال متابعة',
  'Keep the current research context': 'حافظ على سياق البحث الحالي',
  'Thinking…': 'جارٍ التفكير…',
  'Ask': 'اسأل',
  'Latest answer was added to the thread above.': 'تمت إضافة أحدث إجابة إلى السلسلة بالأعلى.',
  'Sources': 'المصادر',
  'Open the originals and compare the ranking yourself.': 'افتح المصادر الأصلية وقارن الترتيب بنفسك.',
  'ranked': 'مرتبة',
  'Cite this source in MyBib': 'استشهد بهذا المصدر في MyBib',
  'Cite in MyBib →': 'استشهد في MyBib ←',
  'Related reading': 'قراءة مرتبطة',
  'How this answer was ranked': 'كيف تم ترتيب هذه الإجابة',
  'Save source': 'حفظ المصدر',
  'Source saved': 'تم حفظ المصدر',
  'Source removed': 'تم إزالة المصدر',
  'My references': 'مراجعي',
  'Saved sources': 'المصادر المحفوظة',
  'Saved references': 'المراجع المحفوظة',
  'Export BibTeX': 'تصدير BibTeX',
  'Copy BibTeX': 'نسخ BibTeX',
  'BibTeX copied': 'تم نسخ BibTeX',
  'Remove source': 'إزالة المصدر',
  'Open source': 'افتح المصدر',
  'Search saved references': 'ابحث في المراجع المحفوظة',
  'Clear recent topics': 'امسح الموضوعات الأخيرة',
  'Recent topics cleared': 'تم مسح الموضوعات الأخيرة',
  'Copy source list': 'انسخ قائمة المصادر',
  'Source list copied': 'تم نسخ قائمة المصادر',
  'Could not copy source list': 'تعذر نسخ قائمة المصادر',
  'Showing {count} references': 'يعرض {count} مرجعًا',
  'Notes': 'ملاحظات',
  'Save note': 'احفظ الملاحظة',
  'Note saved': 'تم حفظ الملاحظة',
  'Could not update note': 'تعذر تحديث الملاحظة',
  'Copy brief': 'انسخ الملخص',
  'Research brief copied': 'تم نسخ ملخص البحث',
  'Recent topics': 'الموضوعات الأخيرة',
  'Pick up where you left off.': 'تابع من حيث توقفت.',
  'Use saved refs': 'استخدم المراجع المحفوظة',
  'Use saved references as manual links': 'استخدم المراجع المحفوظة كروابط يدوية',
  'Saved references loaded into manual links': 'تم تحميل المراجع المحفوظة في الروابط اليدوية',
  'No saved references to load yet': 'لا توجد مراجع محفوظة لتحميلها بعد',
  'Save all sources': 'احفظ كل المصادر',
  'All visible sources are already saved': 'كل المصادر الظاهرة محفوظة بالفعل',
  'Saved {count} sources': 'تم حفظ {count} مصدرًا',
  'Could not save all sources': 'تعذر حفظ كل المصادر',
  'Could not copy research brief': 'تعذر نسخ ملخص البحث',
  'Add quick notes for later writing or citation work.': 'أضف ملاحظات سريعة للكتابة أو الاستشهاد لاحقًا.',
  'Save sources above to build your reference list.': 'احفظ المصادر أعلاه لبناء قائمة مراجعك.',
  'Resolve DOI / arXiv ID': 'تحليل DOI / معرّف arXiv',
  'Resolving…': 'جارٍ التحليل…',
  'Resolved!': 'تم التحليل!',
  'DOI or arXiv ID (e.g. 10.1038/nature12345 or 2301.07041)': 'DOI أو معرّف arXiv (مثال: 10.1038/nature12345 أو 2301.07041)',
  'Encrypted · local content stays on device': 'مشفّر · يبقى المحتوى المحلي على الجهاز',
  'Saved': 'محفوظ',
};

interface Props {
  researchResult:     TopicResearchResult | null;
  onResearchResult:   (result: TopicResearchResult | null) => void;
  /** When set, pre-fills the topic input and triggers a search. */
  preloadTopic?:      string;
  onPreloadConsumed?: () => void;
  /** Called when the user clicks "Write report →" to switch to Writing Studio */
  onNavigateToWrite?: () => void;
  onBuildReport?: (seed: ReportSeed) => void;
}

export function ResearchTab({
  researchResult,
  onResearchResult,
  preloadTopic,
  onPreloadConsumed,
  onNavigateToWrite,
  onBuildReport,
}: Props) {
  const { toast }       = useToast();
  const { t } = useI18n(LOCAL_AR);
  const router = useRouter();
  const privacyMode     = loadClientAiDataMode();

  const [researchTopic,      setResearchTopic]      = useState(preloadTopic ?? '');
  const [researchMode,       setResearchMode]       = useState<ResearchMode>('automatic');
  const [ranking,            setRanking]            = useState<ResearchRanking>('balanced');
  const [includeWeb,         setIncludeWeb]         = useState(true);
  const [manualUrls,         setManualUrls]         = useState('');
  const [researchLoading,    setResearchLoading]    = useState(false);
  const [showAdvanced,       setShowAdvanced]       = useState(false);

  const [deepDiveQuestion,   setDeepDiveQuestion]   = useState('');
  const [deepDiveResult,     setDeepDiveResult]     = useState('');
  const [deepDiveLoading,    setDeepDiveLoading]    = useState(false);
  const [docxExporting,      setDocxExporting]      = useState(false);
  const [savingToLibrary,    setSavingToLibrary]    = useState(false);
  const [savedLibraryId,     setSavedLibraryId]     = useState<string | null>(null);
  const docxLinkRef = useRef<HTMLAnchorElement | null>(null);
  const [followUpHistory,    setFollowUpHistory]    = useState<Array<{ question: string; answer: string }>>([]);

  const [readingArticles,    setReadingArticles]    = useState<ArticleSuggestion[]>([]);
  const [citationFormat,     setCitationFormat]     = useState<CitationFormat>('apa');
  const [citationCopied,     setCitationCopied]     = useState(false);
  const [briefCopied,        setBriefCopied]        = useState(false);
  const [savingThread,       setSavingThread]       = useState(false);
  const [savingAllSources,   setSavingAllSources]   = useState(false);
  const [recentTopics,       setRecentTopics]       = useState<RecentTopicEntry[]>([]);
  const [referenceQuery,     setReferenceQuery]     = useState('');
  const [reportType,         setReportType]         = useState<'essay' | 'report' | 'literature_review'>('report');
  const [reportWordCount,    setReportWordCount]    = useState(1200);
  const [reportKeyPoints,    setReportKeyPoints]    = useState('');

  // ── Reference Library state ────────────────────────────────────────────────
  const [savedSourcesList,  setSavedSourcesList]  = useState<SavedSourceRow[]>([]);
  const [savingSourceUrl,   setSavingSourceUrl]   = useState<string | null>(null);
  const [showRefPanel,      setShowRefPanel]      = useState(false);
  const [bibCopiedId,       setBibCopiedId]       = useState<string | null>(null);
  const [refExportFmt,      setRefExportFmt]      = useState<'bibtex' | 'apa'>('bibtex');
  const [noteDrafts,        setNoteDrafts]        = useState<Record<string, string>>({});

  useEffect(() => {
    if (!researchResult) return;
    setReportKeyPoints(researchResult.keyIdeas.slice(0, 4).join('\n'));
  }, [researchResult?.topic, researchResult?.keyIdeas]);
  const [savingNoteId,      setSavingNoteId]      = useState<string | null>(null);

  // ── DOI / arXiv resolver state ────────────────────────────────────────────
  const [doiInput,          setDoiInput]          = useState('');
  const [doiStatus,         setDoiStatus]         = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [doiMsg,            setDoiMsg]            = useState('');

  const topCitations = researchResult?.citations.slice(0, 4) ?? [];

  const buildResearchDeck = useCallback((result: TopicResearchResult) => {
    const cards: string[] = [];
    cards.push(`Front: What is ${result.topic}? | Back: ${result.overview}`);
    result.keyIdeas.slice(0, 6).forEach((idea, index) => {
      const citation = result.citations[index];
      const back = citation ? `${idea} (${citation.label}: ${citation.title})` : idea;
      cards.push(`Front: Key idea ${index + 1} about ${result.topic} | Back: ${back}`);
    });
    return cards.join('\n');
  }, []);

  const sendResearchToWorkspace = useCallback((result: TopicResearchResult) => {
    writeScholarContext({
      label: result.topic,
      sourceText: `Topic: ${result.topic}\n\nOverview: ${result.overview}\n\nKey ideas:\n${result.keyIdeas.map((k) => `- ${k}`).join('\n')}`,
      reviewSetContent: buildResearchDeck(result),
      researchOverview: result.overview,
      kind: 'research',
    });
    toast(t('Research handoff ready in Workspace'), 'success');
    router.push('/workspace?tab=flashcards&scholarAction=flashcards');
  }, [buildResearchDeck, router, t, toast]);

  const sendSourceToWorkspace = useCallback((source: {
    title: string;
    url: string;
    excerpt?: string | null;
    abstract?: string | null;
    authors?: string | null;
    journal?: string | null;
    year?: number | null;
    sourceType?: string | null;
  }) => {
    const sourceBody = [
      `Title: ${source.title}`,
      source.authors ? `Authors: ${source.authors}` : null,
      source.journal ? `Journal: ${source.journal}` : null,
      source.year ? `Year: ${source.year}` : null,
      source.sourceType ? `Type: ${source.sourceType}` : null,
      `URL: ${source.url}`,
      '',
      source.abstract ?? source.excerpt ?? 'No abstract available.',
    ].filter(Boolean).join('\n');

    writeScholarContext({
      label: source.title,
      sourceText: sourceBody,
      sourceUrl: source.url,
      kind: 'source',
    });
    toast(t('Source handoff ready in Workspace'), 'success');
    router.push('/workspace?tab=generate&scholarAction=generate');
  }, [router, t, toast]);

  const rememberRecentTopic = useCallback((topic: string, sourceCount: number) => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic || typeof window === 'undefined') return;
    setRecentTopics((current) => {
      const next = [
        { topic: normalizedTopic, sourceCount, savedAt: new Date().toISOString() },
        ...current.filter((entry) => entry.topic.toLowerCase() !== normalizedTopic.toLowerCase()),
      ].slice(0, 6);
      window.localStorage.setItem(RECENT_TOPICS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const loadSavedSources = useCallback(async () => {
    try {
      const res = await fetch('/api/sources', { credentials: 'include' });
      if (res.ok) setSavedSourcesList(await res.json() as SavedSourceRow[]);
    } catch { /* offline */ }
  }, []);

  useEffect(() => { void loadSavedSources(); }, [loadSavedSources]);

  useEffect(() => {
    setRecentTopics(loadRecentTopics());
  }, []);

  useEffect(() => {
    setNoteDrafts((current) => {
      const next: Record<string, string> = {};
      for (const source of savedSourcesList) {
        next[source.id] = current[source.id] ?? source.notes ?? '';
      }
      return next;
    });
  }, [savedSourcesList]);

  const savedUrlSet = useMemo(() => new Set(savedSourcesList.map(s => s.url)), [savedSourcesList]);
  const filteredSavedSources = useMemo(() => {
    const query = referenceQuery.trim().toLowerCase();
    if (!query) return savedSourcesList;
    return savedSourcesList.filter((source) =>
      [source.title, source.authors, source.journal, source.notes, source.doi, source.url]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [referenceQuery, savedSourcesList]);

  async function saveSource(payload: {
    title: string; url: string; authors?: string; journal?: string;
    year?: number | null; doi?: string | null; abstract?: string; sourceType?: string;
  }, options?: { quiet?: boolean }): Promise<boolean> {
    setSavingSourceUrl(payload.url);
    try {
      const res = await fetch('/api/sources', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (!options?.quiet) toast(t('Source saved'), 'success');
        if (!options?.quiet) await loadSavedSources();
        return true;
      }
      const d = await res.json().catch(() => null) as { error?: string } | null;
      if (!options?.quiet) toast(d?.error ?? t('Could not save source'), 'error');
      return false;
    } catch {
      if (!options?.quiet) toast(t('Network connection issue — try again in a moment.'), 'error');
      return false;
    } finally {
      setSavingSourceUrl(null);
    }
  }

  async function removeSource(id: string) {
    try {
      const res = await fetch(`/api/sources?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) { toast(t('Source removed'), 'success'); await loadSavedSources(); }
      else { toast(t('Could not remove source'), 'error'); }
    } catch { toast(t('Network connection issue — try again in a moment.'), 'error'); }
  }

  async function updateSourceNote(id: string) {
    const notes = noteDrafts[id] ?? '';
    setSavingNoteId(id);
    try {
      const res = await fetch('/api/sources', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? t('Could not update note'));
      }
      toast(t('Note saved'), 'success');
      await loadSavedSources();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Could not update note'), 'error');
    } finally {
      setSavingNoteId(null);
    }
  }

  async function copyBibTeX(s: SavedSourceRow) {
    try {
      await navigator.clipboard.writeText(toBibTeX(s));
    } catch {
      toast(t('Could not copy to clipboard'), 'error');
      return;
    }
    setBibCopiedId(s.id);
    setTimeout(() => setBibCopiedId(null), 2000);
  }

  async function copyResearchBrief() {
    if (!researchResult) return;
    const text = [
      `Research Brief: ${researchResult.topic}`,
      '',
      researchResult.overview,
      '',
      'Key takeaways',
      ...researchResult.keyIdeas.map((idea, index) => `${index + 1}. ${idea}`),
      '',
      'Top citations',
      ...researchResult.citations.slice(0, 6).map((citation) => `[${citation.label}] ${citation.title} — ${citation.url}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
      toast(t('Research brief copied'), 'success');
    } catch {
      toast(t('Could not copy research brief'), 'error');
    }
  }

  async function copySourceList() {
    if (!researchResult) return;
    const text = researchResult.sources
      .map((source, index) => `${index + 1}. ${source.title}\n${source.url}\n${source.excerpt}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(t('Source list copied'), 'success');
    } catch {
      toast(t('Could not copy source list'), 'error');
    }
  }

  function useSavedReferencesAsManualLinks() {
    const urls = savedSourcesList.map((source) => source.url).filter(Boolean).slice(0, 5);
    if (!urls.length) {
      toast(t('No saved references to load yet'), 'error');
      return;
    }
    setManualUrls(urls.join('\n'));
    setResearchMode(includeWeb ? 'hybrid' : 'manual');
    setShowAdvanced(true);
    toast(t('Saved references loaded into manual links'), 'success');
  }

  function clearRecentTopics() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(RECENT_TOPICS_KEY);
    }
    setRecentTopics([]);
    toast(t('Recent topics cleared'), 'success');
  }

  async function saveVisibleSources() {
    if (!researchResult || savingAllSources) return;
    const pending = researchResult.sources.filter((source) => !savedUrlSet.has(source.url));
    if (pending.length === 0) {
      toast(t('All visible sources are already saved'), 'success');
      return;
    }

    setSavingAllSources(true);
    try {
      let savedCount = 0;
      for (const source of pending) {
        const ok = await saveSource({
          title: source.title,
          url: source.url,
          sourceType: source.type,
        }, { quiet: true });
        if (ok) savedCount += 1;
      }
      if (savedCount === 0) throw new Error(t('Could not save all sources'));
      await loadSavedSources();
      toast(t('Saved {count} sources', { count: savedCount }), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Could not save all sources'), 'error');
    } finally {
      setSavingAllSources(false);
    }
  }

  function handleBuildReport() {
    if (!researchResult || !onBuildReport) return;
    onBuildReport({
      topic: researchResult.topic,
      reportType,
      wordCount: reportWordCount,
      keyPoints: reportKeyPoints.trim(),
    });
    toast(t('Report builder ready in Writing Studio'), 'success');
  }

  function exportAllBibTeX() {
    const all = savedSourcesList.map(toBibTeX).join('\n\n');
    const blob = new Blob([all], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'references.bib' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function resolveDoiOrArxiv() {
    if (!doiInput.trim() || doiStatus === 'loading') return;
    setDoiStatus('loading'); setDoiMsg('');
    try {
      const res = await fetch('/api/sources/resolve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: doiInput.trim() }),
      });
      const data = await res.json() as ResolvedPaper & { error?: string };
      if (!res.ok) { setDoiStatus('error'); setDoiMsg(data.error ?? t('Identifier not found')); return; }
      setDoiStatus('done'); setDoiMsg(data.title);
      // Append to manual URLs so user can include in next research
      setManualUrls(prev => (prev.trim() ? `${prev.trim()}\n${data.url}` : data.url));
      // Also save directly to reference library
      void saveSource({
        title: data.title, url: data.url, authors: data.authors,
        journal: data.journal, year: data.year ?? undefined,
        doi: data.doi ?? undefined, abstract: data.abstract,
        sourceType: data.sourceType,
      });
      setDoiInput('');
      setTimeout(() => { setDoiStatus('idle'); setDoiMsg(''); }, 3000);
    } catch { setDoiStatus('error'); setDoiMsg(t('Network connection issue — try again in a moment.')); }
  }

  // When a pre-load topic arrives (e.g., from Recovery tab)
  useEffect(() => {
    if (!preloadTopic) return;
    setResearchTopic(preloadTopic);
    void loadRelatedReading(preloadTopic);
    onPreloadConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadTopic]);

  useEffect(() => {
    setFollowUpHistory([]);
    setDeepDiveQuestion('');
    setDeepDiveResult('');
    setSavedLibraryId(null);
  }, [researchResult?.topic]);

  const followUpSuggestions = useMemo(() => {
    return researchResult?.followUpPrompts ?? [];
  }, [researchResult?.followUpPrompts]);

  const contextText = researchResult
    ? [
        `Topic: ${researchResult.topic}`,
        `Overview: ${researchResult.overview}`,
        researchResult.keyIdeas.length
          ? `Key ideas:\n${researchResult.keyIdeas.map(k => `- ${k}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n\n')
    : '';

  async function loadRelatedReading(topic: string) {
    const trimmed = topic.trim();
    if (!trimmed) return;
    setReadingArticles([]);
    try {
      const res = await fetch('/api/coach/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, privacyMode }),
      });
      const payload = await res.json().catch(() => null) as ArticleSuggestion[] | { error?: string } | null;
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error ?? t('Could not load suggestions'));
      setReadingArticles(Array.isArray(payload) ? payload : []);
    } catch {
      toast(t('Could not load reading suggestions'), 'error');
    }
  }

  async function handleTopicResearch(topicOverride?: string) {
    const topic = (topicOverride ?? researchTopic).trim();
    if (!topic || researchLoading) return;
    setResearchLoading(true);
    try {
      const res = await fetch('/api/coach/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          mode: researchMode,
          ranking,
          includeWeb,
          manualUrls,
          ai: loadAiRuntimePreferences(),
          privacyMode,
        }),
      });
      const data = await res.json().catch(() => null) as TopicResearchResult & { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? t('Could not research this topic'));
      const result = data as TopicResearchResult;
      setResearchTopic(topic);
      onResearchResult(result);
      setReadingArticles(result.relatedLinks ?? []);
      rememberRecentTopic(topic, result.sources.length);
      // Share context with Workspace
      writeScholarContext({
        label:            result.topic,
        sourceText:       `Topic: ${result.topic}\n\nOverview: ${result.overview}\n\nKey ideas:\n${result.keyIdeas.map(k => `- ${k}`).join('\n')}`,
        researchOverview: result.overview,
        kind:             'research',
      });
      toast(t('Research brief ready from {count} sources', { count: result.sources.length }), 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Could not research this topic'), 'error');
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleDeepDive() {
    if (!deepDiveQuestion.trim() || deepDiveLoading) return;
    setDeepDiveLoading(true);
    setDeepDiveResult('');
    try {
      const prompt = contextText
        ? `Source context:\n${contextText}\n\nStudent question:\n${deepDiveQuestion.trim()}`
        : deepDiveQuestion.trim();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'explain', text: prompt, ai: loadAiRuntimePreferences(), privacyMode }),
      });
      const data = await res.json() as { content?: string; result?: string; error?: string };
      const result = data.content ?? data.result ?? '';
      if (!result) throw new Error(data.error ?? t('No explanation returned'));
      setDeepDiveResult(result);
      setFollowUpHistory((current) => [{ question: deepDiveQuestion.trim(), answer: result }, ...current].slice(0, 6));
    } catch (err) {
      toast(err instanceof Error ? err.message : t('Deep dive failed'), 'error');
    } finally {
      setDeepDiveLoading(false);
    }
  }

  async function downloadResearchDocx() {
    if (!researchResult || docxExporting) return;
    setDocxExporting(true);
    try {
      const lines: string[] = [
        `RESEARCH BRIEF: ${researchResult.topic.toUpperCase()}`,
        '',
        'OVERVIEW',
        researchResult.overview,
        '',
        'KEY IDEAS',
        ...researchResult.keyIdeas.map((idea, i) => `${i + 1}. ${idea}`),
        '',
        'CITATIONS',
        ...researchResult.citations.map((c) =>
          `[${c.label}] ${c.title}\n${c.url}\n${c.excerpt}`
        ),
        '',
        'SOURCE RANKING',
        researchResult.rankingSummary,
      ];
      const { generateDocx } = await import('@/lib/export/docx');
      const blob = await generateDocx({
        title: `Research Brief — ${researchResult.topic}`,
        content: lines.join('\n'),
      });
      const url = URL.createObjectURL(blob);
      const a = docxLinkRef.current ?? Object.assign(document.createElement('a'), {});
      a.href = url;
      a.download = `research-${researchResult.topic.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(t('Research brief downloaded'), 'success');
    } catch {
      toast(t('Could not export to Word'), 'error');
    } finally {
      setDocxExporting(false);
    }
  }

  async function saveResearchToLibrary() {
    if (!researchResult || savingToLibrary) return;
    setSavingToLibrary(true);
    setSavedLibraryId(null);
    try {
      const content = [
        `Research Brief: ${researchResult.topic}`,
        '─'.repeat(48),
        '',
        'OVERVIEW',
        researchResult.overview,
        '',
        'KEY IDEAS',
        ...researchResult.keyIdeas.map((idea, i) => `${i + 1}. ${idea}`),
        '',
        'CITATIONS',
        ...researchResult.citations.map((c) => `[${c.label}] ${c.title}\n    ${c.url}`),
        '',
        'SOURCE RANKING',
        researchResult.rankingSummary,
      ].join('\n');

      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'research',
          content,
          metadata: {
            title: `Research: ${researchResult.topic}`,
            category: 'Research',
            savedFrom: 'Scholar Hub',
          },
        }),
      });
      if (!res.ok) throw new Error(t('Could not save to library'));
      const saved = await res.json() as { id: string };
      setSavedLibraryId(saved.id);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast(t('Research brief saved to Library'), 'success');
    } catch {
      toast(t('Could not save to Library'), 'error');
    } finally {
      setSavingToLibrary(false);
    }
  }

  async function copyCitations() {
    if (!researchResult) return;
    const text = formatCitations(researchResult.citations, citationFormat);
    try {
      await navigator.clipboard.writeText(text);
      setCitationCopied(true);
      setTimeout(() => setCitationCopied(false), 2000);
    } catch {
      toast(t('Could not copy to clipboard'), 'error');
    }
  }

  async function saveThreadToLibrary() {
    if (!researchResult || followUpHistory.length === 0 || savingThread) return;
    setSavingThread(true);
    try {
      const content = [
        `Follow-up Q&A: ${researchResult.topic}`,
        '─'.repeat(48),
        '',
        ...followUpHistory.slice().reverse().flatMap(item => [
          `Q: ${item.question}`,
          '',
          `A: ${item.answer}`,
          '',
          '─'.repeat(32),
          '',
        ]),
      ].join('\n');

      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'research',
          content,
          metadata: {
            title: `Q&A: ${researchResult.topic}`,
            category: 'Research',
            savedFrom: 'Scholar Hub',
          },
        }),
      });
      if (!res.ok) throw new Error(t('Could not save'));
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast(t('Q&A thread saved to Library'), 'success');
    } catch {
      toast(t('Could not save thread'), 'error');
    } finally {
      setSavingThread(false);
    }
  }

  const SUGGESTED_TOPICS = [
    // Research / graduate tier
    'CRISPR-Cas9 off-target effects',
    'Transformer attention mechanisms explained',
    'mRNA vaccine lipid nanoparticle delivery',
    'RLHF and LLM alignment techniques',
    'Quantum error correction — surface codes',
    'Keynesian vs Austrian fiscal policy',
    'Mitochondrial dynamics in apoptosis',
    'Sovereign debt sustainability analysis',
    // Accessible graduate-adjacent
    'DNA replication — leading vs lagging strand',
    'Bayesian inference vs frequentist statistics',
    'Supply chain resilience post-COVID',
    'Neuroplasticity and long-term potentiation',
  ];

  return (
    <div className={styles.plxPage}>

      {/* ── Sticky search header ────────────────────────────────────── */}
      <div className={styles.plxSearchHeader}>
        <div className={styles.plxSearchRow}>
          <input
            className={styles.plxSearchInput}
            value={researchTopic}
            onChange={e => setResearchTopic(e.target.value)}
            placeholder={t('Search any topic — photosynthesis, French Revolution, quadratic equations…')}
            onKeyDown={e => e.key === 'Enter' && void handleTopicResearch()}
            disabled={privacyMode === 'offline'}
          />
          <button
            className={styles.plxSearchBtn}
            disabled={privacyMode === 'offline' || researchLoading || !researchTopic.trim()}
            onClick={() => void handleTopicResearch()}
          >
            {privacyMode === 'offline' ? t('Offline') : researchLoading ? t('Searching…') : `🔍 ${t('Search')}`}
          </button>
        </div>

        <div className={styles.plxHeaderMeta}>
          <button
            type="button"
            className={styles.plxAdvancedToggle}
            onClick={() => setShowAdvanced(v => !v)}
          >
            {t('Advanced')} {showAdvanced ? '▲' : '▼'}
          </button>
          {researchResult && (
            <>
              <span className={styles.plxHeaderSummary}>
                {researchResult.sources.length} {t('sources')} · {researchResult.citations.length} {t('citations')} · {t('via')} {researchResult.provider}
              </span>
              <button type="button" className={styles.plxAdvancedToggle} onClick={() => onResearchResult(null)}>{t('Clear')}</button>
            </>
          )}
        </div>

        {showAdvanced && (
          <div className={styles.plxAdvanced}>
            <div className={styles.modeToggle} style={{ marginBottom: 0 }}>
              {(['automatic', 'manual', 'hybrid'] as ResearchMode[]).map(mode => (
                <button
                  key={mode}
                  className={`${styles.modeToggleBtn} ${researchMode === mode ? styles.modeToggleBtnActive : ''}`}
                  disabled={privacyMode === 'offline'}
                  onClick={() => setResearchMode(mode)}
                >
                  {mode === 'automatic' ? t('Auto') : mode === 'manual' ? t('Manual links') : t('Hybrid')}
                </button>
              ))}
            </div>
            <div className={styles.researchRankingGroup} style={{ display: 'flex', gap: '0.35rem' }}>
              {(['academic-first', 'balanced', 'broad-web'] as ResearchRanking[]).map(option => (
                <button
                  key={option}
                  className={`${styles.segBtn} ${ranking === option ? styles.segBtnActive : ''}`}
                  onClick={() => setRanking(option)}
                >
                  {option === 'academic-first' ? t('Academic first') : option === 'broad-web' ? t('Broad web') : t('Balanced')}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeWeb} disabled={privacyMode === 'offline'} onChange={e => setIncludeWeb(e.target.checked)} />
              {t('Search the web')}
            </label>
            {researchMode !== 'automatic' && (
              <textarea
                className={styles.textArea}
                rows={3}
                value={manualUrls}
                onChange={e => setManualUrls(e.target.value)}
                disabled={privacyMode === 'offline'}
                placeholder={t('One URL per line\nhttps://example.com/article')}
                style={{ minWidth: '320px', fontSize: '0.82rem' }}
              />
            )}

            {/* DOI / arXiv resolver */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('Resolve DOI / arXiv ID')}
              </span>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  style={{ flex: 1, minWidth: 200, padding: '0.3rem 0.6rem', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.82rem', fontFamily: 'monospace' }}
                  placeholder={t('DOI or arXiv ID (e.g. 10.1038/nature12345 or 2301.07041)')}
                  value={doiInput}
                  onChange={e => { setDoiInput(e.target.value); setDoiStatus('idle'); setDoiMsg(''); }}
                  onKeyDown={e => e.key === 'Enter' && void resolveDoiOrArxiv()}
                />
                <button
                  type="button"
                  className={styles.plxAdvancedToggle}
                  style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                  disabled={!doiInput.trim() || doiStatus === 'loading'}
                  onClick={() => void resolveDoiOrArxiv()}
                >
                  {doiStatus === 'loading' ? t('Resolving…') : doiStatus === 'done' ? '✓' : '↗'}
                </button>
              </div>
              {doiMsg && (
                <span style={{ fontSize: '0.75rem', color: doiStatus === 'error' ? '#ef4444' : '#22c55e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doiStatus === 'done' ? `✓ ${doiMsg}` : doiMsg}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────── */}
      <div className={styles.plxBody}>

      {/* ── Offline notice ───────────────────────────────────────────── */}
      {privacyMode === 'offline' && (
        <div style={{ padding: '1rem 1.25rem' }}>
          <div className={styles.statusNote}>
            {t('Offline privacy mode is on — topic research requires internet. Use Workspace tools for fully local work.')}
          </div>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {researchLoading && (
        <div className={styles.plxLoading}>
          <div>{t('Researching')} <em>{researchTopic}</em>…</div>
          <div className={styles.plxLoadingBar}>
            <div className={styles.plxLoadingFill} />
          </div>
          <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)' }}>{t('Comparing sources and synthesizing answer')}</div>
        </div>
      )}

      {/* ── Hero empty state ─────────────────────────────────────────── */}
      {!researchResult && !researchLoading && (
        <div className={styles.plxHero}>
          <h2>{t('Search any study topic')}</h2>
          <p>{t('Scholar Hub compares multiple sources, ranks stronger ones higher, and keeps every claim grounded with visible citations.')}</p>
          <div className={styles.plxSuggestions}>
            {SUGGESTED_TOPICS.slice(0, 6).map((topicLabel) => (
              <button
                key={topicLabel}
                type="button"
                className={styles.plxSuggestionChip}
                onClick={() => void handleTopicResearch(topicLabel)}
              >
                {topicLabel}
              </button>
            ))}
          </div>
          {recentTopics.length > 0 && (
            <div className={styles.plxSection} style={{ marginTop: '1rem', width: 'min(100%, 46rem)' }}>
              <div className={styles.plxSectionHead}>
                <h3>{t('Recent topics')}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span>{t('Pick up where you left off.')}</span>
                  <button
                    type="button"
                    className={styles.plxAdvancedToggle}
                    style={{ padding: '0.15rem 0.55rem', fontSize: '0.72rem' }}
                    onClick={clearRecentTopics}
                  >
                    {t('Clear recent topics')}
                  </button>
                </div>
              </div>
              <div className={styles.plxRelatedChips}>
                {recentTopics.map((entry) => (
                  <button
                    key={entry.topic}
                    type="button"
                    className={styles.plxRelatedChip}
                    onClick={() => void handleTopicResearch(entry.topic)}
                    title={`${entry.sourceCount} sources · ${new Date(entry.savedAt).toLocaleDateString()}`}
                  >
                    {entry.topic}
                  </button>
                ))}
              </div>
            </div>
          )}
          {savedSourcesList.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem', justifyContent: 'center' }}>
              <button
                type="button"
                className={styles.plxAdvancedToggle}
                onClick={useSavedReferencesAsManualLinks}
                title={t('Use saved references as manual links')}
              >
                📚 {t('Use saved refs')} ({savedSourcesList.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Result — two-column Perplexity layout ─────────────────────── */}
      {researchResult && !researchLoading && (
        <div className={styles.plxResultLayout}>

          <div className={styles.plxAnswer}>
            <div className={styles.plxAnswerHead}>
              <div className={styles.plxAnswerLead}>
                <span className={styles.plxEyebrow}>{t('Answer')}</span>
                <h2>{researchResult.topic}</h2>
                <p className={styles.plxAnswerMeta}>
                  {t('Synthesized from {sources} ranked sources with {citations} visible citations', { sources: researchResult.sources.length, citations: researchResult.citations.length })} · {researchResult.provider}
                </p>
                <p className={styles.plxAnswerMeta} style={{ marginTop: '0.25rem' }}>
                  {researchResult.rankingSummary}
                </p>
             </div>
              <div className={styles.plxAnswerActions}>
                {savedLibraryId ? (
                  <a href="/library" className={styles.plxHeaderLink}>Saved</a>
                ) : (
                  <button
                    type="button"
                    className={styles.plxAdvancedToggle}
                    disabled={savingToLibrary}
                    onClick={() => void saveResearchToLibrary()}
                  >
                    {savingToLibrary ? t('Saving…') : t('Save')}
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.plxAdvancedToggle} ${styles.plxPrimaryGhost}`}
                  onClick={() => sendResearchToWorkspace(researchResult)}
                >
                  {t('Send to Workspace')}
                </button>
                {onNavigateToWrite && (
                  <button
                    type="button"
                    className={`${styles.plxAdvancedToggle} ${styles.plxPrimaryGhost}`}
                    onClick={onNavigateToWrite}
                    title={t('Open Writing Studio with this topic pre-filled')}
                  >
                    {t('Write report')}
                  </button>
                )}
              </div>
            </div>

            <section className={styles.plxSection}>
              <div className={styles.plxSectionHead}>
                <h3>{t('Overview')}</h3>
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{researchResult.overview}</p>
            </section>

            <section className={styles.plxSection}>
              <div className={styles.plxSectionHead}>
                <h3>{t('Report builder')}</h3>
                <span>{t('Turn this research into a draft brief before you open Writing Studio.')}</span>
              </div>
              <div className={styles.reportControls} style={{ padding: 0, border: 'none', background: 'transparent' }}>
                <div className={styles.buildHead}>
                  <div>
                    <strong>{researchResult.topic}</strong>
                    <p>{t('Turn this research into a draft brief before you open Writing Studio.')}</p>
                  </div>
                  <span className={styles.buildHint}>{researchResult.sources.length} {t('sources')}</span>
                </div>
                <div className={styles.reportMeta}>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>{t('Report type')}</label>
                    <div className={styles.segControl}>
                      {([
                        ['essay', t('Essay')],
                        ['report', t('Report')],
                        ['literature_review', t('Lit Review')],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`${styles.segBtn} ${reportType === value ? styles.segBtnActive : ''}`}
                          onClick={() => setReportType(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.controlGroup}>
                    <label className={styles.controlLabel}>{t('Target words')}</label>
                    <input
                      type="number"
                      min={300}
                      max={5000}
                      step={100}
                      value={reportWordCount}
                      onChange={(event) => setReportWordCount(Math.max(300, Math.min(5000, Number(event.target.value) || 1200)))}
                      className={styles.textInput}
                    />
                  </div>
                </div>
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>{t('Build from key ideas')}</label>
                  <textarea
                    value={reportKeyPoints}
                    onChange={(event) => setReportKeyPoints(event.target.value)}
                    rows={4}
                    className={styles.textArea}
                  />
                </div>
                <div className={styles.buildActionRow} style={{ marginLeft: 0 }}>
                  {onNavigateToWrite && (
                    <button
                      type="button"
                      className={styles.plxAdvancedToggle}
                      onClick={onNavigateToWrite}
                    >
                      {t('Open builder')}
                    </button>
                  )}
                  {onBuildReport && (
                    <button
                      type="button"
                      className={`${styles.plxAdvancedToggle} ${styles.plxPrimaryGhost}`}
                      onClick={handleBuildReport}
                    >
                      {t('Build in Writing Studio')}
                    </button>
                  )}
                </div>
              </div>
            </section>

            {researchResult.keyIdeas.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>{t('Key takeaways')}</h3>
                  <span>{researchResult.keyIdeas.length} {t('points')}</span>
                </div>
                <div className={styles.plxKeyPoints}>
                  {researchResult.keyIdeas.map((idea, i) => {
                    const linkedCitation = researchResult.citations[i];
                    return (
                      <div key={idea} className={styles.plxKeyPoint}>
                        <span className={styles.plxCiteBadge}>{i + 1}</span>
                        <div className={styles.plxKeyPointBody}>
                          <p className={styles.plxKeyPointText}>{idea}</p>
                          {linkedCitation && (
                            <a
                              href={linkedCitation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.plxInlineCitation}
                              title={linkedCitation.title}
                            >
                              {linkedCitation.label} · {linkedCitation.title}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {topCitations.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>{t('Citations used')}</h3>
                  <span>{t('Jump straight to the evidence')}</span>
                </div>
                <div className={styles.plxCitationGrid}>
                  {topCitations.map((citation) => (
                    <a
                      key={citation.id}
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.plxCitationCard}
                    >
                      <div className={styles.plxCitationHead}>
                        <span className={styles.plxSourceNum}>{citation.label.replace('S', '')}</span>
                        <span className={`${styles.plxSourceType} ${citation.confidenceLabel === 'High' ? styles.plxConfHigh : citation.confidenceLabel === 'Medium' ? styles.plxConfMed : styles.plxConfBase}`}>
                          {citation.confidenceLabel}
                        </span>
                      </div>
                      <strong>{citation.title}</strong>
                      <p>{citation.excerpt}</p>
                      <span className={styles.plxCitationMeta}>{citation.source} · ~{citation.readingMinutes} min</span>
                    </a>
                  ))}
                </div>

                {/* Citation export row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className={styles.plxAdvancedToggle}
                    style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem' }}
                    onClick={() => void copyResearchBrief()}
                  >
                    {briefCopied ? `✓ ${t('Copied')}` : t('Copy brief')}
                  </button>
                  <button type="button" className={styles.plxAdvancedToggle} style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem' }} disabled={docxExporting} onClick={() => void downloadResearchDocx()}>
                    {docxExporting ? t('Exporting…') : t('Word')}
                  </button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('Export as:')}</span>
                  {(['apa', 'mla', 'chicago', 'harvard'] as CitationFormat[]).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      className={`${styles.plxAdvancedToggle} ${citationFormat === fmt ? styles.plxPrimaryGhost : ''}`}
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem', textTransform: 'uppercase' }}
                      onClick={() => setCitationFormat(fmt)}
                    >
                      {fmt}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.plxAdvancedToggle}
                    style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem' }}
                    onClick={() => void copyCitations()}
                  >
                    {citationCopied ? `✓ ${t('Copied')}` : t('Copy')}
                  </button>
                  <a
                    href={buildMyBibUrl(researchResult.topic)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.plxAdvancedToggle}
                    style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem', textDecoration: 'none' }}
                    title={t('Open MyBib to build a full bibliography for this topic')}
                  >
                    MyBib →
                  </a>
                </div>

                {/* Per-source MyBib links in the sidebar below */}
              </section>
            )}

            {followUpSuggestions.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>{t('Ask next')}</h3>
                  <span>{t('Follow the same source set')}</span>
                </div>
                <div className={styles.plxRelatedChips}>
                  {followUpSuggestions.map(q => (
                    <button
                      key={q}
                      type="button"
                      className={styles.plxRelatedChip}
                      onClick={() => setDeepDiveQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {followUpHistory.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>{t('Follow-up thread')}</h3>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span>{followUpHistory.length} {t('answers')}</span>
                    <button
                      type="button"
                      className={styles.plxAdvancedToggle}
                      style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                      disabled={savingThread}
                      onClick={() => void saveThreadToLibrary()}
                    >
                      {savingThread ? t('Saving…') : t('Save to Library')}
                    </button>
                  </div>
                </div>
                <div className={styles.plxThread}>
                  {followUpHistory.map(item => (
                    <div key={`${item.question}-${item.answer.slice(0, 24)}`} className={styles.plxThreadItem}>
                      <div className={styles.plxThreadQ}>{item.question}</div>
                      <div className={styles.plxThreadA}>{item.answer}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={`${styles.plxSection} ${styles.plxFollowSection}`}>
              <div className={styles.plxSectionHead}>
                <h3>{t('Ask a follow-up')}</h3>
                <span>{t('Keep the current research context')}</span>
              </div>
              <div className={styles.plxFollowRow}>
                <input
                  className={styles.plxFollowInput}
                  value={deepDiveQuestion}
                  onChange={e => setDeepDiveQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && void handleDeepDive()}
                  placeholder={`${t('Ask a follow-up')} "${researchResult.topic}"…`}
                />
                <button
                  className={styles.plxFollowBtn}
                  disabled={deepDiveLoading || !deepDiveQuestion.trim()}
                  onClick={() => void handleDeepDive()}
                >
                  {deepDiveLoading ? t('Thinking…') : t('Ask')}
                </button>
              </div>
              {deepDiveResult && (
                <div className={styles.plxFollowHint}>
                  <span>{t('Latest answer was added to the thread above.')}</span>
                  <button
                    type="button"
                    className={styles.plxInlineBtn}
                    onClick={() => { setDeepDiveResult(''); setDeepDiveQuestion(''); }}
                  >
                    {t('Clear')}
                  </button>
                </div>
              )}
            </section>
          </div>

          <aside className={styles.plxSourcesPanel}>

            {/* Privacy indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', padding: '0.4rem 0.6rem', borderRadius: 8, background: 'var(--surface-2, rgba(0,0,0,0.04))', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              <span>🔒</span>
              <span>{t('Encrypted · local content stays on device')}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'monospace', opacity: 0.7 }}>AI: {privacyMode}</span>
            </div>

            <div className={styles.plxSourcesHead}>
              <div>
                <h4>{t('Sources')}</h4>
                <p className={styles.plxSourcesSubhead}>{t('Open the originals and compare the ranking yourself.')}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <button
                  type="button"
                  className={styles.plxAdvancedToggle}
                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                  onClick={() => void copySourceList()}
                >
                  {t('Copy source list')}
                </button>
                <button
                  type="button"
                  className={styles.plxAdvancedToggle}
                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                  disabled={savingAllSources}
                  onClick={() => void saveVisibleSources()}
                >
                  {savingAllSources ? t('Saving…') : t('Save all sources')}
                </button>
                <span className={styles.plxHeaderSummary}>{researchResult.sources.length} {t('ranked')}</span>
                <button
                  type="button"
                  className={styles.plxAdvancedToggle}
                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                  onClick={() => setShowRefPanel(v => !v)}
                  title={t('My references')}
                >
                  📚 {savedSourcesList.length > 0 ? savedSourcesList.length : ''}
                </button>
              </div>
            </div>

            {researchResult.sources.map((source, i) => {
              const alreadySaved = savedUrlSet.has(source.url);
              return (
                <div key={source.id} className={styles.plxSourceCard} style={{ display: 'block' }}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: '0.5rem' }}
                  >
                    <span className={styles.plxSourceNum}>{i + 1}</span>
                    <div className={styles.plxSourceBody}>
                      <div className={styles.plxSourceTitle}>{source.title}</div>
                      <p className={styles.plxSourceExcerpt}>{source.excerpt}</p>
                      <div className={styles.plxSourceMeta}>
                        <span className={styles.plxSourceType}>{source.type}</span>
                        <span className={`${styles.plxSourceType} ${source.confidenceLabel === 'High' ? styles.plxConfHigh : source.confidenceLabel === 'Medium' ? styles.plxConfMed : styles.plxConfBase}`}>
                          {source.confidenceLabel}
                        </span>
                        <span className={styles.plxSourceTime}>~{source.readingMinutes} min</span>
                      </div>
                    </div>
                  </a>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', marginLeft: '1.6rem' }}>
                    <a
                      href={buildMyBibCiteUrl(source.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.75 }}
                      title={t('Cite this source in MyBib')}
                    >
                      {t('Cite in MyBib →')}
                    </a>
                    <button
                      type="button"
                      style={{ fontSize: '0.72rem', background: 'none', border: 'none', cursor: alreadySaved ? 'default' : 'pointer', color: alreadySaved ? '#22c55e' : 'var(--primary)', padding: 0, opacity: savingSourceUrl === source.url ? 0.5 : 1 }}
                      disabled={alreadySaved || savingSourceUrl === source.url}
                      onClick={() => void saveSource({ title: source.title, url: source.url, sourceType: source.type })}
                    >
                      {alreadySaved ? `✓ ${t('Saved')}` : `🔖 ${t('Save source')}`}
                    </button>
                    <button
                      type="button"
                      style={{ fontSize: '0.72rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0 }}
                      onClick={() => sendSourceToWorkspace({
                        title: source.title,
                        url: source.url,
                        excerpt: source.excerpt,
                        sourceType: source.type,
                      })}
                    >
                      ↗ {t('Send to Workspace')}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Reference Library panel */}
            {showRefPanel && (
              <div className={styles.plxSidebarGroup} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                <div className={styles.plxSidebarHead} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>📚 {t('My references')} ({savedSourcesList.length})</span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {savedSourcesList.length > 0 && (
                      <button
                        type="button"
                        className={styles.plxAdvancedToggle}
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={useSavedReferencesAsManualLinks}
                        title={t('Use saved references as manual links')}
                      >
                        {t('Use saved refs')}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${styles.plxAdvancedToggle} ${refExportFmt === 'bibtex' ? styles.plxPrimaryGhost : ''}`}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}
                      onClick={() => setRefExportFmt('bibtex')}
                    >BibTeX</button>
                    <button
                      type="button"
                      className={`${styles.plxAdvancedToggle} ${refExportFmt === 'apa' ? styles.plxPrimaryGhost : ''}`}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.72rem' }}
                      onClick={() => setRefExportFmt('apa')}
                    >APA</button>
                    {savedSourcesList.length > 0 && (
                      <button
                        type="button"
                        className={styles.plxAdvancedToggle}
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}
                        onClick={exportAllBibTeX}
                        title={t('Export BibTeX')}
                      >⬇ .bib</button>
                    )}
                  </div>
                </div>
                {savedSourcesList.length === 0 ? (
                  <p className={styles.plxSidebarText} style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
                    {t('Save sources above to build your reference list.')}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                    <input
                      value={referenceQuery}
                      onChange={(event) => setReferenceQuery(event.target.value)}
                      placeholder={t('Search saved references')}
                      style={{
                        width: '100%',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        padding: '0.5rem 0.65rem',
                        fontSize: '0.75rem',
                        lineHeight: 1.3,
                      }}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {t('Showing {count} references', { count: filteredSavedSources.length })}
                    </div>
                    {filteredSavedSources.map(s => (
                      <div key={s.id} style={{ background: 'var(--surface)', borderRadius: 8, padding: '0.5rem 0.6rem', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                        {s.authors && <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginBottom: '0.1rem' }}>{s.authors}</div>}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                          {[s.journal, s.year].filter(Boolean).join(' · ')}
                        </div>
                        <div style={{ marginTop: '0.45rem' }}>
                          <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                            {t('Notes')}
                          </label>
                          <textarea
                            value={noteDrafts[s.id] ?? ''}
                            onChange={(event) => setNoteDrafts((current) => ({ ...current, [s.id]: event.target.value }))}
                            placeholder={t('Add quick notes for later writing or citation work.')}
                            rows={3}
                            style={{
                              width: '100%',
                              resize: 'vertical',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--bg)',
                              color: 'var(--text)',
                              padding: '0.45rem 0.55rem',
                              fontSize: '0.72rem',
                              lineHeight: 1.45,
                              marginTop: '0.1rem',
                            }}
                          />
                        </div>
                        {refExportFmt === 'bibtex' && (
                          <pre style={{ marginTop: '0.4rem', fontSize: '0.65rem', background: 'var(--bg)', padding: '0.35rem', borderRadius: 4, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
                            {toBibTeX(s)}
                          </pre>
                        )}
                        {refExportFmt === 'apa' && (
                          <p style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            {toAPA(s)}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                          <button
                            type="button"
                            className={styles.plxAdvancedToggle}
                            style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                            onClick={() => void copyBibTeX(s)}
                          >
                            {bibCopiedId === s.id ? `✓ ${t('BibTeX copied')}` : t('Copy BibTeX')}
                          </button>
                          <button
                            type="button"
                            className={styles.plxAdvancedToggle}
                            style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                            disabled={savingNoteId === s.id}
                            onClick={() => void updateSourceNote(s.id)}
                          >
                            {savingNoteId === s.id ? t('Saving…') : t('Save note')}
                          </button>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.plxAdvancedToggle}
                            style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem', textDecoration: 'none' }}
                          >
                            {t('Open source')}
                          </a>
                          <button
                            type="button"
                            className={styles.plxAdvancedToggle}
                            style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
                            onClick={() => sendSourceToWorkspace({
                              title: s.title,
                              url: s.url,
                              abstract: s.abstract,
                              authors: s.authors,
                              journal: s.journal,
                              year: s.year,
                              sourceType: s.sourceType,
                            })}
                          >
                            {t('Send to Workspace')}
                          </button>
                          <button
                            type="button"
                            style={{ fontSize: '0.7rem', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}
                            onClick={() => void removeSource(s.id)}
                          >
                            {t('Remove source')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {readingArticles.length > 0 && (
              <div className={styles.plxSidebarGroup}>
                <div className={styles.plxSidebarHead}>{t('Related reading')}</div>
                <div className={styles.plxSidebarLinks}>
                  {readingArticles.slice(0, 4).map((article) => (
                    <Link key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" className={styles.plxSidebarLink}>
                      {article.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {researchResult.rankingSummary && (
              <div className={styles.plxSidebarGroup}>
                <div className={styles.plxSidebarHead}>{t('How this answer was ranked')}</div>
                <p className={styles.plxSidebarText}>{researchResult.rankingSummary}</p>
              </div>
            )}
          </aside>
        </div>
      )}

      </div>{/* end plxBody */}
    </div>
  );
}
