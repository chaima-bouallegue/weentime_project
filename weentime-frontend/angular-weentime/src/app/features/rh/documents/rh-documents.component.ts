import { Component, inject, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RhDocumentService } from './rh-document.service';
import { DemandeDocumentRH, StatsDocuments } from './models/rh-document.model';
import { ToastService } from '../../../core/services/toast.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { DocumentStatusChangedEvent } from './models/document-ws.model';
import { StatutDocumentRH } from './models/rh-document.model';
import { Subscription } from 'rxjs';

// Sub-components
import { DocumentStatsComponent } from './components/document-stats/document-stats.component';
import { DocumentKanbanComponent } from './components/document-kanban/document-kanban.component';
import { DocumentListRhComponent } from './components/document-list-rh/document-list-rh.component';
import { DocumentDetailPanelComponent } from './components/document-detail-panel/document-detail-panel.component';
import { RhDocumentEditorComponent } from './components/rh-document-editor/rh-document-editor.component';
import { UploadDocumentModalComponent } from './components/upload-document-modal/upload-document-modal.component';
import { RejectModalComponent } from './components/reject-modal/reject-modal.component';
import { EmployeeDocumentsComponent } from '../../employee/documents/employee-documents.component';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-rh-documents',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    DocumentStatsComponent,
    DocumentKanbanComponent,
    DocumentListRhComponent,
    DocumentDetailPanelComponent,
    RhDocumentEditorComponent,
    UploadDocumentModalComponent,
    RejectModalComponent,
    EmployeeDocumentsComponent
  ],
  templateUrl: './rh-documents.component.html',
  styleUrl: './rh-documents.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhDocumentsComponent implements OnInit, OnDestroy {
  private documentService = inject(RhDocumentService);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);
  private authService = inject(AuthService);
  private wsService = inject(WebSocketService);
  private wsSub?: Subscription;

  readonly isRh = computed(() => this.authService.hasRole('RH'));
  readonly activeTab = signal<'mes-demandes' | 'gestion'>('gestion');

  // State
  demandes = signal<DemandeDocumentRH[]>([]);
  stats = signal<StatsDocuments | null>(null);
  isLoading = signal(true);
  vueActive = signal<'liste' | 'kanban'>('kanban');
  searchQuery = signal('');

  // Selected state for modals/panels
  demandeSelectionnee = signal<DemandeDocumentRH | null>(null);

  // Modal visibility
  showEditor = signal(false);
  showUploadModal = signal(false);
  showRejectModal = signal(false);
  showDetailPanel = signal(false);
  auditRefreshTrigger = signal(0);

  // Filtered demands
  demandesFiltrees = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.demandes().filter(d =>
      `${d.employe.nom} ${d.employe.prenom}`.toLowerCase().includes(query) ||
      d.label.toLowerCase().includes(query)
    );
  });

  ngOnInit() {
    this.refreshData();
    this.wsSub = this.wsService.watch<DocumentStatusChangedEvent>('/topic/role/rh').subscribe(event => {
      if (event?.type !== 'DOCUMENT_STATUS_CHANGED') return;
      this.toast.info(event.message);
      this.refreshData();
      const selected = this.demandeSelectionnee();
      if (selected?.id === event.documentId) {
        const statut = this.mapWsStatus(event.newStatus);
        this.demandeSelectionnee.set({ ...selected, statut });
        this.auditRefreshTrigger.update(v => v + 1);
      }
    });
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  private mapWsStatus(status: string): DemandeDocumentRH['statut'] {
    const allowed: StatutDocumentRH[] = ['DEMANDE_RECUE', 'EN_REVISION', 'VALIDE', 'SIGNE', 'ENVOYE', 'REFUSE', 'ANNULE'];
    return (allowed.includes(status as StatutDocumentRH) ? status : 'DEMANDE_RECUE') as DemandeDocumentRH['statut'];
  }

  refreshData() {
    this.isLoading.set(true);

    // Fetch demandes
    this.documentService.getDemandesEntreprise()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.demandes.set(Array.isArray(data) ? data : []);
          this.isLoading.set(false);
        },
        error: () => {
          this.demandes.set([]);
          this.isLoading.set(false);
        }
      });

    // Fetch stats
    this.documentService.getStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => this.stats.set(data),
        error: () => this.stats.set(null)
      });
  }

  // Actions
  onSelectDemande(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    this.auditRefreshTrigger.update(v => v + 1);
    this.showDetailPanel.set(true);
  }

  onOpenEditor(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    if (d.statut === 'DEMANDE_RECUE' || d.statut === 'EN_ATTENTE') {
      this.documentService.passerEnCours(d.id).subscribe((updated) => {
        this.demandeSelectionnee.set(updated);
        this.showEditor.set(true);
        this.refreshData();
      });
    } else {
      this.showEditor.set(true);
    }
  }

  // Backwards compatibility for old bindings
  onGenerateAI(d: DemandeDocumentRH) {
    this.onOpenEditor(d);
  }

  onUploadDoc(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    this.showUploadModal.set(true);
  }

  onRejectDemande(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    this.showRejectModal.set(true);
  }

  // Editor Handlers
  handleApprouver(event: { id: number, contenu: string }) {
    this.documentService.approuverDocument(event.id, event.contenu).subscribe({
      next: updated => {
        this.demandeSelectionnee.set(updated);
        this.auditRefreshTrigger.update(v => v + 1);
        this.refreshData();
      },
      error: () => {
        this.toast.error("Erreur lors de l'approbation du document");
        const current = this.demandeSelectionnee();
        if (current) this.demandeSelectionnee.set({ ...current });
      }
    });
  }

  handleSigner(event: { id: number, signedBy: string }) {
    this.documentService.signerDocument(event.id, event.signedBy).subscribe({
      next: updated => {
        this.demandeSelectionnee.set(updated);
        this.auditRefreshTrigger.update(v => v + 1);
        this.refreshData();
      },
      error: () => {
        this.toast.error("Erreur lors de la signature du document");
        const current = this.demandeSelectionnee();
        if (current) this.demandeSelectionnee.set({ ...current });
      }
    });
  }

  handleEnvoyer(id: number) {
    this.documentService.envoyerDocument(id).subscribe({
      next: () => {
        this.showEditor.set(false);
        this.toast.success('Document envoyé avec succès au collaborateur ✨');
        this.refreshData();
      },
      error: () => {
        this.toast.error("Erreur lors de l'envoi du document");
        const current = this.demandeSelectionnee();
        if (current) this.demandeSelectionnee.set({ ...current });
      }
    });
  }

  handleEditorAIGeneration(event: { demande: DemandeDocumentRH; action: 'regenerate' | 'formalize' | 'correct'; contenu?: string }) {
    const { demande, action, contenu } = event;
    const apply = (result: { contenu: string }) => {
      const current = this.demandeSelectionnee();
      if (current) this.demandeSelectionnee.set({ ...current, contenuIA: result.contenu });
    };
    const onError = () => {
      this.toast.error("Erreur lors de l'action IA");
      const current = this.demandeSelectionnee();
      if (current) this.demandeSelectionnee.set({ ...current });
    };

    if (action === 'regenerate') {
      this.documentService.generateAIDocument(demande).subscribe({
        next: result => {
          apply(result);
          this.auditRefreshTrigger.update(v => v + 1);
        },
        error: onError
      });
      return;
    }

    const currentContent = contenu ?? demande.contenuIA ?? '';
    const prompt = action === 'formalize'
      ? `Reformule ce document avec un ton plus formel et juridique, conserve toutes les données existantes : ${currentContent}`
      : `Identifie et corrige les erreurs dans ce document. Remplace les [À COMPLÉTER] par des valeurs cohérentes si elles peuvent être déduites du contexte : ${currentContent}`;

    this.documentService.generateAIDocumentAdvanced({
      type: demande.type,
      employeNom: `${demande.employe.prenom} ${demande.employe.nom}`,
      documentId: demande.id,
      prompt
    }).subscribe({
      next: result => {
        apply(result);
        this.auditRefreshTrigger.update(v => v + 1);
      },
      error: onError
    });
  }

  handleKanbanStatusChange(event: { id: number; targetStatus: StatutDocumentRH }) {
    this.documentService.updateStatut(event.id, event.targetStatus).subscribe({
      next: () => {
        this.toast.success('Statut mis à jour');
        if (this.demandeSelectionnee()?.id === event.id) {
          this.auditRefreshTrigger.update(v => v + 1);
        }
        this.refreshData();
      },
      error: () => this.toast.error('Impossible de changer le statut')
    });
  }

  handleUpload(event: { id: number, file: File }) {
    this.documentService.uploadAndValidate(event.id, event.file)
      .subscribe(() => {
        this.showUploadModal.set(false);
        this.refreshData();
      });
  }

  handleReject(event: { id: number, reason: string }) {
    this.documentService.refuser(event.id, event.reason)
      .subscribe(() => {
        this.showRejectModal.set(false);
        this.refreshData();
      });
  }

  onViewDoc(demande: DemandeDocumentRH) {
    this.documentService.getDocumentFile(demande.id).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    });
  }

  onDownloadDoc(demande: DemandeDocumentRH) {
    this.documentService.getDocumentFile(demande.id).subscribe({
      next: blob => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeName = (demande.label || 'document').replace(/[^\w\s-]/g, '').trim() || 'document';
        link.href = url;
        link.download = `${safeName}.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Impossible de télécharger le document')
    });
  }
}
