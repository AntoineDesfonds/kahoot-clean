import { initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  Firestore,
  QueryDocumentSnapshot,
  Transaction,
  getFirestore,
} from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = getFirestore();
const ENTRY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_QUESTION_DURATION_SECONDS = 20;
const PLAYER_POINTS_PER_CORRECT_ANSWER = 100;
const DEFAULT_QUIZ_COVER_URL = 'assets/shapes.svg';
const DEFAULT_QUIZ_THEME_COLOR = '#0f766e';
const DEFAULT_QUIZ_TITLE = 'Session quiz';

type GameStatus = 'waiting' | 'in-progress' | 'finished';
type QuestionStatus = 'waiting' | 'in-progress' | 'review';

interface ChoiceDoc {
  text: string;
  imageUrl?: string;
}

interface QuizDoc {
  ownerId: string;
  title: string;
  description: string;
  coverImageUrl: string;
  themeColor: string;
  estimatedDurationMinutes: number;
  questionsCount?: number;
}

interface QuizQuestionDoc {
  order: number;
  text: string;
  imageUrl?: string;
  choices: ChoiceDoc[];
  correctChoiceIndex: number;
}

interface QuizQuestionPrompt {
  id: string;
  order: number;
  text: string;
  imageUrl: string;
  choices: ChoiceDoc[];
}

interface GameCodeDoc {
  gameId: string;
  hostId: string;
  status: GameStatus;
}

interface GameDoc {
  hostId: string;
  quizId: string;
  quizTitle: string;
  quizCoverImageUrl: string;
  quizThemeColor: string;
  createdAt: unknown;
  updatedAt: unknown;
  startedAt: unknown;
  finishedAt: unknown;
  status: GameStatus;
  entryCode: string;
  currentQuestionIndex: number;
  currentQuestionStatus: QuestionStatus;
  totalQuestions: number;
  currentQuestionId: string | null;
  currentQuestionText: string | null;
  currentQuestionImageUrl: string | null;
  currentQuestionChoices: ChoiceDoc[];
  questionDurationSeconds?: number;
  currentQuestionStartedAt?: unknown;
  currentQuestionEndsAt?: unknown;
  answerCount: number;
  revealedCorrectChoiceIndex: number | null;
}

interface PlayerDoc {
  alias: string;
  score: number;
  joinedAt: unknown;
  totalAnswerTimeMs?: number;
  correctAnswers?: number;
  currentQuestionIndex?: number;
  currentQuestionStartedAt?: unknown;
  finishedAt?: unknown;
}

interface ResponseDoc {
  playerId: string;
  questionId: string;
  questionIndex: number;
  selectedChoiceIndex: number;
  answeredAt: unknown;
  scored: boolean;
  isCorrect: boolean | null;
  responseTimeMs?: number | null;
}

interface CreateGameData {
  quizId: string;
}

interface CreateGameResult {
  gameId: string;
  entryCode: string;
}

interface JoinGameData {
  entryCode: string;
}

interface JoinGameResult {
  gameId: string;
  entryCode: string;
  status: GameStatus;
}

interface EnsurePlayerEntryData {
  gameId: string;
}

interface EnsurePlayerEntryResult {
  ok: true;
  gameId: string;
  status: GameStatus;
}

interface GameIdData {
  gameId: string;
}

interface SubmitAnswerData {
  gameId: string;
  selectedChoiceIndex: number;
}

interface SkipExpiredQuestionData {
  gameId: string;
  expectedQuestionIndex: number;
}

interface ListQuizQuestionsData {
  quizId: string;
}

interface ListQuizQuestionsResult {
  questions: QuizQuestionPrompt[];
}

interface PracticeQuizQuestion extends QuizQuestionPrompt {
  correctChoiceIndex: number;
}

interface GetPracticeQuizQuestionsData {
  quizId: string;
}

interface GetPracticeQuizQuestionsResult {
  questions: PracticeQuizQuestion[];
}

interface GetCurrentQuestionData {
  gameId: string;
}

interface GetCurrentQuestionResult {
  question: QuizQuestionPrompt | null;
}

