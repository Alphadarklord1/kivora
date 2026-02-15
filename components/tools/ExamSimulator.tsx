'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateSmartContent, GeneratedQuestion, type ToolMode, type GeneratedContent } from '@/lib/offline/generate';
import { useI18n } from '@/lib/i18n/useI18n';

export interface ExamPrepData {
  summary: string;
  keyTopics: string[];
  learningObjectives: string[];
  questionBank: GeneratedQuestion[];
}

interface ExamSimulatorProps {
  inputText: string;
  onInputChange: (value: string) => void;
  manualInputEnabled?: boolean;
  autoChain?: boolean;
  prepData?: ExamPrepData | null;
  onPrepGenerated?: (prep: ExamPrepData) => void;
  onResult?: (title: string, content: string) => void;
  onSrsSeed?: (prep: ExamPrepData) => void;
  generateContent?: (mode: ToolMode, text: string) => Promise<GeneratedContent>;
}

export function ExamSimulator({
  inputText,
  onInputChange,
  manualInputEnabled = true,
  autoChain = false,
  prepData,
  onPrepGenerated,
  onResult,
  onSrsSeed,
  generateContent,
}: ExamSimulatorProps) {
  const { t } = useI18n({
    'No objectives generated.': 'لم يتم توليد أهداف.',
    'No key topics detected.': 'لم يتم اكتشاف موضوعات رئيسية.',
    Objectives: 'الأهداف',
    'Key Topics': 'الموضوعات الرئيسية',
    'Exam Prep + Simulator': 'التحضير للاختبار + المحاكي',
    'Create objectives, generate an exam, and surface weak areas.': 'أنشئ أهدافًا، ولّد اختبارًا، واكشف نقاط الضعف.',
    'Preparing...': 'جارٍ التحضير...',
    'Generate Exam Prep': 'توليد تحضير الاختبار',
    'Exam source text': 'نص مصدر الاختبار',
    'Paste study material for exam prep...': 'ألصق المادة الدراسية لتحضير الاختبار...',
    'Paste text above to start exam prep.': 'ألصق النص أعلاه لبدء تحضير الاختبار.',
    'Select a file to use as exam source.': 'اختر ملفًا لاستخدامه كمصدر للاختبار.',
    'Exam Prep': 'تحضير الاختبار',
    'Learning Objectives': 'أهداف التعلم',
    'Generate Exam': 'توليد اختبار',
    'Generate SRS Deck': 'توليد مجموعة SRS',
    '{count} questions · {minutes} min': '{count} أسئلة · {minutes} دقيقة',
    'Start Exam': 'بدء الاختبار',
    'Time left': 'الوقت المتبقي',
    'Submit Exam': 'إرسال الاختبار',
    'Score: {score}%': 'النتيجة: {score}%',
    'Weak areas: {areas}': 'نقاط الضعف: {areas}',
    'Great job!': 'عمل رائع!',
    'New Exam': 'اختبار جديد',
    None: 'لا يوجد',
  });
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [started, setStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<{ score: number; weak: string[] } | null>(null);
  const [generatingPrep, setGeneratingPrep] = useState(false);

  const examMinutes = useMemo(() => Math.max(5, Math.ceil(questions.length * 1.5)), [questions.length]);

  useEffect(() => {
    if (!started || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(t);
  }, [started, timeLeft]);

  const formatPrepSummary = (prep: ExamPrepData) => {
    const objectives = prep.learningObjectives.length ? prep.learningObjectives.join('; ') : t('No objectives generated.');
    const topics = prep.keyTopics.length ? prep.keyTopics.join(', ') : t('No key topics detected.');
    return `${t('Objectives')}: ${objectives}\n${t('Key Topics')}: ${topics}`;
  };

  const buildExamFromPrep = (prep: ExamPrepData | null) => {
    const bank = prep?.questionBank?.length
      ? prep.questionBank.slice(0, 10)
      : generateSmartContent('mcq', inputText).questions.slice(0, 10);
    setQuestions(bank);
    setAnswers({});
    setResult(null);
    setStarted(false);
  };

  const generateExamPrep = async () => {
    if (!inputText.trim()) return;
    setGeneratingPrep(true);
    try {
      const summary = generateContent
        ? await generateContent('summarize', inputText)
        : generateSmartContent('summarize', inputText);
      const questions = generateContent
        ? await generateContent('mcq', inputText)
        : generateSmartContent('mcq', inputText);

      const prep: ExamPrepData = {
        summary: summary.displayText,
        keyTopics: summary.keyTopics,
        learningObjectives: summary.learningObjectives || [],
        questionBank: questions.questions.slice(0, 12),
      };
      onPrepGenerated?.(prep);
      onResult?.('Exam Prep', formatPrepSummary(prep));

      if (autoChain) {
        buildExamFromPrep(prep);
        onSrsSeed?.(prep);
      }
    } finally {
      setGeneratingPrep(false);
    }
  };

  const startExam = () => {
    setStarted(true);
    setTimeLeft(examMinutes * 60);
  };

  const finishExam = useCallback(async () => {
    if (!questions.length) return;
    const correct = questions.filter(q => answers[q.id] === q.correctIndex).length;
    const score = Math.round((correct / questions.length) * 100);
    const weakTopics = questions
      .filter(q => answers[q.id] !== q.correctIndex)
      .flatMap(q => q.keywords || [])
      .slice(0, 4);
    setResult({ score, weak: weakTopics });
    setStarted(false);

    onResult?.('Exam', `Score: ${score}% • Weak: ${weakTopics.join(', ') || 'None'}`);
    onResult?.('Exam', `${t('Score: {score}%', { score })} • ${t('Weak areas: {areas}', { areas: weakTopics.join(', ') || t('None') })}`);

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
  }, [questions, answers, onResult]);

  useEffect(() => {
    if (timeLeft === 0 && started && questions.length) {
      void finishExam();
    }
  }, [timeLeft, started, questions.length, finishExam]);

  return (
    <div className="exam-sim">
      <div className="exam-header">
        <div>
          <h3>{t('Exam Prep + Simulator')}</h3>
          <p>{t('Create objectives, generate an exam, and surface weak areas.')}</p>
        </div>
        <button
          className="btn"
          onClick={generateExamPrep}
          disabled={!inputText.trim() || generatingPrep}
        >
          {generatingPrep ? t('Preparing...') : t('Generate Exam Prep')}
        </button>
      </div>

      {manualInputEnabled && (
        <div className="input-block">
          <label>{t('Exam source text')}</label>
          <textarea
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            rows={6}
            placeholder={t('Paste study material for exam prep...')}
          />
        </div>
      )}

      {!inputText.trim() && (
        <div className="empty">
          {manualInputEnabled ? t('Paste text above to start exam prep.') : t('Select a file to use as exam source.')}
        </div>
      )}

      {prepData && (
        <div className="prep-card">
          <h4>{t('Exam Prep')}</h4>
          <div className="prep-grid">
            <div>
              <div className="prep-label">{t('Learning Objectives')}</div>
              <ul>
                {(prepData.learningObjectives.length ? prepData.learningObjectives : [t('No objectives generated.')]).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="prep-label">{t('Key Topics')}</div>
              <div className="topics">
                {(prepData.keyTopics.length ? prepData.keyTopics : [t('No key topics detected.')]).map((topic, idx) => (
                  <span key={idx} className="chip">{topic}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="prep-actions">
            <button className="btn secondary" onClick={() => buildExamFromPrep(prepData)}>{t('Generate Exam')}</button>
            <button className="btn secondary" onClick={() => onSrsSeed?.(prepData)}>{t('Generate SRS Deck')}</button>
          </div>
        </div>
      )}

      {questions.length > 0 && !started && !result && (
        <div className="exam-ready">
          <p>{t('{count} questions · {minutes} min', { count: questions.length, minutes: examMinutes })}</p>
          <button className="btn" onClick={startExam}>{t('Start Exam')}</button>
        </div>
      )}

      {started && (
        <div className="timer">{t('Time left')}: {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</div>
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
        <button className="btn secondary" onClick={finishExam}>{t('Submit Exam')}</button>
      )}

      {result && (
        <div className="result">
          <h4>{t('Score: {score}%', { score: result.score })}</h4>
          <p>{t('Weak areas: {areas}', { areas: result.weak.join(', ') || t('Great job!') })}</p>
          <button className="btn secondary" onClick={() => { setQuestions([]); setResult(null); }}>{t('New Exam')}</button>
        </div>
      )}

      <style jsx>{`
        .exam-sim { display: grid; gap: var(--space-3); }
        .exam-header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); }
        p { color: var(--text-muted); font-size: var(--font-meta); margin: 0; }
        .input-block { display: grid; gap: var(--space-2); }
        .input-block label { font-size: var(--font-meta); color: var(--text-secondary); }
        textarea { padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); }
        .empty { padding: var(--space-3); background: var(--bg-inset); border-radius: var(--radius-md); color: var(--text-muted); }
        .prep-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 16px; padding: var(--space-3); display: grid; gap: var(--space-3); }
        .prep-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); }
        .prep-label { font-size: var(--font-tiny); text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--space-2); letter-spacing: 0.05em; }
        ul { margin: 0; padding-left: 18px; color: var(--text-secondary); }
        .topics { display: flex; flex-wrap: wrap; gap: var(--space-2); }
        .chip { padding: 4px 10px; background: var(--bg-inset); border-radius: var(--radius-full); font-size: var(--font-tiny); }
        .prep-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
        .q-card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 12px; padding: var(--space-3); }
        .options { display: grid; gap: var(--space-2); margin-top: var(--space-2); }
        .timer { font-weight: 600; color: var(--primary); }
        .result { background: var(--bg-inset); padding: var(--space-3); border-radius: 12px; }
      `}</style>
    </div>
  );
}
