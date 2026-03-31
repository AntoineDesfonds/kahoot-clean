import assert from 'node:assert/strict';
import test from 'node:test';
import type { Quiz } from '../models/quiz';
import { ensurePracticeQuizHasQuestions } from './quiz-practice.utils.ts';

function createQuiz(overrides?: Partial<Quiz>): Quiz {
  return {
    id: 'shared-quiz',
    ownerId: 'host-user',
    title: 'Quiz partage',
    description: 'Quiz de test',
    coverImageUrl: '',
    themeColor: '#0f766e',
    estimatedDurationMinutes: 3,
    questions: [],
    questionsCount: 1,
    ...overrides,
  };
}

test('keeps a detail fallback when it already carries questions', () => {
  const quiz = createQuiz({
    questions: [
      {
        id: 'question-1',
        order: 0,
        text: 'Quelle est la capitale du Japon ?',
        imageUrl: '',
        correctChoiceIndex: -1,
        choices: [
          { text: 'Osaka', imageUrl: '' },
          { text: 'Tokyo', imageUrl: '' },
        ],
      },
    ],
  });

  assert.equal(ensurePracticeQuizHasQuestions(quiz, new Error('boom')), quiz);
});

test('rethrows the original loading error when the fallback quiz is only a shell', () => {
  const originalError = new Error('practice-load-failed');

  assert.throws(
    () => ensurePracticeQuizHasQuestions(createQuiz(), originalError),
    (error) => error === originalError,
  );
});
