import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy, ViewEncapsulation, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Clock, Eye, Trash2, AlertCircle, CheckCircle, Calendar, Timer, Info, Search, Shield, Briefcase, Sparkles, User, UserCheck, ArrowRight, List, Loader2, Stethoscope, LogOut, AlarmClock, Laptop, Coffee, Hourglass } from 'lucide-angular';
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

  expandedId = signal<number | null>(null);

  toggleDetails(id: number): void {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
    } else {
      this.expandedId.set(id);
    }
  }

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
      'EN_ATTENTE': 'En attente',
      'PENDING': 'En attente',
      'PENDING_MANAGER': 'Attente Manager',
      'PENDING_RH': 'Attente RH',
      'APPROUVE': 'Approuvé',
      'APPROVED': 'Approuvé',
      'VALIDEE': 'Approuvé',
      'REFUSE': 'Refusé',
      'REFUSEE': 'Refusé',
      'REJECTED': 'Refusé',
      'ANNULE': 'Annulé',
      'CANCELLED': 'Annulé'
    };
    return statuts[statut] || statut;
  }

  getStatusClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER:
      case StatutAutorisation.EN_ATTENTE:
      case StatutAutorisation.PENDING:
      case StatutAutorisation.PENDING_MANAGER:
        return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
      case StatutAutorisation.EN_ATTENTE_RH:
      case StatutAutorisation.PENDING_RH:
        return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20';
      case StatutAutorisation.APPROUVE:
      case StatutAutorisation.APPROVED:
      case StatutAutorisation.VALIDEE:
        return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
      case StatutAutorisation.REFUSE:
      case StatutAutorisation.REFUSEE:
      case StatutAutorisation.REJECTED:
        return 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20';
      default:
        return 'bg-slate-50 dark:bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-500/20';
    }
  }

  getStatusDotClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER:
      case StatutAutorisation.EN_ATTENTE:
      case StatutAutorisation.PENDING:
      case StatutAutorisation.PENDING_MANAGER:
        return 'bg-amber-500';
      case StatutAutorisation.EN_ATTENTE_RH:
      case StatutAutorisation.PENDING_RH:
        return 'bg-indigo-500';
      case StatutAutorisation.APPROUVE:
      case StatutAutorisation.APPROVED:
      case StatutAutorisation.VALIDEE:
        return 'bg-emerald-500';
      case StatutAutorisation.REFUSE:
      case StatutAutorisation.REFUSEE:
      case StatutAutorisation.REJECTED:
        return 'bg-rose-500';
      default:
        return 'bg-slate-500';
    }
  }

  getStatusIcon(statut: StatutAutorisation): any {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER:
      case StatutAutorisation.EN_ATTENTE:
      case StatutAutorisation.PENDING:
      case StatutAutorisation.PENDING_MANAGER:
        return this.iconClock;
      case StatutAutorisation.EN_ATTENTE_RH:
      case StatutAutorisation.PENDING_RH:
        return this.iconShield;
      case StatutAutorisation.APPROUVE:
      case StatutAutorisation.APPROVED:
      case StatutAutorisation.VALIDEE:
        return this.iconCheck;
      case StatutAutorisation.REFUSE:
      case StatutAutorisation.REFUSEE:
      case StatutAutorisation.REJECTED:
        return this.iconAlert;
      default:
        return this.iconClock;
    }
  }

  getTypeIcon(type: TypeAutorisation): any {
    switch (type) {
      case TypeAutorisation.RDV_MEDICAL: return Stethoscope;
      case TypeAutorisation.SORTIE_ANTICIPEE: return LogOut;
      case TypeAutorisation.ARRIVEE_TARDIVE: return AlarmClock;
      case TypeAutorisation.TELETRAVAIL_EXCEPTIONNEL: return Laptop;
      case TypeAutorisation.PAUSE_LONGUE: return Coffee;
      case TypeAutorisation.MI_TEMPS_EXCEPTIONNEL: return Hourglass;
      default: return Timer;
    }
  }

  getTypeColor(type: TypeAutorisation): string {
    switch (type) {
      case TypeAutorisation.RDV_MEDICAL: return '#f43f5e';
      case TypeAutorisation.SORTIE_ANTICIPEE: return '#f59e0b';
      case TypeAutorisation.ARRIVEE_TARDIVE: return '#3b82f6';
      case TypeAutorisation.TELETRAVAIL_EXCEPTIONNEL: return '#6366f1';
      case TypeAutorisation.PAUSE_LONGUE: return '#10b981';
      case TypeAutorisation.MI_TEMPS_EXCEPTIONNEL: return '#8b5cf6';
      default: return '#64748b';
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
    return statut === StatutAutorisation.EN_ATTENTE_MANAGER || 
           statut === StatutAutorisation.EN_ATTENTE_RH ||
           statut === StatutAutorisation.EN_ATTENTE ||
           statut === StatutAutorisation.PENDING ||
           statut === StatutAutorisation.PENDING_MANAGER ||
           statut === StatutAutorisation.PENDING_RH;
  }
}
