import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModalService {
  private _isOpen = signal(false);
  isOpen = this._isOpen.asReadonly();

  open() {
    this._isOpen.set(true);
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this._isOpen.set(false);
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  }
}
