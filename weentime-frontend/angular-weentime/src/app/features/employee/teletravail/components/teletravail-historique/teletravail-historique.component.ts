import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Filter, Search, Calendar, Clock, CheckCircle, XCircle, MinusCircle, Laptop, Sun, Sunrise, Sunset, Home, Trash2, Info, ArrowRight } from 'lucide-angular';
import { DemandeTeletravail, StatutTeletravail, TypeTeletravail } from '../../models/teletravail.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';

interface FilterChip {
  value: StatutTeletravail | 'TOUS';
  label: string;
}

@Component({
  selector: 'app-teletravail-historique',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DateFrPipe],
  templateUrl: './teletravail-historique.component.html',
  styleUrl: './teletravail-historique.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class TeletravailHistoriqueComponent {
  @Input() demandes: DemandeTeletravail[] = [];
  @Input() allDemandes: DemandeTeletravail[] = [];
  @Input() isLoading = false;
  @Input() currentFilter: StatutTeletravail | 'TOUS' = 'TOUS';

  @Output() filterChange = new EventEmitter<StatutTeletravail | 'TOUS'>();
  @Output() cancelRequest = new EventEmitter<DemandeTeletravail>();

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

  filters: FilterChip[] = [
    { value: 'TOUS', label: 'Tous' },
    { value: 'EN_ATTENTE_MANAGER', label: 'En attente Manager' },
    { value: 'EN_ATTENTE_RH', label: 'En attente RH' },
    { value: 'APPROUVE', label: 'Approuvés' },
    { value: 'REFUSE', label: 'Refusés' },
    { value: 'ANNULE', label: 'Annulés' }
  ];

  getCountForFilter(value: StatutTeletravail | 'TOUS'): number {
    if (value === 'TOUS') return this.allDemandes.length;
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

  getStatusConfig(statut: StatutTeletravail): { label: string, color: string, icon: string } {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER': return { label: 'Attente Manager', color: 'warning', icon: 'clock' };
      case 'EN_ATTENTE_RH': return { label: 'Attente RH', color: 'indigo', icon: 'clock' };
      case 'APPROUVE': return { label: 'Approuvé', color: 'success', icon: 'check-circle' };
      case 'REFUSE': return { label: 'Refusé', color: 'danger', icon: 'x-circle' };
      case 'ANNULE': return { label: 'Annulé', color: 'gray', icon: 'minus-circle' };
      default: return { label: 'En traitement', color: 'gray', icon: 'info' };
    }
  }
}
