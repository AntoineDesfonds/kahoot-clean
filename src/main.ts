import { provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
  withComponentInputBinding,
} from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonicRouteStrategy,
  LoadingController,
  PickerController,
  provideIonicAngular,
  ToastController,
} from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { environment } from './environments/environment';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { getFunctions, provideFunctions } from '@angular/fire/functions';

const firebaseConfig = resolveFirebaseConfig();

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    ActionSheetController,
    AlertController,
    LoadingController,
    PickerController,
    ToastController,
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding(),
    ),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideFunctions(() => getFunctions()),
  ],
});

function resolveFirebaseConfig() {
  if (typeof window === 'undefined') {
    return environment.firebaseConfig;
  }

  const { host, hostname, protocol } = window.location;
  const usesFirebaseHostingDomain =
    hostname.endsWith('.firebaseapp.com') || hostname.endsWith('.web.app');

  if (!host || !usesFirebaseHostingDomain || !/^https?:$/.test(protocol)) {
    return environment.firebaseConfig;
  }

  return {
    ...environment.firebaseConfig,
    // Keep the auth helper on the same Firebase Hosting domain as the app.
    authDomain: host,
  };
}
