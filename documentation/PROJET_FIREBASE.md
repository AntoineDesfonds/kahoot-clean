# Guide Du Projet Et De Firebase

## Objectif de ce document

Ce document explique le fonctionnement global du projet, puis détaille les parties les plus importantes pour une personne qui :

- ne connait pas encore ce projet ;
- ne connait pas Firebase ;
- doit comprendre comment l'application authentifie les utilisateurs, stocke les donnees, synchronise les parties, applique les regles de securite et se deploie en ligne.

L'objectif n'est pas d'expliquer chaque fichier ligne par ligne, mais de donner une vision claire, pedagogique et suffisante pour maintenir ou faire evoluer le projet.

## 1. Vue d'ensemble du projet

Le projet est une application de type Kahoot developpee avec Angular + Ionic, utilisable sur le web et sur mobile via Capacitor.

L'application permet principalement :

- de creer un compte et se connecter ;
- de se connecter aussi avec Google ;
- de consulter des quiz ;
- de creer, modifier et supprimer ses propres quiz ;
- de jouer en mode entrainement ;
- de lancer une partie multijoueur avec un code ;
- de rejoindre une partie avec ce code ;
- de synchroniser les joueurs, les questions, les reponses et les scores en temps reel.

En pratique, le projet repose sur deux grands blocs :

1. Le front-end Angular/Ionic.
   Il gere les ecrans, les formulaires, la navigation, l'affichage et une partie des appels metier.

2. Firebase.
   Il gere l'authentification, la base de donnees, l'hebergement web, les fonctions serveur et les regles de securite.

## 2. Architecture globale tres simple

On peut lire le projet comme ceci :

```text
Utilisateur
   |
   v
Application Angular / Ionic
   |
   +--> Firebase Authentication
   |      Gere l'identite de l'utilisateur
   |
   +--> Cloud Firestore
   |      Stocke quiz, questions, parties, joueurs, reponses
   |
   +--> Cloud Functions
   |      Gere la logique serveur sensible des parties
   |
   +--> Firebase Hosting
          Publie la version web en ligne
```

## 3. Fonctionnement global de l'application

### 3.1 Navigation principale

Une fois connecte, l'utilisateur navigue principalement dans trois zones :

- `Menu principal` : catalogue des quiz ;
- `Mes Quiz` : quiz appartenant a l'utilisateur connecte ;
- `Parties` : rejoindre ou lancer des parties multijoueurs.

Les routes importantes sont :

- `/login`
- `/register`
- `/password-retrieve`
- `/quizzes`
- `/my-quizzes`
- `/quiz/:quizId`
- `/quiz/:quizId/practice`
- `/join-game`
- `/game/:gameId`
- `/game/:gameId/question/:questionIndex`
- `/game/:gameId/results`

### 3.2 Deux modes de jeu

Le projet distingue bien deux usages :

1. Le mode entrainement.
   Un seul utilisateur joue seul sur un quiz existant. C'est plus simple car il n'y a pas de synchronisation multijoueur.

2. Le mode partie multijoueur.
   Une session de jeu est creee a partir d'un quiz. Cette session a un code d'entree, une salle d'attente, un hote, des joueurs, des questions synchronisees et un classement final.

### 3.3 Idee cle

Le quiz est un contenu "source".

La partie multijoueur est une "instance de jeu" creee a partir de ce quiz.

Autrement dit :

- `quizzes` contient les quiz permanents ;
- `games` contient les parties temporaires ou en cours ;
- une partie copie les informations utiles du quiz au moment du lancement pour garantir une experience stable et synchronisee.

## 4. Les grandes briques Firebase

Pour quelqu'un qui decouvre Firebase, il faut voir Firebase non pas comme "une seule base de donnees", mais comme une plateforme composee de plusieurs services.

Dans ce projet, les services utilises sont :

### 4.1 Firebase Authentication

Il gere l'identite des utilisateurs :

- creation de compte email/mot de passe ;
- connexion ;
- verification d'email ;
- reinitialisation du mot de passe ;
- connexion Google.

Authentication dit "qui est la personne ?".

### 4.2 Cloud Firestore

C'est la base de donnees principale.

Elle stocke :

- les profils utilisateur ;
- les quiz ;
- les questions des quiz ;
- les parties ;
- les joueurs d'une partie ;
- les reponses donnees pendant une partie ;
- le code public d'entree d'une partie.

Firestore dit "quelles sont les donnees ?".

### 4.3 Firestore Security Rules

Ce sont les regles de securite de la base.

