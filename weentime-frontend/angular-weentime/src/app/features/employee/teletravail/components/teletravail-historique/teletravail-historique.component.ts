import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Filter, Search, Calendar, Clock, CheckCircle, XCircle, MinusCircle, Laptop, Sun, Sunrise, Sunset, Home, Trash2, Info, ArrowRight, Eye, Pencil } from 'lucide-angular';
import { DemandeTeletravail, StatutTeletravail, TypeTeletravail } from '../../models/teletravail.model';

interface FilterChip {
  value: StatutTeletravail | 'TOUS' | 'EN_ATTENTE';
  label: string;
}

@Component({
  selector: 'app-teletravail-historique',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './teletravail-historique.component.html',
  styleUrl: './teletravail-historique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class TeletravailHistoriqueComponent {
  @Input() demandes: DemandeTeletravail[] = [];
  @Input() allDemandes: DemandeTeletravail[] = [];
  @Input() isLoading = false;
  @Input() currentFilter: StatutTeletravail | 'TOUS' | 'EN_ATTENTE' = 'TOUS';

  @Output() filterChange = new EventEmitter<StatutTeletravail | 'TOUS' | 'EN_ATTENTE'>();
  @Output() cancelRequest = new EventEmitter<DemandeTeletravail>();
  @Output() viewRequest = new EventEmitter<DemandeTeletravail>();
  @Output() editRequest = new EventEmitter<DemandeTeletravail>();

  // Icons
  readonly iconFilter = Filter;
  readonly iconSearch = Search;
  readonly iconCalendar = Calendar;
  readonly iconClock = Clock;
  readonly iconCheck = CheckCircle;
  readonly iconX = XCircle;
  readonly iconMinus = MinusCircle;
  readonly iconLaptop = Laptop;
  readonly iconSun = Sun;
  readonly iconSunrise = Sunrise;
  readonly iconSunset = Sunset;
  readonly iconHome = Home;
  readonly iconTrash = Trash2;
  readonly iconInfo = Info;
  readonly iconArrowRight = ArrowRight;
  readonly iconEye = Eye;
  readonly iconPen = Pencil;

  filters: FilterChip[] = [
    { value: 'TOUS',       label: 'Tous'       },
    { value: 'EN_ATTENTE', label: 'En attente' },
    { value: 'APPROUVE',   label: 'Approuvés'  },
    { value: 'REFUSE',     label: 'Refusés'    },
    { value: 'ANNULE',     label: 'Annulés'    }
  ];

  getCountForFilter(value: StatutTeletravail | 'TOUS' | 'EN_ATTENTE'): number {
    if (value === 'TOUS') return this.allDemandes.length;
    if (value === 'EN_ATTENTE') {
      return this.allDemandes.filter(d =>
        d.statut === 'EN_ATTENTE' || d.statut === 'EN_ATTENTE_MANAGER' || d.statut === 'EN_ATTENTE_RH'
      ).length;
    }
    if (value === 'APPROUVE') {
      return this.allDemandes.filter(d =>
        d.statut === 'APPROUVE' || d.statut === 'APPROUVEE' || d.statut === 'VALIDEE'
      ).length;
    }
    if (value === 'REFUSE') {
      return this.allDemandes.filter(d =>
        d.statut === 'REFUSE' || d.statut === 'REFUSEE'
      ).length;
    }
    if (value === 'ANNULE') {
      return this.allDemandes.filter(d =>
        d.statut === 'ANNULE' || d.statut === 'ANNULEE'
      ).length;
    }
    return this.allDemandes.filter(d => d.statut === value).length;
  }

  getTypeIcon(type: TypeTeletravail): string {
    switch (type) {
      case 'JOURNEE_COMPLETE': return 'sun';
      case 'DEMI_JOURNEE_MATIN': return 'sunrise';
      case 'DEMI_JOURNEE_APRES_MIDI': return 'sunset';
      case 'SEMAINE_COMPLETE': return 'home';
      default: return 'laptop';
    }
  }

  getTypeColor(type: TypeTeletravail): string {
    switch (type) {
      case 'JOURNEE_COMPLETE': return '#6366f1';
      case 'DEMI_JOURNEE_MATIN': return '#3b82f6';
      case 'DEMI_JOURNEE_APRES_MIDI': return '#f59e0b';
      case 'SEMAINE_COMPLETE': return '#8b5cf6';
      default: return '#64748b';
    }
  }

  getTypeIconRef(type: TypeTeletravail) {
    switch (type) {
      case 'JOURNEE_COMPLETE': return this.iconSun;
      case 'DEMI_JOURNEE_MATIN': return this.iconSunrise;
      case 'DEMI_JOURNEE_APRES_MIDI': return this.iconSunset;
      case 'SEMAINE_COMPLETE': return this.iconHome;
      default: return this.iconLaptop;
    }
  }

  getStatusIconRef(statut: StatutTeletravail) {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER':
      case 'EN_ATTENTE_RH': return this.iconClock;
      case 'APPROUVE': return this.iconCheck;
      case 'REFUSE': return this.iconX;
      case 'ANNULE': return this.iconMinus;
      default: return this.iconInfo;
    }
  }

  getStatusConfig(statut: string): { label: string, color: string, icon: string } {
    switch (statut) {
      case 'EN_ATTENTE':
      case 'EN_ATTENTE_MANAGER':
      case 'EN_ATTENTE_RH': return { label: 'En attente', color: 'warning', icon: 'clock' };
      case 'APPROUVE':
      case 'APPROUVEE':
      case 'VALIDEE':      return { label: 'Approuvé',   color: 'success', icon: 'check-circle' };
      case 'REFUSE':
      case 'REFUSEE':        return { label: 'Refusé',     color: 'danger',  icon: 'x-circle' };
      case 'ANNULE':
      case 'ANNULEE':        return { label: 'Annulé',     color: 'gray',    icon: 'minus-circle' };
      default:              return { label: 'En attente', color: 'warning', icon: 'clock' };
    }
  }

  getTypeLabel(type: TypeTeletravail): string {
    const labels: Record<TypeTeletravail, string> = {
      JOURNEE_COMPLETE: 'Journée complète',
      DEMI_JOURNEE_MATIN: 'Demi-journée matin',
      DEMI_JOURNEE_APRES_MIDI: 'Demi-journée après-midi',
      SEMAINE_COMPLETE: 'Semaine complète'
    };
    return labels[type] || 'Télétravail';
  }

  canCancel(demande: DemandeTeletravail): boolean {
    return demande.statut === 'EN_ATTENTE' || demande.statut === 'EN_ATTENTE_MANAGER' || demande.statut === 'EN_ATTENTE_RH';
  }
}
