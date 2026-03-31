import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const apiKey = 'AIzaSyCbedjA_44J4mw7_g6YYRaW82aeQK2uXGc';
const projectId = 'kahoot-fcbbc';
const TOKEN_STORE_PATH = join(
  homedir(),
  '.config',
  'configstore',
  'firebase-tools.json',
);

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function printHelp() {
  console.log(`Usage:
  npm run seed:demo -- --email prof@example.com --password secret123 [--alias Prof]
  npm run seed:demo -- --email prof@example.com --password secret123 --register [--alias Prof]
  npm run seed:demo -- --use-cli-auth --owner-id <firebase-auth-uid> [--alias Prof]

Options:
  --email      Adresse email Firebase Auth
  --password   Mot de passe Firebase Auth
  --alias      Alias stocke dans users/{uid}. Par defaut: prefixe de l'email
  --owner-id   UID Firebase Auth qui recevra les quiz de demo
  --register   Cree le compte si besoin
  --use-cli-auth
               Utilise la session OAuth du Firebase CLI pour ecrire dans Firestore
`);
}

async function readTokenStore() {
  const raw = await readFile(TOKEN_STORE_PATH, 'utf8');
  return JSON.parse(raw);
}

async function getCliAccessToken() {
  const tokenStore = await readTokenStore();
  const tokens = tokenStore.tokens;

  if (!tokens?.refresh_token) {
    throw new Error(
      'Aucun refresh token Firebase CLI trouve dans ~/.config/configstore/firebase-tools.json',
    );
  }

  if (
    typeof tokens.access_token === 'string'
    && typeof tokens.expires_at === 'number'
    && tokens.expires_at > Date.now() + 60_000
  ) {
    return tokens.access_token;
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id:
        '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'jxaalJJxOKoIYzY4X-l_yQ',
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  });

  const body = await response.json();
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(
      `Impossible de rafraichir le token Firebase CLI: ${body.error ?? response.status}`,
    );
  }

  return body.access_token;
}

