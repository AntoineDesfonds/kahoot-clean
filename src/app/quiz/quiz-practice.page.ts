import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowForwardOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  refreshOutline,
  schoolOutline,
  trophyOutline,
} from 'ionicons/icons';
import { catchError, map, Observable, of } from 'rxjs';
import { PageHeader } from '../components/page-header';
import { Quiz } from '../models/quiz';
import { QuizService } from '../services/quiz.service';
import { ensurePracticeQuizHasQuestions } from './quiz-practice.utils';

interface PracticeAnswer {
  questionId: string;
  questionText: string;
  selectedChoiceIndex: number;
  correctChoiceIndex: number | null;
  isCorrect: boolean | null;
}

@Component({
  selector: 'quiz-practice',
  template: `
    <page-header [translucent]="true">Entrainement</page-header>

    <ion-content [fullscreen]="true">
      <page-header collapse="condense">Entrainement</page-header>

      <div class="page-shell">
        @if (!quizId() || quizResource.status() === 'loading') {
          <div class="empty-state">
            <ion-spinner name="crescent"></ion-spinner>
            <h3>Chargement du quiz...</h3>
            <p>Nous préparons votre session d entraînement.</p>
          </div>
        } @else if (quizResource.status() === 'error') {
          <div class="empty-state empty-state--error">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <h3>Impossible d ouvrir ce quiz</h3>
            <p>Le quiz est introuvable ou inaccessible pour le moment.</p>
            <div class="empty-state__actions">
              <ion-button fill="outline" color="dark" (click)="reloadQuiz()">
                <ion-icon slot="start" name="refresh-outline"></ion-icon>
                Réessayer
              </ion-button>
              <ion-button (click)="goBackToQuiz()">Retour au quiz</ion-button>
            </div>
          </div>
        } @else if (!quizResource.value().questions.length) {
          <div class="empty-state">
            <ion-icon name="school-outline"></ion-icon>
            <h3>Ce quiz ne contient pas encore de question</h3>
            <p>Ajoutez des questions avant de lancer un entraînement.</p>
            <ion-button (click)="goBackToQuiz()">Retour au quiz</ion-button>
          </div>
        } @else {
          @let quiz = quizResource.value();

          <section
            class="hero-panel practice-hero"
            [style.--quiz-accent]="quiz.themeColor"
          >
            <div>
              <p class="hero-panel__eyebrow">Mode solo</p>
              <h1 class="hero-panel__title">{{ quiz.title }}</h1>
              <p class="hero-panel__copy">
                @if (hasCorrectionData()) {
                  Répondez question par question pour vous entraîner sur ce quiz.
                } @else {
                  Répondez question par question pour parcourir ce quiz partagé.
                }
              </p>

              <div class="practice-hero__chips">
                <span class="status-pill status-pill--active">
                  {{ quiz.questions.length }} questions
                </span>
                <span class="status-pill status-pill--done">
                  @if (hasCorrectionData()) {
                    {{ score() }} bonne{{ score() > 1 ? 's' : '' }} réponse{{
                      score() > 1 ? 's' : ''
                    }}
                  } @else {
                    {{ answeredCount() }} réponse{{ answeredCount() > 1 ? 's' : '' }} enregistrée{{
                      answeredCount() > 1 ? 's' : ''
                    }}
                  }
                </span>
              </div>
            </div>

            <div
              class="practice-hero__cover"
              [style.background-image]="coverBackground()"
            ></div>
          </section>

          @if (!isCompleted()) {
            @let question = currentQuestion();

            <section class="practice-stage">
              <div class="practice-stage__topbar">
                <ion-badge color="primary">
                  Question {{ currentQuestionNumber() }} / {{ quiz.questions.length }}
                </ion-badge>
                <ion-badge color="medium">
                  @if (hasCorrectionData()) {
                    Score {{ score() }} / {{ answeredCount() }}
                  } @else {
                    Réponses {{ answeredCount() }}
                  }
                </ion-badge>
              </div>

              <div class="practice-stage__prompt">
                <div>
                  <p class="practice-stage__eyebrow">Question en cours</p>
                  <h2 class="practice-stage__title">{{ question?.text }}</h2>
                </div>

                @if (question?.imageUrl) {
                  <div
                    class="practice-stage__visual"
                    [style.background-image]="imageBackground(question?.imageUrl ?? '')"
                  ></div>
                }
              </div>

              <div class="practice-answers">
                @for (choice of question?.choices ?? []; track $index; let idx = $index) {
                  <button
                    class="practice-answer"
                    type="button"
                    [class.practice-answer--selected]="selectedChoiceIndex() === idx"
                    [class.practice-answer--correct]="isChoiceCorrect(idx)"
                    [class.practice-answer--wrong]="isChoiceWrong(idx)"
                    [disabled]="hasSubmittedCurrentQuestion()"
                    (click)="selectChoice(idx)"
                  >
                    @if (choice.imageUrl) {
                      <span
                        class="practice-answer__image"
                        [style.background-image]="imageBackground(choice.imageUrl)"
                      ></span>
                    }

                    <span class="practice-answer__body">
                      <strong>{{ choice.text }}</strong>
                      @if (hasSubmittedCurrentQuestion()) {
                        @if (hasCorrectionData() && isChoiceCorrect(idx)) {
                          <span class="practice-answer__status">
                            <ion-icon name="checkmark-circle-outline"></ion-icon>
                            Bonne réponse
                          </span>
                        } @else if (submittedChoiceIndex() === idx) {
                          <span class="practice-answer__status">
                            <ion-icon name="close-circle-outline"></ion-icon>
                            Votre réponse
                          </span>
                        }
                      }
                    </span>
                  </button>
                }
              </div>

              @if (hasSubmittedCurrentQuestion()) {
                <ion-card
                  [class.practice-feedback--success]="lastAnswerWasCorrect() === true"
                  [class.practice-feedback--error]="lastAnswerWasCorrect() === false"
                >
                  <ion-card-content class="practice-feedback">
                    <div>
                      <h3>
                        @if (!hasCorrectionData()) {
                          Réponse enregistrée
                        } @else {
                          {{ lastAnswerWasCorrect() ? 'Bonne réponse !' : 'Mauvaise réponse' }}
                        }
                      </h3>
                      <p>{{ feedbackText() }}</p>
                    </div>
                    <ion-button (click)="goToNextQuestion()">
                      <ion-icon slot="start" name="arrow-forward-outline"></ion-icon>
                      {{ hasNextQuestion() ? 'Question suivante' : 'Voir le résultat' }}
                    </ion-button>
                  </ion-card-content>
                </ion-card>
              } @else {
                <ion-button
                  expand="block"
                  [disabled]="selectedChoiceIndex() === null"
                  (click)="submitAnswer()"
                >
                  Valider ma réponse
                </ion-button>
              }
            </section>
          } @else {
            <section class="results-screen">
              <div class="results-screen__hero">
                <div>
                  <p class="hero-panel__eyebrow">Résultat final</p>
                  <h2 class="results-screen__title">Entrainement terminé</h2>
                  <p class="hero-panel__copy">
                    Vous avez terminé ce quiz en solo. Rejouez autant de fois que
                    nécessaire pour vous entraîner.
                  </p>
                </div>

                <article class="results-screen__score">
                  <ion-icon name="trophy-outline"></ion-icon>
                  @if (hasCorrectionData()) {
                    <strong>{{ score() }} / {{ totalQuestions() }}</strong>
                    <span>bonnes réponses</span>
                  } @else {
                    <strong>{{ answeredCount() }} / {{ totalQuestions() }}</strong>
                    <span>réponses enregistrées</span>
                  }
                </article>
              </div>

              <div class="results-screen__actions">
                <ion-button (click)="restartPractice()">Recommencer</ion-button>
                <ion-button fill="outline" color="dark" (click)="goBackToQuiz()">
                  Retour au quiz
                </ion-button>
              </div>

              <div class="results-screen__review">
                @for (answer of answers(); track answer.questionId; let idx = $index) {
                  <ion-card>
                    <ion-card-content>
                      <p class="results-screen__review-label">Question {{ idx + 1 }}</p>
                      <h3>{{ answer.questionText }}</h3>
                      <p>
                        Votre réponse :
                        <strong>{{ choiceText(answer.questionId, answer.selectedChoiceIndex) }}</strong>
                      </p>
                      @if (answer.correctChoiceIndex !== null) {
                        <p>
                          Bonne réponse :
                          <strong>{{ choiceText(answer.questionId, answer.correctChoiceIndex) }}</strong>
                        </p>
                      } @else {
                        <p>Correction détaillée indisponible pour ce quiz partagé.</p>
                      }
                    </ion-card-content>
                  </ion-card>
                }
              </div>
            </section>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .practice-hero {
        grid-template-columns: minmax(0, 1.2fr);
        align-items: center;
      }

      .practice-hero__chips {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-top: 1rem;
      }

      .practice-hero__cover {
        min-height: 220px;
        border-radius: 28px;
        background-size: cover;
        background-position: center;
      }

      .practice-stage,
      .results-screen {
        margin-top: 1.5rem;
        padding: 1.3rem;
        border: 1px solid var(--app-border);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: var(--app-shadow-soft);
      }

      .practice-stage {
        display: grid;
        gap: 1rem;
      }

      .practice-stage__topbar {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .practice-stage__prompt {
        display: grid;
        gap: 1rem;
      }

      .practice-stage__eyebrow,
      .results-screen__review-label {
        margin: 0 0 0.45rem;
        color: var(--app-text-soft);
        font-size: 0.8rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .practice-stage__title,
      .results-screen__title {
        margin: 0;
        font-size: clamp(1.4rem, 3.2vw, 2.35rem);
        line-height: 1.08;
      }

      .practice-stage__visual {
        min-height: 220px;
        border-radius: 24px;
        background-size: cover;
        background-position: center;
        box-shadow: var(--app-shadow-soft);
      }

      .practice-answers,
      .results-screen__review {
        display: grid;
        gap: 0.9rem;
      }

      .practice-answer {
        display: grid;
        gap: 1rem;
        align-items: center;
        width: 100%;
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 22px;
        background: rgba(248, 250, 252, 0.92);
        color: var(--app-text-strong);
        text-align: left;
        transition:
          border-color 160ms ease,
          box-shadow 160ms ease,
          transform 160ms ease;
      }

      .practice-answer--selected {
        border-color: rgba(15, 118, 110, 0.3);
        box-shadow: var(--app-focus-ring);
      }

      .practice-answer--correct {
        border-color: rgba(22, 163, 74, 0.24);
        background: rgba(240, 253, 244, 0.96);
      }

      .practice-answer--wrong {
        border-color: rgba(220, 38, 38, 0.22);
        background: rgba(254, 242, 242, 0.96);
      }

      .practice-answer__image {
        width: 100%;
        min-height: 150px;
        border-radius: 18px;
        background-size: cover;
        background-position: center;
      }

      .practice-answer__body {
        display: grid;
        gap: 0.35rem;
      }

      .practice-answer__body strong {
        font-size: 1.05rem;
      }

      .practice-answer__status {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: var(--app-text-muted);
        font-size: 0.9rem;
        font-weight: 700;
      }

      .practice-feedback {
        display: grid;
        gap: 1rem;
      }

      .practice-feedback h3 {
        margin: 0 0 0.35rem;
      }

      .practice-feedback p {
        margin: 0;
        color: var(--app-text-muted);
      }

      .practice-feedback--success {
        border-color: rgba(22, 163, 74, 0.18);
        background: rgba(240, 253, 244, 0.96);
      }

      .practice-feedback--error {
        border-color: rgba(220, 38, 38, 0.16);
        background: rgba(254, 242, 242, 0.96);
      }

      .results-screen__hero,
      .results-screen__actions {
        display: grid;
        gap: 1rem;
      }

      .results-screen__score {
        display: grid;
        gap: 0.35rem;
        justify-items: start;
        padding: 1.2rem;
        border-radius: 24px;
        color: #fff;
        background: linear-gradient(140deg, rgba(15, 23, 42, 0.98), rgba(15, 118, 110, 0.92));
      }

      .results-screen__score ion-icon {
        font-size: 1.35rem;
      }

      .results-screen__score strong {
        font-size: clamp(1.9rem, 4vw, 2.8rem);
      }

      @media (min-width: 768px) {
        .practice-answer {
          grid-template-columns: 180px minmax(0, 1fr);
        }

        .practice-feedback {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
        }

        .results-screen__hero {
          grid-template-columns: minmax(0, 1fr) 280px;
          align-items: start;
        }
      }

      @media (min-width: 992px) {
        .practice-hero {
          grid-template-columns: minmax(0, 1.2fr) 320px;
        }
      }
    `,
  ],
  imports: [
    IonBadge,
    IonButton,
    IonCard,
    IonCardContent,
    IonContent,
    IonIcon,
    IonSpinner,
    PageHeader,
  ],
})
export class QuizPracticePage {
  private readonly quizService = inject(QuizService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navigationQuiz = this.readNavigationQuiz();

  readonly quizId = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('quizId')?.trim() ?? ''),
    ),
    {
      initialValue: this.route.snapshot.paramMap.get('quizId')?.trim() ?? '',
    },
  );
  readonly currentQuestionIndex = signal(0);
  readonly selectedChoiceIndex = signal<number | null>(null);
  readonly submittedChoiceIndex = signal<number | null>(null);
  readonly answers = signal<PracticeAnswer[]>([]);

  readonly quizResource = rxResource({
    stream: ({ params }) =>
      params.id ? this.loadPracticeQuiz(params.id) : of(this.emptyQuiz()),
    params: () => ({ id: this.quizId() }),
    defaultValue: {
      id: '',
      title: '',
      description: '',
      coverImageUrl: '',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 3,
      questions: [],
    },
  });
  readonly currentQuestion = computed(
    () => this.quizResource.value().questions[this.currentQuestionIndex()] ?? null,
  );
  readonly currentQuestionNumber = computed(() => this.currentQuestionIndex() + 1);
  readonly answeredCount = computed(() => this.answers().length);
  readonly totalQuestions = computed(() => this.quizResource.value().questions.length);
  readonly hasCorrectionData = computed(() =>
    this.quizResource
      .value()
      .questions.every((question) => question.correctChoiceIndex >= 0),
  );
  readonly score = computed(
    () => this.answers().filter((answer) => answer.isCorrect).length,
  );
  readonly hasNextQuestion = computed(
    () => this.currentQuestionIndex() < this.totalQuestions() - 1,
  );
  readonly hasSubmittedCurrentQuestion = computed(
    () => this.submittedChoiceIndex() !== null,
  );
  readonly isCompleted = computed(
    () => this.totalQuestions() > 0 && this.currentQuestionIndex() >= this.totalQuestions(),
  );
  readonly lastAnswerWasCorrect = computed(() => {
    const latestAnswer = this.answers()[this.answers().length - 1];
    return latestAnswer ? latestAnswer.isCorrect : null;
  });
  readonly feedbackText = computed(() => {
    const question = this.currentQuestion();
    const latestAnswer = this.answers()[this.answers().length - 1];
    if (!question || !latestAnswer) {
      return '';
    }

    if (!this.hasCorrectionData() || latestAnswer.correctChoiceIndex === null) {
      return 'Passez à la question suivante pour continuer cet entraînement guidé.';
    }

    return latestAnswer.isCorrect
      ? 'Vous pouvez passer à la question suivante.'
      : `La bonne réponse était : ${question.choices[latestAnswer.correctChoiceIndex]?.text ?? ''}`;
  });

  constructor() {
    addIcons({
      alertCircleOutline,
      arrowForwardOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      refreshOutline,
      schoolOutline,
      trophyOutline,
    });
  }

  selectChoice(choiceIndex: number) {
    if (this.hasSubmittedCurrentQuestion()) {
      return;
    }

    this.selectedChoiceIndex.set(choiceIndex);
  }

  submitAnswer() {
    const question = this.currentQuestion();
    const selectedChoiceIndex = this.selectedChoiceIndex();

    if (!question || selectedChoiceIndex === null) {
      return;
    }

    const hasCorrection = question.correctChoiceIndex >= 0;
    const isCorrect = hasCorrection
      ? selectedChoiceIndex === question.correctChoiceIndex
      : null;
    this.submittedChoiceIndex.set(selectedChoiceIndex);
    this.answers.update((answers) => [
      ...answers,
      {
        questionId: question.id,
        questionText: question.text,
        selectedChoiceIndex,
        correctChoiceIndex: hasCorrection ? question.correctChoiceIndex : null,
        isCorrect,
      },
    ]);
  }

  goToNextQuestion() {
    if (!this.hasSubmittedCurrentQuestion()) {
      return;
    }

    if (!this.hasNextQuestion()) {
      this.currentQuestionIndex.set(this.totalQuestions());
      this.selectedChoiceIndex.set(null);
      this.submittedChoiceIndex.set(null);
      return;
    }

    this.currentQuestionIndex.update((index) => index + 1);
    this.selectedChoiceIndex.set(null);
    this.submittedChoiceIndex.set(null);
  }

  restartPractice() {
    this.currentQuestionIndex.set(0);
    this.selectedChoiceIndex.set(null);
    this.submittedChoiceIndex.set(null);
    this.answers.set([]);
  }

  isChoiceCorrect(choiceIndex: number) {
    return this.hasCorrectionData()
      && this.hasSubmittedCurrentQuestion()
      && this.currentQuestion()?.correctChoiceIndex === choiceIndex;
  }

  isChoiceWrong(choiceIndex: number) {
    return this.hasCorrectionData()
      && this.hasSubmittedCurrentQuestion()
      && this.submittedChoiceIndex() === choiceIndex
      && !this.isChoiceCorrect(choiceIndex);
  }

  coverBackground() {
    const quiz = this.quizResource.value();
    const coverImageUrl = quiz.coverImageUrl.trim() || 'assets/shapes.svg';
    return `linear-gradient(135deg, ${quiz.themeColor}cc, rgba(15, 23, 42, 0.18)), url('${coverImageUrl}')`;
  }

  imageBackground(imageUrl: string) {
    const source = imageUrl.trim() || 'assets/shapes.svg';
    return `linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 118, 110, 0.08)), url('${source}')`;
  }

  choiceText(questionId: string, choiceIndex: number) {
    const question = this.quizResource.value().questions.find(
      (entry) => entry.id === questionId,
    );
    return question?.choices[choiceIndex]?.text ?? '';
  }

  reloadQuiz() {
    this.quizResource.reload();
  }

  async goBackToQuiz() {
    await this.router.navigate(['/quiz', this.quizId()]);
  }

  private emptyQuiz() {
    return {
      id: '',
      title: '',
      description: '',
      coverImageUrl: '',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 3,
      questions: [],
    };
  }

  private quizFromNavigationState(id: string) {
    if (
      this.navigationQuiz
      && this.navigationQuiz.id === id
      && this.navigationQuiz.questions.length
    ) {
      return of(this.navigationQuiz);
    }

    return null;
  }

  private loadPracticeQuiz(id: string): Observable<Quiz> {
    return (
      this.quizFromNavigationState(id)
      ?? this.quizService.getPracticeById(id).pipe(
        catchError((error) =>
          this.quizService.getById(id).pipe(
            map((quiz) => ensurePracticeQuizHasQuestions(quiz, error)),
          ),
        ),
      )
    );
  }

  private readNavigationQuiz(): Quiz | null {
    const navigationState = (this.router.getCurrentNavigation()?.extras.state
      ?? globalThis.history?.state) as { quiz?: Quiz } | undefined;
    const quiz = navigationState?.quiz;

    if (!quiz?.id || !Array.isArray(quiz.questions) || !quiz.questions.length) {
      return null;
    }

    return {
      ...quiz,
      questions: quiz.questions.map((question, index) => ({
        id: question.id,
        order: question.order ?? index,
        text: question.text ?? '',
        imageUrl: question.imageUrl ?? '',
        correctChoiceIndex:
          typeof question.correctChoiceIndex === 'number'
            ? question.correctChoiceIndex
            : -1,
        choices: (question.choices ?? []).map((choice) => ({
          text: choice.text ?? '',
          imageUrl: choice.imageUrl ?? '',
        })),
      })),
    };
  }
}
