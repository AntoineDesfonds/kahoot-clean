import { readFileSync } from 'node:fs';
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'kahoot-fcbbc';
const FIXED_JOINED_AT = new Date('2026-03-18T13:02:09.420Z');
const FIXED_NOW = new Date('2026-03-18T13:02:19.420Z');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await setDoc(doc(firestore, 'quizzes/quiz-1'), {
      ownerId: 'owner-user',
      title: 'Quiz prive',
      description: 'Questions reservees au createur',
      coverImageUrl: 'assets/shapes.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 3,
      questionsCount: 1,
    });

    await setDoc(doc(firestore, 'quizzes/quiz-1/questions/question-1'), {
      order: 0,
      text: 'Quelle est la bonne reponse ?',
      imageUrl: '',
      correctChoiceIndex: 1,
      choices: [
        { text: 'A', imageUrl: '' },
        { text: 'B', imageUrl: '' },
      ],
    });

    await setDoc(doc(firestore, 'games/game-1'), {
      hostId: 'host-user',
      quizId: 'quiz-1',
      quizTitle: 'Quiz prive',
      quizCoverImageUrl: 'assets/shapes.svg',
      quizThemeColor: '#0f766e',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      startedAt: FIXED_NOW,
      finishedAt: null,
      status: 'in-progress',
      entryCode: 'ABC123',
      currentQuestionIndex: 0,
      currentQuestionStatus: 'in-progress',
      totalQuestions: 1,
      currentQuestionId: null,
      currentQuestionText: null,
      currentQuestionImageUrl: null,
      currentQuestionChoices: [],
      questionDurationSeconds: 20,
      currentQuestionStartedAt: null,
      currentQuestionEndsAt: null,
      answerCount: 0,
      revealedCorrectChoiceIndex: null,
    });

    await setDoc(doc(firestore, 'games/game-1/players/host-user'), {
      alias: 'Host',
      score: 0,
      joinedAt: FIXED_JOINED_AT,
      totalAnswerTimeMs: 0,
      correctAnswers: 0,
      currentQuestionIndex: 0,
      currentQuestionStartedAt: FIXED_NOW,
      finishedAt: null,
    });

    await setDoc(doc(firestore, 'games/game-1/players/player-user'), {
      alias: 'Player',
      score: 0,
      joinedAt: FIXED_JOINED_AT,
      totalAnswerTimeMs: 0,
      correctAnswers: 0,
      currentQuestionIndex: 0,
      currentQuestionStartedAt: FIXED_NOW,
      finishedAt: null,
    });

    await setDoc(doc(firestore, 'games/game-waiting'), {
      hostId: 'host-user',
      quizId: 'quiz-1',
      quizTitle: 'Quiz prive',
      quizCoverImageUrl: 'assets/shapes.svg',
      quizThemeColor: '#0f766e',
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      startedAt: null,
      finishedAt: null,
      status: 'waiting',
      entryCode: 'WAIT42',
      currentQuestionIndex: 0,
      currentQuestionStatus: 'waiting',
      totalQuestions: 1,
      currentQuestionId: null,
      currentQuestionText: null,
      currentQuestionImageUrl: null,
      currentQuestionChoices: [],
      questionDurationSeconds: 20,
      currentQuestionStartedAt: null,
      currentQuestionEndsAt: null,
      answerCount: 0,
      revealedCorrectChoiceIndex: null,
    });

    await setDoc(doc(firestore, 'games/game-waiting/players/host-user'), {
      alias: 'Host',
      score: 0,
      joinedAt: FIXED_JOINED_AT,
      totalAnswerTimeMs: 0,
      correctAnswers: 0,
      currentQuestionIndex: 0,
      currentQuestionStartedAt: null,
      finishedAt: null,
    });
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('signed-in users can read shared quiz questions for training', async () => {
  const firestore = testEnv.authenticatedContext('player-user').firestore();

  await assertSucceeds(
    getDoc(doc(firestore, 'quizzes/quiz-1/questions/question-1')),
  );
});

test('owner can still read raw quiz questions', async () => {
  const firestore = testEnv.authenticatedContext('owner-user').firestore();

  await assertSucceeds(
    getDoc(doc(firestore, 'quizzes/quiz-1/questions/question-1')),
  );
});

