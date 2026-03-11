'use client';

import { useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function PlannerPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view,  setView]  = useState<'month' | 'week' | 'day'>('month');

  const today = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const numDays = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  const cells = Array.from({ length: startDay + numDays });

  function prev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Planner</h1>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(['month', 'week', 'day'] as const).map(v => (
            <button key={v} className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={prev}>‹</button>
        <span style={{ fontSize: 'var(--text-xl)', fontWeight: 600, minWidth: 200, textAlign: 'center' }}>
          {MONTHS[month]} {year}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={next}>›</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="calendar-grid" style={{ marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-3)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="calendar-grid">
        {cells.map((_, i) => {
          const day = i - startDay + 1;
          const isValid = day >= 1 && day <= numDays;
          const isToday = isCurrentMonth && isValid && day === today;
          return (
            <div
              key={i}
              className={`cal-day${isToday ? ' today' : ''}`}
              style={{ ...(isValid ? {} : { opacity: 0, pointerEvents: 'none' }), minHeight: 64 }}
            >
              {isValid && <span className="day-num">{day}</span>}
            </div>
          );
        })}
      </div>

      {/* Placeholder for event creation */}
      <div className="card" style={{ marginTop: 24 }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', textAlign: 'center' }}>
          📅 Study session planning coming soon — click a day to add a session.
        </p>
      </div>
    </div>
  );
}
