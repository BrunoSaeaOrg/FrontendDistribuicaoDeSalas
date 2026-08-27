import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  constructor(private readonly dialog: MatDialog) {}

  async confirm(data: ConfirmDialogData): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data,
      panelClass: 'saea-confirm-dialog-panel',
      backdropClass: 'saea-dialog-backdrop',
      autoFocus: false,
      width: '360px',
      maxWidth: '90vw',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return !!result;
  }
}
