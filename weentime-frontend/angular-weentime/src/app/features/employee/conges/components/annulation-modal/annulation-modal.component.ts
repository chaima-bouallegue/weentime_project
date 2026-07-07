import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, AlertTriangle, X, Loader2 } from 'lucide-angular';
import { DemandeConge, TypeConge } from '../../models/conge.model';

@Component({
  selector: 'app-annulation-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './annulation-modal.component.html',
  styleUrl: './annulation-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class AnnulationModalComponent {
  readonly iconAlert = AlertTriangle;
  readonly iconX = X;
  readonly iconLoader = Loader2;
  @Input() demande: DemandeConge | null = null;
  @Input() isAnnulating = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<number>();

  onConfirm() {
    if (this.demande) {
      this.confirm.emit(this.demande.id);
    }
  }

  getTypeLabel(type: TypeConge): string {
    const labels: Record<TypeConge, string> = {
      ANNUEL: 'Congé annuel',
      MALADIE: 'Congé maladie',
      RTT: 'RTT',
      MATERNITE_PATERNITE: 'Maternité / Paternité',
      EXCEPTIONNEL: 'Congé exceptionnel',
      SANS_SOLDE: 'Sans solde'
    };
    return labels[type] || 'Congé';
  }
}
