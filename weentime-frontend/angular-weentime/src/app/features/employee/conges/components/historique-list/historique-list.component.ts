import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Calendar, AlertCircle, Info, Trash2, CheckCircle, Clock, XCircle, Umbrella, Heart, Star, ShieldCheck, MinusCircle, HelpCircle } from 'lucide-angular';
import { DemandeConge, StatutDemande } from '../../models/conge.model';

@Component({
  selector: 'app-historique-list',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './historique-list.component.html',
  styleUrl: './historique-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class HistoriqueListComponent {
  @Input() demandes: DemandeConge[] = [];
  @Input() isLoading = false;
  @Input() currentFilter: StatutDemande | 'TOUS' = 'TOUS';

  @Output() filterChange = new EventEmitter<StatutDemande | 'TOUS'>();
  @Output() cancelRequest = new EventEmitter<DemandeConge>();

  readonly iconCalendar = Calendar;
  readonly iconAlert = AlertCircle;
  readonly iconInfo = Info;
  readonly iconTrash = Trash2;
  readonly iconCheck = CheckCircle;
  readonly iconClock = Clock;
  readonly iconX = XCircle;
  readonly iconUmbrella = Umbrella;
  readonly iconHeart = Heart;
  readonly iconStar = Star;
  readonly iconShield = ShieldCheck;
  readonly iconMinus = MinusCircle;
  readonly iconHelp = HelpCircle;

  filters: { label: string; value: StatutDemande | 'TOUS'; color: string }[] = [
    { label: 'Tous', value: 'TOUS', color: '#6366f1' },
    { label: 'Attente Manager', value: 'EN_ATTENTE_MANAGER', color: '#f59e0b' },
    { label: 'Attente RH', value: 'EN_ATTENTE_RH', color: '#8b5cf6' },
    { label: 'Approuvés', value: 'APPROUVE', color: '#10b981' },
    { label: 'Refusés', value: 'REFUSE', color: '#ef4444' },
    { label: 'Annulés', value: 'ANNULE', color: '#94a3b8' }
  ];

  getStatusLabel(statut: StatutDemande): string {
    const labels: Partial<Record<StatutDemande, string>> = {
      EN_ATTENTE: 'En attente',
      EN_ATTENTE_MANAGER: 'Attente Manager',
      EN_ATTENTE_RH: 'Attente RH',
      APPROUVE: 'Approuvé',
      APPROUVEE: 'Approuvé',
      REFUSE: 'Refusé',
      REFUSEE: 'Refusé',
      ANNULE: 'Annulé'
    };
    return labels[statut] || statut;
  }

  getStatusIcon(statut: StatutDemande): any {
    const icons: Partial<Record<StatutDemande, any>> = {
      EN_ATTENTE: this.iconClock,
      EN_ATTENTE_MANAGER: this.iconClock,
      EN_ATTENTE_RH: this.iconShield,
      APPROUVE: this.iconCheck,
      APPROUVEE: this.iconCheck,
      REFUSE: this.iconX,
      REFUSEE: this.iconX,
      ANNULE: this.iconMinus
    };
    return icons[statut] || this.iconHelp;
  }

  getTypeIcon(typeNom?: string): any {
    const name = typeNom?.toLowerCase() || '';
    if (name.includes('annuel')) return this.iconUmbrella;
    if (name.includes('maladie')) return this.iconHeart;
    if (name.includes('rtt')) return this.iconClock;
    if (name.includes('exceptionnel')) return this.iconStar;
    return this.iconCalendar;
  }
}
