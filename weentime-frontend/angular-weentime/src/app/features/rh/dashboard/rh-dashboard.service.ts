import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { Observable, Subject, catchError, map, merge, of, shareReplay, startWith, switchMap } from 'rxjs';
import {
  Activity,
  ActivityFeedItem,
  AttendanceBarItem,
  DashboardApiResponse,
  DashboardEmployee,
  DashboardLeaveRequest,
  DashboardViewModel,
  HighlightedMember,
  RequestMixItem
} from './rh-dashboard.models';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable({ providedIn: 'root' })
export class RhDashboardService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly refresh$ = new Subject<void>();

  readonly dashboard$ = merge(
    this.refresh$.pipe(startWith(void 0)),
    this.watchRealtimeEvents()
  ).pipe(
    switchMap(() => this.http.get<ApiEnvelope<DashboardApiResponse> | DashboardApiResponse>(this.api.RH.GET_RH_DASHBOARD).pipe(
      map(response => this.normalize(this.unwrap(response))),
      catchError(() => of(this.emptyState()))
    )),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  getDashboardData(): Observable<DashboardViewModel> {
    return this.dashboard$;
  }

  refresh(): void {
    this.refresh$.next();
  }

  private watchRealtimeEvents(): Observable<unknown> {
    return of(null);
  }

  private normalize(source: Partial<DashboardApiResponse> | null | undefined): DashboardViewModel {
    const totalEmployees = this.toNumber(source?.totalEmployees);
    const presentCount = this.toNumber(source?.presentCount);
    const absentCount = this.toNumber(source?.absentCount);
    const pendingRequests = Array.isArray(source?.pendingRequests)
      ? source!.pendingRequests.map(item => this.normalizePendingRequest(item))
      : [];
    const hoursWorked = this.toNumber(source?.hoursWorked);
    const attendanceRate = this.toNumber(source?.attendanceRate);
    const attendanceBars = this.buildAttendanceBars(source?.attendanceStats, totalEmployees);
    const requestMix = this.buildRequestMix(source?.requestStats);
    const highlightedMembers = Array.isArray(source?.highlightedEmployees)
      ? source!.highlightedEmployees.map(item => this.toHighlightedMember(item))
      : [];
    const activityFeed = Array.isArray(source?.recentActivities)
      ? source!.recentActivities.map(item => this.toActivityFeedItem(item))
      : [];

    return {
      totalEmployees,
      presentCount,
      absentCount,
      pendingRequests,
      hoursWorked,
      attendanceRate,
      attendanceBars,
      requestMix,
      highlightedMembers,
      activityFeed
    };
  }

  private normalizePendingRequest(item: Partial<DashboardLeaveRequest>): DashboardLeaveRequest {
    return {
      id: this.toNumber(item.id),
      userId: this.toNumber(item.userId),
      type: item.type || 'Conges',
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      status: this.mapRequestStatus(item.status),
      validatedBy: item.validatedBy ?? null,
      employeeName: item.employeeName || `Employe #${this.toNumber(item.userId)}`,
      employeeEmail: item.employeeEmail || '',
      department: item.department || 'Non affecte'
    };
  }

  private buildAttendanceBars(stats: DashboardApiResponse['attendanceStats'] | undefined, totalEmployees: number): AttendanceBarItem[] {
    const present = this.toNumber(stats?.present);
    const absent = this.toNumber(stats?.absent);
    const remote = this.toNumber(stats?.remote);
    const max = Math.max(totalEmployees, present, absent, remote, 1);

    return [
      { label: 'Presents', value: present, percent: (present / max) * 100, color: '#10b981' },
      { label: 'Absents', value: absent, percent: (absent / max) * 100, color: '#ef4444' },
      { label: 'Remote', value: remote, percent: (remote / max) * 100, color: '#6366f1' }
    ].filter(item => item.value > 0 || totalEmployees > 0);
  }

  private buildRequestMix(stats: DashboardApiResponse['requestStats'] | undefined): RequestMixItem[] {
    const entries = [
      { label: 'Conges', value: this.toNumber(stats?.leave) },
      { label: 'Autorisations', value: this.toNumber(stats?.autorisation) },
      { label: 'Teletravail', value: this.toNumber(stats?.teletravail) }
    ];
    const max = Math.max(...entries.map(item => item.value), 1);
    return entries
      .filter(item => item.value > 0)
      .map(item => ({ ...item, percent: (item.value / max) * 100 }));
  }

  private toHighlightedMember(item: Partial<DashboardEmployee>): HighlightedMember {
    const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || `Employe #${this.toNumber(item.id)}`;
    return {
      id: this.toNumber(item.id),
      fullName,
      team: item.team || item.department || item.role || 'Equipe non renseignee',
      timeLabel: this.statusLabel(item.status),
      status: (item.status as HighlightedMember['status']) || 'ACTIVE'
    };
  }

  private toActivityFeedItem(item: Partial<Activity>): ActivityFeedItem {
    return {
      id: item.id || `activity-${Date.now()}`,
      title: item.title || 'Activité RH',
      description: this.mapActivityDescription(item.description),
      date: this.relativeDate(item.date)
    };
  }

  private mapActivityDescription(desc?: string): string {
    if (!desc) return 'Aucune description disponible.';
    return desc
      .replace(/en_attente_rh/g, 'en attente RH')
      .replace(/en_attente_manager/g, 'en attente Manager')
      .replace(/approuvee/g, 'approuvée')
      .replace(/refusee/g, 'refusée')
      .replace(/une document/g, 'un document')
      .replace(/un document/g, 'un document')
      .replace(/une conge/g, 'un congé')
      .replace(/une teletravail/g, 'un télétravail');
  }

  private emptyState(): DashboardViewModel {
    return {
      totalEmployees: 0,
      presentCount: 0,
      absentCount: 0,
      pendingRequests: [],
      hoursWorked: 0,
      attendanceRate: 0,
      attendanceBars: [],
      requestMix: [],
      highlightedMembers: [],
      activityFeed: []
    };
  }

  private statusLabel(status?: string): string {
    switch (status) {
      case 'ABSENT':
        return 'Absence du jour';
      case 'ON_LEAVE':
        return 'Indisponible';
      default:
        return 'Suivi normal';
    }
  }

  private mapRequestStatus(status?: string | null): DashboardLeaveRequest['status'] {
    switch (status) {
      case 'APPROUVEE':
      case 'APPROVED':
        return 'APPROVED';
      case 'REFUSEE':
      case 'REJECTED':
        return 'REJECTED';
      default:
        return 'PENDING';
    }
  }

  private relativeDate(value?: string | null): string {
    if (!value) return 'Maintenant';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    
    if (date.toDateString() === now.toDateString()) {
      return `Aujourd'hui ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Hier ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `Il y a ${diffDay} j`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}
