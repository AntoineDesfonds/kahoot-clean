import { computed, Component, inject, input, signal } from '@angular/core';
import { toSignal, rxResource } from '@angular/core/rxjs-interop';
import {
  IonButton,
  IonCol,
  IonContent,
  IonFab,
  IonFabButton,
  IonGrid,
  IonIcon,
  IonRow,
  IonSearchbar,
  ModalController,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, alertCircleOutline, refreshOutline, sparklesOutline } from 'ionicons/icons';
import { PageHeader } from '../components/page-header';
import { QuizCard } from '../components/quiz.card';
import { CreateQuizModal } from '../modals/create-quiz.modal';
import { QuizEditorDismissState } from './quiz-editor-dismiss-state';
import { AuthService } from '../services/auth.service';
import { ConfirmService } from '../services/confirm.service';
import { QuizService } from '../services/quiz.service';

@Component({
  selector: 'quiz-list',
  template: `
    <page-header [translucent]="true">{{ pageHeaderTitle() }}</page-header>

    <ion-content [fullscreen]="true">
      <page-header collapse="condense">{{ pageHeaderTitle() }}</page-header>

      <div class="page-shell">
        <section class="hero-panel">
          <div>
            <p class="hero-panel__eyebrow">{{ heroEyebrow() }}</p>
            <h1 class="hero-panel__title">{{ heroTitle() }}</h1>
            <p class="hero-panel__copy">{{ heroCopy() }}</p>
          </div>

          <div class="stat-grid">
            <article class="stat-card">
              <p class="stat-card__label">{{ primaryStatLabel() }}</p>
              <p class="stat-card__value">
                {{ isInitialLoad() ? '...' : visibleQuizzes().length }}
              </p>
            </article>
            <article class="stat-card">
              <p class="stat-card__label">{{ secondaryStatLabel() }}</p>
              <p class="stat-card__value">
                {{ isInitialLoad() ? '...' : ownedQuizzesCount() }}
              </p>
            </article>
            <article class="stat-card">
              <p class="stat-card__label">Questions publiées</p>
              <p class="stat-card__value">
                {{ isInitialLoad() ? '...' : totalQuestions() }}
              </p>
            </article>
          </div>

          <div>
            <ion-button
              class="hero-panel__cta"
              size="large"
              (click)="openCreateQuizModal()"
            >
              <ion-icon slot="start" name="sparkles-outline"></ion-icon>
              Créer un quiz
            </ion-button>
          </div>
        </section>

        <div class="section-heading">
          <div>
            <h2>{{ sectionTitle() }}</h2>
            <p>{{ sectionCopy() }}</p>
          </div>

          @if (isRefreshing()) {
            <p class="section-heading__status">Actualisation...</p>
          }
        </div>

        @if (!hasQuizError() && !isInitialLoad()) {
          <section class="library-controls">
            <ion-searchbar
              [value]="searchQuery()"
              [placeholder]="searchPlaceholder()"
              show-clear-button="focus"
              (ionInput)="onSearchInput($event)"
            ></ion-searchbar>

            <p class="library-controls__meta">
              {{ filteredQuizzes().length }} résultat{{
                filteredQuizzes().length > 1 ? 's' : ''
              }}
            </p>
          </section>
        }

        @if (hasQuizError()) {
          <div class="empty-state empty-state--error">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <h3>Impossible de charger les quiz</h3>
            <p>
              La bibliothèque n’a pas pu être récupérée. Vérifiez votre
              connexion puis réessayez.
            </p>
            <div class="empty-state__actions">
              <ion-button fill="outline" color="dark" (click)="reloadQuizzes()">
                <ion-icon slot="start" name="refresh-outline"></ion-icon>
                Réessayer
              </ion-button>
            </div>
          </div>
        } @else if (isInitialLoad()) {
          <div class="empty-state">
            <ion-spinner name="crescent"></ion-spinner>
            <h3>Chargement des quiz...</h3>
            <p>Nous récupérons votre bibliothèque et vos statistiques.</p>
          </div>
        } @else if (filteredQuizzes().length) {
          <ion-grid>
            <ion-row>
              @for (quiz of filteredQuizzes(); track quiz.id) {
                <ion-col size="12" sizeMd="6" sizeXl="4">
                  <quiz-card [quiz]="quiz" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        } @else if (quizItems().length) {
          <div class="empty-state">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <h3>{{ emptyFilterTitle() }}</h3>
            <p>{{ emptyFilterCopy() }}</p>
            <div class="empty-state__actions">
              <ion-button fill="outline" color="dark" (click)="resetFilters()">
                <ion-icon slot="start" name="refresh-outline"></ion-icon>
                Effacer la recherche
              </ion-button>
            </div>
          </div>
        } @else {
          <div class="empty-state">
            <ion-icon name="sparkles-outline"></ion-icon>
            <h3>{{ emptyStateTitle() }}</h3>
            <p>{{ emptyStateCopy() }}</p>
            <ion-button (click)="openCreateQuizModal()">Commencer</ion-button>
          </div>
        }
      </div>
    </ion-content>

    <ion-fab slot="fixed" horizontal="end" vertical="bottom">
      <ion-fab-button (click)="openCreateQuizModal()">
        <ion-icon name="add"></ion-icon>
      </ion-fab-button>
    </ion-fab>
  `,
  styles: [
    `
      .empty-state ion-icon {
        font-size: 2rem;
        color: var(--ion-color-primary);
      }

      .empty-state h3 {
        margin: 0.75rem 0 0.5rem;
      }

      .empty-state p {
        margin: 0 0 1rem;
        color: var(--ion-color-medium);
      }

      .section-heading__status {
        margin: 0;
        color: var(--app-text-muted);
        font-size: 0.9rem;
        font-weight: 700;
      }

      .library-controls {
        display: grid;
        gap: 0.9rem;
        margin-bottom: 1rem;
        padding: 1rem;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: var(--app-shadow-soft);
      }

      .hero-panel__cta {
        width: 100%;
      }

      .library-controls ion-searchbar {
        --background: rgba(248, 250, 252, 0.94);
        --border-radius: 18px;
        --box-shadow: none;
        padding: 0;
      }

      .library-controls__meta {
        margin: 0;
        color: var(--app-text-muted);
        font-size: 0.92rem;
      }

      ion-grid {
        padding: 0;
      }

      ion-col {
        display: flex;
      }

      ion-fab {
        margin-bottom: calc(var(--app-bottom-nav-height) + 0.5rem);
      }

      @media (max-width: 767px) {
        .library-controls {
          padding: 0.85rem;
          border-radius: 20px;
        }
      }

      @media (min-width: 768px) {
        .library-controls {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
        }

        ion-fab {
          display: none;
        }

        .hero-panel__cta {
          width: auto;
          min-width: 200px;
        }
      }

      @media (min-width: 992px) {
        .hero-panel {
          grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.85fr) auto;
          align-items: end;
        }
      }
    `,
  ],
  imports: [
    IonButton,
    IonCol,
    IonContent,
    IonFab,
    IonFabButton,
    IonGrid,
    IonIcon,
    IonRow,
    IonSearchbar,
    IonSpinner,
    PageHeader,
    QuizCard,
  ],
})
export class QuizListPage {
  private readonly quizService = inject(QuizService);
  private readonly authService = inject(AuthService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly confirmService = inject(ConfirmService);

  readonly view = input<'catalog' | 'mine'>('catalog');

  readonly quizzes = rxResource({
    stream: () => this.quizService.getAll(),
    defaultValue: [],
  });
  readonly searchQuery = signal('');
  readonly currentUser = toSignal(this.authService.getConnectedUser());
  readonly hasQuizError = computed(() => this.quizzes.status() === 'error');
  readonly isInitialLoad = computed(
    () => this.quizzes.status() === 'loading' && !this.quizItems().length,
  );
  readonly isRefreshing = computed(() => this.quizzes.status() === 'reloading');
  readonly isMineView = computed(() => this.view() === 'mine');
  readonly quizItems = computed(() =>
    this.hasQuizError() ? [] : this.quizzes.value(),
  );
  readonly visibleQuizzes = computed(() => {
    if (!this.isMineView()) {
      return this.quizItems();
    }

    return this.quizItems().filter(
      (quiz) => quiz.ownerId === this.currentUser()?.uid,
    );
  });
  readonly filteredQuizzes = computed(() => {
    const searchQuery = this.searchQuery().trim().toLocaleLowerCase('fr');
    const currentUserId = this.currentUser()?.uid;

    return this.visibleQuizzes().filter((quiz) => {
      if (!searchQuery) {
        return true;
      }

      const haystack = [
        quiz.title,
        quiz.description,
        quiz.ownerId === currentUserId
          ? 'créé par vous'
          : 'bibliothèque partagée',
      ]
        .join(' ')
        .toLocaleLowerCase('fr');

      return haystack.includes(searchQuery);
    });
  });
  readonly ownedQuizzesCount = computed(
    () =>
      this.quizItems()
        .filter((quiz) => quiz.ownerId === this.currentUser()?.uid).length,
  );
  readonly totalQuestions = computed(() =>
    this.visibleQuizzes()
      .reduce((total, quiz) => total + (quiz.questionsCount ?? 0), 0),
  );
  readonly pageHeaderTitle = computed(() =>
    this.isMineView() ? 'Mes Quiz' : 'Menu principal',
  );
  readonly heroEyebrow = computed(() =>
    this.isMineView() ? 'Collection personnelle' : 'Catalogue de quiz',
  );
  readonly heroTitle = computed(() =>
    this.isMineView()
      ? 'Retrouvez tous les quiz que vous avez créés.'
      : 'Créez, explorez et lancez des parties à partir de tous les quiz.',
  );
  readonly heroCopy = computed(() =>
    this.isMineView()
      ? 'Modifiez rapidement vos quiz, vérifiez leur nombre de questions et lancez une partie multijoueur quand vous êtes prêt.'
      : 'Le catalogue principal regroupe tous les quiz disponibles. Ouvrez un quiz partagé, créez votre propre salle et invitez vos amis avec le code.'
  );
  readonly sectionTitle = computed(() =>
    this.isMineView() ? 'Mes quiz' : 'Catalogue de quiz',
  );
  readonly sectionCopy = computed(() =>
    this.isMineView()
      ? 'Tous vos quiz sont regroupés ici pour les modifier ou les lancer.'
      : 'Ouvrez un quiz pour le parcourir puis utilisez Lancer pour créer une salle multijoueur.'
  );
  readonly searchPlaceholder = computed(() =>
    this.isMineView()
      ? 'Rechercher dans mes quiz'
      : 'Rechercher un quiz',
  );
  readonly primaryStatLabel = computed(() =>
    this.isMineView() ? 'Quiz créés' : 'Quiz disponibles',
  );
  readonly secondaryStatLabel = computed(() =>
    this.isMineView() ? 'Tous vos quiz' : 'Vos quiz',
  );
  readonly emptyFilterTitle = computed(() =>
    this.isMineView() ? 'Aucun de vos quiz ne correspond' : 'Aucun quiz ne correspond',
  );
  readonly emptyFilterCopy = computed(() =>
    this.isMineView()
      ? 'Essayez un autre mot-clé pour retrouver plus vite un quiz que vous avez créé.'
      : 'Essayez un autre mot-clé pour élargir les résultats.'
  );
  readonly emptyStateTitle = computed(() =>
    this.isMineView() ? 'Vous n avez pas encore créé de quiz' : 'Aucun quiz pour le moment',
  );
  readonly emptyStateCopy = computed(() =>
    this.isMineView()
      ? 'Créez votre premier quiz pour alimenter votre bibliothèque personnelle.'
      : 'Créez votre première activité pour remplir la bibliothèque et lancer une partie multijoueur.'
  );

  constructor() {
    addIcons({ add, alertCircleOutline, refreshOutline, sparklesOutline });
  }

  async openCreateQuizModal() {
    const dismissState: QuizEditorDismissState = {
      hasUnsavedChanges: () => false,
      hasPendingUploads: () => false,
    };
    const modalRef = await this.modalCtrl.create({
      component: CreateQuizModal,
      componentProps: {
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

    if (eventDetails.data) {
      try {
        await this.quizService.setQuiz(eventDetails.data);
        await this.presentToast('Quiz enregistre.');
      } catch (error) {
        console.error(error);
        await this.presentToast(
          this.quizService.describeError(
            error,
            'Impossible d enregistrer ce quiz.',
          ),
        );
      }
    }
  }

  reloadQuizzes() {
    this.quizzes.reload();
  }

  onSearchInput(event: Event) {
    const target = event.target as HTMLIonSearchbarElement | null;
    this.searchQuery.set(target?.value?.toString() ?? '');
  }

  resetFilters() {
    this.searchQuery.set('');
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'top',
    });
    await toast.present();
  }
}
