'use client';

import { useEffect, useMemo, useState } from 'react';
import { GeneratedSchedule, ScheduleDay, formatScheduleDate } from '@/lib/planner/generate';
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
  plan,
  generatedSchedule,
  title,
  onToggleDay,
  onSaveNotes,
  onStartTimer,
  onSave,
  onDelete,
  saving,
}: PlanScheduleProps) {
  const { t, locale, formatDate, formatNumber } = useI18n({
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
    'Calendar View': 'عرض التقويم',
    'Agenda View': 'عرض الأجندة',
    'Focus Today': 'تركيز اليوم',
    'Study runway': 'مسار الدراسة',
    'Selected day': 'اليوم المحدد',
    'No sessions logged yet': 'لم يتم تسجيل جلسات بعد',
    'No study blocks for this day': 'لا توجد جلسات دراسة لهذا اليوم',
    'Weekly rhythm': 'إيقاع الأسبوع',
    'Study minutes': 'دقائق الدراسة',
    'Due in {days} days': 'موعد الاختبار بعد {days} أيام',
    'Ready to save this draft?': 'هل أنت مستعد لحفظ هذه المسودة؟',
    learn: 'تعلّم',
    practice: 'تدرّب',
    review: 'راجع',
    Mon: 'الاثنين',
    Tue: 'الثلاثاء',
    Wed: 'الأربعاء',
    Thu: 'الخميس',
    Fri: 'الجمعة',
    Sat: 'السبت',
    Sun: 'الأحد',
    Complete: 'مكتمل',
    Pending: 'قيد التنفيذ',
    'Month overview': 'نظرة شهرية',
    'Topic load': 'عبء الموضوعات',
    'Minutes scheduled': 'الدقائق المجدولة',
    'Quick exports': 'تصديرات سريعة',
    'Plan actions': 'إجراءات الخطة',
    'Open today in timer': 'افتح اليوم في المؤقت',
    'Draft schedule': 'جدول مسودة',
  });

  const schedule = plan?.schedule || generatedSchedule;
  const isSaved = !!plan;
  const { files } = useFoldersStore();
  const linkedFiles = plan?.folderId ? files.filter((f) => f.folderId === plan.folderId) : [];
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [studyStartHour, setStudyStartHour] = useState(9);
  const todayIdx = schedule ? getTodayDayIndex(schedule) : null;

  useEffect(() => {
    if (!schedule) return;
    const nextSelected = todayIdx ?? schedule.days.findIndex((day) => !day.completed) ?? 0;
    setSelectedDayIndex(nextSelected >= 0 ? nextSelected : 0);
  }, [schedule, todayIdx]);

  const calendarWeeks = useMemo(() => (schedule ? buildCalendarWeeks(schedule.days) : []), [schedule]);
  const weekdayLabels = useMemo(() => [t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')], [t]);

  if (!schedule) return null;

  const daysUntilExam = getDaysUntilExam(schedule.endDate);
  const completedDays = schedule.days.filter((d) => d.completed).length;
  const progress = isSaved ? Math.round((completedDays / schedule.totalDays) * 100) : 0;
  const savedDays = isSaved ? `${completedDays}/${schedule.totalDays} ${t('days ({progress}%)', { progress })}` : t('Draft schedule');

  const selectedDay = schedule.days[Math.max(0, Math.min(selectedDayIndex, schedule.days.length - 1))];
  const weeklyAverageMinutes = Math.round(schedule.days.reduce((sum, day) => sum + day.totalMinutes, 0) / Math.max(1, calendarWeeks.length));

  const handleSaveNote = () => {
    if (editingNote === null) return;
    onSaveNotes(editingNote, noteText);
    setEditingNote(null);
  };

  const handleCopy = () => {
    const text = schedule.days
      .map((day) => {
        const topics = day.topics
          .map((topic) => `  ${topic.name} (${topic.duration}m - ${topic.tasks.map((task) => t(task)).join(', ')})`)
          .join('\n');
        return `${t('Day {n}', { n: day.dayNumber })} - ${formatScheduleDate(day.date, locale)}${day.isRevision ? ` [${t('REVISION')}]` : ''}\n${topics}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(`${title}\n${'='.repeat(title.length)}\n\n${text}`);
  };

  const handleExportICS = () => {
    downloadICSFile(schedule, title, studyStartHour);
  };

  const handleGoogleDay1 = () => {
    const day1 = schedule.days[0];
    const desc = day1 ? day1.topics.map((topic) => `${topic.name} (${topic.duration}min)`).join(', ') : '';
    const url = generateGoogleCalendarURL(
      `Study: ${title}`,
      desc,
      schedule.startDate,
      schedule.startDate,
      studyStartHour,
      day1?.totalMinutes || 60,
    );
    window.open(url, '_blank');
  };

  const handleGoogleExam = () => {
    const url = generateExamGoogleCalendarURL(title, schedule.endDate);
    window.open(url, '_blank');
  };

  const selectDay = (dayIndex: number) => {
    setSelectedDayIndex(dayIndex);
    if (editingNote !== null && editingNote !== dayIndex) {
      setEditingNote(null);
      setNoteText('');
    }
  };

  return (
    <div className="plan-schedule">
      <div className="schedule-shell-header">
        <div>
          <p className="eyebrow">{t('Calendar View')}</p>
          <div className="schedule-title-row">
            <h2>{title}</h2>
            <span className={`countdown ${daysUntilExam <= 7 ? 'urgent' : ''}`}>
              {daysUntilExam > 0 ? t('{days}d left', { days: daysUntilExam }) : t('Exam day!')}
            </span>
          </div>
          <p className="schedule-range">
            {formatDate(schedule.startDate, { month: 'long', day: 'numeric', year: 'numeric' })} - {formatDate(schedule.endDate, { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="header-actions">
          <button className="header-btn" onClick={handleCopy}>{t('Copy')}</button>
          <button className="header-btn" onClick={() => setShowExport(true)}>{t('Export')}</button>
          {!isSaved && onSave && (
            <button className="header-btn primary" onClick={onSave} disabled={saving}>
              {saving ? t('Saving...') : t('Save Plan')}
            </button>
          )}
          {isSaved && onDelete && (
            <button className="header-btn danger" onClick={onDelete}>{t('Delete Plan')}</button>
          )}
        </div>
      </div>

      <div className="hero-metrics">
        <article className="metric-card accent">
          <span>{t('Study runway')}</span>
          <strong>{savedDays}</strong>
          <p>{daysUntilExam > 0 ? t('Due in {days} days', { days: daysUntilExam }) : t('Exam day!')}</p>
        </article>
        <article className="metric-card">
          <span>{t('Study Hours')}</span>
          <strong>{formatNumber(schedule.summary.totalStudyHours)}h</strong>
          <p>{t('Minutes scheduled')}</p>
        </article>
        <article className="metric-card">
          <span>{t('Topics')}</span>
          <strong>{formatNumber(schedule.summary.topicsCount)}</strong>
          <p>{t('Topic load')}</p>
        </article>
        <article className="metric-card">
          <span>{t('Weekly rhythm')}</span>
          <strong>{formatNumber(weeklyAverageMinutes)}m</strong>
          <p>{t('Study minutes')}</p>
        </article>
      </div>

      <div className="planner-board">
        <aside className="planner-board-rail">
          <section className="rail-card focus">
            <div className="rail-card-header">
              <h3>{t('Focus Today')}</h3>
              {todayIdx !== null && (
                <button className="rail-link" onClick={() => onStartTimer(todayIdx)}>{t('Open today in timer')}</button>
              )}
            </div>
            {todayIdx !== null ? (
              <>
                <strong>{t('Day {n}', { n: schedule.days[todayIdx].dayNumber })}</strong>
                <p>{formatScheduleDate(schedule.days[todayIdx].date, locale)}</p>
                <div className="chip-row">
                  {schedule.days[todayIdx].topics.slice(0, 3).map((topic, index) => (
                    <span key={`${topic.name}-${index}`} className={`task-chip ${topic.tasks[0]}`}>
                      {topic.name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p>{t('No study blocks for this day')}</p>
            )}
          </section>

          {linkedFiles.length > 0 && (
            <section className="rail-card">
              <div className="rail-card-header">
                <h3>{t('Study Materials')}</h3>
                <span>{formatNumber(linkedFiles.length)}</span>
              </div>
              <div className="file-list">
                {linkedFiles.slice(0, 6).map((file) => (
                  <span key={file.id} className="file-pill">{file.name}</span>
                ))}
                {linkedFiles.length > 6 && <span className="file-pill muted">+{linkedFiles.length - 6} {t('more')}</span>}
              </div>
            </section>
          )}

          <section className="rail-card">
            <div className="rail-card-header">
              <h3>{t('Quick exports')}</h3>
              <span>.ics</span>
            </div>
            <div className="rail-stack">
              <button className="rail-action" onClick={handleExportICS}>{t('Download .ics File')}</button>
              <button className="rail-action" onClick={handleGoogleDay1}>{t('Google Cal (Day 1)')}</button>
              <button className="rail-action" onClick={handleGoogleExam}>{t('Google Cal (Exam)')}</button>
            </div>
          </section>
        </aside>

        <section className="calendar-panel">
          <div className="calendar-panel-header">
            <div>
              <p className="eyebrow">{t('Month overview')}</p>
              <h3>{formatDate(schedule.startDate, { month: 'long', year: 'numeric' })}</h3>
            </div>
            <label className="completed-toggle">
              <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
              {t('Show completed days')}
            </label>
          </div>

          <div className="weekday-row">
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarWeeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="calendar-week">
                {week.map((day, daySlotIndex) => {
                  if (!day) {
                    return <div key={`empty-${weekIndex}-${daySlotIndex}`} className="calendar-cell empty" />;
                  }

                  const dayIndex = schedule.days.findIndex((entry) => entry.dayNumber === day.dayNumber);
                  const isSelected = dayIndex === selectedDayIndex;
                  const isToday = dayIndex === todayIdx;
                  const isMuted = !showCompleted && day.completed;

                  return (
                    <button
                      key={day.date}
                      className={`calendar-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${day.completed ? 'completed' : ''} ${day.isRevision ? 'revision' : ''} ${isMuted ? 'muted' : ''}`}
                      onClick={() => selectDay(dayIndex)}
                    >
                      <div className="cell-top">
                        <div>
                          <span className="cell-date-number">{formatDate(day.date, { day: 'numeric' })}</span>
                          <span className="cell-date-label">{formatScheduleDate(day.date, locale)}</span>
                        </div>
                        {day.completed && <span className="cell-status">{t('Complete')}</span>}
                        {!day.completed && isToday && <span className="cell-status today">{t('TODAY')}</span>}
                      </div>

                      <div className="cell-metrics">
                        <strong>{formatNumber(day.totalMinutes)}m</strong>
                        <span>{t('{count} topics', { count: day.topics.length })}</span>
                      </div>

                      <div className="cell-topic-list">
                        {day.topics.slice(0, 3).map((topic, index) => (
                          <span key={`${topic.name}-${index}`} className={`task-chip ${topic.tasks[0]}`}>
                            {topic.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <aside className="agenda-panel">
          <div className="agenda-header">
            <div>
              <p className="eyebrow">{t('Agenda View')}</p>
              <h3>{t('Selected day')}</h3>
            </div>
            {isSaved && (
              <label className="agenda-complete">
                <input
                  type="checkbox"
                  checked={!!selectedDay.completed}
                  onChange={() => onToggleDay(selectedDayIndex)}
                />
                {selectedDay.completed ? t('Complete') : t('Pending')}
              </label>
            )}
          </div>

          <div className="agenda-card hero">
            <div>
              <strong>{t('Day {n}', { n: selectedDay.dayNumber })}</strong>
              <p>{formatDate(selectedDay.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            </div>
            <button className="header-btn primary compact" onClick={() => onStartTimer(selectedDayIndex)}>{t('Start Timer')}</button>
          </div>

          <div className="agenda-card summary">
            <span>{formatNumber(selectedDay.totalMinutes)}m</span>
            <p>{selectedDay.isRevision ? t('REVISION') : t('Study runway')}</p>
            <div className="chip-row">
              {selectedDay.topics.flatMap((topic) => topic.tasks).slice(0, 3).map((task, index) => (
                <span key={`${task}-${index}`} className={`task-chip ${task}`}>{t(task)}</span>
              ))}
            </div>
          </div>

          <div className="agenda-topics">
            {selectedDay.topics.length === 0 ? (
              <div className="agenda-empty">{t('No study blocks for this day')}</div>
            ) : (
              selectedDay.topics.map((topic, index) => (
                <div key={`${topic.name}-${index}`} className="agenda-topic-card">
                  <div>
                    <strong>{topic.name}</strong>
                    <p>{formatNumber(topic.duration)}m</p>
                  </div>
                  <div className="chip-row end">
                    {topic.tasks.map((task, taskIndex) => (
                      <span key={`${task}-${taskIndex}`} className={`task-chip ${task}`}>{t(task)}</span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="agenda-card notes">
            <div className="rail-card-header">
              <h3>{t('Plan actions')}</h3>
              {selectedDay.sessions?.length ? <span>{t('{count} sessions logged', { count: selectedDay.sessions.length })}</span> : <span>{t('No sessions logged yet')}</span>}
            </div>
            {isSaved ? (
              editingNote === selectedDayIndex ? (
                <div className="note-editor">
                  <textarea
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder={t('Add a note for this day...')}
                    rows={4}
                  />
                  <div className="note-actions">
                    <button className="header-btn primary compact" onClick={handleSaveNote}>{t('Save')}</button>
                    <button className="header-btn compact" onClick={() => setEditingNote(null)}>{t('Cancel')}</button>
                  </div>
                </div>
              ) : selectedDay.notes ? (
                <button
                  className="existing-note"
                  onClick={() => {
                    setEditingNote(selectedDayIndex);
                    setNoteText(selectedDay.notes || '');
                  }}
                >
                  {selectedDay.notes}
                </button>
              ) : (
                <button
                  className="rail-action"
                  onClick={() => {
                    setEditingNote(selectedDayIndex);
                    setNoteText('');
                  }}
                >
                  {t('+ Add note')}
                </button>
              )
            ) : (
              <p className="draft-copy">{t('Ready to save this draft?')}</p>
            )}
          </div>
        </aside>
      </div>

      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('Export Schedule')}</h3>
              <button className="modal-close" onClick={() => setShowExport(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group-modal">
                <label>{t('Study start time')}</label>
                <select value={studyStartHour} onChange={(event) => setStudyStartHour(Number(event.target.value))}>
                  {Array.from({ length: 15 }, (_, i) => i + 6).map((hour) => (
                    <option key={hour} value={hour}>{hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}</option>
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
        .plan-schedule {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }
        .eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }
        .schedule-shell-header,
        .schedule-title-row,
        .header-actions,
        .rail-card-header,
        .agenda-header,
        .cell-top,
        .schedule-range {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .schedule-shell-header {
          flex-wrap: wrap;
        }
        .schedule-title-row {
          justify-content: flex-start;
          flex-wrap: wrap;
          margin-bottom: var(--space-1);
        }
        .schedule-title-row h2,
        .calendar-panel-header h3,
        .agenda-header h3 {
          margin: 0;
          font-size: clamp(1.15rem, 2vw, 1.6rem);
        }
        .schedule-range {
          justify-content: flex-start;
          color: var(--text-muted);
          font-size: var(--font-meta);
          flex-wrap: wrap;
        }
        .countdown {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: var(--font-tiny);
          font-weight: var(--weight-semibold);
          background: color-mix(in srgb, var(--primary) 14%, transparent);
          color: var(--primary);
        }
        .countdown.urgent {
          background: color-mix(in srgb, var(--danger) 15%, transparent);
          color: var(--danger);
        }
        .header-actions {
          flex-wrap: wrap;
        }
        .header-btn,
        .rail-action,
        .export-quick-btn,
        .modal-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          color: var(--text-secondary);
          cursor: pointer;
          transition: var(--transition-fast);
        }
        .header-btn,
        .rail-action,
        .export-quick-btn {
          padding: var(--space-2) var(--space-3);
          font-size: var(--font-meta);
        }
        .header-btn:hover,
        .rail-action:hover,
        .export-quick-btn:hover {
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border-subtle));
          color: var(--primary);
        }
        .header-btn.primary,
        .header-btn.compact.primary,
        .export-btn {
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 65%, white 35%));
          color: white;
          border-color: transparent;
        }
        .header-btn.compact {
          padding: var(--space-2) var(--space-3);
        }
        .header-btn.danger {
          color: var(--danger);
        }
        .hero-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--space-3);
        }
        .metric-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: var(--space-4);
          border-radius: 24px;
          border: 1px solid var(--border-subtle);
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
        }
        .metric-card.accent {
          background: linear-gradient(145deg, color-mix(in srgb, var(--primary) 12%, var(--bg-elevated)), var(--bg-surface));
        }
        .metric-card span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .metric-card strong {
          font-size: clamp(1.2rem, 2vw, 1.8rem);
        }
        .metric-card p {
          margin: 0;
          font-size: var(--font-meta);
          color: var(--text-muted);
        }
        .planner-board {
          display: grid;
          grid-template-columns: 260px minmax(0, 1fr) 320px;
          gap: var(--space-4);
          align-items: start;
        }
        .planner-board-rail,
        .agenda-panel {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .rail-card,
        .calendar-panel,
        .agenda-card,
        .agenda-topic-card {
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          background: linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
        }
        .rail-card,
        .agenda-card {
          padding: var(--space-4);
        }
        .rail-card.focus {
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, var(--bg-elevated)), var(--bg-surface));
        }
        .rail-card-header h3 {
          margin: 0;
          font-size: var(--font-body);
        }
        .rail-link {
          border: none;
          background: transparent;
          color: var(--primary);
          cursor: pointer;
          font-size: var(--font-tiny);
          font-weight: var(--weight-semibold);
        }
        .chip-row,
        .file-list,
        .rail-stack,
        .cell-topic-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .rail-stack {
          flex-direction: column;
        }
        .task-chip,
        .file-pill,
        .cell-status {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: var(--weight-medium);
        }
        .task-chip.learn {
          background: color-mix(in srgb, var(--primary) 14%, transparent);
          color: var(--primary);
        }
        .task-chip.practice {
          background: color-mix(in srgb, var(--warning) 16%, transparent);
          color: var(--warning);
        }
        .task-chip.review {
          background: color-mix(in srgb, var(--success) 16%, transparent);
          color: var(--success);
        }
        .file-pill {
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
        }
        .file-pill.muted {
          color: var(--text-muted);
        }
        .calendar-panel {
          padding: var(--space-4);
          min-width: 0;
        }
        .calendar-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }
        .completed-toggle,
        .agenda-complete {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }
        .weekday-row,
        .calendar-week {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: var(--space-2);
        }
        .weekday-row {
          margin-bottom: var(--space-2);
          color: var(--text-muted);
          font-size: var(--font-tiny);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .weekday-row span {
          padding: 0 var(--space-1);
          text-align: start;
        }
        .calendar-grid {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .calendar-cell {
          min-height: 150px;
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          background: var(--bg-surface);
          padding: var(--space-3);
          text-align: start;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
        }
        .calendar-cell:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--primary) 35%, var(--border-subtle));
        }
        .calendar-cell.selected {
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border-subtle));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent), 0 16px 36px rgba(37, 99, 235, 0.12);
        }
        .calendar-cell.today {
          background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 10%, var(--bg-surface)), var(--bg-surface));
        }
        .calendar-cell.revision {
          background: linear-gradient(180deg, color-mix(in srgb, var(--warning) 10%, var(--bg-surface)), var(--bg-surface));
        }
        .calendar-cell.completed {
          background: linear-gradient(180deg, color-mix(in srgb, var(--success) 8%, var(--bg-surface)), var(--bg-surface));
        }
        .calendar-cell.muted {
          opacity: 0.45;
        }
        .calendar-cell.empty {
          border-style: dashed;
          background: transparent;
          cursor: default;
          min-height: 150px;
        }
        .cell-top {
          align-items: flex-start;
        }
        .cell-date-number {
          display: block;
          font-size: var(--font-lg);
          font-weight: var(--weight-semibold);
          color: var(--text-primary);
        }
        .cell-date-label,
        .cell-metrics span,
        .draft-copy,
        .agenda-empty {
          color: var(--text-muted);
          font-size: var(--font-tiny);
        }
        .cell-status {
          background: var(--bg-inset);
          color: var(--text-muted);
        }
        .cell-status.today {
          background: color-mix(in srgb, var(--primary) 16%, transparent);
          color: var(--primary);
        }
        .cell-metrics {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-2);
        }
        .cell-metrics strong,
        .agenda-card.summary span {
          font-size: var(--font-body);
          font-weight: var(--weight-semibold);
        }
        .agenda-header {
          align-items: flex-start;
        }
        .agenda-card.hero,
        .agenda-card.summary,
        .agenda-topic-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .agenda-card.hero p,
        .agenda-card.summary p,
        .agenda-topic-card p {
          margin: 6px 0 0;
          color: var(--text-muted);
          font-size: var(--font-meta);
        }
        .agenda-topics {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .agenda-topic-card {
          padding: var(--space-3);
        }
        .chip-row.end {
          justify-content: flex-end;
        }
        .note-editor textarea,
        .form-group-modal select {
          width: 100%;
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-base);
          color: var(--text-primary);
          font: inherit;
        }
        .note-actions,
        .export-quick {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-2);
        }
        .existing-note {
          width: 100%;
          text-align: start;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-inset);
          color: var(--text-secondary);
          padding: var(--space-3);
          cursor: pointer;
        }
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(2, 8, 23, 0.42);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
        }
        .modal {
          width: min(420px, 100%);
          border: 1px solid var(--border-subtle);
          border-radius: 28px;
          background: var(--bg-surface);
          padding: var(--space-5);
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-4);
        }
        .modal-header h3 {
          margin: 0;
        }
        .modal-body {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .export-btn {
          width: 100%;
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-md);
          border: none;
          cursor: pointer;
          font-size: var(--font-body);
          font-weight: var(--weight-semibold);
        }
        .export-divider {
          text-align: center;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }
        @media (max-width: 1180px) {
          .planner-board {
            grid-template-columns: 1fr;
          }
          .hero-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 760px) {
          .hero-metrics {
            grid-template-columns: 1fr;
          }
          .weekday-row,
          .calendar-week {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .calendar-cell.empty {
            display: none;
          }
          .header-actions,
          .note-actions,
          .export-quick {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}

function getTodayDayIndex(schedule: GeneratedSchedule): number | null {
  const today = new Date().toISOString().split('T')[0];
  const index = schedule.days.findIndex((day) => day.date === today);
  return index >= 0 ? index : null;
}

function getDaysUntilExam(endDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exam = new Date(endDate);
  exam.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function buildCalendarWeeks(days: ScheduleDay[]): Array<Array<ScheduleDay | null>> {
  if (days.length === 0) return [];

  const weeks: Array<Array<ScheduleDay | null>> = [];
  let currentWeek: Array<ScheduleDay | null> = [];
  const startDate = new Date(days[0].date);
  const firstWeekday = (startDate.getDay() + 6) % 7;

  for (let index = 0; index < firstWeekday; index += 1) {
    currentWeek.push(null);
  }

  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return weeks;
}