Elles disent :

- qui a le droit de lire ;
- qui a le droit d'ecrire ;
- quelles formes de documents sont autorisees ;
- quelles transitions d'etat sont autorisees.

Les regles sont extremement importantes. Elles sont le "pare-feu logique" de la base.

### 4.4 Cloud Functions

Ce sont des fonctions serveur executees cote Firebase.

Elles servent ici a proteger la logique sensible des parties :

- creation d'une partie ;
- generation d'un code d'entree ;
- jointure d'un joueur ;
- lancement de la partie ;
- recuperation de la question courante ;
- enregistrement d'une reponse ;
- progression de la partie ;
- fermeture de la partie quand tous les joueurs ont termine.

Les Functions servent quand la logique doit etre fiable, centralisee et resistante a la triche.

### 4.5 Firebase Hosting

Hosting heberge la version web compilee de l'application.

Le site en ligne vise par le projet est :

`https://kahoot-fcbbc.web.app/`

### 4.6 Firebase Emulator Suite

Les emulators permettent de lancer localement :

- Authentication ;
- Firestore ;
- Functions ;
- Hosting.

C'est utile pour tester le projet sans toucher au projet Firebase reel.

## 5. Modele de donnees du projet

Pour comprendre Firebase sur ce projet, il faut d'abord comprendre les collections.

## 5.1 `users`

Document : `users/{uid}`

Role :

- stocker le profil applicatif minimal ;
- principalement l'alias affiche dans le jeu.

Pourquoi cette collection existe alors qu'il y a deja Firebase Auth ?

Parce que Firebase Auth stocke l'identite technique de connexion, mais pas forcement toutes les donnees metier du projet. Ici, l'alias prefere est une donnee metier.

Exemple conceptuel :

```json
{
  "alias": "Antoine"
}
```

## 5.2 `quizzes`

Document : `quizzes/{quizId}`

Role :

- stocker les metadonnees d'un quiz ;
- indiquer son proprietaire ;
- fournir les informations d'affichage principales.

Exemple conceptuel :

```json
{
  "ownerId": "uid_du_createur",
  "title": "Capitales du monde",
  "description": "Quiz de geographie",
  "coverImageUrl": "assets/covers/geographie.svg",
  "themeColor": "#0f766e",
  "estimatedDurationMinutes": 8,
  "questionsCount": 12
}
```

## 5.3 `quizzes/{quizId}/questions`

Sous-collection :

- chaque question d'un quiz est un document separe ;
- cela evite de mettre tout le quiz dans un seul gros document ;
- cela facilite la lecture, l'edition et la suppression selective.

Exemple conceptuel :

```json
{
  "order": 0,
  "text": "Quelle est la capitale de l'Espagne ?",
  "imageUrl": "",
  "correctChoiceIndex": 1,
  "choices": [
    { "text": "Barcelone", "imageUrl": "" },
    { "text": "Madrid", "imageUrl": "" },
    { "text": "Valence", "imageUrl": "" }
  ]
}
```

## 5.4 `games`

Document : `games/{gameId}`

Role :

- representer une session de jeu multijoueur ;
- stocker l'etat courant de la partie.

Exemples de champs importants :

- `hostId` : l'hote de la partie ;
- `quizId` : le quiz source ;
- `status` : `waiting`, `in-progress` ou `finished` ;
- `entryCode` : code public a 6 caracteres ;
- `currentQuestionIndex` : index de la question en cours ;
- `currentQuestionStatus` : etat de la question ;
- `totalQuestions` : nombre total de questions ;
- `questionDurationSeconds` : duree d'une question pendant la partie ;
- `answerCount` : nombre de reponses recues pour la question en cours.

Important :

Le document `games/{gameId}` ne sert pas seulement a dire qu'une partie existe. Il sert aussi a publier l'etat global de la session a tous les participants.

## 5.5 `games/{gameId}/players`

Sous-collection :

- un document par joueur ;
- y compris l'hote s'il participe ;
- suit le score et la progression individuelle.

Champs importants :

- `alias`
- `score`
- `joinedAt`
- `totalAnswerTimeMs`
- `correctAnswers`
- `currentQuestionIndex`
- `currentQuestionStartedAt`
- `finishedAt`

Cette sous-collection permet de savoir :

- qui est dans la partie ;
- ou chaque joueur en est ;
- qui a termine ;
- comment calculer le classement final.

## 5.6 `games/{gameId}/questions`

Sous-collection :

- copie de travail des questions utilisees pendant la partie.

