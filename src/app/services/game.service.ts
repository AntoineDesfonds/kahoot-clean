import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';
import { Auth, User } from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from '@angular/fire/firestore';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';
import { Choice } from '../models/choice';
import {
  CreatedGameSession,
  Game,
  GamePlayer,
  JoinedGameSession,
} from '../models/game';
import { GameQuestion } from '../models/game-question';
import { Question } from '../models/question';
import { DEFAULT_QUIZ_COVER_URL } from './quiz.service';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';

interface GameCode {
  gameId: string;
  hostId: string;
  status: Game['status'];
}

interface QuizBrandSnapshot {
  ownerId: string;
  title?: string;
  coverImageUrl?: string;
  themeColor?: string;
}

const DEFAULT_QUESTION_DURATION_SECONDS = 20;
const PLAYER_POINTS_PER_CORRECT_ANSWER = 100;

@Injectable({
  providedIn: 'root',
})
export class GameService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly functions = inject(Functions);
  private readonly injector = inject(EnvironmentInjector);
  private readonly userService = inject(UserService);

  async createGame(quizId: string): Promise<CreatedGameSession> {
    if (!this.auth.currentUser) {
      throw new Error('Vous devez etre connecte pour creer une partie.');
    }

    await this.ensureQuizHasCoverImage(quizId);

    if (!environment.useCallableGameFunctions) {
      return this.createGameDirectly(quizId);
    }

    try {
      return await this.callFunction<{ quizId: string }, CreatedGameSession>(
        'createGame',
        { quizId },
      );
    } catch (error) {
      if (!this.shouldFallbackToDirectCreate(error)) {
        throw error;
      }

      return this.createGameDirectly(quizId);
    }
  }

  async joinGame(entryCode: string): Promise<JoinedGameSession> {
    if (!this.auth.currentUser) {
      throw new Error('Vous devez etre connecte pour rejoindre une partie.');
    }

    const normalizedEntryCode = this.normalizeEntryCode(entryCode);

    if (!environment.useCallableGameFunctions) {
      return this.joinGameDirectly(normalizedEntryCode);
    }

    try {
      return await this.callFunction<{ entryCode: string }, JoinedGameSession>(
        'joinGame',
        { entryCode: normalizedEntryCode },
      );
    } catch (error) {
      if (!this.shouldFallbackToDirectFlow(error)) {
        throw error;
      }

      return this.joinGameDirectly(normalizedEntryCode);
    }
  }

  async ensureCurrentUserPlayerEntry(gameId: string): Promise<void> {
    if (!environment.useCallableGameFunctions) {
      await this.ensureCurrentUserPlayerEntryDirect(gameId);
      return;
    }

    try {
      await this.callFunction<{ gameId: string }, { ok: true; gameId: string }>(
        'ensurePlayerEntry',
        { gameId },
      );
    } catch (error) {
      if (!this.shouldFallbackToDirectFlow(error)) {
        throw error;
      }

      await this.ensureCurrentUserPlayerEntryDirect(gameId);
    }
  }

  async startGame(gameId: string): Promise<void> {
    if (!this.auth.currentUser) {
      throw new Error('Vous devez etre connecte pour lancer une partie.');
    }

    if (!environment.useCallableGameFunctions) {
      await this.startGameDirectly(gameId);
      return;
    }

    try {
      await this.callFunction<{ gameId: string }, { ok: true }>('startGame', { gameId });
    } catch (error) {
      if (!this.shouldFallbackToDirectFlow(error)) {
        throw error;
      }

      await this.startGameDirectly(gameId);
    }
  }

  async getCurrentQuestion(gameId: string): Promise<GameQuestion | null> {
    if (!this.auth.currentUser) {
      return null;
    }

    if (!environment.useCallableGameFunctions) {
      return this.getCurrentQuestionDirectly(gameId);
    }

    try {
      const result = await this.callFunction<
        { gameId: string },
        { question: GameQuestion | null }
      >('getCurrentQuestion', { gameId });

      if (!result.question) {
        return null;
      }

      return this.toGameQuestion(
        result.question.id,
        result.question as Partial<Question>,
        result.question.order ?? 0,
      );
    } catch (error) {
      if (!this.shouldFallbackToDirectFlow(error)) {
        throw error;
      }

      return this.getCurrentQuestionDirectly(gameId);
    }
  }

  async submitAnswer(
    gameId: string,
    selectedChoiceIndex: number,
  ): Promise<void> {
    if (!this.auth.currentUser) {
      throw new Error('Vous devez etre connecte pour repondre.');
    }

    if (!environment.useCallableGameFunctions) {
      await this.submitAnswerDirectly(gameId, selectedChoiceIndex);
      return;
    }

    try {
      await this.callFunction<
        { gameId: string; selectedChoiceIndex: number },
        { ok: true }
      >('submitAnswer', { gameId, selectedChoiceIndex });
    } catch (error) {
      if (!this.shouldFallbackToDirectFlow(error)) {
        throw error;
      }

      await this.submitAnswerDirectly(gameId, selectedChoiceIndex);
    }
  }

  async skipExpiredQuestion(
    gameId: string,
    expectedQuestionIndex: number,
  ): Promise<void> {
    if (!this.auth.currentUser) {
      throw new Error('Vous devez etre connecte pour jouer.');
    }

    if (!environment.useCallableGameFunctions) {
      await this.skipExpiredQuestionDirectly(gameId, expectedQuestionIndex);
      return;
    }

    try {
      await this.callFunction<
        { gameId: string; expectedQuestionIndex: number },
        { ok: true }
      >('skipExpiredQuestion', { gameId, expectedQuestionIndex });
    } catch (error) {
      if (!this.shouldFallbackToDirectFlow(error)) {
        throw error;
      }

      await this.skipExpiredQuestionDirectly(gameId, expectedQuestionIndex);
    }
  }

  async completeGameIfReady(gameId: string): Promise<void> {
    const game = await this.getGame(gameId);

    if (game.status === 'finished') {
      return;
    }

    const playersSnapshot = await getDocs(
      collection(this.firestore, `games/${gameId}/players`),
    );

    if (playersSnapshot.empty) {
      return;
    }

    const allPlayersFinished = playersSnapshot.docs.every((playerDoc) => {
      const playerData = playerDoc.data();
      const currentQuestionIndex = Number(
        playerData['currentQuestionIndex'] ?? 0,
      );

      return (
        currentQuestionIndex >= game.totalQuestions ||
        playerData['finishedAt'] != null
      );
    });

    if (!allPlayersFinished) {
      return;
    }

    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, `games/${gameId}`), {
      status: 'finished',
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(this.firestore, `gameCodes/${game.entryCode}`), {
      status: 'finished',
    });
    await batch.commit();
  }

  watchGame(gameId: string): Observable<Game | null> {
    return this.runInContext(
      () =>
        docData(doc(this.firestore, `games/${gameId}`), {
          idField: 'id',
        }) as Observable<Record<string, unknown> | undefined>,
    ).pipe(
      map((game) => (game ? this.normalizeGame(game as unknown as Game) : null)),
    );
  }

  watchPlayers(gameId: string): Observable<GamePlayer[]> {
    return this.runInContext(
      () =>
        collectionData(collection(this.firestore, `games/${gameId}/players`), {
          idField: 'userId',
        }) as Observable<GamePlayer[]>,
    ).pipe(
      switchMap((players) => {
        if (!players.length) {
          return of([]);
        }

        return combineLatest(
          players.map((player) =>
            this.userService.getProfile(player.userId).pipe(
              map((profile) =>
                this.normalizePlayer({
                  ...player,
                  alias: profile?.alias?.trim() || player.alias,
                }),
              ),
            ),
          ),
        );
      }),
      map((players) =>
        players.sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }

          if ((right.correctAnswers ?? 0) !== (left.correctAnswers ?? 0)) {
            return (right.correctAnswers ?? 0) - (left.correctAnswers ?? 0);
          }

          if (
            (right.currentQuestionIndex ?? 0) !== (left.currentQuestionIndex ?? 0)
          ) {
            return (
              (right.currentQuestionIndex ?? 0)
              - (left.currentQuestionIndex ?? 0)
            );
          }

          if ((left.totalAnswerTimeMs ?? 0) !== (right.totalAnswerTimeMs ?? 0)) {
            return (
              (left.totalAnswerTimeMs ?? 0) - (right.totalAnswerTimeMs ?? 0)
            );
          }

          const leftFinishedAt =
            left.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const rightFinishedAt =
            right.finishedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          if (leftFinishedAt !== rightFinishedAt) {
            return leftFinishedAt - rightFinishedAt;
          }

          return left.joinedAt.getTime() - right.joinedAt.getTime();
        }),
      ),
    );
  }

  describeError(error: unknown, fallback: string): string {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';

    switch (code) {
      case 'permission-denied':
      case 'firestore/permission-denied':
      case 'functions/permission-denied':
        return 'Vous n avez pas acces a cette partie pour le moment.';
      case 'not-found':
      case 'firestore/not-found':
      case 'functions/not-found':
        return 'Cette partie est introuvable.';
      case 'unavailable':
      case 'firestore/unavailable':
      case 'functions/unavailable':
        return 'Le service de partie est temporairement indisponible.';
      case 'internal':
      case 'functions/internal':
      case 'unknown':
      case 'functions/unknown':
        return fallback;
      default:
        break;
    }

    if (
      error
      && typeof error === 'object'
      && 'message' in error
      && typeof error.message === 'string'
      && error.message.trim().length > 0
      && error.message.trim().toLowerCase() !== 'internal'
    ) {
      return error.message.trim();
    }

    return fallback;
  }

  private async callFunction<Input, Output>(
    name: string,
    data: Input,
  ): Promise<Output> {
    const callable = this.runInContext(
      () => httpsCallable<Input, Output>(this.functions, name),
    );
    const result = await callable(data);
    return result.data;
  }

  private async ensureQuizHasCoverImage(quizId: string): Promise<void> {
    const quizRef = doc(this.firestore, `quizzes/${quizId}`);
    const quizSnapshot = await getDoc(quizRef);
    const quiz = quizSnapshot.data() as QuizBrandSnapshot | undefined;

    if (!quiz) {
      throw new Error('Quiz introuvable.');
    }

    if (quiz.ownerId !== this.auth.currentUser?.uid) {
      return;
    }

    if (typeof quiz.coverImageUrl === 'string' && quiz.coverImageUrl.trim()) {
      return;
    }

    await setDoc(
      quizRef,
      {
        coverImageUrl: DEFAULT_QUIZ_COVER_URL,
      },
      { merge: true },
    );
  }

  private async createGameDirectly(
    quizId: string,
  ): Promise<CreatedGameSession> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour creer une partie.');
    }

    const quizRef = doc(this.firestore, `quizzes/${quizId}`);
    const quizSnapshot = await getDoc(quizRef);
    const quiz = quizSnapshot.data() as QuizBrandSnapshot | undefined;

    if (!quiz) {
      throw new Error('Quiz introuvable.');
    }

    const questionsSnapshot = await getDocs(
      query(collection(quizRef, 'questions'), orderBy('order', 'asc')),
    );

    if (questionsSnapshot.empty) {
      throw new Error('Ajoutez au moins une question avant de lancer une partie.');
    }

    const entryCode = await this.generateUniqueEntryCode();
    const alias = await this.resolveAlias(user);
    const gameRef = doc(collection(this.firestore, 'games'));
    const gameCodeRef = doc(this.firestore, `gameCodes/${entryCode}`);
    const gameCoverImageUrl =
      quiz.coverImageUrl?.trim() || DEFAULT_QUIZ_COVER_URL;
    const gameThemeColor = quiz.themeColor?.trim() || '#0f766e';
    const gameTitle = quiz.title?.trim() || 'Session quiz';

    const batch = writeBatch(this.firestore);
    batch.set(gameRef, {
      hostId: user.uid,
      quizId,
      quizTitle: gameTitle,
      quizCoverImageUrl: gameCoverImageUrl,
      quizThemeColor: gameThemeColor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      startedAt: null,
      finishedAt: null,
      status: 'waiting',
      entryCode,
      currentQuestionIndex: 0,
      currentQuestionStatus: 'waiting',
      totalQuestions: questionsSnapshot.size,
      currentQuestionId: null,
      currentQuestionText: null,
      currentQuestionImageUrl: null,
      currentQuestionChoices: [],
      questionDurationSeconds: DEFAULT_QUESTION_DURATION_SECONDS,
      currentQuestionStartedAt: null,
      currentQuestionEndsAt: null,
      answerCount: 0,
      revealedCorrectChoiceIndex: null,
    });
    batch.set(gameCodeRef, {
      gameId: gameRef.id,
      hostId: user.uid,
      status: 'waiting',
    });
    batch.set(doc(this.firestore, `games/${gameRef.id}/players/${user.uid}`), {
      alias,
      score: 0,
      joinedAt: serverTimestamp(),
      totalAnswerTimeMs: 0,
      correctAnswers: 0,
      currentQuestionIndex: 0,
      currentQuestionStartedAt: null,
      finishedAt: null,
    });

    questionsSnapshot.docs.forEach((questionSnapshot, index) => {
      const question = this.normalizeQuestion(
        questionSnapshot.data() as Partial<Question>,
        questionSnapshot.id,
        index,
      );

      batch.set(
        doc(this.firestore, `games/${gameRef.id}/questions/${index}`),
        {
          order: index,
          text: question.text,
          imageUrl: question.imageUrl,
          correctChoiceIndex: question.correctChoiceIndex,
          choices: question.choices,
        },
      );
    });

    await batch.commit();

    return {
      gameId: gameRef.id,
      entryCode,
    };
  }

  private async joinGameDirectly(
    entryCode: string,
  ): Promise<JoinedGameSession> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour rejoindre une partie.');
    }

    const gameCodeSnapshot = await getDoc(
      doc(this.firestore, `gameCodes/${entryCode}`),
    );
    const gameCode = gameCodeSnapshot.data() as GameCode | undefined;

    if (!gameCode) {
      throw new Error('Aucune partie trouvee avec ce code.');
    }

    if (gameCode.status === 'finished') {
      throw new Error('Cette partie est deja terminee.');
    }

    const gameId = gameCode.gameId;
    const playerRef = doc(this.firestore, `games/${gameId}/players/${user.uid}`);
    const playerSnapshot = await getDoc(playerRef);
    const playerExists = playerSnapshot.exists();

    if (!playerExists) {
      if (gameCode.status !== 'waiting') {
        throw new Error(
          'La partie a deja commence. Les nouveaux joueurs ne peuvent plus entrer.',
        );
      }

      await this.writePlayerEntry(gameId, user, 'waiting');
      await this.confirmCurrentUserPlayer(gameId, user.uid);
    }

    const game = await this.getGame(gameId);

    return {
      gameId,
      entryCode,
      status: game.status,
    };
  }

  private async ensureCurrentUserPlayerEntryDirect(gameId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour participer a cette partie.');
    }

    const playerRef = doc(this.firestore, `games/${gameId}/players/${user.uid}`);
    const playerSnapshot = await getDoc(playerRef);

    if (playerSnapshot.exists()) {
      return;
    }

    await this.writePlayerEntry(gameId, user, 'waiting');
    await this.confirmCurrentUserPlayer(gameId, user.uid);
  }

  private async startGameDirectly(gameId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour lancer une partie.');
    }

    const game = await this.getGame(gameId);
    if (game.hostId !== user.uid) {
      throw new Error('Seul l hote peut demarrer la partie.');
    }

    if (game.status !== 'waiting') {
      throw new Error('Cette partie ne peut plus etre demarree.');
    }

    const playersSnapshot = await getDocs(
      collection(this.firestore, `games/${gameId}/players`),
    );

    if (playersSnapshot.empty) {
      throw new Error('Ajoutez au moins un joueur avant de demarrer.');
    }

    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, `games/${gameId}`), {
      status: 'in-progress',
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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
    });
    batch.set(
      doc(this.firestore, `gameCodes/${game.entryCode}`),
      {
        gameId,
        hostId: game.hostId,
        status: 'in-progress',
      },
      { merge: true },
    );

    for (const playerDoc of playersSnapshot.docs) {
      const player = this.normalizePlayer({
        userId: playerDoc.id,
        ...(playerDoc.data() as Omit<GamePlayer, 'userId'>),
      } as GamePlayer);
      batch.set(
        playerDoc.ref,
        {
          alias: player.alias?.trim() || playerDoc.id,
          score: 0,
          joinedAt: player.joinedAt,
          totalAnswerTimeMs: 0,
          correctAnswers: 0,
          currentQuestionIndex: 0,
          currentQuestionStartedAt: serverTimestamp(),
          finishedAt: null,
        },
        { merge: true },
      );
    }

    await batch.commit();
  }

  private async getCurrentQuestionDirectly(
    gameId: string,
  ): Promise<GameQuestion | null> {
    const user = this.auth.currentUser;
    if (!user) {
      return null;
    }

    const game = await this.getGame(gameId);
    const playerSnapshot = await getDoc(
      doc(this.firestore, `games/${gameId}/players/${user.uid}`),
    );

    if (!playerSnapshot.exists() || game.status !== 'in-progress') {
      return null;
    }

    const player = this.normalizePlayer({
      userId: user.uid,
      ...(playerSnapshot.data() as Omit<GamePlayer, 'userId'>),
    } as GamePlayer);

    if (this.isPlayerFinished(player, game.totalQuestions)) {
      return null;
    }

    const question = await this.getStoredGameQuestion(gameId, player.currentQuestionIndex ?? 0);
    return question
      ? this.toGameQuestion(question.id, question, question.order ?? 0)
      : null;
  }

  private async submitAnswerDirectly(
    gameId: string,
    selectedChoiceIndex: number,
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour repondre.');
    }

    await runTransaction(this.firestore, async (transaction) => {
      const gameRef = doc(this.firestore, `games/${gameId}`);
      const playerRef = doc(this.firestore, `games/${gameId}/players/${user.uid}`);
      const [gameSnapshot, playerSnapshot] = await Promise.all([
        transaction.get(gameRef),
        transaction.get(playerRef),
      ]);

      const rawGame = gameSnapshot.data() as Omit<Game, 'id'> | undefined;
      if (!rawGame) {
        throw new Error('Partie introuvable.');
      }

      if (!playerSnapshot.exists()) {
        throw new Error(
          'Vous devez avoir rejoint la partie avant de repondre.',
        );
      }

      const game = this.normalizeGame({
        id: gameSnapshot.id,
        ...rawGame,
      } as Game);
      const player = this.normalizePlayer({
        userId: user.uid,
        ...(playerSnapshot.data() as Omit<GamePlayer, 'userId'>),
      } as GamePlayer);

      if (game.status !== 'in-progress') {
        throw new Error('La partie nest pas en cours.');
      }

      const currentQuestionIndex = player.currentQuestionIndex ?? 0;
      if (currentQuestionIndex >= game.totalQuestions) {
        throw new Error('Vous avez deja termine cette partie.');
      }

      const questionRef = doc(
        this.firestore,
        `games/${gameId}/questions/${currentQuestionIndex}`,
      );
      const questionSnapshot = await transaction.get(questionRef);
      if (!questionSnapshot.exists()) {
        throw new Error('Impossible de retrouver la question demandee.');
      }

      const question = this.normalizeQuestion(
        questionSnapshot.data() as Partial<Question>,
        questionSnapshot.id,
        currentQuestionIndex,
      );

      if (selectedChoiceIndex >= question.choices.length) {
        throw new Error('La reponse selectionnee est invalide.');
      }

      if (this.hasPlayerQuestionExpired(player, game)) {
        throw new Error('Le temps est ecoule pour cette question.');
      }

      const responseRef = doc(
        this.firestore,
        `games/${gameId}/responses/${currentQuestionIndex}_${user.uid}`,
      );
      const responseSnapshot = await transaction.get(responseRef);
      if (responseSnapshot.exists()) {
        throw new Error('Vous avez deja repondu a cette question.');
      }

      const responseTimeMs = this.getElapsedQuestionTimeMs(player, game);
      const isCorrect = selectedChoiceIndex === question.correctChoiceIndex;
      const nextQuestionIndex = currentQuestionIndex + 1;

      transaction.set(responseRef, {
        playerId: user.uid,
        questionId: question.id,
        questionIndex: currentQuestionIndex,
        selectedChoiceIndex,
        answeredAt: serverTimestamp(),
        scored: true,
        isCorrect,
        responseTimeMs,
      });
      transaction.set(
        playerRef,
        {
          alias: player.alias,
          score:
            Number(player.score ?? 0)
            + (isCorrect ? PLAYER_POINTS_PER_CORRECT_ANSWER : 0),
          joinedAt: player.joinedAt,
          totalAnswerTimeMs: Number(player.totalAnswerTimeMs ?? 0) + responseTimeMs,
          correctAnswers: Number(player.correctAnswers ?? 0) + (isCorrect ? 1 : 0),
          currentQuestionIndex: nextQuestionIndex,
          currentQuestionStartedAt:
            nextQuestionIndex < game.totalQuestions ? serverTimestamp() : null,
          finishedAt:
            nextQuestionIndex >= game.totalQuestions ? serverTimestamp() : null,
        },
      );
    });

    await this.completeGameIfReady(gameId);
  }

  private async skipExpiredQuestionDirectly(
    gameId: string,
    expectedQuestionIndex: number,
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour jouer.');
    }

    await runTransaction(this.firestore, async (transaction) => {
      const gameRef = doc(this.firestore, `games/${gameId}`);
      const playerRef = doc(this.firestore, `games/${gameId}/players/${user.uid}`);
      const [gameSnapshot, playerSnapshot] = await Promise.all([
        transaction.get(gameRef),
        transaction.get(playerRef),
      ]);

      const rawGame = gameSnapshot.data() as Omit<Game, 'id'> | undefined;
      if (!rawGame || !playerSnapshot.exists()) {
        return;
      }

      const game = this.normalizeGame({
        id: gameSnapshot.id,
        ...rawGame,
      } as Game);
      const player = this.normalizePlayer({
        userId: user.uid,
        ...(playerSnapshot.data() as Omit<GamePlayer, 'userId'>),
      } as GamePlayer);

      if (game.status !== 'in-progress') {
        return;
      }

      const currentQuestionIndex = player.currentQuestionIndex ?? 0;
      if (
        currentQuestionIndex >= game.totalQuestions ||
        currentQuestionIndex !== expectedQuestionIndex ||
        !this.hasPlayerQuestionExpired(player, game)
      ) {
        return;
      }

      const responseRef = doc(
        this.firestore,
        `games/${gameId}/responses/${currentQuestionIndex}_${user.uid}`,
      );
      const responseSnapshot = await transaction.get(responseRef);
      if (responseSnapshot.exists()) {
        return;
      }

      const skippedTimeMs = this.getElapsedQuestionTimeMs(player, game);
      const nextQuestionIndex = currentQuestionIndex + 1;

      transaction.set(
        playerRef,
        {
          alias: player.alias,
          score: Number(player.score ?? 0),
          joinedAt: player.joinedAt,
          totalAnswerTimeMs: Number(player.totalAnswerTimeMs ?? 0) + skippedTimeMs,
          correctAnswers: Number(player.correctAnswers ?? 0),
          currentQuestionIndex: nextQuestionIndex,
          currentQuestionStartedAt:
            nextQuestionIndex < game.totalQuestions ? serverTimestamp() : null,
          finishedAt:
            nextQuestionIndex >= game.totalQuestions ? serverTimestamp() : null,
        },
      );
    });

    await this.completeGameIfReady(gameId);
  }

  private shouldFallbackToDirectFlow(error: unknown): boolean {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message).toLowerCase()
        : '';

    return (
      code === 'internal'
      || code === 'functions/internal'
      || code === 'not-found'
      || code === 'functions/not-found'
      || code === 'unknown'
      || code === 'functions/unknown'
      || code === 'unavailable'
      || code === 'functions/unavailable'
      || message === 'internal'
      || message.includes('internal')
    );
  }

  private shouldFallbackToDirectCreate(error: unknown): boolean {
    if (this.shouldFallbackToDirectFlow(error)) {
      return true;
    }

    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message).toLowerCase()
        : '';

    return (
      (
        code === 'permission-denied'
        || code === 'functions/permission-denied'
      )
      && (
        message.includes('createur')
        || message.includes('créateur')
        || message.includes('lancer une partie')
      )
    );
  }

  private async writePlayerEntry(
    gameId: string,
    user: User,
    status: Game['status'],
  ): Promise<void> {
    const alias = await this.resolveAlias(user);
    const playerRef = doc(this.firestore, `games/${gameId}/players/${user.uid}`);
    const playerSnapshot = await getDoc(playerRef);
    const existingPlayer = playerSnapshot.exists()
      ? this.normalizePlayer({
          userId: user.uid,
          ...(playerSnapshot.data() as Omit<GamePlayer, 'userId'>),
        } as GamePlayer)
      : null;

    if (status !== 'waiting' && !existingPlayer) {
      throw new Error(
        'La partie a deja commence. Les nouveaux joueurs ne peuvent plus entrer.',
      );
    }

    if (!existingPlayer) {
      await setDoc(playerRef, {
        alias,
        score: 0,
        joinedAt: serverTimestamp(),
        totalAnswerTimeMs: 0,
        correctAnswers: 0,
        currentQuestionIndex: 0,
        currentQuestionStartedAt: null,
        finishedAt: null,
      });
      return;
    }

    if (status === 'waiting') {
      await setDoc(playerRef, {
        alias,
        score: Number(existingPlayer.score ?? 0),
        joinedAt: existingPlayer.joinedAt,
        totalAnswerTimeMs: Number(existingPlayer.totalAnswerTimeMs ?? 0),
        correctAnswers: Number(existingPlayer.correctAnswers ?? 0),
        currentQuestionIndex: Number(existingPlayer.currentQuestionIndex ?? 0),
        currentQuestionStartedAt: existingPlayer.currentQuestionStartedAt,
        finishedAt: existingPlayer.finishedAt,
      });
      return;
    }

    return;
  }

  private async getStoredGameQuestion(
    gameId: string,
    questionIndex: number,
  ): Promise<Question | null> {
    const snapshot = await getDoc(
      doc(this.firestore, `games/${gameId}/questions/${questionIndex}`),
    );

    if (!snapshot.exists()) {
      return null;
    }

    return this.normalizeQuestion(
      snapshot.data() as Partial<Question>,
      snapshot.id,
      questionIndex,
    );
  }

  private async getGame(gameId: string): Promise<Game> {
    const gameSnapshot = await getDoc(doc(this.firestore, `games/${gameId}`));
    const game = gameSnapshot.data() as Omit<Game, 'id'> | undefined;

    if (!game) {
      throw new Error('Partie introuvable.');
    }

    return this.normalizeGame({
      id: gameSnapshot.id,
      ...game,
    });
  }

  private async ensureCurrentUserPlayer(
    gameId: string,
    playerAlreadyExists?: boolean,
  ): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Vous devez etre connecte pour participer a cette partie.');
    }

    const alias = await this.resolveAlias(user);
    const playerRef = doc(this.firestore, `games/${gameId}/players/${user.uid}`);
    const playerSnapshot =
      playerAlreadyExists === undefined ? await getDoc(playerRef) : null;
    const exists = playerAlreadyExists ?? playerSnapshot?.exists() ?? false;

    if (exists) {
      await setDoc(
        playerRef,
        {
          alias,
        },
        { merge: true },
      );
      return;
    }

    await setDoc(
      playerRef,
      {
        alias,
        score: 0,
        joinedAt: serverTimestamp(),
        totalAnswerTimeMs: 0,
        correctAnswers: 0,
        currentQuestionIndex: 0,
        currentQuestionStartedAt: null,
        finishedAt: null,
      },
      { merge: true },
    );
  }

  private async confirmCurrentUserPlayer(
    gameId: string,
    userId: string,
  ): Promise<void> {
    const playerSnapshot = await getDoc(
      doc(this.firestore, `games/${gameId}/players/${userId}`),
    );

    if (!playerSnapshot.exists()) {
      throw new Error(
        'Impossible de finaliser l inscription a cette partie.',
      );
    }
  }

  private async resolveAlias(user: User): Promise<string> {
    return this.userService.getPreferredAlias(user);
  }

  private async generateUniqueEntryCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const entryCode = this.randomEntryCode();
      const snapshot = await getDoc(doc(this.firestore, `gameCodes/${entryCode}`));

      if (!snapshot.exists()) {
        return entryCode;
      }
    }

    throw new Error('Impossible de generer un code de partie unique.');
  }

  private normalizeGame(game: Game): Game {
    return {
      ...game,
      quizTitle: game.quizTitle ?? 'Session quiz',
      quizCoverImageUrl: game.quizCoverImageUrl ?? 'assets/shapes.svg',
      quizThemeColor: game.quizThemeColor ?? '#0f766e',
      createdAt: this.toDate(game.createdAt),
      updatedAt: this.toDate(game.updatedAt),
      startedAt: game.startedAt ? this.toDate(game.startedAt) : null,
      finishedAt: game.finishedAt ? this.toDate(game.finishedAt) : null,
      totalQuestions: game.totalQuestions ?? 0,
      currentQuestionId: game.currentQuestionId ?? null,
      currentQuestionText: game.currentQuestionText ?? null,
      currentQuestionImageUrl: game.currentQuestionImageUrl ?? null,
      currentQuestionChoices: this.normalizeChoices(game.currentQuestionChoices),
      questionDurationSeconds:
        game.questionDurationSeconds ?? DEFAULT_QUESTION_DURATION_SECONDS,
      currentQuestionStartedAt: game.currentQuestionStartedAt
        ? this.toDate(game.currentQuestionStartedAt)
        : null,
      currentQuestionEndsAt: game.currentQuestionEndsAt
        ? this.toDate(game.currentQuestionEndsAt)
        : null,
      answerCount: game.answerCount ?? 0,
      revealedCorrectChoiceIndex: game.revealedCorrectChoiceIndex ?? null,
    };
  }

  private normalizePlayer(player: GamePlayer): GamePlayer {
    return {
      ...player,
      joinedAt: this.toDate(player.joinedAt),
      totalAnswerTimeMs: Number(player.totalAnswerTimeMs ?? 0),
      correctAnswers: Number(player.correctAnswers ?? 0),
      currentQuestionIndex: Number(player.currentQuestionIndex ?? 0),
      currentQuestionStartedAt: player.currentQuestionStartedAt
        ? this.toDate(player.currentQuestionStartedAt)
        : null,
      finishedAt: player.finishedAt ? this.toDate(player.finishedAt) : null,
    };
  }

  private normalizeQuestion(
    question: Partial<Question>,
    id: string,
    fallbackOrder: number,
  ): Question {
    return {
      id,
      order: Number(question.order ?? fallbackOrder),
      text: question.text?.trim() ?? '',
      imageUrl: question.imageUrl?.trim() ?? '',
      correctChoiceIndex: Number(question.correctChoiceIndex ?? 0),
      choices: this.normalizeChoices(question.choices),
    };
  }

  private toGameQuestion(
    id: string,
    question: Partial<Question>,
    fallbackOrder: number,
  ): GameQuestion {
    const normalizedQuestion = this.normalizeQuestion(question, id, fallbackOrder);

    return {
      id: normalizedQuestion.id,
      order: normalizedQuestion.order,
      text: normalizedQuestion.text,
      imageUrl: normalizedQuestion.imageUrl,
      choices: normalizedQuestion.choices,
    };
  }

  private toDate(value: Date | { toDate: () => Date }): Date {
    if (value instanceof Date) {
      return value;
    }

    if (value && typeof value === 'object' && 'toDate' in value) {
      return value.toDate();
    }

    return new Date(value as never);
  }

  private randomEntryCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join('');
  }

  private normalizeEntryCode(entryCode: string): string {
    return entryCode.replace(/\s+/g, '').toUpperCase();
  }

  private normalizeChoices(choices: Array<Partial<Choice>> | undefined): Choice[] {
    return (choices ?? []).map((choice) => ({
      text: choice.text?.trim() ?? '',
      imageUrl: choice.imageUrl?.trim() ?? '',
    }));
  }

  private runInContext<T>(factory: () => T): T {
    return runInInjectionContext(this.injector, factory);
  }

  private getQuestionDurationMs(game: Game): number {
    return (
      game.questionDurationSeconds ?? DEFAULT_QUESTION_DURATION_SECONDS
    ) * 1000;
  }

  private resolveQuestionStartMs(player: GamePlayer, game: Game): number | null {
    if (player.currentQuestionStartedAt) {
      return player.currentQuestionStartedAt.getTime();
    }

    if ((player.currentQuestionIndex ?? 0) === 0 && game.startedAt) {
      return game.startedAt.getTime();
    }

    return null;
  }

  private getElapsedQuestionTimeMs(player: GamePlayer, game: Game): number {
    const questionDurationMs = this.getQuestionDurationMs(game);
    const questionStartedAtMs = this.resolveQuestionStartMs(player, game);

    if (!questionStartedAtMs) {
      return questionDurationMs;
    }

    return Math.min(
      questionDurationMs,
      Math.max(0, Date.now() - questionStartedAtMs),
    );
  }

  private hasPlayerQuestionExpired(player: GamePlayer, game: Game): boolean {
    const questionStartedAtMs = this.resolveQuestionStartMs(player, game);
    if (!questionStartedAtMs) {
      return false;
    }

    return Date.now() - questionStartedAtMs >= this.getQuestionDurationMs(game);
  }

  private isPlayerFinished(player: GamePlayer, totalQuestions: number): boolean {
    return !!player.finishedAt || (player.currentQuestionIndex ?? 0) >= totalQuestions;
  }
}
