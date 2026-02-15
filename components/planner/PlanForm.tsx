'use client';

import { useState } from 'react';
import { StudyTopic } from '@/lib/planner/generate';
import { useFoldersStore } from '@/lib/store/folders';
import { useI18n } from '@/lib/i18n/useI18n';

interface PlanFormProps {
  onGenerate: (data: {
    title: string;
    examDate: string;
    dailyMinutes: number;
    topics: StudyTopic[];
    folderId: string | null;
  }) => void;
  onCancel?: () => void;
}

export function PlanForm({ onGenerate, onCancel }: PlanFormProps) {
  const { t } = useI18n({
    'Enter a plan title': 'أدخل عنوان الخطة',
    'Pick an exam date': 'اختر تاريخ الاختبار',
    'Exam date must be in the future': 'يجب أن يكون تاريخ الاختبار في المستقبل',
    'Add at least one topic': 'أضف موضوعًا واحدًا على الأقل',
    'Create Study Plan': 'إنشاء خطة دراسة',
    'Plan Title': 'عنوان الخطة',
    'e.g., Final Exam - Biology 101': 'مثال: الاختبار النهائي - أحياء 101',
    'Exam Date': 'تاريخ الاختبار',
    'Daily Study ({minutes} min)': 'الدراسة اليومية ({minutes} دقيقة)',
    'Link Study Materials (optional)': 'ربط مواد الدراسة (اختياري)',
    'No folder linked': 'لا يوجد مجلد مرتبط',
    'Files from this folder will appear in your schedule view': 'ستظهر ملفات هذا المجلد في عرض الجدول',
    Topics: 'الموضوعات',
    'Topic {index}': 'موضوع {index}',
    'Remove topic': 'حذف الموضوع',
    Difficulty: 'الصعوبة',
    'Est. hours': 'الساعات المقدّرة',
    'Add Topic': 'إضافة موضوع',
    'Generate Schedule': 'توليد الجدول',
  });
  const { folders } = useFoldersStore();
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [folderId, setFolderId] = useState<string>('');
  const [topics, setTopics] = useState<StudyTopic[]>([
    { name: '', difficulty: 3, estimatedHours: 2 },
  ]);
  const [error, setError] = useState('');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const addTopic = () => {
    setTopics(prev => [...prev, { name: '', difficulty: 3, estimatedHours: 2 }]);
  };

  const removeTopic = (idx: number) => {
    if (topics.length <= 1) return;
    setTopics(prev => prev.filter((_, i) => i !== idx));
  };

  const updateTopic = (idx: number, field: keyof StudyTopic, value: string | number) => {
    setTopics(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  };

  const handleSubmit = () => {
    setError('');

    if (!title.trim()) { setError(t('Enter a plan title')); return; }
    if (!examDate) { setError(t('Pick an exam date')); return; }
    if (new Date(examDate) <= new Date()) { setError(t('Exam date must be in the future')); return; }

    const validTopics = topics.filter(t => t.name.trim());
    if (validTopics.length === 0) { setError(t('Add at least one topic')); return; }

    onGenerate({
      title: title.trim(),
      examDate,
      dailyMinutes,
      topics: validTopics,
      folderId: folderId || null,
    });
  };

  return (
    <div className="plan-form">
      <div className="form-header">
        <h2>{t('Create Study Plan')}</h2>
        {onCancel && (
          <button className="cancel-btn" onClick={onCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label>{t('Plan Title')}</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('e.g., Final Exam - Biology 101')}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t('Exam Date')}</label>
          <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} min={minDate} />
        </div>
        <div className="form-group">
          <label>{t('Daily Study ({minutes} min)', { minutes: dailyMinutes })}</label>
          <input
            type="range"
            min={30}
            max={180}
            step={15}
            value={dailyMinutes}
            onChange={e => setDailyMinutes(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>30m</span><span>1h</span><span>1.5h</span><span>2h</span><span>2.5h</span><span>3h</span>
          </div>
        </div>
      </div>

      {folders.length > 0 && (
        <div className="form-group">
          <label>{t('Link Study Materials (optional)')}</label>
          <select value={folderId} onChange={e => setFolderId(e.target.value)}>
            <option value="">{t('No folder linked')}</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {folderId && (
            <span className="folder-hint">{t('Files from this folder will appear in your schedule view')}</span>
          )}
        </div>
      )}

      <div className="form-group">
        <label>{t('Topics')}</label>
        <div className="topics-list">
          {topics.map((topic, idx) => (
            <div key={idx} className="topic-card">
              <div className="topic-main">
                <input
                  type="text"
                  value={topic.name}
                  onChange={e => updateTopic(idx, 'name', e.target.value)}
                  placeholder={t('Topic {index}', { index: idx + 1 })}
                  className="topic-name"
                />
                {topics.length > 1 && (
                  <button className="remove-btn" onClick={() => removeTopic(idx)} title={t('Remove topic')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
              </div>
              <div className="topic-meta">
                <div className="meta-item">
                  <span className="meta-label">{t('Difficulty')}</span>
                  <div className="star-rating">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        key={s}
                        className={`star-btn ${s <= topic.difficulty ? 'filled' : ''}`}
                        onClick={() => updateTopic(idx, 'difficulty', s as 1|2|3|4|5)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={s <= topic.difficulty ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="meta-item">
                  <span className="meta-label">{t('Est. hours')}</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={topic.estimatedHours}
                    onChange={e => updateTopic(idx, 'estimatedHours', Math.max(1, Number(e.target.value)))}
                    className="hours-input"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="add-topic-btn" onClick={addTopic}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {t('Add Topic')}
        </button>
      </div>

      <button className="generate-btn" onClick={handleSubmit}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        {t('Generate Schedule')}
      </button>

      <style jsx>{`
        .plan-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .form-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .form-header h2 {
          font-size: var(--font-lg);
          font-weight: 600;
          margin: 0;
        }
        .cancel-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          background: transparent;
          cursor: pointer;
          color: var(--text-muted);
        }
        .cancel-btn:hover { color: var(--error); }
        .form-error {
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          background: var(--error-muted, #fff0f0);
          color: var(--error);
          font-size: var(--font-meta);
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .form-group label {
          font-size: var(--font-meta);
          font-weight: 500;
          color: var(--text-secondary);
        }
        .form-group input[type="text"],
        .form-group input[type="date"],
        .form-group select {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          background: var(--bg-base);
        }
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-muted);
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }
        @media (max-width: 600px) {
          .form-row { grid-template-columns: 1fr; }
        }
        .form-group input[type="range"] {
          width: 100%;
          accent-color: var(--primary);
        }
        .range-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-muted);
        }
        .folder-hint {
          font-size: var(--font-tiny);
          color: var(--primary);
        }
        .topics-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .topic-card {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .topic-main {
          display: flex;
          gap: var(--space-2);
        }
        .topic-name {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-size: var(--font-body);
          background: var(--bg-base);
        }
        .topic-name:focus {
          outline: none;
          border-color: var(--primary);
        }
        .remove-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--text-muted);
          border-radius: var(--radius-sm);
        }
        .remove-btn:hover { color: var(--error); background: var(--error-muted, #fff0f0); }
        .topic-meta {
          display: flex;
          gap: var(--space-4);
          align-items: center;
        }
        .meta-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }
        .meta-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }
        .star-rating {
          display: flex;
          gap: 2px;
        }
        .star-btn {
          display: flex;
          align-items: center;
          padding: 2px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--text-muted);
        }
        .star-btn.filled { color: var(--warning); }
        .hours-input {
          width: 60px;
          padding: var(--space-1) var(--space-2);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
          text-align: center;
          background: var(--bg-base);
        }
        .hours-input:focus {
          outline: none;
          border-color: var(--primary);
        }
        .add-topic-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border: 1px dashed var(--border-default);
          border-radius: var(--radius-md);
          background: transparent;
          cursor: pointer;
          font-size: var(--font-meta);
          color: var(--text-secondary);
          transition: var(--transition-fast);
        }
        .add-topic-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
        }
        .generate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          border: none;
          border-radius: var(--radius-md);
          background: var(--primary);
          color: white;
          font-size: var(--font-body);
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .generate-btn:hover { background: var(--primary-hover); }
      `}</style>
    </div>
  );
}
