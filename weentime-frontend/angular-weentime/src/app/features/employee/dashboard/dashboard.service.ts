import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { SKIP_ERROR_TOAST } from '@app/core/http/request-context.tokens';
import { ToastService } from '@app/core/services/toast.service';

export interface DashboardKpi {
  label: string;
  value: string;
  icon: string;
  trend: string;
  trendUp: boolean;
  color: string;
}

export interface DashboardActivity {
  initials: string;
  color: string;
  description: string;
  date: string;
}

export interface DashboardChart {
  title: string;
  labels: string[];
  values: number[];
}

export interface DashboardStats {
  kpis: DashboardKpi[];
  activities: DashboardActivity[];
  quickActionDescription?: string;
  primaryChart?: DashboardChart;
  secondaryChart?: DashboardChart;
  warningMessage?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private httpClient = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private toastService = inject(ToastService);
  private readonly optionalRequestContext = new HttpContext().set(SKIP_ERROR_TOAST, true);

  getEmployeeDashboardStats(): Observable<DashboardStats> {
    const year = new Date().getFullYear();
    const pageParams = { page: 0, size: 6 };

    return forkJoin({
      autorisationKpis: this.httpClient.get<any>(this.apiConfig.RH.GET_EMPLOYEE_AUTORISATION_KPIS).pipe(catchError(() => of(null))),
      todayPresence: this.httpClient.get<any>(this.apiConfig.PRESENCE.GET_MY_TODAY).pipe(catchError(() => of(null))),
      presenceStats: this.httpClient.get<any>(this.apiConfig.PRESENCE.GET_MY_STATS).pipe(catchError(() => of(null))),
      soldes: this.httpClient.get<any>(this.apiConfig.RH.GET_LEAVE_BALANCE(year), {
        context: this.optionalRequestContext
      }).pipe(catchError(() => of([]))),
      conges: this.httpClient.get<any>(this.apiConfig.RH.GET_MY_CONGES, { params: pageParams }).pipe(catchError(() => of({ content: [] }))),
      teletravail: this.httpClient.get<any>(this.apiConfig.RH.GET_MY_TELETRAVAILS, { params: pageParams }).pipe(catchError(() => of({ content: [] }))),
      notifications: this.httpClient.get<any>(`${this.apiConfig.getApiBase()}/rh/notifications/mes-notifications`).pipe(catchError(() => of([]))),
    }).pipe(
      map(({ autorisationKpis, todayPresence, presenceStats, soldes, conges, teletravail, notifications }) => {
        const authKpis = this.unwrap<any>(autorisationKpis) || {};
        const today = this.unwrap<any>(todayPresence);
        const stats = this.unwrap<any>(presenceStats);
        const soldesArray = this.unwrap<any[]>(soldes) || [];
        const leaveRequests = this.unwrapPage(conges);
        const teleworkRequests = this.unwrapPage(teletravail);
        const activityItems = this.unwrap<any[]>(notifications) || [];

        const remainingLeaveDays = soldesArray
          .map(item => Number(item?.joursRestants ?? 0))
          .filter(value => Number.isFinite(value))
          .reduce((sum, value) => sum + value, 0);

        const leavePending = leaveRequests.filter((item: any) => this.isPendingStatus(item?.statut)).length;
        const teleworkPending = teleworkRequests.filter((item: any) => this.isPendingStatus(item?.statut)).length;
        const hoursToday = Number(today?.totalDuration ?? 0);
        const attendanceRate = this.calculateAttendanceRate(stats);

        return {
          kpis: [
            {
              label: 'Heures aujourd\'hui',
              value: this.formatDuration(hoursToday),
              icon: 'timer',
              trend: today?.hasOpenSession ? 'Session en cours' : 'Journee synchronisee',
              trendUp: !!today?.hasOpenSession || hoursToday > 0,
              color: '#0ea5e9'
            },
            {
              label: 'Solde conges',
              value: `${remainingLeaveDays.toFixed(1)}j`,
              icon: 'calendar-days',
              trend: remainingLeaveDays > 5 ? 'Solde confortable' : 'A surveiller',
              trendUp: remainingLeaveDays > 5,
              color: '#6366f1'
            },
            {
              label: 'Autorisations',
              value: `${Number(authKpis.total ?? 0)}`,
              icon: 'file-text',
              trend: `${Number(authKpis.enAttente ?? 0)} en attente`,
              trendUp: Number(authKpis.enAttente ?? 0) === 0,
              color: '#f59e0b'
            },
            {
              label: 'Taux de presence',
              value: `${attendanceRate}%`,
              icon: 'activity',
              trend: `${Number(stats?.totalPresent ?? 0)} jour(s) actifs`,
              trendUp: attendanceRate >= 80,
              color: '#10b981'
            }
          ],
          activities: this.buildEmployeeActivities(activityItems, today, leaveRequests, teleworkRequests),
          quickActionDescription: today?.hasOpenSession
            ? 'Votre session est ouverte. Vous pouvez la cloturer depuis le tableau de bord.'
            : 'Relancez votre journee, posez un conge ou planifiez votre teletravail.'
        };
      }),
      catchError(() => {
        this.toastService.error('Erreur lors du chargement du tableau de bord');
        return of(this.getFallbackStats());
      })
    );
  }

