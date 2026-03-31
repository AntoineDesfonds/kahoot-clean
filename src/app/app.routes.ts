import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes, UrlSegment } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from './services/auth.service';

const requiresAuth: CanMatchFn = (_route, segments) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const redirectTo = resolveRedirectTarget(router, segments);

  return authService.getConnectedUser().pipe(
    take(1),
    map((user) =>
      authService.canAccessProtectedArea(user)
        ? true
        : router.createUrlTree(['/login'], {
            queryParams: redirectTo ? { redirectTo } : undefined,
          }),
    ),
  );
};

const anonymousOnly: CanMatchFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.getConnectedUser().pipe(
    take(1),
    map((user) =>
      authService.canAccessProtectedArea(user)
        ? router.createUrlTree(['/quizzes'])
        : true,
    ),
  );
};

function resolveRedirectTarget(
  router: Router,
  segments: UrlSegment[],
): string | undefined {
  const navigation = router.getCurrentNavigation();
  const locationUrl = [
    globalThis.location?.pathname ?? '',
    globalThis.location?.search ?? '',
  ].join('');
  const segmentUrl = `/${segments.map((segment) => segment.path).join('/')}`;
  const fallbackUrl = locationUrl || segmentUrl;
  const requestedUrl =
    navigation?.extractedUrl?.toString()
    ?? navigation?.initialUrl?.toString()
    ?? fallbackUrl;

  if (!requestedUrl) {
    return undefined;
  }

  if (requestedUrl.startsWith('/login')) {
    return undefined;
  }

  return requestedUrl.startsWith('/') ? requestedUrl : `/${requestedUrl}`;
}

export const routes: Routes = [
  {
    path: 'login',
    canMatch: [anonymousOnly],
    loadComponent: () =>
      import('./auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canMatch: [anonymousOnly],
    loadComponent: () =>
      import('./auth/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'password-retrieve',
    canMatch: [anonymousOnly],
    loadComponent: () =>
      import('./auth/password-retrieve/password-retrieve.page').then(
        (m) => m.PasswordRetrievePage,
      ),
  },
  {
    path: '',
    canMatch: [requiresAuth],
    loadComponent: () => import('./main.component').then((m) => m.Main),
    children: [
      {
        path: 'quizzes',
        data: {
          view: 'catalog',
        },
        loadComponent: () =>
          import('./quiz/quiz-list.page').then((m) => m.QuizListPage),
      },
      {
        path: 'my-quizzes',
        data: {
          view: 'mine',
        },
        loadComponent: () =>
          import('./quiz/quiz-list.page').then((m) => m.QuizListPage),
      },
      {
        path: 'quiz/:quizId/practice',
        loadComponent: () =>
          import('./quiz/quiz-practice.page').then((m) => m.QuizPracticePage),
      },
      {
        path: 'quiz/:quizId',
        loadComponent: () =>
          import('./quiz/quiz.page').then((m) => m.QuizPage),
      },
      {
        path: 'join-game',
        loadComponent: () =>
          import('./game/join-game.page').then((m) => m.JoinGamePage),
      },
      {
        path: 'game/:gameId',
        data: {
          sessionView: 'lobby',
        },
        loadComponent: () =>
          import('./game/game-session.page').then((m) => m.GameSessionPage),
      },
      {
        path: 'game/:gameId/question/:questionIndex',
        data: {
          sessionView: 'question',
        },
        loadComponent: () =>
          import('./game/game-session.page').then((m) => m.GameSessionPage),
      },
      {
        path: 'game/:gameId/results',
        data: {
          sessionView: 'results',
        },
        loadComponent: () =>
          import('./game/game-session.page').then((m) => m.GameSessionPage),
      },
      {
        path: '',
        redirectTo: 'quizzes',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
