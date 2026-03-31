import { Injectable } from '@angular/core';

export const QUIZ_IMAGE_MAX_SIZE_BYTES = 8 * 1024 * 1024;
export const QUIZ_IMAGE_MAX_SOURCE_LENGTH = 120_000;

interface UploadQuizImageInput {
  file: File;
  quizId: string;
  kind: 'cover' | 'question' | 'choice';
  questionId?: string;
  choiceIndex?: number;
}

@Injectable({
  providedIn: 'root',
})
export class QuizImageUploadService {
  async uploadImage(input: UploadQuizImageInput): Promise<string> {
    this.validateFile(input.file);

    const source = await this.readAsDataUrl(input.file);
    if (source.length <= QUIZ_IMAGE_MAX_SOURCE_LENGTH) {
      return source;
    }

    const image = await this.loadImage(source);
    const sizeSteps = [1280, 1024, 896, 768, 640];
    const qualitySteps = [0.82, 0.72, 0.62, 0.52];

    for (const maxDimension of sizeSteps) {
      const { width, height } = this.scaledDimensions(
        image.naturalWidth,
        image.naturalHeight,
        maxDimension,
      );
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Impossible de preparer limage pour lenregistrement.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const optimizedSource = this.serializeCanvas(canvas, quality);
        if (optimizedSource.length <= QUIZ_IMAGE_MAX_SOURCE_LENGTH) {
          return optimizedSource;
        }
      }
    }

    throw new Error(
      'L image reste trop volumineuse meme apres compression. Essayez une image plus legere.',
    );
  }

  private validateFile(file: File) {
    if (!file.type.startsWith('image/')) {
      throw new Error('Choisissez un fichier image valide.');
    }

    if (file.size > QUIZ_IMAGE_MAX_SIZE_BYTES) {
      throw new Error('L image depasse la limite de 8 Mo.');
    }
  }

  private async readAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Impossible de lire limage selectionnee.'));
      });
      reader.addEventListener('error', () => {
        reject(new Error('Impossible de lire limage selectionnee.'));
      });
      reader.readAsDataURL(file);
    });
  }

  private async loadImage(source: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', () => {
        reject(new Error('Impossible de traiter limage selectionnee.'));
      });
      image.src = source;
    });
  }

  private scaledDimensions(
    width: number,
    height: number,
    maxDimension: number,
  ) {
    const largestSide = Math.max(width, height);
    if (!largestSide || largestSide <= maxDimension) {
      return { width, height };
    }

    const ratio = maxDimension / largestSide;

    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  }

  private serializeCanvas(canvas: HTMLCanvasElement, quality: number) {
    const webpSource = canvas.toDataURL('image/webp', quality);
    if (webpSource.startsWith('data:image/webp')) {
      return webpSource;
    }

    return canvas.toDataURL('image/jpeg', quality);
  }
}
