import { Component, Input, Output, EventEmitter, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeTeletravailWorkflow } from '../../../../shared/models/workflow-teletravail.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';

@Component({
  selector: 'app-decision-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, DateFrPipe],
  templateUrl: './decision-modal.component.html',
  styleUrl: './decision-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DecisionModalComponent {
  @Input() demande: DemandeTeletravailWorkflow | null = null;
  @Input() mode: 'VALIDER' | 'REFUSER' | null = null;
  @Input() isSubmitting = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ id: number; commentaire: string }>();

  commentaire = signal('');

  get isValid(): boolean {
    if (this.mode === 'REFUSER') {
      return this.commentaire().trim().length >= 10;
    }
    return true;
  }

  onSubmit(): void {
    if (!this.demande || !this.isValid) return;
    this.confirm.emit({ id: this.demande.id, commentaire: this.commentaire().trim() });
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }

  updateCommentaire(value: string): void {
    this.commentaire.set(value);
  }
}
