import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'kahoot-fcbbc';
const AUTH_EMULATOR_BASE_URL =
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FUNCTIONS_EMULATOR_BASE_URL =
  `http://127.0.0.1:5001/${PROJECT_ID}/us-central1`;

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

test('callable flow keeps answers private and scores on the server', async () => {
  const hostAuth = await signUpTestUser('host');
  const playerAuth = await signUpTestUser('player');

  await seedQuizAndProfiles(hostAuth.uid, playerAuth.uid);

  const createGame = await callFunction('createGame', hostAuth.idToken, {
    quizId: 'quiz-fn-1',
  });

  assert.equal(typeof createGame.gameId, 'string');
  assert.equal(createGame.entryCode.length, 6);

  const joinGame = await callFunction('joinGame', playerAuth.idToken, {
    entryCode: createGame.entryCode,
  });

  assert.equal(joinGame.gameId, createGame.gameId);
  assert.equal(joinGame.status, 'waiting');

  await callFunction('startGame', hostAuth.idToken, {
    gameId: createGame.gameId,
  });

  const currentQuestion = await callFunction(
    'getCurrentQuestion',
    playerAuth.idToken,
    {
      gameId: createGame.gameId,
    },
  );

  assert.equal(currentQuestion.question.text, 'Quelle est la capitale du Japon ?');
  assert.equal('correctChoiceIndex' in currentQuestion.question, false);

  await callFunction('submitAnswer', playerAuth.idToken, {
    gameId: createGame.gameId,
    selectedChoiceIndex: 1,
  });

  const playerFirestore = testEnv.authenticatedContext(playerAuth.uid).firestore();
  const playerSnapshot = await getDoc(
    doc(playerFirestore, `games/${createGame.gameId}/players/${playerAuth.uid}`),
  );
  const responseSnapshot = await getDoc(
    doc(
      playerFirestore,
      `games/${createGame.gameId}/responses/0_${playerAuth.uid}`,
    ),
  );

  assert.equal(playerSnapshot.exists(), true);
  assert.equal(playerSnapshot.data().score, 100);
  assert.equal(playerSnapshot.data().correctAnswers, 1);
  assert.equal(playerSnapshot.data().currentQuestionIndex, 1);

  assert.equal(responseSnapshot.exists(), true);
  assert.equal(responseSnapshot.data().isCorrect, true);
  assert.equal(responseSnapshot.data().selectedChoiceIndex, 1);
});

test('non-owner can create a multiplayer game from a shared quiz', async () => {
  const hostAuth = await signUpTestUser('host');
  const playerAuth = await signUpTestUser('player');

  await seedQuizAndProfiles(hostAuth.uid, playerAuth.uid);

  const createdGame = await callFunction('createGame', playerAuth.idToken, {
    quizId: 'quiz-fn-1',
  });

  assert.equal(typeof createdGame.gameId, 'string');
  assert.equal(createdGame.entryCode.length, 6);
  const playerFirestore = testEnv.authenticatedContext(playerAuth.uid).firestore();
  const createdGameSnapshot = await getDoc(
    doc(playerFirestore, `games/${createdGame.gameId}`),
  );
  assert.equal(createdGameSnapshot.exists(), true);
  assert.equal(createdGameSnapshot.data().hostId, playerAuth.uid);
});

test('shared practice questions stay available through callable access', async () => {
  const hostAuth = await signUpTestUser('host');
  const playerAuth = await signUpTestUser('player');

  await seedQuizAndProfiles(hostAuth.uid, playerAuth.uid);

  const practiceQuestions = await callFunction(
    'getPracticeQuizQuestions',
    playerAuth.idToken,
    {
      quizId: 'quiz-fn-1',
    },
  );

  assert.equal(practiceQuestions.questions.length, 1);
  assert.equal(
    practiceQuestions.questions[0].text,
    'Quelle est la capitale du Japon ?',
  );
  assert.equal(practiceQuestions.questions[0].correctChoiceIndex, 1);
});

