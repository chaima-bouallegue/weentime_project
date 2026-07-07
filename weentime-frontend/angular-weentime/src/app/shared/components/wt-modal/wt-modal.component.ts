import { Component, EventEmitter, Input, Output, inject, OnInit, OnDestroy } from '@angular/core';
import { ModalService } from '@app/core/services/modal.service';

@Component({
  selector: 'wt-modal',
  standalone: true,
  template: `
    @if (isOpen()) {
      <!-- Backdrop -->
      <div class="wt-backdrop" (click)="onBackdropClick()"></div>
      
      <!-- Modal container -->
      <div class="wt-modal-container" role="dialog" 
           aria-modal="true" [attr.aria-label]="title">
        <div class="wt-modal-card" 
             (click)="$event.stopPropagation()"
             [class]="'wt-modal-card--' + size">
          <ng-content></ng-content>
        </div>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'close()'
  }
})
export class WtModalComponent implements OnInit, OnDestroy {
  @Input() title = '';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Output() closed = new EventEmitter<void>();
  
  private modalService = inject(ModalService);
  isOpen = this.modalService.isOpen;
  
  ngOnInit() {
    // Component initialization
  }

  open() { this.modalService.open(); }
  close() { this.modalService.close(); this.closed.emit(); }
  onBackdropClick() { this.close(); }
  
  ngOnDestroy() { this.modalService.close(); }
}
