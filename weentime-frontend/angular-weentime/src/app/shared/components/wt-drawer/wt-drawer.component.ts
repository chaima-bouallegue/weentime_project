import { Component, EventEmitter, Output, inject, OnDestroy } from '@angular/core';
import { ModalService } from '@app/core/services/modal.service';

@Component({
  selector: 'wt-drawer',
  standalone: true,
  template: `
    @if (isOpen()) {
      <div class="wt-backdrop" (click)="close()"></div>
      <div class="wt-drawer-panel" (click)="$event.stopPropagation()">
        <ng-content></ng-content>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'close()'
  }
})
export class WtDrawerComponent implements OnDestroy {
  @Output() closed = new EventEmitter<void>();
  
  private modalService = inject(ModalService);
  isOpen = this.modalService.isOpen;
  
  open() { this.modalService.open(); }
  close() { this.modalService.close(); this.closed.emit(); }
  
  ngOnDestroy() { this.modalService.close(); }
}
