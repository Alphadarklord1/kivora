'use client';

import { useState, useEffect, useRef } from 'react';
import { GeneratedQuestion, GeneratedContent } from '@/lib/offline/generate';

interface VerifyResponse {
  isCorrect: boolean;
  confidence: 'high' | 'medium' | 'low';
  feedback: string;
  explanation: string;
  relevantSource: string;
  webVerification?: {
    searched: boolean;
    confirmed: boolean;
    snippet?: string;
  };
}

interface QuestionAnswer {
  questionId: string;
  answer: string;
  verified: boolean;
  result?: VerifyResponse;
}

interface InteractiveQuizProps {
  content: GeneratedContent;
  fileId?: string;
  onClose: () => void;
}

export function InteractiveQuiz({ content, fileId, onClose }: InteractiveQuizProps) {
  const [answers, setAnswers] = useState<Map<string, QuestionAnswer>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [resultsSaved, setResultsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const questions = content.questions;
  const currentQuestion = questions[currentIndex];

  // Save quiz results when showing results
  useEffect(() => {
    if (showResults && !resultsSaved) {
      saveQuizAttempt();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResults]);

  const saveQuizAttempt = async () => {
    if (resultsSaved || saving) return;

    setSaving(true);
    try {
      const { correct, total } = getScore();
      const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);

      // Build answers array for saving
      const answersArray = questions.map(q => {
        const answer = answers.get(q.id);
        return {
          questionId: q.id,
          question: q.question,
          userAnswer: answer?.answer || '',
          correctAnswer: q.correctAnswer,
          isCorrect: answer?.result?.isCorrect || false,
        };
      });

      await fetch('/api/quiz-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileId,
          mode: content.mode,
          totalQuestions: total,
          correctAnswers: correct,
          timeTaken,
          answers: answersArray,
        }),
      });

      setResultsSaved(true);
    } catch (error) {
      console.error('Failed to save quiz attempt:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => {
      const next = new Map(prev);
      next.set(questionId, {
        questionId,
        answer,
        verified: false,
      });
      return next;
    });
  };

  const verifyAnswer = async (question: GeneratedQuestion) => {
    const answerData = answers.get(question.id);
    if (!answerData?.answer.trim()) return;

    setVerifying(question.id);

    try {
      const response = await fetch('/api/verify-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: question.id,
          questionType: question.type,
          question: question.question,
          userAnswer: answerData.answer,
          correctAnswer: question.correctAnswer,
          sourceSentence: question.sourceSentence,
          sourceText: content.sourceText,
          keywords: question.keywords,
          useWebSearch,
        }),
      });

      if (response.ok) {
        const result: VerifyResponse = await response.json();
        setAnswers(prev => {
          const next = new Map(prev);
          next.set(question.id, {
            ...answerData,
            verified: true,
            result,
          });
          return next;
        });
      }
    } catch (error) {
      console.error('Verification failed:', error);
    } finally {
      setVerifying(null);
    }
  };

  const verifyAll = async () => {
    for (const question of questions) {
      await verifyAnswer(question);
    }
    setShowResults(true);
  };

  const getScore = () => {
    let correct = 0;
    let total = 0;
    for (const answer of answers.values()) {
      if (answer.verified && answer.result) {
        total++;
        if (answer.result.isCorrect) correct++;
      }
    }
    return { correct, total };
  };

  const renderMCQOptions = (question: GeneratedQuestion) => {
    const answer = answers.get(question.id);
    const letters = ['A', 'B', 'C', 'D'];

    return (
      <div className="mcq-options">
        {question.options?.map((option, idx) => {
          const isSelected = answer?.answer === option;
          const isVerified = answer?.verified;
          const isCorrect = isVerified && option === question.correctAnswer;
          const isWrong = isVerified && isSelected && !answer.result?.isCorrect;

          return (
            <label
              key={idx}
              className={`mcq-option ${isSelected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
            >
              <input
                type="radio"
                name={`mcq-${question.id}`}
                value={option}
                checked={isSelected}
                onChange={() => updateAnswer(question.id, option)}
                disabled={isVerified}
              />
              <span className="option-letter">{letters[idx]}</span>
              <span className="option-text">{option}</span>
              {isVerified && isCorrect && <span className="option-icon">✓</span>}
              {isVerified && isWrong && <span className="option-icon">✗</span>}
            </label>
          );
        })}
      </div>
    );
  };

  const renderTrueFalseOptions = (question: GeneratedQuestion) => {
    const answer = answers.get(question.id);
    const options = ['True', 'False'];

    return (
      <div className="tf-options">
        {options.map((option) => {
          const isSelected = answer?.answer === option;
          const isVerified = answer?.verified;
          const isCorrect = isVerified && option === question.correctAnswer;
          const isWrong = isVerified && isSelected && !answer.result?.isCorrect;

          return (
            <label
              key={option}
              className={`tf-option ${isSelected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
            >
              <input
                type="radio"
                name={`tf-${question.id}`}
                value={option}
                checked={isSelected}
                onChange={() => updateAnswer(question.id, option)}
                disabled={isVerified}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    );
  };

  const renderShortAnswer = (question: GeneratedQuestion) => {
    const answer = answers.get(question.id);

    return (
      <div className="short-answer">
        <textarea
          placeholder="Type your answer here..."
          value={answer?.answer || ''}
          onChange={(e) => updateAnswer(question.id, e.target.value)}
          disabled={answer?.verified}
          rows={4}
        />
      </div>
    );
  };

  const renderFeedback = (question: GeneratedQuestion) => {
    const answer = answers.get(question.id);
    if (!answer?.verified || !answer.result) return null;

    const { result } = answer;

    return (
      <div className={`feedback ${result.isCorrect ? 'correct' : 'incorrect'}`}>
        <div className="feedback-header">
          <span className={`feedback-icon ${result.isCorrect ? 'correct' : 'incorrect'}`}>
            {result.isCorrect ? '✓' : '✗'}
          </span>
          <span className="feedback-text">{result.feedback}</span>
          <span className={`confidence ${result.confidence}`}>
            {result.confidence} confidence
          </span>
        </div>

        {result.explanation && (
          <div className="feedback-explanation">
            <strong>Explanation:</strong> {result.explanation}
          </div>
        )}

        {result.webVerification?.searched && (
          <div className="web-verification">
            <span className="web-badge">
              🌐 Web {result.webVerification.confirmed ? 'Confirmed' : 'Not Found'}
            </span>
            {result.webVerification.snippet && (
              <p className="web-snippet">{result.webVerification.snippet}</p>
            )}
          </div>
        )}

        {!result.isCorrect && (
          <div className="source-reference">
            <strong>From your document:</strong>
            <p>&quot;{result.relevantSource}&quot;</p>
          </div>
        )}
      </div>
    );
  };

  if (questions.length === 0) {
    return (
      <div className="interactive-quiz">
        <div className="quiz-header">
          <h3>No Questions Generated</h3>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
        <p>Could not generate questions. Please provide more detailed content.</p>
      </div>
    );
  }

  if (showResults) {
    const { correct, total } = getScore();
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="interactive-quiz results-view">
        <div className="quiz-header">
          <h3>📊 Quiz Results</h3>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>

        <div className="score-summary">
          <div className="score-circle">
            <span className="score-number">{percentage}%</span>
            <span className="score-label">{correct}/{total} correct</span>
          </div>
          {saving && <span className="save-status">Saving results...</span>}
          {resultsSaved && <span className="save-status saved">✓ Results saved</span>}
        </div>

        <div className="results-list">
          {questions.map((q, idx) => {
            const answer = answers.get(q.id);
            return (
              <div key={q.id} className={`result-item ${answer?.result?.isCorrect ? 'correct' : 'incorrect'}`}>
                <div className="result-header">
                  <span className="result-number">Q{idx + 1}</span>
                  <span className={`result-status ${answer?.result?.isCorrect ? 'correct' : 'incorrect'}`}>
                    {answer?.result?.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                  </span>
                </div>
                <p className="result-question">{q.question}</p>
                <p className="result-answer">
                  <strong>Your answer:</strong> {answer?.answer || '(no answer)'}
                </p>
                {!answer?.result?.isCorrect && (
                  <p className="result-correct">
                    <strong>Correct answer:</strong> {q.correctAnswer}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="results-actions">
          <button className="btn" onClick={() => {
            setAnswers(new Map());
            setCurrentIndex(0);
            setShowResults(false);
            setResultsSaved(false);
            startTimeRef.current = Date.now();
          }}>
            Try Again
          </button>
          <button className="btn secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="interactive-quiz">
      <div className="quiz-header">
        <h3>📝 {content.mode.toUpperCase()} - Interactive Mode</h3>
        <div className="quiz-controls">
          <label className="web-search-toggle">
            <input
              type="checkbox"
              checked={useWebSearch}
              onChange={(e) => setUseWebSearch(e.target.checked)}
            />
            <span>Use web verification</span>
          </label>
          <button className="btn secondary" onClick={onClose}>Exit</button>
        </div>
      </div>

      <div className="quiz-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        <span className="progress-text">
          Question {currentIndex + 1} of {questions.length}
        </span>
      </div>

      <div className="question-card">
        <div className="question-meta">
          <span className={`difficulty ${currentQuestion.difficulty}`}>
            {currentQuestion.difficulty}
          </span>
          {currentQuestion.topic && (
            <span className="topic">{currentQuestion.topic}</span>
          )}
        </div>

        <div className="question-text">
          {currentQuestion.question}
        </div>

        <div className="answer-area">
          {currentQuestion.type === 'mcq' && renderMCQOptions(currentQuestion)}
          {currentQuestion.type === 'true-false' && renderTrueFalseOptions(currentQuestion)}
          {(currentQuestion.type === 'short-answer' ||
            currentQuestion.type === 'explanation' ||
            currentQuestion.type === 'definition') && renderShortAnswer(currentQuestion)}
        </div>

        {renderFeedback(currentQuestion)}

        <div className="question-actions">
          {!answers.get(currentQuestion.id)?.verified ? (
            <button
              className="btn"
              onClick={() => verifyAnswer(currentQuestion)}
              disabled={!answers.get(currentQuestion.id)?.answer || verifying === currentQuestion.id}
            >
              {verifying === currentQuestion.id ? 'Checking...' : 'Check Answer'}
            </button>
          ) : (
            <div className="nav-buttons">
              {currentIndex > 0 && (
                <button className="btn secondary" onClick={() => setCurrentIndex(i => i - 1)}>
                  ← Previous
                </button>
              )}
              {currentIndex < questions.length - 1 ? (
                <button className="btn" onClick={() => setCurrentIndex(i => i + 1)}>
                  Next →
                </button>
              ) : (
                <button className="btn" onClick={() => setShowResults(true)}>
                  See Results
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="quiz-footer">
        <button className="btn secondary" onClick={verifyAll}>
          Submit All & See Results
        </button>
      </div>
    </div>
  );
}
