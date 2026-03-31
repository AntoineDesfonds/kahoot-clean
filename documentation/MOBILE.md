Mobile build and Google auth setup

Current native identifiers used by this project:
- Android package: `io.ionic.starter`
- iOS bundle id: `io.ionic.starter`

The Firebase project now has matching Android and iOS app registrations for those identifiers, and this repository now includes:
- `android/app/google-services.json`
- `ios/App/App/GoogleService-Info.plist`

If you change one of these identifiers, regenerate those Firebase config files before building.

Google auth is enabled in Firebase Auth for this project.

Android

1. The local debug SHA-1 currently registered in Firebase is:

```text
84:8F:BF:AB:93:E8:CA:86:00:0A:8A:0B:4F:74:01:F8:5E:8E:B3:30
```

2. If you rotate or recreate `~/.android/debug.keystore`, regenerate the SHA-1:

```bash
cd android
./gradlew signingReport
```

3. Then update the Android Firebase app SHA if needed:

```bash
firebase apps:android:sha:create 1:565593715313:android:e597a794299163f07d61d0 <SHA1>
```

iOS

1. The current Google URL scheme configured in `Info.plist` is:

```text
com.googleusercontent.apps.565593715313-skh12ljdnf7kqot1h6cql6v8gjdt7g7f
```

2. If the Google OAuth client changes, update both:
- `ios/App/App/GoogleService-Info.plist`
- `ios/App/App/Info.plist`

3. Run:

```bash
npx cap sync ios
```

Web

1. Enable Google in Firebase Authentication.
2. In `Authentication > Settings > Authorized domains`, ensure your dev domain is allowed.
3. For local development, `localhost` is usually sufficient.

Useful commands

```bash
npm run build
npx cap sync
ionic build
```
