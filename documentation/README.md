Le fichier apk se trouve dans "\ionic-kahoot\android\app\build\outputs\apk\debug\app-debug.apk"

Pour créer le fichier apk ( à exécuter à la racine du projet ):
ionic build
npx cap sync
cd android
./gradlew clean # pour nettoyer l'ancienne version
./gradlew assembleDebug