interface OkResult {
  ok: true;
}

export const createGame = onCall<CreateGameData>(async (request) => {
  const uid = requireAuth(request);
  const quizId = requireNonEmptyString(request.data.quizId, 'quizId');

  const quizRef = db.doc(`quizzes/${quizId}`);
  const quizSnapshot = await quizRef.get();
  const quiz = quizSnapshot.data() as QuizDoc | undefined;

  if (!quiz) {
    throw new HttpsError('not-found', 'Quiz introuvable.');
  }

  const questions = await listSanitizedQuizQuestions(db, quizId);

  if (!questions.length) {
    throw new HttpsError(
      'failed-precondition',
      'Ajoutez au moins une question avant de lancer une partie.',
    );
  }

  const entryCode = await generateUniqueEntryCode(db);
  const alias = await resolveAlias(uid, request.auth?.token.name);
  const gameRef = db.collection('games').doc();
  const playerRef = gameRef.collection('players').doc(uid);
  const gameCodeRef = db.doc(`gameCodes/${entryCode}`);
  const batch = db.batch();

  batch.set(gameRef, {
    hostId: uid,
    quizId,
    quizTitle: sanitizeString(quiz.title) || DEFAULT_QUIZ_TITLE,
    quizCoverImageUrl: sanitizeString(quiz.coverImageUrl) || DEFAULT_QUIZ_COVER_URL,
    quizThemeColor: sanitizeString(quiz.themeColor) || DEFAULT_QUIZ_THEME_COLOR,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    startedAt: null,
    finishedAt: null,
    status: 'waiting',
    entryCode,
    currentQuestionIndex: 0,
    currentQuestionStatus: 'waiting',
    totalQuestions: questions.length,
    currentQuestionId: null,
    currentQuestionText: null,
    currentQuestionImageUrl: null,
    currentQuestionChoices: [],
    questionDurationSeconds: DEFAULT_QUESTION_DURATION_SECONDS,
    currentQuestionStartedAt: null,
    currentQuestionEndsAt: null,
    answerCount: 0,
    revealedCorrectChoiceIndex: null,
  } satisfies GameDoc);

  batch.set(gameCodeRef, {
    gameId: gameRef.id,
    hostId: uid,
    status: 'waiting',
  } satisfies GameCodeDoc);

  batch.set(
    playerRef,
    {
      alias,
      score: 0,
      joinedAt: FieldValue.serverTimestamp(),
      totalAnswerTimeMs: 0,
      correctAnswers: 0,
      currentQuestionIndex: 0,
      currentQuestionStartedAt: null,
      finishedAt: null,
    } satisfies PlayerDoc,
    { merge: true },
  );

  questions.forEach((question, index) => {
    const normalizedQuestion = {
      ...question,
      order: index,
      correctChoiceIndex: clampChoiceIndex(
        question.correctChoiceIndex,
        question.choices.length,
      ),
    };

    batch.set(
      gameRef.collection('questions').doc(String(index)),
      {
        order: normalizedQuestion.order,
        text: normalizedQuestion.text,
        imageUrl: normalizedQuestion.imageUrl,
        correctChoiceIndex: normalizedQuestion.correctChoiceIndex,
        choices: normalizedQuestion.choices,
      } satisfies QuizQuestionDoc,
    );
  });

  await batch.commit();

  return {
    gameId: gameRef.id,
    entryCode,
  } satisfies CreateGameResult;
});

export const joinGame = onCall<JoinGameData>(async (request) => {
  const uid = requireAuth(request);
  const entryCode = normalizeEntryCode(
    requireNonEmptyString(request.data.entryCode, 'entryCode'),
  );
  const gameCodeSnapshot = await db.doc(`gameCodes/${entryCode}`).get();
  const gameCode = gameCodeSnapshot.data() as GameCodeDoc | undefined;

  if (!gameCode) {
    throw new HttpsError('not-found', 'Aucune partie trouvee avec ce code.');
  }

  const gameRef = db.doc(`games/${gameCode.gameId}`);
  const gameSnapshot = await gameRef.get();
  const game = gameSnapshot.data() as GameDoc | undefined;

  if (!game) {
    throw new HttpsError('not-found', 'Partie introuvable.');
  }

  if (game.status === 'finished') {
    throw new HttpsError('failed-precondition', 'Cette partie est deja terminee.');
  }

  const entry = await ensurePlayerEntryInternal(
    gameRef,
    game,
    uid,
    request.auth?.token.name,
  );

  return {
    gameId: entry.gameId,
    entryCode,
    status: entry.status,
  } satisfies JoinGameResult;
});