test('owner can create a new quiz and its questions in a single batch', async () => {
  const firestore = testEnv.authenticatedContext('owner-user').firestore();
  const batch = writeBatch(firestore);
  const quizRef = doc(collection(firestore, 'quizzes'), 'quiz-2');
  const questionRef = doc(collection(quizRef, 'questions'), 'question-1');

  batch.set(quizRef, {
    ownerId: 'owner-user',
    title: 'Nouveau quiz',
    description: 'Creation en un seul batch',
    coverImageUrl: '',
    themeColor: '#0f766e',
    estimatedDurationMinutes: 3,
    questionsCount: 1,
  });
  batch.set(questionRef, {
    order: 0,
    text: 'Question de test',
    imageUrl: '',
    correctChoiceIndex: 0,
    choices: [
      { text: 'Oui', imageUrl: '' },
      { text: 'Non', imageUrl: '' },
    ],
  });

  await assertSucceeds(batch.commit());
});

test('signed-in user can create a multiplayer room from a shared quiz', async () => {
  const firestore = testEnv.authenticatedContext('player-user').firestore();
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, 'games/game-2'), {
    hostId: 'player-user',
    quizId: 'quiz-1',
    quizTitle: 'Quiz partage',
    quizCoverImageUrl: 'assets/shapes.svg',
    quizThemeColor: '#0f766e',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    startedAt: null,
    finishedAt: null,
    status: 'waiting',
    entryCode: 'ROOM42',
    currentQuestionIndex: 0,
    currentQuestionStatus: 'waiting',
    totalQuestions: 1,
    currentQuestionId: null,
    currentQuestionText: null,
    currentQuestionImageUrl: null,
    currentQuestionChoices: [],
    questionDurationSeconds: 20,
    currentQuestionStartedAt: null,
    currentQuestionEndsAt: null,
    answerCount: 0,
    revealedCorrectChoiceIndex: null,
  });
  batch.set(doc(firestore, 'gameCodes/ROOM42'), {
    gameId: 'game-2',
    hostId: 'player-user',
    status: 'waiting',
  });
  batch.set(doc(firestore, 'games/game-2/players/player-user'), {
    alias: 'Player',
    score: 0,
    joinedAt: FIXED_JOINED_AT,
    totalAnswerTimeMs: 0,
    correctAnswers: 0,
    currentQuestionIndex: 0,
    currentQuestionStartedAt: null,
    finishedAt: null,
  });
  batch.set(doc(firestore, 'games/game-2/questions/0'), {
    order: 0,
    text: 'Quelle est la bonne reponse ?',
    imageUrl: '',
    correctChoiceIndex: 1,
    choices: [
      { text: 'A', imageUrl: '' },
      { text: 'B', imageUrl: '' },
    ],
  });

  await assertSucceeds(batch.commit());
});

test('player can join a waiting room directly', async () => {
  const firestore = testEnv.authenticatedContext('player-user').firestore();

  await assertSucceeds(
    setDoc(doc(firestore, 'games/game-waiting/players/player-user'), {
      alias: 'Player',
      score: 0,
      joinedAt: FIXED_JOINED_AT,
      totalAnswerTimeMs: 0,
      correctAnswers: 0,
      currentQuestionIndex: 0,
      currentQuestionStartedAt: null,
      finishedAt: null,
    }),
  );
});

test('player cannot update score directly', async () => {
  const firestore = testEnv.authenticatedContext('player-user').firestore();

  await assertFails(
    updateDoc(doc(firestore, 'games/game-1/players/player-user'), {
      score: 999,
    }),
  );
});

test('player can submit an answer and advance their own state directly', async () => {
  const firestore = testEnv.authenticatedContext('player-user').firestore();

  await assertSucceeds(
    setDoc(doc(firestore, 'games/game-1/responses/0_player-user'), {
      playerId: 'player-user',
      questionId: 'question-1',
      questionIndex: 0,
      selectedChoiceIndex: 1,
      answeredAt: FIXED_NOW,
      scored: true,
      isCorrect: true,
      responseTimeMs: 1000,
    }),
  );

  await assertSucceeds(
    setDoc(doc(firestore, 'games/game-1/players/player-user'), {
      alias: 'Player',
      score: 100,
      joinedAt: FIXED_JOINED_AT,
      totalAnswerTimeMs: 1000,
      correctAnswers: 1,
      currentQuestionIndex: 1,
      currentQuestionStartedAt: null,
      finishedAt: FIXED_NOW,
    }),
  );
});
