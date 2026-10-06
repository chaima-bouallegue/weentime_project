import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Info, X } from 'lucide-angular';
import { DemandeTeletravail, StatutTeletravail, TypeTeletravail } from '../../models/teletravail.model';
import { ModalService } from '@app/core/services/modal.service';

@Component({
  selector: 'app-consultation-teletravail-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './consultation-teletravail-modal.component.html',
  styleUrl: './consultation-teletravail-modal.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class ConsultationTeletravailModalComponent implements OnInit, OnDestroy {
  private readonly modalService = inject(ModalService);

  readonly iconInfo = Info;
  readonly iconX = X;

  @Input() demande: DemandeTeletravail | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<DemandeTeletravail>();

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }

  canModify(demande: DemandeTeletravail | null): boolean {
    if (!demande) return false;
    return demande.statut === 'EN_ATTENTE' || demande.statut === 'EN_ATTENTE_MANAGER' || demande.statut === 'EN_ATTENTE_RH';
  }

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
      EN_ATTENTE_RH: 'En attente RH',
      APPROUVE: 'Approuvé',
      APPROUVEE: 'Approuvé',
      VALIDEE: 'Approuvé',
      REFUSE: 'Refusé',
      REFUSEE: 'Refusé',
      ANNULE: 'Annulé',
      ANNULEE: 'Annulé',
      EN_ATTENTE: 'En attente'
    };
    return labels[statut] || statut;
  }
}
