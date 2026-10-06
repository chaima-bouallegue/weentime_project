import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation, HostListener, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, AlertTriangle, Trash2, X, Loader2 } from 'lucide-angular';
import { ModalService } from '@app/core/services/modal.service';

export interface CancellationPreviewItem {
  label: string;
  value: string | number;
  highlight?: boolean;
}

@Component({
  selector: 'app-confirm-cancellation-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './confirm-cancellation-modal.component.html',
  styleUrl: './confirm-cancellation-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ConfirmCancellationModalComponent implements OnInit, OnDestroy {
  private readonly modalService = inject(ModalService);

  @Input() title = "Confirmer l'annulation";
  @Input() message = "Êtes-vous sûr de vouloir annuler cette demande ?";
  @Input() subMessage = "Cette action est irréversible.";
  @Input() previewItems: CancellationPreviewItem[] = [];
  @Input() isCancelling = false;
  @Input() confirmText = "Confirmer l'annulation";
  @Input() cancelText = "Conserver";

  @Output() confirm = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }

  readonly iconAlert = AlertTriangle;
  readonly iconTrash = Trash2;
  readonly iconX = X;
  readonly iconLoader = Loader2;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isCancelling) {
      this.close.emit();
    }
  }

  onBackdropClick(): void {
    if (!this.isCancelling) {
      this.close.emit();
    }
  }

  onConfirmClick(): void {
    if (!this.isCancelling) {
      this.confirm.emit();
    }
  }
}
