import { EnvironmentInjector, inject, Injectable, runInInjectionContext } from '@angular/core';
import { Auth, user } from '@angular/fire/auth';
import {
  Firestore,
  collection,
  collectionCount,
  collectionData,
  deleteDoc,
  doc,
  docData,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from '@angular/fire/firestore';
import {
  catchError,
  combineLatest,
  map,
  mergeMap,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { Question } from '../models/question';
import { Quiz } from '../models/quiz';

const QUIZ_VISUAL_PRESETS = [
  {
    coverImageUrl: 'assets/covers/geographie.svg',
    themeColor: '#0f766e',
  },
  {
    coverImageUrl: 'assets/covers/sciences.svg',
    themeColor: '#b45309',
  },
  {
    coverImageUrl: 'assets/covers/histoire.svg',
    themeColor: '#7c2d12',
  },
  {
    coverImageUrl: 'assets/covers/culture.svg',
    themeColor: '#1d4ed8',
  },
];

export const DEFAULT_QUIZ_COVER_URL = 'assets/shapes.svg';

type QuizAccessMode = 'detail' | 'practice';

type QuizQuestionLike = {
  id?: string;
  order?: number;
  text?: string;
  imageUrl?: string;
  correctChoiceIndex?: number;
  choices?: Array<{
    text?: string;
    imageUrl?: string;
  }>;
};

@Injectable({
  providedIn: 'root',
})
export class QuizService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly injector = inject(EnvironmentInjector);
  private readonly cachedQuizzes = new Map<string, Quiz>();

  getAll(): Observable<Quiz[]> {
    return this.observeAuthUser().pipe(
      switchMap((connectedUser) => {
        if (!connectedUser) {
          return of([]);
        }

        const quizzesCollectionData = this.observeQuizCollection();

        return quizzesCollectionData.pipe(
          map((quizzes) =>
            quizzes.map((quiz, index) => this.decorateQuiz(quiz, index)),
          ),
          mergeMap((quizzes) => {
            if (!quizzes.length) {
              return of([]);
            }

            return combineLatest(
              quizzes.map((quiz) => {
                if (typeof quiz.questionsCount === 'number') {
                  return of({
                    ...quiz,
                    estimatedDurationMinutes:
                      quiz.estimatedDurationMinutes
                      ?? this.estimateDuration(quiz.questionsCount),
                  });
                }

                return this.observeQuestionCount(quiz.id).pipe(
                  map((count) => ({
                    ...quiz,
                    questionsCount: count,
                    estimatedDurationMinutes:
                      quiz.estimatedDurationMinutes ?? this.estimateDuration(count),
                  })),
                  catchError(() =>
                    of({
                      ...quiz,
                      questionsCount: quiz.questionsCount ?? quiz.questions?.length ?? 0,
                      estimatedDurationMinutes:
                        quiz.estimatedDurationMinutes
                        ?? this.estimateDuration(
                          quiz.questionsCount ?? quiz.questions?.length ?? 0,
                        ),
                    }),
                  ),
                );
              }),
            );
          }),
          map((quizzes) =>
            quizzes.sort((left, right) =>
              left.title.localeCompare(right.title, 'fr'),
            ),
          ),
        );
      }),
    );
  }

  getById(id: string): Observable<Quiz> {
    return this.getQuizById(id, 'detail');
  }

  getPracticeById(id: string): Observable<Quiz> {
    return this.getQuizById(id, 'practice');
  }

  async setQuiz(quiz: Quiz): Promise<void> {
    const ownerId = this.auth.currentUser?.uid;
    if (!ownerId) {
      throw new Error('Vous devez etre connecte pour enregistrer un quiz.');
    }

    const normalizedQuiz = this.prepareQuizForWrite({
      ...quiz,
      ownerId,
    });
    const quizRef = doc(this.firestore, 'quizzes', normalizedQuiz.id);
    const quizSnapshot = await getDoc(quizRef);
    const quizAlreadyExists = quizSnapshot.exists();
    const quizDocument = {
      ownerId: normalizedQuiz.ownerId,
      title: normalizedQuiz.title,
      description: normalizedQuiz.description,
      coverImageUrl: normalizedQuiz.coverImageUrl,
      themeColor: normalizedQuiz.themeColor,
      estimatedDurationMinutes: normalizedQuiz.estimatedDurationMinutes,
      questionsCount: normalizedQuiz.questions.length,
    };

    if (!quizAlreadyExists) {
      await setDoc(quizRef, quizDocument);
    }

    const existingQuestionsSnapshot = quizAlreadyExists
      ? await getDocs(collection(quizRef, 'questions'))
      : null;
    const nextQuestionIds = new Set(
      normalizedQuiz.questions.map((question) => question.id),
    );
    const batch = writeBatch(this.firestore);

    batch.set(quizRef, quizDocument);

    for (const questionDoc of existingQuestionsSnapshot?.docs ?? []) {
      if (nextQuestionIds.has(questionDoc.id)) {
        continue;
      }

      batch.delete(questionDoc.ref);
    }

    for (const question of normalizedQuiz.questions) {
      const questionRef = doc(
        this.firestore,
        `quizzes/${normalizedQuiz.id}/questions/${question.id}`,
      );

      batch.set(questionRef, {
        order: question.order ?? 0,
        text: question.text,
        imageUrl: question.imageUrl ?? '',
        correctChoiceIndex: question.correctChoiceIndex,
        choices: question.choices,
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      if (!quizAlreadyExists) {
        await deleteDoc(quizRef).catch(() => undefined);
      }

      throw error;
    }
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const questionsCollection = collection(
      doc(this.firestore, `quizzes/${quizId}`),
      'questions',
    );
    const questionsSnapshot = await getDocs(questionsCollection);

    for (const questionDoc of questionsSnapshot.docs) {
      batch.delete(questionDoc.ref);
    }

    batch.delete(doc(this.firestore, `quizzes/${quizId}`));
    await batch.commit();
  }

  async getEditableById(id: string): Promise<Quiz> {
    const ownerId = this.auth.currentUser?.uid;
    if (!ownerId) {
      throw new Error('Vous devez etre connecte pour modifier un quiz.');
    }

    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new Error('Ce quiz est introuvable.');
    }

    const quizRef = doc(this.firestore, 'quizzes', normalizedId);
    const [quizSnapshot, questionsSnapshot] = await Promise.all([
      getDoc(quizRef),
      getDocs(collection(quizRef, 'questions')),
    ]);

    if (!quizSnapshot.exists()) {
      throw new Error('Ce quiz est introuvable.');
    }

    const quiz = this.decorateQuiz({
      id: quizSnapshot.id,
      ...(quizSnapshot.data() as Omit<Quiz, 'id' | 'questions'>),
    } as Quiz);

    if (quiz.ownerId !== ownerId) {
      throw new Error('Vous n avez pas acces a ce quiz pour le modifier.');
    }

    const questions = questionsSnapshot.docs.map((questionDoc) => ({
      id: questionDoc.id,
      ...(questionDoc.data() as Omit<Question, 'id'>),
    }));

    return this.createEditorDraft(
      this.withQuestions(quiz, questions, {
        preserveStoredQuestionCount: true,
      }),
    );
  }

  generateQuizId(): string {
    return doc(collection(this.firestore, 'quizzes')).id;
  }

  generateQuestionId(quizId: string): string {
    const quizRef = doc(this.firestore, `quizzes/${quizId}`);
    return doc(collection(quizRef, 'questions')).id;
  }

  generateQuiz(): Quiz {
    const quizId = this.generateQuizId();
    const questionId = this.generateQuestionId(quizId);
    const visualPreset = this.getVisualPreset(quizId);

    return {
      id: quizId,
      title: '',
      description: '',
      coverImageUrl: '',
      themeColor: visualPreset.themeColor,
      estimatedDurationMinutes: 3,
      questionsCount: 1,
      questions: [
        {
          id: questionId,
          order: 0,
          text: '',
          imageUrl: '',
          choices: [
            { text: '', imageUrl: '' },
            { text: '', imageUrl: '' },
          ],
          correctChoiceIndex: 0,
        },
      ],
    };
  }

  createEditorDraft(quiz?: Quiz): Quiz {
    if (!quiz) {
      return this.generateQuiz();
    }

    const preparedQuiz = this.withQuestions(
      this.decorateQuiz(quiz),
      quiz.questions ?? [],
      {
        preserveStoredQuestionCount: true,
      },
    );

    return {
      ...preparedQuiz,
      questions: preparedQuiz.questions.map((question) => ({
        ...question,
        choices: question.choices.map((choice) => ({
          text: choice.text,
          imageUrl: choice.imageUrl,
        })),
      })),
    };
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
        return 'Vous n avez pas acces a ce quiz pour le moment.';
      case 'not-found':
      case 'firestore/not-found':
      case 'functions/not-found':
        return 'Ce quiz est introuvable.';
      case 'unavailable':
      case 'firestore/unavailable':
      case 'functions/unavailable':
        return 'Le service est temporairement indisponible.';
      default:
        break;
    }

    if (
      error
      && typeof error === 'object'
      && 'message' in error
      && typeof error.message === 'string'
      && error.message.trim()
    ) {
      return error.message.trim();
    }

    return fallback;
  }

  private getQuizById(id: string, accessMode: QuizAccessMode): Observable<Quiz> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return throwError(() => new Error('Quiz introuvable.'));
    }

    const quizDoc = doc(this.firestore, `quizzes/${normalizedId}`);
    const quizData = this.observeQuizDocument(quizDoc);

    return this.observeAuthUser().pipe(
      switchMap((connectedUser) => {
        if (!connectedUser) {
          return throwError(
            () => new Error('Vous devez etre connecte pour ouvrir un quiz.'),
          );
        }

        return quizData.pipe(
          map((quiz) => {
            if (!quiz) {
              throw new Error('Quiz introuvable.');
            }

            return this.decorateQuiz(quiz);
          }),
          switchMap((quiz) => this.assembleQuiz(quiz, accessMode)),
          tap((quiz) => this.rememberQuiz(quiz)),
          catchError((error) => {
            const cachedQuiz = this.cachedQuizzes.get(normalizedId);
            if (cachedQuiz?.questions.length) {
              return of(cachedQuiz);
            }

            return throwError(() => error);
          }),
        );
      }),
    );
  }

  private assembleQuiz(
    quiz: Quiz,
    accessMode: QuizAccessMode,
  ): Observable<Quiz> {
    const directQuestions$ = this.observeQuizQuestions(quiz.id).pipe(
      map((questions) => this.withQuestions(quiz, questions)),
    );

    return directQuestions$.pipe(
      catchError((error) => {
        if (accessMode === 'detail') {
          return of(
            this.withQuestions(quiz, [], {
              preserveStoredQuestionCount: true,
            }),
          );
        }

        return throwError(() => error);
      }),
    );
  }

  private observeAuthUser() {
    return this.runInContext(() => user(this.auth));
  }

  private observeQuizCollection() {
    return this.runInContext(
      () =>
        collectionData(collection(this.firestore, 'quizzes'), {
          idField: 'id',
        }) as Observable<Quiz[]>,
    );
  }

  private observeQuizDocument(quizDoc: ReturnType<typeof doc>) {
    return this.runInContext(
      () =>
        docData(quizDoc, {
          idField: 'id',
        }) as Observable<Quiz | undefined>,
    );
  }

  private observeQuizQuestions(quizId: string) {
    return this.runInContext(
      () =>
        collectionData(
          collection(doc(this.firestore, `quizzes/${quizId}`), 'questions'),
          {
            idField: 'id',
          },
        ) as Observable<Question[]>,
    );
  }

  private observeQuestionCount(quizId: string) {
    return this.runInContext(
      () =>
        collectionCount(
          collection(doc(this.firestore, `quizzes/${quizId}`), 'questions'),
        ),
    );
  }

  private runInContext<T>(factory: () => T): T {
    return runInInjectionContext(this.injector, factory);
  }

  private withQuestions(
    quiz: Quiz,
    questions: Question[],
    options?: {
      preserveStoredQuestionCount?: boolean;
    },
  ): Quiz {
    const normalizedQuestions = questions
      .map((question, index) => this.normalizeQuestion(question, index))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
    const storedQuestionCount = quiz.questionsCount ?? quiz.questions?.length ?? 0;
    const resolvedQuestionCount =
      normalizedQuestions.length || !options?.preserveStoredQuestionCount
        ? normalizedQuestions.length
        : storedQuestionCount;

    return {
      ...quiz,
      questions: normalizedQuestions,
      questionsCount: resolvedQuestionCount,
      estimatedDurationMinutes:
        quiz.estimatedDurationMinutes
        ?? this.estimateDuration(resolvedQuestionCount),
    };
  }

  private prepareQuizForWrite(quiz: Quiz): Quiz {
    const visualPreset = this.getVisualPreset(quiz.id || quiz.title);
    const normalizedQuestions = quiz.questions.map((question, index) => ({
      ...question,
      order: index,
      text: question.text.trim(),
      imageUrl: question.imageUrl?.trim() ?? '',
      correctChoiceIndex: this.normalizeChoiceIndex(
        question.correctChoiceIndex,
        question.choices.length,
      ),
      choices: question.choices.map((choice) => ({
        text: choice.text.trim(),
        imageUrl: choice.imageUrl?.trim() ?? '',
      })),
    }));

    return {
      ...quiz,
      title: quiz.title.trim(),
      description: quiz.description.trim(),
      coverImageUrl: this.normalizeCoverImageForWrite(quiz.coverImageUrl),
      themeColor: quiz.themeColor?.trim() || visualPreset.themeColor,
      estimatedDurationMinutes: this.normalizeDuration(
        quiz.estimatedDurationMinutes,
        this.estimateDuration(normalizedQuestions.length),
      ),
      questionsCount: normalizedQuestions.length,
      questions: normalizedQuestions,
    };
  }

  private decorateQuiz(quiz: Quiz, seed = 0): Quiz {
    const visualPreset = this.getVisualPreset(quiz.id || `${seed}`);
    const questionCount = quiz.questionsCount ?? quiz.questions?.length ?? 0;

    return {
      ...quiz,
      coverImageUrl: this.normalizeCoverImageForRead(quiz.coverImageUrl),
      themeColor: quiz.themeColor || visualPreset.themeColor,
      questionsCount: questionCount,
      estimatedDurationMinutes:
        quiz.estimatedDurationMinutes ?? this.estimateDuration(questionCount),
    };
  }

  private estimateDuration(questionCount: number): number {
    return Math.max(3, Math.ceil(questionCount * 0.75) + 1);
  }

  private normalizeQuestion(question: QuizQuestionLike, index: number): Question {
    return {
      id: question.id ?? `${index}`,
      order: this.toSafeInteger(question.order, index),
      text: question.text?.trim() ?? '',
      imageUrl: question.imageUrl?.trim() ?? '',
      choices: (question.choices ?? []).map((choice) => ({
        text: choice.text?.trim() ?? '',
        imageUrl: choice.imageUrl?.trim() ?? '',
      })),
      correctChoiceIndex: this.normalizeChoiceIndex(
        question.correctChoiceIndex,
        question.choices?.length ?? 0,
        -1,
      ),
    };
  }

  private getVisualPreset(key: string) {
    const hash = Array.from(key).reduce(
      (currentHash, char) => currentHash + char.charCodeAt(0),
      0,
    );
    return QUIZ_VISUAL_PRESETS[hash % QUIZ_VISUAL_PRESETS.length];
  }

  private rememberQuiz(quiz: Quiz) {
    if (!quiz.id) {
      return;
    }

    this.cachedQuizzes.set(quiz.id, {
      ...quiz,
      questions: quiz.questions.map((question) => ({
        ...question,
        choices: question.choices.map((choice) => ({
          text: choice.text,
          imageUrl: choice.imageUrl,
        })),
      })),
    });
  }

  private normalizeCoverImageForRead(
    value: string | null | undefined,
  ): string {
    const normalizedValue = value?.trim() ?? '';
    return normalizedValue === DEFAULT_QUIZ_COVER_URL ? '' : normalizedValue;
  }

  private normalizeCoverImageForWrite(
    value: string | null | undefined,
  ): string {
    const normalizedValue = value?.trim() ?? '';
    return normalizedValue || DEFAULT_QUIZ_COVER_URL;
  }

  private normalizeDuration(
    value: number | string | null | undefined,
    fallback: number,
  ): number {
    return Math.min(60, Math.max(2, this.toSafeInteger(value, fallback)));
  }

  private normalizeChoiceIndex(
    value: number | string | null | undefined,
    choicesLength: number,
    fallback = 0,
  ) {
    if (choicesLength <= 0) {
      return fallback;
    }

    const parsedValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN;

    if (!Number.isInteger(parsedValue)) {
      return fallback;
    }

    if (parsedValue < 0) {
      return fallback;
    }

    return Math.min(
      choicesLength - 1,
      parsedValue,
    );
  }

  private toSafeInteger(
    value: number | string | null | undefined,
    fallback: number,
  ): number {
    const parsedValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN;

    return Number.isInteger(parsedValue) ? parsedValue : fallback;
  }
}
