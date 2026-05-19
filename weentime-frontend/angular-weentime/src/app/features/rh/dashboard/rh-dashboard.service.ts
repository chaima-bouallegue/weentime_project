import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { Observable, Subject, catchError, map, merge, of, shareReplay, startWith, switchMap } from 'rxjs';
import {
  Activity,
  ActivityFeedItem,
  AttendanceBarItem,
  AttendanceBreakdown,
  DashboardApiResponse,
  DashboardLeaveRequest,
  DashboardViewModel,
  DepartmentSlice,
  RequestMixItem,
  WorkflowBucket,
  WorkflowKind
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
    const attendanceBreakdown = this.buildAttendanceBreakdown(source?.attendanceStats, totalEmployees);
    const requestMix = this.buildRequestMix(source?.requestStats);
    const workflowBuckets = this.buildWorkflowBuckets(source?.requestStats);
    const departments = this.buildDepartments(source?.departmentEmployeeCounts);
    // Dedup activities by id, then by (title|date) to absorb backend retries.
    const activityFeed = Array.isArray(source?.recentActivities)
      ? this.dedupActivities(source!.recentActivities.map(item => this.toActivityFeedItem(item)))
      : [];

    return {
      totalEmployees,
      presentCount,
      absentCount,
      pendingRequests,
      hoursWorked,
      attendanceRate,
      attendanceBars,
      attendanceBreakdown,
      requestMix,
      workflowBuckets,
      departments,
      activityFeed
    };
  }

  private buildAttendanceBreakdown(
    stats: DashboardApiResponse['attendanceStats'] | undefined,
    totalEmployees: number,
  ): AttendanceBreakdown {
    const present = this.toNumber(stats?.present);
    const absent = this.toNumber(stats?.absent);
    const remote = this.toNumber(stats?.remote);
    // Use the configured headcount as the denominator when it exists;
    // fall back to the sum of states so old payloads still render.
    const denominator = totalEmployees > 0 ? totalEmployees : Math.max(present + absent + remote, 1);
    return {
      total: totalEmployees,
      present,
      absent,
      remote,
      presentPct: Math.round((present / denominator) * 100),
      absentPct: Math.round((absent / denominator) * 100),
      remotePct: Math.round((remote / denominator) * 100),
    };
  }

  private buildWorkflowBuckets(stats: DashboardApiResponse['requestStats'] | undefined): WorkflowBucket[] {
    const leave = this.toNumber(stats?.leave);
    const telework = this.toNumber(stats?.teletravail);
    const authorization = this.toNumber(stats?.autorisation);
    // Document workload comes from a separate endpoint; we surface a zero
    // bucket so the UI always renders the same 4 columns and a future wire-up
    // doesn't require a layout change.
    const document = 0;

    const entries: Array<{ kind: WorkflowKind; label: string; count: number; route: string }> = [
      { kind: 'leave',         label: 'Congés',         count: leave,         route: '/app/rh/conges' },
      { kind: 'telework',      label: 'Télétravail',    count: telework,      route: '/app/rh/teletravail' },
      { kind: 'authorization', label: 'Autorisations',  count: authorization, route: '/app/rh/autorisations' },
      { kind: 'document',      label: 'Documents',      count: document,      route: '/app/rh/documents' },
    ];

    return entries.map(entry => ({
      ...entry,
      urgency: this.workflowUrgency(entry.count),
    }));
  }

  private workflowUrgency(count: number): WorkflowBucket['urgency'] {
    if (count >= 10) return 'critical';
    if (count >= 4) return 'attention';
    return 'calm';
  }

  private buildDepartments(counts: Record<string, number> | undefined): DepartmentSlice[] {
    if (!counts || typeof counts !== 'object') return [];
    const entries = Object.entries(counts)
      .map(([name, raw]) => ({ name: name || 'Non affecté', count: this.toNumber(raw) }))
      .filter(entry => entry.count > 0)
      .sort((a, b) => b.count - a.count);
    if (entries.length === 0) return [];
    const max = Math.max(...entries.map(e => e.count), 1);
    return entries.map(entry => ({
      name: entry.name,
      count: entry.count,
      percent: Math.round((entry.count / max) * 100),
    }));
  }

  private dedupActivities(items: ActivityFeedItem[]): ActivityFeedItem[] {
    const seen = new Set<string>();
    const out: ActivityFeedItem[] = [];
    for (const item of items) {
      const key = `${item.id}|${item.title}|${item.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
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
      attendanceBreakdown: { total: 0, present: 0, absent: 0, remote: 0, presentPct: 0, absentPct: 0, remotePct: 0 },
      requestMix: [],
      workflowBuckets: this.buildWorkflowBuckets(undefined),
      departments: [],
      activityFeed: [],
    };
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
