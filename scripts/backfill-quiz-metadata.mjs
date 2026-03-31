import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ID = 'kahoot-fcbbc';
const TOKEN_STORE_PATH = join(
  homedir(),
  '.config',
  'configstore',
  'firebase-tools.json',
);

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-quiz-metadata.mjs [--dry-run]

Options:
  --dry-run   Calcule les corrections sans ecrire dans Firestore
`);
}

async function readTokenStore() {
  const raw = await readFile(TOKEN_STORE_PATH, 'utf8');
  return JSON.parse(raw);
}

async function getAccessToken() {
  const tokenStore = await readTokenStore();
  const tokens = tokenStore.tokens;

  if (!tokens?.refresh_token) {
    throw new Error(
      'Aucun refresh token Firebase CLI trouve dans ~/.config/configstore/firebase-tools.json',
    );
  }

  if (
    typeof tokens.access_token === 'string' &&
    typeof tokens.expires_at === 'number' &&
    tokens.expires_at > Date.now() + 60_000
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

async function firestoreRequest(path, accessToken, init = {}) {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    ...(init.headers ?? {}),
  };

  if (init.method && init.method !== 'GET') {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    {
      ...init,
      headers,
    },
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Firestore request failed for ${path}: ${body.error?.message ?? response.status}`,
    );
  }

  return body;
}

async function listDocuments(path, accessToken) {
  const documents = [];
  let pageToken;

  do {
    const query = new URLSearchParams({ pageSize: '200' });
    if (pageToken) {
      query.set('pageToken', pageToken);
    }

    const body = await firestoreRequest(
      `${path}?${query.toString()}`,
      accessToken,
      { method: 'GET' },
    );

    documents.push(...(body.documents ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);

  return documents;
}

function decodeInteger(field) {
  if (!field) {
    return null;
  }

  if (typeof field.integerValue === 'string') {
    return Number.parseInt(field.integerValue, 10);
  }

  if (typeof field.doubleValue === 'number') {
    return Math.trunc(field.doubleValue);
  }

  return null;
}

async function patchQuestionsCount(quizName, count, accessToken) {
  const mask = new URLSearchParams({ 'updateMask.fieldPaths': 'questionsCount' });
  const encodedName = quizName.replace(
    `projects/${PROJECT_ID}/databases/(default)/documents/`,
    '',
  );

  await firestoreRequest(`${encodedName}?${mask.toString()}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        questionsCount: {
          integerValue: String(count),
        },
      },
    }),
  });
}

async function main() {
  if (hasFlag('--help')) {
    printHelp();
    return;
  }

  const dryRun = hasFlag('--dry-run');
  const accessToken = await getAccessToken();
  const quizzes = await listDocuments('quizzes', accessToken);

  if (!quizzes.length) {
    console.log('Aucun quiz trouve.');
    return;
  }

  const updates = [];

  for (const quiz of quizzes) {
    const quizName = quiz.name;
    const quizId = quizName.split('/').pop();
    const existingCount = decodeInteger(quiz.fields?.questionsCount);
    const questions = await listDocuments(`quizzes/${quizId}/questions`, accessToken);
    const actualCount = questions.length;

    if (existingCount !== actualCount) {
      updates.push({
        quizId,
        existingCount,
        actualCount,
        quizName,
      });
    }
  }

  if (!updates.length) {
    console.log('questionsCount est deja coherent pour tous les quiz.');
    return;
  }

  console.log(
    `${updates.length} quiz necessitent une mise a jour de questionsCount.`,
  );

  for (const update of updates) {
    console.log(
      `- ${update.quizId}: ${update.existingCount ?? 'absent'} -> ${update.actualCount}`,
    );

    if (!dryRun) {
      await patchQuestionsCount(update.quizName, update.actualCount, accessToken);
    }
  }

  console.log(dryRun ? 'Dry run termine.' : 'Backfill termine.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
