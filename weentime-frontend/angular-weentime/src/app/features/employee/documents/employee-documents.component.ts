import { Component, signal, computed, inject, OnInit, OnDestroy, ChangeDetectionStrategy, DestroyRef, ViewEncapsulation, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, FileText, Download, Clock, Loader2, Plus, Info, AlertCircle, FileCheck, Search, Filter } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DocumentService } from './document.service';
import { TypeDocumentConfig, DemandeDocument, StatutDocument, TypeDocument, NouvelleDemandeDocumentRequest } from './models/document.model';
import { DocumentTypeGridComponent } from './components/document-type-grid/document-type-grid.component';
import { DemandeDocumentDrawerComponent } from './components/demande-document-drawer/demande-document-drawer.component';
import { DocumentHistoriqueComponent } from './components/document-historique/document-historique.component';
import { AnnulationDocumentModalComponent } from './components/annulation-document-modal/annulation-document-modal.component';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { AssistantWorkflowService } from '../../../core/services/assistant-workflow.service';
import { ToastService } from '../../../core/services/toast.service';
import { WebSocketService } from '../../../core/services/websocket.service';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentStatusChangedEvent } from '../../rh/documents/models/document-ws.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-employee-documents',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    DocumentTypeGridComponent,
    DemandeDocumentDrawerComponent,
    DocumentHistoriqueComponent,
    AnnulationDocumentModalComponent
  ],
  templateUrl: './employee-documents.component.html',
  styleUrl: './employee-documents.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class EmployeeDocumentsComponent implements OnInit, OnDestroy {
  private documentService = inject(DocumentService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private assistantWorkflow = inject(AssistantWorkflowService);
  private assistantSync = inject(AssistantSyncService);
  private wsService = inject(WebSocketService);
  private authService = inject(AuthService);
  private wsSub?: Subscription;

  // Icons
  readonly iconFile = FileText;
  readonly iconDownload = Download;
  readonly iconClock = Clock;
  readonly iconLoader = Loader2;
  readonly iconPlus = Plus;
  readonly iconInfo = Info;
  readonly iconAlert = AlertCircle;
  readonly iconCheck = FileCheck;
  readonly iconSearch = Search;
  readonly iconFilter = Filter;

  types = signal<TypeDocumentConfig[]>([]);
  historique = signal<DemandeDocument[]>([]);
  isLoading = signal(false);
  showDrawer = signal(false);
  typePreselectionne = signal<TypeDocument | null>(null);
  demandeAnnuler = signal<DemandeDocument | null>(null);
  isAnnulating = signal(false);
  isSubmittingRequest = signal(false);
  filtreStatut = signal<StatutDocument | 'TOUS'>('TOUS');
  currentDate = signal<string>('');

  historiqueFiltre = computed(() => {
    const historique = this.historique();
    const filtre = this.filtreStatut();

    if (!Array.isArray(historique)) {
      return [];
    }

    return filtre === 'TOUS'
      ? historique
      : historique.filter(d => d.statut === filtre);
  });

  countByStatut(statut: StatutDocument): number {
    const historique = this.historique();
    if (!Array.isArray(historique)) {
      return 0;
    }
    return historique.filter(d => d.statut === statut).length;
  }

  constructor() {
    effect(() => {
      const draft = this.assistantWorkflow.documentDraft();
      if (!draft?.autoOpen) {
        return;
      }
      this.typePreselectionne.set(this.resolveDraftType(draft.type));
      this.showDrawer.set(true);
    });
  }

  ngOnInit(): void {
    const now = new Date();
    this.currentDate.set(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    this.loadData();
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.actionResult?.executed && event.actionResult.tool === 'request_document') {
          this.refreshData();
        }
      });

    if (this.authService.getToken()) {
      this.wsSub = this.wsService.watch<DocumentStatusChangedEvent>('/user/queue/notifications')
        .subscribe(event => {
          if (event?.type === 'DOCUMENT_STATUS_CHANGED') {
            this.refreshData();
          }
        });
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.documentService.getTypesDisponibles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.types.set(res));
    this.documentService.getHistorique()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => {
        this.historique.set(res);
        this.isLoading.set(false);
      });
  }

  onDemanderType(type: TypeDocument): void {
    this.typePreselectionne.set(type);
    this.showDrawer.set(true);
  }

  onOpenDrawer(): void {
    this.typePreselectionne.set(null);
    this.showDrawer.set(true);
  }

  onCloseDrawer(): void {
    this.isSubmittingRequest.set(false);
    this.showDrawer.set(false);
    this.typePreselectionne.set(null);
  }

  onFilterChange(filter: StatutDocument | 'TOUS'): void {
    this.filtreStatut.set(filter);
  }

  onCancelRequest(demande: DemandeDocument): void {
    this.demandeAnnuler.set(demande);
  }

  confirmAnnulation(id: number): void {
    this.isAnnulating.set(true);
    this.documentService.annulerDemande(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.isAnnulating.set(false);
          this.demandeAnnuler.set(null);
          this.historique.update(list => list.map(d => d.id === id ? updated : d));
          this.toastService.success('Demande annulée avec succès');
        },
        error: (err: Error) => {
          this.isAnnulating.set(false);
          this.demandeAnnuler.set(null);
          // Afficher le message d'erreur retourné par le backend
          const message = err?.message || 'Impossible d\'annuler cette demande.';
          this.toastService.error(message);
        }
      });
  }

  soumettreDemande(request: NouvelleDemandeDocumentRequest): void {
    this.isSubmittingRequest.set(true);
    this.documentService.soumettreDemande(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmittingRequest.set(false);
          this.showDrawer.set(false);
          this.typePreselectionne.set(null);
          this.toastService.success('Votre demande a été soumise avec succès');
          this.refreshData();
        },
        error: () => {
          this.isSubmittingRequest.set(false);
        }
      });
  }

  onDownloadRequest(demande: DemandeDocument): void {
    this.documentService.telechargerDocument(demande.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(blob => {
        if (!blob) return;
        const fileName = this.generateFileName(demande);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        this.toastService.success('Document téléchargé avec succès');
      });
  }

  private generateFileName(demande: DemandeDocument): string {
    if (demande.originalFileName) {
      return demande.originalFileName;
    }
    const label = demande.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    const date = demande.dateCreation;
    return `${label}_${date}.pdf`;
  }

  private refreshData(): void {
    this.documentService.getHistorique()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.historique.set(res));
  }

  private resolveDraftType(value?: string): TypeDocument | null {
    const normalized = typeof value === 'string'
      ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
      : '';

    if (!normalized) {
      return null;
    }

    const knownTypes: TypeDocument[] = [
      'ATTESTATION_TRAVAIL',
      'BULLETIN_PAIE',
      'ATTESTATION_SALAIRE',
      'CONTRAT_TRAVAIL',
      'CERTIFICAT_CONGE',
      'ATTESTATION_ANCIENNETE',
      'FICHE_POSTE',
    ];
    const exact = knownTypes.find(type => type.toLowerCase() === normalized);
    if (exact) return exact;
    if (normalized.includes('bulletin')) return 'BULLETIN_PAIE';
    if (normalized.includes('salaire')) return 'ATTESTATION_SALAIRE';
    if (normalized.includes('anciennete')) return 'ATTESTATION_ANCIENNETE';
    if (normalized.includes('certificat')) return 'CERTIFICAT_CONGE';
    if (normalized.includes('contrat')) return 'CONTRAT_TRAVAIL';
    if (normalized.includes('poste')) return 'FICHE_POSTE';
    if (normalized.includes('travail')) return 'ATTESTATION_TRAVAIL';
    return null;
  }
}