export const ensurePlayerEntry = onCall<EnsurePlayerEntryData>(async (request) => {
  const uid = requireAuth(request);
  const gameId = requireNonEmptyString(request.data.gameId, 'gameId');
  const gameRef = db.doc(`games/${gameId}`);
  const gameSnapshot = await gameRef.get();
  const game = gameSnapshot.data() as GameDoc | undefined;

  if (!game) {
    throw new HttpsError('not-found', 'Partie introuvable.');
  }

  const entry = await ensurePlayerEntryInternal(
    gameRef,
    game,
    uid,
    request.auth?.token.name,
  );

  return {
    ok: true,
    gameId: entry.gameId,
    status: entry.status,
  } satisfies EnsurePlayerEntryResult;
});

export const startGame = onCall<GameIdData>(async (request) => {
  const uid = requireAuth(request);
  const gameId = requireNonEmptyString(request.data.gameId, 'gameId');
  const gameRef = db.doc(`games/${gameId}`);
  const gameCodeRef = db.doc(`gameCodes/${await resolveEntryCode(gameRef)}`);

  await db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);
    const game = gameSnapshot.data() as GameDoc | undefined;

    if (!game) {
      throw new HttpsError('not-found', 'Partie introuvable.');
    }

    if (uid !== game.hostId) {
      throw new HttpsError(
        'permission-denied',
        'Seul l hote peut demarrer la partie.',
      );
    }

    const currentPlayerSnapshot = await transaction.get(
      gameRef.collection('players').doc(uid),
    );

    if (!currentPlayerSnapshot.exists) {
      throw new HttpsError(
        'permission-denied',
        'Rejoignez la salle avec le code avant de lancer la partie.',
      );
    }

    if (game.status !== 'waiting') {
      throw new HttpsError(
        'failed-precondition',
        'Cette partie ne peut plus etre demarree.',
      );
    }

    const playersSnapshot = await transaction.get(gameRef.collection('players'));
    if (playersSnapshot.empty) {
      throw new HttpsError(
        'failed-precondition',
        'Ajoutez au moins un joueur avant de demarrer.',
      );
    }

    transaction.update(gameRef, {
      status: 'in-progress',
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      currentQuestionIndex: 0,
      currentQuestionStatus: 'in-progress',
      currentQuestionId: null,
      currentQuestionText: null,
      currentQuestionImageUrl: null,
      currentQuestionChoices: [],
      currentQuestionStartedAt: null,
      currentQuestionEndsAt: null,
      answerCount: 0,
      revealedCorrectChoiceIndex: null,
    } satisfies Partial<GameDoc>);

    transaction.set(
      gameCodeRef,
      {
        gameId: gameRef.id,
        hostId: game.hostId,
        status: 'in-progress',
      } satisfies GameCodeDoc,
      { merge: true },
    );

    for (const playerDoc of playersSnapshot.docs) {
      const player = playerDoc.data() as PlayerDoc;
      transaction.set(
        playerDoc.ref,
        {
          alias:
            typeof player.alias === 'string' && player.alias.trim().length > 0
              ? player.alias.trim()
              : playerDoc.id,
          score: 0,
          joinedAt: player.joinedAt ?? FieldValue.serverTimestamp(),
          totalAnswerTimeMs: 0,
          correctAnswers: 0,
          currentQuestionIndex: 0,
          currentQuestionStartedAt: FieldValue.serverTimestamp(),
          finishedAt: null,
        } satisfies PlayerDoc,
        { merge: true },
      );
    }
  });

  return { ok: true } satisfies OkResult;
});

