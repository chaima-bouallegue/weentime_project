import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Users, Clock, AlertCircle, Calendar, ChevronLeft, ChevronRight, TrendingUp, Search, Download, LayoutGrid, List, FileText, FileSpreadsheet } from 'lucide-angular';
import { ManagerPresenceService } from './manager-presence.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TeamMemberStatus, PresenceKPIs, PresenceStatus } from './presence.models';
import { animate, style, transition, trigger, query, stagger } from '@angular/animations';

@Component({
  selector: 'app-manager-presence',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './manager-presence.component.html',
  styleUrls: ['./manager-presence.component.scss'],
  animations: [
    trigger('listAnimation', [
      transition('* <=> *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(15px)' }),
          stagger('50ms', animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('0.3s ease-in', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class ManagerPresenceComponent implements OnInit {
  private presenceService = inject(ManagerPresenceService);
  private exportService = inject(ExportService);
  private toastService = inject(ToastService);
  public authService = inject(AuthService);

  // Icons
  iconUsers = Users;
  iconClock = Clock;
  iconAlert = AlertCircle;
  iconCalendar = Calendar;
  iconLeft = ChevronLeft;
  iconRight = ChevronRight;
  iconTrend = TrendingUp;
  iconSearch = Search;
  iconDownload = Download;
  iconKanban = LayoutGrid;
  iconTable = List;
  iconPdf = FileText;
  iconExcel = FileSpreadsheet;

  // State
  teamStatus = signal<TeamMemberStatus[]>([]);
  kpis = signal<PresenceKPIs | null>(null);
  isLoading = signal(true);
  searchQuery = signal('');
  viewMode = signal<'table' | 'kanban'>('table');
  readonly statuses: PresenceStatus[] = ['ACTIVE', 'LATE', 'ABSENT', 'OFF'];

  displayDate = computed(() => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }));

  // Filtered Team computed
  filteredTeam = computed(() => {
    const query = this.searchQuery().toLowerCase();
    return this.teamStatus().filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.jobTitle.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    // We avoid calling loadData if it was somehow already triggered
    this.loadData();
  }

  loadData(): void {
    if (this.isLoading() && this.teamStatus().length > 0) {
      return;
    }

    this.isLoading.set(true);
    const teamId = this.authService.currentUser()?.equipe?.id ?? null;
    this.presenceService.getTeamPresence(teamId).subscribe({
      next: (response) => {
        this.teamStatus.set(response.members);
        this.kpis.set(response.kpis);
        this.isLoading.set(false);
      },
      error: () => {
        this.toastService.error("Impossible de charger la presence de l'equipe.");
        this.isLoading.set(false);
      }
    });
  }

  prevDay(): void {
    this.toastService.info("L'historique journalier n'est pas encore disponible pour les jours precedents.");
  }

  nextDay(): void {
    this.toastService.info("L'historique journalier n'est pas encore disponible pour les jours suivants.");
  }

  today(): void {
    this.loadData();
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'emerald';
      case 'LATE': return 'amber';
      case 'ABSENT': return 'rose';
      case 'OFF': return 'slate';
      default: return 'indigo';
    }
  }

  formatStatus(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'En poste';
      case 'LATE': return 'En retard';
      case 'ABSENT': return 'Absent';
      case 'OFF': return 'Repos';
      default: return status;
    }
  }

  formatDuration(minutes: number): string {
    if (minutes === 0) return '--:--';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m.toString().padStart(2, '0')}`;
  }

  getMembersByStatus(status: PresenceStatus): TeamMemberStatus[] {
    return this.filteredTeam().filter(m => m.status === status);
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }

  onExport(format: 'pdf' | 'excel'): void {
    const data = this.filteredTeam().map(member => ({
      Collaborateur: member.name,
      Poste: member.jobTitle,
      Statut: this.formatStatus(member.status),
      Arrivée: member.arrivalTime || '--:--',
      'Lieu entree': member.checkInLocation || '',
      Sortie: member.departureTime || '--:--',
      'Lieu sortie': member.checkOutLocation || '',
      Total: this.formatDuration(member.totalMinutes),
      'Heures Supp': member.overtimeMinutes > 0 ? `${member.overtimeMinutes} min` : '0 min',
      'Dernière Activité': member.lastActivity || 'Inconnu'
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Rapport_Presence_${dateStr}`;

    if (format === 'excel') {
      this.exportService.exportToExcel(data, fileName, 'Présences');
    } else {
      const headers = ['Collaborateur', 'Poste', 'Statut', 'Arrivée', 'Sortie', 'Total', 'Heures Supp', 'Dernière Activité'];
      const columns = headers;
      this.exportService.exportToPdf(
        data, 
        headers, 
        columns, 
        fileName, 
        'Rapport de Présence WeenTime',
        `Date : ${this.displayDate()}`
      );
    }
  }
}