test('legacy quiz documents still support practice and multiplayer launch', async () => {
  const hostAuth = await signUpTestUser('host');
  const playerAuth = await signUpTestUser('player');

  await seedLegacyQuizAndProfiles(hostAuth.uid, playerAuth.uid);

  const promptQuestions = await callFunction(
    'listQuizQuestions',
    playerAuth.idToken,
    {
      quizId: 'quiz-fn-legacy',
    },
  );
  const practiceQuestions = await callFunction(
    'getPracticeQuizQuestions',
    playerAuth.idToken,
    {
      quizId: 'quiz-fn-legacy',
    },
  );
  const createdGame = await callFunction('createGame', hostAuth.idToken, {
    quizId: 'quiz-fn-legacy',
  });

  await callFunction('startGame', hostAuth.idToken, {
    gameId: createdGame.gameId,
  });

  const currentQuestion = await callFunction(
    'getCurrentQuestion',
    hostAuth.idToken,
    {
      gameId: createdGame.gameId,
    },
  );

  assert.equal(promptQuestions.questions.length, 1);
  assert.equal(practiceQuestions.questions.length, 1);
  assert.equal(promptQuestions.questions[0].text, 'Quelle planète est rouge ?');
  assert.equal(practiceQuestions.questions[0].correctChoiceIndex, 1);
  assert.equal(promptQuestions.questions[0].choices.length, 3);
  assert.equal(promptQuestions.questions[0].choices[1].text, 'Mars');
  assert.equal(currentQuestion.question.text, 'Quelle planète est rouge ?');
  assert.equal(currentQuestion.question.choices.length, 3);
  assert.equal(currentQuestion.question.choices[0].text, 'Terre');
});

async function seedQuizAndProfiles(hostUid, playerUid) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await setDoc(doc(firestore, 'users/' + hostUid), {
      alias: 'Host',
    });
    await setDoc(doc(firestore, 'users/' + playerUid), {
      alias: 'Player',
    });

    await setDoc(doc(firestore, 'quizzes/quiz-fn-1'), {
      ownerId: hostUid,
      title: 'Capitales',
      description: 'Quiz de test',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 3,
      questionsCount: 1,
    });

    await setDoc(doc(firestore, 'quizzes/quiz-fn-1/questions/question-1'), {
      order: 0,
      text: 'Quelle est la capitale du Japon ?',
      imageUrl: 'assets/questions/tokyo.svg',
      correctChoiceIndex: 1,
      choices: [
        { text: 'Osaka', imageUrl: '' },
        { text: 'Tokyo', imageUrl: '' },
        { text: 'Kyoto', imageUrl: '' },
        { text: 'Sapporo', imageUrl: '' },
      ],
    });
  });
}

async function seedLegacyQuizAndProfiles(hostUid, playerUid) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();

    await setDoc(doc(firestore, 'users/' + hostUid), {
      alias: 'Host Legacy',
    });
    await setDoc(doc(firestore, 'users/' + playerUid), {
      alias: 'Player Legacy',
    });

    await setDoc(doc(firestore, 'quizzes/quiz-fn-legacy'), {
      ownerId: hostUid,
      title: 'Quiz legacy',
      description: 'Quiz avec ancien format',
      estimatedDurationMinutes: 3,
      questionsCount: 1,
    });

    await setDoc(doc(firestore, 'quizzes/quiz-fn-legacy/questions/question-1'), {
      text: 'Quelle planète est rouge ?',
      correctChoiceIndex: '1',
      choices: [
        'Terre',
        { text: 'Mars' },
        { imageUrl: 'assets/questions/jupiter.svg', text: 'Jupiter' },
      ],
    });
  });
}

async function signUpTestUser(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await fetch(
    `${AUTH_EMULATOR_BASE_URL}/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: 'secret123',
        returnSecureToken: true,
      }),
    },
  );

  const body = await response.json();
  assert.equal(response.ok, true, body.error?.message ?? 'signUp failed');

  return {
    uid: body.localId,
    idToken: body.idToken,
  };
}

async function callFunction(name, idToken, data) {
  const response = await fetch(`${FUNCTIONS_EMULATOR_BASE_URL}/${name}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? `${name} failed`);
  }

  return body.result;
}
