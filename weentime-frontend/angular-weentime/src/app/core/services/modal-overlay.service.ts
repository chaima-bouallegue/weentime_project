import { Injectable } from '@angular/core';

/**
 * Toggles `body.modal-open` for global layout dimming (see styles/_modals.scss).
 * Reference-counted so nested modals work correctly.
 */
@Injectable({ providedIn: 'root' })
export class ModalOverlayService {
  private openCount = 0;

  open(): void {
    this.openCount++;
    if (this.openCount === 1) {
      document.body.classList.add('modal-open');
    }
  }

  close(): void {
    if (this.openCount <= 0) {
      return;
    }
    this.openCount--;
    if (this.openCount === 0) {
      document.body.classList.remove('modal-open');
    }
  }

  forceClose(): void {
    this.openCount = 0;
    document.body.classList.remove('modal-open');
  }
}
