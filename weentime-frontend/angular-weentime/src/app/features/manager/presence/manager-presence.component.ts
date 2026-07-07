import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Users, Clock, AlertCircle, Calendar, ChevronLeft, ChevronRight, TrendingUp, Search, Download, LayoutGrid, List, FileText, FileSpreadsheet, RefreshCw, MapPin, Activity, BarChart2, ArrowRight, MoreVertical, Building2, Wifi, AlertTriangle, Filter } from 'lucide-angular';
import { ManagerPresenceService } from './manager-presence.service';
import { ExportService } from '../../../core/services/export.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { TeamMemberStatus, PresenceKPIs, PresenceStatus } from './presence.models';
import { animate, style, transition, trigger, query, stagger } from '@angular/animations';
import { OvertimeRequestDto, OvertimeService } from '../../presence/services/overtime.service';
import { LocationDisplayComponent } from '../../../shared/components/location-display/location-display.component';

export type KpiFilterType = 'all' | 'present' | 'teletravail' | 'late' | 'absent' | 'leave' | null;

export interface LocationInfo {
  type: 'bureau' | 'teletravail' | 'hors-zone' | 'unknown';
  label: string;
  icon: string;
}

export interface ActivityEvent {
  id: number;
  name: string;
  initials: string;
  action: string;
  actionType: 'checkin' | 'checkout' | 'teletravail' | 'absent' | 'late';
  time: string;
  statusColor: string;
}

export interface DaySummaryData {
  totalWorkedMinutes: number;
  totalWorkedFormatted: string;
  overtimePendingCount: number;
  overtimeTotalMinutes: number;
  overtimeTotalFormatted: string;
  absentCount: number;
  punctualityRate: number;
}

@Component({
  selector: 'app-manager-presence',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, LocationDisplayComponent],
  templateUrl: './manager-presence.component.html',
  styleUrls: ['./manager-presence.component.scss'],
  animations: [
    trigger('listAnimation', [
      transition('* <=> *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(10px)' }),
          stagger('20ms', animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })))
        ], { optional: true })
      ])
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('0.15s ease-in', style({ opacity: 1 }))
      ])
    ])
  ]
})
export class ManagerPresenceComponent implements OnInit {
  private presenceService = inject(ManagerPresenceService);
  private exportService = inject(ExportService);
  private toastService = inject(ToastService);
  private overtimeService = inject(OvertimeService);
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
  iconRefresh = RefreshCw;
  iconMapPin = MapPin;
  iconActivity = Activity;
  iconBarChart = BarChart2;
  iconArrowRight = ArrowRight;
  iconMore = MoreVertical;
  iconBuilding = Building2;
  iconWifi = Wifi;
  iconAlertTriangle = AlertTriangle;
  iconFilter = Filter;

  // State
  teamStatus = signal<TeamMemberStatus[]>([]);
  kpis = signal<PresenceKPIs | null>(null);
  isLoading = signal(true);
  overtimeLoading = signal(false);
  pendingOvertime = signal<OvertimeRequestDto[]>([]);
  reviewingOvertimeId = signal<number | null>(null);
  searchQuery = signal('');
  viewMode = signal<'table' | 'kanban'>('table');
  readonly statuses: PresenceStatus[] = ['ACTIVE', 'LATE', 'ABSENT', 'OFF'];

  // Presentation-only: KPI filter
  activeKpiFilter = signal<KpiFilterType>(null);

