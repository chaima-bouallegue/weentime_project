import { Component, Input, OnChanges, SimpleChanges, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RhDocumentService } from '../../rh-document.service';
import { DocumentAuditEntry } from '../../models/document-audit.model';

interface TimelineVisual {
  icon: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
}

@Component({
  selector: 'app-document-timeline',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-timeline.component.html',
  styleUrl: './document-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentTimelineComponent implements OnChanges {
  private readonly documentService = inject(RhDocumentService);

  @Input({ required: true }) documentId!: number;
  @Input() refreshTrigger = 0;

  entries = signal<DocumentAuditEntry[]>([]);
  isLoading = signal(false);
  loadError = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId'] || changes['refreshTrigger']) {
      this.load();
    }
  }

  load(): void {
    if (!this.documentId) return;
    this.isLoading.set(true);
    this.loadError.set(false);
    this.documentService.getDocumentAudit(this.documentId).subscribe({
      next: (data: DocumentAuditEntry[]) => {
        this.entries.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.entries.set([]);
        this.isLoading.set(false);
        this.loadError.set(true);
      }
    });
  }

  relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days} j`;
  }

  visual(entry: DocumentAuditEntry): TimelineVisual {
    switch (entry.action) {
      case 'DOCUMENT_REQUESTED': return { icon: 'inbox', tone: 'brand' };
      case 'DOCUMENT_CANCELLED': return { icon: 'slash', tone: 'neutral' };
      case 'PROCESSING_STARTED': return { icon: 'loader-2', tone: 'brand' };
      case 'CONTENT_MODIFIED': return { icon: 'file-pen', tone: 'brand' };
      case 'DOCUMENT_VALIDATED': return { icon: 'shield-check', tone: 'success' };
      case 'DOCUMENT_SIGNED': return { icon: 'pen-tool', tone: 'brand' };
      case 'DOCUMENT_SENT': return { icon: 'send', tone: 'success' };
      case 'EMAIL_SENT': return { icon: 'mail', tone: 'success' };
      case 'AI_GENERATION_SUCCESS': return { icon: 'sparkles', tone: 'brand' };
      case 'DOCUMENT_UPLOADED': return { icon: 'upload', tone: 'brand' };
      case 'DOCUMENT_DOWNLOADED': return { icon: 'download', tone: 'neutral' };
      case 'DOCUMENT_REFUSED': return { icon: 'x-circle', tone: 'danger' };
      case 'STATUS_CHANGED': return { icon: 'git-branch', tone: 'warning' };
      default: return { icon: 'minus-circle', tone: 'neutral' };
    }
  }
}
