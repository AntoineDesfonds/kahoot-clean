import {
  Component,
  DestroyRef,
  ElementRef,
  Input,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  applyEach,
  FormField,
  form,
  required,
  SchemaPathTree,
  validate,
} from '@angular/forms/signals';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonRadio,
  IonRadioGroup,
  IonRow,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronDownOutline,
  chevronUpOutline,
  cloudUploadOutline,
  copyOutline,
  removeOutline,
} from 'ionicons/icons';
import { Choice } from '../models/choice';
import { Question } from '../models/question';
import { Quiz } from '../models/quiz';
import {
  QUIZ_IMAGE_MAX_SIZE_BYTES,
  QUIZ_IMAGE_MAX_SOURCE_LENGTH,
  QuizImageUploadService,
} from '../services/quiz-image-upload.service';
import { QuizService } from '../services/quiz.service';
import { QuizEditorDismissState } from '../quiz/quiz-editor-dismiss-state';

const MAX_IMAGE_URL_LENGTH = QUIZ_IMAGE_MAX_SOURCE_LENGTH;

type QuizImageTarget =
  | { kind: 'cover' }
  | { kind: 'question'; questionId: string }
  | { kind: 'choice'; questionId: string; choiceIndex: number };

function ChoiceSchema(choice: SchemaPathTree<Choice>) {
  required(choice.text, { message: 'Le texte dune reponse est obligatoire.' });
  validate(choice.text, ({ value }) => {
    if ((value() ?? '').length > 120) {
      return {
        kind: 'choice-text-too-long',
        message: 'Le texte dune reponse doit rester inferieur a 120 caracteres.',
      };
    }

    return null;
  });
  validate(choice.imageUrl, ({ value }) => {
    const imageUrl = value() ?? '';
    if (imageUrl.length > MAX_IMAGE_URL_LENGTH) {
      return {
        kind: 'choice-image-too-long',
        message: 'L image est trop volumineuse pour etre enregistree.',
      };
    }

    return null;
  });
}

function QuestionSchema(question: SchemaPathTree<Question>) {
  required(question.text, { message: 'Le texte de la question est obligatoire.' });
  validate(question.text, ({ value }) => {
    if ((value() ?? '').length > 200) {
      return {
        kind: 'question-text-too-long',
        message: 'Le texte de la question doit rester inferieur a 200 caracteres.',
      };
    }

    return null;
  });
  validate(question.imageUrl, ({ value }) => {
    const imageUrl = value() ?? '';
    if (imageUrl.length > MAX_IMAGE_URL_LENGTH) {
      return {
        kind: 'image-too-long',
        message: 'L image est trop volumineuse pour etre enregistree.',
      };
    }

    return null;
  });
  validate(question.choices, ({ value }) => {
    if (value().length < 2) {
      return {
        kind: 'not-enough-choices',
        message: 'Ajoutez au moins deux reponses.',
      };
    }

    if (value().length > 6) {
      return {
        kind: 'too-many-choices',
        message: 'Utilisez au maximum six reponses.',
      };
    }

    return null;
  });
  validate(question.correctChoiceIndex, ({ value, valueOf }) => {
    if (!valueOf(question.choices)[value()]) {
      return {
        kind: 'no-correct-choice',
        message: 'Selectionnez une bonne reponse.',
      };
    }

    return null;
  });
  applyEach(question.choices, ChoiceSchema);
}