  getManagerDashboardStats(): Observable<DashboardStats> {
    return forkJoin({
      managerStats: this.httpClient.get<any>(this.apiConfig.RH.GET_MANAGER_STATS).pipe(
        catchError(() => of({ __error: true }))
      ),
      teamPresence: this.httpClient.get<any>(this.apiConfig.PRESENCE.GET_TEAM_PRESENCE).pipe(
        catchError(() => of({ __error: true, data: { members: [] } }))
      ),
      managerDemands: this.httpClient.get<any>(this.apiConfig.RH.GET_MANAGER_DEMANDS).pipe(
        catchError(() => of({ __error: true, data: { content: [] } }))
      )
    }).pipe(
      map(({ managerStats, teamPresence, managerDemands }) => {
        const stats = this.unwrap<any>(managerStats) || {};
        const teamData = this.unwrap<any>(teamPresence) || {};
        const demandsPage = this.unwrap<any>(managerDemands) || {};
        const failedSources = [
          managerStats?.__error ? 'statistiques manager' : null,
          teamPresence?.__error ? "presence d'equipe" : null,
          managerDemands?.__error ? 'demandes manager' : null
        ].filter(Boolean);

        const teamMembers = Array.isArray(teamData?.members) ? teamData.members : [];
        const demands = Array.isArray(demandsPage?.content) ? demandsPage.content : [];
        const teamSize = teamMembers.length;
        const presentStatuses = new Set(['PRESENT', 'LATE', 'REMOTE', 'ON_LEAVE']);
        const presentCount = teamMembers.filter((member: any) => presentStatuses.has(member?.status)).length;
        const attendanceRate = teamSize > 0 ? Math.round((presentCount / teamSize) * 100) : 0;
        const pendingCount = Number(stats.pendingCount ?? stats.nbDemandesEnAttente ?? 0);
        const approvedCount = Number(stats.approvedCount ?? 0);
        const rejectedCount = Number(stats.rejectedCount ?? 0);

        return {
          kpis: [
            {
              label: 'Demandes en attente',
              value: pendingCount.toString(),
              icon: 'file-check',
              trend: pendingCount === 0 ? 'A traiter: 0' : `${pendingCount} a traiter`,
              trendUp: pendingCount === 0,
              color: '#f59e0b'
            },
            {
              label: 'Equipe presente',
              value: `${presentCount}/${teamSize}`,
              icon: 'users',
              trend: `${attendanceRate}% de couverture`,
              trendUp: attendanceRate >= 80,
              color: '#10b981'
            },
            {
              label: 'Decisions prises',
              value: (approvedCount + rejectedCount).toString(),
              icon: 'check-circle',
              trend: `${approvedCount} approuvees / ${rejectedCount} refusees`,
              trendUp: approvedCount >= rejectedCount,
              color: '#06b6d4'
            }
          ],
          activities: demands.slice(0, 4).map((demande: any) => this.mapRequestActivity(demande)),
          quickActionDescription: pendingCount === 0
            ? 'Aucune validation manager en attente.'
            : `${pendingCount} demandes attendent votre validation.`,
          warningMessage: failedSources.length > 0
            ? `Certaines donnees manager sont indisponibles: ${failedSources.join(', ')}.`
            : null
        };
      }),
      catchError(() => {
        return of({
          ...this.getFallbackStats(),
          warningMessage: 'Erreur lors du chargement du tableau de bord manager.'
        });
      })
    );
  }