export const getCurrentQuestion = onCall<GetCurrentQuestionData>(async (request) => {
  const uid = requireAuth(request);
  const gameId = requireNonEmptyString(request.data.gameId, 'gameId');
  const gameRef = db.doc(`games/${gameId}`);
  const playerRef = gameRef.collection('players').doc(uid);
  const [gameSnapshot, playerSnapshot] = await Promise.all([
    gameRef.get(),
    playerRef.get(),
  ]);

  const game = gameSnapshot.data() as GameDoc | undefined;
  const player = playerSnapshot.data() as PlayerDoc | undefined;

  if (!game || !player || game.status !== 'in-progress') {
    return { question: null } satisfies GetCurrentQuestionResult;
  }

  const currentQuestionIndex = player.currentQuestionIndex ?? 0;
  if (isPlayerFinished(player, game.totalQuestions)) {
    return { question: null } satisfies GetCurrentQuestionResult;
  }

  const storedQuestion = await getStoredGameQuestionPromptByIndex(
    gameRef,
    currentQuestionIndex,
  );
  const question =
    storedQuestion
    ?? toPromptQuestion(
      await getQuizQuestionByIndex(db, game.quizId, currentQuestionIndex),
    );

  return {
    question,
  } satisfies GetCurrentQuestionResult;
});

export const listQuizQuestions = onCall<ListQuizQuestionsData>(async (request) => {
  requireAuth(request);
  const quizId = requireNonEmptyString(request.data.quizId, 'quizId');
  const quizSnapshot = await db.doc(`quizzes/${quizId}`).get();

  if (!quizSnapshot.exists) {
    throw new HttpsError('not-found', 'Quiz introuvable.');
  }

  return {
    questions: (await listSanitizedQuizQuestions(db, quizId)).map((question) =>
      toPromptQuestion(question),
    ),
  } satisfies ListQuizQuestionsResult;
});

export const getPracticeQuizQuestions = onCall<GetPracticeQuizQuestionsData>(
  async (request) => {
    requireAuth(request);
    const quizId = requireNonEmptyString(request.data.quizId, 'quizId');
    const quizSnapshot = await db.doc(`quizzes/${quizId}`).get();

    if (!quizSnapshot.exists) {
      throw new HttpsError('not-found', 'Quiz introuvable.');
    }

    return {
      questions: await listSanitizedQuizQuestions(db, quizId),
    } satisfies GetPracticeQuizQuestionsResult;
  },
);

