'use client';

import { useState } from 'react';
import { getGeneratedContent, ToolMode, GeneratedContent } from '@/lib/offline/generate';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { MathSolver } from '@/components/tools/MathSolver';
import { useToastHelpers } from '@/components/ui/Toast';

type ToolTab = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes' | 'math';

const toolTabs: { id: ToolTab; label: string; icon: string; description: string }[] = [
  { id: 'assignment', label: 'Assignment', icon: '📝', description: 'Generate assignment questions and prompts' },
  { id: 'summarize', label: 'Summarize', icon: '📄', description: 'Create concise summaries of your content' },
  { id: 'mcq', label: 'MCQ', icon: '✅', description: 'Generate multiple choice questions' },
  { id: 'quiz', label: 'Quiz', icon: '🧠', description: 'Create comprehensive quizzes' },
  { id: 'pop', label: 'Pop Quiz', icon: '⚡', description: 'Quick pop quiz for rapid review' },
  { id: 'notes', label: 'Notes', icon: '📝', description: 'Generate Cornell-style study notes' },
  { id: 'math', label: 'Math', icon: '🧮', description: 'Solve mathematical problems step-by-step' },
];

export default function ToolsPage() {
  const toast = useToastHelpers();
  const [toolTab, setToolTab] = useState<ToolTab>('assignment');
  const [inputText, setInputText] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [showInteractiveQuiz, setShowInteractiveQuiz] = useState(false);
  const [viewMode, setViewMode] = useState<'input' | 'output' | 'practice'>('input');

  const handleGenerate = () => {
    if (!inputText.trim()) {
      toast.warning('No content', 'Please enter text to process');
      return;
    }

    if (inputText.trim().length < 50) {
      toast.warning('Content too short', 'Please enter at least 50 characters for better results');
      return;
    }

    setGenerating(true);
    try {
      const content = getGeneratedContent(toolTab as ToolMode, inputText);
      setGeneratedContent(content);
      setOutput(content.displayText);
      setViewMode('output');
      toast.success('Generated successfully');
    } catch (error) {
      toast.error('Generation failed', 'An error occurred while generating content');
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
    toast.success('Copied to clipboard');
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
        toast.success('Saved to library');
      } else {
        toast.error('Failed to save', 'Could not save to library');
      }
    } catch {
      toast.error('Failed to save', 'Please try again');
    }
  };

  const currentTool = toolTabs.find(t => t.id === toolTab);

  return (
    <div className="tools-page">
      <div className="page-header">
        <h1>Study Tools</h1>
        <p>Generate study materials from any content</p>
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
                  <span className="tool-name">{tool.label}</span>
                  <span className="tool-desc">{tool.description}</span>
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
              <h2>{currentTool?.label}</h2>
              <p>{currentTool?.description}</p>
            </div>
          </div>

          {/* Math Solver */}
          {toolTab === 'math' ? (
            <MathSolver />
          ) : (
            <div className="tool-workspace">
              {/* Input Mode */}
              {viewMode === 'input' && (
                <div className="input-section">
                  <label htmlFor="content-input">Paste your study material</label>
                  <textarea
                    id="content-input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your study material here... (lectures, textbook excerpts, articles, etc.)"
                    rows={12}
                  />
                  {inputText && (
                    <div className="input-stats">
                      <span>{inputText.split(/\s+/).filter(Boolean).length} words</span>
                      <span>{inputText.length} characters</span>
                    </div>
                  )}

                  <button
                    className="btn generate-btn"
                    onClick={handleGenerate}
                    disabled={generating || !inputText.trim()}
                  >
                    {generating ? (
                      <>
                        <span className="spinner" /> Generating...
                      </>
                    ) : (
                      <>Generate {currentTool?.label}</>
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
                        🎯 Practice Mode
                      </button>
                    )}
                    <button className="btn secondary" onClick={() => setViewMode('input')}>
                      ✏️ Edit Input
                    </button>
                    <button className="btn secondary" onClick={handleToolReset}>
                      ↺ Start New
                    </button>
                  </div>

                  <div className="output-display">
                    <pre>{output}</pre>
                  </div>

                  <div className="output-actions-bottom">
                    <button className="btn secondary" onClick={handleCopy}>
                      📋 Copy
                    </button>
                    <button className="btn secondary" onClick={handleSaveToLibrary}>
                      📚 Save to Library
                    </button>
                  </div>
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
            order: 2;
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

        @media (max-width: 600px) {
          .tool-nav {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: var(--space-2);
          }

          .tool-nav-item {
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: var(--space-2);
          }

          .tool-desc {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
