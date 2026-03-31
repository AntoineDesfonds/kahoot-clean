import { inject, Injectable } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  user,
  reload,
  updateProfile,
} from '@angular/fire/auth';
import { ToastController } from '@ionic/angular/standalone';
import {
  FirebaseAuthentication,
  SignInResult,
} from '@capacitor-firebase/authentication';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Observable, filter, firstValueFrom, take } from 'rxjs';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly toastController = inject(ToastController);

  getConnectedUser(): Observable<User | null> {
    return user(this.auth);
  }

  canAccessProtectedArea(user: User | null): boolean {
    if (!user) {
      return false;
    }

    if (user.emailVerified) {
      return true;
    }

    return user.providerData.some(
      (provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID,
    );
  }

  async register(
    email: string,
    password: string,
    alias: string,
    redirectTo?: string | null,
  ): Promise<boolean> {
    try {
      const normalizedEmail = email.trim();
      const normalizedAlias = alias.trim();
      const normalizedRedirectTo = this.normalizeRedirectTo(redirectTo);
      const userCred = await createUserWithEmailAndPassword(
        this.auth,
        normalizedEmail,
        password,
      );
      await updateProfile(userCred.user, { displayName: normalizedAlias });
      await this.userService.create({ alias: normalizedAlias, ...userCred.user });
      await sendEmailVerification(userCred.user);
      await signOut(this.auth);
      await this.router.navigate(['/login'], {
        replaceUrl: true,
        queryParams: {
          verification: 'sent',
          email: normalizedEmail,
          redirectTo: normalizedRedirectTo,
        },
      });
      await this.presentToast(
        'Compte créé. Vérifiez votre boîte mail avant de commencer.',
      );
      return true;
    } catch (error) {
      console.error(error);
      await this.presentToast(this.mapAuthError(error));
      return false;
    }
  }

  async login(
    email: string,
    password: string,
    redirectTo?: string | null,
  ): Promise<boolean> {
    try {
      const userCred = await signInWithEmailAndPassword(
        this.auth,
        email.trim(),
        password,
      );
      return this.finalizeLogin(
        userCred.user,
        'Connexion réussie.',
        'Vérifiez votre adresse email avant de vous connecter.',
        redirectTo,
      );
    } catch (error) {
      console.error(error);
      await this.presentToast(this.mapAuthError(error));
      return false;
    }
  }

  async signInWithGoogle(redirectTo?: string | null): Promise<boolean> {
    try {
      const authenticatedUser = this.isNativePlatform()
        ? await this.signInWithGoogleOnNative()
        : await this.signInWithGoogleOnWeb();

      return this.finalizeLogin(
        authenticatedUser,
        'Connexion Google réussie.',
        'Impossible de valider ce compte Google.',
        redirectTo,
      );
    } catch (error) {
      console.error(error);
      await this.presentToast(this.mapAuthError(error));
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.isNativePlatform()) {
      await FirebaseAuthentication.signOut();
    }

    await signOut(this.auth);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  async sendResetPasswordLink(
    email: string,
    redirectTo?: string | null,
  ): Promise<boolean> {
    try {
      const normalizedEmail = email.trim();
      const normalizedRedirectTo = this.normalizeRedirectTo(redirectTo);
      await sendPasswordResetEmail(this.auth, normalizedEmail);
      await this.router.navigate(['/login'], {
        replaceUrl: true,
        queryParams: {
          recovery: 'sent',
          email: normalizedEmail,
          redirectTo: normalizedRedirectTo,
        },
      });
      await this.presentToast(
        'Lien de réinitialisation envoyé. Vérifiez votre boîte mail.',
      );
      return true;
    } catch (error) {
      console.error(error);
      await this.presentToast(this.mapAuthError(error));
      return false;
    }
  }

  async resendEmailVerification(
    email: string,
    password: string,
  ): Promise<'resent' | 'already-verified' | 'failed'> {
    try {
      const normalizedEmail = email.trim();
      const userCred = await signInWithEmailAndPassword(
        this.auth,
        normalizedEmail,
        password,
      );
      await reload(userCred.user);

      if (this.canAccessProtectedArea(userCred.user)) {
        await signOut(this.auth);
        await this.presentToast(
          'Votre compte est déjà validé. Connectez-vous normalement.',
        );
        return 'already-verified';
      }

      await sendEmailVerification(userCred.user);
      await signOut(this.auth);
      await this.presentToast(
        'Un nouveau lien de vérification a été envoyé.',
      );
      return 'resent';
    } catch (error) {
      console.error(error);
      await this.presentToast(this.mapAuthError(error));
      return 'failed';
    }
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2200,
      position: 'top',
    });

    await toast.present();
  }

  private async finalizeLogin(
    authenticatedUser: User,
    successMessage: string,
    unauthorizedMessage: string,
    redirectTo?: string | null,
  ): Promise<boolean> {
    await reload(authenticatedUser);
    const normalizedRedirectTo = this.normalizeRedirectTo(redirectTo);

    if (!this.canAccessProtectedArea(authenticatedUser)) {
      await signOut(this.auth);
      await this.router.navigate(['/login'], {
        replaceUrl: true,
        queryParams: {
          verification: 'required',
          email: authenticatedUser.email?.trim() || undefined,
          redirectTo: normalizedRedirectTo,
        },
      });
      await this.presentToast(unauthorizedMessage);
      return false;
    }

    await this.userService.ensureUserDocument(authenticatedUser);
    const preferredAlias = await this.userService.getPreferredAlias(
      authenticatedUser,
    );
    if (authenticatedUser.displayName?.trim() !== preferredAlias) {
      await updateProfile(authenticatedUser, { displayName: preferredAlias });
    }

    await this.router.navigateByUrl(
      normalizedRedirectTo ?? '/quizzes',
      { replaceUrl: true },
    );
    await this.presentToast(successMessage);
    return true;
  }

  private async signInWithGoogleOnWeb(): Promise<User> {
    await FirebaseAuthentication.signInWithGoogle({ mode: 'popup' });
    return this.resolveCurrentUser();
  }

  private async signInWithGoogleOnNative(): Promise<User> {
    const signInResult = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
    });
    const googleCredential = this.buildGoogleCredential(signInResult);
    const userCredential = await signInWithCredential(this.auth, googleCredential);
    return userCredential.user;
  }

  private buildGoogleCredential(signInResult: SignInResult) {
    const idToken = signInResult.credential?.idToken ?? null;
    const accessToken = signInResult.credential?.accessToken ?? null;

    if (!idToken && !accessToken) {
      throw new Error('auth/google-credential-missing');
    }

    return GoogleAuthProvider.credential(idToken, accessToken);
  }

  private async resolveCurrentUser(): Promise<User> {
    if (this.auth.currentUser) {
      return this.auth.currentUser;
    }

    return firstValueFrom(
      this.getConnectedUser().pipe(
        filter((connectedUser): connectedUser is User => connectedUser !== null),
        take(1),
      ),
    );
  }

  private isNativePlatform(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  private normalizeRedirectTo(redirectTo?: string | null): string | undefined {
    const normalizedValue = redirectTo?.trim();

    if (
      !normalizedValue
      || !normalizedValue.startsWith('/')
      || normalizedValue.startsWith('//')
    ) {
      return undefined;
    }

    return normalizedValue;
  }

  private mapAuthError(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      switch (error.code) {
        case 'auth/email-already-in-use':
          return 'Cette adresse email est déjà utilisée.';
        case 'auth/invalid-email':
          return 'Cette adresse email n’est pas valide.';
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'Identifiants incorrects.';
        case 'auth/account-exists-with-different-credential':
          return 'Ce compte existe déjà avec une autre méthode de connexion.';
        case 'auth/google-credential-missing':
          return 'Google n’a pas renvoyé les jetons de connexion attendus.';
        case 'auth/popup-blocked':
          return 'La fenêtre Google a été bloquée par le navigateur.';
        case 'auth/popup-closed-by-user':
          return 'La fenêtre Google a été fermée avant la fin.';
        case 'auth/weak-password':
          return 'Le mot de passe doit contenir au moins 6 caractères.';
        case 'auth/too-many-requests':
          return 'Trop de tentatives. Réessayez dans quelques minutes.';
        default:
          return 'Une erreur Firebase est survenue.';
      }
    }

    if (error instanceof Error) {
      const normalizedMessage = error.message.toLowerCase();

      if (
        normalizedMessage.includes('missing initial state') ||
        normalizedMessage.includes('sessionstorage is inaccessible') ||
        normalizedMessage.includes('storage-partitioned')
      ) {
        return 'Le navigateur a bloqué le stockage nécessaire à la connexion. Rechargez la page puis réessayez, ou utilisez la connexion par email.';
      }

      if (
        normalizedMessage.includes('cancel') ||
        normalizedMessage.includes('abort')
      ) {
        return 'La connexion Google a été annulée.';
      }
    }

    return 'Une erreur inattendue est survenue.';
  }
}
