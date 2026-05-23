import { Component, Input, Output, EventEmitter, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH } from '../../models/rh-document.model';

type SortKey = 'employe' | 'type' | 'date' | 'delai' | 'statut';

@Component({
  selector: 'app-document-list-rh',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-list-rh.component.html',
  styleUrl: './document-list-rh.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentListRhComponent {
  @Input({ required: true }) demandes: DemandeDocumentRH[] = [];

  @Output() selectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() generateAI = new EventEmitter<DemandeDocumentRH>();
  @Output() uploadDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() rejectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() viewDoc = new EventEmitter<DemandeDocumentRH>();

  sortKey = signal<SortKey>('date');
  sortDirection = signal<'asc' | 'desc'>('desc');

  sortedDemandes = computed(() => {
    const key = this.sortKey();
    const dir = this.sortDirection();
    const data = [...this.demandes];

    return data.sort((a, b) => {
      let comparison = 0;
      switch (key) {
        case 'employe':
          comparison = `${a.employe.nom} ${a.employe.prenom}`.localeCompare(`${b.employe.nom} ${b.employe.prenom}`);
          break;
        case 'type':
          comparison = a.label.localeCompare(b.label);
          break;
        case 'date':
          comparison = new Date(a.dateCreation).getTime() - new Date(b.dateCreation).getTime();
          break;
        case 'delai':
          comparison = a.delaiEstime.localeCompare(b.delaiEstime);
          break;
        case 'statut':
          comparison = a.statut.localeCompare(b.statut);
          break;
      }
      return dir === 'asc' ? comparison : -comparison;
    });
  });

  toggleSort(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDirection.set('asc');
    }
  }

  getStatutLabel(statut: string): string {
    switch (statut) {
      case 'DEMANDE_RECUE': return 'Demande reçue';
      case 'EN_REVISION': return 'En révision';
      case 'VALIDE': return 'Approuvé';
      case 'SIGNE': return 'Signé';
      case 'ENVOYE': return 'Envoyé';
      case 'EN_ATTENTE': return 'En attente';
      case 'EN_COURS': return 'En cours';
      case 'PRET': return 'Prêt';
      case 'REFUSE': return 'Refusé';
      case 'ANNULE': return 'Annulé';
      default: return statut;
    }
  }

  getStatutClass(statut: string): string {
    return statut.toLowerCase().replace('_', '-');
  }

  isUrgent(dateCreation: string): boolean {
    const creation = new Date(dateCreation).getTime();
    const now = new Date().getTime();
    return (now - creation) > (48 * 60 * 60 * 1000);
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  getInitials(nom: string, prenom: string): string {
    return (prenom[0] + nom[0]).toUpperCase();
  }
}
