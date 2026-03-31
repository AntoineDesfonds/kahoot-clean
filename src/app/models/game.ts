import { Choice } from './choice';

export interface GamePlayer {
  userId: string;
  alias: string;
  score: number;
  joinedAt: Date;
  totalAnswerTimeMs?: number;
  correctAnswers?: number;
  currentQuestionIndex?: number;
  currentQuestionStartedAt?: Date | null;
  finishedAt?: Date | null;
}

export interface GameResponse {
  id: string;
  playerId: string;
  questionId?: string;
  questionIndex: number;
  selectedChoiceIndex: number;
  answeredAt: Date;
  scored: boolean;
  isCorrect?: boolean | null;
  responseTimeMs?: number | null;
}

export type GameStatus = 'waiting' | 'in-progress' | 'finished';
export type CurrentQuestionStatus = 'waiting' | 'in-progress' | 'review';

export interface Game {
  id: string;
  hostId: string;
  quizId: string;
  quizTitle: string;
  quizCoverImageUrl: string;
  quizThemeColor: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: GameStatus;
  entryCode: string;
  currentQuestionIndex: number;
  currentQuestionStatus: CurrentQuestionStatus;
  totalQuestions: number;
  currentQuestionId: string | null;
  currentQuestionText: string | null;
  currentQuestionImageUrl: string | null;
  currentQuestionChoices: Choice[];
  questionDurationSeconds?: number;
  currentQuestionStartedAt?: Date | null;
  currentQuestionEndsAt?: Date | null;
  answerCount: number;
  revealedCorrectChoiceIndex: number | null;
}

export interface CreatedGameSession {
  gameId: string;
  entryCode: string;
}

export interface JoinedGameSession {
  gameId: string;
  entryCode: string;
  status: GameStatus;
}
