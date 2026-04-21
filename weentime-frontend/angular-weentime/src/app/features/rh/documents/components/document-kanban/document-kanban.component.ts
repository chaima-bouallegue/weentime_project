import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH, StatutDocumentRH } from '../../models/rh-document.model';

@Component({
  selector: 'app-document-kanban',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-kanban.component.html',
  styleUrl: './document-kanban.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentKanbanComponent {
  @Input({ required: true }) demandes: DemandeDocumentRH[] = [];
  
  @Output() selectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() generateAI = new EventEmitter<DemandeDocumentRH>();
  @Output() uploadDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() rejectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() viewDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() startProcessing = new EventEmitter<DemandeDocumentRH>();

  columns: { label: string; status: StatutDocumentRH }[] = [
    { label: 'En attente', status: 'EN_ATTENTE' },
    { label: 'En cours', status: 'EN_COURS' },
    { label: 'Prêt', status: 'PRET' }
  ];

  getDemandesByStatus(status: StatutDocumentRH): DemandeDocumentRH[] {
    return this.demandes.filter(d => d.statut === status);
  }

  getInitials(nom: string, prenom: string): string {
    return (prenom[0] + nom[0]).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'ATTESTATION_SALAIRE':
      case 'ATTESTATION_TRAVAIL': return 'file-text';
      case 'BULLETIN_PAIE': return 'receipt';
      case 'CERTIFICAT_TRAVAIL': return 'award';
      case 'AVENANT_CONTRAT': return 'file-signature';
      default: return 'file-text';
    }
  }

  getTypeColor(type: string): string {
    switch (type) {
      case 'BULLETIN_PAIE': return 'orange';
      case 'ATTESTATION_TRAVAIL': return 'blue';
      case 'CERTIFICAT_TRAVAIL': return 'green';
      case 'AVENANT_CONTRAT': return 'violet';
      default: return 'indigo';
    }
  }

  isUrgent(dateCreation: string): boolean {
    const creation = new Date(dateCreation).getTime();
    const now = new Date().getTime();
    return (now - creation) > (48 * 60 * 60 * 1000);
  }
}
