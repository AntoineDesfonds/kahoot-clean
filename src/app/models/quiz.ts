import { Question } from './question';

export interface Quiz {
  id: string;
  ownerId?: string;
  title: string;
  description: string;
  coverImageUrl: string;
  themeColor: string;
  estimatedDurationMinutes: number;
  questions: Question[];
  questionsCount?: number;
}
