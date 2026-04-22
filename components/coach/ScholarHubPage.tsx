'use client';

/**
 * components/coach/ScholarHubPage.tsx
 *
 * Scholar Hub controller — owns shared state and SRS handlers.
 * All tab UI is delegated to sub-components in ./tabs/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { useAnalytics, type WeakArea } from '@/hooks/useAnalytics';
import { writeCoachHandoff } from '@/lib/coach/handoff';
import { buildCoachUrl } from '@/lib/coach/routes';
import { loadDecks, type SRSDeck } from '@/lib/srs/sm2';
import { persistDeckLocally } from '@/lib/srs/deck-utils';
import type { TopicResearchResult } from '@/lib/coach/research';
import styles from '@/app/(dashboard)/coach/page.module.css';

function TabLoadingFallback() {
  const { t } = useI18n();
  return <div className="tool-loading">{t('Loading section…')}</div>;
}

const AssignmentWriterTab = dynamic(
  () => import('./tabs/AssignmentWriterTab').then((mod) => mod.AssignmentWriterTab),
  { ssr: false, loading: () => <TabLoadingFallback /> },
);
const ResearchTab = dynamic(
  () => import('./tabs/ResearchTab').then((mod) => mod.ResearchTab),
  { ssr: false, loading: () => <TabLoadingFallback /> },
);
const RecoveryTab = dynamic(
  () => import('./tabs/RecoveryTab').then((mod) => mod.RecoveryTab),
  { ssr: false, loading: () => <TabLoadingFallback /> },
);
const GuidelinesTab = dynamic(
  () => import('./tabs/GuidelinesTab').then((mod) => mod.GuidelinesTab),
  { ssr: false, loading: () => <TabLoadingFallback /> },
);

type CoachPanel   = 'review' | 'manage';
type CoachSection = 'research' | 'write' | 'recovery' | 'guidelines';
type WritePreloadState = {
  topic: string;
  reportType?: 'essay' | 'report' | 'literature_review';
  wordCount?: number;
  keyPoints?: string;
};

const TAB_LABELS: Record<CoachSection, { label: string; icon: string }> = {
  research:   { label: 'Research',    icon: '🔍' },
  write:      { label: 'Writing',     icon: '✍️' },
  recovery:   { label: 'Recovery',    icon: '📊' },
  guidelines: { label: 'AI Policy',   icon: '📋' },
};

function mergeSets(local: SRSDeck[], remote: SRSDeck[]): SRSDeck[] {
  const byId = new Map<string, SRSDeck>();
  for (const s of local)  byId.set(s.id, s);
  for (const s of remote) byId.set(s.id, s);
  return Array.from(byId.values()).sort((a, b) => {
    return new Date(b.lastStudied ?? b.createdAt).getTime()
         - new Date(a.lastStudied ?? a.createdAt).getTime();
  });
}

interface ScholarHubPageProps {
  drawerMode?: boolean;
  onClose?: () => void;
}

export function ScholarHubPage({ drawerMode = false, onClose }: ScholarHubPageProps = {}) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { toast }    = useToast();
  const { t }        = useI18n();

  const { data: analytics, loading: analyticsLoading, refresh: refreshAnalytics } = useAnalytics(30);

  const [activeSection, setActiveSection] = useState<CoachSection>('research');

  // Shared cross-tab state
  const [researchResult,  setResearchResult]  = useState<TopicResearchResult | null>(null);
  /** Topic to pre-load in Research tab (e.g. from Recovery "Reading" button) */
  const [researchPreload, setResearchPreload] = useState<string | undefined>(undefined);
  /** Topic to pre-fill in the Write tab when navigating from Research */
  const [writePreload,    setWritePreload]    = useState<WritePreloadState | string | undefined>(undefined);

  // ── SRS state ──────────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  const [reviewSets,     setReviewSets]     = useState<SRSDeck[]>([]);
  const [loadingSets,    setLoadingSets]    = useState(true);

  const selectedSetId = searchParams.get('set');
  const imported      = searchParams.get('imported') === '1';
  const panel         = searchParams.get('panel') === 'review' ? 'review'
                      : searchParams.get('panel') === 'manage' ? 'manage'
                      : null;
  const starterTopic  = searchParams.get('starter');
  const starterSection = searchParams.get('section');

  const getSetDue = useCallback(
    (s: SRSDeck) => s.cards.filter(c => c.nextReview && c.nextReview <= today).length,
    [today],
  );

  const getSetAccuracy = useCallback((s: SRSDeck) => {
    const total   = s.cards.reduce((n, c) => n + c.totalReviews, 0);
    const correct = s.cards.reduce((n, c) => n + c.correctReviews, 0);
    return total > 0 ? Math.round((correct / total) * 100) : -1;
  }, []);

  const sortedReviewSets = useMemo(
    () => [...reviewSets].sort((a, b) => {
      const dd = getSetDue(b) - getSetDue(a);
      if (dd !== 0) return dd;
      return new Date(b.lastStudied ?? b.createdAt).getTime()
           - new Date(a.lastStudied ?? a.createdAt).getTime();
    }),
    [reviewSets, getSetDue],
  );

  const dueReviewSets = useMemo(
    () => sortedReviewSets.filter(s => getSetDue(s) > 0),
    [sortedReviewSets, getSetDue],
  );

  const selectedSet = useMemo(
    () => sortedReviewSets.find(s => s.id === selectedSetId) ?? null,
    [sortedReviewSets, selectedSetId],
  );

  const openPanel = useCallback((setId: string, nextPanel: CoachPanel, importedFlag: boolean | null = null) => {
    writeCoachHandoff({ type: importedFlag ? 'import-success' : 'review-set', setId, panel: nextPanel });
    if (drawerMode && onClose) {
      onClose();
    } else {
      router.push('/workspace');
    }
  }, [drawerMode, onClose, router]);

  const closePanel = useCallback(() => {
    router.push(buildCoachUrl({ setId: null, panel: null, imported: null, importUrl: null }), { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!selectedSetId || !panel) return;
    writeCoachHandoff({ type: imported ? 'import-success' : 'review-set', setId: selectedSetId, panel });
    router.replace('/workspace');
  }, [imported, panel, router, selectedSetId]);

  const refreshReviewSets = useCallback(async () => {
    setLoadingSets(true);
    const local = loadDecks();
    setReviewSets(local);
    try {
      const res = await fetch('/api/srs', { cache: 'no-store' });
      if (res.ok) {
        const remote = await res.json() as SRSDeck[];
        remote.forEach(s => persistDeckLocally(s));
        setReviewSets(mergeSets(local, remote));
      }
    } catch { /* offline */ }
    finally { setLoadingSets(false); }
  }, []);

  useEffect(() => { void refreshReviewSets(); }, [refreshReviewSets]);

  useEffect(() => {
    if (!starterTopic) return;
    setResearchPreload(starterTopic);
    if (starterSection === 'write') {
      setWritePreload(starterTopic);
      setActiveSection('write');
      return;
    }
    setActiveSection('research');
  }, [starterSection, starterTopic]);

  // ── Today's Mission ────────────────────────────────────────────────────────

  const topWeakAreas = useMemo(() => analytics?.weakAreas?.slice(0, 3) ?? [], [analytics?.weakAreas]);
  const contextStats = useMemo(() => {
    const activeSource = researchResult?.topic ?? null;
    const sourceCount = researchResult?.sources.length ?? 0;
    const citationCount = researchResult?.citations.length ?? 0;
    const dueCount = dueReviewSets.reduce((sum, set) => sum + getSetDue(set), 0);
    return { activeSource, sourceCount, citationCount, dueCount };
  }, [researchResult?.topic, researchResult?.sources.length, researchResult?.citations.length, dueReviewSets, getSetDue]);

  const activeSectionSummary = useMemo(() => {
    if (activeSection === 'research') {
      return {
        title: t('Research workspace'),
        description: researchResult
          ? t('Search across {sources} ranked sources and keep {citations} citations visible while you explore.', { sources: String(researchResult.sources.length), citations: String(researchResult.citations.length) })
          : t('Research a topic, compare manual links, or search the web in one focused workspace.'),
        pills: [
          t('Topic-led research'),
          researchResult ? t('Ranking: {ranking}', { ranking: researchResult.ranking }) : t('Auto / manual / hybrid'),
          researchResult ? t('Provider: {provider}', { provider: researchResult.provider }) : t('Evidence-first synthesis'),
        ],
      };
    }
    if (activeSection === 'write') {
      return {
        title: t('Writing studio'),
        description: researchResult
          ? t('Use your current research context to build stronger drafts, outlines, and revisions.')
          : t('Load a file or run a research topic first, then turn it into a report structure, draft, or checked paragraph.'),
        pills: [
          researchResult ? t('Research context connected') : t('Upload a file to get started'),
          t('Draft · report · check'),
        ],
      };
    }
    return {
      title: t('Recovery and review'),
      description: dueReviewSets.length
        ? t('You have {count} review sets with due work ready to continue in Workspace.', { count: String(dueReviewSets.length) })
        : t('See what is due, where you are weak, and what to practice next.'),
      pills: [
        t('{count} due cards', { count: String(contextStats.dueCount) }),
        topWeakAreas[0] ? t('Top weak area: {topic}', { topic: topWeakAreas[0].topic }) : t('Weak-area insights ready'),
      ],
    };
  }, [activeSection, contextStats.dueCount, dueReviewSets.length, researchResult, t, topWeakAreas]);

  const mission = useMemo(() => {
    if (dueReviewSets[0]) {
      const set = dueReviewSets[0];
      const due = getSetDue(set);
      return { eyebrow: t("Today's Mission"), title: t('Review {count} due cards in {name}', { count: String(due), name: set.name }), description: t('Start with the review set that is already waiting.'), actionLabel: t("Start today's mission"), secondaryLabel: t('Quick manage'), kind: 'review' as const, setId: set.id };
    }
    if (topWeakAreas[0]) {
      const area = topWeakAreas[0];
      return { eyebrow: t("Today's Mission"), title: t('Recover {topic}', { topic: area.topic }), description: t('{accuracy}% accuracy — a short focused practice run is the best next move.', { accuracy: String(Math.round(area.accuracy)) }), actionLabel: t("Start today's mission"), secondaryLabel: t('Explain it'), kind: 'weak' as const, weakArea: area };
    }
    if ((analytics?.planStats?.activePlans ?? 0) > 0 && (analytics?.planStats?.averageProgress ?? 100) < 60) {
      return { eyebrow: t("Today's Mission"), title: t('Catch up on your active study plan'), description: t('{progress}% average progress.', { progress: String(analytics?.planStats?.averageProgress ?? 0) }), actionLabel: t("Start today's mission"), secondaryLabel: t('Open planner'), kind: 'plan' as const };
    }
    if (reviewSets.length === 0) {
      return { eyebrow: t("Today's Mission"), title: t('Import your first review set'), description: t('Bring in a reliable source and let Scholar Hub guide the next steps.'), actionLabel: t("Start today's mission"), secondaryLabel: t('View review sets'), kind: 'import' as const };
    }
    const set = sortedReviewSets[0];
    return { eyebrow: t("Today's Mission"), title: t('Open {name}', { name: set?.name ?? t('your latest review set') }), description: t('Nothing urgent is due right now.'), actionLabel: t("Start today's mission"), secondaryLabel: t('Quick manage'), kind: 'manage' as const, setId: set?.id };
  }, [analytics, dueReviewSets, reviewSets, sortedReviewSets, t, topWeakAreas, getSetDue]);

  function launchWeakTopic(area: WeakArea, tool: 'quiz' | 'explain') {
    writeCoachHandoff({ type: 'weak-topic', topic: area.topic, preferredTool: tool });
    toast(t('"{topic}" is ready in Workspace', { topic: area.topic }), 'success');
    if (drawerMode && onClose) {
      onClose();
    } else {
      router.push('/workspace');
    }
  }

  function startMission() {
    if (mission.kind === 'review' && mission.setId)    { openPanel(mission.setId, 'review'); return; }
    if (mission.kind === 'manage' && mission.setId)    { openPanel(mission.setId, 'manage'); return; }
    if (mission.kind === 'weak'   && mission.weakArea) { launchWeakTopic(mission.weakArea, 'quiz'); return; }
    if (mission.kind === 'plan')                       { router.push('/planner'); return; }
  }

  function runMissionSecondary() {
    if (mission.kind === 'review' && mission.setId)    { openPanel(mission.setId, 'manage'); return; }
    if (mission.kind === 'manage' && mission.setId)    { openPanel(mission.setId, 'manage'); return; }
    if (mission.kind === 'weak'   && mission.weakArea) { launchWeakTopic(mission.weakArea, 'explain'); return; }
    if (mission.kind === 'plan')                       { router.push('/planner'); return; }
  }

  function navigateToResearch(topic: string) {
    setResearchPreload(topic);
    setActiveSection('research');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page} style={drawerMode ? { minHeight: '100%', paddingTop: 0 } : undefined}>

      {/* App header — hidden in drawer mode (drawer provides its own header) */}
      <header className={styles.appHeader} style={drawerMode ? { display: 'none' } : undefined}>
        <div className={styles.brand}>
          <span className={styles.brandGlyph}>🎓</span>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Scholar Hub</span>
          </div>
        </div>
        <nav className={styles.tabNav}>
          {(['research', 'write', 'recovery', 'guidelines'] as CoachSection[]).map(id => (
            <button
              key={id}
              className={`${styles.tabBtn} ${activeSection === id ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <span>{TAB_LABELS[id].icon}</span>
              {t(TAB_LABELS[id].label)}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
          <a
            href="/workspace"
            className={styles.btnSecondary}
            style={{ fontSize: '0.78rem', textDecoration: 'none', padding: '0.3rem 0.7rem' }}
            title={t('Open Workspace — practice, review sets, file tools')}
          >
            {t('Workspace →')}
          </a>
          <button
            className={styles.refreshBtn}
            title={t('Refresh all data')}
            onClick={() => void refreshReviewSets().then(() => refreshAnalytics())}
          >
            ↻
          </button>
        </div>
      </header>

      <div className={styles.sectionStrip} style={drawerMode ? { marginTop: 0 } : undefined}>
        <div className={styles.sectionStripCopy}>
          <span className={styles.contextStripLabel}>{t(TAB_LABELS[activeSection].label)}</span>
          <strong>{activeSectionSummary.title}</strong>
          <p>{activeSectionSummary.description}</p>
        </div>
        <div className={styles.sectionStripMeta}>
          <span className={styles.metaTag}>{contextStats.activeSource ?? t('Start with a topic or source')}</span>
          {activeSection === 'research' && <span className={styles.metaTag}>{contextStats.citationCount} citations</span>}
          {activeSection === 'recovery' && <span className={styles.metaTag}>{contextStats.dueCount} due</span>}
          {activeSectionSummary.pills.slice(0, 2).map((pill) => (
            <span key={pill} className={styles.metaTag}>{pill}</span>
          ))}
        </div>
      </div>

      {/* Panel overlay banner */}
      {panel && selectedSet && (
        <div className={styles.overlayBanner}>
          <div className={styles.overlayInfo}>
            <strong>{selectedSet.name}</strong>
            <span>
              {selectedSet.cards.length} cards · {getSetDue(selectedSet)} due
              {getSetAccuracy(selectedSet) >= 0 ? ` · ${getSetAccuracy(selectedSet)}% accuracy` : ''}
            </span>
          </div>
          <div className={styles.overlayActions}>
            <button className={styles.btnPrimary} onClick={() => openPanel(selectedSet.id, panel === 'review' ? 'review' : 'manage', imported ? true : null)}>
              {t('Open in Workspace')}
            </button>
            <button className={styles.btnSecondary} onClick={closePanel}>{t('Stay here')}</button>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className={styles.tabContent}>

        {activeSection === 'research' && (
          <div className={styles.researchWorkspaceStack}>
            <section className={styles.researchWorkspaceSection}>
              <ResearchTab
                researchResult={researchResult}
                onResearchResult={setResearchResult}
                preloadTopic={researchPreload}
                onPreloadConsumed={() => setResearchPreload(undefined)}
                onNavigateToWrite={() => {
                  setWritePreload(researchResult?.topic);
                  setActiveSection('write');
                }}
                onBuildReport={(seed) => {
                  setWritePreload(seed);
                  setActiveSection('write');
                }}
              />
            </section>
          </div>
        )}

        {activeSection === 'write' && (
          <AssignmentWriterTab
            researchResult={researchResult}
            onNavigateToResearch={navigateToResearch}
            preloadTopic={writePreload}
            onPreloadConsumed={() => setWritePreload(undefined)}
          />
        )}

        {activeSection === 'recovery' && (
          <RecoveryTab
            dueReviewSets={dueReviewSets}
            allReviewSets={sortedReviewSets}
            topWeakAreas={topWeakAreas}
            loadingSets={loadingSets}
            analyticsLoading={analyticsLoading}
            getSetDue={getSetDue}
            getSetAccuracy={getSetAccuracy}
            mission={mission}
            onStartMission={startMission}
            onMissionSecondary={runMissionSecondary}
            onOpenPanel={openPanel}
            onLaunchWeakTopic={launchWeakTopic}
            onLoadRelatedReading={topic => { setResearchPreload(topic); setActiveSection('research'); }}
          />
        )}

        {activeSection === 'guidelines' && <GuidelinesTab />}

      </div>
    </div>
  );
}