Pourquoi copier les questions du quiz dans la partie ?

Parce qu'une partie doit rester stable meme si le quiz source change plus tard. Sans copie, modifier un quiz pendant une partie pourrait casser la session ou desynchroniser les joueurs.

## 5.7 `games/{gameId}/responses`

Sous-collection :

- une reponse par joueur et par question.

Role :

- garder une trace fiable de ce qu'un joueur a repondu ;
- eviter les doubles reponses ;
- permettre le calcul du score et du temps.

## 5.8 `gameCodes`

Document : `gameCodes/{entryCode}`

Role :

- faire le lien entre un code humain court et un `gameId`.

Pourquoi ne pas chercher directement les parties dans `games` par code ?

On pourrait, mais la collection `gameCodes` sert d'index simple, direct et clair. Quand un joueur tape un code, l'application peut resoudre rapidement :

```text
code saisi -> gameCodes/{ABC123} -> gameId reel -> games/{gameId}
```

C'est une bonne separation entre :

- l'identifiant technique du document Firestore ;
- le code public partage entre joueurs.

## 6. Authentification Google et authentification classique

Cette section est volontairement plus detaillee, car l'authentification est souvent le premier point delicat pour quelqu'un qui reprend un projet Firebase.

## 6.1 Deux modes de connexion

Le projet accepte :

- email + mot de passe ;
- Google.

## 6.2 Inscription email/mot de passe

Flux simplifie :

1. L'utilisateur remplit email, mot de passe et alias.
2. Le compte est cree dans Firebase Authentication.
3. Le profil Firebase Auth recoit `displayName = alias`.
4. Le document `users/{uid}` est cree ou complete avec l'alias.
5. Un email de verification est envoye.
6. L'utilisateur est deconnecte.
7. Il doit verifier son email avant d'acceder aux pages protegees.

Ce choix est important : un compte email non verifie ne peut pas entrer dans l'application principale.

## 6.3 Connexion email/mot de passe

Flux simplifie :

1. L'utilisateur se connecte avec Firebase Auth.
2. L'application recharge l'utilisateur pour recuperer l'etat le plus recent.
3. Elle verifie s'il a le droit d'acceder a la zone protegee.
4. Si oui, elle s'assure que `users/{uid}` existe.
5. Elle redirige vers la zone demandee ou vers `/quizzes`.

## 6.4 Regle d'acces a l'application

La logique d'acces protege n'est pas "tout compte connecte est accepte".

La logique actuelle est :

- si l'utilisateur a verifie son email, il est autorise ;
- ou, si le compte vient de Google, il est autorise.

Donc :

- un compte email non verifie est refuse ;
- un compte Google est accepte sans verification email supplementaire.

## 6.5 Connexion Google sur le web

Sur le web, le projet utilise le plugin Capacitor Firebase Authentication avec un mode popup.

Logique :

1. ouverture d'une popup Google ;
2. Google authentifie l'utilisateur ;
3. Firebase Auth recupere la session ;
4. l'application recupere l'utilisateur courant ;
5. elle passe par le meme flux final de validation qu'une connexion normale.

## 6.6 Connexion Google sur mobile

Sur mobile, le flux est legerement different.

L'application :

1. lance la connexion Google native via le plugin Capacitor ;
2. recupere le token Google ;
3. construit un credential Firebase ;
4. connecte l'utilisateur dans Firebase Auth avec ce credential.

Le projet active explicitement le provider Google dans la configuration Capacitor :

```ts
plugins: {
  FirebaseAuthentication: {
    providers: ['google.com'],
  },
}
```

## 6.7 Pourquoi `users/{uid}` reste necessaire meme avec Google ?

Parce qu'un utilisateur Google possede bien une identite Firebase Auth, mais le projet veut aussi un profil metier stable, notamment l'alias affiche dans le jeu.

Le service utilisateur garantit donc qu'un document Firestore existe pour chaque utilisateur connecte, quelle que soit la methode de connexion.

## 6.8 Point de vigilance pour quelqu'un qui reprend le projet

Si la connexion Google ne fonctionne plus, il faut verifier plusieurs choses, pas seulement le code :

- provider Google active dans Firebase Authentication ;
- domaine web autorise ;
- configuration de l'application Firebase correcte ;
- configuration mobile Capacitor correcte ;
- eventuelles cles SHA si le projet Android est utilise en production ;
- coherence entre le projet Firebase cible et les fichiers config de l'application.

## 7. Fonctionnement detaille des quiz

