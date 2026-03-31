import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import {
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
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  apps,
  checkmarkCircle,
  copyOutline,
  diamond,
  ellipse,
  playOutline,
  refreshOutline,
  shapes,
  square,
  trophyOutline,
  triangle,
} from 'ionicons/icons';
import * as QRCode from 'qrcode';
import { Subscription, filter, map, startWith } from 'rxjs';
import { environment } from '../../environments/environment';
import { PageHeader } from '../components/page-header';
import { Game, GamePlayer } from '../models/game';
import { GameQuestion } from '../models/game-question';
import { AuthService } from '../services/auth.service';
import { GameService } from '../services/game.service';

interface AnswerVisual {
  icon: string;
  label: string;
  start: string;
  end: string;
  shadow: string;
}

const ANSWER_VISUALS: AnswerVisual[] = [
  {
    icon: 'triangle',
    label: 'Rouge',
    start: '#ef4444',
    end: '#dc2626',
    shadow: 'rgba(239, 68, 68, 0.34)',
  },
  {
    icon: 'diamond',
    label: 'Bleu',
    start: '#2563eb',
    end: '#1d4ed8',
    shadow: 'rgba(37, 99, 235, 0.34)',
  },
  {
    icon: 'ellipse',
    label: 'Jaune',
    start: '#f59e0b',
    end: '#d97706',
    shadow: 'rgba(245, 158, 11, 0.34)',
  },
  {
    icon: 'square',
    label: 'Vert',
    start: '#22c55e',
    end: '#16a34a',
    shadow: 'rgba(34, 197, 94, 0.34)',
  },
  {
    icon: 'apps',
    label: 'Violet',
    start: '#8b5cf6',
    end: '#7c3aed',
    shadow: 'rgba(139, 92, 246, 0.34)',
  },
  {
    icon: 'shapes',
    label: 'Turquoise',
    start: '#06b6d4',
    end: '#0891b2',
    shadow: 'rgba(6, 182, 212, 0.34)',
  },
];

