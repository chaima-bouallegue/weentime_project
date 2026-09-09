import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Info, X } from 'lucide-angular';
import { DemandeConge, TypeConge, StatutDemande } from '../../models/conge.model';

@Component({
  selector: 'app-consultation-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './consultation-modal.component.html',
  styleUrl: './consultation-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ConsultationModalComponent {
  readonly iconInfo = Info;
  readonly iconX = X;

  @Input() demande: DemandeConge | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<DemandeConge>();

  canModify(demande: DemandeConge | null): boolean {
    if (!demande) return false;
    return demande.statut === 'EN_ATTENTE_MANAGER' || demande.statut === 'EN_ATTENTE_RH' || demande.statut === 'EN_ATTENTE';
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

  getStatusLabel(statut: StatutDemande): string {
    const labels: Partial<Record<StatutDemande, string>> = {
      EN_ATTENTE:         'En attente',
      EN_ATTENTE_MANAGER: 'En attente',
      EN_ATTENTE_RH:      'En attente RH',
      APPROUVE:           'Approuvée',
      APPROUVEE:          'Approuvée',
      REFUSE:             'Refusée',
      REFUSEE:            'Refusée',
      ANNULE:             'Annulée'
    };
    return labels[statut] || statut;
  }
}
