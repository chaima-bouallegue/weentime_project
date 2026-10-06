import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Calendar, AlertCircle, Info, Trash2,
  CheckCircle, Clock, XCircle, Umbrella, Heart,
  Star, ShieldCheck, CircleMinus, HelpCircle, HeartPulse,
  Eye, Pencil
} from 'lucide-angular';
import { DemandeConge, StatutDemande, TypeConge } from '../../models/conge.model';
import { DemandeActionsMenuComponent } from '../../../../../shared/components/demande-actions-menu';

@Component({
  selector: 'app-historique-list',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DemandeActionsMenuComponent],
  templateUrl: './historique-list.component.html',
  styleUrl: './historique-list.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class HistoriqueListComponent {
  @Input() demandes: DemandeConge[] = [];
  @Input() allDemandes: DemandeConge[] = [];
  @Input() isLoading = false;
  @Input() currentFilter: StatutDemande | 'TOUS' = 'TOUS';

  @Output() filterChange = new EventEmitter<StatutDemande | 'TOUS'>();
  @Output() cancelRequest = new EventEmitter<DemandeConge>();
  @Output() viewRequest = new EventEmitter<DemandeConge>();
  @Output() editRequest = new EventEmitter<DemandeConge>();

  readonly iconCalendar = Calendar;
  readonly iconAlert   = AlertCircle;
  readonly iconInfo    = Info;
  readonly iconTrash   = Trash2;
  readonly iconCheck   = CheckCircle;
  readonly iconClock   = Clock;
  readonly iconX       = XCircle;
  readonly iconUmbrella= Umbrella;
  readonly iconHeart   = Heart;
  readonly iconStar    = Star;
  readonly iconShield  = ShieldCheck;
  readonly iconMinus   = CircleMinus;
  readonly iconHelp    = HelpCircle;
  readonly iconBaby    = HeartPulse;
  readonly iconEye     = Eye;
  readonly iconPen     = Pencil;

  filters: { label: string; value: StatutDemande | 'TOUS'; colorClass: string; dotClass: string; badgeClass: string }[] = [
    { label: 'Demandes',   value: 'TOUS',               colorClass: 'tab--all',   dotClass: '',           badgeClass: 'badge--all' },
    { label: 'En attente', value: 'EN_ATTENTE_MANAGER', colorClass: 'tab--amber', dotClass: 'dot--amber', badgeClass: 'badge--amber' },
    { label: 'Approuvées', value: 'APPROUVE',           colorClass: 'tab--green', dotClass: 'dot--green', badgeClass: 'badge--green' },
    { label: 'Refusées',   value: 'REFUSE',             colorClass: 'tab--red',   dotClass: 'dot--red',   badgeClass: 'badge--red' },
    { label: 'Annulées',   value: 'ANNULE',             colorClass: 'tab--gray',  dotClass: 'dot--gray',  badgeClass: 'badge--gray' }
  ];

  getCountForFilter(value: StatutDemande | 'TOUS'): number {
    const list = this.allDemandes?.length ? this.allDemandes : this.demandes;
    if (value === 'TOUS') return list.length;
    if (value === 'EN_ATTENTE_MANAGER') {
      return list.filter(d => d.statut === 'EN_ATTENTE_MANAGER' || d.statut === 'EN_ATTENTE' || d.statut === 'EN_ATTENTE_RH').length;
    }
    if (value === 'APPROUVE') {
      return list.filter(d => d.statut === 'APPROUVE' || d.statut === 'APPROUVEE').length;
    }
    if (value === 'REFUSE') {
      return list.filter(d => d.statut === 'REFUSE' || d.statut === 'REFUSEE').length;
    }
    if (value === 'ANNULE') {
      return list.filter(d => d.statut === 'ANNULE' || d.statut === 'ANNULEE').length;
    }
    return list.filter(d => d.statut === value).length;
  }

  getStatusLabel(statut: StatutDemande): string {
    const labels: Partial<Record<StatutDemande, string>> = {
      EN_ATTENTE:         'En attente',
      EN_ATTENTE_MANAGER: 'En attente',
      EN_ATTENTE_RH:      'En attente RH',
      APPROUVE:           'Approuvée',
      APPROUVEE:          'Approuvée',
      REFUSE:             'Refusée',
      REFUSEE:            'Refusée',
      ANNULE:             'Annulée'
    };
    return labels[statut] || statut;
  }

  getStatusIcon(statut: StatutDemande): any {
    const icons: Partial<Record<StatutDemande, any>> = {
      EN_ATTENTE:         this.iconClock,
      EN_ATTENTE_MANAGER: this.iconClock,
      EN_ATTENTE_RH:      this.iconShield,
      APPROUVE:           this.iconCheck,
      APPROUVEE:          this.iconCheck,
      REFUSE:             this.iconX,
      REFUSEE:            this.iconX,
      ANNULE:             this.iconMinus
    };
    return icons[statut] || this.iconHelp;
  }

  getTypeLabel(type: TypeConge): string {
    const labels: Record<TypeConge, string> = {
      ANNUEL: 'Congé annuel',
      MALADIE: 'Congé maladie',
      RTT: 'RTT',
      MATERNITE_PATERNITE: 'Maternité / Paternité',
      EXCEPTIONNEL: 'Congé exceptionnel',
      SANS_SOLDE: 'Sans solde'
    };
    return labels[type] || 'Congé';
  }

  getTypeIcon(type: TypeConge): any {
    const icons: Record<TypeConge, any> = {
      ANNUEL: this.iconUmbrella,
      MALADIE: this.iconHeart,
      RTT: this.iconClock,
      EXCEPTIONNEL: this.iconStar,
      MATERNITE_PATERNITE: this.iconBaby,
      SANS_SOLDE: this.iconMinus
    };
    return icons[type] || this.iconCalendar;
  }

  getIconClass(type: TypeConge): string {
    const classes: Record<TypeConge, string> = {
      ANNUEL: 'ic-annuel',
      MALADIE: 'ic-maladie',
      RTT: 'ic-rtt',
      EXCEPTIONNEL: 'ic-exceptionnel',
      MATERNITE_PATERNITE: 'ic-maternite',
      SANS_SOLDE: 'ic-sans'
    };
    return classes[type] || 'ic-default';
  }

  canCancel(demande: DemandeConge): boolean {
    return demande.statut === 'EN_ATTENTE_MANAGER' || demande.statut === 'EN_ATTENTE_RH' || demande.statut === 'EN_ATTENTE';
  }

  showDetails(demande: DemandeConge) {
    this.viewRequest.emit(demande);
  }

  onEditRequest(demande: DemandeConge) {
    this.editRequest.emit(demande);
  }
}
