'use client';

/**
 * components/coach/ScholarHubPage.tsx
 *
 * Scholar Hub controller — owns shared state and SRS handlers.
 * All tab UI is delegated to sub-components in ./tabs/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useAnalytics, type WeakArea } from '@/hooks/useAnalytics';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { writeCoachHandoff } from '@/lib/coach/handoff';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';
import { buildCoachUrl } from '@/lib/coach/routes';
import { loadDecks, type SRSDeck } from '@/lib/srs/sm2';
import { persistDeckLocally, syncDeckToCloud } from '@/lib/srs/deck-utils';
import type { GeneratedContent } from '@/lib/offline/generate';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { TopicResearchResult } from '@/lib/coach/research';
import { SourceBriefTab }       from './tabs/SourceBriefTab';
import { AssignmentWriterTab }  from './tabs/AssignmentWriterTab';
import { ResearchTab }          from './tabs/ResearchTab';
import { RecoveryTab }          from './tabs/RecoveryTab';
import styles from '@/app/(dashboard)/coach/page.module.css';

type CoachPanel   = 'review' | 'manage';
type CoachSection = 'research' | 'brief' | 'write' | 'recovery';
type CoachOutput  =
  | { kind: 'quiz';      title: string; content: string; quiz: GeneratedContent; setId: string }
  | { kind: 'generated'; title: string; content: string };

const TAB_LABELS: Record<CoachSection, { label: string; icon: string }> = {
  'research': { label: 'Research',              icon: '🔍' },
  'brief':    { label: 'Source',               icon: '📄' },
  'write':    { label: 'Writing Studio',       icon: '✍️'  },
  'recovery': { label: 'Recovery',              icon: '📊' },
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

  const { data: analytics, loading: analyticsLoading, refresh: refreshAnalytics } = useAnalytics(30);

  const outputRef = useRef<HTMLDivElement | null>(null);
  const [activeSection,   setActiveSection]   = useState<CoachSection>('research');
  const [output,          setOutput]          = useState<CoachOutput | null>(null);

  // Shared cross-tab state
  const [sourceBrief,     setSourceBrief]     = useState<SourceBrief | null>(null);
  const [researchResult,  setResearchResult]  = useState<TopicResearchResult | null>(null);
  /** Topic to pre-load in Research tab (e.g. from Recovery "Reading" button) */
  const [researchPreload, setResearchPreload] = useState<string | undefined>(undefined);

  // Source action loading state (shared between SourceBriefTab and WriterTab)
  const [sourceActionLoading, setSourceActionLoading] = useState<'notes' | 'quiz' | 'flashcards' | null>(null);

  // ── SRS state ──────────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  const [reviewSets,     setReviewSets]     = useState<SRSDeck[]>([]);
  const [loadingSets,    setLoadingSets]    = useState(true);

  const selectedSetId = searchParams.get('set');
  const imported      = searchParams.get('imported') === '1';
  const panel         = searchParams.get('panel') === 'review' ? 'review'
                      : searchParams.get('panel') === 'manage' ? 'manage'
                      : null;

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

  // ── Source actions (shared between Source + Writer tabs) ───────────────────

  async function handleSourceAction(mode: 'notes' | 'quiz' | 'flashcards') {
    if (!sourceBrief || sourceActionLoading) return;
    setSourceActionLoading(mode);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, text: sourceBrief.extractedText,
          options: { count: mode === 'quiz' ? 8 : 10 },
          ai: { model: 'default' },
          privacyMode: 'cloud',
        }),
      });
      const payload = await res.json().catch(() => null) as { content?: string; error?: string } | null;
      if (!res.ok || typeof payload?.content !== 'string')
        throw new Error(payload?.error ?? `Could not create ${mode}`);

      if (mode === 'flashcards') {
        const { buildImportedDeck } = await import('@/lib/srs/deck-utils');
        const set = buildImportedDeck({
          title: sourceBrief.title, description: sourceBrief.summary,
          content: payload.content, sourceType: 'manual',
          sourceLabel: 'Source Brief import', creatorName: 'You',
        });
        if (!set) throw new Error('Could not turn this source into review cards.');
        persistDeckLocally(set);
        const synced = await syncDeckToCloud(set);
        await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, content: payload.content, metadata: { title: `Review set — ${sourceBrief.title}`, sourceTitle: sourceBrief.title } }) });
        broadcastInvalidate(LIBRARY_CHANNEL);
        await refreshReviewSets();
        refreshAnalytics();
        toast(synced ? `Created review set "${set.name}"` : `Created "${set.name}" locally`, synced ? 'success' : 'warning');
        openPanel(set.id, 'manage', true);
        return;
      }

      await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, content: payload.content, metadata: { title: `${mode === 'quiz' ? 'Quiz' : 'Notes'} — ${sourceBrief.title}`, sourceTitle: sourceBrief.title } }) });
      broadcastInvalidate(LIBRARY_CHANNEL);
      setOutput({ kind: 'generated', title: `${mode === 'quiz' ? 'Quiz' : 'Notes'} — ${sourceBrief.title}`, content: payload.content });
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast(err instanceof Error ? err.message : `Could not create ${mode}`, 'error');
    } finally {
      setSourceActionLoading(null);
    }
  }

  // ── Today's Mission ────────────────────────────────────────────────────────

  const topWeakAreas = useMemo(() => analytics?.weakAreas?.slice(0, 3) ?? [], [analytics?.weakAreas]);
  const contextStats = useMemo(() => {
    const activeSource = sourceBrief?.title ?? researchResult?.topic ?? null;
    const sourceCount = researchResult?.sources.length ?? 0;
    const citationCount = researchResult?.citations.length ?? 0;
    const dueCount = dueReviewSets.reduce((sum, set) => sum + getSetDue(set), 0);
    return { activeSource, sourceCount, citationCount, dueCount };
  }, [sourceBrief?.title, researchResult?.topic, researchResult?.sources.length, researchResult?.citations.length, dueReviewSets, getSetDue]);

  const activeSectionSummary = useMemo(() => {
    if (activeSection === 'research') {
      return {
        title: 'Multi-source research workspace',
        description: researchResult
          ? `Your current brief compares ${researchResult.sources.length} ranked sources and keeps ${researchResult.citations.length} citations visible.`
          : 'Search automatically, compare manual links, and keep your evidence trail visible.',
        pills: [
          researchResult ? `Provider: ${researchResult.provider}` : 'Ready for topic search',
          researchResult ? `Ranking: ${researchResult.ranking}` : 'Auto / manual / hybrid',
        ],
      };
    }
    if (activeSection === 'brief') {
      return {
        title: 'Source breakdown',
        description: sourceBrief
          ? `You are working from ${sourceBrief.sourceLabel} and can turn it into notes, quiz material, or a review set handoff.`
          : 'Paste text, analyze a URL, or upload a file to extract key ideas and get a grounded source brief.',
        pills: [
          sourceBrief ? `${sourceBrief.wordCount.toLocaleString()} words` : 'URL / text / file',
          sourceBrief ? `${sourceBrief.keyPoints.length} key points` : 'Source-first workflow',
        ],
      };
    }
    if (activeSection === 'write') {
      return {
        title: 'Writing studio',
        description: researchResult || sourceBrief
          ? 'Use your current source and research context to build stronger drafts, outlines, and revisions.'
          : 'Bring in a source first, then turn it into a report structure, draft, or checked paragraph.',
        pills: [
          researchResult ? 'Research context connected' : 'Works from source context',
          'Draft · report · check',
        ],
      };
    }
    return {
      title: 'Recovery and review',
      description: dueReviewSets.length
        ? `You have ${dueReviewSets.length} review set${dueReviewSets.length === 1 ? '' : 's'} with due work ready to continue in Workspace.`
        : 'See what is due, where you are weak, and what to practice next.',
      pills: [
        `${contextStats.dueCount} due cards`,
        topWeakAreas[0] ? `Top weak area: ${topWeakAreas[0].topic}` : 'Weak-area insights ready',
      ],
    };
  }, [activeSection, contextStats.dueCount, dueReviewSets.length, researchResult, sourceBrief, topWeakAreas]);

  const mission = useMemo(() => {
    if (dueReviewSets[0]) {
      const set = dueReviewSets[0];
      const due = getSetDue(set);
      return { eyebrow: "Today's Mission", title: `Review ${due} due card${due === 1 ? '' : 's'} in ${set.name}`, description: 'Start with the review set that is already waiting.', actionLabel: "Start today's mission", secondaryLabel: 'Quick manage', kind: 'review' as const, setId: set.id };
    }
    if (topWeakAreas[0]) {
      const area = topWeakAreas[0];
      return { eyebrow: "Today's Mission", title: `Recover ${area.topic}`, description: `${Math.round(area.accuracy)}% accuracy — a short focused practice run is the best next move.`, actionLabel: "Start today's mission", secondaryLabel: 'Explain it', kind: 'weak' as const, weakArea: area };
    }
    if ((analytics?.planStats?.activePlans ?? 0) > 0 && (analytics?.planStats?.averageProgress ?? 100) < 60) {
      return { eyebrow: "Today's Mission", title: 'Catch up on your active study plan', description: `${analytics?.planStats?.averageProgress ?? 0}% average progress.`, actionLabel: "Start today's mission", secondaryLabel: 'Open planner', kind: 'plan' as const };
    }
    if (reviewSets.length === 0) {
      return { eyebrow: "Today's Mission", title: 'Import your first review set', description: 'Bring in a reliable source and let Scholar Hub guide the next steps.', actionLabel: "Start today's mission", secondaryLabel: 'View review sets', kind: 'import' as const };
    }
    const set = sortedReviewSets[0];
    return { eyebrow: "Today's Mission", title: `Open ${set?.name ?? 'your latest review set'}`, description: 'Nothing urgent is due right now.', actionLabel: "Start today's mission", secondaryLabel: 'Quick manage', kind: 'manage' as const, setId: set?.id };
  }, [analytics, dueReviewSets, reviewSets, sortedReviewSets, topWeakAreas, getSetDue]);

  function launchWeakTopic(area: WeakArea, tool: 'quiz' | 'explain') {
    writeCoachHandoff({ type: 'weak-topic', topic: area.topic, preferredTool: tool });
    toast(`"${area.topic}" is ready in Workspace`, 'success');
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
            {sourceBrief && (
              <span className={styles.sourceIndicator}>
                📄 {sourceBrief.title.slice(0, 45)}{sourceBrief.title.length > 45 ? '…' : ''}
              </span>
            )}
          </div>
        </div>
        <nav className={styles.tabNav}>
          {(['research', 'brief', 'write', 'recovery'] as CoachSection[]).map(id => (
            <button
              key={id}
              className={`${styles.tabBtn} ${activeSection === id ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <span>{TAB_LABELS[id].icon}</span>
              {TAB_LABELS[id].label}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }}>
          <a
            href="/workspace"
            className={styles.btnSecondary}
            style={{ fontSize: '0.78rem', textDecoration: 'none', padding: '0.3rem 0.7rem' }}
            title="Open Workspace — practice, review sets, file tools"
          >
            Workspace →
          </a>
          <button
            className={styles.refreshBtn}
            title="Refresh all data"
            onClick={() => void refreshReviewSets().then(() => refreshAnalytics())}
          >
            ↻
          </button>
        </div>
      </header>

      <div className={styles.contextStrip} style={drawerMode ? { marginTop: 0 } : undefined}>
        <div className={styles.contextStripGroup}>
          <span className={styles.contextStripLabel}>Focus</span>
          <strong>{contextStats.activeSource ?? 'Start with a topic or source'}</strong>
        </div>
        <div className={styles.contextStripMeta}>
          <span className={styles.metaTag}>{contextStats.sourceCount} compared sources</span>
          <span className={styles.metaTag}>{contextStats.citationCount} citations</span>
          <span className={styles.metaTag}>{contextStats.dueCount} due review cards</span>
          {topWeakAreas[0] && <span className={styles.metaTag}>Weak area: {topWeakAreas[0].topic}</span>}
        </div>
      </div>

      <div className={styles.sectionStrip}>
        <div className={styles.sectionStripCopy}>
          <span className={styles.contextStripLabel}>{TAB_LABELS[activeSection].label}</span>
          <strong>{activeSectionSummary.title}</strong>
          <p>{activeSectionSummary.description}</p>
        </div>
        <div className={styles.sectionStripMeta}>
          {activeSectionSummary.pills.map((pill) => (
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
              Open in Workspace
            </button>
            <button className={styles.btnSecondary} onClick={closePanel}>Stay here</button>
          </div>
        </div>
      )}

      {/* Output overlay */}
      {output && (
        <div className={styles.outputPanel} ref={outputRef}>
          <div className={styles.outputPanelHead}>
            <strong>{output.title}</strong>
            <button className={styles.iconBtn} onClick={() => setOutput(null)}>✕</button>
          </div>
          {output.kind === 'quiz'
            ? <InteractiveQuiz content={output.quiz} deckId={output.setId} onClose={() => setOutput(null)} />
            : <pre className={styles.preText}>{output.content}</pre>
          }
        </div>
      )}

      {/* Tab content */}
      <div className={styles.tabContent}>

        {activeSection === 'brief' && (
          <SourceBriefTab
            sourceBrief={sourceBrief}
            onBriefChange={brief => { setSourceBrief(brief); setOutput(null); }}
            onOpenPanel={openPanel}
            onNavigateToResearch={navigateToResearch}
            onOutput={out => {
              setOutput({ kind: 'generated', title: out.title, content: out.content });
              outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            refreshReviewSets={refreshReviewSets}
            refreshAnalytics={refreshAnalytics}
          />
        )}

        {activeSection === 'write' && (
          <AssignmentWriterTab
            sourceBrief={sourceBrief}
            researchResult={researchResult}
            onNavigateToResearch={navigateToResearch}
            sourceActionLoading={sourceActionLoading}
            onSourceAction={mode => void handleSourceAction(mode)}
          />
        )}

        {activeSection === 'research' && (
          <ResearchTab
            sourceBrief={sourceBrief}
            researchResult={researchResult}
            onResearchResult={setResearchResult}
            preloadTopic={researchPreload}
            onPreloadConsumed={() => setResearchPreload(undefined)}
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

      </div>
    </div>
  );
}
