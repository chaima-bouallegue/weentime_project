import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeDocument } from '../../models/document.model';

@Component({
  selector: 'app-annulation-document-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './annulation-document-modal.component.html',
  styleUrl: './annulation-document-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnnulationDocumentModalComponent {
  @Input() demande: DemandeDocument | null = null;
  @Input() isAnnulating = false;

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<number>();

  onConfirm(): void {
    if (this.demande) {
      this.confirm.emit(this.demande.id);
    }
  }

  /**
   * Formate une date ISO (ex: "2026-04-15T16:32:40.062051")
   * en format lisible : "15 avril 2026 à 16:32"
   */
  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }
}