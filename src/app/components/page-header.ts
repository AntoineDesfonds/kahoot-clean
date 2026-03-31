import { Component, inject, input } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, logOutOutline } from 'ionicons/icons';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../services/auth.service';
import { NavigationStateService } from '../services/navigation-state.service';
import { UserService } from '../services/user.service';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, of, startWith, switchMap } from 'rxjs';
import { ConfirmService } from '../services/confirm.service';

@Component({
  selector: 'page-header',
  template: `
    <ion-header [translucent]="translucent()" [collapse]="collapse()">
      <ion-toolbar class="app-toolbar">
        @if (showBackButton()) {
          <ion-buttons slot="start">
            @if (usesManagedBackNavigation()) {
              <ion-button fill="clear" (click)="goBack()">
                <ion-icon slot="icon-only" name="chevron-back-outline"></ion-icon>
              </ion-button>
            } @else {
              <ion-back-button
                [defaultHref]="backHref()"
                icon="chevron-back-outline"
                text=""
              ></ion-back-button>
            }
          </ion-buttons>
        }

        <ion-title>
          <div class="app-toolbar__title">
            <ng-content></ng-content>
          </div>
        </ion-title>

        @if (connectedUser()) {
          <ion-buttons slot="end">
            <span class="app-toolbar__meta">{{ displayIdentity() }}</span>
            <ion-button shape="round" (click)="logout()">
              <ion-icon slot="icon-only" name="log-out-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>
  `,
  styles: [
    `
      .app-toolbar {
        --background: rgba(255, 255, 255, 0.72);
        --border-color: transparent;
        --color: var(--app-text-strong);
        backdrop-filter: blur(24px);
      }

      .app-toolbar__title {
        color: var(--app-text-strong);
        font-size: 1rem;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .app-toolbar__meta {
        display: none;
        margin-right: 0.5rem;
        padding: 0.45rem 0.8rem;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.06);
        color: var(--app-text-strong);
        font-size: 0.82rem;
        font-weight: 600;
      }

      .app-toolbar ion-button {
        --background: rgba(15, 23, 42, 0.05);
        --color: var(--app-text-strong);
        --padding-start: 0.7rem;
        --padding-end: 0.7rem;
        border: 1px solid rgba(15, 23, 42, 0.08);
      }

      .app-toolbar ion-back-button {
        --color: var(--app-text-strong);
        --icon-font-size: 1.1rem;
        --padding-start: 0.35rem;
        --padding-end: 0.35rem;
        margin-left: 0.2rem;
      }

      @media (min-width: 768px) {
        .app-toolbar__meta {
          display: inline-flex;
          align-items: center;
        }
      }
    `,
  ],
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
  ],
})
export class PageHeader {
  readonly translucent = input<boolean>();
  readonly collapse = input<'condense' | 'fade' | undefined>(undefined);

  private readonly authService = inject(AuthService);
  private readonly navigationState = inject(NavigationStateService);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly confirmService = inject(ConfirmService);

  readonly connectedUser = toSignal(this.authService.getConnectedUser());
  readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0] ?? ''),
      startWith(this.router.url.split('?')[0] ?? ''),
    ),
    { initialValue: this.router.url.split('?')[0] ?? '' },
  );
  readonly displayIdentity = toSignal(
    this.authService.getConnectedUser().pipe(
      switchMap((user) =>
        user
          ? this.userService.watchPreferredAlias(user)
          : of(''),
      ),
    ),
    { initialValue: '' },
  );

  constructor() {
    addIcons({ chevronBackOutline, logOutOutline });
  }

  async logout() {
    const shouldLogout = await this.confirmService.confirm({
      header: 'Se deconnecter ?',
      message: 'Vous devrez vous reconnecter pour revenir dans l application.',
      confirmText: 'Se deconnecter',
      confirmRole: 'destructive',
    });

    if (!shouldLogout) {
      return;
    }

    await this.authService.logout();
  }

  async goBack() {
    await this.router.navigateByUrl(this.backHref(), { replaceUrl: true });
  }

  showBackButton(): boolean {
    const path = this.currentPath();
    return !['', '/', '/login', '/quizzes', '/my-quizzes'].includes(path);
  }

  usesManagedBackNavigation(): boolean {
    return this.currentPath().startsWith('/game/');
  }

  backHref(): string {
    const path = this.currentPath();

    if (path === '/register' || path === '/password-retrieve') {
      return '/login';
    }

    if (path.startsWith('/quiz/')) {
      return this.navigationState.preferredCatalogPath() ?? '/quizzes';
    }

    if (path.startsWith('/game/')) {
      return this.navigationState.preferredBackPathFor(path) ?? '/join-game';
    }

    if (path === '/join-game') {
      return '/quizzes';
    }

    return this.navigationState.preferredCatalogPath() ?? '/quizzes';
  }
}