## 7.1 Creation et modification

Quand un utilisateur cree ou modifie un quiz :

- il edite un objet `Quiz` ;
- les metadonnees sont stockees dans `quizzes/{quizId}` ;
- les questions sont stockees dans `quizzes/{quizId}/questions/{questionId}` ;
- un batch Firestore est utilise pour ecrire l'ensemble de maniere coherente.

Cela permet :

- d'ecrire le quiz et ses questions ensemble ;
- de supprimer les anciennes questions retirees lors d'une modification ;
- d'eviter de laisser un quiz incomplet.

## 7.2 Propriete d'un quiz

Le champ `ownerId` est central.

Il sert a garantir que :

- tout utilisateur authentifie peut lire les quiz ;
- seul le proprietaire peut modifier ou supprimer son quiz ;
- seules ses questions lui appartiennent aussi pour l'ecriture.

## 7.3 Mode entrainement

Le mode entrainement lit les questions du quiz pour faire jouer un utilisateur seul.

Ce mode est different du multijoueur :

- il n'a pas besoin de salle ni de code ;
- il n'a pas besoin d'un document `games/{gameId}` ;
- il ne depend pas de la synchronisation temps reel d'une session multijoueur.

## 8. Fonctionnement detaille des parties multijoueurs

## 8.1 Creation d'une partie

Quand un utilisateur lance une partie depuis un quiz :

1. l'application appelle la Cloud Function `createGame` ;
2. la fonction verifie que le quiz existe ;
3. elle verifie qu'il contient au moins une question ;
4. elle genere un code a 6 caracteres ;
5. elle cree le document `games/{gameId}` ;
6. elle cree `gameCodes/{entryCode}` ;
7. elle ajoute l'hote dans `games/{gameId}/players/{uid}` ;
8. elle copie les questions dans `games/{gameId}/questions`.

Le resultat est une salle d'attente prete a etre partagee.

## 8.2 Rejoindre une partie

Quand un joueur saisit un code :

1. l'application resout le code via `gameCodes/{entryCode}` ;
2. elle retrouve le `gameId` ;
3. elle verifie que la partie existe encore ;
4. elle refuse si la partie est terminee ;
5. elle cree ou confirme l'entree du joueur dans `players`.

## 8.3 Lancement de la partie

Seul l'hote lance la partie.

Le lancement :

- fait passer la partie de `waiting` a `in-progress` ;
- initialise l'etat courant de question ;
- reinitialise les compteurs necessaires des joueurs ;
- met a jour le document `gameCodes` pour refleter le nouvel etat.

## 8.4 Question en cours

L'application ne doit pas exposer la bonne reponse trop tot.

Pour cela, la fonction `getCurrentQuestion` renvoie une version assainie de la question :

- texte ;
- image ;
- choix ;
- ordre ;
- identifiant.

Mais pas l'information sensible `correctChoiceIndex`.

## 8.5 Reponse d'un joueur

Quand un joueur repond :

1. la Function verifie que la partie existe ;
2. elle verifie qu'elle est en cours ;
3. elle verifie que le joueur a le droit de repondre ;
4. elle verifie qu'il n'a pas deja repondu a cette question ;
5. elle calcule le temps ecoule ;
6. elle determine si la reponse est correcte ;
7. elle enregistre un document `responses` ;
8. elle met a jour le score et la progression du joueur.

Cette logique cote serveur est importante : elle evite qu'un client malveillant puisse simplement s'attribuer des points localement.

## 8.6 Fin de partie

La partie est terminee lorsque tous les joueurs sont arrives au bout.

La logique de fin :

- observe la progression des joueurs ;
- detecte quand tout le monde a termine ;
- passe la partie en statut `finished` ;
- met a jour aussi `gameCodes`.

## 9. Firestore en detail : comment penser la base

Pour quelqu'un qui debute avec Firestore, voici le bon modele mental.

## 9.1 Firestore n'est pas une base SQL

Il n'y a pas ici de tables et de jointures classiques comme dans une base relationnelle.

On travaille avec :

- des collections ;
- des documents ;
- des sous-collections ;
- des lectures directes par chemin.

Exemple :

- `quizzes/{quizId}`
- `quizzes/{quizId}/questions/{questionId}`
- `games/{gameId}/players/{playerId}`

Chaque document est un objet JSON-like avec des contraintes de type.

## 9.2 Pourquoi utiliser des sous-collections

Les sous-collections sont utiles ici pour separer des ensembles qui peuvent grandir independamment :