@Component({
  selector: 'create-quiz-modal',
  template: `
    <form id="createQuizForm" novalidate (submit)="confirm($event)">
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button color="medium" (click)="cancel()">Annuler</ion-button>
          </ion-buttons>
          <ion-title>{{ sourceQuiz() ? 'Modifier le quiz' : 'Nouveau quiz' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button
              type="submit"
              form="createQuizForm"
              [strong]="true"
              [disabled]="quizForm().invalid() || hasPendingUploads()"
            >
              Enregistrer
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content
        #builderContent
        class="ion-padding quiz-builder"
        [fullscreen]="true"
      >
        <section class="builder-panel">
          <div class="builder-panel__hero">
            <div>
              <p class="question-card__eyebrow">Configuration</p>
              <h2>{{ sourceQuiz() ? 'Mettez votre quiz a jour' : 'Construisez votre quiz' }}</h2>
              <p class="builder-panel__copy">
                Ajoutez vos questions, choisissez la bonne reponse et gardez un
                rythme court pour les parties en direct.
              </p>
            </div>

            <div class="builder-stats">
              <article class="builder-stat">
                <span>Questions</span>
                <strong>{{ draftQuiz().questions.length }}</strong>
              </article>
              <article class="builder-stat">
                <span>Reponses</span>
                <strong>{{ totalChoices() }}</strong>
              </article>
            </div>
          </div>

          @if (showValidationBanner()) {
            <p class="form-banner form-banner--warning">
              Completez le titre, la description et les reponses manquantes avant
              d enregistrer.
            </p>
          }

          @if (hasPendingUploads()) {
            <p class="builder-panel__status">
              Televersement en cours. Attendez la fin de l import avant
              d enregistrer le quiz.
            </p>
          }

          <ion-list lines="none">
            <ion-item>
              <ion-input
                aria-label="Titre du quiz"
                [formField]="quizForm.title"
                label="Titre"
                labelPlacement="stacked"
                placeholder="Ex: Les capitales d Europe"
                maxlength="80"
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-textarea
                [formField]="quizForm.description"
                label="Description"
                labelPlacement="stacked"
                placeholder="Presentez le niveau, le public et l objectif du quiz."
                autoGrow="true"
                maxlength="280"
              ></ion-textarea>
            </ion-item>
            <div class="media-panel">
              <div
                class="media-panel__preview"
                [class.media-panel__preview--empty]="!hasImage(draftQuiz().coverImageUrl)"
              >
                @if (hasImage(draftQuiz().coverImageUrl)) {
                  <div
                    class="media-panel__image"
                    [style.background-image]="questionPreview(draftQuiz().coverImageUrl)"
                  ></div>
                } @else {
                  <div class="media-panel__empty">
                    <strong>Aucune image de couverture</strong>
                    <span>
                      Ajoutez une image si vous voulez illustrer ce quiz. Ce
                      champ reste facultatif.
                    </span>
                  </div>
                }
              </div>

              <div class="media-panel__body">
                <div class="media-panel__header">
                  <div>
                    <p class="media-panel__title">Image de couverture</p>
                    <p class="media-panel__subtitle">
                      {{ imageStatusLabel(draftQuiz().coverImageUrl) }}
                    </p>
                  </div>

                  <div class="media-panel__actions">
                    @if (hasImage(draftQuiz().coverImageUrl)) {
                      <ion-button
                        type="button"
                        fill="clear"
                        color="medium"
                        (click)="removeImage({ kind: 'cover' })"
                      >
                        <ion-icon slot="start" name="remove-outline"></ion-icon>
                        Retirer
                      </ion-button>
                    }
                    <ion-button
                      type="button"
                      fill="outline"
                      color="dark"
                      [disabled]="hasPendingUploads()"
                      (click)="triggerImageSelection({ kind: 'cover' })"
                    >
                      <ion-icon slot="start" name="cloud-upload-outline"></ion-icon>
                      {{ addImageLabel(draftQuiz().coverImageUrl, coverUploadKey()) }}
                    </ion-button>
                  </div>
                </div>

                <ion-item>
                  <ion-input
                    aria-label="Image de couverture"
                    [formField]="quizForm.coverImageUrl"
                    label="Source de l image"
                    labelPlacement="stacked"
                    placeholder="https://... ou importez un fichier"
                  ></ion-input>
                </ion-item>
              </div>
            </div>
            <ion-item>
              <ion-input
                aria-label="Duree estimee"
                [formField]="quizForm.estimatedDurationMinutes"
                label="Duree estimee (minutes)"
                labelPlacement="stacked"
                type="number"
                inputmode="numeric"
                min="2"
                max="60"
                step="1"
              ></ion-input>
            </ion-item>
          </ion-list>

          @if (draftQuiz().questions.length > 1) {
            <div class="question-nav">
              @for (question of draftQuiz().questions; track question.id; let idx = $index) {
                <button
                  class="question-nav__item"
                  type="button"
                  (click)="scrollToQuestion(question.id)"
                >
                  <span>Q{{ idx + 1 }}</span>
                  <strong>{{ questionNavLabel(question, idx) }}</strong>
                </button>
              }
            </div>
          }
        </section>

        <ion-grid>
          <ion-row>
            @for (question of quizForm.questions; track $index; let idx = $index) {
              <ion-col size="12">
                <ion-card
                  class="question-card"
                  [attr.id]="questionSectionId(question().value().id)"
                >
                  <ion-card-header>
                    <div class="question-card__header">
                      <div>
                        <p class="question-card__eyebrow">Question {{ idx + 1 }}</p>
                        <p class="question-card__meta">
                          {{ questionMeta(question().value()) }}
                        </p>
                      </div>

                      <div class="question-card__actions">
                        <ion-button
                          type="button"
                          fill="clear"
                          color="medium"
                          [disabled]="idx === 0"
                          (click)="moveQuestion(question().value().id, -1)"
                        >
                          <ion-icon slot="icon-only" name="chevron-up-outline"></ion-icon>
                        </ion-button>
                        <ion-button
                          type="button"
                          fill="clear"
                          color="medium"
                          [disabled]="idx === draftQuiz().questions.length - 1"
                          (click)="moveQuestion(question().value().id, 1)"
                        >
                          <ion-icon slot="icon-only" name="chevron-down-outline"></ion-icon>
                        </ion-button>
                        <ion-button
                          type="button"
                          fill="clear"
                          color="medium"
                          (click)="duplicateQuestion(question().value().id)"
                        >
                          <ion-icon slot="icon-only" name="copy-outline"></ion-icon>
                        </ion-button>
                        @if (quizForm.questions().value().length > 1) {
                          <ion-button
                            type="button"
                            fill="clear"
                            color="medium"
                            (click)="removeQuestion(question().value().id)"
                          >
                            <ion-icon slot="icon-only" name="remove-outline"></ion-icon>
                          </ion-button>
                        }
                      </div>
                    </div>
                  </ion-card-header>

                  <ion-card-content>
                    <ion-item class="question-card__prompt">
                      <ion-textarea
                        aria-label="Texte de la question"
                        [formField]="question.text"
                        label="Question"
                        labelPlacement="stacked"
                        placeholder="Saisissez votre question"
                        autoGrow="true"
                        rows="3"
                        maxlength="200"
                      ></ion-textarea>
                    </ion-item>

                    <div class="media-panel media-panel--question">
                      <div
                        class="media-panel__preview"
                        [class.media-panel__preview--empty]="!hasImage(question().value().imageUrl)"
                      >
                        @if (hasImage(question().value().imageUrl)) {
                          <div
                            class="media-panel__image"
                            [style.background-image]="questionPreview(question().value().imageUrl)"
                          ></div>
                        } @else {
                          <div class="media-panel__empty">
                            <strong>Aucune image pour cette question</strong>
                            <span>
                              Ajoutez une illustration si elle aide à répondre.
                            </span>
                          </div>
                        }
                      </div>

                      <div class="media-panel__body">
                        <div class="media-panel__header">
                          <div>
                            <p class="media-panel__title">Image de la question</p>
                            <p class="media-panel__subtitle">
                              {{ imageStatusLabel(question().value().imageUrl) }}
                            </p>
                          </div>

                          <div class="media-panel__actions">
                            @if (hasImage(question().value().imageUrl)) {
                              <ion-button
                                type="button"
                                fill="clear"
                                color="medium"
                                (click)="removeImage({ kind: 'question', questionId: question().value().id })"
                              >
                                <ion-icon slot="start" name="remove-outline"></ion-icon>
                                Retirer
                              </ion-button>
                            }
                            <ion-button
                              type="button"
                              fill="outline"
                              color="dark"
                              [disabled]="hasPendingUploads()"
                              (click)="triggerImageSelection({ kind: 'question', questionId: question().value().id })"
                            >
                              <ion-icon slot="start" name="cloud-upload-outline"></ion-icon>
                              {{ addImageLabel(question().value().imageUrl, questionUploadKey(question().value().id)) }}
                            </ion-button>
                          </div>
                        </div>

                        <ion-item>
                          <ion-input
                            aria-label="Image de la question"
                            [formField]="question.imageUrl"
                            label="Source de l image"
                            labelPlacement="stacked"
                            placeholder="https://... ou importez un fichier"
                          ></ion-input>
                        </ion-item>
                      </div>
                    </div>

                    <ion-radio-group [formField]="question.correctChoiceIndex">
                      <ion-list lines="none">
                        <ion-item>
                          <ion-label>Reponses</ion-label>
                          <ion-label slot="end">Bonne reponse</ion-label>
                        </ion-item>
                      </ion-list>

                      <div class="choice-editor-list">
                        @for (
                          choice of question.choices;
                          track $index;
                          let choiceIndex = $index
                        ) {
                          <div
                            class="choice-editor"
                            [class.choice-editor--correct]="question().value().correctChoiceIndex === choiceIndex"
                          >
                            <div class="choice-editor__fields">
                              <ion-item>
                                <ion-input
                                  aria-label="Texte de la reponse"
                                  [formField]="choice.text"
                                  label="Texte de la reponse"
                                  labelPlacement="stacked"
                                  placeholder="Proposition"
                                  maxlength="120"
                                ></ion-input>
                              </ion-item>

                              <div class="media-panel media-panel--choice">
                                <div
                                  class="media-panel__preview media-panel__preview--compact"
                                  [class.media-panel__preview--empty]="!hasImage(question().value().choices[choiceIndex]?.imageUrl)"
                                >
                                  @if (hasImage(question().value().choices[choiceIndex]?.imageUrl)) {
                                    <div
                                      class="media-panel__image"
                                      [style.background-image]="questionPreview(question().value().choices[choiceIndex]?.imageUrl ?? '')"
                                    ></div>
                                  } @else {
                                    <div class="media-panel__empty">
                                      <strong>Aucune image</strong>
                                      <span>Option facultative pour cette réponse.</span>
                                    </div>
                                  }
                                </div>

                                <div class="media-panel__body">
                                  <div class="media-panel__header">
                                    <div>
                                      <p class="media-panel__title">Image de la reponse</p>
                                      <p class="media-panel__subtitle">
                                        {{ imageStatusLabel(question().value().choices[choiceIndex]?.imageUrl) }}
                                      </p>
                                    </div>

                                    <div class="media-panel__actions">
                                      @if (hasImage(question().value().choices[choiceIndex]?.imageUrl)) {
                                        <ion-button
                                          type="button"
                                          fill="clear"
                                          color="medium"
                                          (click)="removeImage({ kind: 'choice', questionId: question().value().id, choiceIndex })"
                                        >
                                          <ion-icon slot="start" name="remove-outline"></ion-icon>
                                          Retirer
                                        </ion-button>
                                      }
                                      <ion-button
                                        type="button"
                                        fill="outline"
                                        color="dark"
                                        [disabled]="hasPendingUploads()"
                                        (click)="triggerImageSelection({ kind: 'choice', questionId: question().value().id, choiceIndex })"
                                      >
                                        <ion-icon
                                          slot="start"
                                          name="cloud-upload-outline"
                                        ></ion-icon>
                                        {{ addImageLabel(question().value().choices[choiceIndex]?.imageUrl, choiceUploadKey(question().value().id, choiceIndex)) }}
                                      </ion-button>
                                    </div>
                                  </div>

                                  <ion-item>
                                    <ion-input
                                      aria-label="Image de la reponse"
                                      [formField]="choice.imageUrl"
                                      label="Source de l image"
                                      labelPlacement="stacked"
                                      placeholder="https://... ou importez un fichier"
                                    ></ion-input>
                                  </ion-item>
                                </div>
                              </div>
                            </div>

                            <div class="choice-editor__controls">
                              <ion-radio [value]="choiceIndex"></ion-radio>
                              <span class="choice-editor__hint">Bonne reponse</span>
                              @if (question().value().choices.length > 2) {
                                <ion-button
                                  type="button"
                                  fill="clear"
                                  color="medium"
                                  (click)="removeChoice(question().value().id, choiceIndex)"
                                >
                                  <ion-icon slot="icon-only" name="remove-outline"></ion-icon>
                                </ion-button>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    </ion-radio-group>

                    <ion-button
                      type="button"
                      fill="outline"
                      color="dark"
                      expand="block"
                      [disabled]="question().value().choices.length >= 6"
                      (click)="addChoice(question().value().id)"
                    >
                      <ion-icon slot="start" name="add-outline"></ion-icon>
                      Ajouter une reponse
                    </ion-button>
                  </ion-card-content>
                </ion-card>
              </ion-col>
            }
          </ion-row>
        </ion-grid>

        <ion-button
          type="button"
          expand="block"
          class="ion-margin-top"
          (click)="addQuestion()"
        >
          <ion-icon slot="start" name="add-outline"></ion-icon>
          Ajouter une question
        </ion-button>

        <input
          #imagePicker
          class="visually-hidden-input"
          type="file"
          accept="image/*"
          (change)="handleImageSelection($event)"
        />
      </ion-content>
    </form>
  `,
  styles: [
    `
      .quiz-builder {
        --background: var(--app-page-background);
      }

      ion-header ion-toolbar {
        --background: rgba(255, 255, 255, 0.88);
        --border-color: transparent;
        backdrop-filter: blur(24px);
      }

      .builder-panel {
        margin-bottom: 1rem;
        padding: 1rem;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.88);
        box-shadow: var(--app-shadow-soft);
      }

      .builder-panel__status {
        margin: 0 0 1rem;
        color: var(--app-text-muted);
        font-size: 0.92rem;
        font-weight: 700;
      }

      .question-card {
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: var(--app-shadow-soft);
      }

      .question-card__header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
      }

      .question-card__eyebrow {
        margin: 0 0 0.5rem;
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ion-color-medium);
      }

      .question-card__prompt {
        margin-bottom: 1rem;
      }

      .question-card__prompt ion-textarea {
        min-height: 110px;
      }

      .media-panel {
        display: grid;
        gap: 1rem;
        margin-bottom: 1rem;
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 24px;
        background: rgba(248, 250, 252, 0.72);
      }

      .media-panel__preview {
        min-height: 190px;
        border-radius: 20px;
        overflow: hidden;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.92);
      }

      .media-panel__preview--compact {
        min-height: 140px;
      }

      .media-panel__preview--empty {
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 38%),
          rgba(255, 255, 255, 0.92);
      }

      .media-panel__image {
        width: 100%;
        min-height: inherit;
        height: 100%;
        background-size: cover;
        background-position: center;
      }

      .media-panel__body {
        display: grid;
        gap: 0.85rem;
      }

      .media-panel__header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: start;
      }

      .media-panel__title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 800;
      }

      .media-panel__subtitle {
        margin: 0.25rem 0 0;
        color: var(--app-text-muted);
        font-size: 0.88rem;
      }

      .media-panel__actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      .media-panel__empty {
        display: grid;
        gap: 0.35rem;
        max-width: 22rem;
        padding: 1rem;
        text-align: center;
      }

      .media-panel__empty strong {
        font-size: 1rem;
      }

      .media-panel__empty span {
        color: var(--app-text-muted);
        line-height: 1.55;
      }

      .choice-editor-list {
        display: grid;
        gap: 0.9rem;
        margin-bottom: 1rem;
      }

      .choice-editor {
        display: grid;
        gap: 0.9rem;
        padding: 0.9rem;
        border: 1px solid rgba(148, 163, 184, 0.16);
        border-radius: 20px;
        background: rgba(248, 250, 252, 0.7);
      }

      .choice-editor--correct {
        border-color: rgba(15, 118, 110, 0.22);
        background: rgba(240, 253, 250, 0.92);
      }

      .choice-editor__fields {
        display: grid;
        gap: 0.75rem;
      }

      .choice-editor__controls {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.4rem;
      }

      .choice-editor__hint {
        color: var(--app-text-muted);
        font-size: 0.84rem;
        font-weight: 700;
      }

      .visually-hidden-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 767px) {
        .question-card__header {
          flex-direction: column;
        }

        .media-panel__header {
          flex-direction: column;
        }

        .choice-editor__controls {
          justify-content: space-between;
        }
      }

      @media (min-width: 768px) {
        .media-panel {
          grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
          align-items: start;
        }

        .media-panel--choice {
          grid-template-columns: minmax(180px, 220px) minmax(0, 1fr);
        }

        .choice-editor {
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
        }

        .choice-editor__controls {
          flex-direction: column;
          justify-content: flex-start;
          padding-top: 0.5rem;
        }
      }
    `,
  ],
  imports: [
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonRadio,
    IonRadioGroup,
    IonRow,
    IonTextarea,
    IonTitle,
    IonToolbar,
    FormField,
  ],
})
export class CreateQuizModal {
  private readonly modalCtrl = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly quizService = inject(QuizService);
  private readonly quizImageUploadService = inject(QuizImageUploadService);
  private readonly destroyRef = inject(DestroyRef);

