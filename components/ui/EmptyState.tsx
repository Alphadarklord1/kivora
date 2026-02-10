'use client';

import React from 'react';
import { useSettings } from '@/providers/SettingsProvider';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  size?: 'sm' | 'md' | 'lg';
}

// Built-in icons for common states
const ICONS = {
  folder: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  file: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  search: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  quiz: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  ),
  library: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  ),
  error: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  upload: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  notes: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
};

export type EmptyStateIconType = keyof typeof ICONS;

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
}: EmptyStateProps) {
  const sizeConfig = {
    sm: { iconSize: 40, titleSize: '15px', descSize: '13px', padding: '24px' },
    md: { iconSize: 56, titleSize: '17px', descSize: '14px', padding: '40px' },
    lg: { iconSize: 72, titleSize: '20px', descSize: '15px', padding: '60px' },
  };

  const config = sizeConfig[size];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: config.padding,
        minHeight: size === 'lg' ? '400px' : size === 'md' ? '300px' : '200px',
      }}
    >
      {/* Icon */}
      {icon && (
        <div
          style={{
            width: `${config.iconSize + 24}px`,
            height: `${config.iconSize + 24}px`,
            borderRadius: '50%',
            backgroundColor: 'var(--bg-secondary, #f3f4f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            color: 'var(--text-tertiary, #9ca3af)',
          }}
        >
          {typeof icon === 'string' && icon in ICONS ? ICONS[icon as EmptyStateIconType] : icon}
        </div>
      )}

      {/* Title */}
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: config.titleSize,
          fontWeight: 600,
          color: 'var(--text-primary, #1f2937)',
        }}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p
          style={{
            margin: '0 0 20px',
            fontSize: config.descSize,
            color: 'var(--text-secondary, #6b7280)',
            maxWidth: '360px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {/* Actions */}
      {(action || secondaryAction) && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {action && (
            <button
              onClick={action.onClick}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'white',
                backgroundColor: 'var(--accent-color, #3b82f6)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary, #374151)',
                backgroundColor: 'var(--bg-secondary, #f3f4f6)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #e5e7eb)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary, #f3f4f6)')}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-configured empty states for common scenarios
export function NoFoldersState({ onCreateFolder }: { onCreateFolder: () => void }) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  return (
    <EmptyState
      icon="folder"
      title={isArabic ? 'لا توجد مجلدات بعد' : 'No folders yet'}
      description={isArabic ? 'أنشئ مجلدًا لتنظيم موادك وملفاتك الدراسية.' : 'Create a folder to organize your study materials and files.'}
      action={{ label: isArabic ? 'إنشاء مجلد' : 'Create Folder', onClick: onCreateFolder }}
    />
  );
}

export function NoFilesState({ onUploadFile }: { onUploadFile: () => void }) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  return (
    <EmptyState
      icon="file"
      title={isArabic ? 'لا توجد ملفات في هذا المجلد' : 'No files in this folder'}
      description={isArabic ? 'ارفع ملفات PDF أو مستندات، أو ألصق نصًا لبدء توليد مواد دراسية.' : 'Upload PDFs, documents, or paste text to start generating study materials.'}
      action={{ label: isArabic ? 'رفع ملف' : 'Upload File', onClick: onUploadFile }}
    />
  );
}

export function NoSearchResultsState({ query, onClear }: { query: string; onClear: () => void }) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  return (
    <EmptyState
      icon="search"
      title={isArabic ? 'لا توجد نتائج' : 'No results found'}
      description={
        isArabic
          ? `لم نعثر على نتائج مطابقة لـ "${query}". جرّب كلمات بحث مختلفة.`
          : `We couldn't find anything matching "${query}". Try a different search term.`
      }
      action={{ label: isArabic ? 'مسح البحث' : 'Clear Search', onClick: onClear }}
    />
  );
}

export function NoLibraryItemsState({ onGoToTools }: { onGoToTools: () => void }) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  return (
    <EmptyState
      icon="library"
      title={isArabic ? 'مكتبتك فارغة' : 'Your library is empty'}
      description={
        isArabic
          ? 'احفظ المحتوى المُنشأ مثل الأسئلة والملخصات والملاحظات للوصول السريع.'
          : 'Save generated content like MCQs, summaries, and notes to your library for easy access.'
      }
      action={{ label: isArabic ? 'الانتقال إلى الأدوات' : 'Go to Tools', onClick: onGoToTools }}
    />
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  return (
    <EmptyState
      icon="error"
      title={isArabic ? 'حدث خطأ ما' : 'Something went wrong'}
      description={message || (isArabic ? 'واجهنا خطأ. يرجى المحاولة مرة أخرى.' : 'We encountered an error. Please try again.')}
      action={onRetry ? { label: isArabic ? 'حاول مرة أخرى' : 'Try Again', onClick: onRetry } : undefined}
    />
  );
}
