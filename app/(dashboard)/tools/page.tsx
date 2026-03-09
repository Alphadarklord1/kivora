'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getGeneratedContent, ToolMode, GeneratedContent, type RewriteOptions, type RewriteTone } from '@/lib/offline/generate';
import { generateAiContent, loadAiPreferences } from '@/lib/ai/client';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { MathSolver } from '@/components/tools/MathSolver';
import { GraphingCalculator } from '@/components/tools/GraphingCalculator';
import { MatlabLab } from '@/components/tools/MatlabLab';
import { VisualAnalyzer } from '@/components/tools/VisualAnalyzer';
import { AudioPodcast } from '@/components/tools/AudioPodcast';
import { useToastHelpers } from '@/components/ui/Toast';
import { useSettings } from '@/providers/SettingsProvider';

type ToolTab = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'notes' | 'rephrase' | 'math' | 'graph' | 'matlab' | 'visual' | 'audio';

const toolTabs: { id: ToolTab; label: string; icon: string; description: string }[] = [
  { id: 'assignment', label: 'Assignment', icon: '📝', description: 'Generate assignment questions and prompts' },
  { id: 'summarize', label: 'Summarize', icon: '📄', description: 'Create concise summaries of your content' },
  { id: 'mcq', label: 'MCQ', icon: '✅', description: 'Generate multiple choice questions' },
  { id: 'quiz', label: 'Quiz', icon: '🧠', description: 'Create comprehensive quizzes' },
  { id: 'notes', label: 'Notes', icon: '📝', description: 'Generate Cornell-style study notes' },
  { id: 'rephrase', label: 'Rephrase', icon: '✍️', description: 'Rewrite text in a selected tone and style' },
  { id: 'math', label: 'Math', icon: '🧮', description: 'Solve mathematical problems step-by-step' },
  { id: 'graph', label: 'Graph', icon: '📈', description: 'Plot and visualize mathematical functions' },
  { id: 'matlab', label: 'MATLAB Lab', icon: '📐', description: 'Run matrix, script, and command-window workflows together' },
  { id: 'visual', label: 'Visual', icon: '🔍', description: 'Analyze images, diagrams, and PDFs with AI vision' },
  { id: 'audio', label: 'Audio', icon: '🎧', description: 'Listen to your study materials as a podcast' },
];

interface FolderData {
  id: string;
  name: string;
  topics?: { id: string; name: string }[];
}

const rewriteToneOptions: RewriteTone[] = ['formal', 'informal', 'academic', 'professional', 'energetic', 'concise'];