  readonly sourceQuiz = signal<Quiz | undefined>(undefined);
  private readonly editorDismissState = signal<QuizEditorDismissState | undefined>(
    undefined,
  );
  readonly saveAttempted = signal(false);
  readonly builderContent = viewChild<ElementRef<HTMLIonContentElement>>('builderContent');
  readonly imagePicker = viewChild.required<ElementRef<HTMLInputElement>>('imagePicker');
  readonly uploadingTargets = signal<Record<string, boolean>>({});
  readonly draftQuiz = signal(this.quizService.generateQuiz());
  readonly hasPendingUploads = computed(() =>
    Object.values(this.uploadingTargets()).some(Boolean),
  );
  readonly hasUnsavedChanges = computed(() => this.quizForm().dirty());

  private pendingUploadTarget: QuizImageTarget | null = null;

  @Input()
  set quiz(value: Quiz | undefined) {
    this.sourceQuiz.set(value);
    this.resetDraftQuiz(value);
  }

  @Input()
  set dismissState(value: QuizEditorDismissState | undefined) {
    this.editorDismissState.set(value);
  }

  readonly quizForm = form(this.draftQuiz, (schemaPath) => {
    required(schemaPath.title, { message: 'Le titre est obligatoire.' });
    validate(schemaPath.title, ({ value }) => {
      if ((value() ?? '').length > 80) {
        return {
          kind: 'quiz-title-too-long',
          message: 'Le titre doit rester inferieur a 80 caracteres.',
        };
      }

      return null;
    });
    required(schemaPath.description, {
      message: 'La description est obligatoire.',
    });
    validate(schemaPath.description, ({ value }) => {
      if ((value() ?? '').length > 280) {
        return {
          kind: 'quiz-description-too-long',
          message: 'La description doit rester inferieure a 280 caracteres.',
        };
      }

      return null;
    });
    validate(schemaPath.coverImageUrl, ({ value }) => {
      const imageUrl = value() ?? '';
      if (imageUrl.length > MAX_IMAGE_URL_LENGTH) {
        return {
          kind: 'cover-image-too-long',
          message: 'L image est trop volumineuse pour etre enregistree.',
        };
      }

      return null;
    });
    validate(schemaPath.estimatedDurationMinutes, ({ value }) => {
      const duration = Number(value());
      if (!Number.isInteger(duration) || duration < 2 || duration > 60) {
        return {
          kind: 'invalid-estimated-duration',
          message: 'La duree doit etre un nombre entier entre 2 et 60.',
        };
      }

      return null;
    });
    applyEach(schemaPath.questions, QuestionSchema);
  });

