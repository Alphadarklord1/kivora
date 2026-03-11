'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderPanel } from '@/components/folders/FolderPanel';
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel';
import { useSettings } from '@/providers/SettingsProvider';

export default function WorkspacePage() {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = (key: string) => {
    const ar: Record<string, string> = {
      'Structured study operations': 'عمليات دراسية منظمة',
      Workspace: 'مساحة العمل',
      'Run files, folders, and AI study workflows inside one controlled workspace.': 'شغّل الملفات والمجلدات وسير العمل الدراسي بالذكاء الاصطناعي داخل مساحة واحدة منظمة.',
      'Guest-ready': 'جاهز للضيف',
      'Folders + files': 'مجلدات + ملفات',
      'AI generation': 'توليد بالذكاء الاصطناعي',
      'System view': 'عرض النظام',
      'Organize folders, generate outputs, and keep everything inside the same study surface.': 'نظّم المجلدات، وأنشئ المخرجات، واحتفظ بكل شيء داخل نفس مساحة الدراسة.',
    };
    return isArabic ? (ar[key] || key) : key;
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [selectedTopicName, setSelectedTopicName] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [folderCollapsed, setFolderCollapsed] = useState(false);
  const openFileId = searchParams.get('openFileId');

  const handleFolderSelect = useCallback((folderId: string | null, folderName: string, topicId: string | null, topicName: string) => {
    setSelectedFolder(folderId);
    setSelectedFolderName(folderName);
    setSelectedTopic(topicId);
    setSelectedTopicName(topicName);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleOpenFileHandled = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('openFileId')) return;
    params.delete('openFileId');
    const nextUrl = params.toString() ? `/workspace?${params.toString()}` : '/workspace';
    router.replace(nextUrl);
  }, [router, searchParams]);

  return (
    <div className="workspace-shell">
      <div className="workspace-backdrop" />
      <div className="workspace-hero">
        <div className="hero-copy">
          <div className="hero-kicker-row">
            <span className="hero-kicker">{t('Structured study operations')}</span>
          </div>
          <h1>{t('Workspace')}</h1>
          <p>
            {t('Run files, folders, and AI study workflows inside one controlled workspace.')}
          </p>
          <div className="hero-meta">
            <span>{t('Guest-ready')}</span>
            <span>{t('Folders + files')}</span>
            <span>{t('AI generation')}</span>
          </div>
        </div>
        <div className="hero-card">
          <span className="hero-card-eyebrow">{t('System view')}</span>
          <strong>{t('Workspace')}</strong>
          <p>{t('Organize folders, generate outputs, and keep everything inside the same study surface.')}</p>
        </div>
      </div>

      <div className="workspace-frame">
        <div className={`workspace-layout ${folderCollapsed ? 'collapsed' : ''}`}>
          <FolderPanel
            onSelect={handleFolderSelect}
            selectedFolder={selectedFolder}
            selectedTopic={selectedTopic}
            refreshKey={refreshKey}
            collapsed={folderCollapsed}
            onToggleCollapse={() => setFolderCollapsed(prev => !prev)}
          />
          <WorkspacePanel
            selectedFolder={selectedFolder}
            selectedTopic={selectedTopic}
            selectedFolderName={selectedFolderName}
            selectedTopicName={selectedTopicName}
            onRefresh={handleRefresh}
            openFileId={openFileId}
            onOpenFileHandled={handleOpenFileHandled}
          />
        </div>
      </div>

      <style jsx>{`
        .workspace-shell {
          position: relative;
          padding: var(--space-4);
          overflow: hidden;
          background: linear-gradient(180deg, #06101f 0%, #071223 36%, #040914 100%);
          border: 1px solid rgba(121, 143, 194, 0.16);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
          border-radius: 32px;
          min-height: calc(100vh - 120px);
          min-height: calc(100dvh - 120px);
        }

        .workspace-backdrop {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at top left, rgba(53, 112, 255, 0.22), transparent 26%),
            radial-gradient(circle at 85% 12%, rgba(96, 165, 250, 0.14), transparent 24%),
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: auto, auto, 32px 32px, 32px 32px;
          mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.95), transparent 88%);
          pointer-events: none;
        }

        .workspace-hero,
        .workspace-frame {
          position: relative;
          z-index: 1;
        }

        .workspace-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.65fr);
          gap: var(--space-4);
          margin-bottom: var(--space-5);
        }

        .hero-copy,
        .hero-card {
          border: 1px solid rgba(121, 143, 194, 0.18);
          background: rgba(7, 15, 28, 0.72);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(16px);
        }

        .hero-copy {
          padding: clamp(1.5rem, 2vw, 2rem);
          border-radius: 2rem;
        }

        .hero-kicker-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .hero-kicker,
        .hero-card-eyebrow {
          display: inline-flex;
          align-items: center;
          min-height: 1.9rem;
          padding: 0 0.8rem;
          width: fit-content;
          border-radius: 999px;
          background: rgba(79, 115, 222, 0.16);
          border: 1px solid rgba(125, 157, 255, 0.22);
          color: #9bb9ff;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hero-copy h1 {
          margin: 0;
          font-size: clamp(2.5rem, 4vw, 4.25rem);
          line-height: 0.98;
          letter-spacing: -0.04em;
          color: #e7eefc;
        }

        .hero-copy p,
        .hero-card p {
          margin: 1rem 0 0;
          color: #a8b5cf;
          line-height: 1.7;
        }

        .hero-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem 1rem;
          margin-top: 1.25rem;
          color: #8e9bb4;
          font-size: 0.92rem;
        }

        .hero-card {
          padding: 1.35rem;
          border-radius: 2rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .hero-card strong {
          margin-top: 0.9rem;
          font-size: 1.2rem;
          color: #f3f7ff;
        }

        .workspace-frame {
          border: 1px solid rgba(121, 143, 194, 0.18);
          background: rgba(7, 15, 28, 0.72);
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(16px);
          border-radius: 2rem;
          padding: var(--space-4);
        }

        .workspace-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: var(--space-5);
          height: 100%;
        }

        .workspace-layout.collapsed {
          grid-template-columns: 72px 1fr;
        }

        @media (max-width: 1023px) and (min-width: 768px) {
          .workspace-hero {
            grid-template-columns: 1fr;
          }

          .workspace-layout {
            grid-template-columns: 260px 1fr;
            gap: var(--space-3);
          }
          .workspace-layout.collapsed {
            grid-template-columns: 72px 1fr;
          }
        }

        @media (max-width: 767px) {
          .workspace-shell {
            padding: var(--space-3);
            min-height: auto;
            border-radius: 22px;
          }

          .workspace-hero,
          .workspace-layout {
            grid-template-columns: 1fr;
          }

          .workspace-frame {
            padding: var(--space-3);
            border-radius: 1.5rem;
          }

          .workspace-layout {
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}
