'use client';

import { useState, useEffect, useRef } from 'react';
import {
  StudyTopic,
  GeneratedSchedule,
  generateStudySchedule,
  formatScheduleDate,
  groupByWeek,
} from '@/lib/planner/generate';
import {
  downloadICSFile,
  generateGoogleCalendarURL,
  generateExamGoogleCalendarURL,
} from '@/lib/planner/calendar';
import { useStudyPlans, StudyPlan } from '@/hooks/useStudyPlans';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

type View = 'input' | 'schedule' | 'saved' | 'timer';

export function StudyPlanner() {
  const { plans, loading, createPlan, updateProgress, deletePlan } = useStudyPlans();

  const [view, setView] = useState<View>('input');
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [topics, setTopics] = useState<StudyTopic[]>([
    { name: '', difficulty: 3, estimatedHours: 2 },
  ]);
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedSchedule | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [studyStartHour, setStudyStartHour] = useState(9);

  // Study Timer State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerDuration, setTimerDuration] = useState(25 * 60); // 25 minutes default (Pomodoro)
  const [currentDayIndex, setCurrentDayIndex] = useState<number | null>(null);
  const [breakMode, setBreakMode] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Notes state
  const [dayNotes, setDayNotes] = useState<Record<number, string>>({});
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  // Filter state for saved plans
  const [planFilter, setPlanFilter] = useState<'all' | 'active' | 'completed'>('all');

  // View preferences
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));
  const [showCompletedDays, setShowCompletedDays] = useState(true);

  // Timer effect
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerRunning && timerSeconds === 0) {
      // Timer completed
      setTimerRunning(false);
      if (breakMode) {
        // Break is over, start new session
        setBreakMode(false);
        setTimerSeconds(timerDuration);
      } else {
        // Study session complete
        setSessionsCompleted(prev => prev + 1);
        // Play notification sound
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleC0qkbPHvnpeNj16qcnLo10iFmSbzN+2diwENpm/5f+tVAEJcqfS3LJlJhZnpsLeu3g6PXKy0NSZWRIIZ7TL4MmQVzMuf6bS2aFdHh9YjbzVx5RdPU5+qsnTlFEXHH+44P+8ewAIcbbj/8toAAtRoN7/tWgqFVaZy+u+fzYtZaDF5sOKVjlEeqi93qxqMB1VgrL15K9qLhtRgrb45KJZFA5Ql+P/tlMMC0eU4v+8cBIOQYPR/8V3GQdJpeP/pUsEEGC65f+gSRMYZ7Tl/4dCAhJuwPj/d0AFE3TB+/9tPgQUeMPz/2M8Bxd+wuz/Wz0KGoPF5P9TPwsahMbb/089DB6Jxtf/TD4OIYvG0/9IPg8jjsjR/0Y+ESWNSE');
          audio.play().catch(() => {});
        } catch {}
        // Suggest break
        if (sessionsCompleted > 0 && (sessionsCompleted + 1) % 4 === 0) {
          // Long break after 4 sessions
          setBreakMode(true);
          setTimerSeconds(15 * 60); // 15 min break
        } else {
          setBreakMode(true);
          setTimerSeconds(5 * 60); // 5 min break
        }
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timerRunning, timerSeconds, timerDuration, breakMode, sessionsCompleted]);

  const addTopic = () => {
    setTopics([...topics, { name: '', difficulty: 3, estimatedHours: 2 }]);
  };

  const removeTopic = (index: number) => {
    if (topics.length > 1) {
      setTopics(topics.filter((_, i) => i !== index));
    }
  };

  const updateTopic = (index: number, field: keyof StudyTopic, value: string | number) => {
    const updated = [...topics];
    updated[index] = { ...updated[index], [field]: value };
    setTopics(updated);
  };

  const handleGenerate = () => {
    setError('');

    // Validation
    if (!title.trim()) {
      setError('Please enter a plan title');
      return;
    }

    if (!examDate) {
      setError('Please select an exam date');
      return;
    }

    const examDateObj = new Date(examDate);
    if (examDateObj <= new Date()) {
      setError('Exam date must be in the future');
      return;
    }

    const validTopics = topics.filter(t => t.name.trim());
    if (validTopics.length === 0) {
      setError('Please add at least one topic');
      return;
    }

    const schedule = generateStudySchedule(examDateObj, validTopics, dailyMinutes);
    setGeneratedSchedule(schedule);
    setView('schedule');
  };

  const handleSave = async () => {
    if (!generatedSchedule) return;

    setSaving(true);
    setError('');

    const validTopics = topics.filter(t => t.name.trim());

    const result = await createPlan({
      title,
      examDate,
      dailyMinutes,
      topics: validTopics,
      schedule: generatedSchedule,
    });

    setSaving(false);

    if (result) {
      handleReset();
      setView('saved');
    } else {
      setError('Failed to save plan. Please try again.');
    }
  };

  const handleReset = () => {
    setTitle('');
    setExamDate('');
    setDailyMinutes(60);
    setTopics([{ name: '', difficulty: 3, estimatedHours: 2 }]);
    setGeneratedSchedule(null);
    setSelectedPlan(null);
    setError('');
    setDayNotes({});
  };

  const handleViewPlan = (plan: StudyPlan) => {
    setSelectedPlan(plan);
    setView('schedule');
  };

  const handleToggleDay = async (plan: StudyPlan, dayIndex: number) => {
    const updatedSchedule = { ...plan.schedule };
    updatedSchedule.days = [...updatedSchedule.days];
    updatedSchedule.days[dayIndex] = {
      ...updatedSchedule.days[dayIndex],
      completed: !updatedSchedule.days[dayIndex].completed,
    };

    const result = await updateProgress(plan.id, updatedSchedule);
    if (result) {
      setSelectedPlan(result);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Delete this study plan?')) return;

    const success = await deletePlan(planId);
    if (success && selectedPlan?.id === planId) {
      setSelectedPlan(null);
      setView('saved');
    }
  };

  const handleCopySchedule = () => {
    const schedule = selectedPlan?.schedule || generatedSchedule;
    if (!schedule) return;

    let text = `Study Schedule: ${selectedPlan?.title || title}\n`;
    text += `${schedule.startDate} to ${schedule.endDate}\n`;
    text += `Total Days: ${schedule.totalDays}\n\n`;

    schedule.days.forEach(day => {
      text += `Day ${day.dayNumber} (${formatScheduleDate(day.date)})${day.isRevision ? ' [REVISION]' : ''}${day.completed ? ' [DONE]' : ''}\n`;
      day.topics.forEach(topic => {
        text += `  - ${topic.name}: ${topic.duration}min (${topic.tasks.join(', ')})\n`;
      });
      text += '\n';
    });

    navigator.clipboard.writeText(text);
  };

  const handleExportCalendar = (type: 'ics' | 'google' | 'google-exam') => {
    const schedule = selectedPlan?.schedule || generatedSchedule;
    const planTitle = selectedPlan?.title || title;

    if (!schedule) return;

    if (type === 'ics') {
      downloadICSFile(schedule, planTitle, studyStartHour);
    } else if (type === 'google-exam') {
      const url = generateExamGoogleCalendarURL(planTitle, schedule.endDate);
      window.open(url, '_blank');
    } else if (type === 'google') {
      // For Google Calendar, open the first day's event (user can import .ics for all)
      const firstDay = schedule.days[0];
      if (firstDay) {
        const topicDetails = firstDay.topics
          .map(t => `- ${t.name}: ${t.duration}min (${t.tasks.join(', ')})`)
          .join('\n');
        const url = generateGoogleCalendarURL(
          `${planTitle} - Day 1`,
          `Study Session\n\nTopics:\n${topicDetails}`,
          firstDay.date,
          firstDay.date,
          studyStartHour,
          firstDay.totalMinutes
        );
        window.open(url, '_blank');
      }
    }

    setShowExportModal(false);
  };

  const startStudyTimer = (dayIndex: number) => {
    setCurrentDayIndex(dayIndex);
    setTimerSeconds(timerDuration);
    setBreakMode(false);
    setSessionsCompleted(0);
    setView('timer');
  };

  const formatTimerTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleWeekExpanded = (week: number) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(week)) {
      newExpanded.delete(week);
    } else {
      newExpanded.add(week);
    }
    setExpandedWeeks(newExpanded);
  };

  const getTodaysDayIndex = () => {
    const schedule = selectedPlan?.schedule || generatedSchedule;
    if (!schedule) return -1;

    const today = new Date().toISOString().split('T')[0];
    return schedule.days.findIndex(d => d.date === today);
  };

  const getDaysUntilExam = () => {
    const schedule = selectedPlan?.schedule || generatedSchedule;
    if (!schedule) return 0;

    const examDate = new Date(schedule.endDate);
    const today = new Date();
    const diffTime = examDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filteredPlans = plans.filter(plan => {
    if (planFilter === 'all') return true;
    if (planFilter === 'active') return plan.status === 'active';
    if (planFilter === 'completed') return plan.status === 'completed' || plan.progress === 100;
    return true;
  });

  // Get minimum date (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const todayIndex = getTodaysDayIndex();
  const daysUntilExam = getDaysUntilExam();

  return (
    <div className="study-planner">
      {/* Header */}
      <div className="planner-header">
        <div>
          <h3>Study Planner</h3>
          <p>Create personalized study schedules for your exams</p>
        </div>
        <div className="header-actions">
          {view !== 'input' && view !== 'timer' && (
            <button className="btn ghost" onClick={() => { handleReset(); setView('input'); }}>
              + New Plan
            </button>
          )}
          {plans.length > 0 && view !== 'saved' && view !== 'timer' && (
            <button className="btn ghost" onClick={() => { setSelectedPlan(null); setView('saved'); }}>
              My Plans ({plans.length})
            </button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-message">{error}</div>
      )}

      {/* TIMER VIEW */}
      {view === 'timer' && (
        <div className="timer-view">
          <button
            className="btn ghost back-btn"
            onClick={() => setView('schedule')}
          >
            ← Back to Schedule
          </button>

          <div className="timer-container">
            <div className={`timer-display ${breakMode ? 'break' : ''}`}>
              <div className="timer-label">
                {breakMode ? 'Break Time' : 'Study Session'}
              </div>
              <div className="timer-time">{formatTimerTime(timerSeconds)}</div>
              <div className="timer-sessions">
                Sessions: {sessionsCompleted} | {breakMode && sessionsCompleted % 4 === 0 ? 'Long Break' : breakMode ? 'Short Break' : 'Focus'}
              </div>
            </div>

            <div className="timer-controls">
              {!timerRunning ? (
                <button className="btn timer-btn" onClick={() => setTimerRunning(true)}>
                  ▶ Start
                </button>
              ) : (
                <button className="btn secondary timer-btn" onClick={() => setTimerRunning(false)}>
                  ⏸ Pause
                </button>
              )}
              <button
                className="btn ghost timer-btn"
                onClick={() => {
                  setTimerRunning(false);
                  setTimerSeconds(timerDuration);
                  setBreakMode(false);
                }}
              >
                ↺ Reset
              </button>
            </div>

            <div className="timer-presets">
              <span className="preset-label">Quick Set:</span>
              <button
                className={`preset-btn ${timerDuration === 25 * 60 ? 'active' : ''}`}
                onClick={() => { setTimerDuration(25 * 60); setTimerSeconds(25 * 60); }}
              >
                25 min
              </button>
              <button
                className={`preset-btn ${timerDuration === 45 * 60 ? 'active' : ''}`}
                onClick={() => { setTimerDuration(45 * 60); setTimerSeconds(45 * 60); }}
              >
                45 min
              </button>
              <button
                className={`preset-btn ${timerDuration === 60 * 60 ? 'active' : ''}`}
                onClick={() => { setTimerDuration(60 * 60); setTimerSeconds(60 * 60); }}
              >
                60 min
              </button>
            </div>

            {currentDayIndex !== null && (selectedPlan?.schedule || generatedSchedule) && (
              <div className="timer-day-info">
                <h4>Today's Topics</h4>
                {(selectedPlan?.schedule || generatedSchedule)!.days[currentDayIndex]?.topics.map((topic, idx) => (
                  <div key={idx} className="timer-topic">
                    <span className="topic-name">{topic.name}</span>
                    <span className="topic-task">{topic.tasks[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INPUT VIEW */}
      {view === 'input' && (
        <div className="input-view">
          {/* Plan Title */}
          <div className="form-group">
            <label>Plan Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Biology Final Exam"
              className="form-input"
            />
          </div>

          {/* Exam Date */}
          <div className="form-group">
            <label>Exam Date</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              min={minDate}
              className="form-input"
            />
          </div>

          {/* Daily Study Time */}
          <div className="form-group">
            <label>Daily Study Time: {dailyMinutes} minutes</label>
            <input
              type="range"
              min="30"
              max="180"
              step="15"
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
              className="range-input"
            />
            <div className="range-labels">
              <span>30 min</span>
              <span>180 min</span>
            </div>
          </div>

          {/* Topics */}
          <div className="form-group">
            <label>Topics to Cover</label>

            {topics.map((topic, index) => (
              <div key={index} className="topic-card">
                <div className="topic-header">
                  <input
                    type="text"
                    value={topic.name}
                    onChange={(e) => updateTopic(index, 'name', e.target.value)}
                    placeholder="Topic name"
                    className="topic-input"
                  />
                  {topics.length > 1 && (
                    <button
                      onClick={() => removeTopic(index)}
                      className="remove-topic-btn"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="topic-meta">
                  <div className="meta-item">
                    <span className="meta-label">Difficulty:</span>
                    <div className="star-rating">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          onClick={() => updateTopic(index, 'difficulty', level as 1 | 2 | 3 | 4 | 5)}
                          className={`star-btn ${level <= topic.difficulty ? 'active' : ''}`}
                        >
                          {level <= topic.difficulty ? '★' : '☆'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">Hours:</span>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={topic.estimatedHours}
                      onChange={(e) => updateTopic(index, 'estimatedHours', Number(e.target.value))}
                      className="hours-input"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button onClick={addTopic} className="add-topic-btn">
              + Add Topic
            </button>
          </div>

          {/* Generate Button */}
          <button className="btn generate-btn" onClick={handleGenerate}>
            Generate Schedule
          </button>

          {/* Quick Tips */}
          <div className="tips-section">
            <h4>Tips for better schedules:</h4>
            <ul>
              <li>Set realistic daily study times you can maintain</li>
              <li>Rate harder topics with higher difficulty - they'll be scheduled earlier</li>
              <li>Include buffer days by setting exam date 1-2 days before actual exam</li>
              <li>Break large topics into smaller sub-topics for better tracking</li>
            </ul>
          </div>
        </div>
      )}

      {/* SCHEDULE VIEW */}
      {view === 'schedule' && (generatedSchedule || selectedPlan?.schedule) && (
        <div className="schedule-view">
          {/* Schedule Header */}
          <div className="schedule-header">
            <div className="schedule-title">
              <h4>{selectedPlan?.title || title}</h4>
              <div className="schedule-dates">
                {formatScheduleDate((selectedPlan?.schedule || generatedSchedule)!.startDate)} -{' '}
                {formatScheduleDate((selectedPlan?.schedule || generatedSchedule)!.endDate)} (
                {(selectedPlan?.schedule || generatedSchedule)!.totalDays} days)
              </div>
            </div>

            {daysUntilExam > 0 && (
              <div className={`countdown-badge ${daysUntilExam <= 7 ? 'urgent' : ''}`}>
                {daysUntilExam} {daysUntilExam === 1 ? 'day' : 'days'} until exam
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {selectedPlan && (
            <div className="progress-section">
              <div className="progress-header">
                <span>Progress</span>
                <span>{selectedPlan.progress}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${selectedPlan.progress === 100 ? 'complete' : ''}`}
                  style={{ width: `${selectedPlan.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="stats-grid">
            <div className="stat-card primary">
              <div className="stat-value">
                {(selectedPlan?.schedule || generatedSchedule)!.summary.totalStudyHours}h
              </div>
              <div className="stat-label">Total Study</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {(selectedPlan?.schedule || generatedSchedule)!.summary.topicsCount}
              </div>
              <div className="stat-label">Topics</div>
            </div>
            <div className="stat-card warning">
              <div className="stat-value">
                {(selectedPlan?.schedule || generatedSchedule)!.summary.revisionDays}
              </div>
              <div className="stat-label">Revision Days</div>
            </div>
          </div>

          {/* Today's Highlight */}
          {todayIndex >= 0 && (
            <div className="today-highlight">
              <div className="today-header">
                <span className="today-badge">Today</span>
                <button
                  className="btn start-timer-btn"
                  onClick={() => startStudyTimer(todayIndex)}
                >
                  ⏱ Start Study Timer
                </button>
              </div>
              <div className="today-topics">
                {(selectedPlan?.schedule || generatedSchedule)!.days[todayIndex].topics.map((topic, idx) => (
                  <div key={idx} className="today-topic">
                    <span>{topic.name}</span>
                    <span className={`task-badge ${topic.tasks[0]}`}>{topic.tasks[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Controls */}
          <div className="view-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showCompletedDays}
                onChange={(e) => setShowCompletedDays(e.target.checked)}
              />
              Show completed days
            </label>
          </div>

          {/* Day-by-Day Schedule */}
          <div className="schedule-content">
            {Array.from(groupByWeek((selectedPlan?.schedule || generatedSchedule)!.days)).map(([week, days]) => {
              const visibleDays = showCompletedDays ? days : days.filter(d => !d.completed);
              if (visibleDays.length === 0) return null;

              return (
                <div key={week} className="week-section">
                  <button
                    className="week-header"
                    onClick={() => toggleWeekExpanded(week)}
                  >
                    <span className="week-title">
                      Week {week}
                      {days.some(d => d.isRevision) && (
                        <span className="revision-badge">REVISION</span>
                      )}
                    </span>
                    <span className="week-progress">
                      {days.filter(d => d.completed).length}/{days.length} days
                      <span className="expand-icon">{expandedWeeks.has(week) ? '▼' : '▶'}</span>
                    </span>
                  </button>

                  {expandedWeeks.has(week) && (
                    <div className="week-days">
                      {visibleDays.map((day) => {
                        const isToday = todayIndex === day.dayNumber - 1;

                        return (
                          <div
                            key={day.dayNumber}
                            className={`day-card ${day.completed ? 'completed' : ''} ${day.isRevision ? 'revision' : ''} ${isToday ? 'today' : ''}`}
                          >
                            <div className="day-header">
                              <div className="day-info">
                                {selectedPlan && (
                                  <button
                                    onClick={() => handleToggleDay(selectedPlan, day.dayNumber - 1)}
                                    className={`checkbox ${day.completed ? 'checked' : ''}`}
                                  >
                                    {day.completed && '✓'}
                                  </button>
                                )}
                                <span className="day-title">
                                  Day {day.dayNumber}: {formatScheduleDate(day.date)}
                                  {isToday && <span className="today-tag">TODAY</span>}
                                </span>
                              </div>
                              <div className="day-actions">
                                <span className="day-duration">{day.totalMinutes}min</span>
                                {selectedPlan && (
                                  <button
                                    className="btn ghost icon-btn"
                                    onClick={() => startStudyTimer(day.dayNumber - 1)}
                                    title="Start timer"
                                  >
                                    ⏱
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="day-topics">
                              {day.topics.map((topic, idx) => (
                                <div key={idx} className="topic-item">
                                  <span className="topic-name">{topic.name}</span>
                                  <div className="topic-meta">
                                    <span className={`task-badge ${topic.tasks[0]}`}>
                                      {topic.tasks[0]}
                                    </span>
                                    <span className="topic-duration">{topic.duration}min</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Day Notes */}
                            {selectedPlan && (
                              <div className="day-notes">
                                {editingNote === day.dayNumber ? (
                                  <div className="note-editor">
                                    <textarea
                                      value={noteText}
                                      onChange={(e) => setNoteText(e.target.value)}
                                      placeholder="Add notes for this day..."
                                      rows={2}
                                    />
                                    <div className="note-actions">
                                      <button
                                        className="btn secondary small"
                                        onClick={() => {
                                          setDayNotes({ ...dayNotes, [day.dayNumber]: noteText });
                                          setEditingNote(null);
                                        }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        className="btn ghost small"
                                        onClick={() => setEditingNote(null)}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : dayNotes[day.dayNumber] ? (
                                  <div
                                    className="note-display"
                                    onClick={() => {
                                      setNoteText(dayNotes[day.dayNumber]);
                                      setEditingNote(day.dayNumber);
                                    }}
                                  >
                                    📝 {dayNotes[day.dayNumber]}
                                  </div>
                                ) : (
                                  <button
                                    className="add-note-btn"
                                    onClick={() => {
                                      setNoteText('');
                                      setEditingNote(day.dayNumber);
                                    }}
                                  >
                                    + Add note
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
            <button className="btn secondary" onClick={handleCopySchedule}>
              📋 Copy
            </button>
            <button className="btn secondary" onClick={() => setShowExportModal(true)}>
              📅 Export
            </button>
            {!selectedPlan && (
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Plan'}
              </button>
            )}
            {selectedPlan && (
              <button
                className="btn ghost danger"
                onClick={() => handleDeletePlan(selectedPlan.id)}
              >
                Delete
              </button>
            )}
          </div>

          {/* Calendar Export Modal */}
          {showExportModal && (
            <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Export to Calendar</h3>
                  <button onClick={() => setShowExportModal(false)} className="close-btn">×</button>
                </div>

                <div className="form-group">
                  <label>Study Start Time</label>
                  <select
                    value={studyStartHour}
                    onChange={(e) => setStudyStartHour(Number(e.target.value))}
                    className="form-input"
                  >
                    {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((hour) => (
                      <option key={hour} value={hour}>
                        {hour.toString().padStart(2, '0')}:00 ({hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="export-options">
                  <button className="btn export-btn" onClick={() => handleExportCalendar('ics')}>
                    Download .ics File
                  </button>
                  <p className="export-hint">
                    Works with Apple Calendar, Google Calendar, Outlook
                  </p>

                  <div className="export-divider">
                    <span>Quick Add</span>
                  </div>

                  <div className="quick-add-btns">
                    <button className="btn secondary" onClick={() => handleExportCalendar('google')}>
                      Add Day 1
                    </button>
                    <button className="btn secondary" onClick={() => handleExportCalendar('google-exam')}>
                      Add Exam Day
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SAVED PLANS VIEW */}
      {view === 'saved' && (
        <div className="saved-view">
          {/* Filter Tabs */}
          <div className="filter-tabs">
            <button
              className={`filter-tab ${planFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPlanFilter('all')}
            >
              All ({plans.length})
            </button>
            <button
              className={`filter-tab ${planFilter === 'active' ? 'active' : ''}`}
              onClick={() => setPlanFilter('active')}
            >
              Active ({plans.filter(p => p.status === 'active').length})
            </button>
            <button
              className={`filter-tab ${planFilter === 'completed' ? 'active' : ''}`}
              onClick={() => setPlanFilter('completed')}
            >
              Completed ({plans.filter(p => p.status === 'completed' || p.progress === 100).length})
            </button>
          </div>

          {loading ? (
            <div className="plans-grid">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredPlans.length === 0 ? (
            <EmptyState
              icon="notes"
              title={planFilter === 'all' ? 'No Study Plans Yet' : `No ${planFilter} plans`}
              description={
                planFilter === 'all'
                  ? 'Create your first study plan to get started'
                  : 'Change the filter to see other plans'
              }
              size="lg"
              action={planFilter === 'all' ? {
                label: 'Create Plan',
                onClick: () => setView('input'),
              } : undefined}
            />
          ) : (
            <div className="plans-grid">
              {filteredPlans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => handleViewPlan(plan)}
                  className="plan-card"
                >
                  <div className="plan-header">
                    <div>
                      <h4 className="plan-title">{plan.title}</h4>
                      <div className="plan-date">Exam: {formatScheduleDate(plan.examDate)}</div>
                    </div>
                    <span className={`status-badge ${plan.status}`}>
                      {plan.status}
                    </span>
                  </div>

                  <div className="plan-progress">
                    <div className="progress-info">
                      <span>{plan.topics.length} topics</span>
                      <span>{plan.progress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${plan.progress === 100 ? 'complete' : ''}`}
                        style={{ width: `${plan.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .study-planner {
          padding: var(--space-4);
        }

        .planner-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-4);
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .planner-header h3 {
          margin: 0 0 var(--space-1) 0;
          font-size: var(--font-lg);
        }

        .planner-header p {
          margin: 0;
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .header-actions {
          display: flex;
          gap: var(--space-2);
        }

        .error-message {
          padding: var(--space-3);
          background: var(--error-muted);
          color: var(--error);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }

        /* Form Styles */
        .form-group {
          margin-bottom: var(--space-4);
        }

        .form-group label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .form-input {
          width: 100%;
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          background: var(--bg-surface);
        }

        .form-input:focus {
          outline: none;
          border-color: var(--primary);
        }

        .range-input {
          width: 100%;
        }

        .range-labels {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        /* Topic Card */
        .topic-card {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-2);
        }

        .topic-header {
          display: flex;
          gap: var(--space-2);
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .topic-input {
          flex: 1;
          padding: var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
        }

        .remove-topic-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: var(--error-muted);
          color: var(--error);
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: var(--font-meta);
        }

        .topic-meta {
          display: flex;
          gap: var(--space-4);
          align-items: center;
          flex-wrap: wrap;
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
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          color: var(--text-muted);
          padding: 0;
        }

        .star-btn.active {
          color: var(--warning);
        }

        .hours-input {
          width: 60px;
          padding: var(--space-1);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: var(--font-tiny);
          text-align: center;
        }

        .add-topic-btn {
          width: 100%;
          padding: var(--space-2);
          border: 1px dashed var(--border-subtle);
          background: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--font-meta);
          color: var(--primary);
        }

        .add-topic-btn:hover {
          background: var(--primary-muted);
        }

        .generate-btn {
          width: 100%;
          padding: var(--space-4);
          font-size: var(--font-body);
          font-weight: 600;
        }

        .tips-section {
          margin-top: var(--space-4);
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .tips-section h4 {
          margin: 0 0 var(--space-2) 0;
          font-size: var(--font-meta);
        }

        .tips-section ul {
          margin: 0;
          padding-left: var(--space-4);
        }

        .tips-section li {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          margin-bottom: var(--space-1);
        }

        /* Schedule View */
        .schedule-header {
          padding: var(--space-4);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .schedule-title h4 {
          margin: 0 0 var(--space-1) 0;
        }

        .schedule-dates {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .countdown-badge {
          padding: var(--space-2) var(--space-3);
          background: var(--primary-muted);
          color: var(--primary);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          font-weight: 600;
        }

        .countdown-badge.urgent {
          background: var(--error-muted);
          color: var(--error);
        }

        .progress-section {
          margin-bottom: var(--space-4);
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-tiny);
          margin-bottom: var(--space-1);
        }

        .progress-bar {
          height: 8px;
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--primary);
          transition: width 0.3s ease;
        }

        .progress-fill.complete {
          background: var(--success);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }

        .stat-card {
          padding: var(--space-3);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--card-radius);
          text-align: center;
          transition: border-color var(--transition-fast), box-shadow var(--transition-normal);
        }

        .stat-card:hover {
          border-color: var(--card-hover-border);
          box-shadow: var(--card-hover-shadow);
        }

        .stat-card.primary {
          background: var(--primary-muted);
          border-color: var(--primary);
        }

        .stat-card.warning {
          background: var(--warning-muted);
          border-color: var(--warning);
        }

        .stat-value {
          font-size: var(--font-lg);
          font-weight: 600;
        }

        .stat-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        /* Today Highlight */
        .today-highlight {
          padding: var(--space-4);
          background: var(--primary-muted);
          border: 2px solid var(--primary);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
        }

        .today-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-3);
        }

        .today-badge {
          font-weight: 600;
          color: var(--primary);
        }

        .start-timer-btn {
          font-size: var(--font-meta);
        }

        .today-topics {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .today-topic {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2);
          background: var(--bg-surface);
          border-radius: var(--radius-sm);
        }

        .task-badge {
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: var(--font-tiny);
          text-transform: capitalize;
        }

        .task-badge.learn {
          background: var(--primary-muted);
          color: var(--primary);
        }

        .task-badge.practice {
          background: var(--success-muted);
          color: var(--success);
        }

        .task-badge.review {
          background: var(--warning-muted);
          color: var(--warning);
        }

        /* View Controls */
        .view-controls {
          margin-bottom: var(--space-3);
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-meta);
          cursor: pointer;
        }

        /* Week Section */
        .week-section {
          margin-bottom: var(--space-3);
        }

        .week-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3);
          background: var(--bg-inset);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--font-meta);
          font-weight: 600;
        }

        .week-header:hover {
          background: var(--bg-elevated);
        }

        .week-title {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .revision-badge {
          font-size: var(--font-tiny);
          padding: 2px 6px;
          background: var(--warning-muted);
          color: var(--warning);
          border-radius: var(--radius-sm);
          font-weight: 600;
        }

        .week-progress {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-weight: normal;
          color: var(--text-muted);
        }

        .expand-icon {
          font-size: var(--font-tiny);
        }

        .week-days {
          padding: var(--space-2) 0;
        }

        /* Day Card */
        .day-card {
          padding: var(--space-3);
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--card-radius);
          margin-bottom: var(--space-2);
          transition: border-color var(--transition-fast), box-shadow var(--transition-normal);
        }

        .day-card:hover {
          border-color: var(--card-hover-border);
          box-shadow: var(--card-hover-shadow);
        }

        .day-card.completed {
          background: var(--success-muted);
          border-color: var(--success);
        }

        .day-card.revision {
          background: var(--warning-muted);
        }

        .day-card.today {
          border-color: var(--primary);
          border-width: 2px;
        }

        .day-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .day-info {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .checkbox {
          width: 20px;
          height: 20px;
          border: 2px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
        }

        .checkbox.checked {
          background: var(--success);
          border-color: var(--success);
        }

        .day-title {
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .today-tag {
          font-size: var(--font-tiny);
          padding: 1px 4px;
          background: var(--primary);
          color: white;
          border-radius: var(--radius-sm);
        }

        .day-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .day-duration {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .icon-btn {
          width: 28px;
          height: 28px;
          padding: 0;
          font-size: var(--font-meta);
        }

        .day-topics {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .topic-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2);
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
        }

        .topic-name {
          font-weight: 500;
        }

        .topic-meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .topic-duration {
          color: var(--text-muted);
          font-size: var(--font-tiny);
        }

        /* Day Notes */
        .day-notes {
          margin-top: var(--space-2);
          padding-top: var(--space-2);
          border-top: 1px solid var(--border-subtle);
        }

        .note-editor textarea {
          width: 100%;
          padding: var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: var(--font-tiny);
          resize: none;
          margin-bottom: var(--space-1);
        }

        .note-actions {
          display: flex;
          gap: var(--space-1);
        }

        .note-display {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          cursor: pointer;
          padding: var(--space-1);
        }

        .note-display:hover {
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
        }

        .add-note-btn {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }

        .add-note-btn:hover {
          color: var(--primary);
        }

        /* Schedule Actions */
        .schedule-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .danger {
          color: var(--error);
        }

        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: var(--space-4);
        }

        .modal-content {
          background: var(--bg-surface);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          max-width: 400px;
          width: 100%;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-4);
        }

        .modal-header h3 {
          margin: 0;
        }

        .close-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: var(--font-meta);
        }

        .export-options {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .export-btn {
          width: 100%;
        }

        .export-hint {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin: 0;
        }

        .export-divider {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin: var(--space-3) 0;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .export-divider::before,
        .export-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-subtle);
        }

        .quick-add-btns {
          display: flex;
          gap: var(--space-2);
        }

        .quick-add-btns .btn {
          flex: 1;
        }

        /* Saved View */
        .filter-tabs {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: var(--space-2);
        }

        .filter-tab {
          padding: var(--space-2) var(--space-3);
          border: none;
          background: none;
          cursor: pointer;
          font-size: var(--font-meta);
          color: var(--text-muted);
          border-radius: var(--radius-sm);
        }

        .filter-tab:hover {
          background: var(--bg-inset);
        }

        .filter-tab.active {
          background: var(--primary-muted);
          color: var(--primary);
          font-weight: 500;
        }

        .loading-state {
          text-align: center;
          padding: var(--space-6);
          color: var(--text-muted);
        }

        .empty-state {
          text-align: center;
          padding: var(--space-6);
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: var(--space-3);
        }

        .empty-state h4 {
          margin-bottom: var(--space-2);
        }

        .empty-state p {
          color: var(--text-muted);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }

        .plans-grid {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .plan-card {
          padding: var(--space-4);
          background: var(--card-bg);
          border-radius: var(--card-radius);
          cursor: pointer;
          border: 1px solid var(--card-border);
          transition: border-color var(--transition-fast), box-shadow var(--transition-normal);
        }

        .plan-card:hover {
          border-color: var(--card-hover-border);
          box-shadow: var(--card-hover-shadow);
        }

        .plan-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-2);
        }

        .plan-title {
          margin: 0 0 var(--space-1) 0;
        }

        .plan-date {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .status-badge {
          padding: 2px 8px;
          font-size: var(--font-tiny);
          border-radius: var(--radius-sm);
          text-transform: capitalize;
        }

        .status-badge.active {
          background: var(--primary-muted);
          color: var(--primary);
        }

        .status-badge.completed {
          background: var(--success-muted);
          color: var(--success);
        }

        .status-badge.paused {
          background: var(--warning-muted);
          color: var(--warning);
        }

        .plan-progress {
          margin-top: var(--space-2);
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-tiny);
          margin-bottom: var(--space-1);
        }

        /* Timer View */
        .timer-view {
          text-align: center;
        }

        .back-btn {
          margin-bottom: var(--space-4);
        }

        .timer-container {
          max-width: 400px;
          margin: 0 auto;
        }

        .timer-display {
          padding: var(--space-6);
          background: var(--bg-inset);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-4);
        }

        .timer-display.break {
          background: var(--success-muted);
        }

        .timer-label {
          font-size: var(--font-meta);
          color: var(--text-muted);
          margin-bottom: var(--space-2);
        }

        .timer-time {
          font-size: 64px;
          font-weight: 700;
          font-family: monospace;
          margin-bottom: var(--space-2);
        }

        .timer-sessions {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .timer-controls {
          display: flex;
          gap: var(--space-2);
          justify-content: center;
          margin-bottom: var(--space-4);
        }

        .timer-btn {
          min-width: 100px;
        }

        .timer-presets {
          display: flex;
          gap: var(--space-2);
          justify-content: center;
          align-items: center;
          margin-bottom: var(--space-4);
        }

        .preset-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .preset-btn {
          padding: var(--space-1) var(--space-2);
          border: 1px solid var(--border-subtle);
          background: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: var(--font-tiny);
        }

        .preset-btn.active {
          background: var(--primary-muted);
          border-color: var(--primary);
          color: var(--primary);
        }

        .timer-day-info {
          padding: var(--space-4);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          text-align: left;
        }

        .timer-day-info h4 {
          margin: 0 0 var(--space-2) 0;
          font-size: var(--font-meta);
        }

        .timer-topic {
          display: flex;
          justify-content: space-between;
          padding: var(--space-2);
          background: var(--bg-surface);
          border-radius: var(--radius-sm);
          margin-bottom: var(--space-1);
          font-size: var(--font-meta);
        }

        .btn.small {
          padding: var(--space-1) var(--space-2);
          font-size: var(--font-tiny);
        }

        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: var(--space-2);
          }

          .stat-card {
            padding: var(--space-2);
          }

          .stat-value {
            font-size: var(--font-body);
          }

          .timer-time {
            font-size: 48px;
          }
        }
      `}</style>
    </div>
  );
}
