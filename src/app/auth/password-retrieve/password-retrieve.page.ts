import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
} from '@ionic/angular/standalone';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { PageHeader } from '../../components/page-header';

@Component({
  selector: 'app-password-retrieve',
  template: `
    <page-header [translucent]="true">Réinitialisation</page-header>

    <ion-content class="auth-screen" [fullscreen]="true">
      <div class="auth-shell auth-shell--compact">
        <section class="auth-hero">
          <p class="auth-hero__eyebrow">Accès sécurisé</p>
          <h1>Récupérez votre accès rapidement.</h1>
          <p>
            Entrez votre adresse email et Firebase vous enverra un lien de
            réinitialisation.
          </p>
        </section>

        <form
          class="auth-card"
          [formGroup]="passwordRetrieveForm"
          (ngSubmit)="onSubmit()"
        >
          <div class="auth-card__header">
            <p class="auth-card__eyebrow">Réinitialisation</p>
            <h2>Mot de passe oublié</h2>
            <p>Le lien est envoyé sur l’adresse associée à votre compte.</p>
          </div>

          <p class="form-banner form-banner--info">
            Si cette adresse existe, vous recevrez un email de réinitialisation.
          </p>

          <ion-list lines="none">
            <ion-item>
              <ion-input
                formControlName="email"
                fill="solid"
                label="Adresse email"
                labelPlacement="stacked"
                placeholder="prof@ecole.fr"
                type="email"
                autocomplete="email"
              ></ion-input>
            </ion-item>
            @if (shouldShowFieldError()) {
              <p class="field-error">{{ fieldError() }}</p>
            }
          </ion-list>

          <ion-button
            expand="block"
            type="submit"
            [disabled]="passwordRetrieveForm.invalid || submitting()"
          >
            @if (submitting()) {
              <ion-spinner slot="start" name="crescent"></ion-spinner>
            }
            {{ submitting() ? 'Envoi en cours...' : 'Envoyer le lien' }}
          </ion-button>

          <div class="auth-card__links auth-card__links--single">
            <a [routerLink]="['/login']" [queryParams]="loginQueryParams()">
              Retour à la connexion
            </a>
          </div>
        </form>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .auth-screen {
        --background: var(--app-page-background);
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
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeader,
  ],
})
export class PasswordRetrievePage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly submitting = signal(false);
  readonly prefilledEmail = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get('email')?.trim() ?? ''),
    ),
    { initialValue: '' },
  );
  readonly redirectTo = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get('redirectTo')?.trim() ?? ''),
    ),
    { initialValue: '' },
  );

  readonly passwordRetrieveForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    effect(() => {
      const email = this.prefilledEmail();
      const emailControl = this.passwordRetrieveForm.controls.email;
      if (email && !emailControl.dirty && emailControl.value !== email) {
        emailControl.setValue(email);
      }
    });
  }

  async onSubmit() {
    if (this.passwordRetrieveForm.invalid || this.submitting()) {
      this.passwordRetrieveForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    try {
      await this.authService.sendResetPasswordLink(
        this.passwordRetrieveForm.getRawValue().email,
        this.redirectTo(),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  shouldShowFieldError() {
    const control = this.passwordRetrieveForm.controls.email;
    return control.invalid && (control.touched || control.dirty);
  }

  fieldError() {
    const control = this.passwordRetrieveForm.controls.email;
    if (control.errors?.['required']) {
      return 'L’adresse email est obligatoire.';
    }

    if (control.errors?.['email']) {
      return 'Saisissez une adresse email valide.';
    }

    return 'Ce champ contient une erreur.';
  }

  loginQueryParams() {
    const email = this.passwordRetrieveForm.controls.email.value.trim();
    const redirectTo = this.redirectTo();

    if (!email && !redirectTo) {
      return undefined;
    }

    return {
      email: email || undefined,
      redirectTo: redirectTo || undefined,
    };
  }
}
