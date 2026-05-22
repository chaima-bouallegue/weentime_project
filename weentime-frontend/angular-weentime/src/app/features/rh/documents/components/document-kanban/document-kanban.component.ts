import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH, StatutDocumentRH } from '../../models/rh-document.model';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-document-kanban',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-kanban.component.html',
  styleUrl: './document-kanban.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentKanbanComponent {
  private readonly toast = inject(ToastService);

  @Input({ required: true }) demandes: DemandeDocumentRH[] = [];
  
  @Output() selectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() generateAI = new EventEmitter<DemandeDocumentRH>();
  @Output() uploadDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() rejectDemande = new EventEmitter<DemandeDocumentRH>();
  @Output() viewDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() downloadDoc = new EventEmitter<DemandeDocumentRH>();
  @Output() startProcessing = new EventEmitter<DemandeDocumentRH>();
  @Output() statusChange = new EventEmitter<{ id: number; targetStatus: StatutDocumentRH }>();

  draggingId: number | null = null;
  dragOverStatus: StatutDocumentRH | null = null;

  columns: { label: string; status: StatutDocumentRH; emptyIcon: string; emptyText: string }[] = [
    { label: 'Demandes reçues', status: 'DEMANDE_RECUE', emptyIcon: 'inbox', emptyText: 'Aucune demande reçue' },
    { label: 'En révision', status: 'EN_REVISION', emptyIcon: 'clock', emptyText: 'Aucune en cours' },
    { label: 'Validés', status: 'VALIDE', emptyIcon: 'shield-check', emptyText: 'Aucun document validé' },
    { label: 'Signés', status: 'SIGNE', emptyIcon: 'pen-tool', emptyText: 'Aucun document signé' },
    { label: 'Envoyés', status: 'ENVOYE', emptyIcon: 'send', emptyText: 'Aucun document envoyé' }
  ];

  getDemandesByStatus(status: StatutDocumentRH): DemandeDocumentRH[] {
    if (status === 'DEMANDE_RECUE') {
      return this.demandes.filter(d => d.statut === 'DEMANDE_RECUE' || d.statut === 'EN_ATTENTE');
    }
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

  onDragStart(event: DragEvent, demande: DemandeDocumentRH): void {
    this.draggingId = demande.id;
    event.dataTransfer?.setData('text/plain', String(demande.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragEnd(): void {
    this.draggingId = null;
    this.dragOverStatus = null;
  }

  onDragOver(event: DragEvent, status: StatutDocumentRH): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverStatus = status;
  }

  onDragLeave(status: StatutDocumentRH): void {
    if (this.dragOverStatus === status) this.dragOverStatus = null;
  }

  onDrop(event: DragEvent, targetStatus: StatutDocumentRH): void {
    event.preventDefault();
    const id = Number(event.dataTransfer?.getData('text/plain'));
    const demande = this.demandes.find(d => d.id === id);
    this.draggingId = null;
    this.dragOverStatus = null;
    if (!demande) return;
    if (demande.statut === targetStatus) return;
    if (!this.isTransitionAllowed(demande.statut, targetStatus)) {
      this.toast.error('Transition de statut non autorisée');
      return;
    }
    this.statusChange.emit({ id: demande.id, targetStatus });
  }

  private isTransitionAllowed(from: StatutDocumentRH, to: StatutDocumentRH): boolean {
    const allowed: Partial<Record<StatutDocumentRH, StatutDocumentRH[]>> = {
      DEMANDE_RECUE: ['EN_REVISION', 'VALIDE'],
      EN_ATTENTE: ['EN_REVISION', 'VALIDE'],
      EN_REVISION: ['VALIDE'],
      VALIDE: ['SIGNE'],
      SIGNE: ['ENVOYE'],
      ENVOYE: []
    };
    return (allowed[from] ?? []).includes(to);
  }
}
