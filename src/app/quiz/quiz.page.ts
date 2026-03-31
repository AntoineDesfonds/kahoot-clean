import { TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  ModalController,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  createOutline,
  playOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';
import { map, of } from 'rxjs';
import { PageHeader } from '../components/page-header';
import { CreateQuizModal } from '../modals/create-quiz.modal';
import { QuizEditorDismissState } from './quiz-editor-dismiss-state';
import { AuthService } from '../services/auth.service';
import { ConfirmService } from '../services/confirm.service';
import { GameService } from '../services/game.service';
import { QuizService } from '../services/quiz.service';

@Component({
  selector: 'quiz',
  template: `
    <page-header [translucent]="true">Fiche quiz</page-header>

    <ion-content [fullscreen]="true">
      <page-header collapse="condense">Fiche quiz</page-header>

      <div class="page-shell">
        @if (quizResource.status() === 'loading') {
          <div class="empty-state">
            <ion-spinner name="crescent"></ion-spinner>
            <h3>Chargement du quiz...</h3>
            <p>Nous récupérons les questions et les informations du quiz.</p>
          </div>
        } @else if (quizResource.status() === 'error') {
          <div class="empty-state empty-state--error">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <h3>Impossible d’ouvrir ce quiz</h3>
            <p>
              Le quiz est introuvable ou vous n’y avez plus accès pour le
              moment.
            </p>
            <div class="empty-state__actions">
              <ion-button fill="outline" color="dark" (click)="reloadQuiz()">
                <ion-icon slot="start" name="refresh-outline"></ion-icon>
                Réessayer
              </ion-button>
              <ion-button (click)="goToQuizList()">Retour aux quiz</ion-button>
            </div>
          </div>
        } @else {
          @let quiz = quizResource.value();

          <section
            class="hero-panel quiz-hero"
            [style.--quiz-accent]="quiz.themeColor"
          >
            <div>
              <p class="hero-panel__eyebrow">Quiz détaillé</p>
              <h1 class="hero-panel__title">{{ quiz.title | titlecase }}</h1>
              <p class="hero-panel__copy">{{ quiz.description }}</p>

              <div class="quiz-hero__chips">
                <span class="status-pill status-pill--active">
                  {{ quiz.questionsCount ?? quiz.questions.length }} questions
                </span>
                <span class="status-pill status-pill--done">
                  {{ quiz.estimatedDurationMinutes }} min
                </span>
              </div>

              <div class="quiz-hero__actions">
                @if (canStartGame()) {
                  <ion-button [disabled]="launchingGame()" (click)="createGame()">
                    <ion-icon slot="start" name="play-outline"></ion-icon>
                    {{ launchingGame() ? 'Création...' : 'Lancer' }}
                  </ion-button>
                }
                @if (canManageQuiz()) {
                  <ion-button
                    fill="outline"
                    color="dark"
                    [disabled]="openingEditor() || savingQuiz() || deletingQuiz()"
                    (click)="editQuiz()"
                  >
                    <ion-icon slot="start" name="create-outline"></ion-icon>
                    {{ editButtonLabel() }}
                  </ion-button>
                  <ion-button
                    fill="clear"
                    color="danger"
                    [disabled]="launchingGame() || openingEditor() || savingQuiz() || deletingQuiz()"
                    (click)="deleteQuiz()"
                  >
                    <ion-icon slot="start" name="trash-outline"></ion-icon>
                    {{ deletingQuiz() ? 'Suppression...' : 'Supprimer' }}
                  </ion-button>
                }
              </div>
            </div>

            <div
              class="quiz-hero__cover"
              [style.background-image]="coverBackground()"
            ></div>
          </section>

          <div class="section-heading">
            <div>
              <h2>Questions</h2>
              <p>
                @if (canManageQuiz()) {
                  Les bonnes réponses restent visibles ici pour ajuster votre
                  quiz avant de lancer une salle.
                } @else {
                  Ce quiz est partagé. Lancez votre propre salle et jouez avec
                  vos amis sans modifier le contenu d origine.
                }
              </p>
            </div>
          </div>

          @if (canManageQuiz() && quiz.questions.length) {
            <div class="quiz-questions">
              @for (question of quiz.questions; track question.id; let idx = $index) {
                <ion-card>
                  <ion-card-header>
                    <p class="quiz-question__eyebrow">Question {{ idx + 1 }}</p>
                    <ion-card-title>{{ question.text }}</ion-card-title>
                  </ion-card-header>

                  <ion-card-content>
                    @if (question.imageUrl) {
                      <div
                        class="quiz-question__visual"
                        [style.background-image]="questionBackground(question.imageUrl)"
                      ></div>
                    }

                    <ion-list lines="none">
                      @for (
                        choice of question.choices;
                        track $index;
                        let choiceIndex = $index
                      ) {
                        <ion-item class="quiz-choice">
                          @if (choice.imageUrl) {
                            <div
                              slot="start"
                              class="quiz-choice__thumb"
                              [style.background-image]="questionBackground(choice.imageUrl)"
                            ></div>
                          }

                          <ion-label>
                            <h3>{{ choice.text }}</h3>
                            @if (choice.imageUrl) {
                              <p>Illustration associée à la réponse</p>
                            }
                          </ion-label>
                          @if (choiceIndex === question.correctChoiceIndex) {
                            <ion-badge slot="end" color="success">Correcte</ion-badge>
                          }
                        </ion-item>
                      }
                    </ion-list>
                  </ion-card-content>
                </ion-card>
              }
            </div>
          } @else if (canManageQuiz()) {
            <div class="empty-state">
              <h3>Aucune question pour le moment</h3>
              <p>
                Ajoutez au moins une question avant de lancer une partie avec ce
                quiz.
              </p>
              @if (canManageQuiz()) {
                <div class="empty-state__actions">
                  <ion-button
                    fill="outline"
                    color="dark"
                    [disabled]="openingEditor() || savingQuiz() || deletingQuiz()"
                    (click)="editQuiz()"
                  >
                    <ion-icon slot="start" name="create-outline"></ion-icon>
                    {{ openingEditor() ? 'Ouverture...' : 'Ajouter des questions' }}
                  </ion-button>
                </div>
              }
            </div>
          } @else if (canStartGame()) {
            <ion-card class="quiz-info-card">
              <ion-card-content>
                Ce quiz est prêt pour une partie multijoueur. Utilisez le bouton
                <strong>Lancer</strong> pour créer une salle et partager le code
                avec vos amis.
              </ion-card-content>
            </ion-card>
          } @else {
            <div class="empty-state">
              <h3>Aucune question pour le moment</h3>
              <p>Ajoutez d abord des questions avant de créer une salle.</p>
            </div>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .quiz-hero {
        grid-template-columns: minmax(0, 1.2fr);
        align-items: center;
        gap: 1.25rem;
      }

      .quiz-hero__chips {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin: 1rem 0;
      }

      .quiz-hero__actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .quiz-hero__actions ion-button {
        margin: 0;
      }

      .quiz-hero__cover {
        min-height: 240px;
        border-radius: 28px;
        background-size: cover;
        background-position: center;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.16),
          0 18px 40px rgba(15, 23, 42, 0.12);
      }

      .quiz-questions {
        display: grid;
        gap: 1rem;
      }

      .quiz-info-card {
        margin: 0;
        border-style: solid;
        background:
          radial-gradient(circle at top right, rgba(15, 118, 110, 0.08), transparent 28%),
          rgba(255, 255, 255, 0.94);
      }

      .quiz-question__eyebrow {
        margin: 0 0 0.5rem;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--app-text-soft);
      }

      .quiz-question__visual {
        min-height: 220px;
        margin-bottom: 1rem;
        border-radius: 22px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background-color: rgba(248, 250, 252, 0.92);
        background-size: cover;
        background-position: center;
        box-shadow: var(--app-shadow-soft);
      }

      .quiz-choice {
        --background: rgba(248, 250, 252, 0.88);
        --border-radius: 20px;
        --padding-start: 0.55rem;
        --inner-padding-end: 0.85rem;
        margin-bottom: 0.75rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 20px;
      }

      .quiz-choice__thumb {
        width: 76px;
        min-width: 76px;
        aspect-ratio: 1;
        border-radius: 16px;
        background-size: cover;
        background-position: center;
        background-color: rgba(15, 23, 42, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
      }

      .quiz-choice ion-label h3 {
        margin: 0 0 0.2rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--app-text-strong);
      }

      .quiz-choice ion-label p {
        margin: 0;
        color: var(--app-text-muted);
        font-size: 0.86rem;
      }

      @media (max-width: 767px) {
        .quiz-hero {
          gap: 1rem;
        }

        .quiz-hero__actions {
          display: grid;
          grid-template-columns: 1fr;
        }

        .quiz-hero__actions ion-button {
          width: 100%;
        }

        .quiz-hero__cover {
          min-height: 180px;
          border-radius: 24px;
        }

        .quiz-question__visual {
          min-height: 180px;
          margin-bottom: 0.85rem;
        }

        .quiz-choice {
          --padding-start: 0.45rem;
          --inner-padding-end: 0.7rem;
        }

        .quiz-choice__thumb {
          width: 62px;
          min-width: 62px;
          border-radius: 14px;
        }
      }

      @media (min-width: 992px) {
        .quiz-hero {
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
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonSpinner,
    PageHeader,
    TitleCasePipe,
  ],
})
export class QuizPage {
  private readonly quizService = inject(QuizService);
  private readonly gameService = inject(GameService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);

  readonly quizId = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get('quizId')?.trim() ?? ''),
    ),
    {
      initialValue: this.route.snapshot.paramMap.get('quizId')?.trim() ?? '',
    },
  );
  readonly currentUser = toSignal(this.authService.getConnectedUser());
  readonly launchingGame = signal(false);
  readonly openingEditor = signal(false);
  readonly savingQuiz = signal(false);
  readonly deletingQuiz = signal(false);

  readonly quizResource = rxResource({
    stream: ({ params }) =>
      params.id ? this.quizService.getById(params.id) : of(this.emptyQuiz()),
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

  readonly canManageQuiz = computed(
    () => this.quizResource.value().ownerId === this.currentUser()?.uid,
  );
  readonly canStartGame = computed(
    () =>
      (this.quizResource.value().questionsCount
        ?? this.quizResource.value().questions.length
        ?? 0) > 0,
  );

  constructor() {
    addIcons({
      alertCircleOutline,
      createOutline,
      playOutline,
      refreshOutline,
      trashOutline,
    });
  }

  coverBackground() {
    const quiz = this.quizResource.value();
    const coverImageUrl = quiz.coverImageUrl.trim() || 'assets/shapes.svg';
    return `linear-gradient(135deg, ${quiz.themeColor}cc, rgba(15, 23, 42, 0.18)), url('${coverImageUrl}')`;
  }

  questionBackground(imageUrl: string) {
    const source = imageUrl.trim() || 'assets/shapes.svg';
    return `linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 118, 110, 0.08)), url('${source}')`;
  }

  async createGame() {
    if (this.launchingGame()) {
      return;
    }

    this.launchingGame.set(true);

    try {
      const game = await this.gameService.createGame(this.quizResource.value().id);
      const toast = await this.toastController.create({
        message: `Partie créée. Code : ${game.entryCode}`,
        duration: 2200,
        position: 'top',
      });
      await toast.present();
      await this.router.navigate(['/game', game.gameId], {
        replaceUrl: true,
      });
    } catch (error) {
      console.error(error);
      await this.presentToast(
        this.gameService.describeError(
          error,
          'Impossible de lancer la partie.',
        ),
      );
    } finally {
      this.launchingGame.set(false);
    }
  }

  async editQuiz() {
    if (!this.canManageQuiz() || this.openingEditor() || this.savingQuiz() || this.deletingQuiz()) {
      return;
    }

    this.openingEditor.set(true);

    try {
      const editableQuiz = await this.quizService.getEditableById(
        this.quizResource.value().id,
      );
      const dismissState: QuizEditorDismissState = {
        hasUnsavedChanges: () => false,
        hasPendingUploads: () => false,
      };
      const modalRef = await this.modalCtrl.create({
        component: CreateQuizModal,
        componentProps: {
          quiz: editableQuiz,
          dismissState,
        },
        backdropDismiss: false,
        canDismiss: async (_data, role) => {
          if (role === 'save') {
            return true;
          }

          if (dismissState.hasPendingUploads()) {
            await this.presentToast(
              'Attendez la fin de l import de l image avant de quitter.',
            );
            return false;
          }

          if (!dismissState.hasUnsavedChanges()) {
            return true;
          }

          return this.confirmService.confirm({
            header: 'Quitter sans enregistrer ?',
            message: 'Les modifications non enregistrées seront perdues.',
            confirmText: 'Quitter',
            confirmRole: 'destructive',
          });
        },
        cssClass: 'fullscreen-modal',
      });

      await modalRef.present();
      const eventDetails = await modalRef.onDidDismiss();

      if (eventDetails.role !== 'save' || !eventDetails.data) {
        return;
      }

      this.savingQuiz.set(true);

      try {
        await this.quizService.setQuiz(eventDetails.data);
        this.quizResource.reload();
        await this.presentToast('Quiz enregistre.');
      } catch (error) {
        console.error(error);
        await this.presentToast(
          this.quizService.describeError(
            error,
            'Impossible d enregistrer ce quiz.',
          ),
        );
      } finally {
        this.savingQuiz.set(false);
      }
    } catch (error) {
      console.error(error);
      await this.presentToast(
        this.quizService.describeError(
          error,
          'Impossible d ouvrir ce quiz en modification.',
        ),
      );
    } finally {
      this.openingEditor.set(false);
    }
  }

  async deleteQuiz() {
    if (this.deletingQuiz()) {
      return;
    }

    const confirmed = await this.confirmService.confirm({
      header: 'Supprimer ce quiz ?',
      message: 'Le quiz et toutes ses questions seront supprimés définitivement.',
      confirmText: 'Supprimer',
      confirmRole: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    this.deletingQuiz.set(true);

    try {
      await this.quizService.deleteQuiz(this.quizResource.value().id);
      await this.router.navigateByUrl('/quizzes');
      await this.presentToast('Quiz supprime.');
    } catch (error) {
      console.error(error);
      await this.presentToast('Impossible de supprimer ce quiz.');
    } finally {
      this.deletingQuiz.set(false);
    }
  }

  reloadQuiz() {
    this.quizResource.reload();
  }

  editButtonLabel() {
    if (this.openingEditor()) {
      return 'Ouverture...';
    }

    if (this.savingQuiz()) {
      return 'Enregistrement...';
    }

    return 'Modifier';
  }

  async goToQuizList() {
    await this.router.navigateByUrl('/quizzes');
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'top',
    });
    await toast.present();
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
}