export const submitAnswer = onCall<SubmitAnswerData>(async (request) => {
  const uid = requireAuth(request);
  const gameId = requireNonEmptyString(request.data.gameId, 'gameId');
  const selectedChoiceIndex = requireChoiceIndex(
    request.data.selectedChoiceIndex,
    'selectedChoiceIndex',
  );
  const gameRef = db.doc(`games/${gameId}`);
  const playerRef = gameRef.collection('players').doc(uid);

  await db.runTransaction(async (transaction) => {
    const [gameSnapshot, playerSnapshot] = await Promise.all([
      transaction.get(gameRef),
      transaction.get(playerRef),
    ]);

    const game = gameSnapshot.data() as GameDoc | undefined;
    const player = playerSnapshot.data() as PlayerDoc | undefined;

    if (!game) {
      throw new HttpsError('not-found', 'Partie introuvable.');
    }

    if (!player) {
      throw new HttpsError(
        'permission-denied',
        'Vous devez avoir rejoint la partie avant de repondre.',
      );
    }

    if (game.status !== 'in-progress') {
      throw new HttpsError('failed-precondition', 'La partie nest pas en cours.');
    }

    const currentQuestionIndex = player.currentQuestionIndex ?? 0;
    if (currentQuestionIndex >= game.totalQuestions) {
      throw new HttpsError('failed-precondition', 'Vous avez deja termine cette partie.');
    }

    const question =
      (await getStoredGameQuestionByIndexInTransaction(
        transaction,
        gameRef,
        currentQuestionIndex,
      ))
      ?? (await getQuizQuestionByIndexInTransaction(
        transaction,
        game.quizId,
        currentQuestionIndex,
      ));

    if (selectedChoiceIndex >= question.choices.length) {
      throw new HttpsError(
        'invalid-argument',
        'La reponse selectionnee est invalide.',
      );
    }

    if (hasPlayerQuestionExpired(player, game)) {
      throw new HttpsError(
        'failed-precondition',
        'Le temps est ecoule pour cette question.',
      );
    }

    const responseRef = gameRef
      .collection('responses')
      .doc(`${currentQuestionIndex}_${uid}`);
    const responseSnapshot = await transaction.get(responseRef);

    if (responseSnapshot.exists) {
      throw new HttpsError('already-exists', 'Vous avez deja repondu a cette question.');
    }

    const responseTimeMs = getElapsedQuestionTimeMs(player, game);
    const isCorrect = selectedChoiceIndex === question.correctChoiceIndex;
    const nextQuestionIndex = currentQuestionIndex + 1;

    transaction.set(
      responseRef,
      {
        playerId: uid,
        questionId: question.id,
        questionIndex: currentQuestionIndex,
        selectedChoiceIndex,
        answeredAt: FieldValue.serverTimestamp(),
        scored: true,
        isCorrect,
        responseTimeMs,
      } satisfies ResponseDoc,
      { merge: false },
    );

    transaction.set(
      playerRef,
      {
        score:
          Number(player.score ?? 0)
          + (isCorrect ? PLAYER_POINTS_PER_CORRECT_ANSWER : 0),
        totalAnswerTimeMs: Number(player.totalAnswerTimeMs ?? 0) + responseTimeMs,
        correctAnswers: Number(player.correctAnswers ?? 0) + (isCorrect ? 1 : 0),
        currentQuestionIndex: nextQuestionIndex,
        currentQuestionStartedAt:
          nextQuestionIndex < game.totalQuestions ? FieldValue.serverTimestamp() : null,
        finishedAt:
          nextQuestionIndex >= game.totalQuestions ? FieldValue.serverTimestamp() : null,
      } satisfies Partial<PlayerDoc>,
      { merge: true },
    );
  });

  await finishGameIfReady(gameRef);

  return { ok: true } satisfies OkResult;
});

export const skipExpiredQuestion = onCall<SkipExpiredQuestionData>(async (request) => {
  const uid = requireAuth(request);
  const gameId = requireNonEmptyString(request.data.gameId, 'gameId');
  const expectedQuestionIndex = requireChoiceIndex(
    request.data.expectedQuestionIndex,
    'expectedQuestionIndex',
  );
  const gameRef = db.doc(`games/${gameId}`);
  const playerRef = gameRef.collection('players').doc(uid);

  await db.runTransaction(async (transaction) => {
    const [gameSnapshot, playerSnapshot] = await Promise.all([
      transaction.get(gameRef),
      transaction.get(playerRef),
    ]);

    const game = gameSnapshot.data() as GameDoc | undefined;
    const player = playerSnapshot.data() as PlayerDoc | undefined;

    if (!game || !player || game.status !== 'in-progress') {
      return;
    }

    const currentQuestionIndex = player.currentQuestionIndex ?? 0;
    if (
      currentQuestionIndex >= game.totalQuestions
      || currentQuestionIndex !== expectedQuestionIndex
      || !hasPlayerQuestionExpired(player, game)
    ) {
      return;
    }

    const responseRef = gameRef
      .collection('responses')
      .doc(`${currentQuestionIndex}_${uid}`);
    const responseSnapshot = await transaction.get(responseRef);

    if (responseSnapshot.exists) {
      return;
    }

    const skippedTimeMs = getElapsedQuestionTimeMs(player, game);
    const nextQuestionIndex = currentQuestionIndex + 1;

    transaction.set(
      playerRef,
      {
        totalAnswerTimeMs: Number(player.totalAnswerTimeMs ?? 0) + skippedTimeMs,
        currentQuestionIndex: nextQuestionIndex,
        currentQuestionStartedAt:
          nextQuestionIndex < game.totalQuestions ? FieldValue.serverTimestamp() : null,
        finishedAt:
          nextQuestionIndex >= game.totalQuestions ? FieldValue.serverTimestamp() : null,
      } satisfies Partial<PlayerDoc>,
      { merge: true },
    );
  });

  await finishGameIfReady(gameRef);

  return { ok: true } satisfies OkResult;
});

