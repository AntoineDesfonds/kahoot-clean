import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logoGoogle } from 'ionicons/icons';
import { map } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <ion-content class="auth-screen" [fullscreen]="true">
      <div class="auth-shell">
        <section class="auth-hero">
          <p class="auth-hero__eyebrow">Kahoot Studio</p>
          <h1>Lancez des quiz multijoueurs sans friction.</h1>
          <p>
            Créez une partie, partagez un code unique et laissez Firebase
            synchroniser la salle, les scores et la progression en direct.
          </p>
        </section>

        <form class="auth-card" [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          <div class="auth-card__header">
            <p class="auth-card__eyebrow">Connexion</p>
            <h2>Bienvenue</h2>
            <p>Connectez-vous pour gérer vos quiz et lancer une partie.</p>
          </div>

          @if (verificationBanner(); as verificationBanner) {
            <div
              class="form-banner"
              [class.form-banner--info]="verificationBanner.tone === 'info'"
              [class.form-banner--warning]="verificationBanner.tone === 'warning'"
            >
              <p class="form-banner__copy">{{ verificationBanner.message }}</p>

              @if (verificationBanner.showResend) {
                <div class="form-banner__actions">
                  <ion-button
                    fill="clear"
                    size="small"
                    type="button"
                    [disabled]="busy() || !canResendVerification()"
                    (click)="resendVerificationEmail()"
                  >
                    @if (resendSubmitting()) {
                      <ion-spinner slot="start" name="crescent"></ion-spinner>
                    }
                    {{
                      resendSubmitting()
                        ? 'Envoi du lien...'
                        : 'Renvoyer l’email de vérification'
                    }}
                  </ion-button>

                  @if (verificationBanner.showRetryLogin) {
                    <ion-button
                      size="small"
                      type="button"
                      [disabled]="busy() || !canRetryLogin()"
                      (click)="retryVerifiedLogin()"
                    >
                      @if (submitting()) {
                        <ion-spinner slot="start" name="crescent"></ion-spinner>
                      }
                      {{
                        submitting()
                          ? 'Vérification...'
                          : 'J’ai déjà validé mon email'
                      }}
                    </ion-button>
                  }
                </div>
              }
            </div>
          } @else {
            <p class="form-banner form-banner--info">
              Si vous venez de créer votre compte, confirmez d’abord votre
              email.
            </p>
          }

          <div class="auth-card__social">
            <ion-button
              expand="block"
              fill="outline"
              type="button"
              [disabled]="busy()"
              (click)="continueWithGoogle()"
            >
              @if (googleSubmitting()) {
                <ion-spinner slot="start" name="crescent"></ion-spinner>
              } @else {
                <ion-icon slot="start" name="logo-google"></ion-icon>
              }
              Continuer avec Google
            </ion-button>

            <div class="auth-card__divider">
              <span>ou avec votre email</span>
            </div>
          </div>

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
            @if (shouldShowFieldError('email')) {
              <p class="field-error">{{ fieldError('email') }}</p>
            }
            <ion-item>
              <ion-input
                formControlName="password"
                fill="solid"
                label="Mot de passe"
                labelPlacement="stacked"
                placeholder="Votre mot de passe"
                type="password"
                autocomplete="current-password"
              ></ion-input>
            </ion-item>
            @if (shouldShowFieldError('password')) {
              <p class="field-error">{{ fieldError('password') }}</p>
            }
          </ion-list>

          <div class="auth-card__actions">
            <ion-button
              expand="block"
              type="submit"
              [disabled]="loginForm.invalid || busy()"
            >
              @if (submitting()) {
                <ion-spinner slot="start" name="crescent"></ion-spinner>
              }
              {{ submitting() ? 'Connexion...' : 'Se connecter' }}
            </ion-button>

            <div class="auth-card__links">
              <a
                [routerLink]="['/password-retrieve']"
                [queryParams]="emailQueryParams()"
              >
                Mot de passe oublié ?
              </a>
              <a [routerLink]="['/register']" [queryParams]="emailQueryParams()">
                Créer un compte
              </a>
            </div>
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

      .form-banner__copy {
        margin: 0;
      }

      .form-banner__actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        margin-top: 0.75rem;
      }

      .form-banner ion-button {
        margin: 0;
      }
    `,
  ],
  imports: [
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonSpinner,
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
  ],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly submitting = signal(false);
  readonly googleSubmitting = signal(false);
  readonly resendSubmitting = signal(false);
  readonly busy = computed(
    () =>
      this.submitting() || this.googleSubmitting() || this.resendSubmitting(),
  );
  readonly verificationContext = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({
        verification:
          params.get('verification') as
            | 'required'
            | 'ready'
            | 'resent'
            | 'sent'
            | null,
        recovery: params.get('recovery') as 'sent' | null,
        email: params.get('email')?.trim() ?? '',
        redirectTo: params.get('redirectTo')?.trim() ?? '',
      })),
    ),
    {
      initialValue: {
        verification: null,
        recovery: null,
        email: '',
        redirectTo: '',
      },
    },
  );

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    addIcons({ logoGoogle });

    effect(() => {
      const verificationEmail = this.verificationContext().email;
      const emailControl = this.loginForm.controls.email;
      if (
        verificationEmail &&
        !emailControl.dirty &&
        emailControl.value !== verificationEmail
      ) {
        emailControl.setValue(verificationEmail);
      }
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid || this.busy()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.submitting.set(true);

    try {
      await this.authService.login(email, password, this.redirectTo());
    } finally {
      this.submitting.set(false);
    }
  }

  async continueWithGoogle() {
    if (this.busy()) {
      return;
    }

    this.googleSubmitting.set(true);

    try {
      await this.authService.signInWithGoogle(this.redirectTo());
    } finally {
      this.googleSubmitting.set(false);
    }
  }

  async resendVerificationEmail() {
    if (this.busy() || !this.canResendVerification()) {
      this.loginForm.controls.email.markAsTouched();
      this.loginForm.controls.password.markAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.resendSubmitting.set(true);

    try {
      const resendStatus = await this.authService.resendEmailVerification(
        email,
        password,
      );
      if (resendStatus === 'resent' || resendStatus === 'already-verified') {
        this.loginForm.controls.password.reset('');
        await this.router.navigate([], {
          relativeTo: this.route,
          replaceUrl: true,
          queryParams: {
            verification: resendStatus === 'resent' ? 'resent' : 'ready',
            email: email.trim(),
          },
          queryParamsHandling: 'merge',
        });
      }
    } finally {
      this.resendSubmitting.set(false);
    }
  }

  async retryVerifiedLogin() {
    if (this.busy() || !this.canRetryLogin()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    await this.onSubmit();
  }

  shouldShowFieldError(fieldName: 'email' | 'password') {
    const control = this.loginForm.controls[fieldName];
    return control.invalid && (control.touched || control.dirty);
  }

  verificationBanner() {
    const verification = this.verificationContext().verification;
    const recovery = this.verificationContext().recovery;
    const email = this.verificationContext().email;
    if (verification === 'required') {
      return {
        tone: 'warning' as const,
        showResend: true,
        showRetryLogin: true,
        message: email
          ? `Le compte ${email} existe, mais son email n’a pas encore été validé.`
          : 'Votre compte existe, mais son email n’a pas encore été validé.',
      };
    }

    if (verification === 'ready') {
      return {
        tone: 'info' as const,
        showResend: false,
        showRetryLogin: false,
        message: email
          ? `L’email ${email} est maintenant validé. Connectez-vous pour continuer.`
          : 'Votre email est maintenant validé. Connectez-vous pour continuer.',
      };
    }

    if (verification === 'resent') {
      return {
        tone: 'info' as const,
        showResend: false,
        showRetryLogin: false,
        message: email
          ? `Un nouveau lien a été envoyé à ${email}.`
          : 'Un nouveau lien de vérification a été envoyé.',
      };
    }

    if (verification === 'sent') {
      return {
        tone: 'info' as const,
        showResend: false,
        showRetryLogin: false,
        message: email
          ? `Un premier lien a été envoyé à ${email}.`
          : 'Un lien de vérification vient d’être envoyé.',
      };
    }

    if (recovery === 'sent') {
      return {
        tone: 'info' as const,
        showResend: false,
        showRetryLogin: false,
        message: email
          ? `Un lien de réinitialisation a été envoyé à ${email}.`
          : 'Un lien de réinitialisation vient d’être envoyé.',
      };
    }

    return null;
  }

  canResendVerification() {
    return (
      this.loginForm.controls.email.valid && this.loginForm.controls.password.valid
    );
  }

  canRetryLogin() {
    return this.canResendVerification();
  }

  redirectTo() {
    return this.verificationContext().redirectTo || null;
  }

  emailQueryParams() {
    const email = this.loginForm.controls.email.value.trim();
    const redirectTo = this.redirectTo();

    if (!email && !redirectTo) {
      return undefined;
    }

    return {
      email: email || undefined,
      redirectTo: redirectTo || undefined,
    };
  }

  fieldError(fieldName: 'email' | 'password') {
    const control = this.loginForm.controls[fieldName];
    if (control.errors?.['required']) {
      return fieldName === 'email'
        ? 'L’adresse email est obligatoire.'
        : 'Le mot de passe est obligatoire.';
    }

    if (control.errors?.['email']) {
      return 'Saisissez une adresse email valide.';
    }

    if (control.errors?.['minlength']) {
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    }

    return 'Ce champ contient une erreur.';
  }
}