- les questions d'un quiz ;
- les joueurs d'une partie ;
- les reponses d'une partie.

Si tout etait stocke dans un seul document :

- les documents deviendraient trop gros ;
- les mises a jour seraient plus fragiles ;
- la concurrence serait plus difficile a gerer.

## 9.3 Pourquoi certains champs sont dupliques

Dans `games`, on retrouve des champs comme :

- `quizTitle`
- `quizCoverImageUrl`
- `quizThemeColor`

Ces informations existent deja dans le quiz source, mais elles sont recopiees dans la partie.

Ce n'est pas une erreur : c'est un choix de denormalisation.

Cela permet :

- d'afficher rapidement la partie sans relire le quiz ;
- de garder une coherence visuelle meme si le quiz change ensuite ;
- de stabiliser la session au moment de sa creation.

## 9.4 Pourquoi la duree de question est dans `games`

La duree d'une question pendant une partie est une regle de session, pas seulement une information de quiz.

Elle est donc stockee dans la partie, car c'est la session en cours qui doit definir :

- combien de temps la question reste ouverte ;
- quand elle commence ;
- quand elle se termine.

## 9.5 Pourquoi `responses` est separe de `players`

Le document joueur ne doit pas porter tout l'historique detaille de toutes les reponses.

Le separer permet :

- d'eviter de gros documents ;
- de garder une trace par question ;
- de controler les doubles soumissions ;
- de conserver un historique precis.

## 10. Firestore Rules en tres grand detail

Cette partie est la plus importante pour comprendre Firebase sur ce projet.

## 10.1 A quoi servent les Rules

Les Firestore Rules sont evaluees par Firebase a chaque lecture et ecriture.

Elles ne sont pas un confort optionnel. Elles sont une barriere de securite obligatoire.

Sans elles, un client pourrait tenter :

- de lire des donnees qu'il ne devrait pas voir ;
- de modifier les quiz d'un autre utilisateur ;
- de truquer son score ;
- de se declarer hote d'une partie ;
- d'ajouter de faux joueurs ;
- de reecrire une partie finie.

## 10.2 Principe fondamental

Il faut toujours raisonner comme si le client n'etait pas digne de confiance.

Le front-end peut etre modifie, observe, rejoue, automatise ou contourne. Les regles, elles, vivent cote Firebase.

Donc :

- le front guide l'utilisateur ;
- les rules empechent les operations interdites ;
- les Functions executent la logique serveur sensible.

## 10.3 Structure generale des rules du projet

Les regles commencent par des fonctions utilitaires :

- verification de connexion ;
- verification de proprietaire ;
- verification d'hote ;
- verification de joueur ;
- verification du format des documents.

Ensuite viennent les `match` par collection :

- `users`
- `quizzes`
- `quizzes/.../questions`
- `gameCodes`
- `games`
- `games/.../players`
- `games/.../questions`
- `games/.../responses`

## 10.4 Les fonctions utilitaires simples

Exemples de logique :

- `isSignedIn()` : il faut etre authentifie ;
- `isOwner(ownerId)` : il faut etre le proprietaire attendu ;
- `isQuizOwner(quizId)` : il faut etre proprietaire du quiz ;
- `isGameHost(gameId)` : il faut etre l'hote de la partie ;
- `isGamePlayer(gameId)` : il faut avoir un document joueur dans la partie ;
- `isGameParticipant(gameId)` : hote ou joueur.

Ces fonctions rendent les regles plus lisibles et evitent de recopier la meme logique partout.

## 10.5 Validation de forme des documents

Une grande force des rules ici est qu'elles ne font pas seulement des checks d'identite. Elles verifient aussi la forme des donnees.

Exemples :

- un alias doit etre une chaine non vide de taille raisonnable ;
- un quiz doit contenir exactement certains champs ;
- une question doit avoir entre 2 et 6 choix ;
- le bon index doit etre dans la taille des choix ;
- un document joueur doit avoir des valeurs numeriques et temporelles coherentes ;
- une reponse doit correspondre a la structure attendue.

Cela empeche par exemple :

- d'ajouter des champs sauvages non prevus ;
- d'envoyer une question invalide ;
- de definir un `correctChoiceIndex` hors limite ;
- de pousser un document completement incoherent.

## 10.6 Regles sur `users`

Idee :

- tout utilisateur connecte peut lire les profils ;
- un utilisateur ne peut creer, modifier ou supprimer que son propre document `users/{uid}`.

But :

- centraliser l'alias ;
- empecher un utilisateur d'ecrire sur le profil d'un autre.

