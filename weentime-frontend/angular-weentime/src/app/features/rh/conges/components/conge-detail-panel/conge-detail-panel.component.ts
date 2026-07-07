import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnDestroy, OnInit, inject } from '@angular/core';
import { ModalService } from '@app/core/services/modal.service';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeConge, StatutDemande } from '../../../../employee/conges/models/conge.model';

@Component({
  selector: 'app-conge-detail-panel',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './conge-detail-panel.component.html',
  styleUrl: './conge-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CongeDetailPanelComponent implements OnInit, OnDestroy {
  private readonly modalService = inject(ModalService);

  @Input({ required: true }) demande: DemandeConge | null = null;
  @Output() close = new EventEmitter<void>();

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getAvatarColor(name?: string): string {
    if (!name) return '#6366f1';
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getStatutLabel(statut: StatutDemande | string): string {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER':
        return 'Attente manager';
      case 'EN_ATTENTE':
      case 'EN_ATTENTE_RH':
        return 'En attente RH';
      case 'APPROUVE':
      case 'APPROUVEE':
      case 'PRET':
        return 'Approuvé';
      case 'REFUSE':
      case 'REFUSEE':
        return 'Refusé';
      case 'ANNULE':
      case 'ANNULEE':
        return 'Annulé';
      default:
        return String(statut);
    }
  }

  getStatutIcon(statut: StatutDemande | string): string {
    switch (statut) {
      case 'APPROUVE':
      case 'APPROUVEE':
      case 'PRET':
        return 'check-circle';
      case 'REFUSE':
      case 'REFUSEE':
        return 'x-circle';
      case 'EN_ATTENTE_MANAGER':
        return 'clock';
      default:
        return 'umbrella';
    }
  }

  getStatutClass(statut: StatutDemande | string): string {
    const normalized = String(statut).toLowerCase().replace(/_/g, '-');
    if (normalized.includes('attente')) return 'en-attente';
    if (normalized.includes('refus')) return 'refuse';
    if (normalized.includes('approv') || normalized === 'pret') return 'pret';
    return 'en-cours';
  }
}
