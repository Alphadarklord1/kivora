'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFoldersStore } from '@/lib/store/folders';
import { getBlob } from '@/lib/idb';
import { fetchStoredFileBlob } from '@/lib/files/client-storage';
import { renderAllPDFPages, cropImageRegion, PDFPageRender, extractImagesFromPDF, ExtractedImage } from '@/lib/pdf/image-extract';
import { MathText } from '@/components/math/MathRenderer';
import { useI18n } from '@/lib/i18n/useI18n';

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
  const { t, locale } = useI18n({
    'Analysis failed': 'فشل التحليل',
    'Please select an image file (PNG, JPG, etc.)': 'يرجى اختيار ملف صورة (PNG أو JPG وغيرها)',
    'Image is too large. Maximum size is 4MB.': 'الصورة كبيرة جدًا. الحد الأقصى 4MB.',
    'Failed to read image file': 'تعذر قراءة ملف الصورة',
    'Describe': 'وصف',
    'Get a detailed description of the image content': 'احصل على وصف تفصيلي لمحتوى الصورة',
    'Explain': 'شرح',
    'Explain the concept shown in the diagram/chart': 'اشرح المفهوم الظاهر في الرسم/المخطط',
    'Extract Text': 'استخراج النص',
    'Extract any text visible in the image (OCR)': 'استخرج أي نص ظاهر في الصورة (OCR)',
    'Solve Math': 'حل الرياضيات',
    'Solve equations or math problems in the image': 'حل المعادلات أو المسائل الرياضية في الصورة',
    'Visual Analyzer': 'المحلل البصري',
    'Analyze diagrams, charts, equations, and images from your PDFs': 'حلل الرسومات والمخططات والمعادلات والصور من ملفات PDF.',
    'Folder': 'المجلد',
    'Select folder...': 'اختر مجلدًا...',
    'Topic': 'الموضوع',
    'Select topic...': 'اختر موضوعًا...',
    'File': 'الملف',
    'Select file...': 'اختر ملفًا...',
    'Loading PDF...': 'جارٍ تحميل PDF...',
    'Page {current} of {total}': 'صفحة {current} من {total}',
    'Click and drag to select a region': 'انقر واسحب لتحديد منطقة',
    'Extracted Images ({count})': 'الصور المستخرجة ({count})',
    'Page {page}': 'صفحة {page}',
    'Selected Region': 'المنطقة المحددة',
    'Clear': 'مسح',
    'Analysis Mode': 'وضع التحليل',
    'Analyzing...': 'جارٍ التحليل...',
    'Analyze Image': 'تحليل الصورة',
    'Analysis Results': 'نتائج التحليل',
    'Select a PDF or upload an image': 'اختر ملف PDF أو ارفع صورة',
    'Choose a PDF file above, or upload an image directly for analysis.': 'اختر ملف PDF من الأعلى، أو ارفع صورة مباشرة للتحليل.',
    'Upload Image': 'رفع صورة',
    'Uploaded Image': 'الصورة المرفوعة',
    'Change': 'تغيير',
    'Visual analysis currently supports PDFs and images only.': 'يدعم التحليل البصري حاليًا ملفات PDF والصور فقط.',
    'File not found locally': 'الملف غير موجود محليًا',
    'Could not load file from local storage': 'تعذر تحميل الملف من التخزين المحلي',
    'Failed to load file': 'تعذر تحميل الملف',
  });
  const searchParams = useSearchParams();
  // File selection state
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [tempFile, setTempFile] = useState<{
    id: string;
    name: string;
    type: string;
    folderId: string;
    topicId: string;
    localBlobId: string | null;
    createdAt: string;
  } | null>(null);

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

  useEffect(() => {
    const urlFileId = searchParams.get('fileId');
    const stored = localStorage.getItem('visual_file_id');
    const temp = localStorage.getItem('visual_temp_file');
    if (temp) {
      try {
        const parsed = JSON.parse(temp);
        if (parsed?.id && parsed?.localBlobId) {
          setTempFile(parsed);
          setSelectedFolderId(parsed.folderId || '');
          setSelectedTopicId(parsed.topicId || '');
          setSelectedFileId(parsed.id);
        }
      } catch {}
      localStorage.removeItem('visual_temp_file');
    }
    const fileId = urlFileId || stored;
    if (!fileId) return;

    const file = files.find(f => f.id === fileId);
    if (file) {
      setSelectedFolderId(file.folderId);
      setSelectedTopicId(file.topicId || '');
      setSelectedFileId(file.id);
      localStorage.removeItem('visual_file_id');
    }
  }, [searchParams, files]);

  const allFiles = useMemo(
    () => (tempFile && !files.some(f => f.id === tempFile.id) ? [tempFile, ...files] : files),
    [tempFile, files]
  );

  // Get filtered topics and files
  const folderTopics = topics.filter((t) => t.folderId === selectedFolderId);
  const topicFiles = allFiles.filter(
    (f) => f.topicId === selectedTopicId && (
      f.name.endsWith('.pdf') || f.name.endsWith('.png') || f.name.endsWith('.jpg') ||
      f.name.endsWith('.jpeg') || f.name.endsWith('.gif') || f.name.endsWith('.webp')
    )
  );

  // Load PDF when file is selected
  useEffect(() => {
    if (!selectedFileId) {
      setPages([]);
      setExtractedImages([]);
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      setError('');
      setPages([]);
      setExtractedImages([]);
      setSelection(null);
      setSelectedImageUrl(null);

      try {
        const file = allFiles.find((f) => f.id === selectedFileId);
        if (!file?.localBlobId) {
          throw new Error(t('File not found locally'));
        }

        let blob = await getBlob(file.localBlobId);
        if (!blob) {
          blob = await fetchStoredFileBlob(file.id);
        }
        if (!blob) {
          throw new Error(t('Could not load file from local storage'));
        }

        const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);

        if (isImage) {
          // For image files, read as data URL and set directly
          const reader = new FileReader();
          reader.onload = () => {
            setSelectedImageUrl(reader.result as string);
            setLoading(false);
          };
          reader.onerror = () => {
            setError('Failed to read image file');
            setLoading(false);
          };
          reader.readAsDataURL(blob);
          return;
        }

        // Render PDF pages
        const renderedPages = await renderAllPDFPages(blob, 1.5, 20);
        setPages(renderedPages);
        setCurrentPage(1);

        // Also extract embedded images
        const images = await extractImagesFromPDF(blob, 20);
        setExtractedImages(images);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('Failed to load file'));
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [selectedFileId, allFiles]);

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
        throw new Error(data.error || t('Analysis failed'));
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
      setError(err instanceof Error ? err.message : t('Analysis failed'));
    } finally {
      setAnalyzing(false);
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelection(null);
    setSelectedImageUrl(null);
  };

  // Direct image upload handler
  const handleDirectImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(t('Please select an image file (PNG, JPG, etc.)'));
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError(t('Image is too large. Maximum size is 4MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageUrl(reader.result as string);
      setSelection(null);
      setError('');
    };
    reader.onerror = () => setError(t('Failed to read image file'));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const modeLabels: Record<AnalysisMode, { label: string; icon: string; description: string }> = {
    describe: {
      label: t('Describe'),
      icon: '🖼️',
      description: t('Get a detailed description of the image content'),
    },
    explain: {
      label: t('Explain'),
      icon: '💡',
      description: t('Explain the concept shown in the diagram/chart'),
    },
    'extract-text': {
      label: t('Extract Text'),
      icon: '📝',
      description: t('Extract any text visible in the image (OCR)'),
    },
    'solve-math': {
      label: t('Solve Math'),
      icon: '🧮',
      description: t('Solve equations or math problems in the image'),
    },
  };

  return (
    <div className="visual-analyzer">
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <h3 style={{ marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span>{t('Visual Analyzer')}</span>
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
          {t('Analyze diagrams, charts, equations, and images from your PDFs')}
        </p>
        <p style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)', margin: 'var(--space-2) 0 0' }}>
          {t('Visual analysis currently supports PDFs and images only.')}
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
            {t('Folder')}
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
            <option value="">{t('Select folder...')}</option>
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
            {t('Topic')}
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
            <option value="">{t('Select topic...')}</option>
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
            {t('File')}
          </label>
          <select
            value={selectedFileId}
            onChange={(e) => setSelectedFileId(e.target.value)}
            disabled={!selectedTopicId}
            style={{ width: '100%' }}
          >
            <option value="">{t('Select file...')}</option>
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
          <div style={{ marginBottom: 'var(--space-2)' }}>{t('Loading PDF...')}</div>
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
                  {t('Page {current} of {total}', { current: currentPage, total: pages.length })}
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
                {t('Click and drag to select a region')}
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
                  {t('Extracted Images ({count})', { count: extractedImages.length })}
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
                        {t('Page {page}', { page: img.pageNumber })}
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
                  <h4 style={{ fontSize: 'var(--font-meta)', margin: 0 }}>{t('Selected Region')}</h4>
                  <button
                    className="btn ghost"
                    onClick={clearSelection}
                    style={{ fontSize: 'var(--font-tiny)', padding: 'var(--space-1)' }}
                  >
                    {t('Clear')}
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
                {t('Analysis Mode')}
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
              {analyzing ? t('Analyzing...') : t('Analyze Image')}
            </button>

            {/* Results */}
            {results.length > 0 && (
              <div>
                <h4 style={{ fontSize: 'var(--font-meta)', marginBottom: 'var(--space-2)' }}>
                  {t('Analysis Results')}
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
                          {result.timestamp.toLocaleTimeString(locale)}
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
      {!loading && pages.length === 0 && !selectedImageUrl && (
        <div style={{
          padding: 'var(--space-8)',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-inset)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: '3em', marginBottom: 'var(--space-2)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <h4 style={{ marginBottom: 'var(--space-2)' }}>{t('Select a PDF or upload an image')}</h4>
          <p style={{ fontSize: 'var(--font-meta)', maxWidth: '300px', margin: '0 auto var(--space-4)' }}>
            {t('Choose a PDF file above, or upload an image directly for analysis.')}
          </p>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--primary)',
            color: 'white',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: 'var(--font-meta)',
            fontWeight: 500,
          }}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleDirectImageUpload}
              style={{ display: 'none' }}
            />
            {t('Upload Image')}
          </label>
        </div>
      )}

      {/* Standalone image analysis (when image uploaded without PDF) */}
      {!loading && pages.length === 0 && selectedImageUrl && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <h4 style={{ fontSize: 'var(--font-meta)', margin: 0 }}>{t('Uploaded Image')}</h4>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                  padding: 'var(--space-1) var(--space-2)', background: 'var(--bg-inset)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', fontSize: 'var(--font-tiny)',
                }}>
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleDirectImageUpload} style={{ display: 'none' }} />
                  {t('Change')}
                </label>
                <button className="btn ghost" onClick={clearSelection} style={{ fontSize: 'var(--font-tiny)', padding: 'var(--space-1)' }}>{t('Clear')}</button>
              </div>
            </div>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-inset)' }}>
              <img src={selectedImageUrl} alt="Uploaded" style={{ width: '100%', display: 'block' }} />
            </div>
          </div>

          <div>
            {/* Analysis mode selector */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h4 style={{ fontSize: 'var(--font-meta)', marginBottom: 'var(--space-2)' }}>{t('Analysis Mode')}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {(Object.keys(modeLabels) as AnalysisMode[]).map((mode) => (
                  <button key={mode} onClick={() => setAnalysisMode(mode)} className={`btn ${analysisMode === mode ? '' : 'ghost'}`}
                    style={{ padding: 'var(--space-2)', fontSize: 'var(--font-tiny)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span style={{ fontSize: '1.2em' }}>{modeLabels[mode].icon}</span>
                    <span>{modeLabels[mode].label}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>{modeLabels[analysisMode].description}</p>
            </div>

            <button className="btn" onClick={analyzeImage} disabled={analyzing} style={{ width: '100%', marginBottom: 'var(--space-4)' }}>
              {analyzing ? t('Analyzing...') : t('Analyze Image')}
            </button>

            {/* Results */}
            {results.length > 0 && (
              <div>
                <h4 style={{ fontSize: 'var(--font-meta)', marginBottom: 'var(--space-2)' }}>{t('Analysis Results')}</h4>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {results.map((result, idx) => (
                    <div key={idx} style={{ padding: 'var(--space-3)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                        <span style={{ padding: '2px 6px', background: 'var(--primary-muted)', color: 'var(--primary)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-tiny)' }}>
                          {modeLabels[result.mode].icon} {modeLabels[result.mode].label}
                        </span>
                        <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)' }}>{result.timestamp.toLocaleTimeString(locale)}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-meta)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {result.mode === 'solve-math' ? <MathText>{result.content}</MathText> : result.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