## 10.7 Regles sur `quizzes`

Idee :

- tout utilisateur connecte peut lire les quiz ;
- seul le proprietaire peut les modifier ou les supprimer ;
- les donnees du quiz doivent respecter un schema strict.

La regle s'appuie notamment sur `ownerId`.

Consequence pratique :

- on peut afficher le catalogue a tous les utilisateurs connectes ;
- mais on ne peut pas modifier un quiz qui ne nous appartient pas.

## 10.8 Regles sur `quizzes/{quizId}/questions`

Idee :

- lecture ouverte aux utilisateurs connectes ;
- ecriture reservee au proprietaire du quiz ;
- structure de question strictement validee.

Le point important est que les questions heritent indirectement de la propriete du quiz parent.

## 10.9 Regles sur `gameCodes`

Cette collection semble simple, mais elle est importante.

Les regles verifient que :

- le document est bien cree par un utilisateur authentifie ;
- `hostId` correspond bien a l'utilisateur qui ecrit ;
- le statut reste un statut de jeu valide ;
- la mise a jour est soit faite par l'hote, soit dans un cas tres encadre de fin de partie.

Pourquoi cette rigueur ?

Parce que `gameCodes` est un point d'entree public. Si cette collection etait mal protegee, on pourrait falsifier les codes ou les rediriger vers une autre partie.

## 10.10 Regles sur `games`

Les regles de `games` sont plus sensibles.

Elles imposent notamment :

- seule une personne connectee peut creer une partie ;
- la partie doit pointer vers un quiz existant ;
- la structure du document jeu doit etre valide ;
- seul l'hote peut faire les mises a jour globales normales ;
- un participant peut seulement effectuer une transition tres precise vers l'etat `finished`.

Cela protege les champs critiques :

- `hostId`
- `quizId`
- `entryCode`
- `totalQuestions`
- et l'etat courant de la session.

## 10.11 Regles sur `players`

La sous-collection `players` est tres interessante pedagogiquement, car elle montre une logique fine de securite.

Le projet autorise plusieurs cas :

1. L'hote peut ecrire les documents joueurs.
   C'est utile lors de la creation ou de l'initialisation de partie.

2. Un joueur peut s'ajouter ou se mettre a jour lui-meme dans certains cas tres precis.

Deux fonctions sont essentielles :

### `isSelfWaitingPlayerWrite`

Cette regle autorise un joueur a creer ou mettre a jour son propre document si la partie est en attente.

Mais pas n'importe comment.

Elle impose un etat de salle d'attente propre :

- score a 0 ;
- temps de reponse a 0 ;
- nombre de bonnes reponses a 0 ;
- question courante a 0 ;
- aucun `finishedAt`.

Autrement dit, un joueur peut rejoindre la salle, mais il ne peut pas s'y donner un avantage.

### `isSelfInProgressAdvance`

Cette regle autorise un joueur a faire avancer son propre document pendant la partie.

Mais elle contraint tres fortement l'ecriture :

- l'alias ne change pas ;
- `joinedAt` ne change pas ;
- `currentQuestionIndex` ne peut avancer que d'une seule unite ;
- le score ne peut pas diminuer ;
- le nombre de bonnes reponses ne peut pas diminuer ;
- le temps cumule ne peut pas diminuer.

Cette regle est interessante car elle montre une idee tres Firebase :

on n'autorise pas juste "le joueur peut ecrire son document", on autorise "le joueur peut effectuer seulement une progression compatible avec le jeu".

## 10.12 Regles sur `games/{gameId}/questions`

Idee :

- seuls les participants peuvent les lire ;
- seul l'hote peut les creer, modifier ou supprimer.

But :

- tous les joueurs de la partie peuvent lire le support de jeu ;
- mais personne d'autre ne peut venir reecrire les questions de la session.

## 10.13 Regles sur `responses`

Ces regles sont tres importantes contre la triche.

Elles imposent notamment :

- un joueur ne peut creer qu'un document de reponse qui lui appartient ;
- l'identifiant du document doit correspondre a son uid ;
- le host peut lire toutes les reponses ;
- un joueur ne peut pas lister toutes les reponses des autres ;
- les reponses ne sont pas modifiables apres creation.

Consequence :

- impossible de reecrire sa reponse apres coup ;
- impossible de parcourir facilement les reponses des autres joueurs ;
- impossible de poster une reponse pour un autre joueur.

## 10.14 Pourquoi les rules "dupliquent" la logique metier

