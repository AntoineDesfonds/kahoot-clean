import { Choice } from './choice';

export interface GameQuestion {
  id: string;
  order?: number;
  text: string;
  imageUrl: string;
  choices: Choice[];
}
