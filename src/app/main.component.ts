import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  gameControllerOutline,
  homeOutline,
  libraryOutline,
} from 'ionicons/icons';
import { filter, map, startWith } from 'rxjs';
import { NavigationStateService } from './services/navigation-state.service';

@Component({
  selector: 'app-main',
  template: `
    <ion-router-outlet></ion-router-outlet>

    <nav class="app-bottom-nav" aria-label="Navigation principale">
      <a
        class="app-bottom-nav__item"
        [class.app-bottom-nav__item--active]="selectedSection() === 'home'"
        [routerLink]="['/quizzes']"
      >
        <ion-icon name="home-outline"></ion-icon>
        <span>Menu principal</span>
      </a>

      <a
        class="app-bottom-nav__item"
        [class.app-bottom-nav__item--active]="selectedSection() === 'mine'"
        [routerLink]="['/my-quizzes']"
      >
        <ion-icon name="library-outline"></ion-icon>
        <span>Mes Quiz</span>
      </a>

      <a
        class="app-bottom-nav__item"
        [class.app-bottom-nav__item--active]="selectedSection() === 'games'"
        [routerLink]="['/join-game']"
      >
        <ion-icon name="game-controller-outline"></ion-icon>
        <span>Parties</span>
      </a>
    </nav>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      ion-router-outlet {
        display: block;
      }

      .app-bottom-nav {
        position: fixed;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 30;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.55rem;
        padding: 0.65rem
          calc(0.8rem + env(safe-area-inset-right))
          calc(0.8rem + env(safe-area-inset-bottom))
          calc(0.8rem + env(safe-area-inset-left));
        border-top: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(20px);
        box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.08);
      }

      .app-bottom-nav__item {
        display: grid;
        justify-items: center;
        gap: 0.3rem;
        min-height: 62px;
        padding: 0.7rem 0.5rem;
        border-radius: 20px;
        color: var(--app-text-soft);
        text-decoration: none;
        font-size: 0.8rem;
        font-weight: 800;
        text-align: center;
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms ease;
      }

      .app-bottom-nav__item span {
        line-height: 1.15;
      }

      .app-bottom-nav__item ion-icon {
        font-size: 1.25rem;
      }

      .app-bottom-nav__item--active {
        background: rgba(15, 118, 110, 0.1);
        color: var(--ion-color-primary);
        box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.12);
      }

      @media (hover: hover) {
        .app-bottom-nav__item:hover {
          background: rgba(15, 118, 110, 0.08);
          color: var(--ion-color-primary);
          transform: translateY(-1px);
        }
      }

      @media (min-width: 992px) {
        .app-bottom-nav {
          left: 50%;
          right: auto;
          width: min(720px, calc(100% - 2rem));
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 28px;
          transform: translateX(-50%);
        }
      }
    `,
  ],
  imports: [IonIcon, IonRouterOutlet, RouterLink],
})
export class Main {
  private readonly router = inject(Router);
  private readonly navigationState = inject(NavigationStateService);

  readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0] ?? ''),
      startWith(this.router.url.split('?')[0] ?? ''),
    ),
    { initialValue: this.router.url.split('?')[0] ?? '' },
  );
  readonly selectedSection = computed(() => {
    const path = this.currentPath();

    if (path === '/my-quizzes') {
      return 'mine';
    }

    if (path === '/join-game' || path.startsWith('/game/')) {
      return 'games';
    }

    if (path.startsWith('/quiz/')) {
      return this.navigationState.preferredCatalogPath() === '/my-quizzes'
        ? 'mine'
        : 'home';
    }

    return 'home';
  });

  constructor() {
    addIcons({ gameControllerOutline, homeOutline, libraryOutline });
  }
}