export default function ToolsPage() {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = (key: string) => {
    const ar: Record<string, string> = {
      'Study Tools': 'أدوات الدراسة',
      'Generate study materials from any content': 'ولّد مواد دراسية من أي محتوى',
      'Paste your study material': 'ألصق المادة الدراسية',
      'Paste your study material here... (lectures, textbook excerpts, articles, etc.)': 'ألصق المادة الدراسية هنا... (محاضرات، مقتطفات كتاب، مقالات، إلخ)',
      'No content': 'لا يوجد محتوى',
      'Please enter text to process': 'يرجى إدخال نص للمعالجة',
      'Content too short': 'المحتوى قصير جدًا',
      'Please enter at least 50 characters for better results': 'يرجى إدخال 50 حرفًا على الأقل للحصول على نتائج أفضل',
      'Study-only AI': 'ذكاء اصطناعي مخصص للدراسة',
      'Generated with OpenAI': 'تم التوليد عبر OpenAI',
      'Cloud unavailable, used offline fallback': 'تعذر استخدام السحابة، تم استخدام البديل المحلي',
      'Generated successfully': 'تم التوليد بنجاح',
      'Generation failed': 'فشل التوليد',
      'An error occurred while generating content': 'حدث خطأ أثناء توليد المحتوى',
      'Failed to load folders': 'فشل تحميل المجلدات',
      'Select folder & topic': 'اختر المجلد والموضوع',
      'Please choose where to save': 'يرجى اختيار مكان الحفظ',
      'Saved to folder': 'تم الحفظ في المجلد',
      'Failed to save': 'فشل الحفظ',
      'Saving...': 'جارٍ الحفظ...',
      Save: 'حفظ',
      Cancel: 'إلغاء',
      'Generating...': 'جارٍ التوليد...',
      'Saved to library': 'تم الحفظ في المكتبة',
      'Could not save to library': 'تعذر الحفظ في المكتبة',
      'Please try again': 'يرجى المحاولة مرة أخرى',
      'Copied to clipboard': 'تم النسخ إلى الحافظة',
      Tone: 'النبرة',
      'Custom instruction (optional)': 'تعليمات مخصصة (اختياري)',
      'Example: Keep it under 90 words and use bullets.': 'مثال: اجعلها أقل من 90 كلمة واستخدم نقاطًا.',
      words: 'كلمة',
      characters: 'حرف',
      Generate: 'توليد',
      'Practice Mode': 'وضع التدريب',
      'Edit Input': 'تعديل الإدخال',
      'Start New': 'بدء جديد',
      Copy: 'نسخ',
      'Save to Library': 'حفظ في المكتبة',
      'Save to Folder': 'حفظ في المجلد',
      'Save to Folder Title': 'حفظ في مجلد',
      Folder: 'المجلد',
      Topic: 'الموضوع',
      '-- Select folder --': '-- اختر المجلد --',
      '-- Select topic --': '-- اختر الموضوع --',
      Assignment: 'واجب',
      Summarize: 'تلخيص',
      'Generate assignment questions and prompts': 'ولّد أسئلة ومطالبات للواجبات',
      'Create concise summaries of your content': 'أنشئ ملخصات موجزة لمحتواك',
      'Generate multiple choice questions': 'ولّد أسئلة اختيار من متعدد',
      'Create comprehensive quizzes': 'أنشئ اختبارات شاملة',
      'Generate Cornell-style study notes': 'ولّد ملاحظات دراسية بأسلوب كورنيل',
      'Rewrite text in a selected tone and style': 'أعد صياغة النص بنبرة وأسلوب محددين',
      'Solve mathematical problems step-by-step': 'حل مسائل الرياضيات خطوة بخطوة',
      'Plot and visualize mathematical functions': 'ارسم الدوال الرياضية وتصورها',
      'Run matrix, script, and command-window workflows together': 'شغّل المصفوفات والسكربتات ونافذة الأوامر ضمن سير عمل واحد',
      'Analyze images, diagrams, and PDFs with AI vision': 'حلّل الصور والمخططات وملفات PDF عبر الرؤية الذكية',
      'Listen to your study materials as a podcast': 'استمع إلى موادك الدراسية كبودكاست',
      Quiz: 'اختبار',
      Notes: 'ملاحظات',
      Rephrase: 'إعادة صياغة',
      Math: 'رياضيات',
      Graph: 'رسم بياني',
      'MATLAB Lab': 'مختبر MATLAB',
      Visual: 'تحليل بصري',
      Audio: 'صوتي',
      'Math Workspace': 'مساحة عمل الرياضيات',
      'Move between solver, graphing, and MATLAB without leaving the page.': 'تنقّل بين المحلل والرسم وMATLAB من دون مغادرة الصفحة.',
      Solver: 'المحلل',
      Plotter: 'الرسام',
      Lab: 'المختبر',
      Formal: 'رسمي',
      Informal: 'غير رسمي',
      Academic: 'أكاديمي',
      Professional: 'مهني',
      Energetic: 'حيوي',
      Concise: 'موجز',
    };
    return isArabic ? (ar[key] || key) : key;
  };

  const toast = useToastHelpers();
  const searchParams = useSearchParams();
  const [toolTab, setToolTab] = useState<ToolTab>('assignment');
  const [inputText, setInputText] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [showInteractiveQuiz, setShowInteractiveQuiz] = useState(false);
  const [viewMode, setViewMode] = useState<'input' | 'output' | 'practice'>('input');
  const [rewriteTone, setRewriteTone] = useState<RewriteTone>('professional');
  const [rewriteInstruction, setRewriteInstruction] = useState('');

  // Graph expression state (from Math Solver)
  const [graphExpression, setGraphExpression] = useState('');
  const isMathWorkspace = toolTab === 'math' || toolTab === 'graph' || toolTab === 'matlab';

  const handleGraphFromMath = (expression: string) => {
    setGraphExpression(expression);
    setToolTab('graph');
  };

  // Save to folder state
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [savingToFolder, setSavingToFolder] = useState(false);

  // Read query params from Library deep-link
  useEffect(() => {
    const mode = searchParams.get('mode');
    const input = searchParams.get('input');
    if (mode && toolTabs.some(t => t.id === mode)) {
      setToolTab(mode as ToolTab);
    }
    if (input) {
      setInputText(input);
      setViewMode('input');
    }
  }, [searchParams]);

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      toast.warning(t('No content'), t('Please enter text to process'));
      return;
    }

    if (toolTab !== 'rephrase' && inputText.trim().length < 50) {
      toast.warning(t('Content too short'), t('Please enter at least 50 characters for better results'));
      return;
    }

    setGenerating(true);
    try {
      const rewriteOptions: RewriteOptions | undefined = toolTab === 'rephrase'
        ? {
          tone: rewriteTone,
          ...(rewriteInstruction.trim() ? { customInstruction: rewriteInstruction.trim() } : {}),
        }
        : undefined;

      const prefs = loadAiPreferences();
      const ai = await generateAiContent(inputText, toolTab as ToolMode, prefs, rewriteOptions);

      if (ai.status === 'policy_block') {
        const suggestions = ai.suggestionModes?.length ? ` Try: ${ai.suggestionModes.join(', ')}.` : '';
        toast.warning(t('Study-only AI'), `${ai.reason}${suggestions}`);
        setGeneratedContent(null);
        setOutput('');
        setViewMode('input');
        return;
      }

      const content = ai.status === 'success'
        ? ai.content
        : getGeneratedContent(toolTab as ToolMode, inputText, rewriteOptions);

      setGeneratedContent(content);
      setOutput(content.displayText);
      setViewMode('output');

      if (ai.status === 'success') {
        if (ai.provider === 'openai' && !ai.fallbackUsed) {
          toast.success(t('Generated with OpenAI'));
        } else if (ai.fallbackUsed) {
          toast.warning(t('Cloud unavailable, used offline fallback'), ai.reason || undefined);
        } else {
          toast.success(t('Generated successfully'));
        }
      } else {
        toast.warning(t('Cloud unavailable, used offline fallback'), ai.message);
      }
    } catch {
      toast.error(t('Generation failed'), t('An error occurred while generating content'));
      setGeneratedContent(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleStartInteractive = () => {
    if (generatedContent && generatedContent.questions.length > 0) {
      setShowInteractiveQuiz(true);
      setViewMode('practice');
    }
  };

  const handleCloseInteractive = () => {
    setShowInteractiveQuiz(false);
    setViewMode('output');
  };

  const handleToolReset = () => {
    setInputText('');
    setOutput('');
    setGeneratedContent(null);
    setShowInteractiveQuiz(false);
    setViewMode('input');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    toast.success(t('Copied to clipboard'));
  };

  const handleOpenFolderPicker = async () => {
    try {
      const res = await fetch('/api/folders', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch {
      toast.error(t('Failed to load folders'));
    }
    setShowFolderPicker(true);
  };

  const handleSaveToFolder = async () => {
    if (!selectedFolderId || !selectedTopicId) {
      toast.warning(t('Select folder & topic'), t('Please choose where to save'));
      return;
    }
    setSavingToFolder(true);
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${toolTab} - ${new Date().toLocaleString()}`,
          type: toolTab,
          content: output,
          folderId: selectedFolderId,
          topicId: selectedTopicId,
        }),
        credentials: 'include',
      });
      if (res.ok) {
        toast.success(t('Saved to folder'));
        setShowFolderPicker(false);
        setSelectedFolderId('');
        setSelectedTopicId('');
      } else {
        toast.error(t('Failed to save'));
      }
    } catch {
      toast.error(t('Failed to save'));
    } finally {
      setSavingToFolder(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!output) return;

    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: toolTab, content: output }),
        credentials: 'include',
      });
      if (res.ok) {
        toast.success(t('Saved to library'));
      } else {
        toast.error(t('Failed to save'), t('Could not save to library'));
      }
    } catch {
      toast.error(t('Failed to save'), t('Please try again'));
    }
  };

  const currentTool = toolTabs.find(t => t.id === toolTab);
  const getToneLabel = (tone: RewriteTone) => {
    const labels: Record<RewriteTone, string> = {
      formal: 'Formal',
      informal: 'Informal',
      academic: 'Academic',
      professional: 'Professional',
      energetic: 'Energetic',
      concise: 'Concise',
    };
    return t(labels[tone]);
  };

  return (
    <div className="tools-page">
      <div className="page-header">
        <h1>{t('Study Tools')}</h1>
        <p>{t('Generate study materials from any content')}</p>
      </div>

      <div className="tools-layout">
        {/* Tool Sidebar */}
        <aside className="tools-sidebar">
          <nav className="tool-nav">
            {toolTabs.map((tool) => (
              <button
                key={tool.id}
                className={`tool-nav-item ${toolTab === tool.id ? 'active' : ''}`}
                onClick={() => {
                  setToolTab(tool.id);
                  handleToolReset();
                }}
              >
                <span className="tool-icon">{tool.icon}</span>
                <div className="tool-info">
                  <span className="tool-name">{t(tool.label)}</span>
                  <span className="tool-desc">{t(tool.description)}</span>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        {/* Tool Content */}
        <main className="tools-content">
          <div className="tool-header">
            <span className="tool-header-icon">{currentTool?.icon}</span>
            <div>
              <h2>{t(currentTool?.label || '')}</h2>
              <p>{t(currentTool?.description || '')}</p>
            </div>
          </div>

          {isMathWorkspace && (
            <div className="math-workflow-banner">
              <div>
                <strong>{t('Math Workspace')}</strong>
                <p>{t('Move between solver, graphing, and MATLAB without leaving the page.')}</p>
              </div>
              <div className="math-workflow-actions">
                <button className={`math-workflow-btn ${toolTab === 'math' ? 'active' : ''}`} onClick={() => setToolTab('math')}>{t('Solver')}</button>
                <button className={`math-workflow-btn ${toolTab === 'graph' ? 'active' : ''}`} onClick={() => setToolTab('graph')}>{t('Plotter')}</button>
                <button className={`math-workflow-btn ${toolTab === 'matlab' ? 'active' : ''}`} onClick={() => setToolTab('matlab')}>{t('Lab')}</button>
              </div>
            </div>
          )}

          {/* Math Solver */}
          {toolTab === 'math' ? (
            <MathSolver onGraphExpression={handleGraphFromMath} />
          ) : toolTab === 'graph' ? (
            <GraphingCalculator initialExpression={graphExpression || undefined} />
          ) : toolTab === 'matlab' ? (
            <MatlabLab onGraphExpression={handleGraphFromMath} />
          ) : toolTab === 'visual' ? (
            <VisualAnalyzer />
          ) : toolTab === 'audio' ? (
            <AudioPodcast />
          ) : (
            <div className="tool-workspace">
              {/* Input Mode */}
              {viewMode === 'input' && (
                <div className="input-section">
                  <label htmlFor="content-input">{t('Paste your study material')}</label>
                  <textarea
                    id="content-input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t('Paste your study material here... (lectures, textbook excerpts, articles, etc.)')}
                    rows={12}
                  />
                  {toolTab === 'rephrase' && (
                    <div className="rewrite-controls">
                      <div className="rewrite-field">
                        <label htmlFor="tone-select">{t('Tone')}</label>
                        <select
                          id="tone-select"
                          value={rewriteTone}
                          onChange={(event) => setRewriteTone(event.target.value as RewriteTone)}
                        >
                          {rewriteToneOptions.map((tone) => (
                            <option key={tone} value={tone}>
                              {getToneLabel(tone)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rewrite-field">
                        <label htmlFor="custom-instruction">{t('Custom instruction (optional)')}</label>
                        <input
                          id="custom-instruction"
                          type="text"
                          value={rewriteInstruction}
                          onChange={(event) => setRewriteInstruction(event.target.value)}
                          placeholder={t('Example: Keep it under 90 words and use bullets.')}
                        />
                      </div>
                    </div>
                  )}
                  {inputText && (
                    <div className="input-stats">
                      <span>{inputText.split(/\s+/).filter(Boolean).length} {t('words')}</span>
                      <span>{inputText.length} {t('characters')}</span>
                    </div>
                  )}

                  <button
                    className="btn generate-btn"
                    onClick={handleGenerate}
                    disabled={generating || !inputText.trim()}
                  >
                    {generating ? (
                      <>
                        <span className="spinner" /> {t('Generating...')}
                      </>
                    ) : (
                      <>{t('Generate')} {t(currentTool?.label || '')}</>
                    )}
                  </button>
                </div>
              )}

              {/* Output Mode */}
              {viewMode === 'output' && output && !showInteractiveQuiz && (
                <div className="output-section">
                  <div className="output-actions-top">
                    {generatedContent && generatedContent.questions.length > 0 && (
                      <button className="btn" onClick={handleStartInteractive}>
                        🎯 {t('Practice Mode')}
                      </button>
                    )}
                    <button className="btn secondary" onClick={() => setViewMode('input')}>
                      ✏️ {t('Edit Input')}
                    </button>
                    <button className="btn secondary" onClick={handleToolReset}>
                      ↺ {t('Start New')}
                    </button>
                  </div>

                  <div className="output-display">
                    <pre>{output}</pre>
                  </div>

                  <div className="output-actions-bottom">
                    <button className="btn secondary" onClick={handleCopy}>
                      📋 {t('Copy')}
                    </button>
                    <button className="btn secondary" onClick={handleSaveToLibrary}>
                      📚 {t('Save to Library')}
                    </button>
                    <button className="btn secondary" onClick={handleOpenFolderPicker}>
                      📁 {t('Save to Folder')}
                    </button>
                  </div>

                  {/* Folder Picker Modal */}
                  {showFolderPicker && (
                    <div className="folder-picker-overlay" onClick={() => setShowFolderPicker(false)}>
                      <div className="folder-picker" onClick={(e) => e.stopPropagation()}>
                        <h3>{t('Save to Folder Title')}</h3>
                        <div className="picker-field">
                          <label>{t('Folder')}</label>
                          <select
                            value={selectedFolderId}
                            onChange={(e) => { setSelectedFolderId(e.target.value); setSelectedTopicId(''); }}
                          >
                            <option value="">{t('-- Select folder --')}</option>
                            {folders.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                        {selectedFolderId && (
                          <div className="picker-field">
                            <label>{t('Topic')}</label>
                            <select
                              value={selectedTopicId}
                              onChange={(e) => setSelectedTopicId(e.target.value)}
                            >
                              <option value="">{t('-- Select topic --')}</option>
                              {folders.find(f => f.id === selectedFolderId)?.topics?.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="picker-actions">
                          <button className="btn secondary" onClick={() => setShowFolderPicker(false)}>{t('Cancel')}</button>
                          <button
                            className="btn"
                            onClick={handleSaveToFolder}
                            disabled={!selectedFolderId || !selectedTopicId || savingToFolder}
                          >
                            {savingToFolder ? t('Saving...') : t('Save')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Practice Mode */}
              {viewMode === 'practice' && showInteractiveQuiz && generatedContent && (
                <InteractiveQuiz content={generatedContent} onClose={handleCloseInteractive} />
              )}
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .tools-page {
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: var(--space-6);
        }

        .page-header h1 {
          font-size: var(--font-2xl);
          font-weight: 700;
          margin-bottom: var(--space-1);
        }

        .page-header p {
          color: var(--text-muted);
        }

        .tools-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: var(--space-6);
        }

        @media (max-width: 900px) {
          .tools-layout {
            grid-template-columns: 1fr;
          }

          .tools-sidebar {
            order: 0;
            position: sticky;
            top: 0;
            z-index: 10;
          }

          .tool-nav {
            display: flex;
            flex-direction: row;
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            gap: var(--space-2);
          }

          .tool-nav::-webkit-scrollbar {
            display: none;
          }

          .tool-nav-item {
            flex-direction: row;
            align-items: center;
            text-align: left;
            flex-shrink: 0;
            min-width: auto;
            padding: var(--space-2) var(--space-3);
          }

          .tool-desc {
            display: none;
          }

          .tool-icon {
            font-size: 18px;
            margin-top: 0;
          }
        }

        .tools-sidebar {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-3);
          height: fit-content;
          position: sticky;
          top: var(--space-4);
        }

        .tool-nav {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .tool-nav-item {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3);
          border: none;
          background: transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          width: 100%;
        }

        .tool-nav-item:hover {
          background: var(--bg-inset);
        }

        .tool-nav-item.active {
          background: var(--primary-muted);
        }

        .tool-icon {
          font-size: 24px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .tool-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .tool-name {
          font-weight: 600;
          color: var(--text-primary);
        }

        .tool-nav-item.active .tool-name {
          color: var(--primary);
        }

        .tool-desc {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          line-height: 1.3;
        }

        .tools-content {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          min-height: 500px;
        }

        .tool-header {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          margin-bottom: var(--space-5);
          padding-bottom: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .tool-header-icon {
          font-size: 40px;
        }

        .tool-header h2 {
          font-size: var(--font-lg);
          font-weight: 600;
          margin: 0;
        }

        .tool-header p {
          font-size: var(--font-meta);
          color: var(--text-muted);
          margin: 0;
        }

        .math-workflow-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-4);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-subtle);
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, var(--bg-surface)), var(--bg-surface));
          margin-bottom: var(--space-4);
          flex-wrap: wrap;
        }

        .math-workflow-banner strong {
          display: block;
          margin-bottom: 4px;
        }

        .math-workflow-banner p {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .math-workflow-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .math-workflow-btn {
          border: 1px solid var(--border-subtle);
          border-radius: 999px;
          background: var(--bg-surface);
          color: var(--text-secondary);
          padding: var(--space-2) var(--space-3);
          cursor: pointer;
          font-size: var(--font-meta);
          transition: var(--transition-fast);
        }

        .math-workflow-btn.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .tool-workspace {
          display: flex;
          flex-direction: column;
        }

        .input-section label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: var(--space-2);
        }

        .input-section textarea {
          width: 100%;
          padding: var(--space-4);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          font-family: inherit;
          line-height: 1.6;
          resize: vertical;
          background: var(--bg-base);
        }

        .input-section textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-muted);
        }

        .input-stats {
          display: flex;
          gap: var(--space-4);
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-top: var(--space-2);
          margin-bottom: var(--space-4);
        }

        .rewrite-controls {
          display: grid;
          gap: var(--space-3);
          margin-top: var(--space-3);
          margin-bottom: var(--space-2);
        }

        .rewrite-field {
          display: grid;
          gap: var(--space-1);
        }

        .rewrite-field label {
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }

        .rewrite-field select,
        .rewrite-field input {
          width: 100%;
          padding: var(--space-2);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          background: var(--bg-base);
        }

        .generate-btn {
          width: 100%;
          padding: var(--space-3) var(--space-4);
          font-size: var(--font-body);
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .output-section {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .output-actions-top,
        .output-actions-bottom {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .output-display {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-4);
          max-height: 400px;
          overflow-y: auto;
        }

        .output-display pre {
          white-space: pre-wrap;
          word-wrap: break-word;
          font-family: inherit;
          font-size: var(--font-body);
          line-height: 1.6;
          margin: 0;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          font-size: var(--font-meta);
          font-weight: 500;
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
          transition: all 0.15s;
          background: var(--primary);
          color: white;
        }

        .btn:hover:not(:disabled) {
          background: var(--primary-hover);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn.secondary {
          background: var(--bg-inset);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }

        .btn.secondary:hover:not(:disabled) {
          background: var(--bg-hover);
        }

        /* Folder Picker */
        .folder-picker-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: var(--space-4);
        }

        .folder-picker {
          background: var(--bg-surface);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          width: 100%;
          max-width: min(400px, calc(100vw - 32px));
          box-shadow: var(--shadow-lg);
        }

        .folder-picker h3 {
          font-size: var(--font-lg);
          font-weight: 600;
          margin-bottom: var(--space-4);
        }

        .picker-field {
          margin-bottom: var(--space-4);
        }

        .picker-field label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 500;
          margin-bottom: var(--space-2);
          color: var(--text-secondary);
        }

        .picker-field select {
          width: 100%;
          padding: var(--space-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          background: var(--bg-base);
        }

        .picker-actions {
          display: flex;
          gap: var(--space-2);
          justify-content: flex-end;
        }

        @media (max-width: 600px) {
          .tools-content {
            padding: var(--space-3);
            min-height: 400px;
          }

          .tool-header-icon {
            font-size: 28px;
          }

          .tool-header {
            gap: var(--space-3);
            margin-bottom: var(--space-3);
            padding-bottom: var(--space-3);
          }

          .math-workflow-actions {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
