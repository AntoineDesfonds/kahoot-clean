import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  collection,
  collectionData,
  doc,
  docData,
  Firestore,
  getDoc,
} from '@angular/fire/firestore';
import { User } from '@angular/fire/auth';
import { setDoc } from 'firebase/firestore';

export interface UserWithAlias extends User {
  alias: string;
}

export interface UserProfile {
  alias: string;
}

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private firestore = inject(Firestore);

  usersCollection = collection(this.firestore, 'users');

  create(user: UserWithAlias) {
    return setDoc(
      doc(this.firestore, `users/${user.uid}`),
      {
        alias: user.alias.trim(),
      },
      { merge: true },
    );
  }

  ensureUserDocument(user: User, alias?: string) {
    return this.ensureUserDocumentInternal(user, alias);
  }

  getAll() {
    return collectionData(this.usersCollection, {
      idField: 'id',
    }) as Observable<UserWithAlias[]>;
  }

  getProfile(userId: string): Observable<UserProfile | null> {
    return (
      docData(doc(this.firestore, `users/${userId}`)) as Observable<
        UserProfile | undefined
      >
    ).pipe(map((profile) => profile ?? null));
  }

  watchPreferredAlias(user: User): Observable<string> {
    return this.getProfile(user.uid).pipe(
      map((profile) => {
        const alias = profile?.alias?.trim();
        if (alias) {
          return alias;
        }

        return user.displayName?.trim() || user.email?.split('@')[0] || user.uid;
      }),
    );
  }

  async getPreferredAlias(user: User): Promise<string> {
    const userSnapshot = await getDoc(doc(this.firestore, `users/${user.uid}`));
    const alias = userSnapshot.data()?.['alias'];

    if (typeof alias === 'string' && alias.trim().length > 0) {
      return alias.trim();
    }

    return user.displayName?.trim() || user.email?.split('@')[0] || user.uid;
  }

  private async ensureUserDocumentInternal(user: User, alias?: string) {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const existingUserSnapshot = await getDoc(userRef);
    const existingAlias = existingUserSnapshot.data()?.['alias'];

    if (typeof existingAlias === 'string' && existingAlias.trim().length > 0) {
      return;
    }

    const fallbackAlias =
      alias ?? user.displayName ?? user.email?.split('@')[0] ?? user.uid;

    return setDoc(
      userRef,
      {
        alias: fallbackAlias.trim(),
      },
      { merge: true },
    );
  }
}
