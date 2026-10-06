import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalService {
  private _isOpen = signal(false);
  isOpen = this._isOpen.asReadonly();

  /** Track how many modals are currently open */
  private _openCount = 0;

  open() {
    this._openCount++;
    this._isOpen.set(true);
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this._openCount = Math.max(0, this._openCount - 1);
    if (this._openCount === 0) {
      this._isOpen.set(false);
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    }
  }

  /** Force close all modals — resets counter and clears class */
  forceClose() {
    this._openCount = 0;
    this._isOpen.set(false);
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  }
}