function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Vous devez etre connecte pour effectuer cette action.',
    );
  }

  return uid;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError(
      'invalid-argument',
      `Le champ ${field} est obligatoire.`,
    );
  }

  return value.trim();
}

function requireChoiceIndex(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new HttpsError(
      'invalid-argument',
      `Le champ ${field} doit etre un entier positif.`,
    );
  }

  return Number(value);
}

async function ensurePlayerEntryInternal(
  gameRef: FirebaseFirestore.DocumentReference,
  game: GameDoc,
  uid: string,
  fallbackDisplayName: unknown,
) {
  const playerRef = gameRef.collection('players').doc(uid);
  const playerSnapshot = await playerRef.get();

  if (!playerSnapshot.exists && game.status !== 'waiting') {
    throw new HttpsError(
      'failed-precondition',
      'La partie a deja commence. Les nouveaux joueurs ne peuvent plus entrer.',
    );
  }

  const alias = await resolveAlias(uid, fallbackDisplayName);

  if (playerSnapshot.exists) {
    await playerRef.set(
      {
        alias,
      } satisfies Partial<PlayerDoc>,
      { merge: true },
    );
  } else {
    await playerRef.set(
      {
        alias,
        score: 0,
        joinedAt: FieldValue.serverTimestamp(),
        totalAnswerTimeMs: 0,
        correctAnswers: 0,
        currentQuestionIndex: 0,
        currentQuestionStartedAt: null,
        finishedAt: null,
      } satisfies PlayerDoc,
      { merge: false },
    );
  }

  return {
    gameId: gameRef.id,
    status: game.status,
  };
}

async function finishGameIfReady(
  gameRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);
    const game = gameSnapshot.data() as GameDoc | undefined;

    if (!game || game.status === 'finished') {
      return;
    }

    const playersSnapshot = await transaction.get(gameRef.collection('players'));
    if (playersSnapshot.empty) {
      return;
    }

    const allPlayersFinished = playersSnapshot.docs.every((playerSnapshot) =>
      isPlayerFinished(playerSnapshot.data() as PlayerDoc, game.totalQuestions),
    );

    if (!allPlayersFinished) {
      return;
    }

    transaction.set(
      db.doc(`gameCodes/${game.entryCode}`),
      {
        gameId: gameRef.id,
        hostId: game.hostId,
        status: 'finished',
      } satisfies GameCodeDoc,
      { merge: true },
    );

    transaction.update(gameRef, {
      status: 'finished',
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    } satisfies Partial<GameDoc>);
  });
}

function isPlayerFinished(player: PlayerDoc, totalQuestions: number): boolean {
  return (
    player.finishedAt != null
    || Number(player.currentQuestionIndex ?? 0) >= totalQuestions
  );
}

function hasPlayerQuestionExpired(player: PlayerDoc, game: GameDoc): boolean {
  const startedAtMs = resolveQuestionStartMs(player, game);
  if (startedAtMs === null) {
    return false;
  }

  return Date.now() >= startedAtMs + getQuestionDurationMs(game);
}

function getElapsedQuestionTimeMs(player: PlayerDoc, game: GameDoc): number {
  const questionDurationMs = getQuestionDurationMs(game);
  const startedAtMs = resolveQuestionStartMs(player, game);

  if (startedAtMs === null) {
    return questionDurationMs;
  }

  return Math.max(
    0,
    Math.min(Date.now() - startedAtMs, questionDurationMs),
  );
}

function getQuestionDurationMs(game: GameDoc): number {
  return Number(game.questionDurationSeconds ?? DEFAULT_QUESTION_DURATION_SECONDS) * 1000;
}

