'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStudyPlans } from '@/hooks/useStudyPlans';
import { PlanList, type PlanFilter } from '@/components/planner/PlanList';
import { PlanForm } from '@/components/planner/PlanForm';
import { CourseScheduleImporter, type ImportedCalendarEvent } from '@/components/planner/CourseScheduleImporter';
import { TimetableBuilder, type TimetableImportEvent } from '@/components/planner/TimetableBuilder';
import { generateStudySchedule } from '@/lib/planner/generate';
import type { StudyPlan } from '@/lib/planner/study-plan-types';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'study' | 'exam' | 'deadline' | 'class' | 'break' | 'revision';
type CalendarView = 'month' | 'week' | 'day' | 'agenda';

interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  description?: string;
  planId?: string;
  completed?: boolean;
  color?: string;
}

interface NewEventForm {
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<EventType, string> = {
  study:    '#4f86f7',
  exam:     '#e05252',
  deadline: '#e07a52',
  class:    '#52b788',
  break:    '#a78bfa',
  revision: '#f59e0b',
};

const EVENT_ICONS: Record<EventType, string> = {
  study:    '📚',
  exam:     '📝',
  deadline: '⏰',
  class:    '🎓',
  break:    '☕',
  revision: '🔄',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const LS_KEY = 'kivora-calendar-events';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDate(s: string): Date { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate()-r.getDay()); return r; }
function sameDay(a: Date, b: Date) { return toDateStr(a) === toDateStr(b); }

function loadEventsLocal(): CalendarEvent[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEventsLocal(events: CalendarEvent[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(events)); } catch { /* noop */ }
}

async function fetchEventsFromApi(): Promise<CalendarEvent[] | null> {
  try {
    const res = await fetch('/api/planner/events');
    if (!res.ok) return null;
    const rows = await res.json() as Array<Record<string, unknown>>;
    // Map DB column names back to camelCase interface
    return rows.map(r => ({
      id: r.id as string,
      title: r.title as string,
      type: r.type as CalendarEvent['type'],
      date: r.date as string,
      startTime: (r.startTime ?? r.start_time) as string,
      endTime: (r.endTime ?? r.end_time) as string,
      description: r.description as string | undefined,
      planId: (r.planId ?? r.plan_id) as string | undefined,
      completed: Boolean(r.completed),
      color: r.color as string | undefined,
    }));
  } catch { return null; }
}

async function apiCreateEvent(evt: CalendarEvent): Promise<void> {
  try {
    await fetch('/api/planner/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evt),
    });
  } catch { /* noop — localStorage already updated */ }
}

