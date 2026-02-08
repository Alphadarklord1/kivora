'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateSmartContent, GeneratedQuestion } from '@/lib/offline/generate';

export function ExamSimulator() {
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<{ score: number; weak: string[] } | null>(null);

  const examMinutes = useMemo(() => Math.max(5, Math.ceil(questions.length * 1.5)), [questions.length]);

  useEffect(() => {
    if (!started || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(t);
  }, [started, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && started && questions.length) {
      finishExam();
    }
  }, [timeLeft, started, questions.length]);

  const buildExam = () => {
    const content = generateSmartContent('mcq', text);
    setQuestions(content.questions.slice(0, 10));
    setAnswers({});
    setResult(null);
    setStarted(false);
  };

  const startExam = () => {
    setStarted(true);
    setTimeLeft(examMinutes * 60);
  };

  const finishExam = async () => {
    const correct = questions.filter(q => answers[q.id] === q.correctIndex).length;
    const score = Math.round((correct / questions.length) * 100);
    const weakTopics = questions
      .filter(q => answers[q.id] !== q.correctIndex)
      .flatMap(q => q.keywords || [])
      .slice(0, 4);
    setResult({ score, weak: weakTopics });
    setStarted(false);

    await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mode: 'exam',
        content: `Score: ${score}%`,
        metadata: { score, weakTopics, total: questions.length, completedAt: new Date().toISOString() },
      }),
    });
  };

  return (
    <div className="exam-sim">
      <div>
        <h3>Exam Simulator</h3>
        <p>Create a timed exam from your notes and get a score report.</p>
      </div>
      {!questions.length && (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste study material..." />
          <button className="btn" onClick={buildExam} disabled={!text.trim()}>Generate Exam</button>
        </>
      )}

      {questions.length > 0 && !started && !result && (
        <div className="exam-ready">
          <p>{questions.length} questions · {examMinutes} min</p>
          <button className="btn" onClick={startExam}>Start Exam</button>
        </div>
      )}

      {started && (
        <div className="timer">Time left: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</div>
      )}

      {started && questions.map((q, idx) => (
        <div key={q.id} className="q-card">
          <h4>{idx + 1}. {q.question}</h4>
          <div className="options">
            {q.options?.map((opt, i) => (
              <label key={i}>
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === i}
                  onChange={() => setAnswers(prev => ({ ...prev, [q.id]: i }))}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      ))}

      {started && (
        <button className="btn secondary" onClick={finishExam}>Submit Exam</button>
      )}

      {result && (
        <div className="result">
          <h4>Score: {result.score}%</h4>
          <p>Weak areas: {result.weak.join(', ') || 'Great job!'}</p>
          <button className="btn secondary" onClick={() => { setQuestions([]); setResult(null); }}>New Exam</button>
        </div>
      )}

      <style jsx>{`
        .exam-sim { display: grid; gap: var(--space-3); }
        p { color: var(--text-muted); font-size: var(--font-meta); margin: 0; }
        textarea { padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); }
        .q-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: var(--space-3); }
        .options { display: grid; gap: var(--space-2); margin-top: var(--space-2); }
        .timer { font-weight: 600; color: var(--primary); }
        .result { background: var(--bg-inset); padding: var(--space-3); border-radius: 12px; }
      `}</style>
    </div>
  );
}