  constructor() {
    addIcons({
      addOutline,
      chevronDownOutline,
      chevronUpOutline,
      cloudUploadOutline,
      copyOutline,
      removeOutline,
    });

    effect(() => {
      const dismissState = this.editorDismissState();
      if (!dismissState) {
        return;
      }

      dismissState.hasUnsavedChanges = () => this.hasUnsavedChanges();
      dismissState.hasPendingUploads = () => this.hasPendingUploads();
    });

    effect(() => {
      this.builderContent();
      if (!this.sourceQuiz()) {
        return;
      }

      this.scheduleContentRecalculation();
    });

    const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
      if (!this.hasUnsavedChanges()) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', beforeUnloadHandler);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
      });
    }
  }

  addQuestion() {
    const newQuestionId = this.quizService.generateQuestionId(this.draftQuiz().id);
    const newQuestion: Question = {
      id: newQuestionId,
      order: this.draftQuiz().questions.length,
      text: '',
      imageUrl: '',
      choices: [
        { text: '', imageUrl: '' },
        { text: '', imageUrl: '' },
      ],
      correctChoiceIndex: 0,
    };

    this.draftQuiz.update((quiz) => ({
      ...quiz,
      questions: [...quiz.questions, newQuestion],
    }));
    this.quizForm().markAsDirty();

    globalThis.setTimeout(() => {
      this.scrollToQuestion(newQuestionId);
    }, 0);
  }

  removeQuestion(questionId: string) {
    this.draftQuiz.update((quiz) => ({
      ...quiz,
      questions: quiz.questions
        .filter((question) => question.id !== questionId)
        .map((question, index) => ({
          ...question,
          order: index,
        })),
    }));
    this.quizForm().markAsDirty();
  }

  duplicateQuestion(questionId: string) {
    const sourceQuestion = this.draftQuiz().questions.find(
      (question) => question.id === questionId,
    );
    if (!sourceQuestion) {
      return;
    }

    const duplicatedQuestionId = this.quizService.generateQuestionId(
      this.draftQuiz().id,
    );
    const duplicatedQuestion: Question = {
      ...sourceQuestion,
      id: duplicatedQuestionId,
      choices: sourceQuestion.choices.map((choice) => ({
        text: choice.text,
        imageUrl: choice.imageUrl,
      })),
    };

    this.draftQuiz.update((quiz) => {
      const sourceIndex = quiz.questions.findIndex(
        (question) => question.id === questionId,
      );
      if (sourceIndex < 0) {
        return quiz;
      }

      const nextQuestions = [...quiz.questions];
      nextQuestions.splice(sourceIndex + 1, 0, duplicatedQuestion);

      return {
        ...quiz,
        questions: nextQuestions.map((question, index) => ({
          ...question,
          order: index,
        })),
      };
    });
    this.quizForm().markAsDirty();

    globalThis.setTimeout(() => {
      this.scrollToQuestion(duplicatedQuestionId);
    }, 0);
  }

  moveQuestion(questionId: string, direction: -1 | 1) {
    this.draftQuiz.update((quiz) => {
      const sourceIndex = quiz.questions.findIndex(
        (question) => question.id === questionId,
      );
      const targetIndex = sourceIndex + direction;
      if (
        sourceIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= quiz.questions.length
      ) {
        return quiz;
      }

      const nextQuestions = [...quiz.questions];
      const [question] = nextQuestions.splice(sourceIndex, 1);
      nextQuestions.splice(targetIndex, 0, question);

      return {
        ...quiz,
        questions: nextQuestions.map((entry, index) => ({
          ...entry,
          order: index,
        })),
      };
    });
    this.quizForm().markAsDirty();

    globalThis.setTimeout(() => {
      this.scrollToQuestion(questionId);
    }, 0);
  }

  addChoice(questionId: string) {
    this.draftQuiz.update((quiz) => ({
      ...quiz,
      questions: quiz.questions.map((question) => {
        if (question.id !== questionId) {
          return question;
        }

        if (question.choices.length >= 6) {
          return question;
        }

        return {
          ...question,
          choices: [...question.choices, { text: '', imageUrl: '' }],
        };
      }),
    }));
    this.quizForm().markAsDirty();
  }

  removeChoice(questionId: string, choiceIndex: number) {
    this.draftQuiz.update((quiz) => ({
      ...quiz,
      questions: quiz.questions.map((question) => {
        if (question.id !== questionId || question.choices.length <= 2) {
          return question;
        }

        const updatedChoices = question.choices.filter(
          (_, index) => index !== choiceIndex,
        );

        return {
          ...question,
          choices: updatedChoices,
          correctChoiceIndex:
            question.correctChoiceIndex === choiceIndex
              ? 0
              : Math.min(question.correctChoiceIndex, updatedChoices.length - 1),
        };
      }),
    }));
    this.quizForm().markAsDirty();
  }

  cancel() {
    this.modalCtrl.dismiss(undefined, 'cancel');
  }

  confirm(event: Event) {
    event.preventDefault();
    this.saveAttempted.set(true);
    if (this.quizForm().invalid() || this.hasPendingUploads()) {
      return;
    }

    const quiz = this.quizForm().value();
    this.modalCtrl.dismiss(
      {
        ...quiz,
        estimatedDurationMinutes: this.normalizeDuration(
          quiz.estimatedDurationMinutes,
        ),
      },
      'save',
    );
  }

  private normalizeDuration(value: number) {
    return Math.min(60, Math.max(2, Math.round(Number(value) || 0)));
  }

  private resetDraftQuiz(quiz: Quiz | undefined) {
    this.draftQuiz.set(this.quizService.createEditorDraft(quiz));
    this.quizForm().reset();
  }

  private scheduleContentRecalculation() {
    const content = this.builderContent()?.nativeElement;
    if (!content) {
      return;
    }

    globalThis.setTimeout(() => {
      void content.recalculateDimensions?.();
    }, 0);
  }

  coverUploadKey() {
    return 'cover';
  }

  questionUploadKey(questionId: string) {
    return `question:${questionId}`;
  }

  choiceUploadKey(questionId: string, choiceIndex: number) {
    return `choice:${questionId}:${choiceIndex}`;
  }

  isUploading(uploadKey: string) {
    return !!this.uploadingTargets()[uploadKey];
  }

  triggerImageSelection(target: QuizImageTarget) {
    if (this.hasPendingUploads()) {
      return;
    }

    this.pendingUploadTarget = target;
    const input = this.imagePicker().nativeElement;
    input.value = '';
    input.click();
  }

  async handleImageSelection(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    const target = this.pendingUploadTarget;
    this.pendingUploadTarget = null;

    if (input) {
      input.value = '';
    }

    if (!file || !target) {
      return;
    }

    const uploadKey = this.uploadKey(target);
    this.setUploadState(uploadKey, true);

    try {
      const imageUrl = await this.quizImageUploadService.uploadImage({
        file,
        quizId: this.draftQuiz().id,
        kind: target.kind,
        questionId: target.kind === 'cover' ? undefined : target.questionId,
        choiceIndex: target.kind === 'choice' ? target.choiceIndex : undefined,
      });

      this.applyUploadedImage(target, imageUrl);
      this.quizForm().markAsDirty();
    } catch (error) {
      const fallbackMessage = `Impossible d importer l image. Utilisez un fichier image inferieur a ${Math.round(QUIZ_IMAGE_MAX_SIZE_BYTES / (1024 * 1024))} Mo.`;
      await this.presentToast(
        error instanceof Error && error.message.trim()
          ? error.message
          : fallbackMessage,
      );
    } finally {
      this.setUploadState(uploadKey, false);
    }
  }

  questionPreview(imageUrl: string) {
    const source = imageUrl.trim() || 'assets/shapes.svg';
    return `linear-gradient(135deg, rgba(15, 23, 42, 0.08), rgba(15, 118, 110, 0.08)), url('${source}')`;
  }

  questionSectionId(questionId: string) {
    return `question-section-${questionId}`;
  }

  questionNavLabel(question: Question, index: number) {
    const label = question.text.trim();
    if (label) {
      return label;
    }

    return index === 0 ? 'Question de depart' : 'Question a completer';
  }

  questionMeta(question: Question) {
    const answerCount = question.choices.length;
    return `${answerCount} reponse${answerCount > 1 ? 's' : ''}`;
  }

  hasImage(imageUrl: string | null | undefined) {
    return !!imageUrl?.trim();
  }

  imageStatusLabel(imageUrl: string | null | undefined) {
    return this.hasImage(imageUrl) ? 'Image ajoutée' : 'Aucune image';
  }

  addImageLabel(imageUrl: string | null | undefined, uploadKey: string) {
    if (this.isUploading(uploadKey)) {
      return 'Televersement...';
    }

    return this.hasImage(imageUrl) ? 'Remplacer l image' : 'Ajouter une image';
  }

  removeImage(target: QuizImageTarget) {
    this.applyUploadedImage(target, '');
    this.quizForm().markAsDirty();
  }

  totalChoices() {
    return this.draftQuiz().questions.reduce(
      (total, question) => total + question.choices.length,
      0,
    );
  }

  showValidationBanner() {
    return this.quizForm().invalid() && (this.quizForm().dirty() || this.saveAttempted());
  }

  scrollToQuestion(questionId: string) {
    const section = globalThis.document.getElementById(
      this.questionSectionId(questionId),
    );
    section?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  private uploadKey(target: QuizImageTarget) {
    if (target.kind === 'cover') {
      return this.coverUploadKey();
    }

    if (target.kind === 'question') {
      return this.questionUploadKey(target.questionId);
    }

    return this.choiceUploadKey(target.questionId, target.choiceIndex);
  }

  private setUploadState(uploadKey: string, active: boolean) {
    this.uploadingTargets.update((state) => ({
      ...state,
      [uploadKey]: active,
    }));
  }

  private applyUploadedImage(target: QuizImageTarget, imageUrl: string) {
    this.draftQuiz.update((quiz) => {
      if (target.kind === 'cover') {
        return {
          ...quiz,
          coverImageUrl: imageUrl,
        };
      }

      return {
        ...quiz,
        questions: quiz.questions.map((question) => {
          if (question.id !== target.questionId) {
            return question;
          }

          if (target.kind === 'question') {
            return {
              ...question,
              imageUrl,
            };
          }

          return {
            ...question,
            choices: question.choices.map((choice, index) =>
              index === target.choiceIndex
                ? {
                  ...choice,
                  imageUrl,
                }
                : choice,
            ),
          };
        }),
      };
    });
  }

  private async presentToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2800,
      position: 'top',
      color: 'dark',
    });

    await toast.present();
  }
}
