import { Injectable, inject } from '@angular/core';
import { ModalService } from './modal.service';

/**
 * Toggles `body.modal-open` for global layout dimming.
 * Delegates to ModalService as the unified single source of truth with reference counting.
 */
@Injectable({ providedIn: 'root' })
export class ModalOverlayService {
  private readonly modalService = inject(ModalService);

  open(): void {
    this.modalService.open();
  }

  close(): void {
    this.modalService.close();
  }

  forceClose(): void {
    this.modalService.forceClose();
  }
}
