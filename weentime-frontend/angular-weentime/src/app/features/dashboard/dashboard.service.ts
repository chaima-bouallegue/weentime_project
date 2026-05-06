import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, switchMap, throwError, tap } from 'rxjs';

import { SKIP_ERROR_TOAST } from '@app/core/http/request-context.tokens';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { AdminApiService } from '@app/features/admin/admin-api.service';
import { ManagerApiService } from '@app/features/manager/manager-api.service';
import { PresenceMonitoringService } from '@app/features/presence/services/presence-monitoring.service';
import { normalizeAttendanceSnapshot } from '@app/core/utils/attendance-state.mapper';
import { formatLocalTime, parseApiDate } from '@app/core/utils/date-time.util';
import {
  DashboardActivity,
  DashboardChartSeries,
  DashboardNotification,
  DashboardPayload,
  DashboardPeopleItem,
  DashboardQuickAction,
  DashboardRole,
  DashboardSegment,
  DashboardStat,
  DashboardWidgetWarning,
  UiTone
} from '@app/shared/ui/models/dashboard-ui.models';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface Paged<T> {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
}

interface UserRoleLike {
  nom?: string;
  name?: string;
  role?: string;
  authority?: string;
}

interface DashboardUserLike {
  id?: number;
  nom?: string;
  prenom?: string;
  email?: string;
  poste?: string;
  statut?: string;
  dateCreation?: string;
  role?: string;
  roles?: Array<UserRoleLike | string>;
}

interface ManagerStatsLike {
  pendingCount?: number;
  approvedCount?: number;
  rejectedCount?: number;
  totalCount?: number;
}

interface RequestResult<T> {
  data: T;
  warning: DashboardWidgetWarning | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly adminApi = inject(AdminApiService);
  private readonly managerApi = inject(ManagerApiService);
  private readonly presenceMonitoring = inject(PresenceMonitoringService);
  private readonly optionalRequestContext = new HttpContext().set(SKIP_ERROR_TOAST, true);

  private readonly cache = new Map<DashboardRole, { timestamp: number; data: DashboardPayload }>();
  private readonly cacheTtlMs = 45_000;

  getAdminDashboard(forceRefresh = false): Observable<DashboardPayload> {
    return this.withCache('ADMIN', forceRefresh, () => this.loadAdminDashboard());
  }

  getRhDashboard(forceRefresh = false): Observable<DashboardPayload> {
    return this.withCache('RH', forceRefresh, () => this.loadRhDashboard());
  }

  getManagerDashboard(forceRefresh = false): Observable<DashboardPayload> {
    return this.withCache('MANAGER', forceRefresh, () => this.loadManagerDashboard());
  }

  getEmployeeDashboard(forceRefresh = false): Observable<DashboardPayload> {
    return this.withCache('EMPLOYEE', forceRefresh, () => this.loadEmployeeDashboard());
  }

  clearCache(role?: DashboardRole): void {
    if (role) {
      this.cache.delete(role);
      return;
    }
    this.cache.clear();
  }

  private withCache(role: DashboardRole, forceRefresh: boolean, loader: () => Observable<DashboardPayload>): Observable<DashboardPayload> {
    const snapshot = this.cache.get(role);
    const isFresh = !!snapshot && Date.now() - snapshot.timestamp < this.cacheTtlMs;

    if (!forceRefresh && isFresh) {
      return of(snapshot.data);
    }

    return loader().pipe(
      tap(data => {
        this.cache.set(role, { timestamp: Date.now(), data });
      })
    );
  }

  private loadAdminDashboard(): Observable<DashboardPayload> {
    const notifications$ = this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(this.api.NOTIFICATIONS.GET_ALL, {
        params: new HttpParams().set('page', '0').set('size', '10'),
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response)));

