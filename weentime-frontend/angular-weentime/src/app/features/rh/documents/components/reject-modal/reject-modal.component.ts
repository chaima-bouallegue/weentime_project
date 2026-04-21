import { Component, Input, Output, EventEmitter, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH } from '../../models/rh-document.model';

@Component({
  selector: 'app-reject-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './reject-modal.component.html',
  styleUrl: './reject-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RejectModalComponent {
  @Input({ required: true }) demande: DemandeDocumentRH | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ id: number, reason: string }>();

  reason = signal<string>('');
  isRejecting = signal<boolean>(false);

  isValid = computed(() => this.reason().trim().length >= 20);

  onConfirm() {
    if (this.demande && this.isValid()) {
      this.isRejecting.set(true);
      this.confirm.emit({ id: this.demande.id, reason: this.reason().trim() });
    }
  }
}
