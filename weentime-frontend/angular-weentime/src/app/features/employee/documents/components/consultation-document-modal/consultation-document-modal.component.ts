import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Info, X, Download, Pencil, FileText } from 'lucide-angular';
import { DemandeDocument, StatutDocument } from '../../models/document.model';
import { ModalService } from '@app/core/services/modal.service';

@Component({
  selector: 'app-consultation-document-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './consultation-document-modal.component.html',
  styleUrl: './consultation-document-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ConsultationDocumentModalComponent implements OnInit, OnDestroy {
  private readonly modalService = inject(ModalService);

  readonly iconInfo = Info;
  readonly iconX = X;
  readonly iconDownload = Download;
  readonly iconPencil = Pencil;
  readonly iconFile = FileText;

  @Input() demande: DemandeDocument | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<DemandeDocument>();
  @Output() download = new EventEmitter<DemandeDocument>();

  ngOnInit(): void {
    this.modalService.open();
  }

  ngOnDestroy(): void {
    this.modalService.close();
  }

  canModify(demande: DemandeDocument | null): boolean {
    if (!demande) return false;
    return demande.statut === 'EN_ATTENTE' || demande.statut === 'PENDING';
  }

  canDownload(demande: DemandeDocument | null): boolean {
    if (!demande) return false;
    return demande.statut === 'PRET' || demande.statut === 'READY';
  }

  getStatusLabel(statut: StatutDocument): string {
    const labels: Partial<Record<StatutDocument, string>> = {
      EN_ATTENTE: 'En attente RH',
      PENDING: 'En attente RH',
      EN_COURS: 'En cours de traitement',
      GENERATING: 'Génération en cours',
      PRET: 'Prêt à télécharger',
      READY: 'Prêt à télécharger',
      REFUSE: 'Refusé',
      REJECTED: 'Refusé',
      ANNULE: 'Annulé'
    };
    return labels[statut] || statut;
  }
}