function resolveQuestionStartMs(player: PlayerDoc, game: GameDoc): number | null {
  const playerStartedAt = toMillis(player.currentQuestionStartedAt);
  if (playerStartedAt !== null) {
    return playerStartedAt;
  }

  const gameStartedAt = toMillis(game.startedAt);
  return gameStartedAt;
}

function toMillis(value: unknown): number | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

async function resolveEntryCode(
  gameRef: FirebaseFirestore.DocumentReference,
): Promise<string> {
  const snapshot = await gameRef.get();
  const game = snapshot.data() as GameDoc | undefined;

  if (!game) {
    throw new HttpsError('not-found', 'Partie introuvable.');
  }

  return game.entryCode;
}

async function generateUniqueEntryCode(firestore: Firestore): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const entryCode = randomEntryCode();
    const snapshot = await firestore.doc(`gameCodes/${entryCode}`).get();

    if (!snapshot.exists) {
      return entryCode;
    }
  }

  throw new HttpsError(
    'internal',
    'Impossible de generer un code de partie unique.',
  );
}

async function getQuizQuestionByIndex(
  firestore: Firestore,
  quizId: string,
  questionIndex: number,
): Promise<PracticeQuizQuestion> {
  const question = (await listSanitizedQuizQuestions(firestore, quizId))[questionIndex];

  if (!question) {
    throw new HttpsError(
      'not-found',
      'Impossible de retrouver la question demandee.',
    );
  }

  return question;
}

async function getQuizQuestionByIndexInTransaction(
  transaction: Transaction,
  quizId: string,
  questionIndex: number,
): Promise<PracticeQuizQuestion> {
  const question = (
    await listSanitizedQuizQuestionsInTransaction(transaction, quizId)
  )[questionIndex];

  if (!question) {
    throw new HttpsError(
      'not-found',
      'Impossible de retrouver la question demandee.',
    );
  }

  return question;
}

async function resolveAlias(
  uid: string,
  fallbackDisplayName: unknown,
): Promise<string> {
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const alias = userSnapshot.data()?.['alias'];

  if (typeof alias === 'string' && alias.trim().length > 0) {
    return alias.trim();
  }

  if (typeof fallbackDisplayName === 'string' && fallbackDisplayName.trim().length > 0) {
    return fallbackDisplayName.trim();
  }

  return uid;
}

async function listSanitizedQuizQuestions(
  firestore: Firestore,
  quizId: string,
): Promise<PracticeQuizQuestion[]> {
  const snapshot = await firestore.collection(`quizzes/${quizId}/questions`).get();

  return reindexQuestions(
    snapshot.docs.map((questionSnapshot, index) =>
      sanitizePracticeQuestion(
        questionSnapshot as QueryDocumentSnapshot<QuizQuestionDoc>,
        index,
      ),
    ),
  );
}

async function listSanitizedQuizQuestionsInTransaction(
  transaction: Transaction,
  quizId: string,
): Promise<PracticeQuizQuestion[]> {
  const snapshot = await transaction.get(db.collection(`quizzes/${quizId}/questions`));

  return reindexQuestions(
    snapshot.docs.map((questionSnapshot, index) =>
      sanitizePracticeQuestion(
        questionSnapshot as QueryDocumentSnapshot<QuizQuestionDoc>,
        index,
      ),
    ),
  );
}

async function getStoredGameQuestionPromptByIndex(
  gameRef: FirebaseFirestore.DocumentReference,
  questionIndex: number,
): Promise<QuizQuestionPrompt | null> {
  const snapshot = await gameRef.collection('questions').doc(String(questionIndex)).get();

  if (!snapshot.exists) {
    return null;
  }

  return toPromptQuestion(
    sanitizeStoredQuestion(
      snapshot.id,
      snapshot.data() as Partial<QuizQuestionDoc> | undefined,
      questionIndex,
    ),
  );
}

async function getStoredGameQuestionByIndexInTransaction(
  transaction: Transaction,
  gameRef: FirebaseFirestore.DocumentReference,
  questionIndex: number,
): Promise<PracticeQuizQuestion | null> {
  const snapshot = await transaction.get(
    gameRef.collection('questions').doc(String(questionIndex)),
  );

  if (!snapshot.exists) {
    return null;
  }

  const question = snapshot.data() as Partial<QuizQuestionDoc> | undefined;
  if (!hasExplicitChoiceIndex(question?.correctChoiceIndex)) {
    return null;
  }

  return sanitizeStoredQuestion(snapshot.id, question, questionIndex);
}

