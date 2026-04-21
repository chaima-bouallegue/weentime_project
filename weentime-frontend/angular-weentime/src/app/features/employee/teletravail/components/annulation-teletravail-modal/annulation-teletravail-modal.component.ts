import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, X, Trash2, Loader2, AlertTriangle } from 'lucide-angular';
import { DemandeTeletravail } from '../../models/teletravail.model';

@Component({
  selector: 'app-annulation-teletravail-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './annulation-teletravail-modal.component.html',
  styleUrl: './annulation-teletravail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class AnnulationTeletravailModalComponent {
  @Input() demande: DemandeTeletravail | null = null;
  @Input() isAnnulating = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<number>();

  // Icons
  readonly iconX = X;
  readonly iconTrash = Trash2;
  readonly iconLoader = Loader2;
  readonly iconAlert = AlertTriangle;

  onConfirm(): void {
    if (this.demande) {
      this.confirm.emit(this.demande.id);
    }
  }
}
