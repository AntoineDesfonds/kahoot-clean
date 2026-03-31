import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class NavigationStateService {
  private readonly router = inject(Router);
  private readonly rememberedNonGamePath = signal<string | null>(
    this.initialRememberedPath(),
  );
  private readonly rememberedCatalogPath = signal<string | null>(
    this.initialCatalogPath(),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        map((event) => this.normalizePath(event.urlAfterRedirects)),
        startWith(this.normalizePath(this.router.url)),
      )
      .subscribe((path) => {
        if (this.shouldRemember(path)) {
          this.rememberedNonGamePath.set(path);
        }

        if (this.isCatalogPath(path)) {
          this.rememberedCatalogPath.set(path);
        }
      });
  }

  preferredBackPathFor(path: string): string | null {
    if (!this.isGamePath(path)) {
      return null;
    }

    const rememberedPath = this.rememberedNonGamePath();
    if (!rememberedPath || rememberedPath === path) {
      return null;
    }

    return rememberedPath;
  }

  preferredCatalogPath(): string | null {
    return this.rememberedCatalogPath();
  }

  private initialRememberedPath(): string | null {
    const initialPath = this.normalizePath(this.router.url);
    return this.shouldRemember(initialPath) ? initialPath : null;
  }

  private initialCatalogPath(): string | null {
    const initialPath = this.normalizePath(this.router.url);
    return this.isCatalogPath(initialPath) ? initialPath : null;
  }

  private shouldRemember(path: string): boolean {
    return !!path && !this.isGamePath(path);
  }

  private isGamePath(path: string): boolean {
    return path.startsWith('/game/');
  }

  private isCatalogPath(path: string): boolean {
    return path === '/quizzes' || path === '/my-quizzes';
  }

  private normalizePath(url: string): string {
    return url.split('?')[0] ?? '';
  }
}