  getRhDashboardStats(): Observable<DashboardStats> {
    return forkJoin({
      rhDashboard: this.httpClient.get<any>(this.apiConfig.RH.GET_RH_DASHBOARD),
      presenceStats: this.httpClient.get<any>(this.apiConfig.PRESENCE.GET_PRESENCE_STATS),
      monthlyEvolution: this.httpClient.get<any>(this.apiConfig.RH.GET_STATS_EVOLUTION)
    }).pipe(
      map(({ rhDashboard, presenceStats, monthlyEvolution }) => {
        const dashboard = this.unwrap<any>(rhDashboard) || {};
        const todayPresence = this.unwrap<any>(presenceStats) || {};
        const evolution = this.unwrap<Record<string, number>>(monthlyEvolution) || {};

        const totalEmployees = Number(dashboard.totalEmployees ?? 0);
        const totalPresent = Number(todayPresence.totalPresent ?? 0);
        const totalAbsent = Number(todayPresence.totalAbsent ?? 0);
        const employeesOnLeave = Number(dashboard.employeesOnLeave ?? dashboard.emploiesEnConge ?? 0);
        const presenceRate = totalEmployees > 0 ? Math.round((totalPresent / totalEmployees) * 100) : null;
        const departmentDistribution = this.normalizeChartEntries(dashboard.departmentEmployeeCounts);
        const monthlyTrend = this.normalizeMonthlyTrend(evolution);

        return {
          kpis: [
            {
              label: 'Demandes a valider',
              value: Number(dashboard.demandesEnAttente ?? dashboard.pendingRequests ?? 0).toString(),
              icon: 'file-check-2',
              trend: 'Pour approbation',
              trendUp: false,
              color: '#f59e0b'
            },
            {
              label: 'Employes actifs',
              value: totalEmployees.toString(),
              icon: 'users',
              trend: `${employeesOnLeave} en conge aujourd'hui`,
              trendUp: totalEmployees > 0,
              color: '#06b6d4'
            },
            {
              label: 'Presence du jour',
              value: presenceRate !== null ? `${presenceRate}%` : '-',
              icon: 'bar-chart-2',
              trend: `${totalPresent} presents / ${totalAbsent} absents`,
              trendUp: presenceRate !== null && presenceRate >= 90,
              color: '#10b981'
            }
          ],
          activities: Array.isArray(dashboard.recentActivities) ? dashboard.recentActivities : [],
          quickActionDescription: `${Number(dashboard.demandesEnAttente ?? 0)} demandes attendent une action RH.`,
          primaryChart: {
            title: 'Effectif par departement',
            labels: departmentDistribution.labels,
            values: departmentDistribution.values
          },
          secondaryChart: {
            title: 'Evolution mensuelle des demandes',
            labels: monthlyTrend.labels,
            values: monthlyTrend.values
          }
        };
      }),
      catchError(() => {
        return of(this.getFallbackStats());
      })
    );
  }

