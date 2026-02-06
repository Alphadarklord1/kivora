'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useFoldersStore } from '@/lib/store/folders';
import { getBlob } from '@/lib/idb';
import { renderAllPDFPages, cropImageRegion, PDFPageRender, extractImagesFromPDF, ExtractedImage } from '@/lib/pdf/image-extract';
import { MathRenderer, MathText } from '@/components/math/MathRenderer';

type AnalysisMode = 'describe' | 'explain' | 'extract-text' | 'solve-math';

interface AnalysisResult {
  mode: AnalysisMode;
  content: string;
  timestamp: Date;
}

interface SelectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function VisualAnalyzer() {
  // File selection state
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<string>('');

  // PDF rendering state
  const [pages, setPages] = useState<PDFPageRender[]>([]);
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<SelectionRegion | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  // Analysis state
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('describe');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);

  // Refs
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Store data
  const { folders, topics, files } = useFoldersStore();

  // Get filtered topics and files
  const folderTopics = topics.filter((t) => t.folderId === selectedFolderId);
  const topicFiles = files.filter(
    (f) => f.topicId === selectedTopicId && (f.name.endsWith('.pdf'))
  );

  // Load PDF when file is selected
  useEffect(() => {
    if (!selectedFileId) {
      setPages([]);
      setExtractedImages([]);
      return;
    }

    const loadPDF = async () => {
      setLoading(true);
      setError('');
      setPages([]);
      setExtractedImages([]);
      setSelection(null);
      setSelectedImageUrl(null);

      try {
        const file = files.find((f) => f.id === selectedFileId);
        if (!file?.localBlobId) {
          throw new Error('File not found in local storage');
        }

        const blob = await getBlob(file.localBlobId);
        if (!blob) {
          throw new Error('Could not load file from local storage');
        }

        // Render PDF pages
        const renderedPages = await renderAllPDFPages(blob, 1.5, 20);
        setPages(renderedPages);
        setCurrentPage(1);

        // Also extract embedded images
        const images = await extractImagesFromPDF(blob, 20);
        setExtractedImages(images);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [selectedFileId, files]);

  // Handle mouse selection on image
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setIsSelecting(true);
    setSelectionStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setSelection(null);
    setSelectedImageUrl(null);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSelecting || !selectionStart) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      setSelection({
        x: Math.min(selectionStart.x, currentX),
        y: Math.min(selectionStart.y, currentY),
        width: Math.abs(currentX - selectionStart.x),
        height: Math.abs(currentY - selectionStart.y),
      });
    },
    [isSelecting, selectionStart]
  );

  const handleMouseUp = useCallback(async () => {
    setIsSelecting(false);

    if (selection && selection.width > 20 && selection.height > 20) {
      // Crop the selected region
      const currentPageData = pages[currentPage - 1];
      if (currentPageData) {
        try {
          // Scale selection to actual image coordinates
          const container = imageContainerRef.current;
          if (!container) return;

          const displayedImg = container.querySelector('img');
          if (!displayedImg) return;

          const scaleX = currentPageData.width / displayedImg.clientWidth;
          const scaleY = currentPageData.height / displayedImg.clientHeight;

          const scaledRegion = {
            x: selection.x * scaleX,
            y: selection.y * scaleY,
            width: selection.width * scaleX,
            height: selection.height * scaleY,
          };

          const croppedUrl = await cropImageRegion(
            currentPageData.imageDataUrl,
            scaledRegion
          );
          setSelectedImageUrl(croppedUrl);
        } catch (err) {
          console.error('Failed to crop region:', err);
        }
      }
    }
  }, [selection, pages, currentPage]);

  // Select an extracted image
  const selectExtractedImage = (image: ExtractedImage) => {
    setSelectedImageUrl(image.dataUrl);
    setSelection(null);
  };

  // Analyze the selected image
  const analyzeImage = async () => {
    if (!selectedImageUrl) return;

    setAnalyzing(true);
    setError('');

    try {
      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: selectedImageUrl,
          mode: analysisMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const data = await res.json();
      setResults((prev) => [
        {
          mode: analysisMode,
          content: data.result,
          timestamp: new Date(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelection(null);
    setSelectedImageUrl(null);
  };

  const modeLabels: Record<AnalysisMode, { label: string; icon: string; description: string }> = {
    describe: {
      label: 'Describe',
      icon: '🖼️',
      description: 'Get a detailed description of the image content',
    },
    explain: {
      label: 'Explain',
      icon: '💡',
      description: 'Explain the concept shown in the diagram/chart',
    },
    'extract-text': {
      label: 'Extract Text',
      icon: '📝',
      description: 'Extract any text visible in the image (OCR)',
    },
    'solve-math': {
      label: 'Solve Math',
      icon: '🧮',
      description: 'Solve equations or math problems in the image',
    },
  };

  return (
    <div className="visual-analyzer">
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span>Visual Analyzer</span>
          <span style={{
            fontSize: 'var(--font-tiny)',
            background: 'var(--primary-muted)',
            color: 'var(--primary)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
          }}>
            AI Vision
          </span>
        </h3>
        <p style={{ fontSize: 'var(--font-meta)', color: 'var(--text-muted)', margin: 0 }}>
          Analyze diagrams, charts, equations, and images from your PDFs
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--error-muted)',
          color: 'var(--error)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)',
          fontSize: 'var(--font-meta)',
        }}>
          {error}
        </div>
      )}

      {/* File Selection */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-4)',
      }}>
        <div>
          <label style={{
            fontSize: 'var(--font-tiny)',
            color: 'var(--text-muted)',
            display: 'block',
            marginBottom: 'var(--space-1)',
          }}>
            Folder
          </label>
          <select
            value={selectedFolderId}
            onChange={(e) => {
              setSelectedFolderId(e.target.value);
              setSelectedTopicId('');
              setSelectedFileId('');
            }}
            style={{ width: '100%' }}
          >
            <option value="">Select folder...</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{
            fontSize: 'var(--font-tiny)',
            color: 'var(--text-muted)',
            display: 'block',
            marginBottom: 'var(--space-1)',
          }}>
            Topic
          </label>
          <select
            value={selectedTopicId}
            onChange={(e) => {
              setSelectedTopicId(e.target.value);
              setSelectedFileId('');
            }}
            disabled={!selectedFolderId}
            style={{ width: '100%' }}
          >
            <option value="">Select topic...</option>
            {folderTopics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{
            fontSize: 'var(--font-tiny)',
            color: 'var(--text-muted)',
            display: 'block',
            marginBottom: 'var(--space-1)',
          }}>
            PDF File
          </label>
          <select
            value={selectedFileId}
            onChange={(e) => setSelectedFileId(e.target.value)}
            disabled={!selectedTopicId}
            style={{ width: '100%' }}
          >
            <option value="">Select PDF...</option>
            {topicFiles.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          padding: 'var(--space-8)',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}>
          <div style={{ marginBottom: 'var(--space-2)' }}>Loading PDF...</div>
          <div style={{
            width: '200px',
            height: '4px',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--radius-full)',
            margin: '0 auto',
            overflow: 'hidden',
          }}>
            <div style={{
              width: '40%',
              height: '100%',
              background: 'var(--primary)',
              animation: 'loading 1s infinite',
            }} />
          </div>
        </div>
      )}

      {/* PDF Viewer */}
      {pages.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
          {/* Main viewer */}
          <div>
            {/* Page controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <button
                  className="btn ghost"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ padding: 'var(--space-1) var(--space-2)' }}
                >
                  ←
                </button>
                <span style={{ fontSize: 'var(--font-meta)' }}>
                  Page {currentPage} of {pages.length}
                </span>
                <button
                  className="btn ghost"
                  onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
                  disabled={currentPage === pages.length}
                  style={{ padding: 'var(--space-1) var(--space-2)' }}
                >
                  →
                </button>
              </div>

              <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)' }}>
                Click and drag to select a region
              </div>
            </div>

            {/* Image container with selection */}
            <div
              ref={imageContainerRef}
              style={{
                position: 'relative',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                cursor: 'crosshair',
                userSelect: 'none',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => isSelecting && handleMouseUp()}
            >
              <img
                src={pages[currentPage - 1]?.imageDataUrl}
                alt={`Page ${currentPage}`}
                style={{
                  width: '100%',
                  display: 'block',
                }}
                draggable={false}
              />

              {/* Selection overlay */}
              {selection && (
                <div
                  style={{
                    position: 'absolute',
                    left: selection.x,
                    top: selection.y,
                    width: selection.width,
                    height: selection.height,
                    border: '2px dashed var(--primary)',
                    background: 'rgba(var(--primary-rgb), 0.1)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>

            {/* Extracted images */}
            {extractedImages.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <h4 style={{ fontSize: 'var(--font-meta)', marginBottom: 'var(--space-2)' }}>
                  Extracted Images ({extractedImages.length})
                </h4>
                <div style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  overflowX: 'auto',
                  padding: 'var(--space-2) 0',
                }}>
                  {extractedImages.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => selectExtractedImage(img)}
                      style={{
                        padding: 'var(--space-1)',
                        border: selectedImageUrl === img.dataUrl
                          ? '2px solid var(--primary)'
                          : '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-surface)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={img.dataUrl}
                        alt={`Image from page ${img.pageNumber}`}
                        style={{
                          width: '80px',
                          height: '60px',
                          objectFit: 'contain',
                        }}
                      />
                      <div style={{
                        fontSize: 'var(--font-tiny)',
                        color: 'var(--text-muted)',
                        marginTop: 'var(--space-1)',
                      }}>
                        Page {img.pageNumber}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Analysis panel */}
          <div>
            {/* Selected image preview */}
            {selectedImageUrl && (
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--space-2)',
                }}>
                  <h4 style={{ fontSize: 'var(--font-meta)', margin: 0 }}>Selected Region</h4>
                  <button
                    className="btn ghost"
                    onClick={clearSelection}
                    style={{ fontSize: 'var(--font-tiny)', padding: 'var(--space-1)' }}
                  >
                    Clear
                  </button>
                </div>
                <div style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: 'var(--bg-inset)',
                }}>
                  <img
                    src={selectedImageUrl}
                    alt="Selected region"
                    style={{
                      width: '100%',
                      maxHeight: '200px',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Analysis mode selector */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h4 style={{ fontSize: 'var(--font-meta)', marginBottom: 'var(--space-2)' }}>
                Analysis Mode
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-2)',
              }}>
                {(Object.keys(modeLabels) as AnalysisMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAnalysisMode(mode)}
                    className={`btn ${analysisMode === mode ? '' : 'ghost'}`}
                    style={{
                      padding: 'var(--space-2)',
                      fontSize: 'var(--font-tiny)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-1)',
                    }}
                  >
                    <span style={{ fontSize: '1.2em' }}>{modeLabels[mode].icon}</span>
                    <span>{modeLabels[mode].label}</span>
                  </button>
                ))}
              </div>
              <p style={{
                fontSize: 'var(--font-tiny)',
                color: 'var(--text-muted)',
                marginTop: 'var(--space-2)',
              }}>
                {modeLabels[analysisMode].description}
              </p>
            </div>

            {/* Analyze button */}
            <button
              className="btn"
              onClick={analyzeImage}
              disabled={!selectedImageUrl || analyzing}
              style={{
                width: '100%',
                marginBottom: 'var(--space-4)',
              }}
            >
              {analyzing ? 'Analyzing...' : `Analyze Image`}
            </button>

            {/* Results */}
            {results.length > 0 && (
              <div>
                <h4 style={{ fontSize: 'var(--font-meta)', marginBottom: 'var(--space-2)' }}>
                  Analysis Results
                </h4>
                <div style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}>
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 'var(--space-3)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        marginBottom: 'var(--space-2)',
                      }}>
                        <span style={{
                          padding: '2px 6px',
                          background: 'var(--primary-muted)',
                          color: 'var(--primary)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 'var(--font-tiny)',
                        }}>
                          {modeLabels[result.mode].icon} {modeLabels[result.mode].label}
                        </span>
                        <span style={{
                          fontSize: 'var(--font-tiny)',
                          color: 'var(--text-muted)',
                        }}>
                          {result.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 'var(--font-meta)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {result.mode === 'solve-math' ? (
                          <MathText>{result.content}</MathText>
                        ) : (
                          result.content
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && pages.length === 0 && (
        <div style={{
          padding: 'var(--space-8)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-inset)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: '3em', marginBottom: 'var(--space-2)' }}>🔍</div>
          <h4 style={{ marginBottom: 'var(--space-2)' }}>Select a PDF to analyze</h4>
          <p style={{ fontSize: 'var(--font-meta)', maxWidth: '300px', margin: '0 auto' }}>
            Choose a folder, topic, and PDF file to view and analyze diagrams, charts, and equations.
          </p>
        </div>
      )}

      <style jsx>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