Pour quelqu'un venant d'un back-end classique, cela peut sembler redondant :

- le front valide deja ;
- les Functions verifient deja ;
- pourquoi encore des rules ?

La reponse est simple :

Parce que Firestore peut etre attaque directement si les rules sont faibles.

Les rules ne remplacent pas les Functions, et les Functions ne remplacent pas les rules.

Leur repartition est la suivante :

- le front guide l'utilisateur et gere l'UX ;
- les rules protegent la base a bas niveau ;
- les Functions centralisent les actions sensibles et la logique de partie.

## 11. Cloud Functions en detail

## 11.1 Pourquoi utiliser des Cloud Functions ici

Le coeur sensible du projet est le multijoueur.

Si toute la logique de partie etait laissee au client :

- un joueur pourrait tenter de repondre plusieurs fois ;
- un client pourrait manipuler son score ;
- un client pourrait lancer une partie illegalement ;
- la synchronisation serait fragile.

Les Cloud Functions resolvent ce probleme en executant la logique critique sur le serveur.

## 11.2 Les fonctions principales

### `createGame`

Role :

- verifier l'authentification ;
- verifier l'existence du quiz ;
- verifier qu'il y a des questions ;
- generer un code unique ;
- creer la structure complete de la partie.

### `joinGame`

Role :

- resoudre le code de partie ;
- retrouver le `gameId` ;
- verifier que la partie existe ;
- refuser si elle est terminee ;
- garantir l'entree du joueur dans la salle.

### `ensurePlayerEntry`

Role :

- s'assurer qu'un utilisateur courant possede bien son document joueur.

Cette fonction sert de garde-fou pour eviter des etats incoherents cote client.

### `startGame`

Role :

- verifier que seul l'hote lance ;
- verifier que la partie est bien en attente ;
- initialiser l'etat de demarrage ;
- preparer les joueurs pour le premier tour.

### `getCurrentQuestion`

Role :

- renvoyer la question active sans exposer la bonne reponse.

### `listQuizQuestions`

Role :

- lister les questions d'un quiz dans une version assainie.

Cette fonction est utile lorsque l'application a besoin de lire les questions sans la reponse correcte.

### `getPracticeQuizQuestions`

Role :

- fournir les questions pour le mode entrainement, cette fois avec la bonne reponse incluse.

Le mode pratique peut se permettre de connaitre la bonne reponse car il n'y a pas de competition multijoueur a proteger.

### `submitAnswer`

Role :

- verifier la validite de la soumission ;
- empecher les doublons ;
- calculer les points ;
- enregistrer la reponse ;
- mettre a jour le joueur ;
- verifier ensuite si la partie doit se terminer.

### `skipExpiredQuestion`

Role :

- faire progresser proprement un joueur si le temps de question est ecoule et qu'il n'a pas repondu.

## 11.3 Les transactions et batchs

Les Functions utilisent des transactions ou des batchs pour garantir des ecritures coherentes.

Pourquoi c'est important ?

Parce qu'une action de jeu touche souvent plusieurs documents a la fois :

- la partie ;
- le joueur ;
- la reponse ;
- parfois `gameCodes`.

Sans operation atomique, on pourrait laisser un etat partiellement ecrit en cas de concurrence ou d'erreur.

## 11.4 Protection contre la triche

La protection ne repose pas sur une seule couche.

Elle repose sur :

- les Rules ;
- les Functions ;
- des identifiants de documents contraints ;
- des transitions d'etat controlees ;
- des verifications d'authentification ;
- des validations de structure.

## 11.5 Pourquoi le front a parfois un fallback direct Firestore

Le service de jeu cote front tente d'abord les Cloud Functions, puis peut utiliser un flux direct Firestore dans certains cas limites.

Cette strategie sert surtout a la robustesse applicative.

Mais le point crucial est le suivant :

memes dans ce cas, les Firestore Rules restent la derniere ligne de defense. Le fallback ne contourne pas la securite.

## 12. Deploiement sur le site en ligne

Cette section explique le deploiement de la version web sur :

`https://kahoot-fcbbc.web.app/`

## 12.1 Fichiers de configuration importants

- `firebase.json`
- `.firebaserc`
- `src/environments/environment.ts`
- `functions/package.json`

## 12.2 Ce que fait `firebase.json`

Ce fichier declare notamment :