async function authenticate(email, password, alias, shouldRegister) {
  const endpoint = shouldRegister
    ? `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  const payload = shouldRegister
    ? { email, password, returnSecureToken: true }
    : { email, password, returnSecureToken: true };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message ?? 'AUTH_ERROR');
  }

  if (shouldRegister) {
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idToken: body.idToken,
          displayName: alias,
          returnSecureToken: false,
        }),
      },
    );
  }

  return {
    uid: body.localId,
    idToken: body.idToken,
  };
}

function encodeValue(value) {
  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => encodeValue(entry)),
      },
    };
  }

  if (value && typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]),
        ),
      },
    };
  }

  return { nullValue: null };
}

async function writeDocument(idToken, path, data) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, encodeValue(value)]),
        ),
      }),
    },
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`FIRESTORE_WRITE_ERROR ${path}: ${body.error?.message ?? response.status}`);
  }

  return body;
}

function choice(text, imageUrl = '') {
  return { text, imageUrl };
}

function cloneChoices(...choices) {
  return choices.map((entry) => ({ ...entry }));
}

const CITY_CHOICES = {
  paris: choice('Paris', 'assets/questions/paris.svg'),
  london: choice('Londres', 'assets/questions/london.svg'),
  berlin: choice('Berlin', 'assets/questions/berlin.svg'),
  madrid: choice('Madrid', 'assets/questions/madrid.svg'),
  rome: choice('Rome', 'assets/questions/rome.svg'),
  tokyo: choice('Tokyo', 'assets/questions/tokyo.svg'),
  seoul: choice('Seoul', 'assets/questions/seoul.svg'),
  bangkok: choice('Bangkok', 'assets/questions/bangkok.svg'),
  rabat: choice('Rabat', 'assets/questions/rabat.svg'),
};

const FLAG_CHOICES = {
  france: choice('France', 'assets/questions/flag-france.svg'),
  germany: choice('Allemagne', 'assets/questions/flag-germany.svg'),
  spain: choice('Espagne', 'assets/questions/flag-spain.svg'),
  italy: choice('Italie', 'assets/questions/flag-italy.svg'),
  japan: choice('Japon', 'assets/questions/flag-japan.svg'),
  uk: choice('Royaume-Uni', 'assets/questions/flag-uk.svg'),
};

const PLANET_CHOICES = {
  mercury: choice('Mercure', 'assets/questions/mercury.svg'),
  venus: choice('Venus', 'assets/questions/venus.svg'),
  earth: choice('Terre', 'assets/questions/earth.svg'),
  mars: choice('Mars', 'assets/questions/mars.svg'),
  jupiter: choice('Jupiter', 'assets/questions/jupiter.svg'),
  saturn: choice('Saturne', 'assets/questions/saturn.svg'),
};

const VISUAL_TOPIC_CHOICES = {
  literature: choice('Litterature', 'assets/questions/book-stars.svg'),
  music: choice('Musique', 'assets/questions/crown-mic.svg'),
  cinema: choice('Cinema', 'assets/questions/paris-cafe.svg'),
  history: choice('Histoire', 'assets/questions/berlin-wall.svg'),
};

const HISTORY_CHOICES = {
  revolution: choice('Revolution francaise', 'assets/questions/revolution-1789.svg'),
  wall: choice('Chute du mur de Berlin', 'assets/questions/berlin-wall.svg'),
  war: choice('Premiere Guerre mondiale', 'assets/questions/1914.svg'),
  republic: choice('Symboles de la Republique', 'assets/questions/flag-france.svg'),
};

function validateAsset(label, imageUrl) {
  if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
    throw new Error(`IMAGE_MISSING ${label}`);
  }

  if (!imageUrl.startsWith('assets/')) {
    return;
  }

  const assetFile = new URL(`../src/${imageUrl}`, import.meta.url);
  if (!existsSync(assetFile)) {
    throw new Error(`IMAGE_NOT_FOUND ${label}: ${imageUrl}`);
  }
}

function validateQuizBank(quizzes) {
  quizzes.forEach((quiz) => {
    if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      throw new Error(`QUIZ_EMPTY ${quiz.id}`);
    }

    quiz.questions.forEach((question, questionIndex) => {
      validateAsset(`${quiz.id}/q${questionIndex + 1}`, question.imageUrl);

      if (
        !Number.isInteger(question.correctChoiceIndex)
        || question.correctChoiceIndex < 0
        || question.correctChoiceIndex >= question.choices.length
      ) {
        throw new Error(`INVALID_CORRECT_CHOICE ${quiz.id}/q${questionIndex + 1}`);
      }

      question.choices.forEach((entry, choiceIndex) => {
        validateAsset(
          `${quiz.id}/q${questionIndex + 1}/choice${choiceIndex + 1}`,
          entry.imageUrl,
        );
      });
    });
  });
}

function buildQuizSeed(ownerId) {
  return [
    {
      id: `demo-capitals-${ownerId}`,
      ownerId,
      title: 'Capitales du monde',
      description: 'Un quiz de geographie pour reviser les capitales en classe.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle est la capitale de la France ?',
          imageUrl: 'assets/questions/paris.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            CITY_CHOICES.rome,
            CITY_CHOICES.paris,
            CITY_CHOICES.madrid,
            CITY_CHOICES.berlin,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle capitale asiatique correspond a ce visuel rouge ?',
          imageUrl: 'assets/questions/tokyo.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            CITY_CHOICES.seoul,
            CITY_CHOICES.tokyo,
            CITY_CHOICES.bangkok,
            CITY_CHOICES.london,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle capitale nord-africaine est representee ici ?',
          imageUrl: 'assets/questions/rabat.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            CITY_CHOICES.rabat,
            CITY_CHOICES.paris,
            CITY_CHOICES.berlin,
            CITY_CHOICES.madrid,
          ),
        },
      ],
    },
    {
      id: `demo-science-${ownerId}`,
      ownerId,
      title: 'Sciences',
      description: 'Quelques questions rapides sur les sciences.',
      coverImageUrl: 'assets/covers/sciences.svg',
      themeColor: '#b45309',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle planete est appelee la planete rouge ?',
          imageUrl: 'assets/questions/mars.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            PLANET_CHOICES.mars,
            PLANET_CHOICES.venus,
            PLANET_CHOICES.jupiter,
            PLANET_CHOICES.mercury,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle planete est celebre pour ses anneaux ?',
          imageUrl: 'assets/questions/saturn.svg',
          correctChoiceIndex: 3,
          choices: cloneChoices(
            PLANET_CHOICES.jupiter,
            PLANET_CHOICES.earth,
            PLANET_CHOICES.mars,
            PLANET_CHOICES.saturn,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle planete bleue represente notre monde ?',
          imageUrl: 'assets/questions/earth.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            PLANET_CHOICES.venus,
            PLANET_CHOICES.earth,
            PLANET_CHOICES.mercury,
            PLANET_CHOICES.jupiter,
          ),
        },
      ],
    },
    {
      id: `demo-history-${ownerId}`,
      ownerId,
      title: 'Histoire moderne',
      description: 'Des repères historiques pour revision rapide.',
      coverImageUrl: 'assets/covers/histoire.svg',
      themeColor: '#7c2d12',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quel evenement historique est represente par ce visuel de 1789 ?',
          imageUrl: 'assets/questions/revolution-1789.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            HISTORY_CHOICES.revolution,
            HISTORY_CHOICES.wall,
            HISTORY_CHOICES.war,
            HISTORY_CHOICES.republic,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel evenement historique est lie a ce mur ?',
          imageUrl: 'assets/questions/berlin-wall.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            HISTORY_CHOICES.revolution,
            HISTORY_CHOICES.wall,
            HISTORY_CHOICES.war,
            HISTORY_CHOICES.republic,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quel grand conflit europeen commence en 1914 ?',
          imageUrl: 'assets/questions/1914.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            HISTORY_CHOICES.revolution,
            HISTORY_CHOICES.wall,
            HISTORY_CHOICES.war,
            HISTORY_CHOICES.republic,
          ),
        },
      ],
    },
    {
      id: `demo-culture-${ownerId}`,
      ownerId,
      title: 'Culture generale',
      description: 'Cinema, musique et litterature pour animer la classe.',
      coverImageUrl: 'assets/covers/culture.svg',
      themeColor: '#1d4ed8',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Le Petit Prince renvoie surtout a quel univers ?',
          imageUrl: 'assets/questions/book-stars.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            VISUAL_TOPIC_CHOICES.literature,
            VISUAL_TOPIC_CHOICES.music,
            VISUAL_TOPIC_CHOICES.cinema,
            VISUAL_TOPIC_CHOICES.history,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Amelie Poulain evoque surtout quel domaine ?',
          imageUrl: 'assets/questions/paris-cafe.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            VISUAL_TOPIC_CHOICES.history,
            VISUAL_TOPIC_CHOICES.music,
            VISUAL_TOPIC_CHOICES.cinema,
            VISUAL_TOPIC_CHOICES.literature,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Bohemian Rhapsody renvoie surtout a quel univers ?',
          imageUrl: 'assets/questions/crown-mic.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            VISUAL_TOPIC_CHOICES.cinema,
            VISUAL_TOPIC_CHOICES.music,
            VISUAL_TOPIC_CHOICES.history,
            VISUAL_TOPIC_CHOICES.literature,
          ),
        },
      ],
    },
    {
      id: `demo-visual-capitals-${ownerId}`,
      ownerId,
      title: 'Capitales visuelles',
      description: 'Un quiz centre sur les visuels des villes et leurs silhouettes.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle capitale correspond a ce visuel rouge ?',
          imageUrl: 'assets/questions/tokyo.svg',
          correctChoiceIndex: 1,
          choices: [
            { text: 'Madrid', imageUrl: 'assets/questions/madrid.svg' },
            { text: 'Tokyo', imageUrl: 'assets/questions/tokyo.svg' },
            { text: 'Paris', imageUrl: 'assets/questions/paris.svg' },
            { text: 'Berlin', imageUrl: 'assets/questions/berlin.svg' },
          ],
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle capitale montre la tour Eiffel ?',
          imageUrl: 'assets/questions/paris.svg',
          correctChoiceIndex: 0,
          choices: [
            { text: 'Paris', imageUrl: 'assets/questions/paris.svg' },
            { text: 'Londres', imageUrl: 'assets/questions/london.svg' },
            { text: 'Rabat', imageUrl: 'assets/questions/rabat.svg' },
            { text: 'Madrid', imageUrl: 'assets/questions/madrid.svg' },
          ],
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle capitale correspond a la Porte de Brandebourg ?',
          imageUrl: 'assets/questions/berlin.svg',
          correctChoiceIndex: 2,
          choices: [
            { text: 'Tokyo', imageUrl: 'assets/questions/tokyo.svg' },
            { text: 'Londres', imageUrl: 'assets/questions/london.svg' },
            { text: 'Berlin', imageUrl: 'assets/questions/berlin.svg' },
            { text: 'Rabat', imageUrl: 'assets/questions/rabat.svg' },
          ],
        },
      ],
    },
    {
      id: `demo-flags-${ownerId}`,
      ownerId,
      title: 'Drapeaux express',
      description: 'Reconnaissez les pays a partir de drapeaux illustres.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#1d4ed8',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quel pays a ce drapeau bleu blanc rouge ?',
          imageUrl: 'assets/questions/flag-france.svg',
          correctChoiceIndex: 0,
          choices: [
            { text: 'France', imageUrl: 'assets/questions/flag-france.svg' },
            { text: 'Espagne', imageUrl: 'assets/questions/flag-spain.svg' },
            { text: 'Allemagne', imageUrl: 'assets/questions/flag-germany.svg' },
            { text: 'Japon', imageUrl: 'assets/questions/flag-japan.svg' },
          ],
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel pays a ce drapeau blanc avec cercle rouge ?',
          imageUrl: 'assets/questions/flag-japan.svg',
          correctChoiceIndex: 2,
          choices: [
            { text: 'France', imageUrl: 'assets/questions/flag-france.svg' },
            { text: 'Allemagne', imageUrl: 'assets/questions/flag-germany.svg' },
            { text: 'Japon', imageUrl: 'assets/questions/flag-japan.svg' },
            { text: 'Espagne', imageUrl: 'assets/questions/flag-spain.svg' },
          ],
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quel pays a ce drapeau rouge jaune rouge ?',
          imageUrl: 'assets/questions/flag-spain.svg',
          correctChoiceIndex: 1,
          choices: [
            { text: 'Allemagne', imageUrl: 'assets/questions/flag-germany.svg' },
            { text: 'Espagne', imageUrl: 'assets/questions/flag-spain.svg' },
            { text: 'Japon', imageUrl: 'assets/questions/flag-japan.svg' },
            { text: 'France', imageUrl: 'assets/questions/flag-france.svg' },
          ],
        },
      ],
    },
    {
      id: `demo-planets-${ownerId}`,
      ownerId,
      title: 'Planetes en images',
      description: 'Des questions courtes pour reconnaitre les planetes au premier coup doeil.',
      coverImageUrl: 'assets/covers/sciences.svg',
      themeColor: '#b45309',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle planete est montree ici ?',
          imageUrl: 'assets/questions/mars.svg',
          correctChoiceIndex: 0,
          choices: [
            { text: 'Mars', imageUrl: 'assets/questions/mars.svg' },
            { text: 'Venus', imageUrl: 'assets/questions/venus.svg' },
            { text: 'Jupiter', imageUrl: 'assets/questions/jupiter.svg' },
            { text: 'Mercure', imageUrl: 'assets/questions/mercury.svg' },
          ],
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle planete est la plus proche du Soleil ?',
          imageUrl: 'assets/questions/mercury.svg',
          correctChoiceIndex: 3,
          choices: [
            { text: 'Venus', imageUrl: 'assets/questions/venus.svg' },
            { text: 'Mars', imageUrl: 'assets/questions/mars.svg' },
            { text: 'Jupiter', imageUrl: 'assets/questions/jupiter.svg' },
            { text: 'Mercure', imageUrl: 'assets/questions/mercury.svg' },
          ],
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle est la plus grande planete de cette selection ?',
          imageUrl: 'assets/questions/jupiter.svg',
          correctChoiceIndex: 2,
          choices: [
            { text: 'Mars', imageUrl: 'assets/questions/mars.svg' },
            { text: 'Venus', imageUrl: 'assets/questions/venus.svg' },
            { text: 'Jupiter', imageUrl: 'assets/questions/jupiter.svg' },
            { text: 'Mercure', imageUrl: 'assets/questions/mercury.svg' },
          ],
        },
      ],
    },
    {
      id: `demo-capitals-europe-${ownerId}`,
      ownerId,
      title: 'Capitales d Europe visuelles',
      description: 'Associez rapidement les grandes capitales europeennes a leurs visuels.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle capitale correspond a cette skyline bleue ?',
          imageUrl: 'assets/questions/london.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            CITY_CHOICES.paris,
            CITY_CHOICES.london,
            CITY_CHOICES.berlin,
            CITY_CHOICES.rome,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle capitale est representee par ce monument antique ?',
          imageUrl: 'assets/questions/rome.svg',
          correctChoiceIndex: 3,
          choices: cloneChoices(
            CITY_CHOICES.madrid,
            CITY_CHOICES.paris,
            CITY_CHOICES.berlin,
            CITY_CHOICES.rome,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle capitale apparait sur ce visuel rouge et dore ?',
          imageUrl: 'assets/questions/madrid.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            CITY_CHOICES.madrid,
            CITY_CHOICES.london,
            CITY_CHOICES.rome,
            CITY_CHOICES.berlin,
          ),
        },
      ],
    },
    {
      id: `demo-capitals-asia-${ownerId}`,
      ownerId,
      title: 'Capitales d Asie',
      description: 'Des visuels de villes asiatiques pour memoriser les capitales.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#0891b2',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle capitale correspond a ce torii ?',
          imageUrl: 'assets/questions/tokyo.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            CITY_CHOICES.tokyo,
            CITY_CHOICES.seoul,
            CITY_CHOICES.bangkok,
            CITY_CHOICES.paris,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle capitale montre une tour urbaine au coeur de la ville ?',
          imageUrl: 'assets/questions/seoul.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            CITY_CHOICES.tokyo,
            CITY_CHOICES.bangkok,
            CITY_CHOICES.seoul,
            CITY_CHOICES.berlin,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle capitale affiche ces temples dores ?',
          imageUrl: 'assets/questions/bangkok.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            CITY_CHOICES.seoul,
            CITY_CHOICES.bangkok,
            CITY_CHOICES.rabat,
            CITY_CHOICES.tokyo,
          ),
        },
      ],
    },
    {
      id: `demo-landmarks-${ownerId}`,
      ownerId,
      title: 'Monuments et skylines',
      description: 'Retrouvez la ville a partir d un monument ou d une skyline.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#155e75',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Dans quelle ville se trouve cette celebre tour ?',
          imageUrl: 'assets/questions/paris.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            CITY_CHOICES.london,
            CITY_CHOICES.rome,
            CITY_CHOICES.paris,
            CITY_CHOICES.madrid,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel visuel montre la Porte de Brandebourg ?',
          imageUrl: 'assets/questions/berlin.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            CITY_CHOICES.madrid,
            CITY_CHOICES.berlin,
            CITY_CHOICES.tokyo,
            CITY_CHOICES.rabat,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle ville est associee a ce monument antique ?',
          imageUrl: 'assets/questions/rome.svg',
          correctChoiceIndex: 3,
          choices: cloneChoices(
            CITY_CHOICES.paris,
            CITY_CHOICES.berlin,
            CITY_CHOICES.london,
            CITY_CHOICES.rome,
          ),
        },
      ],
    },
    {
      id: `demo-flags-europe-${ownerId}`,
      ownerId,
      title: 'Drapeaux d Europe',
      description: 'Un ensemble de drapeaux europeens a reconnaitre en quelques secondes.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#1d4ed8',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quel pays a ce drapeau vert blanc rouge ?',
          imageUrl: 'assets/questions/flag-italy.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            FLAG_CHOICES.france,
            FLAG_CHOICES.spain,
            FLAG_CHOICES.italy,
            FLAG_CHOICES.germany,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel pays a ce drapeau noir rouge or ?',
          imageUrl: 'assets/questions/flag-germany.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            FLAG_CHOICES.germany,
            FLAG_CHOICES.uk,
            FLAG_CHOICES.italy,
            FLAG_CHOICES.spain,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quel pays utilise ce drapeau a croix et diagonales ?',
          imageUrl: 'assets/questions/flag-uk.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            FLAG_CHOICES.france,
            FLAG_CHOICES.uk,
            FLAG_CHOICES.germany,
            FLAG_CHOICES.italy,
          ),
        },
      ],
    },
    {
      id: `demo-flags-world-plus-${ownerId}`,
      ownerId,
      title: 'Drapeaux du monde plus',
      description: 'Melangez Europe et Asie pour enrichir la memoire visuelle des drapeaux.',
      coverImageUrl: 'assets/covers/geographie.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quel pays correspond a ce drapeau blanc avec un disque rouge ?',
          imageUrl: 'assets/questions/flag-japan.svg',
          correctChoiceIndex: 3,
          choices: cloneChoices(
            FLAG_CHOICES.france,
            FLAG_CHOICES.italy,
            FLAG_CHOICES.uk,
            FLAG_CHOICES.japan,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel pays a ce drapeau bleu blanc rouge vertical ?',
          imageUrl: 'assets/questions/flag-france.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            FLAG_CHOICES.france,
            FLAG_CHOICES.spain,
            FLAG_CHOICES.germany,
            FLAG_CHOICES.italy,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quel pays a ce drapeau rouge jaune rouge ?',
          imageUrl: 'assets/questions/flag-spain.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            FLAG_CHOICES.uk,
            FLAG_CHOICES.spain,
            FLAG_CHOICES.france,
            FLAG_CHOICES.japan,
          ),
        },
      ],
    },
    {
      id: `demo-planets-advanced-${ownerId}`,
      ownerId,
      title: 'Planetes avancees',
      description: 'Un niveau au-dessus avec davantage de planetes et de comparaisons visuelles.',
      coverImageUrl: 'assets/covers/sciences.svg',
      themeColor: '#b45309',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle planete a ces anneaux visibles ?',
          imageUrl: 'assets/questions/saturn.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            PLANET_CHOICES.jupiter,
            PLANET_CHOICES.earth,
            PLANET_CHOICES.saturn,
            PLANET_CHOICES.mars,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle planete bleue represente notre monde ?',
          imageUrl: 'assets/questions/earth.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            PLANET_CHOICES.venus,
            PLANET_CHOICES.earth,
            PLANET_CHOICES.mercury,
            PLANET_CHOICES.mars,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle planete est la plus massive de cette selection ?',
          imageUrl: 'assets/questions/jupiter.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            PLANET_CHOICES.jupiter,
            PLANET_CHOICES.saturn,
            PLANET_CHOICES.earth,
            PLANET_CHOICES.mars,
          ),
        },
      ],
    },
    {
      id: `demo-space-visuals-${ownerId}`,
      ownerId,
      title: 'Espace et couleurs',
      description: 'Des questions tres visuelles sur la couleur et l aspect des planetes.',
      coverImageUrl: 'assets/covers/sciences.svg',
      themeColor: '#92400e',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle planete brun-orange apparait avec des bandes nuageuses ?',
          imageUrl: 'assets/questions/jupiter.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            PLANET_CHOICES.saturn,
            PLANET_CHOICES.jupiter,
            PLANET_CHOICES.venus,
            PLANET_CHOICES.mercury,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quelle planete grise et rocheuse est montree ici ?',
          imageUrl: 'assets/questions/mercury.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            PLANET_CHOICES.mercury,
            PLANET_CHOICES.earth,
            PLANET_CHOICES.mars,
            PLANET_CHOICES.venus,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quelle planete doree parait couverte de nuages epais ?',
          imageUrl: 'assets/questions/venus.svg',
          correctChoiceIndex: 3,
          choices: cloneChoices(
            PLANET_CHOICES.earth,
            PLANET_CHOICES.saturn,
            PLANET_CHOICES.jupiter,
            PLANET_CHOICES.venus,
          ),
        },
      ],
    },
    {
      id: `demo-culture-visuale-${ownerId}`,
      ownerId,
      title: 'Culture visuelle',
      description: 'Des icones culturelles a associer au bon domaine.',
      coverImageUrl: 'assets/covers/culture.svg',
      themeColor: '#1d4ed8',
      estimatedDurationMinutes: 4,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'A quel domaine associez-vous ce livre etoile ?',
          imageUrl: 'assets/questions/book-stars.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            VISUAL_TOPIC_CHOICES.literature,
            VISUAL_TOPIC_CHOICES.music,
            VISUAL_TOPIC_CHOICES.cinema,
            VISUAL_TOPIC_CHOICES.history,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Ce micro couronne renvoie plutot a quel univers ?',
          imageUrl: 'assets/questions/crown-mic.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            VISUAL_TOPIC_CHOICES.history,
            VISUAL_TOPIC_CHOICES.literature,
            VISUAL_TOPIC_CHOICES.music,
            VISUAL_TOPIC_CHOICES.cinema,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Ce cafe parisien evoque surtout quel domaine culturel ?',
          imageUrl: 'assets/questions/paris-cafe.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            VISUAL_TOPIC_CHOICES.music,
            VISUAL_TOPIC_CHOICES.cinema,
            VISUAL_TOPIC_CHOICES.history,
            VISUAL_TOPIC_CHOICES.literature,
          ),
        },
      ],
    },
    {
      id: `demo-history-visuals-${ownerId}`,
      ownerId,
      title: 'Histoire en images',
      description: 'Revisez les grands reperes historiques a partir de leurs visuels.',
      coverImageUrl: 'assets/covers/histoire.svg',
      themeColor: '#7c2d12',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quel evenement historique est represente ici ?',
          imageUrl: 'assets/questions/revolution-1789.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            HISTORY_CHOICES.wall,
            HISTORY_CHOICES.revolution,
            HISTORY_CHOICES.war,
            HISTORY_CHOICES.republic,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel visuel renvoie a la chute du mur de Berlin ?',
          imageUrl: 'assets/questions/berlin-wall.svg',
          correctChoiceIndex: 2,
          choices: cloneChoices(
            HISTORY_CHOICES.revolution,
            HISTORY_CHOICES.war,
            HISTORY_CHOICES.wall,
            HISTORY_CHOICES.republic,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quel grand conflit europeen est suggere par ce visuel de 1914 ?',
          imageUrl: 'assets/questions/1914.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            HISTORY_CHOICES.war,
            HISTORY_CHOICES.republic,
            HISTORY_CHOICES.wall,
            HISTORY_CHOICES.revolution,
          ),
        },
      ],
    },
    {
      id: `demo-mixed-image-bank-${ownerId}`,
      ownerId,
      title: 'Revision mixte en images',
      description: 'Un melange geographie, sciences et histoire pour agrandir la banque de quiz.',
      coverImageUrl: 'assets/covers/culture.svg',
      themeColor: '#0f766e',
      estimatedDurationMinutes: 5,
      questions: [
        {
          id: 'q1',
          order: 0,
          text: 'Quelle reponse correspond a cette planete aux anneaux ?',
          imageUrl: 'assets/questions/saturn.svg',
          correctChoiceIndex: 3,
          choices: cloneChoices(
            CITY_CHOICES.tokyo,
            FLAG_CHOICES.japan,
            HISTORY_CHOICES.wall,
            PLANET_CHOICES.saturn,
          ),
        },
        {
          id: 'q2',
          order: 1,
          text: 'Quel choix correspond a ce drapeau europeen ?',
          imageUrl: 'assets/questions/flag-uk.svg',
          correctChoiceIndex: 1,
          choices: cloneChoices(
            CITY_CHOICES.london,
            FLAG_CHOICES.uk,
            PLANET_CHOICES.earth,
            HISTORY_CHOICES.revolution,
          ),
        },
        {
          id: 'q3',
          order: 2,
          text: 'Quel choix montre bien la ville de Rome ?',
          imageUrl: 'assets/questions/rome.svg',
          correctChoiceIndex: 0,
          choices: cloneChoices(
            CITY_CHOICES.rome,
            FLAG_CHOICES.italy,
            PLANET_CHOICES.jupiter,
            VISUAL_TOPIC_CHOICES.cinema,
          ),
        },
      ],
    },
  ];
}

function buildGameSeed(ownerId, alias) {
  return {
    id: `demo-game-v4-${ownerId}`,
    hostId: ownerId,
    quizId: `demo-capitals-${ownerId}`,
    quizTitle: 'Capitales du monde',
    quizCoverImageUrl: 'assets/covers/geographie.svg',
    quizThemeColor: '#0f766e',
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    status: 'waiting',
    entryCode: `T${ownerId.slice(0, 5).toUpperCase()}`,
    currentQuestionIndex: 0,
    currentQuestionStatus: 'waiting',
    totalQuestions: 3,
    currentQuestionId: null,
    currentQuestionText: null,
    currentQuestionImageUrl: null,
    currentQuestionChoices: [],
    questionDurationSeconds: 20,
    currentQuestionStartedAt: null,
    currentQuestionEndsAt: null,
    answerCount: 0,
    revealedCorrectChoiceIndex: null,
    players: [
      {
        userId: ownerId,
        alias,
        score: 0,
        joinedAt: new Date(),
        totalAnswerTimeMs: 0,
        correctAnswers: 0,
      },
    ],
  };
}

async function main() {
  if (hasFlag('--help')) {
    printHelp();
    return;
  }

  const email = getArg('--email');
  const password = getArg('--password');
  const ownerId = getArg('--owner-id');
  const useCliAuth = hasFlag('--use-cli-auth');
  const alias = getArg('--alias') ?? email?.split('@')[0] ?? ownerId;
  const shouldRegister = hasFlag('--register');

  if (useCliAuth && !ownerId) {
    console.error('L option --owner-id est obligatoire avec --use-cli-auth.');
    process.exitCode = 1;
    return;
  }

  if ((!email || !password) && !useCliAuth) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  try {
    const user = useCliAuth
      ? {
        uid: ownerId,
        idToken: await getCliAccessToken(),
      }
      : await authenticate(email, password, alias, shouldRegister);

    await writeDocument(user.idToken, `users/${user.uid}`, { alias });

    const quizzes = buildQuizSeed(user.uid);
    validateQuizBank(quizzes);
    const game = buildGameSeed(user.uid, alias);

    for (const quiz of quizzes) {
      await writeDocument(user.idToken, `quizzes/${quiz.id}`, {
        ownerId: quiz.ownerId,
        title: quiz.title,
        description: quiz.description,
        coverImageUrl: quiz.coverImageUrl,
        themeColor: quiz.themeColor,
        estimatedDurationMinutes: quiz.estimatedDurationMinutes,
        questionsCount: quiz.questions.length,
      });

      for (const question of quiz.questions) {
        await writeDocument(
          user.idToken,
          `quizzes/${quiz.id}/questions/${question.id}`,
          {
            order: question.order,
            text: question.text,
            imageUrl: question.imageUrl,
            correctChoiceIndex: question.correctChoiceIndex,
            choices: question.choices,
          },
        );
      }
    }

    await writeDocument(user.idToken, `games/${game.id}`, {
      hostId: game.hostId,
      quizId: game.quizId,
      quizTitle: game.quizTitle,
      quizCoverImageUrl: game.quizCoverImageUrl,
      quizThemeColor: game.quizThemeColor,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      startedAt: game.startedAt,
      finishedAt: game.finishedAt,
      status: game.status,
      entryCode: game.entryCode,
      currentQuestionIndex: game.currentQuestionIndex,
      currentQuestionStatus: game.currentQuestionStatus,
      totalQuestions: game.totalQuestions,
      currentQuestionId: game.currentQuestionId,
      currentQuestionText: game.currentQuestionText,
      currentQuestionImageUrl: game.currentQuestionImageUrl,
      currentQuestionChoices: game.currentQuestionChoices,
      questionDurationSeconds: game.questionDurationSeconds,
      currentQuestionStartedAt: game.currentQuestionStartedAt,
      currentQuestionEndsAt: game.currentQuestionEndsAt,
      answerCount: game.answerCount,
      revealedCorrectChoiceIndex: game.revealedCorrectChoiceIndex,
    });

    await writeDocument(user.idToken, `gameCodes/${game.entryCode}`, {
      gameId: game.id,
      hostId: game.hostId,
      status: game.status,
    });

    for (const player of game.players) {
      await writeDocument(
        user.idToken,
        `games/${game.id}/players/${player.userId}`,
        {
          alias: player.alias,
          score: player.score,
          joinedAt: player.joinedAt,
          totalAnswerTimeMs: player.totalAnswerTimeMs,
          correctAnswers: player.correctAnswers,
        },
      );
    }

    console.log(`Connecte avec l UID : ${user.uid}`);
    console.log(`Document utilisateur cree/mis a jour : users/${user.uid}`);
    for (const quiz of quizzes) {
      console.log(`Quiz cree : quizzes/${quiz.id}`);
    }
    console.log(`Partie creee : games/${game.id}`);
    console.log(`Code de la partie : ${game.entryCode}`);
  } catch (error) {
    console.error('Echec lors de la creation des quiz et de la partie de demo.');
    console.error(error);
    process.exitCode = 1;
  }
}

await main();
