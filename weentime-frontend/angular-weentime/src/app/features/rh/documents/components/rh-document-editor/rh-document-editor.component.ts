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
import { AuthService } from '@app/core/services/auth.service';
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
  private readonly authService = inject(AuthService);

  @Input({ required: true }) demande!: DemandeDocumentRH;
  @Output() closeEditor = new EventEmitter<void>();
  @Output() approuver = new EventEmitter<{ id: number; contenu: string }>();
  @Output() signer = new EventEmitter<{ id: number; signedBy: string; signatureImage?: string }>();
  @Output() envoyer = new EventEmitter<number>();
  @Output() generateAI = new EventEmitter<{
    demande: DemandeDocumentRH;
    action: 'regenerate' | 'formalize' | 'correct';
    contenu?: string;
  }>();

  @ViewChild('editorContent') editorContent!: ElementRef<HTMLDivElement>;
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;

  contentHtml: SafeHtml = '';
  rawHtml = '';
  isSidebarOpen = true;
  showSignatureModal = false;
  signatureType: 'draw' | 'type' = 'draw';
  signatureName = '';
  signerRole = 'Responsable Ressources Humaines';
  signerEmail = '';
  legalConsent = false;
  documentHash = '';
  signatureTimestamp = '';
  transactionId = '';
  hasDrawn = false;
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
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
      this.syncEditorDom();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['demande']) {
      this.isProcessing = false;
      if (this.demande.contenuIA && this.demande.contenuIA !== this.rawHtml) {
        this.rawHtml = this.demande.contenuIA;
        this.contentHtml = this.sanitizer.bypassSecurityTrustHtml(this.rawHtml);
        this.syncEditorDom();
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
    const user = this.authService.currentUser();
    const fullName = user ? [user.prenom, user.nom].filter(Boolean).join(' ') : '';
    this.signatureName = fullName || 'Chaima Bouallegue';
    this.signerEmail = user?.email || 'chaima.rh@weentime.com';
    this.signerRole = (user?.roles?.includes('ADMIN') || user?.role === 'ADMIN')
      ? 'Directrice RH & Administrateur'
      : 'Responsable Ressources Humaines';
    this.legalConsent = false;
    this.hasDrawn = false;
    this.signatureType = 'draw';
    this.transactionId = `eIDAS-${this.demande.id}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    this.signatureTimestamp = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    this.generateDocumentHash();
    this.showSignatureModal = true;
    this.cdr.markForCheck();
    setTimeout(() => this.setupCanvas(), 60);
  }

  closeSignatureModal(): void {
    this.showSignatureModal = false;
    this.isDrawing = false;
    this.cdr.markForCheck();
  }

  setSignatureType(type: 'draw' | 'type'): void {
    this.signatureType = type;
    this.cdr.markForCheck();
    if (type === 'draw') {
      setTimeout(() => this.setupCanvas(), 40);
    }
  }

  setupCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#312e81';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    this.hasDrawn = false;
    this.cdr.markForCheck();
  }

  startDrawing(event: MouseEvent | TouchEvent): void {
    event.preventDefault();
    this.isDrawing = true;
    const pos = this.getCanvasPosition(event);
    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing) return;
    event.preventDefault();
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = this.getCanvasPosition(event);
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    this.lastX = pos.x;
    this.lastY = pos.y;
    this.hasDrawn = true;
    this.cdr.markForCheck();
  }

  stopDrawing(): void {
    this.isDrawing = false;
  }

  clearCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.hasDrawn = false;
    this.cdr.markForCheck();
  }

  private getCanvasPosition(event: MouseEvent | TouchEvent): { x: number; y: number } {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event && event.touches && event.touches.length > 0) {
      return {
        x: event.touches[0].clientX - rect.left,
        y: event.touches[0].clientY - rect.top
      };
    } else if ('clientX' in event) {
      return {
        x: (event as MouseEvent).clientX - rect.left,
        y: (event as MouseEvent).clientY - rect.top
      };
    }
    return { x: 0, y: 0 };
  }

  private generateDocumentHash(): void {
    const content = `${this.demande.id}-${this.demande.type}-${this.rawHtml || ''}`;
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      crypto.subtle.digest('SHA-256', data).then(buffer => {
        const hashArray = Array.from(new Uint8Array(buffer));
        this.documentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        this.cdr.markForCheck();
      }).catch(() => {
        this.documentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        this.cdr.markForCheck();
      });
    } else {
      this.documentHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    }
  }

  canConfirmSignature(): boolean {
    if (!this.legalConsent || !this.signatureName.trim()) {
      return false;
    }
    if (this.signatureType === 'draw') {
      return this.hasDrawn || this.signatureName.trim().length >= 2;
    }
    return this.signatureName.trim().length >= 2;
  }

  onConfirmSignature(): void {
    if (!this.canConfirmSignature()) return;
    this.isProcessing = true;

    let signatureImage: string | undefined;
    if (this.signatureType === 'draw' && this.hasDrawn && this.signatureCanvas?.nativeElement) {
      try {
        signatureImage = this.signatureCanvas.nativeElement.toDataURL('image/png');
      } catch (e) {
        console.warn('Could not extract signature canvas data', e);
      }
    } else if (this.signatureType === 'type' && this.signatureName.trim()) {
      try {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 400;
        offCanvas.height = 120;
        const ctx = offCanvas.getContext('2d');
        if (ctx) {
          ctx.font = 'italic 600 36px "Brush Script MT", "Caveat", "Dancing Script", cursive, Georgia, serif';
          ctx.fillStyle = '#1e1b4b';
          ctx.textBaseline = 'middle';
          ctx.fillText(this.signatureName.trim(), 20, 60);
          signatureImage = offCanvas.toDataURL('image/png');
        }
      } catch (e) {
        console.warn('Could not generate typed signature image', e);
      }
    }

    this.signer.emit({
      id: this.demande.id,
      signedBy: this.signatureName.trim(),
      signatureImage
    });
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
      this.syncEditorDom();
    }
    if (this.layoutMode === 'split') {
      this.schedulePreviewRefresh();
    }
    this.cdr.markForCheck();
  }

  /**
   * Manually sync the contenteditable div's innerHTML with rawHtml.
   * Angular's [innerHTML] binding does not reliably update contenteditable
   * elements after the browser has taken control of the DOM.
   */
  private syncEditorDom(): void {
    setTimeout(() => {
      if (this.editorContent?.nativeElement) {
        this.editorContent.nativeElement.innerHTML = this.rawHtml;
        this.cdr.markForCheck();
      }
    });
  }
}