- ou se trouvent les Cloud Functions : `functions/` ;
- ou se trouvent les Firestore Rules : `firestore.rules` ;
- ou se trouvent les index Firestore : `firestore.indexes.json` ;
- ou se trouve le build web a publier : `www/` ;
- les rewrites pour que toutes les routes Angular renvoient vers `index.html` ;
- les emulators utilises localement.

La rewrite `** -> /index.html` est tres importante pour une SPA Angular, sinon un rechargement direct sur une route comme `/quiz/abc` donnerait une erreur 404 cote serveur.

## 12.3 Projet Firebase cible

Le projet par defaut est :

`kahoot-fcbbc`

Il est defini dans `.firebaserc`.

## 12.4 Construction du front web

Avant de deployer, il faut construire l'application :

```bash
npm run build
```

Le resultat est place dans `www/`, qui est le dossier publie par Firebase Hosting.

## 12.5 Construction des Functions

Les Functions TypeScript doivent etre compilees :

```bash
npm --prefix functions run build
```

Le deploiement Firebase execute deja cette etape en predeploy, mais il est souvent utile de la lancer explicitement avant.

## 12.6 Deploiement du site web

Pour deployer uniquement le front web :

```bash
npx firebase-tools deploy --only hosting --project kahoot-fcbbc
```

## 12.7 Deploiement du front + base + functions

Pour deployer l'ensemble principal :

```bash
npx firebase-tools deploy --only hosting,firestore,functions --project kahoot-fcbbc
```

Ce deploiement pousse :

- le site web ;
- les regles et index Firestore ;
- les Cloud Functions.

## 12.8 Attention au plan Firebase pour les Functions

Le deploiement des Cloud Functions modernes peut necessiter l'activation de services Google Cloud comme :

- Cloud Build ;
- Artifact Registry.

Selon la configuration du projet Firebase, cela peut imposer le plan Blaze.

Concretement :

- le deploiement du hosting seul peut fonctionner ;
- le deploiement complet avec `functions` peut etre bloque tant que les services Google Cloud requis ne sont pas activables.

## 12.9 Authentification du CLI Firebase

Avant tout deploiement, il faut etre connecte avec le CLI :

```bash
npx firebase-tools login
```

Puis verifier le compte connecte si besoin :

```bash
npx firebase-tools login:list
```

## 12.10 Recommandation de routine avant de deployer

Bonne routine simple :

1. lancer les tests locaux ;
2. compiler le front ;
3. compiler les Functions ;
4. deployer ;
5. verifier le site en ligne.

## 13. Tests et verification locale

## 13.1 Tests application

```bash
npm run build
npm run test:app-logic
```

## 13.2 Tests Functions

```bash
npm --prefix functions run build
```

## 13.3 Tests Firebase avec emulators

Commande conseillee :

```bash
npx firebase-tools emulators:exec --only auth,firestore,functions "node --test --test-concurrency=1 firebase-tests/*.test.mjs"
```

Cette commande lance un environnement local Firebase temporaire, execute les tests, puis arrete les emulators.

## 13.4 Remarque sur le script `npm run test:firebase`

Le projet contient deja un script `test:firebase`, mais il suppose qu'une commande `firebase` soit disponible dans l'environnement.

Si ce n'est pas le cas, l'equivalent avec `npx firebase-tools` est souvent plus robuste.

## 14. Comment lire le projet quand on le reprend

Si vous reprenez ce projet pour la premiere fois, la meilleure facon de le comprendre est :

1. lire les routes principales et les pages visibles ;
2. comprendre les modeles `Quiz`, `Question` et `Game` ;
3. lire `AuthService`, `QuizService` et `GameService` ;
4. lire ensuite `firestore.rules` ;
5. terminer par `functions/src/index.ts`.

Dans ce projet, les regles et les Functions sont presque aussi importantes que le front.

Si on ne comprend que les composants Angular sans comprendre Firebase, on ne comprend qu'une moitie de l'application.

## 15. Resume tres court a retenir

Si on devait resumer le projet en quelques phrases :

- Angular/Ionic affiche l'application et gere l'experience utilisateur ;
- Firebase Authentication identifie les utilisateurs ;
- Firestore stocke quiz, profils, parties, joueurs et reponses ;
- les Firestore Rules protegent la base contre les acces et ecritures illegitimes ;
- les Cloud Functions portent la logique serveur sensible du multijoueur ;
- Firebase Hosting publie la version web sur `https://kahoot-fcbbc.web.app/`.

La cle pour comprendre ce projet est de voir Firebase non pas comme un simple stockage, mais comme le coeur de la securite, de la synchronisation et du fonctionnement temps reel de l'application.
