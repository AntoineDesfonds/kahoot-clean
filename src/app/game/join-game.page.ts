import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { map } from 'rxjs';
import { PageHeader } from '../components/page-header';
import { GameService } from '../services/game.service';

@Component({
  selector: 'join-game',
  template: `
    <page-header [translucent]="true">Rejoindre une partie</page-header>

    <ion-content [fullscreen]="true">
      <page-header collapse="condense">Rejoindre une partie</page-header>

      <div class="page-shell">
        <section class="hero-panel join-hero">
          <div>
            <p class="hero-panel__eyebrow">Code de partie</p>
            <h1 class="hero-panel__title">Entrez, attendez, jouez.</h1>
            <p class="hero-panel__copy">
              Scannez le QR reçu avec votre ami ou saisissez son code. Si la
              partie n’a pas encore commencé, vous arrivez dans la salle
              d’attente. Sinon, vous retrouvez directement votre partie en cours.
            </p>
          </div>

          <form class="join-card" [formGroup]="joinForm" (ngSubmit)="joinGame()">
            <p class="form-banner form-banner--info">
              Le QR remplit automatiquement le code. Une fois la partie
              commencée, les nouveaux joueurs ne peuvent plus entrer.
            </p>

            <ion-list lines="none">
              <ion-item class="join-code-field">
                <ion-input
                  class="join-code-input"
                  formControlName="code"
                  label="Code à 6 caractères"
                  labelPlacement="stacked"
                  placeholder="Ex: ABC123"
                  maxlength="6"
                  autocapitalize="characters"
                  autocomplete="one-time-code"
                  spellcheck="false"
                ></ion-input>
              </ion-item>
              @if (shouldShowFieldError()) {
                <p class="field-error">{{ fieldError() }}</p>
              } @else {
                <p class="field-help">
                  Utilisez uniquement des lettres et des chiffres.
                </p>
              }
            </ion-list>

            <ion-button
              expand="block"
              type="submit"
              [disabled]="joinForm.invalid || submitting()"
            >
              @if (submitting()) {
                <ion-spinner slot="start" name="crescent"></ion-spinner>
              }
              {{ submitting() ? 'Recherche de la partie...' : 'Rejoindre la partie' }}
            </ion-button>

            <p class="join-card__note">
              Chaque joueur rejoint une salle synchronisée en temps réel. Les
              questions sont ensuite affichées une par une dans un écran dédié.
            </p>
          </form>
        </section>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .join-hero {
        align-items: center;
      }

      .join-card {
        width: min(100%, 460px);
        display: grid;
        gap: 1rem;
        padding: 1.4rem;
        border: 1px solid var(--app-border);
        border-radius: 28px;
        background: var(--app-surface-strong);
        box-shadow: var(--app-shadow-strong);
      }

      .join-card ion-list {
        margin: 0;
      }

      .join-code-field {
        --padding-start: 0.55rem;
        --inner-padding-end: 0.55rem;
      }

      .join-card__note {
        margin: 0;
        color: var(--app-text-muted);
        line-height: 1.6;
      }

      .join-code-input {
        --padding-top: 0.3rem;
        --padding-bottom: 0.3rem;
        font-family: 'Space Grotesk', 'Manrope', sans-serif;
        font-size: 1.32rem;
        font-weight: 700;
        letter-spacing: 0.22em;
      }

      .join-code-input::part(native) {
        text-transform: uppercase;
        text-align: center;
      }

      @media (max-width: 767px) {
        .join-card {
          padding: 1.1rem;
          border-radius: 24px;
        }

        .join-code-input {
          font-size: 1.18rem;
          letter-spacing: 0.18em;
        }
      }

      @media (min-width: 992px) {
        .join-hero {
          grid-template-columns: minmax(0, 1.2fr) 420px;
        }
      }
    `,
  ],
  imports: [
    IonButton,
    IonContent,
    IonInput,
    IonItem,
    IonList,
    IonSpinner,
    PageHeader,
    CommonModule,
    ReactiveFormsModule,
  ],
})
export class JoinGamePage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameService = inject(GameService);
  private readonly toastController = inject(ToastController);
  private autoJoinCode: string | null = null;

  readonly submitting = signal(false);
  readonly prefilledCode = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => this.normalizeEntryCode(params.get('code'))),
    ),
    { initialValue: '' },
  );

  readonly joinForm = this.fb.nonNullable.group({
    code: [
      '',
      [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(6),
        Validators.pattern(/^[a-zA-Z0-9]*$/),
      ],
    ],
  });

  constructor() {
    effect(() => {
      const code = this.prefilledCode();
      const codeControl = this.joinForm.controls.code;

      if (!code) {
        this.autoJoinCode = null;
        return;
      }

      if (!codeControl.dirty && codeControl.value !== code) {
        codeControl.setValue(code);
      }

      if (
        code.length !== 6 ||
        codeControl.invalid ||
        this.submitting() ||
        this.autoJoinCode === code
      ) {
        return;
      }

      this.autoJoinCode = code;
      void this.joinGame();
    });
  }

  async joinGame() {
    const code = this.normalizeEntryCode(this.joinForm.getRawValue().code);
    if (!code || this.submitting() || this.joinForm.invalid) {
      this.joinForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    try {
      const game = await this.gameService.joinGame(code);
      await this.router.navigate(['/game', game.gameId], {
        replaceUrl: true,
      });
    } catch (error) {
      console.error(error);
      await this.presentToast(
        this.gameService.describeError(
          error,
          'Impossible de rejoindre cette partie.',
        ),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2400,
      position: 'top',
    });

    await toast.present();
  }

  private normalizeEntryCode(entryCode: string | null | undefined): string {
    return (entryCode ?? '').replace(/\s+/g, '').toUpperCase();
  }

  shouldShowFieldError() {
    const control = this.joinForm.controls.code;
    return control.invalid && (control.touched || control.dirty);
  }

  fieldError() {
    const control = this.joinForm.controls.code;
    if (control.errors?.['required']) {
      return 'Le code de partie est obligatoire.';
    }

    if (control.errors?.['pattern']) {
      return 'Utilisez uniquement des lettres et des chiffres.';
    }

    if (control.errors?.['minlength'] || control.errors?.['maxlength']) {
      return 'Le code doit contenir exactement 6 caractères.';
    }

    return 'Le code saisi est invalide.';
  }
}
