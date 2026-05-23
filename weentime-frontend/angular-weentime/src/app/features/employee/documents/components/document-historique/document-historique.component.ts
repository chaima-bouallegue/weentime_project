import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, FileText, Download, Clock, Loader2, Check, X, AlertCircle, MinusCircle, Filter, Trash2, Shield, Calendar, Sparkles, Briefcase, FileSignature, Wallet, GraduationCap, HeartPulse } from 'lucide-angular';
import { DemandeDocument, StatutDocument, TypeDocumentConfig } from '../../models/document.model';
import { DocumentStatusBadgeComponent } from '../document-status-badge/document-status-badge.component';

interface FilterChip {
  value: StatutDocument | 'TOUS';
  label: string;
}

@Component({
  selector: 'app-document-historique',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DocumentStatusBadgeComponent],
  templateUrl: './document-historique.component.html',
  styleUrl: './document-historique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DocumentHistoriqueComponent {
  @Input() demandes: DemandeDocument[] = [];
  @Input() allDemandes: DemandeDocument[] = [];
  @Input() isLoading = false;
  @Input() currentFilter: StatutDocument | 'TOUS' = 'TOUS';
  @Input() typesConfig: TypeDocumentConfig[] = [];

  @Output() filterChange = new EventEmitter<StatutDocument | 'TOUS'>();
  @Output() cancelRequest = new EventEmitter<DemandeDocument>();
  @Output() downloadRequest = new EventEmitter<DemandeDocument>();

  // Icons
  readonly iconFile = FileText;
  readonly iconDownload = Download;
  readonly iconClock = Clock;
  readonly iconLoader = Loader2;
  readonly iconCheck = Check;
  readonly iconX = X;
  readonly iconAlert = AlertCircle;
  readonly iconMinus = MinusCircle;
  readonly iconTrash = Trash2;
  readonly iconFilter = Filter;

  readonly typeIcons: Record<string, any> = {
    'attestation_salaire': Wallet,
    'attestation_travail': Briefcase,
    'fiche_paie': FileSignature,
    'titre_conge': Sparkles,
    'domiciliation_salaire': Shield,
    'bordereau_cnss': HeartPulse,
    'attestation_formation': GraduationCap,
    'default': FileText
  };

  filters: FilterChip[] = [
    { value: 'TOUS', label: 'Tous' },
    { value: 'EN_ATTENTE', label: 'En attente RH' },
    { value: 'EN_COURS', label: 'En cours' },
    { value: 'PRET', label: 'Prêts' },
    { value: 'REFUSE', label: 'Refusés' },
    { value: 'ANNULE', label: 'Annulés' }
  ];

  getCountForFilter(value: StatutDocument | 'TOUS'): number {
    if (value === 'TOUS') return this.allDemandes.length;
    return this.allDemandes.filter(d => d.statut === value).length;
  }

  getConfigForType(demande: DemandeDocument): TypeDocumentConfig | undefined {
    return this.typesConfig.find(t => t.type === demande.type);
  }

  getEmptyMessage(): string {
    const msgs: Record<string, string> = {
      TOUS: 'Aucune demande de document pour le moment',
      EN_ATTENTE: 'Aucune demande en attente RH',
      EN_COURS: 'Aucune demande en cours de traitement',
      PRET: 'Aucun document prêt à télécharger',
      REFUSE: 'Aucune demande refusée',
      ANNULE: 'Aucune demande annulée'
    };
    return msgs[this.currentFilter] ?? 'Aucune demande';
  }

  getEmptyIcon(): any {
    const icons: Record<string, any> = {
      TOUS: this.iconFile,
      EN_ATTENTE: this.iconClock,
      EN_COURS: this.iconLoader,
      PRET: this.iconCheck,
      REFUSE: this.iconX,
      ANNULE: this.iconMinus
    };
    return icons[this.currentFilter] ?? this.iconFile;
  }

  getTypeIcon(icone?: string): any {
    if (!icone) return this.iconFile;
    return this.typeIcons[icone.toLowerCase()] || this.typeIcons['default'];
  }
}
