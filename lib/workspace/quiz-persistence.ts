/**
 * Fire-and-forget quiz attempt persistence.
 *
 * The MCQView and ExamView components compute scores in-memory but never
 * sent them anywhere — so analytics, weak-topic detection, and progress
 * trends had no signal to work with. This helper posts the attempt to
 * /api/quiz-attempts (which already exists and is fully built) without
 * blocking the UI on the network round-trip.
 *
 * Errors are swallowed deliberately: a failed POST should never break a
 * student's review flow. Worst case the attempt isn't logged for that
 * session and surfaces in the next sync.
 */

export interface QuizAnswerSummary {
  questionId: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

export interface RecordQuizAttemptInput {
  /** Generation mode the attempt belongs to (mcq, quiz, exam). */
  mode: 'mcq' | 'quiz' | 'exam' | string;
  totalQuestions: number;
  correctAnswers: number;
  /** Optional source file the questions were generated from. */
  fileId?: string | null;
  /** Optional SRS deck the attempt belongs to. */
  deckId?: string | null;
  /** Seconds the user spent on the attempt (ExamView has this; MCQ doesn't). */
  timeTaken?: number | null;
  /** Per-question detail used by analytics for weak-area tracking. */
  answers?: QuizAnswerSummary[];
}

export async function recordQuizAttempt(input: RecordQuizAttemptInput): Promise<void> {
  if (typeof window === 'undefined') return;          // SSR guard
  if (!Number.isFinite(input.totalQuestions) || input.totalQuestions < 1) return;

  // Clamp correctAnswers to a valid range — the route validates this too,
  // but a 400 response is wasted noise we can avoid.
  const correct = Math.max(0, Math.min(input.totalQuestions, input.correctAnswers));

  const body = {
    fileId:         input.fileId ?? null,
    deckId:         input.deckId ?? null,
    mode:           input.mode,
    totalQuestions: input.totalQuestions,
    correctAnswers: correct,
    timeTaken:      input.timeTaken ?? null,
    answers:        Array.isArray(input.answers) ? input.answers : null,
  };

  try {
    await fetch('/api/quiz-attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // keepalive so the request survives if the user navigates away
      // immediately after seeing their score.
      keepalive: true,
    });
    // Tell any open Recovery tab / Analytics dashboard that the
    // quiz_attempts list just changed so it can refetch without a
    // manual refresh.
    try { window.dispatchEvent(new CustomEvent('kivora:quiz-attempts-changed')); } catch { /* noop */ }
  } catch {
    // Swallow — analytics is nice-to-have, not critical-path.
  }
}
