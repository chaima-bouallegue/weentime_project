import { Component, Input, Output, EventEmitter, signal, ChangeDetectionStrategy, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  AlertTriangle,
  FileText,
  Shield,
  CheckCircle,
  XCircle,
  X,
  Clock,
  Loader2
} from 'lucide-angular';
import { ModalService } from '../../../../../core/services/modal.service';
import { DemandeTeletravailWorkflow } from '../../../../shared/models/workflow-teletravail.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';

@Component({
  selector: 'app-decision-rh-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, DateFrPipe],
  templateUrl: './decision-rh-modal.component.html',
  styleUrl: './decision-rh-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DecisionRhModalComponent implements OnInit, OnDestroy {
  private readonly modalService = inject(ModalService);

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }
  readonly AlertTriangleIcon = AlertTriangle;
  readonly FileTextIcon = FileText;
  readonly ShieldIcon = Shield;
  readonly CheckCircleIcon = CheckCircle;
  readonly XCircleIcon = XCircle;
  readonly XIcon = X;
  readonly ClockIcon = Clock;
  readonly Loader2Icon = Loader2;
  @Input() demande: DemandeTeletravailWorkflow | null = null;
  @Input() mode: 'VALIDER' | 'REFUSER' | 'CONSULTER' | null = null;
  @Input() isSubmitting = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<{ id: number; commentaire: string }>();
  @Output() switchMode = new EventEmitter<'VALIDER' | 'REFUSER'>();

  commentaire = signal('');

  get isValid(): boolean {
    if (this.mode === 'REFUSER') return this.commentaire().trim().length >= 10;
    return true;
  }

  onSubmit(): void {
    if (!this.demande || !this.isValid || this.mode === 'CONSULTER') return;
    this.confirm.emit({ id: this.demande.id, commentaire: this.commentaire().trim() });
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) this.close.emit();
  }

  updateCommentaire(value: string): void {
    this.commentaire.set(value);
  }
}
