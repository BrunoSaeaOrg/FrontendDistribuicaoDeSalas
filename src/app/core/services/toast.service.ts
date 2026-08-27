import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'warning' | 'danger' | 'info';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

let nextId = 0;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastMessage[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(tone: ToastTone, title: string, description?: string): void {
    const id = 't' + Date.now() + '-' + nextId++;
    this._toasts.update((list) => [...list, { id, tone, title, description }]);
    setTimeout(() => this.dismiss(id), 4000);
  }

  success(title: string, description?: string): void {
    this.show('success', title, description);
  }
  info(title: string, description?: string): void {
    this.show('info', title, description);
  }
  warning(title: string, description?: string): void {
    this.show('warning', title, description);
  }
  danger(title: string, description?: string): void {
    this.show('danger', title, description);
  }

  dismiss(id: string): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
