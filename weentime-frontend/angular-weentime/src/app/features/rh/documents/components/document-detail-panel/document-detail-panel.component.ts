import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH } from '../../models/rh-document.model';

@Component({
  selector: 'app-document-detail-panel',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-detail-panel.component.html',
  styleUrl: './document-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentDetailPanelComponent {
  @Input({ required: true }) demande: DemandeDocumentRH | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() generateAI = new EventEmitter<DemandeDocumentRH>();
  @Output() uploadDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() rejectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() viewDoc = new EventEmitter<DemandeDocumentRH>();

  getInitials(nom: string, prenom: string): string {
    return (prenom[0] + nom[0]).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  getStatutLabel(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE': return 'En attente de traitement';
      case 'EN_COURS': return 'En cours de traitement';
      case 'PRET': return 'Document prêt';
      case 'REFUSE': return 'Demande refusée';
      case 'ANNULE': return 'Demande annulée';
      default: return statut;
    }
  }
}
