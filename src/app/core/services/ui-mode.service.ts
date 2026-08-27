import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiModeService {
  private readonly _editorMode = signal<boolean>(true);
  readonly editorMode = this._editorMode.asReadonly();
  readonly readOnlyMode = computed(() => !this._editorMode());

  toggle(): void {
    this._editorMode.update((v) => !v);
  }
}
