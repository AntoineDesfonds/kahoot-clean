Un fichier apk prêt à être installé se trouve dans le dossier documentation, comme ce README.

Pour créer le fichier apk ( à exécuter à la racine du projet ):
ionic build
npx cap sync
cd android
./gradlew clean # pour nettoyer l'ancienne version
./gradlew assembleDebug

Le fichier apk se trouvera dans "\ionic-kahoot\android\app\build\outputs\apk\debug\app-debug.apk"