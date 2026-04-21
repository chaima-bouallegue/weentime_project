import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Clock, Eye, Trash2, AlertCircle, CheckCircle, Calendar, Timer, Info, Search, Shield, Briefcase, Sparkles, User, UserCheck, ArrowRight, List, Loader2 } from 'lucide-angular';
import { Autorisation, StatutAutorisation, TypeAutorisation } from '../../../../../core/models/autorisation.model';

@Component({
  selector: 'app-autorisation-history',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './autorisation-history.component.html',
  styleUrl: './autorisation-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class AutorisationHistoryComponent {
  @Input() demandes: Autorisation[] = [];
  @Input() cancellingId: number | null = null;
  @Output() cancelRequest = new EventEmitter<Autorisation>();

  // Icons
  readonly iconClock = Clock;
  readonly iconEye = Eye;
  readonly iconTrash = Trash2;
  readonly iconAlert = AlertCircle;
  readonly iconCheck = CheckCircle;
  readonly iconCalendar = Calendar;
  readonly iconTimer = Timer;
  readonly iconInfo = Info;
  readonly iconSearch = Search;
  readonly iconShield = Shield;
  readonly iconBriefcase = Briefcase;
  readonly iconSparkles = Sparkles;
  readonly iconUser = User;
  readonly iconUserCheck = UserCheck;
  readonly iconArrowRight = ArrowRight;
  readonly iconList = List;
  readonly iconLoader = Loader2;

  formatType(type: TypeAutorisation): string {
    const types: Record<string, string> = {
      'SORTIE_ANTICIPEE': 'Sortie anticipée',
      'ARRIVEE_TARDIVE': 'Arrivée tardive',
      'RDV_MEDICAL': 'RDV Médical',
      'PAUSE_LONGUE': 'Pause longue',
      'TELETRAVAIL_EXCEPTIONNEL': 'Télétravail exp.',
      'MI_TEMPS_EXCEPTIONNEL': 'Mi-temps exp.',
      'AUTRE': 'Autre'
    };
    return types[type] || type;
  }

  formatStatut(statut: StatutAutorisation): string {
    const statuts: Record<string, string> = {
      'EN_ATTENTE_MANAGER': 'Attente Manager',
      'EN_ATTENTE_RH': 'Attente RH',
      'APPROUVE': 'Approuvé',
      'REFUSE': 'Refusé',
      'ANNULE': 'Annulé'
    };
    return statuts[statut] || statut;
  }

  getStatusClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER: return 'bg-amber-50 text-amber-700 border-amber-200';
      case StatutAutorisation.EN_ATTENTE_RH: return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case StatutAutorisation.APPROUVE: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case StatutAutorisation.REFUSE: return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  }

  getStatusDotClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER: return 'bg-amber-500';
      case StatutAutorisation.EN_ATTENTE_RH: return 'bg-indigo-500';
      case StatutAutorisation.APPROUVE: return 'bg-emerald-500';
      case StatutAutorisation.REFUSE: return 'bg-rose-500';
      default: return 'bg-gray-500';
    }
  }

  formatDuree(minutes: number): string {
    if (!minutes) return '0min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    return `${h}h ${m.toString().padStart(2, '0')}min`;
  }

  canCancel(statut: StatutAutorisation): boolean {
    return statut === StatutAutorisation.EN_ATTENTE_MANAGER || statut === StatutAutorisation.EN_ATTENTE_RH;
  }
}