async function apiUpdateEvent(id: string, patch: Partial<CalendarEvent>): Promise<void> {
  try {
    await fetch(`/api/planner/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch { /* noop */ }
}

async function apiDeleteEvent(id: string): Promise<void> {
  try {
    await fetch(`/api/planner/events/${id}`, { method: 'DELETE' });
  } catch { /* noop */ }
}

function uid() { return `evt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function daysUntil(dateStr: string): number {
  const target = parseDate(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlannerPage() {
  useEffect(() => { document.title = 'Planner — Kivora'; }, []);
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalendarView>('week');
  const [cursor, setCursor] = useState<Date>(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [miniDate, setMiniDate] = useState<Date>(today);
  const [form, setForm] = useState<NewEventForm>({
    title: '', type: 'study', date: toDateStr(today),
    startTime: '09:00', endTime: '10:00', description: '',
  });
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; hour: number } | null>(null);
  const { plans, createPlan, deletePlan, fetchPlans, loading: plansLoading } = useStudyPlans();
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Re-fetch from server when filter changes
  useEffect(() => {
    void fetchPlans(planFilter === 'all' ? undefined : planFilter);
  // fetchPlans is stable (useCallback with no deps); planFilter drives the refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planFilter]);

  // Load from API (falling back to localStorage) + inject from study plans
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const apiEvents = await fetchEventsFromApi();
      if (cancelled) return;
      // If API returned data, sync to localStorage cache
      if (apiEvents !== null) {
        saveEventsLocal(apiEvents);
      }
      const stored = apiEvents ?? loadEventsLocal();
      const stored_ids = new Set(stored.map(e => e.id));

    // Inject schedule days from study plans as events
    const planEvents: CalendarEvent[] = [];
    for (const plan of plans) {
      for (const day of plan.schedule?.days ?? []) {
        if (!day.date) continue;
        const evtId = `plan_${plan.id}_${day.date}`;
        if (stored_ids.has(evtId)) continue;
        const topicNames = day.topics?.map((t: { name: string }) => t.name).join(', ') || plan.title;
        planEvents.push({
          id: evtId,
          title: topicNames,
          type: day.isRevision ? 'revision' : 'study',
          date: day.date,
          startTime: '09:00',
          endTime: `${9 + Math.ceil((day.totalMinutes ?? 60)/60)}:00`.padStart(5,'0').slice(-5),
          description: `Study plan: ${plan.title}`,
          planId: plan.id,
          completed: day.completed,
        });
      }
      // Add exam event
      if (plan.schedule?.endDate) {
        const examId = `exam_${plan.id}`;
        if (!stored_ids.has(examId)) {
          planEvents.push({
            id: examId,
            title: `📝 Exam: ${plan.title}`,
            type: 'exam',
            date: plan.schedule.endDate,
            startTime: '09:00',
            endTime: '12:00',
            planId: plan.id,
          });
        }
      }
    }
      setEvents([...stored, ...planEvents]);
    })();
    return () => { cancelled = true; };
  }, [plans]);

  const persistEvents = useCallback((updated: CalendarEvent[]) => {
    // Only persist user-created events (not plan-injected)
    const toSave = updated.filter(e => !e.id.startsWith('plan_') && !e.id.startsWith('exam_'));
    saveEventsLocal(toSave);
    setEvents(updated);
  }, []);

  const importEvents = useCallback((imported: Array<ImportedCalendarEvent | TimetableImportEvent>) => {
    const newEvents = imported.filter((incoming) => !events.some((existing) => existing.id === incoming.id));
    if (newEvents.length === 0) return;
    const updated = [...events, ...newEvents];
    persistEvents(updated);
    void Promise.all(newEvents.map((event) => apiCreateEvent(event as Parameters<typeof apiCreateEvent>[0])));
  }, [events, persistEvents]);

  // Scroll week view to 8am on mount
  useEffect(() => {
    if (view === 'week' || view === 'day') {
      setTimeout(() => {
        if (weekScrollRef.current) {
          weekScrollRef.current.scrollTop = 8 * 56;
        }
      }, 50);
    }
  }, [view]);

  const eventsForDate = useCallback((dateStr: string) => {
    return events.filter(e => e.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events]);

  const openNewEvent = useCallback((date?: string, startTime?: string) => {
    setEditingEvent(null);
    setForm({
      title: '', type: 'study',
      date: date ?? toDateStr(cursor),
      startTime: startTime ?? '09:00',
      endTime: startTime ? `${String(parseInt(startTime.split(':')[0])+1).padStart(2,'0')}:00` : '10:00',
      description: '',
    });
    setShowModal(true);
  }, [cursor]);

  const openEditEvent = useCallback((evt: CalendarEvent) => {
    setEditingEvent(evt);
    setForm({
      title: evt.title, type: evt.type,
      date: evt.date, startTime: evt.startTime, endTime: evt.endTime,
      description: evt.description ?? '',
    });
    setSelectedEvent(null);
    setShowModal(true);
  }, []);

  const saveEvent = useCallback(() => {
    if (!form.title.trim()) return;
    if (editingEvent) {
      const patch = { ...form, title: form.title.trim() };
      const updated = events.map(e => e.id === editingEvent.id ? { ...e, ...patch } : e);
      persistEvents(updated);
      void apiUpdateEvent(editingEvent.id, patch);
    } else {
      const newEvt: CalendarEvent = { id: uid(), ...form, title: form.title.trim() };
      persistEvents([...events, newEvt]);
      void apiCreateEvent(newEvt);
    }
    setShowModal(false);
  }, [form, editingEvent, events, persistEvents]);

  const deleteEvent = useCallback((id: string) => {
    persistEvents(events.filter(e => e.id !== id));
    setSelectedEvent(null);
    void apiDeleteEvent(id);
  }, [events, persistEvents]);

  const toggleComplete = useCallback((id: string) => {
    const evt = events.find(e => e.id === id);
    const newCompleted = !evt?.completed;
    const updated = events.map(e => e.id === id ? { ...e, completed: newCompleted } : e);
    persistEvents(updated);
    setSelectedEvent(prev => prev?.id === id ? { ...prev, completed: newCompleted } : prev);
    void apiUpdateEvent(id, { completed: newCompleted });
  }, [events, persistEvents]);

  const onEventDrop = useCallback((eventId: string, newDate: string, newHour: number) => {
    setDragOverSlot(null);
    setEvents(prev => {
      const updated = prev.map(e => {
        if (e.id !== eventId) return e;
        const [sh, sm] = e.startTime.split(':').map(Number);
        const [eh, em] = e.endTime.split(':').map(Number);
        const durationMins = (eh * 60 + em) - (sh * 60 + sm);
        const newStart = `${pad(newHour)}:00`;
        const endTotalMins = newHour * 60 + durationMins;
        const newEnd = `${pad(Math.floor(endTotalMins / 60) % 24)}:${pad(endTotalMins % 60)}`;
        return { ...e, date: newDate, startTime: newStart, endTime: newEnd };
      });
      const toSave = updated.filter(e => !e.id.startsWith('plan_') && !e.id.startsWith('exam_'));
      saveEventsLocal(toSave);
      const dropped = updated.find(e => e.id === eventId);
      if (dropped && !eventId.startsWith('plan_') && !eventId.startsWith('exam_')) {
        void apiUpdateEvent(eventId, { date: dropped.date, startTime: dropped.startTime, endTime: dropped.endTime });
      }
      return updated;
    });
  }, []);

  // Upcoming exams for sidebar countdown
  const upcomingExams = useMemo(() => {
    const todayStr = toDateStr(today);
    return events
      .filter(e => e.type === 'exam' && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  }, [events, today]);

  // Today events
  const todayEvents = useMemo(() => eventsForDate(toDateStr(today)), [eventsForDate, today]);

  // Navigation
  const goToday = () => { setCursor(new Date(today)); setMiniDate(new Date(today)); };
  const navPrev = () => {
    if (view === 'month') setCursor(d => { const r = new Date(d); r.setMonth(r.getMonth()-1); return r; });
    else if (view === 'week') setCursor(d => addDays(d, -7));
    else setCursor(d => addDays(d, -1));
  };
  const navNext = () => {
    if (view === 'month') setCursor(d => { const r = new Date(d); r.setMonth(r.getMonth()+1); return r; });
    else if (view === 'week') setCursor(d => addDays(d, 7));
    else setCursor(d => addDays(d, 1));
  };

  const navLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week') {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth())
        return `${MONTHS[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`;
      return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${ws.getFullYear()}`;
    }
    return `${DAYS[cursor.getDay()]}, ${MONTHS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`;
  }, [view, cursor]);

  return (
    <>
      <TimetableBuilder onImport={importEvents} />
      <div className="cal-shell">

      {/* ── Left Sidebar ────────────────────────────────────────────── */}
      <aside className="cal-sidebar">
        <button className="new-event-btn" onClick={() => openNewEvent()}>
          <span>＋</span> New Event
        </button>

        {/* Mini calendar */}
        <MiniCalendar
          date={miniDate}
          today={today}
          events={events}
          onDateClick={(d) => { setCursor(new Date(d)); if (view === 'month') setView('week'); }}
          onNavMonth={(delta) => setMiniDate(d => { const r = new Date(d); r.setMonth(r.getMonth()+delta); return r; })}
        />

        {/* Event type legend */}
        <div className="sidebar-section">
          <p className="sidebar-label">Event Types</p>
          <div className="legend">
            {(Object.entries(EVENT_COLORS) as [EventType, string][]).map(([type, color]) => (
              <div key={type} className="legend-item">
                <span className="legend-dot" style={{ background: color }} />
                <span>{EVENT_ICONS[type]} {type.charAt(0).toUpperCase()+type.slice(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exam countdowns */}
        {upcomingExams.length > 0 && (
          <div className="sidebar-section">
            <p className="sidebar-label">Exam Countdowns</p>
            {upcomingExams.map(exam => {
              const d = daysUntil(exam.date);
              return (
                <div key={exam.id} className="countdown-item" onClick={() => { setCursor(parseDate(exam.date)); setView('day'); }}>
                  <div className="countdown-title">{exam.title.replace('📝 Exam: ','')}</div>
                  <div className="countdown-days" style={{ color: d <= 3 ? '#e05252' : d <= 7 ? '#e07a52' : 'var(--primary)' }}>
                    {d === 0 ? 'Today!' : d < 0 ? 'Passed' : `${d}d`}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Today's agenda */}
        <div className="sidebar-section">
          <p className="sidebar-label">Today</p>
          {todayEvents.length === 0
            ? <p className="sidebar-empty">No events today</p>
            : todayEvents.map(evt => (
              <div
                key={evt.id}
                className="today-item"
                style={{ borderLeft: `3px solid ${EVENT_COLORS[evt.type]}` }}
                onClick={() => setSelectedEvent(evt)}
              >
                <span className="today-time">{evt.startTime}</span>
                <span className="today-title" style={{ textDecoration: evt.completed ? 'line-through' : 'none' }}>{evt.title}</span>
              </div>
            ))
          }
        </div>

        {/* Study Plans section */}
        <div className="sidebar-section sidebar-section-plans">
          <PlanList
            plans={plans}
            loading={plansLoading}
            filter={planFilter}
            onFilterChange={setPlanFilter}
            selectedPlanId={selectedPlanId}
            onSelectPlan={(plan: StudyPlan) => {
              setSelectedPlanId(plan.id);
              // Jump calendar to exam date
              const examD = new Date(plan.examDate);
              setCursor(examD);
              setMiniDate(examD);
            }}
            onNewPlan={() => setShowPlanForm(true)}
            onDeletePlan={(planId: string) => { void deletePlan(planId); }}
          />
        </div>
      </aside>

      {/* ── Main Calendar ────────────────────────────────────────────── */}
      <main className="cal-main">
        {/* Header */}
        <header className="cal-header">
          <div className="cal-nav">
            <button className="nav-btn today-btn" onClick={goToday}>Today</button>
            <button className="nav-btn icon-btn" onClick={navPrev}>‹</button>
            <button className="nav-btn icon-btn" onClick={navNext}>›</button>
            <h2 className="cal-title">{navLabel}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="import-schedule-btn" onClick={() => setShowImportModal(true)} title="Import course schedule from text">
              Import Schedule
            </button>
            <div className="view-switcher">
              {(['month','week','day','agenda'] as CalendarView[]).map(v => (
                <button
                  key={v}
                  className={`view-btn${view === v ? ' active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v.charAt(0).toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Views */}
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            today={today}
            events={events}
            onDayClick={(d) => { setCursor(parseDate(d)); setView('day'); }}
            onEventClick={setSelectedEvent}
            onCellDblClick={(d) => openNewEvent(d)}
            onEventDrop={onEventDrop}
          />
        )}
        {view === 'week' && (
          <WeekView
            cursor={cursor}
            today={today}
            events={events}
            scrollRef={weekScrollRef}
            onEventClick={setSelectedEvent}
            onSlotClick={(d, t) => openNewEvent(d, t)}
            dragOverSlot={dragOverSlot}
            onDragOverSlot={setDragOverSlot}
            onDragLeaveSlot={() => setDragOverSlot(null)}
            onEventDrop={onEventDrop}
          />
        )}
        {view === 'day' && (
          <DayView
            date={cursor}
            today={today}
            events={events}
            scrollRef={weekScrollRef}
            onEventClick={setSelectedEvent}
            onSlotClick={(t) => openNewEvent(toDateStr(cursor), t)}
            dragOverSlot={dragOverSlot}
            onDragOverSlot={setDragOverSlot}
            onDragLeaveSlot={() => setDragOverSlot(null)}
            onEventDrop={onEventDrop}
          />
        )}
        {view === 'agenda' && (
          <AgendaView
            cursor={cursor}
            events={events}
            onEventClick={setSelectedEvent}
          />
        )}
      </main>

      {/* ── Event Detail Panel ───────────────────────────────────────── */}
      {selectedEvent && (
        <div className="detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-header" style={{ background: EVENT_COLORS[selectedEvent.type] }}>
              <span className="detail-icon">{EVENT_ICONS[selectedEvent.type]}</span>
              <div>
                <div className="detail-type">{selectedEvent.type}</div>
                <h3 className="detail-title">{selectedEvent.title}</h3>
              </div>
              <button className="detail-close" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="detail-row">
                <span className="detail-lbl">📅</span>
                <span>{parseDate(selectedEvent.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>
              </div>
              <div className="detail-row">
                <span className="detail-lbl">⏱️</span>
                <span>{selectedEvent.startTime} – {selectedEvent.endTime}</span>
              </div>
              {selectedEvent.description && (
                <div className="detail-row">
                  <span className="detail-lbl">📋</span>
                  <span>{selectedEvent.description}</span>
                </div>
              )}
              <div className="detail-actions">
                <button
                  className="det-btn complete"
                  onClick={() => toggleComplete(selectedEvent.id)}
                >
                  {selectedEvent.completed ? '↩ Unmark' : '✓ Done'}
                </button>
                {!selectedEvent.id.startsWith('plan_') && !selectedEvent.id.startsWith('exam_') && (
                  <>
                    <button className="det-btn edit" onClick={() => openEditEvent(selectedEvent)}>✏️ Edit</button>
                    <button className="det-btn delete" onClick={() => deleteEvent(selectedEvent.id)}>🗑 Delete</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Event Create/Edit Modal ──────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEvent ? 'Edit Event' : 'New Event'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="field-label">Title</label>
              <input
                className="field-input"
                placeholder="Event title…"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && saveEvent()}
              />

              <label className="field-label">Type</label>
              <div className="type-picker">
                {(Object.keys(EVENT_COLORS) as EventType[]).map(t => (
                  <button
                    key={t}
                    className={`type-opt${form.type === t ? ' active' : ''}`}
                    style={form.type === t ? { background: EVENT_COLORS[t], color: '#fff', borderColor: EVENT_COLORS[t] } : {}}
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                  >
                    {EVENT_ICONS[t]} {t}
                  </button>
                ))}
              </div>

              <label className="field-label">Date</label>
              <input
                className="field-input"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />

              <div className="time-row">
                <div>
                  <label className="field-label">Start</label>
                  <input className="field-input" type="time" value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">End</label>
                  <input className="field-input" type="time" value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              <label className="field-label">Notes (optional)</label>
              <textarea
                className="field-input field-textarea"
                placeholder="Add notes…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="modal-btn save" onClick={saveEvent} disabled={!form.title.trim()}>
                {editingEvent ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Course Schedule Importer ─────────────────────────────────── */}
      {showImportModal && (
        <CourseScheduleImporter
          onClose={() => setShowImportModal(false)}
          onImport={importEvents}
        />
      )}

      {/* ── Study Plan Form Modal ────────────────────────────────────── */}
      {showPlanForm && (
        <div className="modal-overlay" onClick={() => setShowPlanForm(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <PlanForm
              onGenerate={async ({ title, examDate, dailyMinutes, topics, folderId }) => {
                const schedule = generateStudySchedule(new Date(examDate), topics, dailyMinutes);
                const newPlan = await createPlan({ title, examDate, dailyMinutes, topics, schedule, folderId });
                if (newPlan) {
                  setSelectedPlanId(newPlan.id);
                  setShowPlanForm(false);
                }
              }}
              onCancel={() => setShowPlanForm(false)}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        /* ── Shell ─────────────────────────────────────────────────── */
        .cal-shell {
          display: grid;
          grid-template-columns: 260px minmax(0,1fr);
          height: calc(100dvh - 40px);
          overflow: hidden;
          background: var(--bg-surface);
        }

        /* ── Sidebar ───────────────────────────────────────────────── */
        .cal-sidebar {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 16px 12px;
          border-right: 1px solid var(--border-subtle);
          overflow-y: auto;
          background: var(--bg-elevated);
        }
        .new-event-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 10px 16px;
          border-radius: 24px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          margin-bottom: 16px;
          transition: all 0.15s;
          box-shadow: var(--shadow-sm);
        }
        .new-event-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
          box-shadow: var(--shadow-md);
        }
        .sidebar-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border-subtle);
        }
        .sidebar-section-plans {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .sidebar-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin: 0 0 8px;
        }
        .legend { display: flex; flex-direction: column; gap: 5px; }
        .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

        .countdown-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 8px; border-radius: 8px; cursor: pointer;
          margin-bottom: 4px; transition: background 0.12s;
        }
        .countdown-item:hover { background: var(--bg-surface); }
        .countdown-title { font-size: 12px; color: var(--text-secondary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .countdown-days { font-size: 14px; font-weight: 700; margin-left: 8px; flex-shrink: 0; }

        .today-item {
          display: flex; align-items: baseline; gap: 8px; padding: 5px 6px;
          border-radius: 6px; cursor: pointer; transition: background 0.12s; margin-bottom: 2px;
        }
        .today-item:hover { background: var(--bg-surface); }
        .today-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; min-width: 38px; }
        .today-title { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sidebar-empty { font-size: 12px; color: var(--text-muted); }

        /* ── Main ──────────────────────────────────────────────────── */
        .cal-main {
          display: flex; flex-direction: column; overflow: hidden;
        }
        .cal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 20px; border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated); flex-shrink: 0;
        }
        .cal-nav { display: flex; align-items: center; gap: 8px; }
        .cal-title { font-size: 18px; font-weight: 600; margin: 0; margin-left: 8px; }
        .nav-btn {
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); cursor: pointer;
          color: var(--text-secondary); transition: all 0.12s;
          font-size: 14px; font-weight: 500; padding: 6px 12px;
        }
        .nav-btn:hover { border-color: var(--primary); color: var(--primary); }
        .icon-btn { padding: 4px 10px; font-size: 18px; }
        .today-btn { background: var(--bg-elevated); }
        .view-switcher { display: flex; gap: 2px; background: var(--bg-surface); border-radius: 10px; padding: 3px; border: 1px solid var(--border-subtle); }
        .view-btn {
          padding: 5px 14px; border-radius: 8px; border: none;
          background: transparent; color: var(--text-secondary);
          font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .view-btn.active { background: var(--primary); color: white; }
        .view-btn:hover:not(.active) { color: var(--text-primary); }
        .import-schedule-btn {
          padding: 5px 12px; border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          font-size: 12px; font-weight: 600; cursor: pointer;
          transition: all 0.12s; white-space: nowrap;
        }
        .import-schedule-btn:hover { border-color: var(--primary); color: var(--primary); }

        /* ── Detail panel ──────────────────────────────────────────── */
        .detail-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.35); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .detail-panel {
          background: var(--bg-elevated); border-radius: 20px;
          width: 360px; max-width: 90vw; overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3);
        }
        .detail-header {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 20px 20px 16px; color: white; position: relative;
        }
        .detail-icon { font-size: 24px; flex-shrink: 0; }
        .detail-type { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.85; }
        .detail-title { font-size: 18px; font-weight: 600; margin: 2px 0 0; line-height: 1.3; }
        .detail-close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(255,255,255,0.2); border: none; color: white;
          width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          font-size: 13px; display: flex; align-items: center; justify-content: center;
        }
        .detail-body { padding: 16px 20px 20px; }
        .detail-row { display: flex; gap: 10px; margin-bottom: 10px; font-size: 14px; color: var(--text-secondary); align-items: flex-start; }
        .detail-lbl { flex-shrink: 0; }
        .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
        .det-btn {
          padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); cursor: pointer; font-size: 13px; font-weight: 500;
          color: var(--text-secondary); transition: all 0.12s;
        }
        .det-btn:hover { border-color: var(--primary); color: var(--primary); }
        .det-btn.delete:hover { border-color: #e05252; color: #e05252; }
        .det-btn.complete { background: var(--primary); color: white; border-color: var(--primary); }

        /* ── Modal ─────────────────────────────────────────────────── */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
        }
        .modal {
          background: var(--bg-elevated); border-radius: 20px;
          width: 460px; max-width: 94vw; max-height: 90vh; overflow-y: auto;
          box-shadow: 0 32px 80px rgba(0,0,0,0.35);
          animation: modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .modal-wide {
          width: 620px; padding: 24px;
        }
        @keyframes modalIn {
          from { transform: scale(0.88) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 0;
        }
        .modal-header h3 { margin: 0; font-size: 18px; font-weight: 600; }
        .modal-close {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 50%; width: 30px; height: 30px; cursor: pointer;
          font-size: 13px; display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
        }
        .modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; }
        .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 10px; margin-bottom: 4px; display: block; }
        .field-input {
          width: 100%; padding: 9px 12px; border-radius: 10px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-primary);
          font-size: 14px; box-sizing: border-box; transition: border-color 0.15s;
        }
        .field-input:focus { outline: none; border-color: var(--primary); }
        .field-textarea { resize: vertical; min-height: 80px; font-family: inherit; }
        .type-picker { display: flex; flex-wrap: wrap; gap: 6px; }
        .type-opt {
          padding: 5px 12px; border-radius: 20px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; cursor: pointer; transition: all 0.12s; font-weight: 500;
        }
        .type-opt:hover:not(.active) { border-color: var(--primary); color: var(--primary); }
        .time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .modal-footer {
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          padding: 12px 20px 20px; border-top: 1px solid var(--border-subtle);
        }
        .modal-btn {
          padding: 9px 20px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.12s;
        }
        .modal-btn.cancel { background: var(--bg-surface); color: var(--text-secondary); }
        .modal-btn.cancel:hover { border-color: var(--primary); color: var(--primary); }
        .modal-btn.save { background: var(--primary); color: white; border-color: var(--primary); }
        .modal-btn.save:hover { opacity: 0.88; }
        .modal-btn.save:disabled { opacity: 0.4; cursor: not-allowed; }

        @media (max-width: 768px) {
          .cal-shell { grid-template-columns: 1fr; }
          .cal-sidebar { display: none; }
        }
      `}</style>
      </div>
    </>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({
  date, today, events, onDateClick, onNavMonth,
}: {
  date: Date; today: Date; events: CalendarEvent[];
  onDateClick: (d: string) => void; onNavMonth: (delta: number) => void;
}) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventDateSet = useMemo(() => new Set(events.map(e => e.date)), [events]);

  return (
    <div className="mini-cal">
      <div className="mini-nav">
        <button className="mini-nav-btn" onClick={() => onNavMonth(-1)}>‹</button>
        <span className="mini-nav-title">{MONTHS[month].slice(0,3)} {year}</span>
        <button className="mini-nav-btn" onClick={() => onNavMonth(1)}>›</button>
      </div>
      <div className="mini-grid">
        {DAYS.map(d => <div key={d} className="mini-hdr">{d[0]}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = `${year}-${pad(month+1)}-${pad(day)}`;
          const isToday = sameDay(new Date(year,month,day), today);
          const hasEvt = eventDateSet.has(ds);
          return (
            <button
              key={i}
              className={`mini-day${isToday ? ' today' : ''}`}
              onClick={() => onDateClick(ds)}
            >
              {day}
              {hasEvt && <span className="mini-dot" />}
            </button>
          );
        })}
      </div>
      <style jsx>{`
        .mini-cal { margin-bottom: 4px; }
        .mini-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .mini-nav-btn { background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:16px; padding:2px 6px; border-radius:6px; }
        .mini-nav-btn:hover { color:var(--primary); }
        .mini-nav-title { font-size:13px; font-weight:600; color:var(--text-primary); }
        .mini-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; }
        .mini-hdr { text-align:center; font-size:10px; font-weight:700; color:var(--text-muted); padding:3px 0; text-transform:uppercase; }
        .mini-day {
          position:relative; display:flex; align-items:center; justify-content:center;
          aspect-ratio:1; font-size:11px; border:none; background:none; cursor:pointer;
          border-radius:50%; color:var(--text-secondary); transition:all 0.1s;
        }
        .mini-day:hover { background:var(--bg-surface); color:var(--text-primary); }
        .mini-day.today { background:var(--primary); color:white; font-weight:700; }
        .mini-dot { position:absolute; bottom:1px; left:50%; transform:translateX(-50%); width:4px; height:4px; border-radius:50%; background:var(--primary); }
        .mini-day.today .mini-dot { background:white; }
      `}</style>
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────

function MonthView({ cursor, today, events, onDayClick, onEventClick, onCellDblClick, onEventDrop }: {
  cursor: Date; today: Date; events: CalendarEvent[];
  onDayClick: (d: string) => void;
  onEventClick: (e: CalendarEvent) => void;
  onCellDblClick: (d: string) => void;
  onEventDrop: (eventId: string, newDate: string, newHour: number) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    }
    return map;
  }, [events]);

  return (
    <div className="month-grid">
      {DAYS.map(d => <div key={d} className="month-hdr">{d}</div>)}
      {cells.map((day, i) => {
        if (!day) return <div key={i} className="month-cell empty" />;
        const ds = `${year}-${pad(month+1)}-${pad(day)}`;
        const isToday = sameDay(new Date(year,month,day), today);
        const isDragOver = dragOverDate === ds;
        const dayEvts = eventsByDate[ds] ?? [];
        return (
          <div
            key={i}
            className={`month-cell${isToday ? ' today' : ''}${isDragOver ? ' drag-over' : ''}`}
            onClick={() => onDayClick(ds)}
            onDoubleClick={() => onCellDblClick(ds)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverDate(ds); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDate(null);
              const eventId = e.dataTransfer.getData('eventId');
              const origHour = parseInt(e.dataTransfer.getData('origHour') || '9', 10);
              if (eventId) onEventDrop(eventId, ds, origHour);
            }}
          >
            <span className="month-day-num">{day}</span>
            <div className="month-evts">
              {dayEvts.slice(0,3).map(evt => (
                <div
                  key={evt.id}
                  className="month-evt"
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('eventId', evt.id);
                    const [sh] = evt.startTime.split(':').map(Number);
                    e.dataTransfer.setData('origHour', String(sh));
                    e.dataTransfer.effectAllowed = 'move';
                    e.stopPropagation();
                  }}
                  style={{
                    background: EVENT_COLORS[evt.type]+'22',
                    borderLeft: `3px solid ${EVENT_COLORS[evt.type]}`,
                    textDecoration: evt.completed ? 'line-through' : 'none',
                    cursor: 'grab',
                  }}
                  onClick={e => { e.stopPropagation(); onEventClick(evt); }}
                >
                  {evt.title}
                </div>
              ))}
              {dayEvts.length > 3 && (
                <div className="month-more">+{dayEvts.length-3} more</div>
              )}
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .month-grid {
          flex: 1; display:grid; grid-template-columns:repeat(7,1fr);
          grid-auto-rows: minmax(100px,1fr); overflow:auto;
          border-top: 1px solid var(--border-subtle);
        }
        .month-hdr {
          padding:8px; text-align:center; font-size:11px; font-weight:700;
          text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);
          background:var(--bg-elevated); border-bottom:1px solid var(--border-subtle);
          position:sticky; top:0; z-index:1;
        }
        .month-cell {
          padding:6px; border-right:1px solid var(--border-subtle);
          border-bottom:1px solid var(--border-subtle); cursor:pointer;
          transition:background 0.1s; min-height:100px; vertical-align:top;
        }
        .month-cell:hover { background:var(--bg-elevated); }
        .month-cell.drag-over { background:rgba(99,102,241,0.1); outline:2px dashed rgba(99,102,241,0.4); outline-offset:-2px; }
        .month-cell.empty { background:var(--bg-surface); cursor:default; opacity:0.4; }
        .month-cell.today { background:color-mix(in srgb, var(--primary) 6%, var(--bg-surface)); }
        .month-day-num {
          display:inline-flex; align-items:center; justify-content:center;
          width:24px; height:24px; border-radius:50%; font-size:13px; font-weight:500;
          color:var(--text-secondary);
        }
        .month-cell.today .month-day-num {
          background:var(--primary); color:white; font-weight:700;
        }
        .month-evts { display:flex; flex-direction:column; gap:2px; margin-top:2px; }
        .month-evt {
          font-size:11px; padding:2px 6px; border-radius:4px;
          color:var(--text-secondary); white-space:nowrap; overflow:hidden;
          text-overflow:ellipsis; cursor:grab;
        }
        .month-evt:hover { filter:brightness(0.9); }
        .month-more { font-size:11px; color:var(--text-muted); padding:1px 4px; }
      `}</style>
    </div>
  );
}

// ─── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ cursor, today, events, scrollRef, onEventClick, onSlotClick, dragOverSlot, onDragOverSlot, onDragLeaveSlot, onEventDrop }: {
  cursor: Date; today: Date; events: CalendarEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
  dragOverSlot: { date: string; hour: number } | null;
  onDragOverSlot: (slot: { date: string; hour: number }) => void;
  onDragLeaveSlot: () => void;
  onEventDrop: (eventId: string, newDate: string, newHour: number) => void;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({length:7}, (_,i) => addDays(weekStart, i));

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    }
    return map;
  }, [events]);

  return (
    <div className="week-root">
      <div className="week-header">
        <div className="time-gutter" />
        {days.map(d => {
          const isToday = sameDay(d, today);
          return (
            <div key={d.getTime()} className={`week-day-hdr${isToday ? ' today' : ''}`}>
              <span className="wdh-name">{DAYS[d.getDay()]}</span>
              <span className={`wdh-num${isToday ? ' today' : ''}`}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="week-body" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="week-grid">
          {/* Hour rows */}
          {HOURS.map(h => (
            <div key={h} className="hour-row">
              <div className="time-label">{h === 0 ? '' : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`}</div>
              {days.map(d => {
                const ds = toDateStr(d);
                const t = `${pad(h)}:00`;
                const isOver = dragOverSlot?.date === ds && dragOverSlot?.hour === h;
                return (
                  <div
                    key={ds}
                    className="hour-cell"
                    data-date={ds}
                    data-hour={h}
                    style={isOver ? { background: 'rgba(99,102,241,0.12)' } : undefined}
                    onClick={() => onSlotClick(ds, t)}
                    onDragOver={(e) => { e.preventDefault(); onDragOverSlot({ date: ds, hour: h }); }}
                    onDragLeave={onDragLeaveSlot}
                    onDrop={(e) => {
                      e.preventDefault();
                      const eventId = e.dataTransfer.getData('eventId');
                      if (eventId) onEventDrop(eventId, ds, h);
                    }}
                  />
                );
              })}
            </div>
          ))}
          {/* Events overlay */}
          {days.map(d => {
            const ds = toDateStr(d);
            const dayEvts = eventsByDate[ds] ?? [];
            return dayEvts.map(evt => {
              const [sh, sm] = evt.startTime.split(':').map(Number);
              const [eh, em] = evt.endTime.split(':').map(Number);
              const top = (sh + sm/60) * 56;
              const height = Math.max(((eh + em/60) - (sh + sm/60)) * 56, 20);
              const dayIndex = days.findIndex(x => toDateStr(x) === ds);
              return (
                <div
                  key={evt.id}
                  className="week-evt"
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('eventId', evt.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  style={{
                    top, height,
                    left: `calc(60px + (100% - 60px) * ${dayIndex} / 7 + 3px)`,
                    width: `calc((100% - 60px) / 7 - 6px)`,
                    background: EVENT_COLORS[evt.type]+'dd',
                    textDecoration: evt.completed ? 'line-through' : 'none',
                    cursor: 'grab',
                  }}
                  onClick={() => onEventClick(evt)}
                >
                  <span className="we-title">{evt.title}</span>
                  <span className="we-time">{evt.startTime}–{evt.endTime}</span>
                </div>
              );
            });
          })}
        </div>
      </div>
      <style jsx>{`
        .week-root { display:flex; flex-direction:column; flex:1; overflow:hidden; }
        .week-header {
          display:grid; grid-template-columns: 60px repeat(7,1fr);
          border-bottom: 1px solid var(--border-subtle); background:var(--bg-elevated);
          flex-shrink:0;
        }
        .time-gutter { border-right:1px solid var(--border-subtle); }
        .week-day-hdr {
          display:flex; flex-direction:column; align-items:center; gap:2px;
          padding:8px 4px; border-right:1px solid var(--border-subtle);
        }
        .week-day-hdr.today { background:color-mix(in srgb, var(--primary) 8%, var(--bg-elevated)); }
        .wdh-name { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); }
        .wdh-num {
          display:flex; align-items:center; justify-content:center;
          width:28px; height:28px; border-radius:50%; font-size:15px; font-weight:500;
          color:var(--text-secondary);
        }
        .wdh-num.today { background:var(--primary); color:white; font-weight:700; }
        .week-body { flex:1; overflow-y:auto; position:relative; }
        .week-grid { position:relative; }
        .hour-row { display:grid; grid-template-columns: 60px repeat(7,1fr); height:56px; }
        .time-label {
          border-right:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle);
          padding:0 8px; font-size:11px; color:var(--text-muted);
          display:flex; align-items:flex-start; padding-top:4px; justify-content:flex-end;
        }
        .hour-cell {
          border-right:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle);
          cursor:pointer; transition:background 0.1s;
        }
        .hour-cell:hover { background:var(--bg-elevated); }
        .week-evt {
          position:absolute; border-radius:6px; padding:3px 6px;
          color:white; font-size:11px; cursor:pointer; z-index:5;
          overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.2);
          display:flex; flex-direction:column; gap:1px; transition:filter 0.1s;
        }
        .week-evt:hover { filter:brightness(1.1); z-index:6; }
        .we-title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .we-time { font-size:10px; opacity:0.85; }
      `}</style>
    </div>
  );
}

// ─── Day View ──────────────────────────────────────────────────────────────────

function DayView({ date, today, events, scrollRef, onEventClick, onSlotClick, dragOverSlot, onDragOverSlot, onDragLeaveSlot, onEventDrop }: {
  date: Date; today: Date; events: CalendarEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (time: string) => void;
  dragOverSlot: { date: string; hour: number } | null;
  onDragOverSlot: (slot: { date: string; hour: number }) => void;
  onDragLeaveSlot: () => void;
  onEventDrop: (eventId: string, newDate: string, newHour: number) => void;
}) {
  const ds = toDateStr(date);
  const isToday = sameDay(date, today);
  const dayEvts = events.filter(e => e.date === ds).sort((a,b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="day-root">
      <div className="day-header">
        <span className="day-name">{DAYS[date.getDay()]}</span>
        <span className={`day-num${isToday ? ' today' : ''}`}>{date.getDate()}</span>
        <span className="day-month">{MONTHS[date.getMonth()]} {date.getFullYear()}</span>
        {dayEvts.length > 0 && <span className="day-count">{dayEvts.length} event{dayEvts.length!==1?'s':''}</span>}
      </div>
      <div className="day-body" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="day-grid">
          {HOURS.map(h => {
            const isOver = dragOverSlot?.date === ds && dragOverSlot?.hour === h;
            return (
              <div key={h} className="day-hour-row">
                <div className="day-time-lbl">{h === 0 ? '' : `${h%12||12}${h<12?'am':'pm'}`}</div>
                <div
                  className="day-slot"
                  data-hour={h}
                  style={isOver ? { background: 'rgba(99,102,241,0.12)' } : undefined}
                  onClick={() => onSlotClick(`${pad(h)}:00`)}
                  onDragOver={(e) => { e.preventDefault(); onDragOverSlot({ date: ds, hour: h }); }}
                  onDragLeave={onDragLeaveSlot}
                  onDrop={(e) => {
                    e.preventDefault();
                    const eventId = e.dataTransfer.getData('eventId');
                    if (eventId) onEventDrop(eventId, ds, h);
                  }}
                />
              </div>
            );
          })}
          {dayEvts.map(evt => {
            const [sh, sm] = evt.startTime.split(':').map(Number);
            const [eh, em] = evt.endTime.split(':').map(Number);
            const top = (sh + sm/60) * 56;
            const height = Math.max(((eh + em/60) - (sh + sm/60)) * 56, 24);
            return (
              <div
                key={evt.id}
                className="day-evt"
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('eventId', evt.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                style={{ top, height, background: EVENT_COLORS[evt.type]+'dd', textDecoration: evt.completed?'line-through':'none', cursor: 'grab' }}
                onClick={() => onEventClick(evt)}
              >
                <span className="day-evt-icon">{EVENT_ICONS[evt.type]}</span>
                <div>
                  <div className="day-evt-title">{evt.title}</div>
                  <div className="day-evt-time">{evt.startTime} – {evt.endTime}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        .day-root { display:flex; flex-direction:column; flex:1; overflow:hidden; }
        .day-header {
          display:flex; align-items:center; gap:12px; padding:12px 20px;
          border-bottom:1px solid var(--border-subtle); background:var(--bg-elevated); flex-shrink:0;
        }
        .day-name { font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); }
        .day-num {
          font-size:28px; font-weight:700; color:var(--text-secondary);
          display:flex; align-items:center; justify-content:center;
          width:44px; height:44px; border-radius:50%;
        }
        .day-num.today { background:var(--primary); color:white; }
        .day-month { font-size:15px; font-weight:500; color:var(--text-secondary); }
        .day-count { margin-left:auto; font-size:12px; color:var(--text-muted); background:var(--bg-surface); padding:3px 10px; border-radius:20px; border:1px solid var(--border-subtle); }
        .day-body { flex:1; overflow-y:auto; position:relative; }
        .day-grid { position:relative; padding-left:68px; }
        .day-hour-row { display:flex; height:56px; }
        .day-time-lbl {
          position:absolute; left:0; width:60px; text-align:right;
          padding-right:8px; font-size:11px; color:var(--text-muted);
          padding-top:4px; border-right:1px solid var(--border-subtle);
        }
        .day-slot {
          flex:1; border-bottom:1px solid var(--border-subtle); cursor:pointer; transition:background 0.1s;
        }
        .day-slot:hover { background:var(--bg-elevated); }
        .day-evt {
          position:absolute; left:76px; right:16px; border-radius:8px;
          padding:6px 10px; color:white; cursor:pointer; z-index:5;
          display:flex; align-items:flex-start; gap:8px;
          box-shadow:0 2px 8px rgba(0,0,0,0.2); transition:filter 0.1s;
        }
        .day-evt:hover { filter:brightness(1.1); }
        .day-evt-icon { font-size:16px; flex-shrink:0; }
        .day-evt-title { font-size:13px; font-weight:600; }
        .day-evt-time { font-size:11px; opacity:0.85; }
      `}</style>
    </div>
  );
}

// ─── Agenda View ───────────────────────────────────────────────────────────────

function AgendaView({ cursor, events, onEventClick }: {
  cursor: Date; events: CalendarEvent[]; onEventClick: (e: CalendarEvent) => void;
}) {
  const start = cursor;
  const end = addDays(start, 30);
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);

  const upcoming = useMemo(() => {
    const filtered = events
      .filter(e => e.date >= startStr && e.date <= endStr)
      .sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const grouped: { date: string; events: CalendarEvent[] }[] = [];
    for (const evt of filtered) {
      const last = grouped[grouped.length-1];
      if (last && last.date === evt.date) last.events.push(evt);
      else grouped.push({ date: evt.date, events: [evt] });
    }
    return grouped;
  }, [events, startStr, endStr]);

  return (
    <div className="agenda-root">
      <div className="agenda-period">
        Next 30 days — {upcoming.reduce((s,g)=>s+g.events.length,0)} events
      </div>
      {upcoming.length === 0 && (
        <div className="agenda-empty">No events in the next 30 days</div>
      )}
      {upcoming.map(group => {
        const d = parseDate(group.date);
        return (
          <div key={group.date} className="agenda-group">
            <div className="agenda-date">
              <span className="agd-dow">{DAYS[d.getDay()]}</span>
              <span className="agd-num">{d.getDate()}</span>
              <span className="agd-mon">{MONTHS[d.getMonth()].slice(0,3)}</span>
            </div>
            <div className="agenda-evts">
              {group.events.map(evt => (
                <div
                  key={evt.id}
                  className="agenda-evt"
                  style={{ borderLeft: `4px solid ${EVENT_COLORS[evt.type]}` }}
                  onClick={() => onEventClick(evt)}
                >
                  <span className="agd-icon">{EVENT_ICONS[evt.type]}</span>
                  <div className="agd-info">
                    <span className="agd-title" style={{ textDecoration: evt.completed?'line-through':'none' }}>{evt.title}</span>
                    <span className="agd-time">{evt.startTime} – {evt.endTime}</span>
                  </div>
                  <span className="agd-type-badge" style={{ background: EVENT_COLORS[evt.type]+'22', color: EVENT_COLORS[evt.type] }}>
                    {evt.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .agenda-root { flex:1; overflow-y:auto; padding:16px 24px; }
        .agenda-period { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
        .agenda-empty { font-size:15px; color:var(--text-muted); text-align:center; padding:60px 0; }
        .agenda-group { display:flex; gap:24px; margin-bottom:24px; align-items:flex-start; }
        .agenda-date { display:flex; flex-direction:column; align-items:center; min-width:48px; gap:0; }
        .agd-dow { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); }
        .agd-num { font-size:24px; font-weight:700; color:var(--text-secondary); line-height:1; }
        .agd-mon { font-size:11px; color:var(--text-muted); }
        .agenda-evts { flex:1; display:flex; flex-direction:column; gap:8px; }
        .agenda-evt {
          display:flex; align-items:center; gap:10px; padding:10px 14px;
          border-radius:10px; background:var(--bg-elevated); cursor:pointer;
          transition:background 0.12s; border:1px solid var(--border-subtle);
        }
        .agenda-evt:hover { background:var(--bg-surface); }
        .agd-icon { font-size:18px; flex-shrink:0; }
        .agd-info { flex:1; min-width:0; }
        .agd-title { display:block; font-size:14px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .agd-time { display:block; font-size:12px; color:var(--text-muted); }
        .agd-type-badge { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; text-transform:capitalize; flex-shrink:0; }
      `}</style>
    </div>
  );
}
