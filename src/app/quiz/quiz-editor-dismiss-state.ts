export interface QuizEditorDismissState {
  hasUnsavedChanges: () => boolean;
  hasPendingUploads: () => boolean;
}
