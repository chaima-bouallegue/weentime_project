import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Info, X } from 'lucide-angular';
import { DemandeTeletravail, StatutTeletravail, TypeTeletravail } from '../../models/teletravail.model';

@Component({
  selector: 'app-consultation-teletravail-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './consultation-teletravail-modal.component.html',
  styleUrl: './consultation-teletravail-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ConsultationTeletravailModalComponent {
  readonly iconInfo = Info;
  readonly iconX = X;

  @Input() demande: DemandeTeletravail | null = null;
  @Output() close = new EventEmitter<void>();

  getTypeLabel(type: TypeTeletravail): string {
    const labels: Record<TypeTeletravail, string> = {
      JOURNEE_COMPLETE: 'Journée complète',
      DEMI_JOURNEE_MATIN: 'Demi-journée matin',
      DEMI_JOURNEE_APRES_MIDI: 'Demi-journée après-midi',
      SEMAINE_COMPLETE: 'Semaine complète'
    };
    return labels[type] || 'Télétravail';
  }

  getStatusLabel(statut: StatutTeletravail): string {
    const labels: Record<string, string> = {
      EN_ATTENTE_MANAGER: 'En attente manager',
      EN_ATTENTE_RH:      'En attente RH',
      APPROUVE:           'Approuvé',
      APPROUVEE:          'Approuvé',
      VALIDEE:            'Approuvé',
      REFUSE:             'Refusé',
      REFUSEE:            'Refusé',
      ANNULE:             'Annulé',
      ANNULEE:            'Annulé',
      EN_ATTENTE:         'En attente'
    };
    return labels[statut] || statut;
  }
}