    return forkJoin({
      usersPage: this.optionalRequest(
        this.loadUsersForAdminDashboard(),
        this.emptyPage<DashboardUserLike>(0, 100),
        'users',
        'Utilisateurs indisponibles'
      ),
      entreprisesPage: this.optionalRequest(
        this.loadEntreprisesForAdminDashboard(),
        this.emptyPage<any>(0, 100),
        'entreprises',
        'Entreprises indisponibles'
      ),
      globalAnalytics: this.optionalRequest(
        this.getAdminGlobalAnalytics(),
        null,
        'presence',
        'Indicateurs de présence indisponibles'
      ),
      requestsPage: this.optionalRequest(
        this.loadRequestsForAdminDashboard(0, 100),
        this.emptyPage<any>(0, 100),
        'requests',
        'Demandes RH indisponibles'
      ),
      notifications: this.optionalRequest(
        notifications$,
        [] as any[],
        'notifications',
        'Notifications indisponibles'
      )
    }).pipe(
      map(({ usersPage, entreprisesPage, globalAnalytics, requestsPage, notifications }) => {
        const widgetWarnings = [usersPage, entreprisesPage, globalAnalytics, requestsPage, notifications]
          .map(item => item.warning)
          .filter((warning): warning is DashboardWidgetWarning => warning !== null);
        const warningWidgets = new Set(widgetWarnings.map(warning => warning.widget));
        const usersUnavailable = warningWidgets.has('users');
        const entreprisesUnavailable = warningWidgets.has('entreprises');
        const presenceUnavailable = warningWidgets.has('presence');
        const requestsUnavailable = warningWidgets.has('requests');
        const noDataLabel = 'Aucune donnée disponible';

        const usersPageData = this.normalizePageResponse<DashboardUserLike>(usersPage.data, 0, 100);
        const entreprisesPageData = this.normalizePageResponse<any>(entreprisesPage.data, 0, 100);
        const requestsPageData = this.normalizePageResponse<any>(requestsPage.data, 0, 100);

        const users = this.ensureArray<DashboardUserLike>(usersPageData.content);
        const entreprises = this.ensureArray<any>(entreprisesPageData.content);
        const requests = this.ensureArray<any>(requestsPageData.content)
          .sort((left, right) => this.toDateMs(right?.dateCreation ?? right?.createdAt) - this.toDateMs(left?.dateCreation ?? left?.createdAt));

        const totalUsers = Number(usersPageData.totalElements ?? users.length);
        const activeUsers = users.filter(user => this.isActiveUser(user?.statut)).length;
        const managerCount = users.filter(user => this.hasManagerRole(user)).length;
        const rhCount = users.filter(user => this.hasRhRole(user)).length;
        const employeeCount = users.filter(user => this.hasEmployeeRole(user)).length;
        const adminCount = users.filter(user => this.hasAdminRole(user)).length;

        const totalEntreprises = Number(entreprisesPageData.totalElements ?? entreprises.length);
        const activeEntreprises = entreprises.filter(item => this.isActiveCompany(item)).length;
        const inactiveEntreprises = Math.max(totalEntreprises - activeEntreprises, 0);

        const analytics = (globalAnalytics.data ?? {}) as Record<string, unknown>;
        const trackedUsers = this.toNumber(analytics['totalTrackedUsers'] ?? totalUsers);
        const presentToday = this.toNumber(analytics['presentToday']);
        const absentToday = this.toNumber(analytics['absentToday']);
        const lateToday = this.toNumber(analytics['lateToday']);
        const pendingRequests = this.countPendingRequests(requests);
        const attendanceRate = trackedUsers > 0 ? Math.round((presentToday / trackedUsers) * 100) : 0;

        const stats: DashboardStat[] = [
          {
            id: 'admin-total-users',
            label: 'Total utilisateurs',
            value: usersUnavailable ? noDataLabel : this.formatNumber(totalUsers),
            detail: usersUnavailable
              ? 'Source utilisateurs indisponible'
              : `${this.formatNumber(activeUsers)} actifs`,
            icon: 'users',
            tone: 'primary'
          },
          {
            id: 'admin-active-users',
            label: 'Utilisateurs actifs',
            value: usersUnavailable ? noDataLabel : this.formatNumber(activeUsers),
            detail: usersUnavailable ? 'Source utilisateurs indisponible' : `${this.formatNumber(Math.max(totalUsers - activeUsers, 0))} inactifs`,
            icon: 'badge-check',
            tone: 'success'
          },
          {
            id: 'admin-total-entreprises',
            label: 'Entreprises',
            value: entreprisesUnavailable ? noDataLabel : this.formatNumber(totalEntreprises),
            detail: entreprisesUnavailable
              ? 'Source entreprises indisponible'
              : `${this.formatNumber(activeEntreprises)} actives`,
            icon: 'building-2',
            tone: 'info'
          },
          {
            id: 'admin-active-enterprises',
            label: 'Entreprises actives',
            value: entreprisesUnavailable ? noDataLabel : this.formatNumber(activeEntreprises),
            detail: entreprisesUnavailable ? 'Source entreprises indisponible' : `${this.formatNumber(inactiveEntreprises)} inactives`,
            icon: 'building-2',
            tone: 'success'
          },
          {
            id: 'admin-rh',
            label: 'Gestionnaires RH',
            value: usersUnavailable ? noDataLabel : this.formatNumber(rhCount),
            detail: usersUnavailable ? 'Source utilisateurs indisponible' : 'Comptes RH',
            icon: 'shield-check',
            tone: 'primary'
          },
          {
            id: 'admin-managers',
            label: 'Managers',
            value: usersUnavailable ? noDataLabel : this.formatNumber(managerCount),
            detail: usersUnavailable ? 'Source utilisateurs indisponible' : 'Responsables equipe',
            icon: 'users',
            tone: 'info'
          },
          {
            id: 'admin-employees',
            label: 'Employes',
            value: usersUnavailable ? noDataLabel : this.formatNumber(employeeCount),
            detail: usersUnavailable ? 'Source utilisateurs indisponible' : `${this.formatNumber(adminCount)} admin(s)`,
            icon: 'users',
            tone: 'neutral'
          },
          {
            id: 'admin-presence',
            label: 'Présence aujourd hui',
            value: presenceUnavailable
              ? noDataLabel
              : `${this.formatNumber(presentToday)} / ${this.formatNumber(trackedUsers)}`,
            detail: presenceUnavailable ? 'Source présence indisponible' : `${attendanceRate}% présents`,
            icon: 'timer',
            tone: attendanceRate >= 80 ? 'success' : 'warning'
          },
          {
            id: 'admin-pending',
            label: 'Demandes en attente',
            value: requestsUnavailable ? noDataLabel : this.formatNumber(pendingRequests),
            detail: requestsUnavailable ? 'Source demandes indisponible' : 'Workflow a traiter',
            icon: 'inbox',
            tone: pendingRequests > 0 ? 'warning' : 'success'
          }
        ];

        const departmentDistribution = this.normalizeRecordNumbers(analytics['departmentDistribution'] as Record<string, unknown> ?? {});
        const requestTypeDistribution = this.normalizeRecordNumbers(this.countBy(requests, request => String(request?.typeDemande ?? 'AUTRE')));
        const monthlySeries = this.normalizeMonthSeries(this.monthlyRequestDistribution(requests));
        const roleDistribution = this.normalizeRecordNumbers({
          RH: rhCount,
          MANAGER: managerCount,
          EMPLOYEE: employeeCount,
          ADMIN: adminCount
        });
        const enterpriseHealthDistribution = this.normalizeRecordNumbers({
          ACTIVES: activeEntreprises,
          INACTIVES: inactiveEntreprises
        });

        const charts: DashboardChartSeries[] = ([
          {
            id: 'admin-donut-role-distribution',
            title: 'Répartition des rôles',
            subtitle: 'Vue des profils utilisateurs',
            type: 'donut',
            labels: Object.keys(roleDistribution),
            values: Object.values(roleDistribution),
            tone: 'primary'
          },
          {
            id: 'admin-bar-enterprise-health',
            title: 'Santé des entreprises',
            subtitle: 'Actives vs inactives',
            type: 'bar',
            labels: Object.keys(enterpriseHealthDistribution),
            values: Object.values(enterpriseHealthDistribution),
            tone: 'info'
          },
          {
            id: 'admin-line-request-monthly',
            title: 'Évolution mensuelle des demandes',
            subtitle: 'Derniers flux demandes',
            type: 'line',
            labels: monthlySeries.labels,
            values: monthlySeries.values,
            tone: 'primary'
          },
          {
            id: 'admin-bar-dept',
            title: 'Répartition par département',
            subtitle: 'Population suivie',
            type: 'bar',
            labels: Object.keys(departmentDistribution),
            values: Object.values(departmentDistribution),
            tone: 'info'
          },
          {
            id: 'admin-donut-requests',
            title: 'Types de demandes',
            subtitle: 'Classification demandes',
            type: 'donut',
            labels: Object.keys(requestTypeDistribution),
            values: Object.values(requestTypeDistribution),
            tone: 'warning'
          },
          {
            id: 'admin-area-presence',
            title: 'Synthèse présence globale',
            subtitle: 'Presents, absents, retards et sessions',
            type: 'area',
            labels: ['Presents', 'Absents', 'Retards', 'Sessions ouvertes'],
            values: [
              presentToday,
              absentToday,
              lateToday,
              this.toNumber(analytics['openSessions'])
            ],
            tone: 'success'
          }
        ] as DashboardChartSeries[]).map(chart => this.ensureChartData(chart));

        const activities: DashboardActivity[] = requests.slice(0, 10).map((request, index) => ({
          id: `admin-activity-${request?.id ?? index}`,
          title: this.requestOwnerLabel(request),
          description: `${this.requestTypeLabel(request?.typeDemande)} ${this.requestStatusLabel(request?.statut)}`,
          timestamp: this.formatRelativeDate(request?.dateCreation ?? request?.createdAt),
          tone: this.requestTone(request?.statut)
        }));

        const alerts = this.buildAdminAlerts(
          presenceUnavailable ? null : attendanceRate,
          requestsUnavailable ? null : pendingRequests,
          presenceUnavailable ? null : absentToday,
          presenceUnavailable ? null : lateToday
        );
        const notifItems = this.normalizeNotifications(notifications);
        const notificationsCombined = [...alerts, ...notifItems].slice(0, 10);

        const people: DashboardPeopleItem[] = users
          .sort((left, right) => this.toDateMs(right?.dateCreation) - this.toDateMs(left?.dateCreation))
          .slice(0, 8)
          .map((user, index) => ({
            id: `admin-user-${user?.id ?? index}`,
            fullName: this.personLabel(user?.prenom, user?.nom, user?.email),
            subline: user?.poste || user?.email || 'Profil utilisateur',
            status: this.userStatusLabel(user?.statut),
            statusTone: this.userStatusTone(user?.statut)
          }));

        const segments: DashboardSegment[] = [
          { id: 'active-users', label: 'Utilisateurs actifs', value: activeUsers, tone: 'success' },
          { id: 'inactive-users', label: 'Utilisateurs inactifs', value: Math.max(totalUsers - activeUsers, 0), tone: 'warning' },
          { id: 'active-enterprises', label: 'Entreprises actives', value: activeEntreprises, tone: 'info' },
          { id: 'inactive-enterprises', label: 'Entreprises inactives', value: inactiveEntreprises, tone: 'danger' }
        ];

        const quickActions: DashboardQuickAction[] = [
          { id: 'qa-admin-users', label: 'Gérer utilisateurs', route: '/app/admin/users', icon: 'users', tone: 'primary' },
          { id: 'qa-admin-entreprises', label: 'Gérer entreprises', route: '/app/admin/entreprises', icon: 'building-2', tone: 'info' },
          { id: 'qa-admin-rh', label: 'Gestionnaires RH', route: '/app/admin/rh-owners', icon: 'shield-check', tone: 'success' },
          { id: 'qa-admin-roles', label: 'Gérer rôles', route: '/app/admin/roles', icon: 'shield-check', tone: 'warning' },
          { id: 'qa-admin-presence', label: 'Voir présence', route: '/app/admin/presence', icon: 'timer', tone: 'info' }
        ];

        return {
          role: 'ADMIN',
          heroTitle: 'Vue système globale',
          heroSubtitle: 'Pilotage des utilisateurs, entreprises, présence et opérations RH.',
          roleBadge: 'Administration',
          stats,
          metricTiles: [],
          charts,
          activities,
          notifications: notificationsCombined,
          quickActions,
          segments,
          people,
          warnings: widgetWarnings
        } as DashboardPayload;
      }),
      catchError(() => throwError(() => new Error('Impossible de charger le tableau de bord administrateur.')))
    );
  }

  private loadRhDashboard(): Observable<DashboardPayload> {
    const pagedParams = new HttpParams().set('page', '0').set('size', '100');
    const pendingRhParams = new HttpParams().set('page', '0').set('size', '100').set('statut', 'EN_ATTENTE_RH');

    const notifications$ = this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(`${this.api.getApiBase()}/rh/notifications/mes-notifications`, {
        params: new HttpParams().set('page', '0').set('size', '10'),
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response)));

    const rhRequests$ = this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(this.api.RH.GET_ALL_DEMANDS, {
        params: pendingRhParams,
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.normalizePageResponse<any>(response, 0, 100)));

    const documentStats$ = this.http
      .get<ApiEnvelope<Record<string, unknown>> | Record<string, unknown>>(this.api.RH.GET_RH_DOCUMENT_STATS, {
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response) ?? {}));

    const documents$ = this.http
      .get<ApiEnvelope<any[]> | any[]>(this.api.RH.GET_RH_DOCUMENT_REQUESTS, {
        params: pagedParams,
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response)));

    return forkJoin({
      dashboard: this.optionalRequest(
        this.http.get<ApiEnvelope<any> | any>(this.api.RH.GET_RH_DASHBOARD, { context: this.optionalRequestContext }).pipe(map(response => this.unwrap(response))),
        {},
        'rh-dashboard',
        'Synthese RH indisponible'
      ),
      companyToday: this.optionalRequest(
        this.presenceMonitoring.getCompanyToday(),
        null,
        'rh-presence-today',
        'Presence entreprise indisponible'
      ),
      companyStats: this.optionalRequest(
        this.presenceMonitoring.getCompanyStats(),
        null,
        'rh-presence-stats',
        'Statistiques presence RH indisponibles'
      ),
      requestTypes: this.optionalRequest(
        this.adminApi.getDemandesByType(),
        {},
        'rh-request-types',
        'Repartition des demandes indisponible'
      ),
      monthlyEvolution: this.optionalRequest(
        this.adminApi.getMonthlyEvolution(),
        {},
        'rh-monthly-evolution',
        'Evolution mensuelle indisponible'
      ),
      rhRequests: this.optionalRequest(
        rhRequests$,
        this.emptyPage<any>(0, 100),
        'rh-pending-requests',
        'Demandes RH en attente indisponibles'
      ),
      documentStats: this.optionalRequest(
        documentStats$,
        {},
        'rh-document-stats',
        'Statistiques documents indisponibles'
      ),
      documents: this.optionalRequest(
        documents$,
        [],
        'rh-documents',
        'Demandes documents indisponibles'
      ),
      notifications: this.optionalRequest(
        notifications$,
        [] as any[],
        'rh-notifications',
        'Notifications RH indisponibles'
      )
    }).pipe(
      map(({ dashboard, companyToday, companyStats, requestTypes, monthlyEvolution, rhRequests, documentStats, documents, notifications }) => {
        const widgetWarnings = [dashboard, companyToday, companyStats, requestTypes, monthlyEvolution, rhRequests, documentStats, documents, notifications]
          .map(item => item.warning)
          .filter((warning): warning is DashboardWidgetWarning => warning !== null);

        const source = (dashboard.data ?? {}) as any;
        const today = (companyToday.data ?? {}) as any;
        const statsSource = (companyStats.data ?? {}) as any;
        const pendingRhRequests = this.ensureArray<any>(rhRequests.data?.content);
        const documentStatsData = (documentStats.data ?? {}) as any;
        const documentRows = this.ensureArray<any>(documents.data);

        const totalEmployees = this.toNumber(source?.totalEmployees ?? today?.totalMembers ?? today?.members?.length);
        const presentCount = this.toNumber(source?.presentCount ?? today?.presentCount ?? statsSource?.totalPresent);
        const absentCount = this.toNumber(source?.absentCount ?? today?.absentCount ?? statsSource?.totalAbsent);
        const lateCount = this.toNumber(statsSource?.lateCount ?? today?.lateCount ?? source?.attendanceStats?.late);
        const hoursWorked = this.toNumber(source?.hoursWorked ?? statsSource?.totalHoursWorked);
        const attendanceRate = totalEmployees > 0
          ? Math.round((presentCount / totalEmployees) * 100)
          : Math.round(this.toNumber(source?.attendanceRate));
        const absenceRate = totalEmployees > 0 ? Math.round((absentCount / totalEmployees) * 100) : 0;

        const pendingRequestsCount = pendingRhRequests.length || this.ensureArray<any>(source?.pendingRequests).length;
        const documentsPending = this.toNumber(
          documentStatsData['pending']
          ?? documentStatsData['enAttente']
          ?? documentStatsData['EN_ATTENTE']
          ?? documentRows.filter(row => this.isPendingRequestStatus(row?.statut ?? row?.status)).length
        );
        const leaveToValidate = pendingRhRequests.filter(item => String(item?.typeDemande ?? item?.type ?? '').toUpperCase().includes('CONGE')).length;
        const teleworkToValidate = pendingRhRequests.filter(item => String(item?.typeDemande ?? item?.type ?? '').toUpperCase().includes('TELE')).length;

        const attendanceStats = source?.attendanceStats ?? {};
        const requestStats = source?.requestStats ?? {};

        const stats: DashboardStat[] = [
          {
            id: 'rh-total-employees',
            label: 'Effectif entreprise',
            value: this.formatNumber(totalEmployees),
            detail: `${attendanceRate}% de presence`,
            icon: 'users',
            tone: 'primary'
          },
          {
            id: 'rh-present',
            label: 'Presents aujourd hui',
            value: this.formatNumber(presentCount),
            detail: 'Collaborateurs pointes',
            icon: 'badge-check',
            tone: 'success'
          },
          {
            id: 'rh-absent',
            label: 'Absents aujourd hui',
            value: this.formatNumber(absentCount),
            detail: `${absenceRate}% d absence`,
            icon: 'user-x',
            tone: absentCount > 0 ? 'warning' : 'success'
          },
          {
            id: 'rh-late',
            label: 'Retards',
            value: this.formatNumber(lateCount),
            detail: 'Ponctualite du jour',
            icon: 'clock',
            tone: lateCount > 0 ? 'warning' : 'success'
          },
          {
            id: 'rh-pending',
            label: 'Demandes RH en attente',
            value: this.formatNumber(pendingRequestsCount),
            detail: pendingRequestsCount > 0 ? 'Decision RH requise' : 'Workflow stable',
            icon: 'inbox',
            tone: pendingRequestsCount > 0 ? 'warning' : 'success'
          },
          {
            id: 'rh-documents',
            label: 'Documents en attente',
            value: this.formatNumber(documentsPending),
            detail: 'Demandes documentaires',
            icon: 'file-text',
            tone: documentsPending > 0 ? 'warning' : 'neutral'
          },
          {
            id: 'rh-leaves',
            label: 'Conges a valider',
            value: this.formatNumber(leaveToValidate),
            detail: 'Demandes conges RH',
            icon: 'calendar',
            tone: leaveToValidate > 0 ? 'warning' : 'success'
          },
          {
            id: 'rh-telework',
            label: 'Teletravail a valider',
            value: this.formatNumber(teleworkToValidate),
            detail: 'Demandes teletravail RH',
            icon: 'house',
            tone: teleworkToValidate > 0 ? 'warning' : 'success'
          }
        ];

        const requestTypeDistribution = this.normalizeRecordNumbers(Object.keys(requestTypes.data ?? {}).length > 0
          ? requestTypes.data as Record<string, unknown>
          : {
              CONGE: this.toNumber(requestStats?.leave),
              AUTORISATION: this.toNumber(requestStats?.autorisation),
              TELETRAVAIL: this.toNumber(requestStats?.teletravail)
            });
        const monthlySeries = this.normalizeMonthSeries((monthlyEvolution.data ?? source?.monthlyRequestEvolution ?? {}) as Record<string, number>);
        const departmentDistribution = this.normalizeRecordNumbers((source?.departmentEmployeeCounts ?? source?.departmentDistribution ?? {}) as Record<string, unknown>);

        const charts: DashboardChartSeries[] = ([
          {
            id: 'rh-line-monthly',
            title: 'Evolution des demandes',
            subtitle: 'Derniers mois',
            type: 'line',
            labels: monthlySeries.labels,
            values: monthlySeries.values,
            tone: 'primary'
          },
          {
            id: 'rh-bar-attendance',
            title: 'Presence aujourd hui',
            subtitle: 'Presents, absents, retards',
            type: 'bar',
            labels: ['Presents', 'Absents', 'Retards', 'Remote'],
            values: [
              presentCount,
              absentCount,
              lateCount,
              this.toNumber(attendanceStats?.remote ?? today?.remoteCount)
            ],
            tone: 'success'
          },
          {
            id: 'rh-donut-requests',
            title: 'Validations RH',
            subtitle: 'Demandes par type',
            type: 'donut',
            labels: Object.keys(requestTypeDistribution),
            values: Object.values(requestTypeDistribution),
            tone: 'warning'
          },
          {
            id: 'rh-bar-departments',
            title: 'Distribution departements',
            subtitle: 'Collaborateurs par departement',
            type: 'bar',
            labels: Object.keys(departmentDistribution),
            values: Object.values(departmentDistribution),
            tone: 'info'
          }
        ] as DashboardChartSeries[]).map(chart => this.ensureChartData(chart));

        const activities: DashboardActivity[] = [
          ...pendingRhRequests.slice(0, 6).map((item, index) => ({
            id: `rh-request-${item?.id ?? index}`,
            title: this.requestOwnerLabel(item),
            description: `${this.requestTypeLabel(item?.typeDemande ?? item?.type)} ${this.requestStatusLabel(item?.statut)}`,
            timestamp: this.formatRelativeDate(item?.dateCreation ?? item?.createdAt),
            tone: this.requestTone(item?.statut)
          })),
          ...this.ensureArray<any>(source?.recentActivities).slice(0, 6).map((item, index) => ({
            id: String(item?.id ?? `rh-activity-${index}`),
            title: String(item?.title ?? 'Activite RH'),
            description: String(item?.description ?? ''),
            timestamp: this.formatRelativeDate(item?.date),
            tone: 'info' as UiTone
          }))
        ].slice(0, 10);

        const people: DashboardPeopleItem[] = this.ensureArray<any>(source?.highlightedEmployees)
          .slice(0, 10)
          .map((member, index) => ({
            id: String(member?.id ?? `rh-member-${index}`),
            fullName: this.personLabel(member?.firstName ?? member?.prenom, member?.lastName ?? member?.nom, member?.email),
            subline: String(member?.team ?? member?.department ?? member?.role ?? 'Collaborateur'),
            status: this.employeeStatusLabel(member?.status),
            statusTone: this.employeeStatusTone(member?.status)
          }));

        const segments: DashboardSegment[] = [
          { id: 'present', label: 'Presents', value: presentCount, tone: 'success' },
          { id: 'absent', label: 'Absents', value: absentCount, tone: 'danger' },
          { id: 'late', label: 'Retards', value: lateCount, tone: 'warning' },
          { id: 'pending', label: 'Validations', value: pendingRequestsCount, tone: 'info' }
        ];

        const quickActions: DashboardQuickAction[] = [
          { id: 'qa-rh-requests', label: 'Voir demandes', route: '/app/rh/requests', icon: 'clipboard-check', tone: 'warning' },
          { id: 'qa-rh-documents', label: 'Documents RH', route: '/app/rh/documents', icon: 'file-text', tone: 'success' },
          { id: 'qa-rh-employees', label: 'Gerer employes', route: '/app/rh/structure/employes', icon: 'users', tone: 'primary' },
          { id: 'qa-rh-analytics', label: 'Analytics RH', route: '/app/rh/analytics', icon: 'bar-chart', tone: 'info' }
        ];

        const notificationsOut = this.normalizeNotifications(notifications.data).slice(0, 10);

        return {
          role: 'RH',
          heroTitle: 'Centre RH entreprise',
          heroSubtitle: 'Suivi des collaborateurs, validations RH, documents et indicateurs de presence.',
          roleBadge: 'Ressources humaines',
          stats,
          metricTiles: [
            { id: 'rh-tile-attendance', label: 'Taux presence', value: `${attendanceRate}%`, tone: attendanceRate >= 85 ? 'success' : 'warning' },
            { id: 'rh-tile-absence', label: 'Taux absence', value: `${absenceRate}%`, tone: absenceRate > 20 ? 'danger' : 'neutral' },
            { id: 'rh-tile-hours', label: 'Heures suivies', value: `${hoursWorked.toFixed(1)} h`, tone: 'info' },
            { id: 'rh-tile-documents', label: 'Documents', value: this.formatNumber(documentsPending), tone: documentsPending > 0 ? 'warning' : 'neutral' }
          ],
          charts,
          activities,
          notifications: notificationsOut,
          quickActions,
          segments,
          people,
          warnings: widgetWarnings
        } as DashboardPayload;
      }),
      catchError(() => throwError(() => new Error('Impossible de charger le tableau de bord RH.')))
    );
  }
  private loadManagerDashboard(): Observable<DashboardPayload> {
    const notifications$ = this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(this.api.NOTIFICATIONS.GET_ALL, {
        params: new HttpParams().set('page', '0').set('size', '10'),
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response)));

    return forkJoin({
      snapshot: this.optionalRequest(
        this.managerApi.getManagerTeamSnapshot(),
        { members: [], overview: null } as any,
        'manager-team',
        'Equipe manager indisponible'
      ),
      pendingPage: this.optionalRequest(
        this.managerApi.getPendingRequests(0, 12),
        this.emptyPage<any>(0, 12),
        'manager-pending-requests',
        'Approbations manager indisponibles'
      ),
      managerStats: this.optionalRequest(
        this.http.get<ApiEnvelope<ManagerStatsLike> | ManagerStatsLike>(this.api.RH.GET_MANAGER_STATS, {
          context: this.optionalRequestContext
        }).pipe(map(response => this.unwrap(response))),
        {} as ManagerStatsLike,
        'manager-stats',
        'Statistiques manager indisponibles'
      ),
      teamHistoryPage: this.optionalRequest(
        this.presenceMonitoring.getTeamHistory(undefined, 30),
        { content: [], totalElements: 0, totalPages: 0, number: 0, size: 30 } as any,
        'manager-team-history',
        'Historique presence equipe indisponible'
      ),
      notifications: this.optionalRequest(
        notifications$,
        [] as any[],
        'manager-notifications',
        'Notifications manager indisponibles'
      )
    }).pipe(
      map(({ snapshot, pendingPage, managerStats, teamHistoryPage, notifications }) => {
        const widgetWarnings = [snapshot, pendingPage, managerStats, teamHistoryPage, notifications]
          .map(item => item.warning)
          .filter((warning): warning is DashboardWidgetWarning => warning !== null);

        const snapshotData = snapshot.data as any;
        const members = this.ensureArray<any>(snapshotData?.members);
        const pendingRequests = this.ensureArray<any>(pendingPage.data?.content);
        const statsData = (managerStats.data ?? {}) as ManagerStatsLike;
        const totalMembers = members.length;
        const presentCount = members.filter(member => ['PRESENT', 'LATE', 'REMOTE'].includes(String(member?.presence?.status ?? ''))).length;
        const absentCount = Math.max(totalMembers - presentCount, 0);
        const lateCount = members.filter(member => Boolean(member?.presence?.lateArrival) || String(member?.presence?.status ?? '') === 'LATE').length;
        const attendanceRate = totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 0;

        const weeklySeconds = this.ensureArray<any>(teamHistoryPage.data?.content)
          .map(item => this.toNumber(item?.duration))
          .reduce((acc, value) => acc + value, 0);
        const weeklyHours = weeklySeconds / 3600;
        const pendingCount = this.toNumber(statsData?.pendingCount ?? pendingRequests.length);
        const approvedCount = this.toNumber(statsData?.approvedCount);
        const rejectedCount = this.toNumber(statsData?.rejectedCount);

        const stats: DashboardStat[] = [
          {
            id: 'manager-team-size',
            label: 'Membres equipe',
            value: this.formatNumber(totalMembers),
            detail: totalMembers > 0 ? 'Collaborateurs affectes' : 'Aucun membre affecte',
            icon: 'users',
            tone: 'primary'
          },
          {
            id: 'manager-present',
            label: 'Presents aujourd hui',
            value: this.formatNumber(presentCount),
            detail: `${attendanceRate}% de presence`,
            icon: 'badge-check',
            tone: 'success'
          },
          {
            id: 'manager-absent',
            label: 'Absents aujourd hui',
            value: this.formatNumber(absentCount),
            detail: 'Suivi equipe',
            icon: 'user-x',
            tone: absentCount > 0 ? 'warning' : 'success'
          },
          {
            id: 'manager-late',
            label: 'Retards',
            value: this.formatNumber(lateCount),
            detail: lateCount > 0 ? 'Ponctualite a suivre' : 'Ponctualite stable',
            icon: 'clock',
            tone: lateCount > 0 ? 'warning' : 'success'
          },
          {
            id: 'manager-pending',
            label: 'Approbations en attente',
            value: this.formatNumber(pendingCount),
            detail: 'Validation manager',
            icon: 'inbox',
            tone: pendingCount > 0 ? 'warning' : 'success'
          },
          {
            id: 'manager-weekly-hours',
            label: 'Heures equipe semaine',
            value: `${weeklyHours.toFixed(1)} h`,
            detail: 'Sessions cloturees',
            icon: 'timer',
            tone: 'info'
          },
          {
            id: 'manager-attendance-rate',
            label: 'Taux presence equipe',
            value: `${attendanceRate}%`,
            detail: `${presentCount}/${totalMembers} presents`,
            icon: 'activity',
            tone: attendanceRate >= 80 ? 'success' : 'warning'
          }
        ];

        const dailyPresence = this.buildPresenceHistory(members);
        const requestByType = this.countBy(pendingRequests, item => String(item?.type ?? item?.typeDemande ?? 'AUTRE'));
        const requestByStatus = this.countBy(pendingRequests, item => String(item?.statut ?? 'EN_ATTENTE_MANAGER'));

        const charts: DashboardChartSeries[] = ([
          {
            id: 'manager-line-presence',
            title: 'Presence equipe',
            subtitle: 'Vue rapide des statuts',
            type: 'line',
            labels: dailyPresence.labels,
            values: dailyPresence.values,
            tone: 'primary'
          },
          {
            id: 'manager-bar-requests',
            title: 'Demandes par type',
            subtitle: 'Demandes en attente',
            type: 'bar',
            labels: Object.keys(requestByType),
            values: Object.values(requestByType),
            tone: 'warning'
          },
          {
            id: 'manager-donut-status',
            title: 'Statut demandes',
            subtitle: 'Repartition workflow',
            type: 'donut',
            labels: Object.keys(requestByStatus),
            values: Object.values(requestByStatus),
            tone: 'info'
          },
          {
            id: 'manager-area-hours',
            title: 'Heures et retards',
            subtitle: 'Charge hebdomadaire',
            type: 'area',
            labels: ['Heures', 'Retards', 'Presents', 'Absents'],
            values: [weeklyHours, lateCount, presentCount, absentCount],
            tone: 'success'
          }
        ] as DashboardChartSeries[]).map(chart => this.ensureChartData(chart));

        const activities: DashboardActivity[] = [
          ...pendingRequests.slice(0, 6).map((item, index) => ({
            id: `manager-request-${item?.id ?? index}`,
            title: this.personLabel(item?.utilisateur?.prenom, item?.utilisateur?.nom, item?.utilisateur?.email),
            description: `${this.requestTypeLabel(item?.type ?? item?.typeDemande)} ${this.requestStatusLabel(item?.statut)}`,
            timestamp: this.formatRelativeDate(item?.dateCreation),
            tone: this.requestTone(item?.statut)
          })),
          ...members
            .filter(member => !!member?.presence)
            .slice(0, 4)
            .map((member, index) => ({
              id: `manager-presence-${member?.id ?? index}`,
              title: this.personLabel(member?.prenom, member?.nom, member?.email),
              description: `Statut presence: ${this.employeeStatusLabel(member?.presence?.status)}`,
              timestamp: this.formatRelativeDate(member?.presence?.heureEntree),
              tone: this.employeeStatusTone(member?.presence?.status)
            }))
        ].slice(0, 10);

        const notificationsOut = [
          ...(pendingCount > 0 ? [{
            id: 'manager-alert-pending',
            title: 'Approbations en attente',
            message: `${pendingCount} demande(s) attendent votre decision.`,
            timestamp: 'Maintenant',
            tone: 'warning' as UiTone,
            unread: true
          }] : []),
          ...(lateCount > 0 ? [{
            id: 'manager-alert-late',
            title: 'Retards detectes',
            message: `${lateCount} membre(s) en retard aujourd hui.`,
            timestamp: 'Maintenant',
            tone: 'warning' as UiTone,
            unread: true
          }] : []),
          ...this.normalizeNotifications(notifications.data)
        ].slice(0, 10);

        const people: DashboardPeopleItem[] = members.slice(0, 12).map((member, index) => ({
          id: String(member?.id ?? `manager-member-${index}`),
          fullName: this.personLabel(member?.prenom, member?.nom, member?.email),
          subline: String(member?.equipeNom ?? member?.departementNom ?? member?.poste ?? 'Collaborateur'),
          status: this.employeeStatusLabel(member?.presence?.status ?? member?.statut),
          statusTone: this.employeeStatusTone(member?.presence?.status ?? member?.statut)
        }));

        const segments: DashboardSegment[] = [
          { id: 'present', label: 'Presents', value: presentCount, tone: 'success' },
          { id: 'absent', label: 'Absents', value: absentCount, tone: 'danger' },
          { id: 'late', label: 'Retards', value: lateCount, tone: 'warning' },
          { id: 'pending', label: 'En attente', value: pendingCount, tone: 'info' }
        ];

        const quickActions: DashboardQuickAction[] = [
          { id: 'qa-manager-team', label: 'Voir equipe', route: '/app/manager/equipe', icon: 'users', tone: 'primary' },
          { id: 'qa-manager-approve', label: 'Approbations', route: '/app/manager/approbations', icon: 'clipboard-check', tone: 'warning' },
          { id: 'qa-manager-presence', label: 'Voir presence', route: '/app/manager/presence', icon: 'timer', tone: 'info' },
          { id: 'qa-manager-schedule', label: 'Planning equipe', route: '/app/manager/horaires', icon: 'calendar', tone: 'success' }
        ];

        return {
          role: 'MANAGER',
          heroTitle: 'Pilotage equipe manager',
          heroSubtitle: 'Suivi de presence, validations et performance de votre equipe.',
          roleBadge: 'Manager',
          stats,
          metricTiles: [
            { id: 'manager-tile-attendance', label: 'Taux presence', value: `${attendanceRate}%`, tone: attendanceRate >= 80 ? 'success' : 'warning' },
            { id: 'manager-tile-hours', label: 'Heures semaine', value: `${weeklyHours.toFixed(1)} h`, tone: 'info' },
            { id: 'manager-tile-pending', label: 'Demandes attente', value: this.formatNumber(pendingCount), tone: pendingCount > 0 ? 'warning' : 'neutral' },
            { id: 'manager-tile-decisions', label: 'Decisions', value: this.formatNumber(approvedCount + rejectedCount), tone: 'success' }
          ],
          charts,
          activities,
          notifications: notificationsOut,
          quickActions,
          segments,
          people,
          warnings: widgetWarnings
        } as DashboardPayload;
      }),
      catchError(() => throwError(() => new Error('Impossible de charger le tableau de bord manager.')))
    );
  }
  private loadEmployeeDashboard(): Observable<DashboardPayload> {
    const year = new Date().getFullYear();
    const pagedParams = new HttpParams().set('page', '0').set('size', '12');
    const historyParams = new HttpParams().set('page', '0').set('size', '20');

    const myNotifications$ = this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(`${this.api.getApiBase()}/rh/notifications/mes-notifications`, {
        params: new HttpParams().set('page', '0').set('size', '10'),
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response)));

    const myDocuments$ = this.http
      .get<ApiEnvelope<any[]> | any[]>(this.api.RH.GET_MY_DOCUMENTS, { context: this.optionalRequestContext })
      .pipe(map(response => this.unwrap(response)));

    const myAutorisations$ = this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(this.api.RH.GET_MY_AUTORISATIONS, {
        params: pagedParams,
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response)));

    return forkJoin({
      todayPresence: this.optionalRequest(
        this.http.get<ApiEnvelope<any> | any>(this.api.PRESENCE.GET_MY_TODAY, { context: this.optionalRequestContext }).pipe(map(response => this.unwrap(response))),
        {},
        'employee-today-presence',
        'Pointage du jour indisponible'
      ),
      myStats: this.optionalRequest(
        this.http.get<ApiEnvelope<any> | any>(this.api.PRESENCE.GET_MY_STATS, { context: this.optionalRequestContext }).pipe(map(response => this.unwrap(response))),
        {},
        'employee-presence-stats',
        'Statistiques personnelles indisponibles'
      ),
      leaveBalance: this.optionalRequest(
        this.http.get<ApiEnvelope<any[]> | any[]>(this.api.RH.GET_LEAVE_BALANCE(year), {
          context: this.optionalRequestContext
        }).pipe(map(response => this.unwrap(response))),
        [] as any[],
        'employee-leave-balance',
        'Solde conges indisponible'
      ),
      myConges: this.optionalRequest(
        this.http.get<ApiEnvelope<Paged<any>> | Paged<any>>(this.api.RH.GET_MY_CONGES, {
          params: pagedParams,
          context: this.optionalRequestContext
        }).pipe(map(response => this.unwrap(response))),
        this.emptyPage<any>(0, 12),
        'employee-leave-requests',
        'Demandes conges indisponibles'
      ),
      myTelework: this.optionalRequest(
        this.http.get<ApiEnvelope<Paged<any>> | Paged<any>>(this.api.RH.GET_MY_TELETRAVAILS, {
          params: pagedParams,
          context: this.optionalRequestContext
        }).pipe(map(response => this.unwrap(response))),
        this.emptyPage<any>(0, 12),
        'employee-telework-requests',
        'Demandes teletravail indisponibles'
      ),
      myAutorisations: this.optionalRequest(
        myAutorisations$,
        this.emptyPage<any>(0, 12),
        'employee-authorization-requests',
        'Demandes autorisation indisponibles'
      ),
      myDocuments: this.optionalRequest(
        myDocuments$,
        [] as any[],
        'employee-document-requests',
        'Demandes documents indisponibles'
      ),
      myHistory: this.optionalRequest(
        this.http.get<ApiEnvelope<Paged<any>> | Paged<any>>(this.api.PRESENCE.GET_MY_HISTORY, {
          params: historyParams,
          context: this.optionalRequestContext
        }).pipe(map(response => this.unwrap(response))),
        this.emptyPage<any>(0, 20),
        'employee-presence-history',
        'Historique pointage indisponible'
      ),
      notifications: this.optionalRequest(
        myNotifications$,
        [] as any[],
        'employee-notifications',
        'Notifications personnelles indisponibles'
      )
    }).pipe(
      map(({ todayPresence, myStats, leaveBalance, myConges, myTelework, myAutorisations, myDocuments, myHistory, notifications }) => {
        const widgetWarnings = [todayPresence, myStats, leaveBalance, myConges, myTelework, myAutorisations, myDocuments, myHistory, notifications]
          .map(item => item.warning)
          .filter((warning): warning is DashboardWidgetWarning => warning !== null);

        const today = (todayPresence.data ?? {}) as any;
        const statsSource = (myStats.data ?? {}) as any;
        const attendanceState = this.resolveEmployeeAttendanceState(today);
        const workedSecondsToday = this.toNumber(today?.workedSeconds ?? today?.totalDuration);
        const hoursToday = workedSecondsToday / 3600;
        const weeklyHours = this.toNumber(statsSource?.totalHoursThisWeek ?? today?.weekWorkedSeconds / 3600);
        const attendanceRate = this.computeAttendanceRate(this.toNumber(statsSource?.totalPresent), this.toNumber(statsSource?.totalAbsent), this.toNumber(statsSource?.lateCount));
        const leaveDays = this.ensureArray<any>(leaveBalance.data)
          .map(item => this.toNumber(item?.joursRestants))
          .reduce((acc, value) => acc + value, 0);

        const conges = this.ensureArray<any>((myConges.data as any)?.content ?? myConges.data);
        const telework = this.ensureArray<any>((myTelework.data as any)?.content ?? myTelework.data);
        const autorisations = this.ensureArray<any>((myAutorisations.data as any)?.content ?? myAutorisations.data);
        const documents = this.ensureArray<any>(myDocuments.data);
        const history = this.ensureArray<any>((myHistory.data as any)?.content ?? myHistory.data);
        const allRequests = [...conges, ...telework, ...autorisations, ...documents];
        const pendingRequests = allRequests.filter(item => this.isPendingRequestStatus(item?.statut ?? item?.status)).length;
        const lastEntry = today?.checkIn ?? today?.heureEntree ?? today?.activeSession?.checkIn ?? null;
        const lastExit = today?.checkOut ?? today?.heureSortie ?? today?.activeSession?.checkOut ?? null;

        const stats: DashboardStat[] = [
          {
            id: 'employee-today-attendance',
            label: 'Statut aujourd hui',
            value: this.employeeAttendanceStateLabel(attendanceState),
            detail: this.employeeAttendanceStateDetail(attendanceState),
            icon: 'activity',
            tone: this.employeeAttendanceStateTone(attendanceState)
          },
          {
            id: 'employee-hours-today',
            label: 'Heures aujourd hui',
            value: `${hoursToday.toFixed(1)} h`,
            detail: lastEntry ? `Entree ${this.formatTime(lastEntry)}` : 'Aucune entree',
            icon: 'timer',
            tone: 'info'
          },
          {
            id: 'employee-hours-week',
            label: 'Heures semaine',
            value: `${weeklyHours.toFixed(1)} h`,
            detail: `Taux presence ${attendanceRate}%`,
            icon: 'calendar',
            tone: 'primary'
          },
          {
            id: 'employee-leave-balance',
            label: 'Solde conges',
            value: `${leaveDays.toFixed(1)} j`,
            detail: `${this.formatNumber(conges.length)} demande(s) conges`,
            icon: 'wallet',
            tone: 'success'
          },
          {
            id: 'employee-pending',
            label: 'Demandes en attente',
            value: this.formatNumber(pendingRequests),
            detail: 'Conges, teletravail, autorisations, documents',
            icon: 'inbox',
            tone: pendingRequests > 0 ? 'warning' : 'neutral'
          },
          {
            id: 'employee-late',
            label: 'Retards semaine',
            value: this.formatNumber(this.toNumber(statsSource?.lateCount ?? statsSource?.lateArrivals)),
            detail: `${this.formatNumber(this.toNumber(statsSource?.onTimeCount ?? statsSource?.onTimeArrivals))} arrivees a l heure`,
            icon: 'clock',
            tone: this.toNumber(statsSource?.lateCount ?? statsSource?.lateArrivals) > 0 ? 'warning' : 'success'
          },
          {
            id: 'employee-last-entry',
            label: 'Derniere entree',
            value: lastEntry ? this.formatTime(lastEntry) : '--:--',
            detail: lastEntry ? 'Pointage entree' : 'Aucun pointage',
            icon: 'timer',
            tone: lastEntry ? 'success' : 'neutral'
          },
          {
            id: 'employee-last-exit',
            label: 'Derniere sortie',
            value: lastExit ? this.formatTime(lastExit) : '--:--',
            detail: lastExit ? 'Pointage sortie' : 'Session non cloturee',
            icon: 'timer',
            tone: lastExit ? 'info' : 'neutral'
          }
        ];

        const dailyStatuses = this.ensureArray<any>(statsSource?.dailyStatuses);
        const dailyLabels = dailyStatuses.map(item => String(item?.date ?? '').slice(5)).filter(Boolean);
        const dailyValues = dailyStatuses.map(item => this.toNumber(item?.workedSeconds) / 3600);
        const historyLabels = history
          .map(item => String(item?.date ?? item?.checkInTime ?? item?.checkIn ?? '').slice(5, 10))
          .filter(Boolean);
        const historyValues = history.map(item => this.toNumber(item?.duration ?? item?.workedSeconds) / 3600);
        const weeklyLabels = dailyLabels.length > 0 ? dailyLabels : historyLabels;
        const weeklyValues = dailyValues.length > 0 ? dailyValues : historyValues;

        const recentRequestMix = this.countBy(allRequests, item => {
          const type = String(item?.typeDemande ?? item?.type ?? item?.typeDocument ?? 'AUTRE').toUpperCase();
          if (type.includes('TELE')) {
            return 'TELETRAVAIL';
          }
          if (type.includes('CONGE')) {
            return 'CONGE';
          }
          if (type.includes('AUTOR')) {
            return 'AUTORISATION';
          }
          if (type.includes('DOCUMENT')) {
            return 'DOCUMENT';
          }
          return type;
        });

        const charts: DashboardChartSeries[] = ([
          {
            id: 'employee-line-week',
            title: 'Vue hebdomadaire',
            subtitle: 'Heures par jour disponibles',
            type: 'line',
            labels: weeklyLabels,
            values: weeklyValues,
            tone: 'primary'
          },
          {
            id: 'employee-bar-hours',
            title: 'Heures et ponctualite',
            subtitle: 'Charge personnelle',
            type: 'bar',
            labels: ['Heures jour', 'Heures semaine', 'Retards'],
            values: [hoursToday, weeklyHours, this.toNumber(statsSource?.lateCount ?? statsSource?.lateArrivals)],
            tone: 'info'
          },
          {
            id: 'employee-donut-requests',
            title: 'Mes demandes en cours',
            subtitle: 'Repartition demandes',
            type: 'donut',
            labels: Object.keys(recentRequestMix),
            values: Object.values(recentRequestMix),
            tone: 'warning'
          },
          {
            id: 'employee-area-balance',
            title: 'Solde et activite',
            subtitle: 'Conge, attentes, teletravail, documents',
            type: 'area',
            labels: ['Solde', 'En attente', 'Conges', 'Teletravail', 'Documents'],
            values: [leaveDays, pendingRequests, conges.length, telework.length, documents.length],
            tone: 'success'
          }
        ] as DashboardChartSeries[]).map(chart => this.ensureChartData(chart));

        const requestActivities = allRequests.map((item, index) => ({
          id: `employee-request-${item?.id ?? index}`,
          title: this.requestTypeLabel(item?.typeDemande ?? item?.type ?? item?.typeDocument ?? 'DEMANDE'),
          description: `Demande ${this.requestStatusLabel(item?.statut ?? item?.status)}.`,
          timestamp: String(item?.dateCreation ?? item?.createdAt ?? ''),
          tone: this.requestTone(item?.statut ?? item?.status)
        }));
        const historyActivities = history.map((item, index) => ({
          id: `employee-pointage-${item?.id ?? index}`,
          title: 'Pointage',
          description: item?.checkOutTime || item?.checkOut
            ? `Journee cloturee (${this.formatSessionDuration(item?.duration ?? item?.workedSeconds)}).`
            : 'Session demarree.',
          timestamp: String(item?.checkOutTime ?? item?.checkOut ?? item?.checkInTime ?? item?.checkIn ?? ''),
          tone: this.toNumber(item?.lateArrival ? 1 : 0) > 0 ? ('warning' as UiTone) : ('success' as UiTone)
        }));
        const notificationRawItems = this.ensureArray<any>(this.unwrap(notifications.data));
        const notificationActivities = notificationRawItems.map((item, index) => ({
          id: `employee-notification-${item?.id ?? index}`,
          title: String(item?.titre ?? item?.title ?? 'Notification'),
          description: String(item?.message ?? 'Mise a jour de votre activite.'),
          timestamp: String(item?.dateCreation ?? item?.date ?? item?.createdAt ?? ''),
          tone: this.notificationTone(item?.niveau ?? item?.type ?? item?.priority)
        }));

        const activities: DashboardActivity[] = [...historyActivities, ...requestActivities, ...notificationActivities]
          .sort((left, right) => {
            const leftMs = this.toDateMs(left.timestamp);
            const rightMs = this.toDateMs(right.timestamp);
            const safeLeft = Number.isFinite(leftMs) ? leftMs : 0;
            const safeRight = Number.isFinite(rightMs) ? rightMs : 0;
            return safeRight - safeLeft;
          })
          .slice(0, 10)
          .map(item => ({
            ...item,
            timestamp: this.formatRelativeDate(item.timestamp)
          }));

        const notificationsOut = this.normalizeNotifications(notifications.data).slice(0, 10);

        const people: DashboardPeopleItem[] = lastEntry || lastExit ? [
          {
            id: 'employee-self-attendance',
            fullName: 'Pointage du jour',
            subline: `Entree ${lastEntry ? this.formatTime(lastEntry) : '--:--'} - Sortie ${lastExit ? this.formatTime(lastExit) : '--:--'}`,
            status: this.employeeAttendanceStateLabel(attendanceState),
            statusTone: this.employeeAttendanceStateTone(attendanceState)
          }
        ] : [];

        const segments: DashboardSegment[] = [
          { id: 'present', label: 'Presents', value: this.toNumber(statsSource?.totalPresent), tone: 'success' },
          { id: 'absent', label: 'Absents', value: this.toNumber(statsSource?.totalAbsent), tone: 'danger' },
          { id: 'late', label: 'Retards', value: this.toNumber(statsSource?.lateCount ?? statsSource?.lateArrivals), tone: 'warning' },
          { id: 'pending', label: 'Attentes', value: pendingRequests, tone: 'info' }
        ];

        const quickActions: DashboardQuickAction[] = [
          { id: 'qa-employee-pointage', label: 'Pointer', route: '/app/employee/pointage', icon: 'timer', tone: 'primary' },
          { id: 'qa-employee-leave', label: 'Demander conge', route: '/app/employee/conges', icon: 'calendar-plus', tone: 'warning' },
          { id: 'qa-employee-telework', label: 'Soumettre teletravail', route: '/app/employee/teletravail', icon: 'house', tone: 'info' },
          { id: 'qa-employee-docs', label: 'Demander document', route: '/app/employee/documents', icon: 'file-text', tone: 'success' },
          { id: 'qa-employee-profile', label: 'Voir profil', route: '/app/employee/profil', icon: 'users', tone: 'neutral' }
        ];

        return {
          role: 'EMPLOYEE',
          heroTitle: 'Mon espace personnel',
          heroSubtitle: 'Suivi quotidien de votre presence, demandes et documents.',
          roleBadge: 'Collaborateur',
          stats,
          metricTiles: [
            { id: 'employee-tile-attendance', label: 'Taux presence', value: `${attendanceRate}%`, tone: attendanceRate >= 80 ? 'success' : 'warning' },
            { id: 'employee-tile-weekly-hours', label: 'Heures semaine', value: `${weeklyHours.toFixed(1)} h`, tone: 'info' },
            { id: 'employee-tile-leave', label: 'Solde conges', value: `${leaveDays.toFixed(1)} j`, tone: 'success' },
            { id: 'employee-tile-pending', label: 'Demandes attente', value: this.formatNumber(pendingRequests), tone: pendingRequests > 0 ? 'warning' : 'neutral' }
          ],
          charts,
          activities,
          notifications: notificationsOut,
          quickActions,
          segments,
          people,
          warnings: widgetWarnings
        } as DashboardPayload;
      }),
      catchError(() => throwError(() => new Error('Impossible de charger le tableau de bord collaborateur.')))
    );
  }
  private normalizeNotifications(source: unknown): DashboardNotification[] {
    const list = this.ensureArray<any>(this.unwrap(source));
    if (list.length === 0) {
      return [];
    }

    return list.slice(0, 10).map((item, index) => ({
      id: String(item?.id ?? `notif-${index}`),
      title: String(item?.titre ?? item?.title ?? 'Notification'),
      message: String(item?.message ?? 'Mise a jour de votre activite.'),
      timestamp: this.formatRelativeDate(item?.dateCreation ?? item?.date ?? item?.createdAt),
      unread: !Boolean(item?.lu),
      tone: this.notificationTone(item?.niveau ?? item?.type ?? item?.priority)
    }));
  }

  private buildAdminAlerts(
    attendanceRate: number | null,
    pendingRequests: number | null,
    absentToday: number | null,
    lateToday: number | null
  ): DashboardNotification[] {
    const alerts: DashboardNotification[] = [];

    if ((pendingRequests ?? 0) > 0) {
      alerts.push({
        id: 'alert-pending',
        title: 'Demandes en attente',
        message: `${pendingRequests ?? 0} demandes attendent un traitement RH.`,
        timestamp: 'Maintenant',
        tone: 'warning',
        unread: true
      });
    }

    if (attendanceRate !== null && attendanceRate < 75) {
      alerts.push({
        id: 'alert-attendance',
        title: 'Taux de presence faible',
        message: `Le taux de presence est actuellement de ${attendanceRate}%.`,
        timestamp: 'Maintenant',
        tone: 'danger',
        unread: true
      });
    }

    if ((absentToday ?? 0) > 0 || (lateToday ?? 0) > 0) {
      alerts.push({
        id: 'alert-presence',
        title: 'Signal presence',
        message: `${absentToday ?? 0} absent(s) et ${lateToday ?? 0} retard(s) detectes aujourd hui.`,
        timestamp: 'Maintenant',
        tone: (absentToday ?? 0) > 0 ? 'danger' : 'warning',
        unread: true
      });
    }

    return alerts;
  }

  private ensureChartData(chart: DashboardChartSeries): DashboardChartSeries {
    return chart;
  }

  private optionalRequest<T>(source$: Observable<T>, fallback: T, widget: string, message: string): Observable<RequestResult<T>> {
    return source$.pipe(
      map(data => ({ data, warning: null })),
      catchError(() => of({
        data: fallback,
        warning: {
          id: `warning-${widget}`,
          widget,
          message,
          tone: 'warning'
        } as DashboardWidgetWarning
      }))
    );
  }

  private getAdminGlobalAnalytics(): Observable<Record<string, unknown>> {
    return this.http
      .get<ApiEnvelope<Record<string, unknown>> | Record<string, unknown>>(this.api.PRESENCE.GET_GLOBAL_ANALYTICS, {
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.unwrap(response) ?? {}));
  }

  private loadRequestsForAdminDashboard(page = 0, pageSize = 100): Observable<Paged<any>> {
    const safeSize = Math.min(Math.max(pageSize, 1), 100);
    const params = new HttpParams()
      .set('page', String(Math.max(page, 0)))
      .set('size', String(safeSize));

    return this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(this.api.RH.GET_ADMIN_DEMANDS, {
        params,
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.normalizePageResponse<any>(response, page, safeSize)));
  }

  private loadUsersForAdminDashboard(pageSize = 100): Observable<Paged<DashboardUserLike>> {
    const safeSize = Math.min(Math.max(pageSize, 1), 100);
    return this.fetchAdminUsersPage(0, safeSize).pipe(
      switchMap(firstPage => {
        const totalPages = Math.max(this.toNumber(firstPage.totalPages ?? 1), 1);
        if (totalPages <= 1) {
          return of(firstPage);
        }

        const remainingCalls = Array.from({ length: totalPages - 1 }, (_, index) =>
          this.fetchAdminUsersPage(index + 1, safeSize)
        );

        return forkJoin(remainingCalls).pipe(
          map(remainingPages => this.mergePages(firstPage, remainingPages))
        );
      })
    );
  }

  private fetchAdminUsersPage(page: number, size: number): Observable<Paged<DashboardUserLike>> {
    const params = new HttpParams()
      .set('page', String(Math.max(page, 0)))
      .set('size', String(Math.min(Math.max(size, 1), 100)));

    return this.http
      .get<ApiEnvelope<Paged<DashboardUserLike>> | Paged<DashboardUserLike> | DashboardUserLike[]>(this.api.ORGANISATION.GET_ADMIN_USERS, {
        params,
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.normalizePageResponse<DashboardUserLike>(response, page, size)));
  }

  private loadEntreprisesForAdminDashboard(pageSize = 100): Observable<Paged<any>> {
    const safeSize = Math.min(Math.max(pageSize, 1), 100);
    return this.fetchAdminEntreprisesPage(0, safeSize).pipe(
      switchMap(firstPage => {
        const totalPages = Math.max(this.toNumber(firstPage.totalPages ?? 1), 1);
        if (totalPages <= 1) {
          return of(firstPage);
        }

        const remainingCalls = Array.from({ length: totalPages - 1 }, (_, index) =>
          this.fetchAdminEntreprisesPage(index + 1, safeSize)
        );

        return forkJoin(remainingCalls).pipe(
          map(remainingPages => this.mergePages(firstPage, remainingPages))
        );
      })
    );
  }

  private fetchAdminEntreprisesPage(page: number, size: number): Observable<Paged<any>> {
    const params = new HttpParams()
      .set('page', String(Math.max(page, 0)))
      .set('size', String(Math.min(Math.max(size, 1), 100)));

    return this.http
      .get<ApiEnvelope<Paged<any>> | Paged<any> | any[]>(this.api.ORGANISATION.GET_ENTREPRISES, {
        params,
        context: this.optionalRequestContext
      })
      .pipe(map(response => this.normalizePageResponse<any>(response, page, size)));
  }

  private normalizePageResponse<T>(source: unknown, requestedPage: number, requestedSize: number): Paged<T> {
    const direct = source as {
      content?: unknown;
      items?: unknown;
      results?: unknown;
      records?: unknown;
      data?: unknown;
      payload?: unknown;
      result?: unknown;
      totalElements?: unknown;
      totalPages?: unknown;
      number?: unknown;
      size?: unknown;
      total?: unknown;
      count?: unknown;
      pages?: unknown;
      page?: unknown;
      pageSize?: unknown;
    } | null;
    if (Array.isArray(source)) {
      return {
        content: source as T[],
        totalElements: source.length,
        totalPages: source.length > 0 ? 1 : 0,
        number: requestedPage,
        size: requestedSize
      };
    }

    const nestedData = direct && typeof direct === 'object'
      ? direct.data ?? direct.payload ?? direct.result ?? null
      : null;

    if (Array.isArray(nestedData)) {
      return {
        content: nestedData as T[],
        totalElements: nestedData.length,
        totalPages: nestedData.length > 0 ? 1 : 0,
        number: requestedPage,
        size: requestedSize
      };
    }

    const candidate = (nestedData && typeof nestedData === 'object')
      ? nestedData as {
        content?: unknown;
        items?: unknown;
        results?: unknown;
        records?: unknown;
        data?: unknown;
        totalElements?: unknown;
        totalPages?: unknown;
        number?: unknown;
        size?: unknown;
        total?: unknown;
        count?: unknown;
        pages?: unknown;
        page?: unknown;
        pageSize?: unknown;
      }
      : direct;

    const content = this.extractPageContent<T>(candidate);
    const totalElements = this.toNumber(candidate?.totalElements ?? candidate?.total ?? candidate?.count ?? content.length);
    const size = Math.max(this.toNumber(candidate?.size ?? candidate?.pageSize ?? requestedSize), 1);
    const totalPages = this.toNumber(candidate?.totalPages ?? candidate?.pages ?? (totalElements > 0 ? Math.ceil(totalElements / size) : 0));
    const pageNumber = this.toNumber(candidate?.number ?? candidate?.page ?? requestedPage);

    return {
      content,
      totalElements,
      totalPages,
      number: pageNumber,
      size
    };
  }

  private extractPageContent<T>(source: {
    content?: unknown;
    items?: unknown;
    results?: unknown;
    records?: unknown;
    data?: unknown;
  } | null): T[] {
    if (!source || typeof source !== 'object') {
      return [];
    }

    if (Array.isArray(source.content)) {
      return source.content as T[];
    }
    if (Array.isArray(source.items)) {
      return source.items as T[];
    }
    if (Array.isArray(source.results)) {
      return source.results as T[];
    }
    if (Array.isArray(source.records)) {
      return source.records as T[];
    }
    if (Array.isArray(source.data)) {
      return source.data as T[];
    }

    const nested = source.data as { content?: unknown; items?: unknown; results?: unknown; records?: unknown } | undefined;
    if (!nested || typeof nested !== 'object') {
      return [];
    }

    if (Array.isArray(nested.content)) {
      return nested.content as T[];
    }
    if (Array.isArray(nested.items)) {
      return nested.items as T[];
    }
    if (Array.isArray(nested.results)) {
      return nested.results as T[];
    }
    if (Array.isArray(nested.records)) {
      return nested.records as T[];
    }

    return [];
  }

  private mergePages<T>(firstPage: Paged<T>, remainingPages: Paged<T>[]): Paged<T> {
    const mergedContent = [firstPage, ...remainingPages].flatMap(page => this.ensureArray<T>(page?.content));
    return {
      content: mergedContent,
      totalElements: this.toNumber(firstPage.totalElements ?? mergedContent.length),
      totalPages: this.toNumber(firstPage.totalPages ?? 1),
      number: this.toNumber(firstPage.number ?? 0),
      size: this.toNumber(firstPage.size ?? mergedContent.length)
    };
  }

  private emptyPage<T>(page = 0, size = 100): Paged<T> {
    return {
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: page,
      size
    };
  }

  private countPendingRequests(requests: any[]): number {
    return requests.filter(request => this.isPendingRequestStatus(request?.statut)).length;
  }

  private isPendingRequestStatus(value: unknown): boolean {
    const status = String(value ?? '').toUpperCase();
    return status.includes('ATTENTE') || status.includes('PENDING');
  }

  private monthlyRequestDistribution(requests: any[]): Record<number, number> {
    const byMonth: Record<number, number> = {};
    for (const request of requests) {
      const date = parseApiDate(request?.dateCreation ?? request?.createdAt);
      if (!date) {
        continue;
      }
      const month = date.getMonth() + 1;
      byMonth[month] = (byMonth[month] ?? 0) + 1;
    }
    return byMonth;
  }

  private isActiveUser(status: unknown): boolean {
    const normalized = String(status ?? '').toUpperCase();
    return normalized === 'ACTIF' || normalized === 'ACTIVE';
  }

  private hasManagerRole(user: DashboardUserLike): boolean {
    return this.hasRole(user, ['MANAGER']);
  }

  private hasRhRole(user: DashboardUserLike): boolean {
    return this.hasRole(user, ['RH']);
  }

  private hasAdminRole(user: DashboardUserLike): boolean {
    return this.hasRole(user, ['ADMIN']);
  }

  private hasEmployeeRole(user: DashboardUserLike): boolean {
    return this.hasRole(user, ['EMPLOYEE', 'EMPLOYE', 'COLLAB']);
  }

  private hasRole(user: DashboardUserLike, expectedTokens: string[]): boolean {
    const explicitRole = String(user?.role ?? '').toUpperCase().replace(/^ROLE_/, '');
    if (expectedTokens.some(token => explicitRole.includes(token))) {
      return true;
    }

    const roles = this.ensureArray<UserRoleLike | string>(user?.roles);
    return roles.some(role => {
      const value = typeof role === 'string'
        ? role
        : role?.nom ?? role?.name ?? role?.role ?? role?.authority ?? '';
      const normalized = String(value).toUpperCase();
      return expectedTokens.some(token => normalized.includes(token));
    });
  }

  private normalizeMonthSeries(source: Record<string | number, number>): { labels: string[]; values: number[] } {
    const entries = Object.entries(source ?? {})
      .map(([month, value]) => ({ month: Number(month), value: this.toNumber(value) }))
      .filter(item => Number.isFinite(item.month) && item.month > 0)
      .sort((left, right) => left.month - right.month);

    if (entries.length === 0) {
      return {
        labels: [],
        values: []
      };
    }

    return {
      labels: entries.map(item => this.monthLabel(item.month)),
      values: entries.map(item => item.value)
    };
  }

  private buildPresenceHistory(members: any[]): { labels: string[]; values: number[] } {
    const statuses = members.map(member => String(member?.presence?.status ?? 'ABSENT'));
    const grouped = this.countBy(statuses, value => value);
    const labels = Object.keys(grouped);
    const values = Object.values(grouped);

    if (labels.length === 0) {
      return { labels: [], values: [] };
    }

    return {
      labels,
      values
    };
  }

  private normalizeRecordNumbers(source: Record<string, unknown>): Record<string, number> {
    const entries = Object.entries(source ?? {})
      .map(([key, value]) => [this.labelizeKey(key), this.toNumber(value)] as const)
      .filter(([, value]) => value >= 0);

    if (entries.length === 0) {
      return {};
    }

    return Object.fromEntries(entries);
  }

  private countBy<T>(source: T[], accessor: (item: T) => string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of source) {
      const key = this.labelizeKey(accessor(item) || 'Autre');
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }

  private computeAttendanceRate(present: number, absent: number, late: number): number {
    const total = present + absent + late;
    if (total <= 0) {
      return 0;
    }
    return Math.round(((present + late) / total) * 100);
  }

  private requestOwnerLabel(request: any): string {
    const user = request?.utilisateur;
    return this.personLabel(user?.prenom, user?.nom, user?.email);
  }

  private requestTypeLabel(type: unknown): string {
    const normalized = String(type ?? 'DEMANDE').toUpperCase();
    switch (normalized) {
      case 'CONGE':
        return 'Demande de conge';
      case 'ABSENCE':
        return 'Demande absence';
      case 'TELETRAVAIL':
        return 'Demande teletravail';
      case 'AUTORISATION':
        return 'Demande autorisation';
      case 'DOCUMENT':
        return 'Demande document';
      default:
        return 'Demande';
    }
  }

  private requestStatusLabel(status: unknown): string {
    const normalized = String(status ?? '').toUpperCase();
    switch (normalized) {
      case 'EN_ATTENTE_MANAGER':
      case 'EN_ATTENTE':
      case 'PENDING':
        return 'en attente manager';
      case 'EN_ATTENTE_RH':
        return 'en attente RH';
      case 'APPROUVEE':
      case 'APPROUVE':
      case 'APPROVED':
      case 'VALIDEE':
        return 'approuvee';
      case 'REFUSEE':
      case 'REFUSE':
      case 'REJECTED':
      case 'REJETEE':
        return 'refusee';
      default:
        return 'mise a jour';
    }
  }

  private requestTone(status: unknown): UiTone {
    const normalized = String(status ?? '').toUpperCase();
    if (normalized.includes('REFUS') || normalized.includes('REJET')) {
      return 'danger';
    }
    if (normalized.includes('APPROUV') || normalized.includes('VALID')) {
      return 'success';
    }
    if (normalized.includes('ATTENTE') || normalized.includes('PENDING')) {
      return 'warning';
    }
    return 'info';
  }

  private notificationTone(value: unknown): UiTone {
    const normalized = String(value ?? '').toUpperCase();
    if (normalized.includes('ERROR') || normalized.includes('DANGER')) {
      return 'danger';
    }
    if (normalized.includes('WARN') || normalized.includes('ALERT')) {
      return 'warning';
    }
    if (normalized.includes('SUCCESS')) {
      return 'success';
    }
    return 'info';
  }

  private userStatusLabel(status: unknown): string {
    const normalized = String(status ?? '').toUpperCase();
    switch (normalized) {
      case 'ACTIF':
      case 'ACTIVE':
        return 'Actif';
      case 'INACTIF':
      case 'INACTIVE':
        return 'Inactif';
      case 'SUSPENDU':
        return 'Suspendu';
      default:
        return normalized ? this.labelizeKey(normalized) : 'Inconnu';
    }
  }

  private userStatusTone(status: unknown): UiTone {
    const normalized = String(status ?? '').toUpperCase();
    if (normalized.includes('ACTIF') || normalized.includes('ACTIVE')) {
      return 'success';
    }
    if (normalized.includes('SUSPEND')) {
      return 'danger';
    }
    return 'neutral';
  }

  private resolveEmployeeAttendanceState(summary: any): 'NOT_STARTED' | 'ACTIVE' | 'CLOSED' {
    const state = normalizeAttendanceSnapshot(summary).state;
    if (state === 'ACTIVE' || state === 'CLOSED') {
      return state;
    }
    return 'NOT_STARTED';
  }

  private employeeAttendanceStateLabel(state: 'NOT_STARTED' | 'ACTIVE' | 'CLOSED' | 'ERROR'): string {
    switch (state) {
      case 'ACTIVE':
        return 'Session démarrée';
      case 'CLOSED':
        return 'Journée clôturée';
      case 'ERROR':
        return 'Erreur';
      default:
        return "Non pointé";
    }
  }

  private employeeAttendanceStateDetail(state: 'NOT_STARTED' | 'ACTIVE' | 'CLOSED' | 'ERROR'): string {
    switch (state) {
      case 'ACTIVE':
        return 'Pointer ma sortie disponible';
      case 'CLOSED':
        return 'Pointage du jour finalisé';
      case 'ERROR':
        return 'Synchronisation requise';
      default:
        return 'Aucun pointage aujourd’hui';
    }
  }

  private employeeAttendanceStateTone(state: 'NOT_STARTED' | 'ACTIVE' | 'CLOSED' | 'ERROR'): UiTone {
    switch (state) {
      case 'ACTIVE':
        return 'success';
      case 'CLOSED':
        return 'info';
      case 'ERROR':
        return 'danger';
      default:
        return 'neutral';
    }
  }

  private formatSessionDuration(durationSeconds: unknown): string {
    const total = Math.max(0, Math.floor(this.toNumber(durationSeconds)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}`;
  }

  private employeeStatusLabel(status: unknown): string {
    const normalized = String(status ?? '').toUpperCase();
    switch (normalized) {
      case 'PRESENT':
        return 'Present';
      case 'LATE':
        return 'Retard';
      case 'REMOTE':
        return 'Teletravail';
      case 'ON_LEAVE':
        return 'En conge';
      case 'ABSENT':
        return 'Absent';
      case 'WORKING':
        return 'Session active';
      case 'IDLE':
        return 'Journee terminee';
      default:
        return normalized ? this.labelizeKey(normalized) : 'Hors poste';
    }
  }

  private employeeStatusTone(status: unknown): UiTone {
    const normalized = String(status ?? '').toUpperCase();
    switch (normalized) {
      case 'PRESENT':
      case 'WORKING':
      case 'IDLE':
        return 'success';
      case 'LATE':
        return 'warning';
      case 'ABSENT':
        return 'danger';
      case 'REMOTE':
      case 'ON_LEAVE':
        return 'info';
      default:
        return 'neutral';
    }
  }

  private isActiveCompany(company: any): boolean {
    const activeFromStatus = String(company?.status ?? company?.statut ?? '').toUpperCase();
    if (activeFromStatus.includes('ACTIVE')) {
      return true;
    }
    if (activeFromStatus.includes('CLOSED') || activeFromStatus.includes('INACTIVE')) {
      return false;
    }
    return Boolean(company?.estActive ?? company?.isActive ?? company?.active ?? false);
  }

  private personLabel(prenom: unknown, nom: unknown, email: unknown): string {
    const first = String(prenom ?? '').trim();
    const last = String(nom ?? '').trim();
    const full = `${first} ${last}`.trim();
    if (full.length > 0) {
      return full;
    }
    const emailValue = String(email ?? '').trim();
    if (emailValue.length > 0) {
      return emailValue;
    }
    return 'Collaborateur';
  }

  private labelizeKey(value: string): string {
    return value
      .replace(/_/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  private formatRelativeDate(value: unknown): string {
    if (!value) {
      return 'Maintenant';
    }

    const ms = this.toDateMs(value);
    if (!Number.isFinite(ms)) {
      return String(value);
    }

    const minutes = Math.floor((Date.now() - ms) / 60000);
    if (minutes < 1) {
      return 'A l instant';
    }
    if (minutes < 60) {
      return `Il y a ${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `Il y a ${hours} h`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
      return `Il y a ${days} j`;
    }

    return new Date(ms).toLocaleDateString('fr-FR');
  }

  private formatTime(value: unknown): string {
    return formatLocalTime(value);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('fr-FR').format(value);
  }

  private monthLabel(month: number): string {
    const date = new Date(2026, Math.max(month - 1, 0), 1);
    return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(date);
  }

  private toDateMs(value: unknown): number {
    const date = parseApiDate(value);
    return date ? date.getTime() : Number.NaN;
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }

  private ensureArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value as T[];
    }

    if (value && typeof value === 'object') {
      const payload = value as { content?: unknown; data?: unknown };
      if (Array.isArray(payload.content)) {
        return payload.content as T[];
      }
      if (Array.isArray(payload.data)) {
        return payload.data as T[];
      }
      if (payload.data && typeof payload.data === 'object' && Array.isArray((payload.data as { content?: unknown }).content)) {
        return (payload.data as { content?: T[] }).content ?? [];
      }
    }

    return [];
  }
}

