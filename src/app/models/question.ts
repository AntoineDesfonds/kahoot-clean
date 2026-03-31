import { Choice } from './choice';

export interface QuestionPrompt {
  id: string;
  order?: number;
  text: string;
  imageUrl: string;
  choices: Choice[];
}

export interface Question extends QuestionPrompt {
  correctChoiceIndex: number;
}
