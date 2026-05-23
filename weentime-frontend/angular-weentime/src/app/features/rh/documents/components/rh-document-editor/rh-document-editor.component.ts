import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewEncapsulation,
  inject
} from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocumentRH } from '../../models/rh-document.model';
import { RhDocumentService } from '../../rh-document.service';

type EditorLayoutMode = 'editor' | 'split';

@Component({
  selector: 'app-rh-document-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './rh-document-editor.component.html',
  styleUrl: './rh-document-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class RhDocumentEditorComponent implements OnInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly documentService = inject(RhDocumentService);

  @Input({ required: true }) demande!: DemandeDocumentRH;
  @Output() closeEditor = new EventEmitter<void>();
  @Output() approuver = new EventEmitter<{ id: number; contenu: string }>();
  @Output() signer = new EventEmitter<{ id: number; signedBy: string }>();
  @Output() envoyer = new EventEmitter<number>();
  @Output() generateAI = new EventEmitter<{
    demande: DemandeDocumentRH;
    action: 'regenerate' | 'formalize' | 'correct';
    contenu?: string;
  }>();

  @ViewChild('editorContent') editorContent!: ElementRef<HTMLDivElement>;

  contentHtml: SafeHtml = '';
  rawHtml = '';
  isSidebarOpen = true;
  showSignatureModal = false;
  signatureName = '';
  isProcessing = false;

  layoutMode: EditorLayoutMode = 'editor';
  previewLoading = false;
  previewError = false;
  previewUrl: SafeResourceUrl | null = null;

  previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private blobUrl: string | null = null;

  steps = [
    { id: 'DEMANDE_RECUE', label: 'Demande Reçue' },
    { id: 'EN_REVISION', label: 'En Révision' },
    { id: 'VALIDE', label: 'Approuvé' },
    { id: 'SIGNE', label: 'Signé' },
    { id: 'ENVOYE', label: 'Envoyé' }
  ];

  ngOnInit(): void {
    if (this.demande.contenuIA) {
      this.rawHtml = this.demande.contenuIA;
      this.contentHtml = this.sanitizer.bypassSecurityTrustHtml(this.rawHtml);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['demande']) {
      this.isProcessing = false;
      if (this.demande.contenuIA && this.demande.contenuIA !== this.rawHtml) {
        this.rawHtml = this.demande.contenuIA;
        this.contentHtml = this.sanitizer.bypassSecurityTrustHtml(this.rawHtml);
      }
      if (this.layoutMode === 'split') {
        this.schedulePreviewRefresh();
      }
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.clearPreviewDebounce();
    this.revokePreviewUrl();
  }

  get normalizedStatut(): string {
    const s = this.demande.statut as string;
    if (s === 'EN_ATTENTE' || s === 'EN_ATTENTE_RH') return 'DEMANDE_RECUE';
    return s;
  }

  getCurrentStepIndex(): number {
    return this.steps.findIndex(s => s.id === this.normalizedStatut);
  }

  get isSplitView(): boolean {
    return this.layoutMode === 'split';
  }

  toggleLayoutMode(): void {
    this.layoutMode = this.layoutMode === 'editor' ? 'split' : 'editor';
    if (this.layoutMode === 'split') {
      this.schedulePreviewRefresh();
    } else {
      this.clearPreviewDebounce();
    }
    this.cdr.markForCheck();
  }

  setLayoutEditor(): void {
    this.layoutMode = 'editor';
    this.clearPreviewDebounce();
    this.cdr.markForCheck();
  }

  setLayoutSplit(): void {
    this.layoutMode = 'split';
    if (!this.previewUrl && !this.previewLoading) {
      this.previewLoading = true;
    }
    this.schedulePreviewRefresh();
    this.cdr.markForCheck();
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  execCommand(command: string, value: string | undefined = undefined): void {
    document.execCommand(command, false, value);
    this.editorContent.nativeElement.focus();
  }

  onContentChange(): void {
    if (this.editorContent?.nativeElement) {
      this.rawHtml = this.editorContent.nativeElement.innerHTML;
      this.contentHtml = this.sanitizer.bypassSecurityTrustHtml(this.rawHtml);
    }
    if (this.layoutMode === 'split') {
      this.schedulePreviewRefresh();
    }
  }

  schedulePreviewRefresh(): void {
    this.clearPreviewDebounce();
    this.previewDebounceTimer = setTimeout(() => this.refreshPreview(), 1000);
  }

  clearPreviewDebounce(): void {
    if (this.previewDebounceTimer) {
      clearTimeout(this.previewDebounceTimer);
      this.previewDebounceTimer = null;
    }
  }

  private refreshPreview(): void {
    this.previewLoading = true;
    this.previewError = false;
    this.cdr.markForCheck();

    this.documentService.previewDocumentPdf(this.demande.id, this.rawHtml).subscribe({
      next: (blob: Blob) => {
        this.revokePreviewUrl();
        this.blobUrl = URL.createObjectURL(blob);
        this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl);
        this.previewLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.previewLoading = false;
        this.previewError = true;
        this.cdr.markForCheck();
      }
    });
  }

  private revokePreviewUrl(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    this.previewUrl = null;
  }

  onApprouver(): void {
    this.onContentChange();
    this.isProcessing = true;
    this.approuver.emit({ id: this.demande.id, contenu: this.rawHtml });
  }

  openSignatureModal(): void {
    this.signatureName = '';
    this.showSignatureModal = true;
  }

  closeSignatureModal(): void {
    this.showSignatureModal = false;
  }

  onConfirmSignature(): void {
    if (!this.signatureName.trim()) return;
    this.isProcessing = true;
    this.signer.emit({ id: this.demande.id, signedBy: this.signatureName.trim() });
    this.closeSignatureModal();
  }

  onEnvoyer(): void {
    this.isProcessing = true;
    this.envoyer.emit(this.demande.id);
  }

  onGenerateAI(action: 'regenerate' | 'formalize' | 'correct' = 'regenerate'): void {
    if ((action === 'formalize' || action === 'correct') && !this.rawHtml.trim()) {
      return;
    }
    this.onContentChange();
    this.isProcessing = true;
    this.cdr.markForCheck();
    this.generateAI.emit({ demande: this.demande, action, contenu: this.rawHtml });
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  }

  finishProcessing(updatedDemande: DemandeDocumentRH): void {
    this.demande = updatedDemande;
    this.isProcessing = false;
    if (this.demande.contenuIA && this.demande.contenuIA !== this.rawHtml) {
      this.rawHtml = this.demande.contenuIA;
      this.contentHtml = this.sanitizer.bypassSecurityTrustHtml(this.rawHtml);
    }
    if (this.layoutMode === 'split') {
      this.schedulePreviewRefresh();
    }
    this.cdr.markForCheck();
  }
}
