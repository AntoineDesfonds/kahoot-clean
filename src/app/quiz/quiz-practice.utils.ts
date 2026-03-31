import type { Quiz } from '../models/quiz';

export function ensurePracticeQuizHasQuestions(
  quiz: Quiz,
  originalError: unknown,
): Quiz {
  if (quiz.questions.length > 0) {
    return quiz;
  }

  throw originalError;
}