@Component({
  selector: 'game-session',
  template: `
    <page-header [translucent]="true">Partie en direct</page-header>

    <ion-content [fullscreen]="true">
      <page-header collapse="condense">Partie en direct</page-header>

      <div
        class="page-shell"
        [class.page-shell--play]="shouldShowQuestionStage()"
        [class.page-shell--results]="shouldShowResultsStage()"
      >
        @if (currentGame(); as game) {
          @if (game.status === 'waiting') {
            <section class="hero-panel session-hero">
              <div>
                <p class="hero-panel__eyebrow">Session multijoueur</p>
                <p class="session-hero__quiz">{{ game.quizTitle }}</p>
                <h1 class="hero-panel__title">
                  {{ statusTitle() }}
                </h1>
                <p class="hero-panel__copy">
                  {{ statusCopy() }}
                </p>

                <div class="session-hero__chips">
                  <span [class]="statusClass(game.status)">
                    {{ gameStatusLabel(game.status) }}
                  </span>
                  <span class="status-pill status-pill--active">
                    {{ players().length }} joueurs
                  </span>
                </div>
              </div>

              <div class="game-code-card">
                <p class="game-code-card__label">Code à partager</p>
                <div class="game-code-card__value">{{ game.entryCode }}</div>
                @if (joinQrCodeDataUrl(); as joinQrCodeDataUrl) {
                  <div class="game-code-card__qr">
                    <img
                      [src]="joinQrCodeDataUrl"
                      [alt]="'QR pour rejoindre la partie ' + game.entryCode"
                    />
                  </div>
                } @else {
                  <div class="game-code-card__qr game-code-card__qr--placeholder">
                    <span>QR en préparation...</span>
                  </div>
                }
                <ion-button class="game-code-card__button" (click)="copyCode()">
                  <ion-icon slot="start" name="copy-outline"></ion-icon>
                  {{ copiedCode() ? 'Code copié' : 'Copier le code' }}
                </ion-button>
                <p class="game-code-card__hint">
                  Scannez le QR ou envoyez ce code aux joueurs pour qu’ils
                  rejoignent la partie.
                </p>
              </div>
            </section>

            <div class="session-layout">
              <section class="session-main">
                <ion-card>
                  <ion-card-header>
                    <ion-card-title>Salle d’attente</ion-card-title>
                  </ion-card-header>
                  <ion-card-content>
                    <p>
                      Les joueurs rejoignent la partie avec le code
                      <strong>{{ game.entryCode }}</strong>. Une fois la salle
                      prête, l’hôte lance la partie pour tout le monde. Ensuite,
                      tout le monde joue exactement dans le même flux.
                    </p>

                    <div class="lobby-spotlight">
                      <div
                        class="lobby-spotlight__visual"
                        [style.background-image]="stageArtwork(game)"
                      ></div>
                      <div class="lobby-spotlight__copy">
                        <p class="lobby-spotlight__eyebrow">{{ game.quizTitle }}</p>
                        <h3>La partie est prête</h3>
                        <p>
                          Le code sert seulement à inviter. Dès que la partie
                          commence, l’hôte et ses amis jouent tous de la même
                          façon.
                        </p>
                      </div>
                    </div>

                    <ion-button
                      expand="block"
                      [disabled]="actionLoading() || !isHost()"
                      (click)="startGame()"
                    >
                      <ion-icon slot="start" name="play-outline"></ion-icon>
                      {{ isHost() ? 'Lancer la partie' : 'En attente de l’hôte' }}
                    </ion-button>
                    <p class="session-note">
                      @if (isHost()) {
                        Vous êtes l’hôte. Lancez la partie quand tout le monde
                        est prêt.
                      } @else {
                        Seul {{ hostLabel() }} peut lancer la partie.
                      }
                    </p>
                  </ion-card-content>
                </ion-card>
              </section>

              <aside class="session-sidebar">
                <ion-card>
                  <ion-card-header>
                    <ion-card-title>
                      <ion-icon name="trophy-outline"></ion-icon>
                      Joueurs dans la salle
                    </ion-card-title>
                  </ion-card-header>
                  <ion-card-content>
                    <ion-list lines="none">
                      @for (player of lobbyPlayers(); track player.userId) {
                        <ion-item>
                          <ion-label>
                            <strong>{{ player.alias }}</strong>
                            <p>{{ lobbyPlayerMeta(player) }}</p>
                          </ion-label>
                        </ion-item>
                      } @empty {
                        <ion-item>
                          <ion-label>Aucun joueur dans la salle.</ion-label>
                        </ion-item>
                      }
                    </ion-list>
                  </ion-card-content>
                </ion-card>
              </aside>
            </div>
          } @else if (shouldShowQuestionStage() && currentQuestion(); as question) {
            <section class="question-screen">
              <div class="question-screen__topbar">
                <span class="status-pill status-pill--waiting">
                  Question {{ currentQuestionNumber() }} / {{ game.totalQuestions }}
                </span>
                <span class="status-pill status-pill--active">
                  {{ currentPlayer()?.alias || 'Joueur' }}
                </span>
                <span class="status-pill status-pill--done">
                  {{ currentPlayer()?.score ?? 0 }} points
                </span>
              </div>

              <div class="question-screen__prompt">
                <div class="question-screen__copy">
                  <p class="question-screen__eyebrow">{{ game.quizTitle }}</p>
                  <h1 class="question-screen__title">{{ question.text }}</h1>
                </div>

                <div
                  class="question-screen__visual"
                  [style.background-image]="stageArtwork(game, question.imageUrl)"
                ></div>
              </div>

              <div
                class="timer-panel"
                [class.timer-panel--warning]="remainingSeconds() <= 5 && !isQuestionExpired()"
                [class.timer-panel--expired]="isQuestionExpired()"
              >
                <div class="timer-panel__copy">
                  <span class="timer-panel__label">Temps restant</span>
                  <strong>{{ remainingTimeLabel() }}</strong>
                </div>
                <div class="timer-panel__track">
                  <span [style.width.%]="timerProgressPercent()"></span>
                </div>
              </div>

              <div
                class="answer-grid answer-grid--play"
                [class.answer-grid--has-selection]="activeChoiceIndex() !== null"
              >
                @for (choice of question.choices; track $index; let idx = $index) {
                  <button
                    class="answer-tile"
                    type="button"
                    [class.answer-tile--selected]="activeChoiceIndex() === idx"
                    [class.answer-tile--with-image]="hasChoiceArtwork(choice)"
                    [disabled]="actionLoading() || isQuestionExpired() || hasSubmittedAnswer()"
                    [attr.aria-pressed]="activeChoiceIndex() === idx"
                    [style.--tile-start]="answerVisual(idx).start"
                    [style.--tile-end]="answerVisual(idx).end"
                    [style.--tile-shadow]="answerVisual(idx).shadow"
                    (click)="selectChoice(idx)"
                  >
                    <span class="answer-tile__shape">
                      <ion-icon [name]="answerVisual(idx).icon"></ion-icon>
                    </span>
                    <span class="answer-tile__body">
                      <span class="answer-tile__label">
                        {{ answerVisual(idx).label }}
                      </span>
                      <span class="answer-tile__text">{{ choice.text }}</span>
                      @if (submittedChoiceIndex() === idx) {
                        <span class="answer-tile__state">
                          <ion-icon name="checkmark-circle"></ion-icon>
                          Envoyée
                        </span>
                      } @else if (selectedChoiceIndex() === idx) {
                        <span class="answer-tile__state">
                          <ion-icon name="checkmark-circle"></ion-icon>
                          Sélectionnée
                        </span>
                      }
                    </span>
                    <span
                      class="answer-tile__art"
                      [style.background-image]="answerArtwork(game, question.imageUrl, choice.imageUrl, idx)"
                    ></span>
                  </button>
                }
              </div>

              <div class="question-screen__dock">
                @if (!isQuestionExpired() && activeChoiceIndex() !== null) {
                  <div class="selection-banner">
                    <span class="selection-banner__pill">
                      <ion-icon
                        [name]="answerVisual(activeChoiceIndex() ?? 0).icon"
                      ></ion-icon>
                      {{ answerVisual(activeChoiceIndex() ?? 0).label }}
                    </span>
                    <div>
                      <strong>
                        {{ hasSubmittedAnswer() ? 'Réponse envoyée' : 'Choix sélectionné' }}
                      </strong>
                      <p>{{ selectedChoiceText() }}</p>
                    </div>
                  </div>
                }

                @if (hasSubmittedAnswer()) {
                  <div class="stage-feedback">
                    Réponse envoyée. Attente de la prochaine question.
                  </div>
                } @else if (isQuestionExpired()) {
                  <div class="stage-feedback">
                    Temps écoulé. Passage automatique à la question suivante.
                  </div>
                } @else {
                  <ion-button
                    expand="block"
                    [disabled]="selectedChoiceIndex() === null || actionLoading()"
                    (click)="submitAnswer()"
                  >
                    Valider ma réponse
                  </ion-button>
                }
              </div>
            </section>
          } @else if (shouldShowResultsStage() && (allPlayersFinished() || game.status === 'finished')) {
            <section class="results-screen">
              <div class="results-screen__hero">
                <div>
                  <p class="review-stage__eyebrow">Classement final</p>
                  <h1 class="review-stage__title">Partie terminée</h1>
                  <p class="review-stage__copy">
                    Le classement final tient compte du score total, du nombre
                    de bonnes réponses et du temps cumulé.
                  </p>

                  <div class="results-screen__stats">
                    <article class="result-stat">
                      <span>Votre place</span>
                      <strong>#{{ currentPlayerRank() ?? '-' }}</strong>
                    </article>
                    <article class="result-stat">
                      <span>Joueurs</span>
                      <strong>{{ players().length }}</strong>
                    </article>
                    <article class="result-stat">
                      <span>Vainqueur</span>
                      <strong>{{ winner() ? winner()!.alias : '-' }}</strong>
                    </article>
                  </div>
                </div>

                @if (winner(); as winnerPlayer) {
                  <article class="results-screen__winner">
                    <p class="results-screen__winner-label">1re place</p>
                    <h2>{{ winnerPlayer.alias }}</h2>
                    <p>{{ winnerPlayer.score }} points</p>
                    <p class="results-screen__winner-meta">
                      {{ winnerPlayer.correctAnswers ?? 0 }} bonnes réponses ·
                      {{ formatAnswerTime(winnerPlayer.totalAnswerTimeMs) }}
                    </p>
                  </article>
                }
              </div>

              <div class="podium podium--expanded">
                @for (player of topPlayers(); track player.userId; let idx = $index) {
                  <article class="podium__card" [class]="'podium__card podium__card--' + (idx + 1)">
                    <p class="podium__rank">#{{ idx + 1 }}</p>
                    <h3>{{ player.alias }}</h3>
                    <p>{{ player.score }} pts</p>
                    <p class="podium__meta">
                      Temps total : {{ formatAnswerTime(player.totalAnswerTimeMs) }}
                    </p>
                    <p class="podium__meta">
                      {{ player.correctAnswers ?? 0 }} bonnes réponses
                    </p>
                  </article>
                }
              </div>

              <div class="results-board">
                @for (player of leaderboard(); track player.userId; let idx = $index) {
                  <article
                    class="results-board__row"
                    [class.results-board__row--me]="player.userId === currentUser()?.uid"
                  >
                    <div class="results-board__place">#{{ idx + 1 }}</div>
                    <div class="results-board__identity">
                      <strong>{{ player.alias }}</strong>
                      <p>{{ player.correctAnswers ?? 0 }} bonnes réponses</p>
                    </div>
                    <div class="results-board__metric">
                      <span>Score</span>
                      <strong>{{ player.score }}</strong>
                    </div>
                    <div class="results-board__metric">
                      <span>Temps</span>
                      <strong>{{ formatAnswerTime(player.totalAnswerTimeMs) }}</strong>
                    </div>
                  </article>
                }
              </div>
            </section>
          } @else if (shouldShowResultsStage()) {
            <section class="results-screen results-screen--live">
              <div class="results-screen__hero">
                <div>
                  <p class="review-stage__eyebrow">En attente des autres</p>
                  <h1 class="review-stage__title">Vous avez terminé</h1>
                  <p class="review-stage__copy">
                    Votre score est fixé. Le classement continue à évoluer
                    pendant que les autres joueurs finissent.
                  </p>
                </div>

                <article class="results-screen__winner results-screen__winner--me">
                  <p class="results-screen__winner-label">Votre résultat actuel</p>
                  <h2>#{{ currentPlayerRank() ?? '-' }} {{ currentPlayer()?.alias }}</h2>
                  <p>{{ currentPlayer()?.score ?? 0 }} points</p>
                  <p class="results-screen__winner-meta">
                    {{ currentPlayer()?.correctAnswers ?? 0 }} bonnes réponses ·
                    {{ formatAnswerTime(currentPlayer()?.totalAnswerTimeMs) }}
                  </p>
                </article>
              </div>

              <div class="results-board">
                @for (player of leaderboard(); track player.userId; let idx = $index) {
                  <article
                    class="results-board__row"
                    [class.results-board__row--me]="player.userId === currentUser()?.uid"
                  >
                    <div class="results-board__place">#{{ idx + 1 }}</div>
                    <div class="results-board__identity">
                      <strong>{{ player.alias }}</strong>
                      <p>{{ playerProgressLabel(player, game.totalQuestions) }}</p>
                    </div>
                    <div class="results-board__metric">
                      <span>Score</span>
                      <strong>{{ player.score }}</strong>
                    </div>
                    <div class="results-board__metric">
                      <span>Temps</span>
                      <strong>{{ formatAnswerTime(player.totalAnswerTimeMs) }}</strong>
                    </div>
                  </article>
                }
              </div>
            </section>
          } @else if (isSessionRedirecting()) {
            <section class="review-stage">
              <div class="review-stage__hero">
                <div>
                  <p class="review-stage__eyebrow">Synchronisation</p>
                  <h2 class="review-stage__title">Ouverture de votre écran</h2>
                  <p class="review-stage__copy">
                    Chaque joueur suit sa propre progression. Votre prochaine
                    question ou votre classement s’affiche automatiquement.
                  </p>
                </div>

                <div
                  class="review-stage__visual"
                  [style.background-image]="stageArtwork(game)"
                ></div>
              </div>
            </section>
          }
        } @else if (sessionErrorMessage(); as sessionErrorMessage) {
          <div class="empty-state empty-state--error">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <h3>Impossible d’ouvrir cette partie</h3>
            <p>{{ sessionErrorMessage }}</p>
            <div class="empty-state__actions">
              <ion-button fill="outline" color="dark" (click)="retrySession()">
                <ion-icon slot="start" name="refresh-outline"></ion-icon>
                Réessayer
              </ion-button>
              <ion-button (click)="goToJoinGame()">Rejoindre une autre partie</ion-button>
            </div>
          </div>
        } @else {
          <div class="empty-state">
            <ion-spinner name="crescent"></ion-spinner>
            <h3>Chargement de la partie...</h3>
            <p>Connexion à la salle et synchronisation des joueurs en cours.</p>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    ``,
  ],
  imports: [
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
    CommonModule,
  ],
})
export class GameSessionPage {
  readonly gameId = input.required<string>({ alias: 'gameId' });
  readonly questionIndex = input<string | undefined>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly gameService = inject(GameService);
  private readonly toastController = inject(ToastController);

  private gameSubscription?: Subscription;
  private playersSubscription?: Subscription;
  private copyCodeResetHandle?: ReturnType<typeof globalThis.setTimeout>;
  private boundSessionKey: string | null = null;
  private autoSkippingQuestionKey = signal<string | null>(null);
  private currentQuestionLoadKey: string | null = null;
  private joinQrCodeRequestKey: string | null = null;
  private viewedQuestionKey: string | null = null;
  private readonly refreshNow = () => {
    this.nowMs.set(Date.now());
  };
  private readonly nowTicker = globalThis.setInterval(() => {
    this.refreshNow();
  }, 250);

  readonly currentUser = toSignal(this.authService.getConnectedUser());
  readonly routePath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0] ?? ''),
      startWith(this.router.url.split('?')[0] ?? ''),
    ),
    { initialValue: this.router.url.split('?')[0] ?? '' },
  );
  readonly actionLoading = signal(false);
  readonly copiedCode = signal(false);
  readonly currentGame = signal<Game | null>(null);
  readonly joinQrCodeDataUrl = signal<string | null>(null);
  readonly players = signal<GamePlayer[]>([]);
  readonly currentQuestion = signal<GameQuestion | null>(null);
  readonly selectedChoiceIndex = signal<number | null>(null);
  readonly submittedChoiceIndex = signal<number | null>(null);
  readonly sessionErrorMessage = signal<string | null>(null);
  readonly nowMs = signal(Date.now());
  readonly joinLink = computed(() => {
    const entryCode = this.currentGame()?.entryCode?.trim();
    return entryCode ? this.buildJoinLink(entryCode) : '';
  });

  readonly routeQuestionIndex = computed(() => {
    const rawValue = this.questionIndex();
    if (!rawValue) {
      return null;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
      return null;
    }

    return parsedValue - 1;
  });
  readonly isQuestionRoute = computed(() =>
    this.routePath().includes(`/game/${this.gameId()}/question/`),
  );
  readonly isResultsRoute = computed(() =>
    this.routePath().endsWith(`/game/${this.gameId()}/results`),
  );
  readonly isLobbyRoute = computed(
    () => !this.isQuestionRoute() && !this.isResultsRoute(),
  );
  readonly currentPlayer = computed(() => {
    const currentUserId = this.currentUser()?.uid;
    if (!currentUserId) {
      return null;
    }

    return (
      this.players().find((player) => player.userId === currentUserId) ?? null
    );
  });
  readonly isHost = computed(
    () => this.currentGame()?.hostId === this.currentUser()?.uid,
  );
  readonly hostPlayer = computed(() => {
    const hostId = this.currentGame()?.hostId;
    if (!hostId) {
      return null;
    }

    return this.players().find((player) => player.userId === hostId) ?? null;
  });
  readonly leaderboard = computed(() => [...this.players()]);
  readonly lobbyPlayers = computed(() =>
    [...this.players()].sort((left, right) => {
      const leftIsHost = left.userId === this.currentGame()?.hostId;
      const rightIsHost = right.userId === this.currentGame()?.hostId;
      if (leftIsHost !== rightIsHost) {
        return leftIsHost ? -1 : 1;
      }

      const leftJoinedAt = left.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightJoinedAt =
        right.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftJoinedAt !== rightJoinedAt) {
        return leftJoinedAt - rightJoinedAt;
      }

      return left.alias.localeCompare(right.alias, 'fr');
    }),
  );
  readonly topPlayers = computed(() => this.leaderboard().slice(0, 3));
  readonly winner = computed(() => this.leaderboard()[0] ?? null);
  readonly currentPlayerRank = computed(() => {
    const currentUserId = this.currentUser()?.uid;
    if (!currentUserId) {
      return null;
    }

    const playerIndex = this.leaderboard().findIndex(
      (player) => player.userId === currentUserId,
    );
    return playerIndex >= 0 ? playerIndex + 1 : null;
  });
  readonly hasCurrentPlayerFinished = computed(() => {
    const game = this.currentGame();
    const player = this.currentPlayer();

    if (!game || !player) {
      return false;
    }

    return this.isPlayerFinished(player, game.totalQuestions);
  });
  readonly allPlayersFinished = computed(() => {
    const game = this.currentGame();
    if (!game || !this.players().length) {
      return false;
    }

    return this.players().every((player) =>
      this.isPlayerFinished(player, game.totalQuestions),
    );
  });
  readonly shouldShowQuestionStage = computed(() => {
    if (!this.isQuestionRoute()) {
      return false;
    }

    const player = this.currentPlayer();
    const question = this.currentQuestion();
    if (!player || !question) {
      return false;
    }

    return this.routeQuestionIndex() === (player.currentQuestionIndex ?? 0);
  });
  readonly shouldShowResultsStage = computed(() => {
    if (!this.isResultsRoute()) {
      return false;
    }

    const game = this.currentGame();
    return !!game && (game.status === 'finished' || this.hasCurrentPlayerFinished());
  });
  readonly isSessionRedirecting = computed(() => {
    const game = this.currentGame();
    if (!game) {
      return false;
    }

    if (game.status === 'waiting') {
      return !this.isLobbyRoute();
    }

    const player = this.currentPlayer();
    if (!player) {
      return true;
    }

    if (game.status === 'finished' || this.isPlayerFinished(player, game.totalQuestions)) {
      return !this.isResultsRoute();
    }

    return !this.shouldShowQuestionStage();
  });
  readonly currentQuestionNumber = computed(() => {
    const question = this.currentQuestion();
    if (!question) {
      return 0;
    }

    return (question.order ?? 0) + 1;
  });
  readonly activeChoiceIndex = computed(() =>
    this.submittedChoiceIndex() ?? this.selectedChoiceIndex(),
  );
  readonly hasSubmittedAnswer = computed(
    () => this.submittedChoiceIndex() !== null,
  );
  readonly remainingTimeMs = computed(() => {
    const game = this.currentGame();
    const player = this.currentPlayer();
    const question = this.currentQuestion();

    if (!game || !player || !question) {
      return 0;
    }

    const startedAt = this.resolveQuestionStartMs(player, game);
    if (!startedAt) {
      return this.getQuestionDurationMs(game);
    }

    const endsAt = startedAt + this.getQuestionDurationMs(game);
    return Math.max(0, endsAt - this.nowMs());
  });
  readonly remainingSeconds = computed(() =>
    Math.max(0, Math.ceil(this.remainingTimeMs() / 1000)),
  );
  readonly isQuestionExpired = computed(() => this.remainingTimeMs() === 0);
  readonly timerProgressPercent = computed(() => {
    const game = this.currentGame();
    if (!game) {
      return 0;
    }

    const durationMs = (game.questionDurationSeconds ?? 20) * 1000;
    if (durationMs <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(100, 100 - (this.remainingTimeMs() / durationMs) * 100),
    );
  });

  constructor() {
    addIcons({
      alertCircleOutline,
      apps,
      checkmarkCircle,
      copyOutline,
      diamond,
      ellipse,
      playOutline,
      refreshOutline,
      shapes,
      square,
      trophyOutline,
      triangle,
    });

    globalThis.addEventListener('focus', this.refreshNow);
    globalThis.document.addEventListener('visibilitychange', this.refreshNow);

    effect(
      () => {
        const currentUser = this.currentUser();
        const gameId = this.gameId();
        if (!currentUser) {
          this.gameSubscription?.unsubscribe();
          this.playersSubscription?.unsubscribe();
          this.currentGame.set(null);
          this.players.set([]);
          this.currentQuestion.set(null);
          this.sessionErrorMessage.set(null);
          this.boundSessionKey = null;
          return;
        }

        const sessionKey = `${gameId}:${currentUser.uid}`;
        if (this.boundSessionKey === sessionKey) {
          return;
        }

        this.boundSessionKey = sessionKey;
        this.bindGame(gameId);
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const joinLink = this.joinLink();

        if (!joinLink) {
          this.joinQrCodeRequestKey = null;
          this.joinQrCodeDataUrl.set(null);
          return;
        }

        if (this.joinQrCodeRequestKey === joinLink) {
          return;
        }

        this.joinQrCodeRequestKey = joinLink;
        this.joinQrCodeDataUrl.set(null);

        void QRCode.toDataURL(joinLink, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 280,
          color: {
            dark: '#0f172a',
            light: '#FFFFFFFF',
          },
        })
          .then((dataUrl: string) => {
            if (this.joinQrCodeRequestKey === joinLink) {
              this.joinQrCodeDataUrl.set(dataUrl);
            }
          })
          .catch((error: unknown) => {
            console.error(error);
            if (this.joinQrCodeRequestKey === joinLink) {
              this.joinQrCodeDataUrl.set(null);
            }
          });
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const game = this.currentGame();
        const player = this.currentPlayer();

        if (
          !game ||
          !player ||
          game.status !== 'in-progress' ||
          this.isPlayerFinished(player, game.totalQuestions)
        ) {
          this.currentQuestionLoadKey = null;
          this.currentQuestion.set(null);
          return;
        }

        const questionKey = `${game.id}:${player.userId}:${player.currentQuestionIndex ?? 0}`;
        if (this.currentQuestionLoadKey === questionKey) {
          return;
        }

        this.currentQuestionLoadKey = questionKey;
        void this.gameService
          .getCurrentQuestion(game.id)
          .then((question) => {
            if (this.currentQuestionLoadKey === questionKey) {
              this.currentQuestion.set(question);
            }
          })
          .catch((error) => {
            console.error(error);
            if (this.currentQuestionLoadKey === questionKey) {
              this.currentQuestion.set(null);
            }
          });
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        const game = this.currentGame();
        const player = this.currentPlayer();
        const question = this.currentQuestion();

        if (!game || !player || !question) {
          this.autoSkippingQuestionKey.set(null);
          this.viewedQuestionKey = null;
          this.selectedChoiceIndex.set(null);
          this.submittedChoiceIndex.set(null);
          return;
        }

        const questionKey = `${game.id}:${player.userId}:${player.currentQuestionIndex ?? 0}`;
        if (this.viewedQuestionKey !== questionKey) {
          this.viewedQuestionKey = questionKey;
          this.selectedChoiceIndex.set(null);
          this.submittedChoiceIndex.set(null);
        }

        if (this.remainingTimeMs() > 0 || this.actionLoading()) {
          return;
        }

        if (this.autoSkippingQuestionKey() === questionKey) {
          return;
        }

        this.autoSkippingQuestionKey.set(questionKey);
        void this.gameService
          .skipExpiredQuestion(game.id, player.currentQuestionIndex ?? 0)
          .catch((error) => {
            console.error(error);
            this.autoSkippingQuestionKey.set(null);
          });
      },
      { allowSignalWrites: true },
    );

    effect(() => {
      const game = this.currentGame();
      const player = this.currentPlayer();

      if (!game) {
        return;
      }

      const targetUrl = this.buildExpectedRoute(game, player);
      if (!targetUrl || this.currentPath() === targetUrl) {
        return;
      }

      void this.router.navigateByUrl(targetUrl, { replaceUrl: true });
    });

    this.destroyRef.onDestroy(() => {
      this.gameSubscription?.unsubscribe();
      this.playersSubscription?.unsubscribe();
      if (this.copyCodeResetHandle) {
        globalThis.clearTimeout(this.copyCodeResetHandle);
      }
      globalThis.removeEventListener('focus', this.refreshNow);
      globalThis.document.removeEventListener(
        'visibilitychange',
        this.refreshNow,
      );
      globalThis.clearInterval(this.nowTicker);
    });
  }

  statusTitle(): string {
    const game = this.currentGame();
    if (!game) {
      return 'Chargement';
    }

    if (game.status === 'waiting') {
      return 'Salle prête à accueillir les joueurs.';
    }

    if (this.allPlayersFinished() || game.status === 'finished') {
      return 'Classement final disponible.';
    }

    if (this.hasCurrentPlayerFinished()) {
      return 'Vous avez terminé la partie.';
    }

    return 'Question en cours.';
  }

  statusCopy(): string {
    const game = this.currentGame();
    if (!game) {
      return '';
    }

    if (game.status === 'waiting') {
      return this.isHost()
        ? 'Partagez le code puis lancez la partie quand tout le monde est prêt.'
        : 'Le code vous a bien placé dans la salle. L’hôte lancera la partie dès que tout le monde sera prêt.';
    }

    if (this.allPlayersFinished() || game.status === 'finished') {
      return 'Les scores finaux sont synchronisés. Le podium final tient compte du score, des bonnes réponses et du temps total.';
    }

    if (this.hasCurrentPlayerFinished()) {
      return 'Votre partie est terminée. Le classement continue à évoluer pendant que les autres joueurs finissent.';
    }

    return 'Chaque joueur avance automatiquement d’une question à la suivante dès qu’il répond ou quand le temps est écoulé.';
  }

  progressChipLabel(): string {
    const game = this.currentGame();
    const player = this.currentPlayer();

    if (!game || !player) {
      return 'Connexion...';
    }

    if (this.isPlayerFinished(player, game.totalQuestions)) {
      return 'Terminé';
    }

    return `Question ${(player.currentQuestionIndex ?? 0) + 1} / ${game.totalQuestions}`;
  }

  playerProgressLabel(player: GamePlayer, totalQuestions: number): string {
    if (this.isPlayerFinished(player, totalQuestions)) {
      return 'Terminé';
    }

    return `Question ${(player.currentQuestionIndex ?? 0) + 1} / ${totalQuestions}`;
  }

  hostLabel(): string {
    return this.hostPlayer()?.alias || 'l’hôte';
  }

  lobbyPlayerMeta(player: GamePlayer): string {
    const labels: string[] = [];

    if (player.userId === this.currentUser()?.uid) {
      labels.push('Vous');
    }

    if (player.userId === this.currentGame()?.hostId) {
      labels.push('Hôte');
    }

    if (!labels.length) {
      labels.push('Prêt à jouer');
    }

    return labels.join(' · ');
  }

  gameStatusLabel(status: Game['status']): string {
    switch (status) {
      case 'waiting':
        return 'Salle d’attente';
      case 'in-progress':
        return 'Partie en cours';
      case 'finished':
        return 'Terminée';
    }
  }

  statusClass(status: Game['status']): string {
    if (status === 'finished') {
      return 'status-pill status-pill--done';
    }

    if (status === 'in-progress') {
      return 'status-pill status-pill--active';
    }

    return 'status-pill status-pill--waiting';
  }

  answerVisual(index: number): AnswerVisual {
    return ANSWER_VISUALS[index % ANSWER_VISUALS.length];
  }

  remainingTimeLabel(): string {
    const totalSeconds = this.remainingSeconds();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  timerPillClass(): string {
    if (this.isQuestionExpired()) {
      return 'status-pill status-pill--done';
    }

    if (this.remainingSeconds() <= 5) {
      return 'status-pill status-pill--warning';
    }

    return 'status-pill status-pill--active';
  }

  formatAnswerTime(totalAnswerTimeMs: number | undefined): string {
    const safeValue = Math.max(0, Math.round(totalAnswerTimeMs ?? 0));
    const totalSeconds = safeValue / 1000;
    if (totalSeconds < 60) {
      return `${totalSeconds.toFixed(1)} s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return `${minutes} min ${seconds.toFixed(1)} s`;
  }

  answerArtwork(
    game: Game,
    questionImageUrl: string,
    choiceImageUrl: string,
    index: number,
  ): string {
    const visual = this.answerVisual(index);
    const artwork = this.resolveArtwork(
      choiceImageUrl || questionImageUrl || game.quizCoverImageUrl,
    );
    const overlayStart = choiceImageUrl
      ? this.hexToRgba(visual.start, 0.08)
      : this.hexToRgba(visual.start, 0.16);
    const overlayEnd = choiceImageUrl
      ? 'rgba(255, 255, 255, 0.03)'
      : 'rgba(255, 255, 255, 0.06)';
    return `linear-gradient(135deg, ${overlayStart}, ${overlayEnd}), url('${artwork}')`;
  }

  stageArtwork(game: Game, imageUrl?: string | null): string {
    const artwork = this.resolveArtwork(imageUrl || game.quizCoverImageUrl);
    return `linear-gradient(135deg, ${this.hexToRgba(game.quizThemeColor, 0.2)}, rgba(15, 23, 42, 0.12)), url('${artwork}')`;
  }

  hasChoiceArtwork(choice: GameQuestion['choices'][number]): boolean {
    return !!choice.imageUrl?.trim();
  }

  selectedChoiceText(): string {
    const question = this.currentQuestion();
    const selectedChoiceIndex = this.activeChoiceIndex();

    if (!question || selectedChoiceIndex === null) {
      return '';
    }

    return question.choices[selectedChoiceIndex]?.text ?? '';
  }

  selectChoice(index: number) {
    if (
      this.actionLoading() ||
      this.isQuestionExpired() ||
      this.hasSubmittedAnswer()
    ) {
      return;
    }

    this.selectedChoiceIndex.set(index);
  }

  async copyCode() {
    const entryCode = this.currentGame()?.entryCode;
    if (!entryCode) {
      return;
    }

    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard) {
        throw new Error('Clipboard indisponible');
      }

      await clipboard.writeText(entryCode);
      this.flashCopiedCode();
      await this.presentToast('Code copié dans le presse-papiers.');
    } catch (error) {
      console.error(error);
      await this.presentToast(`Code de partie : ${entryCode}`);
    }
  }

  async startGame() {
    const game = this.currentGame();
    if (!game || !this.isHost()) {
      return;
    }

    this.actionLoading.set(true);

    try {
      await this.gameService.startGame(game.id);
    } catch (error) {
      console.error(error);
      await this.presentToast(
        this.gameService.describeError(
          error,
          'Impossible de démarrer la partie.',
        ),
      );
    } finally {
      this.actionLoading.set(false);
    }
  }

  async submitAnswer() {
    const game = this.currentGame();
    const selectedChoiceIndex = this.selectedChoiceIndex();

    if (!game || selectedChoiceIndex === null) {
      return;
    }

    this.actionLoading.set(true);

    try {
      await this.gameService.submitAnswer(game.id, selectedChoiceIndex);
      this.submittedChoiceIndex.set(selectedChoiceIndex);
      this.selectedChoiceIndex.set(null);
    } catch (error) {
      console.error(error);
      await this.presentToast(
        this.gameService.describeError(
          error,
          'Impossible d’enregistrer cette réponse.',
        ),
      );
    } finally {
      this.actionLoading.set(false);
    }
  }

  retrySession() {
    const currentUser = this.currentUser();
    const gameId = this.gameId();
    if (!currentUser) {
      void this.goToJoinGame();
      return;
    }

    this.sessionErrorMessage.set(null);
    this.currentGame.set(null);
    this.players.set([]);
    this.currentQuestion.set(null);
    this.currentQuestionLoadKey = null;
    this.boundSessionKey = `${gameId}:${currentUser.uid}`;
    this.bindGame(gameId);
  }

  async goToJoinGame() {
    await this.router.navigateByUrl('/join-game', { replaceUrl: true });
  }

  private buildExpectedRoute(
    game: Game,
    player: GamePlayer | null,
  ): string | null {
    if (game.status === 'waiting') {
      return `/game/${game.id}`;
    }

    if (!player) {
      return null;
    }

    if (
      game.status === 'finished' ||
      this.isPlayerFinished(player, game.totalQuestions)
    ) {
      return `/game/${game.id}/results`;
    }

    return `/game/${game.id}/question/${(player.currentQuestionIndex ?? 0) + 1}`;
  }

  private bindGame(gameId: string) {
    this.gameSubscription?.unsubscribe();
    this.playersSubscription?.unsubscribe();

    this.gameSubscription = this.gameService.watchGame(gameId).subscribe({
      next: (game) => {
        if (!game) {
          this.handleGameAccessFailure(
            'Cette partie est introuvable ou vous n’y avez plus accès.',
          );
          return;
        }

        this.sessionErrorMessage.set(null);
        this.currentGame.set(game);
      },
      error: () => {
        this.handleGameAccessFailure(
          'La salle ne peut pas être synchronisée pour le moment.',
        );
      },
    });

    this.playersSubscription = this.gameService.watchPlayers(gameId).subscribe({
      next: (players) => {
        this.sessionErrorMessage.set(null);
        this.players.set(players);
      },
      error: () => {
        this.handleGameAccessFailure(
          'Impossible de récupérer la liste des joueurs de cette salle.',
        );
      },
    });
  }

  private isPlayerFinished(player: GamePlayer, totalQuestions: number): boolean {
    return !!player.finishedAt || (player.currentQuestionIndex ?? 0) >= totalQuestions;
  }

  private handleGameAccessFailure(message: string) {
    this.currentGame.set(null);
    this.players.set([]);
    this.currentQuestion.set(null);
    this.currentQuestionLoadKey = null;
    this.boundSessionKey = null;
    this.sessionErrorMessage.set(message);
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2400,
      position: 'top',
    });

    await toast.present();
  }

  private flashCopiedCode() {
    this.copiedCode.set(true);
    if (this.copyCodeResetHandle) {
      globalThis.clearTimeout(this.copyCodeResetHandle);
    }

    this.copyCodeResetHandle = globalThis.setTimeout(() => {
      this.copiedCode.set(false);
    }, 1800);
  }

  private resolveArtwork(artwork: string | null | undefined): string {
    return artwork?.trim() || 'assets/shapes.svg';
  }

  private buildJoinLink(entryCode: string): string {
    const joinPath = this.router.serializeUrl(
      this.router.createUrlTree(['/join-game'], {
        queryParams: { code: entryCode },
      }),
    );

    return new URL(joinPath, this.resolvePublicOrigin()).toString();
  }

  private getQuestionDurationMs(game: Game): number {
    return (game.questionDurationSeconds ?? 20) * 1000;
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

  private hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '').trim();
    const compact =
      normalized.length === 3
        ? normalized
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : normalized;

    if (!/^[0-9a-fA-F]{6}$/.test(compact)) {
      return `rgba(15, 23, 42, ${alpha})`;
    }

    const red = Number.parseInt(compact.slice(0, 2), 16);
    const green = Number.parseInt(compact.slice(2, 4), 16);
    const blue = Number.parseInt(compact.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  private currentPath(): string {
    return this.router.url.split('?')[0] ?? '';
  }

  private resolvePublicOrigin(): string {
    const fallbackOrigin = `https://${environment.firebaseConfig.authDomain}`;
    const currentOrigin = globalThis.location?.origin?.trim();

    if (!currentOrigin) {
      return fallbackOrigin;
    }

    try {
      const parsedOrigin = new URL(currentOrigin);
      if (
        ['http:', 'https:'].includes(parsedOrigin.protocol) &&
        !['localhost', '127.0.0.1'].includes(parsedOrigin.hostname)
      ) {
        return parsedOrigin.origin;
      }
    } catch {
      return fallbackOrigin;
    }

    return fallbackOrigin;
  }
}
