'use client';

import { useState } from 'react';
import { GeneratedSchedule, formatScheduleDate, groupByWeek } from '@/lib/planner/generate';
import { downloadICSFile, generateGoogleCalendarURL, generateExamGoogleCalendarURL } from '@/lib/planner/calendar';
import { StudyPlan } from '@/hooks/useStudyPlans';
import { useFoldersStore } from '@/lib/store/folders';
import { useI18n } from '@/lib/i18n/useI18n';

interface PlanScheduleProps {
  plan: StudyPlan | null;
  generatedSchedule?: GeneratedSchedule | null;
  title: string;
  onToggleDay: (dayIndex: number) => void;
  onSaveNotes: (dayIndex: number, notes: string) => void;
  onStartTimer: (dayIndex: number) => void;
  onSave?: () => void;
  onDelete?: () => void;
  saving?: boolean;
}

export function PlanSchedule({
  plan, generatedSchedule, title, onToggleDay, onSaveNotes,
  onStartTimer, onSave, onDelete, saving,
}: PlanScheduleProps) {
  const { t, locale } = useI18n({
    '{days}d left': 'متبقي {days} يوم',
    'Exam day!': 'يوم الاختبار!',
    'days ({progress}%)': 'أيام ({progress}%)',
    'Study Hours': 'ساعات الدراسة',
    Topics: 'الموضوعات',
    'Revision Days': 'أيام المراجعة',
    'Study Materials': 'مواد الدراسة',
    'more': 'أخرى',
    "Today's Study": 'دراسة اليوم',
    'Start Timer': 'بدء المؤقت',
    'Show completed days': 'إظهار الأيام المكتملة',
    'Week {n}': 'الأسبوع {n}',
    TODAY: 'اليوم',
    REVISION: 'مراجعة',
    'Start timer': 'بدء المؤقت',
    '{count} sessions logged': 'تم تسجيل {count} جلسات',
    'Add a note for this day...': 'أضف ملاحظة لهذا اليوم...',
    Save: 'حفظ',
    Cancel: 'إلغاء',
    '+ Add note': '+ إضافة ملاحظة',
    Copy: 'نسخ',
    Export: 'تصدير',
    'Saving...': 'جارٍ الحفظ...',
    'Save Plan': 'حفظ الخطة',
    'Delete Plan': 'حذف الخطة',
    'Export Schedule': 'تصدير الجدول',
    'Study start time': 'وقت بدء الدراسة',
    'Download .ics File': 'تنزيل ملف .ics',
    'or add directly': 'أو الإضافة مباشرة',
    'Google Cal (Day 1)': 'Google Cal (Day 1)',
    'Google Cal (Exam)': 'Google Cal (Exam)',
    'Day {n}': 'اليوم {n}',
    '{count} topics': '{count} موضوعات',
  });
  const schedule = plan?.schedule || generatedSchedule;
  const isSaved = !!plan;

  const { files } = useFoldersStore();
  const linkedFiles = plan?.folderId ? files.filter(f => f.folderId === plan.folderId) : [];

  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => {
    const todayWeek = getTodayWeek(schedule);
    return new Set(todayWeek !== null ? [todayWeek] : [1]);
  });
  const [showCompleted, setShowCompleted] = useState(true);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [studyStartHour, setStudyStartHour] = useState(9);

  if (!schedule) return null;

  const weeks = groupByWeek(schedule.days);
  const todayIdx = getTodayDayIndex(schedule);
  const daysUntilExam = getDaysUntilExam(schedule.endDate);
  const completedDays = schedule.days.filter(d => d.completed).length;
  const progress = isSaved ? Math.round((completedDays / schedule.totalDays) * 100) : 0;

  const toggleWeek = (w: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(w)) { next.delete(w); } else { next.add(w); }
      return next;
    });
  };

  const handleSaveNote = (dayIndex: number) => {
    onSaveNotes(dayIndex, noteText);
    setEditingNote(null);
  };

  const handleCopy = () => {
    const text = schedule.days.map(d => {
      const topics = d.topics.map(t => `  ${t.name} (${t.duration}min - ${t.tasks.join(', ')})`).join('\n');
      return `${t('Day {n}', { n: d.dayNumber })} - ${formatScheduleDate(d.date, locale)}${d.isRevision ? ` [${t('REVISION')}]` : ''}\n${topics}`;
    }).join('\n\n');
    navigator.clipboard.writeText(`${title}\n${'='.repeat(title.length)}\n\n${text}`);
  };

  const handleExportICS = () => {
    downloadICSFile(schedule, title, studyStartHour);
  };

  const handleGoogleDay1 = () => {
    const day1 = schedule.days[0];
    const desc = day1 ? day1.topics.map(t => `${t.name} (${t.duration}min)`).join(', ') : '';
    const url = generateGoogleCalendarURL(
      `Study: ${title}`,
      desc,
      schedule.startDate,
      schedule.startDate,
      studyStartHour,
      day1?.totalMinutes || 60
    );
    window.open(url, '_blank');
  };

  const handleGoogleExam = () => {
    const url = generateExamGoogleCalendarURL(title, schedule.endDate);
    window.open(url, '_blank');
  };

  return (
    <div className="plan-schedule">
      {/* Header */}
      <div className="schedule-header">
        <div>
          <h2>{title}</h2>
          <span className="schedule-range">
            {formatScheduleDate(schedule.startDate, locale)} - {formatScheduleDate(schedule.endDate, locale)}
          </span>
        </div>
        <div className={`countdown ${daysUntilExam <= 7 ? 'urgent' : ''}`}>
          {daysUntilExam > 0 ? t('{days}d left', { days: daysUntilExam }) : t('Exam day!')}
        </div>
      </div>

      {/* Progress */}
      {isSaved && (
        <div className="progress-section">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <span className="progress-label">{completedDays}/{schedule.totalDays} {t('days ({progress}%)', { progress })}</span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{schedule.summary.totalStudyHours}h</span>
          <span className="stat-label">{t('Study Hours')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{schedule.summary.topicsCount}</span>
          <span className="stat-label">{t('Topics')}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{schedule.summary.revisionDays}</span>
          <span className="stat-label">{t('Revision Days')}</span>
        </div>
      </div>

      {/* Study Materials */}
      {linkedFiles.length > 0 && (
        <div className="materials-section">
          <h4>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {t('Study Materials')}
          </h4>
          <div className="materials-list">
            {linkedFiles.slice(0, 8).map(f => (
              <span key={f.id} className="material-chip">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {f.name}
              </span>
            ))}
            {linkedFiles.length > 8 && <span className="material-chip more">+{linkedFiles.length - 8} {t('more')}</span>}
          </div>
        </div>
      )}

      {/* Today's Highlight */}
      {todayIdx !== null && (
        <div className="today-highlight">
          <div className="today-header">
            <span className="today-label">{t("Today's Study")}</span>
            <button className="timer-btn primary" onClick={() => onStartTimer(todayIdx)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {t('Start Timer')}
            </button>
          </div>
          <div className="today-topics">
            {schedule.days[todayIdx].topics.map((t, i) => (
              <span key={i} className={`task-badge ${t.tasks[0]}`}>{t.name} ({t.duration}m)</span>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="view-controls">
        <label className="toggle-label">
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} />
          {t('Show completed days')}
        </label>
      </div>

      {/* Weeks */}
      <div className="weeks-container">
        {Array.from(weeks.entries()).map(([weekNum, weekDays]) => {
          const weekCompleted = weekDays.filter(d => d.completed).length;
          const visibleDays = showCompleted ? weekDays : weekDays.filter(d => !d.completed);
          if (visibleDays.length === 0) return null;
          const isExpanded = expandedWeeks.has(weekNum);

          return (
            <div key={weekNum} className="week-section">
              <button className="week-header" onClick={() => toggleWeek(weekNum)}>
                <span className="week-title">{t('Week {n}', { n: weekNum })}</span>
                <span className="week-progress">{weekCompleted}/{weekDays.length}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              {isExpanded && (
                <div className="week-days">
                  {visibleDays.map((day, _dayArrIdx) => {
                    const globalIdx = schedule.days.findIndex(d => d.dayNumber === day.dayNumber);
                    const isToday = globalIdx === todayIdx;

                    return (
                      <div key={day.dayNumber} className={`day-card ${day.completed ? 'completed' : ''} ${isToday ? 'today' : ''} ${day.isRevision ? 'revision' : ''}`}>
                        <div className="day-header">
                          <div className="day-left">
                            {isSaved && (
                              <input
                                type="checkbox"
                                checked={!!day.completed}
                                onChange={() => onToggleDay(globalIdx)}
                                className="day-check"
                              />
                            )}
                            <div>
                              <span className="day-num">{t('Day {n}', { n: day.dayNumber })}</span>
                              <span className="day-date">{formatScheduleDate(day.date, locale)}</span>
                            </div>
                            {isToday && <span className="today-tag">{t('TODAY')}</span>}
                            {day.isRevision && <span className="revision-tag">{t('REVISION')}</span>}
                          </div>
                          <button className="timer-btn small" onClick={() => onStartTimer(globalIdx)} title={t('Start timer')}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          </button>
                        </div>

                        <div className="day-topics">
                          {day.topics.map((t, ti) => (
                            <div key={ti} className="day-topic">
                              <span className="topic-name">{t.name}</span>
                              <div className="topic-badges">
                                {t.tasks.map((task, tki) => (
                                  <span key={tki} className={`task-badge ${task}`}>{task}</span>
                                ))}
                                <span className="duration-label">{t.duration}m</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Sessions */}
                        {day.sessions && day.sessions.length > 0 && (
                          <div className="day-sessions">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            {t('{count} sessions logged', { count: day.sessions.length })}
                          </div>
                        )}

                        {/* Notes */}
                        {isSaved && (
                          <div className="day-notes">
                            {editingNote === globalIdx ? (
                              <div className="note-editor">
                                <textarea
                                  value={noteText}
                                  onChange={e => setNoteText(e.target.value)}
                                  placeholder={t('Add a note for this day...')}
                                  rows={2}
                                />
                                <div className="note-actions">
                                  <button className="note-btn save" onClick={() => handleSaveNote(globalIdx)}>{t('Save')}</button>
                                  <button className="note-btn" onClick={() => setEditingNote(null)}>{t('Cancel')}</button>
                                </div>
                              </div>
                            ) : day.notes ? (
                              <div className="note-display" onClick={() => { setEditingNote(globalIdx); setNoteText(day.notes || ''); }}>
                                {day.notes}
                              </div>
                            ) : (
                              <button className="add-note-btn" onClick={() => { setEditingNote(globalIdx); setNoteText(''); }}>
                                {t('+ Add note')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="schedule-actions">
        <button className="action-btn" onClick={handleCopy}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          {t('Copy')}
        </button>
        <button className="action-btn" onClick={() => setShowExport(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {t('Export')}
        </button>
        {!isSaved && onSave && (
          <button className="action-btn primary" onClick={onSave} disabled={saving}>
            {saving ? t('Saving...') : t('Save Plan')}
          </button>
        )}
        {isSaved && onDelete && (
          <button className="action-btn danger" onClick={onDelete}>{t('Delete Plan')}</button>
        )}
      </div>

      {/* Export Modal */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('Export Schedule')}</h3>
              <button className="modal-close" onClick={() => setShowExport(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group-modal">
                <label>{t('Study start time')}</label>
                <select value={studyStartHour} onChange={e => setStudyStartHour(Number(e.target.value))}>
                  {Array.from({ length: 15 }, (_, i) => i + 6).map(h => (
                    <option key={h} value={h}>{h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}</option>
                  ))}
                </select>
              </div>
              <button className="export-btn" onClick={handleExportICS}>{t('Download .ics File')}</button>
              <div className="export-divider">{t('or add directly')}</div>
              <div className="export-quick">
                <button className="export-quick-btn" onClick={handleGoogleDay1}>{t('Google Cal (Day 1)')}</button>
                <button className="export-quick-btn" onClick={handleGoogleExam}>{t('Google Cal (Exam)')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .plan-schedule { display: flex; flex-direction: column; gap: var(--space-4); }
        .schedule-header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); flex-wrap: wrap; }
        .schedule-header h2 { font-size: var(--font-lg); font-weight: 600; margin: 0; }
        .schedule-range { font-size: var(--font-meta); color: var(--text-muted); }
        .countdown { padding: var(--space-1) var(--space-3); border-radius: var(--radius-full); background: var(--primary-muted); color: var(--primary); font-size: var(--font-meta); font-weight: 600; white-space: nowrap; }
        .countdown.urgent { background: var(--error-muted, #fff0f0); color: var(--error); }
        .progress-section { display: flex; align-items: center; gap: var(--space-3); }
        .progress-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--bg-inset); overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; background: var(--primary); transition: width 0.3s; }
        .progress-label { font-size: var(--font-tiny); color: var(--text-muted); white-space: nowrap; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
        .stat-card { text-align: center; padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
        .stat-value { display: block; font-size: var(--font-lg); font-weight: 700; color: var(--primary); }
        .stat-label { font-size: var(--font-tiny); color: var(--text-muted); }

        .materials-section { padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-inset); }
        .materials-section h4 { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-meta); font-weight: 600; margin: 0 0 var(--space-2) 0; }
        .materials-list { display: flex; flex-wrap: wrap; gap: var(--space-1); }
        .material-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--bg-surface); border: 1px solid var(--border-subtle); font-size: var(--font-tiny); color: var(--text-secondary); }
        .material-chip.more { color: var(--text-muted); font-style: italic; border: none; background: none; }

        .today-highlight { padding: var(--space-3); border-radius: var(--radius-md); background: var(--primary-muted); }
        .today-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
        .today-label { font-weight: 600; font-size: var(--font-meta); }
        .today-topics { display: flex; flex-wrap: wrap; gap: var(--space-1); }

        .timer-btn { display: inline-flex; align-items: center; gap: 4px; padding: var(--space-1) var(--space-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: var(--bg-surface); cursor: pointer; font-size: var(--font-tiny); color: var(--text-secondary); transition: var(--transition-fast); }
        .timer-btn:hover { border-color: var(--primary); color: var(--primary); }
        .timer-btn.primary { background: var(--primary); color: white; border-color: var(--primary); font-size: var(--font-meta); padding: var(--space-2) var(--space-3); }
        .timer-btn.primary:hover { background: var(--primary-hover); }
        .timer-btn.small { padding: 4px 6px; }

        .view-controls { display: flex; align-items: center; }
        .toggle-label { display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-meta); color: var(--text-secondary); cursor: pointer; }
        .toggle-label input { accent-color: var(--primary); }

        .weeks-container { display: flex; flex-direction: column; gap: var(--space-2); }
        .week-section { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; }
        .week-header { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-3); border: none; background: var(--bg-inset); cursor: pointer; font-size: var(--font-meta); font-weight: 600; color: var(--text-primary); }
        .week-header:hover { background: var(--bg-hover, var(--bg-inset)); }
        .week-title { flex: 1; text-align: left; }
        .week-progress { font-size: var(--font-tiny); color: var(--text-muted); font-weight: 400; }
        .week-days { display: flex; flex-direction: column; gap: 1px; background: var(--border-subtle); }

        .day-card { padding: var(--space-3); background: var(--bg-surface); display: flex; flex-direction: column; gap: var(--space-2); }
        .day-card.completed { background: color-mix(in srgb, var(--success) 5%, var(--bg-surface)); }
        .day-card.today { box-shadow: inset 3px 0 0 var(--primary); }
        .day-card.revision { background: color-mix(in srgb, var(--warning) 5%, var(--bg-surface)); }
        .day-header { display: flex; justify-content: space-between; align-items: center; }
        .day-left { display: flex; align-items: center; gap: var(--space-2); }
        .day-check { accent-color: var(--success); cursor: pointer; }
        .day-num { font-weight: 600; font-size: var(--font-meta); display: block; }
        .day-date { font-size: var(--font-tiny); color: var(--text-muted); }
        .today-tag { padding: 1px 6px; border-radius: var(--radius-sm); background: var(--primary); color: white; font-size: 10px; font-weight: 600; }
        .revision-tag { padding: 1px 6px; border-radius: var(--radius-sm); background: var(--warning); color: white; font-size: 10px; font-weight: 600; }

        .day-topics { display: flex; flex-direction: column; gap: var(--space-1); }
        .day-topic { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
        .topic-name { font-size: var(--font-meta); color: var(--text-primary); }
        .topic-badges { display: flex; align-items: center; gap: var(--space-1); }
        .task-badge { display: inline-block; padding: 1px 6px; border-radius: var(--radius-sm); font-size: 10px; font-weight: 500; }
        .task-badge.learn { background: var(--primary-muted); color: var(--primary); }
        .task-badge.practice { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
        .task-badge.review { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
        .duration-label { font-size: 10px; color: var(--text-muted); }

        .day-sessions { display: flex; align-items: center; gap: var(--space-1); font-size: var(--font-tiny); color: var(--success); padding-top: var(--space-1); border-top: 1px solid var(--border-subtle); }

        .day-notes { padding-top: var(--space-1); }
        .note-editor textarea { width: 100%; padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: var(--font-meta); font-family: inherit; resize: none; background: var(--bg-base); }
        .note-editor textarea:focus { outline: none; border-color: var(--primary); }
        .note-actions { display: flex; gap: var(--space-1); margin-top: var(--space-1); }
        .note-btn { padding: 2px 8px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: transparent; cursor: pointer; font-size: var(--font-tiny); }
        .note-btn.save { background: var(--primary); color: white; border-color: var(--primary); }
        .note-display { font-size: var(--font-meta); color: var(--text-secondary); cursor: pointer; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); background: var(--bg-inset); }
        .note-display:hover { background: var(--bg-hover, var(--bg-inset)); }
        .add-note-btn { border: none; background: transparent; cursor: pointer; font-size: var(--font-tiny); color: var(--text-muted); padding: 0; }
        .add-note-btn:hover { color: var(--primary); }

        .schedule-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .action-btn { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; font-size: var(--font-meta); color: var(--text-secondary); transition: var(--transition-fast); }
        .action-btn:hover { border-color: var(--border-default); background: var(--bg-inset); }
        .action-btn.primary { background: var(--primary); color: white; border-color: var(--primary); }
        .action-btn.primary:hover { background: var(--primary-hover); }
        .action-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .action-btn.danger { color: var(--error); }
        .action-btn.danger:hover { background: var(--error-muted, #fff0f0); border-color: var(--error); }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: var(--bg-surface); border-radius: var(--radius-lg); padding: var(--space-5); max-width: 400px; width: 90%; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
        .modal-header h3 { font-size: var(--font-body); font-weight: 600; margin: 0; }
        .modal-close { display: flex; border: none; background: transparent; cursor: pointer; color: var(--text-muted); padding: 4px; }
        .modal-close:hover { color: var(--text-primary); }
        .modal-body { display: flex; flex-direction: column; gap: var(--space-3); }
        .form-group-modal label { display: block; font-size: var(--font-meta); font-weight: 500; color: var(--text-secondary); margin-bottom: var(--space-1); }
        .form-group-modal select { width: 100%; padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: var(--font-body); background: var(--bg-base); }
        .export-btn { width: 100%; padding: var(--space-3); border: none; border-radius: var(--radius-md); background: var(--primary); color: white; font-size: var(--font-body); font-weight: 600; cursor: pointer; }
        .export-btn:hover { background: var(--primary-hover); }
        .export-divider { text-align: center; font-size: var(--font-tiny); color: var(--text-muted); }
        .export-quick { display: flex; gap: var(--space-2); }
        .export-quick-btn { flex: 1; padding: var(--space-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); background: transparent; cursor: pointer; font-size: var(--font-tiny); color: var(--text-secondary); }
        .export-quick-btn:hover { border-color: var(--primary); color: var(--primary); }

        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: repeat(3, 1fr); }
          .stat-card { padding: var(--space-2); }
        }
      `}</style>
    </div>
  );
}

function getTodayDayIndex(schedule: GeneratedSchedule): number | null {
  const today = new Date().toISOString().split('T')[0];
  const idx = schedule.days.findIndex(d => d.date === today);
  return idx >= 0 ? idx : null;
}

function getTodayWeek(schedule: GeneratedSchedule | null | undefined): number | null {
  if (!schedule) return null;
  const today = new Date().toISOString().split('T')[0];
  const day = schedule.days.find(d => d.date === today);
  if (!day) return null;
  return Math.ceil(day.dayNumber / 7);
}

function getDaysUntilExam(endDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(endDate);
  exam.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}