  private buildEmployeeActivities(
    activityItems: any[],
    todayPresence: any,
    leaveRequests: any[],
    teleworkRequests: any[]
  ): DashboardActivity[] {
    const timeline = [
      ...activityItems.map(item => this.mapNotificationActivity(item)),
      ...leaveRequests.map(item => ({
        timestamp: item?.createdAt || item?.dateCreation,
        initials: 'CG',
        color: '#8b5cf6',
        description: `Demande de conge ${this.formatDemandStatus(item?.statut)}.`,
      })),
      ...teleworkRequests.map(item => ({
        timestamp: item?.createdAt || item?.dateCreation,
        initials: 'TT',
        color: '#0ea5e9',
        description: `Demande de teletravail ${this.formatDemandStatus(item?.statut)}.`,
      })),
    ];

    const sessions = Array.isArray(todayPresence?.sessions) ? todayPresence.sessions : [];
    for (const session of sessions) {
      timeline.push({
        timestamp: session?.checkInTime || session?.createdAt,
        initials: 'PR',
        color: '#10b981',
        description: session?.checkOutTime
          ? `Session terminee (${this.formatDuration(Number(session?.duration ?? 0))}).`
          : 'Pointage demarre et session ouverte.',
      });
    }

    const sorted = timeline
      .filter(item => item.timestamp)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 5)
      .map(item => ({
        initials: item.initials,
        color: item.color,
        description: item.description,
        date: this.formatDateLabel(item.timestamp),
      }));

