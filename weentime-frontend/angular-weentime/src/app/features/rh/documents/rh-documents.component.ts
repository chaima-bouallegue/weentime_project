import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RhDocumentService } from './rh-document.service';
import { DemandeDocumentRH, StatsDocuments } from './models/rh-document.model';

// Sub-components
import { DocumentStatsComponent } from './components/document-stats/document-stats.component';
import { DocumentKanbanComponent } from './components/document-kanban/document-kanban.component';
import { DocumentListRhComponent } from './components/document-list-rh/document-list-rh.component';
import { DocumentDetailPanelComponent } from './components/document-detail-panel/document-detail-panel.component';
import { AiGenerationModalComponent } from './components/ai-generation-modal/ai-generation-modal.component';
import { UploadDocumentModalComponent } from './components/upload-document-modal/upload-document-modal.component';
import { RejectModalComponent } from './components/reject-modal/reject-modal.component';

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
    AiGenerationModalComponent,
    UploadDocumentModalComponent,
    RejectModalComponent
  ],
  templateUrl: './rh-documents.component.html',
  styleUrl: './rh-documents.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhDocumentsComponent implements OnInit {
  private documentService = inject(RhDocumentService);
  private destroyRef = inject(DestroyRef);

  // State
  demandes = signal<DemandeDocumentRH[]>([]);
  stats = signal<StatsDocuments | null>(null);
  isLoading = signal(true);
  vueActive = signal<'liste' | 'kanban'>('kanban');
  searchQuery = signal('');

  // Selected state for modals/panels
  demandeSelectionnee = signal<DemandeDocumentRH | null>(null);

  // Modal visibility
  showAIModal = signal(false);
  showUploadModal = signal(false);
  showRejectModal = signal(false);
  showDetailPanel = signal(false);

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
    this.showDetailPanel.set(true);
  }

  onGenerateAI(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    this.showAIModal.set(true);
  }

  onUploadDoc(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    this.showUploadModal.set(true);
  }

  onRejectDemande(d: DemandeDocumentRH) {
    this.demandeSelectionnee.set(d);
    this.showRejectModal.set(true);
  }

  // Modal Handlers
  handleAIGeneration(event: { id: number, content: string }) {
    this.documentService.validerAvecDocument(event.id, { contenuIA: event.content, generatedByAI: true })
      .subscribe(() => {
        this.showAIModal.set(false);
        this.refreshData();
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
}
