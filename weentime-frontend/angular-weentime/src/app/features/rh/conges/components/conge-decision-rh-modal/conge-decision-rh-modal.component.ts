import { Component, Input, Output, EventEmitter, signal, ChangeDetectionStrategy, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, AlertTriangle, Loader2 } from 'lucide-angular';
import { DemandeConge } from '../../../../employee/conges/models/conge.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';
import { ModalService } from '@app/core/services/modal.service';

@Component({
  selector: 'app-conge-decision-rh-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, DateFrPipe],
  templateUrl: './conge-decision-rh-modal.component.html',
  styleUrl: './conge-decision-rh-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CongeDecisionRhModalComponent implements OnInit, OnDestroy {
  readonly iconAlert = AlertTriangle;
  readonly iconLoader = Loader2;
  private readonly modalService = inject(ModalService);

  @Input() demande: DemandeConge | null = null;
  @Input() mode: 'VALIDER' | 'REFUSER' | null = null;
  @Input() isSubmitting = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ id: number; commentaire: string }>();

  readonly commentaire = signal('');

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }

  get isValid(): boolean {
    if (this.mode === 'REFUSER') {
      return this.commentaire().trim().length >= 10;
    }
    return true;
  }

  onSubmit(): void {
    if (!this.demande || !this.isValid) {
      return;
    }
    this.confirm.emit({ id: this.demande.id, commentaire: this.commentaire().trim() });
  }

  updateCommentaire(value: string): void {
    this.commentaire.set(value);
  }
}