  displayDate = computed(() => new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  // Filtered Team computed — now includes KPI filter
  filteredTeam = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const kpiFilter = this.activeKpiFilter();
    let members = this.teamStatus();

    // Apply KPI filter
    if (kpiFilter === 'present') {
      members = members.filter(m => m.status === 'ACTIVE' && this.getLocationType(m.checkInLocation).type !== 'teletravail');
    } else if (kpiFilter === 'teletravail') {
      members = members.filter(m => m.status === 'ACTIVE' && this.getLocationType(m.checkInLocation).type === 'teletravail');
    } else if (kpiFilter === 'late') {
      members = members.filter(m => m.status === 'LATE');
    } else if (kpiFilter === 'absent') {
      members = members.filter(m => m.status === 'ABSENT');
    } else if (kpiFilter === 'leave') {
      members = members.filter(m => m.status === 'OFF');
    }

    // Apply search query
    return members.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.jobTitle.toLowerCase().includes(query)
    );
  });

  activeFiltersCount = computed(() => {
    let count = 0;
    if (this.searchQuery().trim().length > 0) count++;
    if (this.activeKpiFilter() !== null) count++;
    return count;
  });

  weeklyTrends = [
    { label: 'Lun', rate: 100 },
    { label: 'Mar', rate: 95 },
    { label: 'Mer', rate: 100 },
    { label: 'Jeu', rate: 80 },
    { label: 'Ven', rate: 90 }
  ];

  weeklyRetards = [
    { label: 'Lun', count: 3 },
    { label: 'Mar', count: 2 },
    { label: 'Mer', count: 1 },
    { label: 'Jeu', count: 1 },
    { label: 'Ven', count: 0 }
  ];

  getMembersCountByStatus(status: PresenceStatus): number {
    return this.teamStatus().filter(m => m.status === status).length;
  }

  getOfficePresentCount(): number {
    return this.teamStatus().filter(m => m.status === 'ACTIVE' && this.getLocationType(m.checkInLocation).type !== 'teletravail').length;
  }

  getTeleworkCount(): number {
    return this.teamStatus().filter(m => m.status === 'ACTIVE' && this.getLocationType(m.checkInLocation).type === 'teletravail').length;
  }

  getAvatarBgColor(jobTitle: string): string {
    const lower = jobTitle.toLowerCase();
    if (lower.includes('backend') || lower.includes('back')) {
      return 'linear-gradient(135deg, #8B5CF6, #7C3AED)';
    }
    if (lower.includes('frontend') || lower.includes('front')) {
      return 'linear-gradient(135deg, #3B82F6, #2563EB)';
    }
    if (lower.includes('design') || lower.includes('product')) {
      return 'linear-gradient(135deg, #EC4899, #DB2777)';
    }
    if (lower.includes('qa') || lower.includes('test')) {
      return 'linear-gradient(135deg, #10B981, #059669)';
    }
    return 'linear-gradient(135deg, #64748B, #475569)';
  }

  getMemberEmoji(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('assia') || lower.includes('sophie') || lower.includes('sarah') || 
        lower.includes('leila') || lower.includes('fatma') || lower.includes('amira') || 
        lower.includes('yasmine') || lower.includes('emna') || lower.includes('chaima') || 
        lower.includes('sirine') || lower.includes('rym') || lower.includes('myriam')) {
      return '👩';
    }
    return '👨';
  }

  // Presentation-only: Day summary computed
  daySummary = computed<DaySummaryData>(() => {
    const team = this.teamStatus();
    const kpisVal = this.kpis();
    const overtime = this.pendingOvertime();

    const totalWorkedMinutes = team.reduce((sum, m) => sum + m.totalMinutes, 0);
    const overtimeTotalMinutes = overtime.reduce((sum, r) => sum + Math.max(Number(r.overtimeMinutes ?? 0), 0), 0);

    return {
      totalWorkedMinutes,
      totalWorkedFormatted: this.formatDuration(totalWorkedMinutes),
      overtimePendingCount: overtime.length,
      overtimeTotalMinutes,
      overtimeTotalFormatted: this.formatDuration(overtimeTotalMinutes),
      absentCount: kpisVal?.absentCount ?? 0,
      punctualityRate: kpisVal?.averagePunctuality ?? 0,
    };
  });

  // Presentation-only: Realtime activity timeline
  realtimeActivity = computed<ActivityEvent[]>(() => {
    const team = this.teamStatus();
    const events: ActivityEvent[] = [];

    for (const member of team) {
      const initials = this.getInitials(member.name);

      if (member.arrivalTime) {
        const actionType = member.status === 'LATE' ? 'late' as const : 'checkin' as const;
        const action = member.status === 'LATE'
          ? 'a pointé son entrée (en retard)'
          : (this.getLocationType(member.checkInLocation).type === 'teletravail'
            ? 'a démarré le télétravail'
            : 'a pointé son entrée');

        events.push({
          id: member.id * 10 + 1,
          name: member.name,
          initials,
          action,
          actionType,
          time: member.arrivalTime,
          statusColor: this.getStatusColor(member.status, member),
        });
      }

      if (member.departureTime) {
        events.push({
          id: member.id * 10 + 2,
          name: member.name,
          initials,
          action: 'a pointé sa sortie',
          actionType: 'checkout',
          time: member.departureTime,
          statusColor: 'slate',
        });
      }

      if (member.status === 'ABSENT' || member.status === 'OFF') {
        events.push({
          id: member.id * 10 + 3,
          name: member.name,
          initials,
          action: member.status === 'OFF' ? 'est en congé' : 'a déclaré une absence',
          actionType: 'absent',
          time: member.lastActivity || '--:--',
          statusColor: 'rose',
        });
      }
    }

    // Sort by time descending (most recent first)
    events.sort((a, b) => {
      if (a.time === '--:--') return 1;
      if (b.time === '--:--') return -1;
      return b.time.localeCompare(a.time);
    });

    return events;
  });

  ngOnInit(): void {
    this.loadData();
    this.loadPendingOvertime();
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
    this.loadPendingOvertime();
  }

  loadPendingOvertime(): void {
    this.overtimeLoading.set(true);
    this.overtimeService.getManagerPending(0, 10).subscribe({
      next: page => {
        this.pendingOvertime.set(page.content ?? []);
        this.overtimeLoading.set(false);
      },
      error: () => {
        this.pendingOvertime.set([]);
        this.overtimeLoading.set(false);
      }
    });
  }

  approveOvertime(request: OvertimeRequestDto): void {
    this.reviewOvertime(request, 'approve');
  }

  rejectOvertime(request: OvertimeRequestDto): void {
    this.reviewOvertime(request, 'reject');
  }

  requestOvertimeJustification(request: OvertimeRequestDto): void {
    this.reviewingOvertimeId.set(request.id);
    this.overtimeService.requestJustification(request.id, 'Merci de justifier ces heures supplementaires.').subscribe({
      next: () => {
        this.toastService.info('Justification demandee.');
        this.reviewingOvertimeId.set(null);
        this.loadPendingOvertime();
      },
      error: () => {
        this.toastService.error('Impossible de demander une justification.');
        this.reviewingOvertimeId.set(null);
      }
    });
  }

  formatOvertimeDuration(minutes?: number | null): string {
    const total = Math.max(Number(minutes ?? 0), 0);
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins} min`;
  }

  formatOvertimeTimestamp(value?: string | null): string {
    if (!value) {
      return '--';
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const match = value.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
  }

  formatOvertimeStatus(status?: string | null): string {
    switch (status) {
      case 'PENDING_MANAGER':
      case 'EN_ATTENTE_MANAGER':
      case 'PENDING_APPROVAL':
        return 'En attente manager';
      case 'PENDING_RH':
      case 'EN_ATTENTE_RH':
        return 'En attente RH';
      case 'APPROVED_MANAGER':
      case 'APPROUVEE_MANAGER':
      case 'APPROVED':
        return 'Approuvee manager';
      case 'REJECTED_MANAGER':
      case 'REFUSEE_MANAGER':
      case 'REJECTED':
        return 'Refusee manager';
      case 'APPROVED_RH':
      case 'APPROUVEE_RH':
        return 'Approuvee RH';
      case 'REJECTED_RH':
      case 'REFUSEE_RH':
        return 'Refusee RH';
      default:
        return status || 'Inconnu';
    }
  }

  private reviewOvertime(request: OvertimeRequestDto, action: 'approve' | 'reject'): void {
    this.reviewingOvertimeId.set(request.id);
    const call$ = action === 'approve'
      ? this.overtimeService.approve(request.id)
      : this.overtimeService.reject(request.id, 'Refuse par le manager');
    call$.subscribe({
      next: () => {
        this.toastService.success(action === 'approve' ? 'Heures supplementaires approuvees.' : 'Heures supplementaires refusees.');
        this.reviewingOvertimeId.set(null);
        this.loadPendingOvertime();
      },
      error: () => {
        this.toastService.error("Impossible de mettre a jour la demande d'heures supplementaires.");
        this.reviewingOvertimeId.set(null);
      }
    });
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  getStatusColor(status: string, member?: TeamMemberStatus): string {
    if (status === 'ACTIVE') {
      if (member && this.getLocationType(member.checkInLocation).type === 'teletravail') {
        return 'blue';
      }
      return 'emerald';
    }
    switch (status) {
      case 'LATE': return 'amber';
      case 'ABSENT': return 'rose';
      case 'OFF': return 'slate';
      default: return 'indigo';
    }
  }

  formatStatus(status: string, member?: TeamMemberStatus): string {
    if (status === 'ACTIVE') {
      if (member && this.getLocationType(member.checkInLocation).type === 'teletravail') {
        return 'Télétravail';
      }
      return 'Présente';
    }
    switch (status) {
      case 'LATE': return 'En retard';
      case 'ABSENT': return 'Absente';
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

  // Presentation-only: classify location text into a type
  getLocationType(location: string | null): LocationInfo {
    if (!location) {
      return { type: 'unknown', label: '--', icon: '' };
    }
    const lower = location.toLowerCase();

    // Check for télétravail patterns
    if (lower.includes('télétravail') || lower.includes('teletravail') ||
        lower.includes('domicile') || lower.includes('remote') ||
        lower.includes('maison') || lower.includes('home')) {
      return { type: 'teletravail', label: 'Télétravail', icon: '🔵' };
    }

    // Check for out-of-zone patterns
    if (lower.includes('hors zone') || lower.includes('hors-zone') ||
        lower.includes('out of zone') || lower.includes('hors du périmètre')) {
      return { type: 'hors-zone', label: `Hors zone`, icon: '🟠' };
    }

    // Default: Bureau with location details
    // Extract a short label from the location string
    const shortLabel = this.extractShortLocation(location);
    return { type: 'bureau', label: `Bureau ${shortLabel}`.trim(), icon: '🟢' };
  }

  private extractShortLocation(location: string): string {
    if (!location) return '';
    // If it looks like coordinates (lat,lon), return empty (location-display handles geocoding)
    if (/^-?\d+(\.\d+)?[,\s]+-?\d+(\.\d+)?$/.test(location.trim())) {
      return '';
    }
    // If it's a comma-separated location, take the first part (usually city)
    const parts = location.split(',');
    if (parts.length > 0) {
      const first = parts[0].trim();
      // Limit length
      return first.length > 20 ? first.substring(0, 20) + '…' : first;
    }
    return location.length > 20 ? location.substring(0, 20) + '…' : location;
  }

  // Presentation-only: toggle KPI filter
  toggleKpiFilter(filter: KpiFilterType): void {
    if (this.activeKpiFilter() === filter) {
      this.activeKpiFilter.set(null);
    } else {
      this.activeKpiFilter.set(filter);
    }
  }

  // Resolves full member info from pending overtime request utilisateurId
  getMemberByUserId(userId: number): TeamMemberStatus | undefined {
    return this.teamStatus().find(m => m.id === userId);
  }

  // Generates visual priorities based on minutes heuristic to match the mockup
  getOvertimePriority(minutes?: number | null): 'Haute' | 'Normale' | 'Basse' {
    const m = minutes ?? 0;
    if (m >= 120) return 'Haute';
    if (m >= 50) return 'Normale';
    return 'Basse';
  }

  // Calculates the attendance rate dynamically based on present vs total members
  getAttendanceRate(): number {
    const present = this.kpis()?.presentCount ?? 0;
    const total = this.kpis()?.totalMembers ?? 0;
    if (total === 0) return 0;
    return Math.round((present / total) * 100);
  }

  onExport(format: 'pdf' | 'excel'): void {
    const data = this.filteredTeam().map(member => ({
      Collaborateur: member.name,
      Poste: member.jobTitle,
      Statut: this.formatStatus(member.status, member),
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
