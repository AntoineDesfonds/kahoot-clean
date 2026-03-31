import { inject, Injectable } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';

interface ConfirmOptions {
  header: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmRole?: 'confirm' | 'destructive';
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmService {
  private readonly alertController = inject(AlertController);

  async confirm(options: ConfirmOptions): Promise<boolean> {
    const alert = await this.alertController.create({
      header: options.header,
      message: options.message,
      buttons: [
        {
          role: 'cancel',
          text: options.cancelText ?? 'Annuler',
        },
        {
          role: 'confirm',
          text: options.confirmText ?? 'Confirmer',
          cssClass:
            options.confirmRole === 'destructive'
              ? 'confirm-alert__button--danger'
              : undefined,
        },
      ],
      cssClass: 'confirm-alert',
    });

    await alert.present();
    const { role } = await alert.onDidDismiss();

    return role === 'confirm';
  }
}
