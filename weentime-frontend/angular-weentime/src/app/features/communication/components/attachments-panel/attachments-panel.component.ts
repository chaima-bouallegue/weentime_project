import { Component, EventEmitter, Input, Output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModel, AttachmentModel } from '../../models/communication.models';

@Component({
  selector: 'app-attachments-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="comm-side-panel">
      <header class="panel-header">
        <div class="header-content">
          <h3>Fichiers partagés</h3>
          <span class="file-count">{{ allAttachments().length }} fichiers trouvés</span>
        </div>
        <button class="close-btn" (click)="close.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="panel-body">
        <div *ngIf="allAttachments().length === 0" class="empty-files">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          <p>Aucun fichier partagé dans cette conversation.</p>
        </div>

        <div class="file-grid" *ngIf="allAttachments().length > 0">
          <div *ngFor="let file of allAttachments()" class="file-item">
            <div class="file-preview">
              <img *ngIf="isImage(file.contentType)" [src]="file.url" [alt]="file.originalName">
              <div *ngIf="!isImage(file.contentType)" class="file-icon">
                {{ getFileExt(file.originalName) }}
              </div>
            </div>
            <div class="file-info">
              <span class="file-name" [title]="file.originalName">{{ file.originalName }}</span>
              <div class="file-meta">
                <span>{{ formatSize(file.fileSize) }}</span>
                <span class="dot">·</span>
                <a [href]="file.url" target="_blank" class="download-link">Télécharger</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .comm-side-panel {
      width: 350px;
      height: 100%;
      background: white;
      border-left: 1px solid rgba(83, 74, 183, 0.1);
      display: flex;
      flex-direction: column;
      box-shadow: -20px 0 60px rgba(15, 23, 42, 0.08);
      z-index: 150;
      animation: slideIn 0.3s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .panel-header {
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(83, 74, 183, 0.05);
    }

    .header-content h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #1e1b4b;
    }

    .file-count {
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: #FFFFFF;
      color: #64748b;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: #FFFFFF;
      color: #1e1b4b;
    }

    .close-btn svg {
      width: 18px;
      height: 18px;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .empty-files {
      height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      text-align: center;
    }

    .empty-files svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    .empty-files p {
      font-size: 14px;
      max-width: 200px;
    }

    .file-grid {
      display: grid;
      gap: 16px;
    }

    .file-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 12px;
      background: #FFFFFF;
      border: 1px solid rgba(83, 74, 183, 0.05);
      transition: all 0.2s ease;
    }

    .file-item:hover {
      background: white;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.08);
      transform: translateY(-2px);
    }

    .file-preview {
      width: 50px;
      height: 50px;
      border-radius: 8px;
      overflow: hidden;
      background: #e2e8f0;
      flex-shrink: 0;
    }

    .file-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .file-icon {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
    }

    .file-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      justify-content: center;
    }

    .file-name {
      font-size: 13px;
      font-weight: 700;
      color: #1e1b4b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #64748b;
    }

    .download-link {
      color: #534AB7;
      text-decoration: none;
      font-weight: 700;
    }

    .download-link:hover {
      text-decoration: underline;
    }

    .dot {
      opacity: 0.5;
    }
  `]
})
export class AttachmentsPanelComponent {
  @Input() messages: MessageModel[] = [];
  @Output() close = new EventEmitter<void>();

  readonly allAttachments = computed(() => {
    const list: AttachmentModel[] = [];
    this.messages.forEach(msg => {
      if (msg.attachments && msg.attachments.length > 0) {
        list.push(...msg.attachments);
      }
    });
    return list;
  });

  isImage(contentType?: string): boolean {
    return !!contentType?.startsWith('image/');
  }

  getFileExt(name?: string): string {
    if (!name) return 'FILE';
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop()!.toUpperCase() : 'FILE';
  }

  formatSize(bytes?: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
