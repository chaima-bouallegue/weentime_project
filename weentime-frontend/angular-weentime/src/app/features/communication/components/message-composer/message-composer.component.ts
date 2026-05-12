import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal, computed, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CommunicationStoreService } from '../../services/communication-store.service';
import { CommunicationApiService } from '../../services/communication-api.service';
import { OrganisationService, SimpleUser } from '@app/core/services/organisation.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="comm-composer" [class.disabled]="disabled" (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)">
      <div class="comm-composer-container" [class.drag-active]="isDragging()">
        
        <!-- Drag & Drop Overlay -->
        <div class="drag-overlay" *ngIf="isDragging()">
          <div class="drag-msg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Déposez vos fichiers ici</span>
          </div>
        </div>

        <!-- Mention List Popup -->
        <div class="comm-mention-popup" *ngIf="showMentions()">
          <div class="mention-item" 
               *ngFor="let user of filteredUsers(); let i = index"
               [class.active]="i === selectedMentionIndex()"
               (click)="selectMention(user)">
            <span class="mention-avatar">{{ user.prenom[0] }}{{ user.nom[0] }}</span>
            <div class="mention-info">
              <strong>{{ user.prenom }} {{ user.nom }}</strong>
              <small>{{ user.email }}</small>
            </div>
          </div>
          <div class="mention-empty" *ngIf="filteredUsers().length === 0">
            Aucun utilisateur trouvé
          </div>
        </div>

        <!-- File Preview List -->
        <div class="comm-attachment-previews" *ngIf="attachments().length > 0">
          <div class="attachment-preview-item" *ngFor="let file of attachments(); let i = index" [class.uploading]="isUploading()">
            <!-- Image Preview -->
            <div class="img-container" *ngIf="isImage(file)">
              <img [src]="getPreviewUrl(file)" alt="preview">
            </div>
            
            <!-- File Chip (for non-images) -->
            <div class="file-chip" *ngIf="!isImage(file)">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
               <span class="file-name">{{ file.name }}</span>
            </div>

            <!-- Upload Indicator -->
            <div class="upload-indicator" *ngIf="isUploading()">
              <div class="upload-spinner"></div>
            </div>

            <!-- Remove Button (The X like WhatsApp) -->
            <button type="button" class="remove-btn" (click)="removeAttachment(i)" [disabled]="isUploading()" title="Annuler">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div class="comm-composer-toolbar">
          <button type="button" class="tool-btn" title="Émojis" [disabled]="disabled || isUploading()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button type="button" class="tool-btn" title="Joindre un fichier" [disabled]="disabled || isUploading()" (click)="fileInput.click()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <input type="file" #fileInput multiple hidden (change)="handleFileSelect($event)">
          <button type="button" class="tool-btn" title="Mentionner" [disabled]="disabled || isUploading()" (click)="triggerMention()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
          </button>
        </div>

        <div class="comm-composer-input-wrapper">
          <textarea
            #textareaRef
            [(ngModel)]="draft"
            [disabled]="disabled || isUploading()"
            rows="1"
            placeholder="Écrire un message dans #{{ channelName }}..."
            (input)="handleInput()"
            (keydown)="handleKeydown($event)"></textarea>

          <button type="button" 
                  class="send-btn" 
                  [disabled]="disabled || isUploading() || (!trimmedDraft && attachments().length === 0)" 
                  (click)="submit()">
            <svg *ngIf="!isUploading()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <div class="btn-loader" *ngIf="isUploading()"></div>
          </button>
        </div>

        <div class="comm-composer-hints">
          <span *ngIf="!disabled && !isUploading()"><b>Entrée</b> pour envoyer, <b>Maj+Entrée</b> pour une nouvelle ligne</span>
          <span *ngIf="isUploading()">Téléchargement en cours...</span>
          <span *ngIf="disabled">Lecture seule</span>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .comm-composer {
      padding: 16px 24px 24px;
      background: white;
      border-top: 1px solid rgba(83, 74, 183, 0.1);
      position: relative;
    }

    .comm-composer-container {
      max-width: 1000px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      border-radius: 16px;
      transition: all 0.3s ease;
    }

    .drag-active {
      background: rgba(83, 74, 183, 0.03);
      box-shadow: inset 0 0 0 2px dashed #534AB7;
    }

    .drag-overlay {
      position: absolute;
      inset: -10px;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20px;
      border: 2px dashed #534AB7;
      pointer-events: none;
    }

    .drag-msg {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: #534AB7;
    }

    .drag-msg svg { width: 48px; height: 48px; }
    .drag-msg span { font-weight: 700; font-size: 18px; }

    .comm-composer.disabled {
      background: #f8fafc;
      opacity: 0.8;
    }

    .comm-composer-toolbar {
      display: flex;
      gap: 4px;
      padding: 0 4px;
    }

    .tool-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      color: #64748b;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .tool-btn:hover:not(:disabled) {
      background: #EEEDFE;
      color: #534AB7;
    }

    .comm-composer-input-wrapper {
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: 12px;
      background: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 16px;
      padding: 8px 12px;
      transition: all 0.2s ease;
    }

    .comm-composer-input-wrapper:focus-within {
      background: white;
      border-color: #534AB7;
      box-shadow: 0 0 0 4px rgba(83, 74, 183, 0.1);
    }

    textarea {
      flex: 1;
      border: none;
      background: none;
      resize: none;
      padding: 8px 4px;
      font-size: 15px;
      line-height: 1.5;
      color: #1e1b4b;
      font-family: inherit;
      max-height: 200px;
    }

    textarea:focus { outline: none; }

    .send-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 10px;
      background: #534AB7;
      color: white;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      margin-bottom: 2px;
    }

    .send-btn:hover:not(:disabled) {
      background: #4338ca;
      transform: scale(1.05);
    }

    .send-btn:disabled {
      background: #e2e8f0;
      color: #94a3b8;
      cursor: not-allowed;
    }

    .btn-loader {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* Attachment Previews */
    .comm-attachment-previews {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 8px;
    }

    .attachment-preview-item {
      position: relative;
      width: 80px;
      height: 80px;
      border-radius: 12px;
      background: #f1f5f9;
      border: 1px solid rgba(148, 163, 184, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .img-container {
      width: 100%;
      height: 100%;
      border-radius: 12px;
      overflow: hidden;
    }

    .img-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .file-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px;
      text-align: center;
    }

    .file-chip svg { width: 24px; height: 24px; color: #534AB7; }
    .file-name { font-size: 10px; color: #64748b; max-width: 64px; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; }

    .remove-btn {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 22px;
      height: 22px;
      background: #1e1b4b;
      color: white;
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
      z-index: 10;
    }

    .remove-btn:hover { background: #ef4444; transform: scale(1.1); }
    .remove-btn svg { width: 10px; height: 10px; }
    .remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .upload-indicator {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.7);
      backdrop-filter: blur(2px);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
    }

    .upload-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid #534AB7;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .comm-mention-popup {
      position: absolute;
      bottom: 100%;
      left: 0;
      width: 300px;
      max-height: 240px;
      background: white;
      border: 1px solid rgba(83, 74, 183, 0.15);
      border-radius: 16px;
      box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.1);
      margin-bottom: 8px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      z-index: 100;
    }

    .mention-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      cursor: pointer;
    }

    .mention-item:hover, .mention-item.active { background: #EEEDFE; }

    .mention-avatar {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: #8B5CF6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
    }

    .comm-composer-hints {
      font-size: 11px;
      color: #94a3b8;
      padding-left: 12px;
    }
  `]
})
export class MessageComposerComponent implements OnDestroy {
  private readonly store = inject(CommunicationStoreService);
  private readonly api = inject(CommunicationApiService);
  private readonly organisationService = inject(OrganisationService);
  private readonly sanitizer = inject(DomSanitizer);
  
  @Input() disabled = false;
  @Input() typingLabel: string | null = null;
  @Output() submitMessage = new EventEmitter<{ text: string; attachmentIds: string[] }>();
  @Output() typing = new EventEmitter<boolean>();

  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;

  draft = '';
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private previewUrls = new Map<File, string>();

  // Mentions state
  readonly showMentions = signal(false);
  readonly mentionFilter = signal('');
  readonly allUsers = signal<SimpleUser[]>([]);
  readonly selectedMentionIndex = signal(0);

  // Attachments state
  readonly attachments = signal<File[]>([]);
  readonly isUploading = signal(false);
  readonly isDragging = signal(false);

  readonly filteredUsers = computed(() => {
    const filter = this.mentionFilter().toLowerCase();
    return this.allUsers().filter(user => 
      `${user.prenom} ${user.nom}`.toLowerCase().includes(filter) ||
      user.email.toLowerCase().includes(filter)
    ).slice(0, 8);
  });

  constructor() {
    this.organisationService.getUsers(0, 100)
      .pipe(takeUntilDestroyed())
      .subscribe(page => this.allUsers.set(page.content));
  }

  ngOnDestroy(): void {
    this.cleanupPreviews();
  }

  private get textareaEl(): HTMLTextAreaElement | null {
    return this.textareaRef?.nativeElement ?? null;
  }

  get channelName(): string {
    return this.store.activeChannel()?.name || '';
  }

  get trimmedDraft(): string {
    return this.draft.trim();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled) this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    if (this.disabled) return;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.addFiles(Array.from(files));
    }
  }

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = '';
    }
  }

  private addFiles(files: File[]): void {
    const validFiles = files.filter(f => f.size <= 10 * 1024 * 1024);
    if (validFiles.length < files.length) {
      alert('Certains fichiers dépassent la limite de 10 Mo.');
    }
    this.attachments.update(current => [...current, ...validFiles]);
  }

  removeAttachment(index: number): void {
    const fileToRemove = this.attachments()[index];
    if (fileToRemove) {
      const url = this.previewUrls.get(fileToRemove);
      if (url) {
        URL.revokeObjectURL(url);
        this.previewUrls.delete(fileToRemove);
      }
    }
    this.attachments.update(current => current.filter((_, i) => i !== index));
  }

  isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  getPreviewUrl(file: File): SafeUrl {
    if (!this.previewUrls.has(file)) {
      this.previewUrls.set(file, URL.createObjectURL(file));
    }
    return this.sanitizer.bypassSecurityTrustUrl(this.previewUrls.get(file)!);
  }

  private cleanupPreviews(): void {
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.previewUrls.clear();
  }

  handleKeydown(event: KeyboardEvent): void {
    if (this.showMentions()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectedMentionIndex.update(idx => (idx + 1) % Math.max(1, this.filteredUsers().length));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectedMentionIndex.update(idx => (idx - 1 + this.filteredUsers().length) % Math.max(1, this.filteredUsers().length));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const users = this.filteredUsers();
        if (users.length > 0) {
          event.preventDefault();
          this.selectMention(users[this.selectedMentionIndex()]);
          return;
        }
      }
      if (event.key === 'Escape') {
        this.showMentions.set(false);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  handleInput(): void {
    if (this.disabled) return;
    this.typing.emit(true);
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.typing.emit(false), 1200);

    const ta = this.textareaEl;
    if (!ta) return;
    const cursor = ta.selectionStart ?? 0;
    const textBefore = this.draft.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');

    if (lastAt !== -1 && (lastAt === 0 || textBefore[lastAt - 1] === ' ' || textBefore[lastAt - 1] === '\n')) {
      const filter = textBefore.slice(lastAt + 1);
      if (!filter.includes(' ')) {
        this.mentionFilter.set(filter);
        this.showMentions.set(true);
        this.selectedMentionIndex.set(0);
        return;
      }
    }
    this.showMentions.set(false);
  }

  selectMention(user: SimpleUser): void {
    const ta = this.textareaEl;
    const cursor = ta?.selectionStart ?? 0;
    const textBefore = this.draft.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');
    const mentionText = `@${user.prenom} ${user.nom} `;
    this.draft = this.draft.slice(0, lastAt) + mentionText + this.draft.slice(cursor);
    this.showMentions.set(false);
    setTimeout(() => {
      if (ta) {
        ta.focus();
        const newCursor = lastAt + mentionText.length;
        ta.setSelectionRange(newCursor, newCursor);
      }
    });
  }

  triggerMention(): void {
    if (this.disabled) return;
    const ta = this.textareaEl;
    if (!ta) return;
    ta.focus();
    const cursor = ta.selectionStart ?? this.draft.length;
    const prefix = (cursor > 0 && this.draft[cursor - 1] !== ' ' && this.draft[cursor - 1] !== '\n') ? ' @' : '@';
    this.draft = this.draft.slice(0, cursor) + prefix + this.draft.slice(cursor);
    this.showMentions.set(true);
    this.mentionFilter.set('');
    this.selectedMentionIndex.set(0);
    setTimeout(() => {
      ta.focus();
      const newCursor = cursor + prefix.length;
      ta.setSelectionRange(newCursor, newCursor);
    });
  }

  submit(): void {
    if (this.disabled || this.isUploading() || (!this.trimmedDraft && this.attachments().length === 0)) return;
    
    if (this.attachments().length > 0) {
      this.uploadAndSubmit();
    } else {
      this.emitAndClear([]);
    }
  }

  private uploadAndSubmit(): void {
    this.isUploading.set(true);
    this.api.uploadAttachments(this.attachments())
      .pipe(
        finalize(() => this.isUploading.set(false))
      )
      .subscribe({
        next: (responses) => {
          const ids = responses.map(r => r.id);
          this.emitAndClear(ids);
        },
        error: (err) => {
          alert('Erreur lors du téléchargement des fichiers: ' + err.message);
        }
      });
  }

  private emitAndClear(attachmentIds: string[]): void {
    this.submitMessage.emit({ text: this.trimmedDraft, attachmentIds });
    this.typing.emit(false);
    this.draft = '';
    this.cleanupPreviews();
    this.attachments.set([]);
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }
}