    return sorted.length > 0 ? sorted : [
      {
        initials: 'WT',
        color: '#6366f1',
        description: 'Aucune activite recente disponible.',
        date: new Date().toLocaleDateString('fr-FR')
      }
    ];
  }

  mapRealtimeNotifications(notifications: any[]): DashboardActivity[] {
    const items = (notifications || [])
      .map(item => this.mapNotificationActivity(item))
      .filter(item => !!item.timestamp)
      .sort((left, right) => new Date(String(right.timestamp)).getTime() - new Date(String(left.timestamp)).getTime())
      .slice(0, 5)
      .map(item => ({
        initials: item.initials,
        color: item.color,
        description: item.description,
        date: this.formatDateLabel(item.timestamp)
      }));

    return items.length > 0 ? items : [
      {
        initials: 'WT',
        color: '#6366f1',
        description: 'Aucune notification recente disponible.',
        date: new Date().toLocaleDateString('fr-FR')
      }
    ];
  }

  private getFallbackStats(): DashboardStats {
    return {
      kpis: [
        { label: 'Heures aujourd\'hui', value: '-', icon: 'timer', trend: 'N/A', trendUp: true, color: '#0ea5e9' },
        { label: 'Solde conges', value: '-', icon: 'calendar-days', trend: 'N/A', trendUp: true, color: '#6366f1' },
        { label: 'Demandes en attente', value: '-', icon: 'file-text', trend: 'N/A', trendUp: true, color: '#f59e0b' },
        { label: 'Taux de presence', value: '-', icon: 'activity', trend: 'N/A', trendUp: true, color: '#10b981' }
      ],
      activities: [
        { initials: 'WT', color: '#8b5cf6', description: 'Donnees indisponibles', date: 'Aujourd\'hui' }
      ],
      quickActionDescription: 'Les donnees seront rechargees des que les services repondent.'
    };
  }

  private unwrap<T>(response: any): T {
    return (response?.data ?? response) as T;
  }

  private unwrapPage(response: any): any[] {
    const page = this.unwrap<any>(response);
    const items = page?.content ?? page ?? [];
    return Array.isArray(items) ? items : [];
  }

  private calculateAttendanceRate(stats: any): number {
    if (!stats) {
      return 0;
    }

    const totalDays = Number(stats.totalPresent || 0) + Number(stats.totalAbsent || 0) + Number(stats.lateCount || 0);
    if (totalDays === 0) {
      return 0;
    }

    return Math.round(((Number(stats.totalPresent || 0) + Number(stats.lateCount || 0)) / totalDays) * 100);
  }

  private mapRequestActivity(demande: any): DashboardActivity {
    const utilisateur = demande?.utilisateur;
    const firstName = utilisateur?.prenom || '';
    const lastName = utilisateur?.nom || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Collaborateur';
    const initials = `${firstName[0] || 'W'}${lastName[0] || 'T'}`.toUpperCase();

    return {
      initials,
      color: '#6366f1',
      description: `${fullName} - ${this.formatDemandType(demande?.typeDemande)} ${this.formatDemandStatus(demande?.statut)}`,
      date: this.formatDateLabel(demande?.dateCreation || demande?.createdAt)
    };
  }

  private formatDemandType(type: string | undefined): string {
    switch (type) {
      case 'CONGE':
        return 'conge';
      case 'ABSENCE':
        return 'absence';
      case 'TELETRAVAIL':
        return 'teletravail';
      case 'AUTORISATION':
        return 'autorisation';
      case 'DOCUMENT':
        return 'document';
      default:
        return 'demande';
    }
  }

  private formatDemandStatus(status: string | undefined): string {
    switch (status) {
      case 'EN_ATTENTE_MANAGER':
        return 'en attente manager';
      case 'EN_ATTENTE_RH':
        return 'en attente RH';
      case 'APPROUVEE':
        return 'approuvee';
      case 'REFUSEE':
        return 'refusee';
      case 'ANNULEE':
        return 'annulee';
      default:
        return 'mise a jour';
    }
  }

  private normalizeChartEntries(entries: Record<string, number> | null | undefined): { labels: string[]; values: number[] } {
    const normalized = Object.entries(entries || {})
      .sort((left, right) => Number(right[1]) - Number(left[1]));

    if (normalized.length === 0) {
      return { labels: ['Aucune donnee'], values: [0] };
    }

    return {
      labels: normalized.map(([label]) => label),
      values: normalized.map(([, value]) => Number(value))
    };
  }

  private normalizeMonthlyTrend(evolution: Record<string, number>): { labels: string[]; values: number[] } {
    const months = Object.entries(evolution)
      .map(([month, value]) => [Number(month), Number(value)] as const)
      .sort((left, right) => left[0] - right[0]);

    if (months.length === 0) {
      return { labels: ['Aucun historique'], values: [0] };
    }

    return {
      labels: months.map(([month]) => this.getMonthLabel(month)),
      values: months.map(([, value]) => value)
    };
  }

  private getMonthLabel(month: number): string {
    const names = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[month - 1] || `M${month}`;
  }

  private formatDateLabel(value: string | undefined): string {
    if (!value) {
      return new Date().toLocaleDateString('fr-FR');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMinutes < 1) {
      return 'A l\'instant';
    }
    if (diffMinutes < 60) {
      return `Il y a ${diffMinutes} min`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `Il y a ${diffHours} h`;
    }

    return date.toLocaleDateString('fr-FR');
  }

  private formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  private isPendingStatus(status?: string): boolean {
    return status === 'EN_ATTENTE_MANAGER' || status === 'EN_ATTENTE_RH';
  }

  private mapNotificationActivity(item: any): { timestamp: string | undefined; initials: string; color: string; description: string } {
    const title = String(item?.titre || item?.title || 'Notification');
    const message = String(item?.message || title);
    const color = String(item?.couleur || '#6366f1');
    const initialsSource = title.trim() || 'WT';
    const initials = initialsSource
      .split(/\s+/)
      .slice(0, 2)
      .map((part: string) => part.charAt(0).toUpperCase())
      .join('') || 'WT';

    return {
      timestamp: item?.dateCreation || item?.date || item?.createdAt,
      initials,
      color,
      description: message,
    };
  }
}
