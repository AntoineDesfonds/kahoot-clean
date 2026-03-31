import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
} from '@ionic/angular/standalone';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { logoGoogle } from 'ionicons/icons';
import { map } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { PageHeader } from '../../components/page-header';

@Component({
  selector: 'app-register',
  template: `
    <page-header [translucent]="true">Inscription</page-header>

    <ion-content class="auth-screen" [fullscreen]="true">
      <div class="auth-shell auth-shell--compact">
        <section class="auth-hero">
          <p class="auth-hero__eyebrow">Compte enseignant</p>
          <h1>Préparez votre espace de quiz.</h1>
          <p>
            Créez un compte, vérifiez votre email et commencez à publier des
            quiz avec code d’accès et classement en direct.
          </p>
        </section>

        <form class="auth-card" [formGroup]="registerForm" (ngSubmit)="onSubmit()">
          <div class="auth-card__header">
            <p class="auth-card__eyebrow">Inscription</p>
            <h2>Créer un compte</h2>
            <p>Utilisez un alias court : il sera visible dans les parties.</p>
          </div>

          <p class="form-banner form-banner--warning">
            Vous devrez vérifier votre email avant votre première connexion.
          </p>

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
              <span>ou créer avec votre email</span>
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
                formControlName="alias"
                fill="solid"
                label="Alias"
                labelPlacement="stacked"
                placeholder="Mme Martin"
                type="text"
                autocomplete="nickname"
              ></ion-input>
            </ion-item>
            @if (shouldShowFieldError('alias')) {
              <p class="field-error">{{ fieldError('alias') }}</p>
            }
            <ion-item>
              <ion-input
                formControlName="password"
                fill="solid"
                label="Mot de passe"
                labelPlacement="stacked"
                placeholder="Au moins 6 caractères"
                type="password"
                autocomplete="new-password"
              ></ion-input>
            </ion-item>
            @if (shouldShowFieldError('password')) {
              <p class="field-error">{{ fieldError('password') }}</p>
            }
            <ion-item>
              <ion-input
                formControlName="passwordConfirm"
                fill="solid"
                label="Confirmation du mot de passe"
                labelPlacement="stacked"
                placeholder="Retapez le mot de passe"
                type="password"
                autocomplete="new-password"
              ></ion-input>
            </ion-item>
            @if (shouldShowFieldError('passwordConfirm')) {
              <p class="field-error">{{ fieldError('passwordConfirm') }}</p>
            }
          </ion-list>

          <ion-button
            expand="block"
            type="submit"
            [disabled]="registerForm.invalid || busy()"
          >
            @if (submitting()) {
              <ion-spinner slot="start" name="crescent"></ion-spinner>
            }
            {{ submitting() ? 'Création du compte...' : 'Créer le compte' }}
          </ion-button>

          <div class="auth-card__links auth-card__links--single">
            <a [routerLink]="['/login']" [queryParams]="loginQueryParams()">
              J’ai déjà un compte
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
    IonIcon,
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
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly submitting = signal(false);
  readonly googleSubmitting = signal(false);
  readonly busy = computed(
    () => this.submitting() || this.googleSubmitting(),
  );
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

  readonly registerForm = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      alias: ['', [Validators.required, Validators.minLength(2)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      passwordConfirm: ['', [Validators.required]],
    },
    {
      validators: [passwordConfirmMatchPasswordValidator()],
    },
  );

  constructor() {
    addIcons({ logoGoogle });

    effect(() => {
      const email = this.prefilledEmail();
      const emailControl = this.registerForm.controls.email;
      if (email && !emailControl.dirty && emailControl.value !== email) {
        emailControl.setValue(email);
      }
    });
  }

  async onSubmit() {
    if (this.registerForm.invalid || this.busy()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    const { email, password, alias } = this.registerForm.getRawValue();
    this.submitting.set(true);

    try {
      await this.authService.register(email, password, alias, this.redirectTo());
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

  shouldShowFieldError(
    fieldName: 'email' | 'alias' | 'password' | 'passwordConfirm',
  ) {
    const control = this.registerForm.controls[fieldName];
    return (
      (control.invalid && (control.touched || control.dirty)) ||
      (fieldName === 'passwordConfirm' &&
        this.registerForm.hasError('passwordConfirmMismatch') &&
        (control.touched || control.dirty))
    );
  }

  fieldError(fieldName: 'email' | 'alias' | 'password' | 'passwordConfirm') {
    const control = this.registerForm.controls[fieldName];
    if (control.errors?.['required']) {
      switch (fieldName) {
        case 'email':
          return 'L’adresse email est obligatoire.';
        case 'alias':
          return 'Choisissez un alias visible par les autres joueurs.';
        case 'password':
          return 'Le mot de passe est obligatoire.';
        default:
          return 'Confirmez votre mot de passe.';
      }
    }

    if (control.errors?.['email']) {
      return 'Saisissez une adresse email valide.';
    }

    if (control.errors?.['minlength']) {
      return fieldName === 'alias'
        ? 'L’alias doit contenir au moins 2 caractères.'
        : 'Le mot de passe doit contenir au moins 6 caractères.';
    }

    if (
      fieldName === 'passwordConfirm' &&
      this.registerForm.hasError('passwordConfirmMismatch') &&
      (control.touched || control.dirty)
    ) {
      return 'Les deux mots de passe ne correspondent pas.';
    }

    return 'Ce champ contient une erreur.';
  }

  loginQueryParams() {
    const email = this.registerForm.controls.email.value.trim();
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

export function passwordConfirmMatchPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('password')?.value;
    const passwordConfirm = control.get('passwordConfirm')?.value;

    return password === passwordConfirm
      ? null
      : { passwordConfirmMismatch: true };
  };
}
