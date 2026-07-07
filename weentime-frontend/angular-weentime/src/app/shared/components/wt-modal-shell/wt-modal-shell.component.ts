import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject
} from '@angular/core';
import { ModalOverlayService } from '../../../core/services/modal-overlay.service';
import { ModalFocusTrapDirective } from '../../directives/modal-focus-trap.directive';

@Component({
  selector: 'app-wt-modal-shell',
  standalone: true,
  imports: [ModalFocusTrapDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick()" aria-hidden="true"></div>
    <div class="modal-container">
      <div
        class="modal-card"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="labelledBy"
        appModalFocusTrap
        (click)="$event.stopPropagation()">
        <ng-content></ng-content>
      </div>
    </div>
  `
})
export class WtModalShellComponent implements OnInit, OnDestroy {
  private readonly overlay = inject(ModalOverlayService);

  @Input() labelledBy: string | null = null;
  @Input() closeOnBackdrop = true;
  @Input() closeOnEscape = true;

  @Output() closed = new EventEmitter<void>();

  ngOnInit(): void {
    this.overlay.open();
  }

  ngOnDestroy(): void {
    this.overlay.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.closeOnEscape) {
      this.closed.emit();
    }
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.closed.emit();
    }
  }
}
