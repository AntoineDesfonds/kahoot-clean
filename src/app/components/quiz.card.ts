import { TitleCasePipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { eyeOutline, playOutline } from 'ionicons/icons';
import { Quiz } from '../models/quiz';
import { AuthService } from '../services/auth.service';
import { GameService } from '../services/game.service';

@Component({
  selector: 'quiz-card',
  template: `
    @let quiz = this.quiz();

    <ion-card
      class="quiz-card"
      [style.--quiz-accent]="quiz.themeColor"
    >
      <div
        class="quiz-card__cover"
        [style.background-image]="coverBackground(quiz)"
      ></div>

      <ion-card-header>
        <div class="quiz-card__chips">
          <span class="status-pill status-pill--active">
            {{ quiz.questionsCount ?? quiz.questions.length }} questions
          </span>
          <span class="status-pill status-pill--done">
            {{ quiz.estimatedDurationMinutes }} min
          </span>
        </div>

        <ion-card-title>{{ quiz.title | titlecase }}</ion-card-title>
        <ion-card-subtitle>
          {{ ownershipLabel(quiz) }}
        </ion-card-subtitle>
      </ion-card-header>

      <ion-card-content>
        <p class="quiz-card__description">{{ quiz.description }}</p>

        <div class="quiz-card__actions">
          <ion-button
            fill="clear"
            color="dark"
            [routerLink]="['/quiz', quiz.id]"
          >
            <ion-icon slot="start" name="eye-outline"></ion-icon>
            Ouvrir
          </ion-button>

          @if (canLaunchGame()) {
            <ion-button (click)="createGame($event)">
              <ion-icon slot="start" name="play-outline"></ion-icon>
              Lancer
            </ion-button>
          }
        </div>
      </ion-card-content>
    </ion-card>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .quiz-card {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.96),
          rgba(248, 250, 252, 0.94)
        );
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease;
      }

      @media (hover: hover) {
        .quiz-card:hover {
          transform: translateY(-4px);
          border-color: rgba(15, 118, 110, 0.16);
          box-shadow: var(--app-shadow-strong);
        }
      }

      ion-card-header,
      ion-card-content {
        display: grid;
      }

      ion-card-content {
        flex: 1;
        gap: 1rem;
      }

      .quiz-card__cover {
        height: 180px;
        background-size: cover;
        background-position: center;
        border-bottom: 1px solid rgba(15, 23, 42, 0.06);
      }

      .quiz-card__cover::after {
        content: '';
        display: block;
        width: 100%;
        height: 100%;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(15, 23, 42, 0.08));
      }

      .quiz-card__chips {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-bottom: 0.9rem;
      }

      ion-card-title {
        color: var(--app-text-strong);
        font-size: 1.35rem;
        text-wrap: balance;
      }

      ion-card-subtitle {
        color: var(--app-text-muted);
      }

      .quiz-card__description {
        margin: 0;
        color: var(--app-text-muted);
        min-height: 4.8rem;
        line-height: 1.65;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .quiz-card__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: stretch;
        gap: 0.75rem;
        margin-top: auto;
      }

      .quiz-card__actions ion-button {
        width: 100%;
        margin: 0;
      }

      .quiz-card__actions ion-button:only-child {
        grid-column: 1 / -1;
      }

      .quiz-card__actions ion-button[fill='clear'] {
        --background: rgba(248, 250, 252, 0.86);
      }

      @media (max-width: 767px) {
        .quiz-card {
          border-radius: 24px;
        }

        .quiz-card__cover {
          height: 160px;
        }

        ion-card-title {
          font-size: 1.2rem;
        }

        .quiz-card__description {
          min-height: auto;
        }
      }
    `,
  ],
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonIcon,
    RouterLink,
    TitleCasePipe,
  ],
})
export class QuizCard {
  readonly quiz = input.required<Quiz>();

  private readonly gameService = inject(GameService);
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  private readonly authService = inject(AuthService);
  private readonly currentUser = toSignal(this.authService.getConnectedUser());

  constructor() {
    addIcons({ eyeOutline, playOutline });
  }

  canLaunchGame() {
    const quiz = this.quiz();
    return (quiz.questionsCount ?? quiz.questions.length ?? 0) > 0;
  }

  ownershipLabel(quiz: Quiz) {
    return quiz.ownerId === this.currentUser()?.uid
      ? 'Créé par vous'
      : 'Quiz partagé';
  }

  coverBackground(quiz: Quiz) {
    const coverImageUrl = quiz.coverImageUrl.trim() || 'assets/shapes.svg';
    return `linear-gradient(135deg, ${quiz.themeColor}cc, rgba(15, 23, 42, 0.2)), url('${coverImageUrl}')`;
  }

  async createGame(event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();

    try {
      const game = await this.gameService.createGame(this.quiz().id);
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
      const toast = await this.toastController.create({
        message: this.gameService.describeError(
          error,
          'Impossible de créer la partie.',
        ),
        duration: 2200,
        position: 'top',
      });
      await toast.present();
    }
  }
}
