import { ChangeDetectionStrategy, Component, inject, signal, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, Clock, MapPin, Video, Search, Plus, Calendar, MoreHorizontal } from 'lucide-angular';
import { ReunionStore } from '../../../core/services/reunion.store';
import { AuthService } from '../../../core/services/auth.service';
import { Reunion, ReunionStatut } from '../../../core/models/reunion.model';

@Component({
  selector: 'app-reunion-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './reunion-dashboard.component.html',
  styleUrls: ['./reunion-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ReunionDashboardComponent {
  private store = inject(ReunionStore);
  private authService = inject(AuthService);

  // Icons
  readonly iconClock = Clock;
  readonly iconMapPin = MapPin;
  readonly iconVideo = Video;
  readonly iconSearch = Search;
  readonly iconPlus = Plus;
  readonly iconCalendar = Calendar;
  readonly iconMore = MoreHorizontal;

  readonly reunions = this.store.reunions;
  readonly isLoading = this.store.isLoading;
  readonly currentUser = computed(() => this.authService.currentUser());

  readonly filter = signal<'all' | 'upcoming' | 'past'>('all');
  readonly searchQuery = signal('');

  getStatusLabel(status: ReunionStatut): string {
    switch (status) {
      case ReunionStatut.PLANIFIEE: return 'Planifiée';
      case ReunionStatut.EN_COURS: return 'En cours';
      case ReunionStatut.CLOTUREE: return 'Terminée';
      case ReunionStatut.ANNULEE: return 'Annulée';
      default: return status;
    }
  }

  getStatusColor(status: ReunionStatut): string {
    switch (status) {
      case ReunionStatut.PLANIFIEE: return '#4f46e5';
      case ReunionStatut.EN_COURS: return '#16a34a';
      case ReunionStatut.CLOTUREE: return '#64748b';
      case ReunionStatut.ANNULEE: return '#dc2626';
      default: return '#64748b';
    }
  }

  getConfirmedCount(reunion: Reunion): number {
    return reunion.participants.filter(p => p.reponse === 'CONFIRME').length;
  }

  readonly filteredReunions = computed(() => {
    let list = this.reunions();
    const query = this.searchQuery().toLowerCase();
    const now = new Date();

    if (query) {
      list = list.filter(r => 
        r.titre.toLowerCase().includes(query) || 
        r.description?.toLowerCase().includes(query)
      );
    }

    if (this.filter() === 'upcoming') {
      list = list.filter(r => new Date(r.dateReunion + 'T' + r.heureDebut) >= now);
    } else if (this.filter() === 'past') {
      list = list.filter(r => new Date(r.dateReunion + 'T' + r.heureDebut) < now);
    }

    return list;
  });

  readonly prochaineReunion = computed(() => {
    const upcoming = this.reunions().filter(r => 
      r.statut !== ReunionStatut.ANNULEE && 
      r.statut !== ReunionStatut.CLOTUREE &&
      new Date(r.dateReunion + 'T' + r.heureDebut) >= new Date()
    );
    return upcoming.sort((a, b) => 
      new Date(a.dateReunion + 'T' + a.heureDebut).getTime() - 
      new Date(b.dateReunion + 'T' + b.heureDebut).getTime()
    )[0] || null;
  });

  readonly countdown = computed(() => {
    const next = this.prochaineReunion();
    if (!next) return null;
    
    // Logic for countdown string...
    const diff = new Date(next.dateReunion + 'T' + next.heureDebut).getTime() - new Date().getTime();
    if (diff < 0) return 'Maintenant';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) return Math.floor(hours / 24) + ' j';
    if (hours > 0) return hours + 'h ' + mins + 'm';
    return mins + 'm';
  });

  isManagerOrRh(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    const roles = user.roles || [];
    return roles.includes('ROLE_MANAGER') || roles.includes('ROLE_RH') || roles.includes('MANAGER') || roles.includes('RH');
  }

  setFilter(f: 'all' | 'upcoming' | 'past') {
    this.filter.set(f);
  }

  onSearch(event: any) {
    this.searchQuery.set(event.target.value);
  }
}