function reindexQuestions(
  questions: PracticeQuizQuestion[],
): PracticeQuizQuestion[] {
  return questions
    .map((question, originalIndex) => ({ question, originalIndex }))
    .sort(
      (left, right) =>
        left.question.order - right.question.order
        || left.originalIndex - right.originalIndex,
    )
    .map(({ question }, index) => ({
      ...question,
      order: index,
      correctChoiceIndex: clampChoiceIndex(
        question.correctChoiceIndex,
        question.choices.length,
      ),
    }));
}

function sanitizeChoices(choices: unknown): ChoiceDoc[] {
  const normalizedChoices = Array.isArray(choices)
    ? choices
      .slice(0, 6)
      .map((choice, index) => sanitizeChoice(choice, index))
      .filter((choice) => choice.text.length > 0 || (choice.imageUrl ?? '').length > 0)
    : [];

  while (normalizedChoices.length < 2) {
    normalizedChoices.push({
      text: `Reponse ${normalizedChoices.length + 1}`,
      imageUrl: '',
    });
  }

  return normalizedChoices;
}

function sanitizeChoice(choice: unknown, index: number): ChoiceDoc {
  if (typeof choice === 'string') {
    const text = choice.trim();
    return {
      text: text || `Reponse ${index + 1}`,
      imageUrl: '',
    };
  }

  const entry = choice && typeof choice === 'object'
    ? choice as Record<string, unknown>
    : {};
  const imageUrl = sanitizeString(entry['imageUrl']);
  const text = sanitizeString(entry['text']) || (imageUrl ? `Reponse ${index + 1}` : '');

  return {
    text,
    imageUrl,
  };
}

function sanitizePracticeQuestion(
  questionSnapshot: QueryDocumentSnapshot<QuizQuestionDoc>,
  fallbackOrder = 0,
): PracticeQuizQuestion {
  return sanitizeStoredQuestion(
    questionSnapshot.id,
    questionSnapshot.data() as Partial<QuizQuestionDoc>,
    fallbackOrder,
  );
}

function sanitizeStoredQuestion(
  id: string,
  question: Partial<QuizQuestionDoc> | undefined,
  fallbackOrder: number,
): PracticeQuizQuestion {
  const choices = sanitizeChoices(question?.choices);

  return {
    id,
    order: toSafeInteger(question?.order, fallbackOrder),
    text: sanitizeString(question?.text) || `Question ${fallbackOrder + 1}`,
    imageUrl: sanitizeString(question?.imageUrl),
    choices,
    correctChoiceIndex: clampChoiceIndex(
      toSafeInteger(question?.correctChoiceIndex, 0),
      choices.length,
    ),
  };
}

function toPromptQuestion(question: PracticeQuizQuestion): QuizQuestionPrompt {
  return {
    id: question.id,
    order: question.order,
    text: question.text,
    imageUrl: question.imageUrl,
    choices: question.choices,
  };
}

function sanitizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toSafeInteger(value: unknown, fallback: number): number {
  const parsedValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsedValue) ? parsedValue : fallback;
}

function clampChoiceIndex(value: number, choicesLength: number): number {
  if (choicesLength <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(value, choicesLength - 1));
}

function hasExplicitChoiceIndex(value: unknown): boolean {
  const normalizedValue = toSafeInteger(value, Number.NaN);
  return Number.isInteger(normalizedValue) && normalizedValue >= 0;
}

function randomEntryCode(): string {
  return Array.from({ length: 6 }, () =>
    ENTRY_CODE_ALPHABET[Math.floor(Math.random() * ENTRY_CODE_ALPHABET.length)],
  ).join('');
}

function normalizeEntryCode(entryCode: string): string {
  return entryCode.replace(/\s+/g, '').toUpperCase();
}
