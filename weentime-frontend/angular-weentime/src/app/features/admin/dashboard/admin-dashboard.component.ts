import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, catchError, of } from 'rxjs';
import {
  LucideAngularModule,
  RefreshCw,
  Settings,
  Building2,
  Users,
  UserCog,
  Shield,
  ShieldCheck,
  Activity,
  ArrowRight,
  ChevronRight,
  Clock,
  TrendingUp,
  Inbox,
  BarChart3,
  CircleDot,
  Calendar // <-- Imported Calendar
} from 'lucide-angular';
import {
  AdminApiService,
  AdminUser,
  AdminEntreprise,
  AdminRole,
  AdminRequest,
  AdminPage
} from '../admin-api.service';
import {
  AnomalyRecord,
  MlAnomalyService,
} from '../../../core/services/ml-anomaly.service';
import { AiAnomalyFeedComponent } from '../../../shared/dashboard/ai-anomaly-feed/ai-anomaly-feed.component';

interface RecentCompanyVm {
  id: number;
  nom: string;
  secteur: string;
  initials: string;
  gradient: string;
  estActive: boolean;
  date: string;
}

interface RecentActivityVm {
  id: number;
  owner: string;
  type: string;
  status: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
  date: string;
}

interface RoleSlice {
  label: string;
  count: number;
  pct: number;
  color: string;
}

interface HealthItem {
  label: string;
  icon: any;
  ok: boolean;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LucideAngularModule,
    AiAnomalyFeedComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApiService);
  private readonly mlAnomaly = inject(MlAnomalyService);

  /** Global SOC anomaly feed for the admin role. */
  readonly globalAnomalies = signal<AnomalyRecord[]>([]);
  readonly globalLoading = signal(true);
  readonly globalError = signal(false);
  readonly globalDemo = signal(false);
  readonly globalBackendUnavailable = signal(false);
  readonly globalStats = computed(() => {
    const list = this.globalAnomalies();
    return {
      total: list.length,
      critical: list.filter(a => a.risk === 'CRITICAL').length,
      high: list.filter(a => a.risk === 'HIGH').length,
      medium: list.filter(a => a.risk === 'MEDIUM').length,
    };
  });

  /* ── icons ─────────────────────────────────────────── */
  protected readonly ic = {
    refresh: RefreshCw,
    settings: Settings,
    building: Building2,
    users: Users,
    userCog: UserCog,
    shield: Shield,
    shieldCheck: ShieldCheck,
    activity: Activity,
    arrowRight: ArrowRight,
    chevron: ChevronRight,
    clock: Clock,
    trending: TrendingUp,
    inbox: Inbox,
    chart: BarChart3,
    dot: CircleDot,
    calendar: Calendar // <-- Added Calendar icon to ic map object
  };

  /* ── ui state ──────────────────────────────────────── */
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('Admin');
  readonly skeletons = Array.from({ length: 6 }, (_, i) => i);

  /* ── raw data ──────────────────────────────────────── */
  private readonly _users = signal<AdminUser[]>([]);
  private readonly _entreprises = signal<AdminEntreprise[]>([]);
  private readonly _roles = signal<AdminRole[]>([]);
  private readonly _requests = signal<AdminRequest[]>([]);

  /* ── kpi computed ──────────────────────────────────── */
  readonly totalUsers = computed(() => this._users().length);
  readonly activeUsers = computed(() => this._users().filter(u => u.statut === 'ACTIF').length);
  readonly inactiveUsers = computed(() => this.totalUsers() - this.activeUsers());
  readonly totalEntreprises = computed(() => this._entreprises().length);
  readonly activeEntreprises = computed(() => this._entreprises().filter(e => e.estActive).length);
  readonly inactiveEntreprises = computed(() => this.totalEntreprises() - this.activeEntreprises());
  readonly totalRoles = computed(() => this._roles().length);
  readonly rhCount = computed(() => this.countRole('RH'));
  readonly managerCount = computed(() => this.countRole('MANAGER'));
  readonly employeeCount = computed(() => this.countRole('EMPLOYEE'));
  readonly adminCount = computed(() => this.countRole('ADMIN'));
  readonly pendingCount = computed(() => this._requests().filter(r => this.isPending(r.statut)).length);
  readonly approvedCount = computed(() => this._requests().filter(r => ['APPROUVEE', 'VALIDEE'].includes(r.statut)).length);
  readonly rejectedCount = computed(() => this._requests().filter(r => ['REFUSEE', 'REJETEE'].includes(r.statut)).length);

  /* ── display computed ──────────────────────────────── */
  readonly greeting = computed(() => {
    const h = this.now().getHours();
    return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  });

  readonly todayLabel = computed(() =>
    this.now().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );

  readonly timeLabel = computed(() =>
    this.now().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );

  readonly activityRate = computed(() => {
    const t = this.totalUsers();
    return t > 0 ? Math.round((this.activeUsers() / t) * 100) : 0;
  });

  readonly enterpriseHealth = computed(() => {
    const t = this.totalEntreprises();
    return t > 0 ? Math.round((this.activeEntreprises() / t) * 100) : 0;
  });

  readonly roleSlices = computed<RoleSlice[]>(() => {
    const t = this.totalUsers();
    if (t === 0) return [];
    return [
      { label: 'Admin', count: this.adminCount(), pct: Math.round((this.adminCount() / t) * 100), color: '#ef4444' },
      { label: 'RH', count: this.rhCount(), pct: Math.round((this.rhCount() / t) * 100), color: '#6366f1' },
      { label: 'Manager', count: this.managerCount(), pct: Math.round((this.managerCount() / t) * 100), color: '#10b981' },
      { label: 'Employé', count: this.employeeCount(), pct: Math.round((this.employeeCount() / t) * 100), color: '#f59e0b' },
    ].filter(s => s.count > 0);
  });

  readonly donutBg = computed(() => {
    const slices = this.roleSlices();
    if (!slices.length) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    let angle = 0;
    const segs = slices.map(s => {
      const span = (s.pct / 100) * 360;
      const seg = `${s.color} ${angle}deg ${angle + span}deg`;
      angle += span;
      return seg;
    });
    if (angle < 360) segs.push(`#e2e8f0 ${angle}deg 360deg`);
    return `conic-gradient(${segs.join(', ')})`;
  });

  readonly recentCompanies = computed<RecentCompanyVm[]>(() =>
    [...this._entreprises()]
      .sort((a, b) => this.ms(b.createdAt) - this.ms(a.createdAt))
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        nom: e.nom,
        secteur: e.secteur || 'Non défini',
        initials: this.initials(e.nom),
        gradient: this.gradient(e.nom),
        estActive: e.estActive,
        date: this.relDate(e.createdAt)
      }))
  );

  readonly recentActivity = computed<RecentActivityVm[]>(() =>
    [...this._requests()]
      .sort((a, b) => this.ms(b.dateCreation ?? b.createdAt) - this.ms(a.dateCreation ?? a.createdAt))
      .slice(0, 8)
      .map(r => ({
        id: r.id,
        owner: this.ownerLabel(r),
        type: this.typeLabel(r.typeDemande),
        status: this.statusLabel(r.statut),
        tone: this.statusTone(r.statut),
        date: this.relDate(r.dateCreation ?? r.createdAt)
      }))
  );

  readonly healthItems = computed<HealthItem[]>(() => [
    { label: 'API Gateway', icon: this.ic.activity, ok: true },
    { label: 'Base de données', icon: this.ic.activity, ok: true },
    { label: 'Notifications', icon: this.ic.activity, ok: true },
    { label: 'Réseau', icon: this.ic.activity, ok: true }
  ]);

  readonly quickLinks = [
    { label: 'Utilisateurs', sub: 'Gérer les comptes', route: '/app/admin/users', icon: this.ic.users, tone: 'primary' },
    { label: 'Entreprises', sub: 'Sociétés référencées', route: '/app/admin/entreprises', icon: this.ic.building, tone: 'info' },
    { label: 'Gestionnaires', sub: 'Responsables RH', route: '/app/admin/rh-owners', icon: this.ic.userCog, tone: 'success' },
    { label: 'Rôles', sub: 'Permissions & accès', route: '/app/admin/roles', icon: this.ic.shield, tone: 'warning' },
    { label: 'Présence', sub: 'Suivi global', route: '/app/admin/presence', icon: this.ic.clock, tone: 'info' },
    { label: 'Paramètres', sub: 'Configuration système', route: '/app/admin/parametres', icon: this.ic.settings, tone: 'neutral' },
  ];

  /* ── lifecycle ─────────────────────────────────────── */
  private clockRef?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.loadFirstName();
    this.loadAll();
    this.loadAnomalies();
    this.clockRef = setInterval(() => this.now.set(new Date()), 60_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.clockRef);
  }

  loadGlobalAnomalies(): void {
    this.globalLoading.set(true);
    this.globalError.set(false);
    this.globalDemo.set(false);
    this.mlAnomaly.getDashboardSummary().subscribe({
      next: (response) => {
        const list = (response.anomalies || [])
          .filter(a => !!a)
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 8);
        this.globalAnomalies.set(list);
        this.globalError.set(!response.success);
        this.globalDemo.set(Boolean(response.isDemo));
        this.globalBackendUnavailable.set(response.backendStatus === 'unavailable');
        this.globalLoading.set(false);
      },
      error: () => {
        this.globalError.set(true);
        this.globalLoading.set(false);
      },
    });
  }

  private loadAnomalies(): void {
    this.loadGlobalAnomalies();
  }

  /* ── data loading ──────────────────────────────────── */
  loadAll(): void {
    const isRefresh = !this.loading();
    if (isRefresh) this.refreshing.set(true);
    else this.loading.set(true);

    const empty = <T>(size = 100): AdminPage<T> => ({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size
    });

    forkJoin({
      users: this.api.getUsers(0, 200, undefined, undefined, undefined, undefined, undefined, { silent: true }).pipe(catchError(() => of(empty<AdminUser>(200)))),
      entreprises: this.api.getEntreprises(0, 200, { silent: true }).pipe(catchError(() => of(empty<AdminEntreprise>(200)))),
      roles: this.api.getRoles({ silent: true }).pipe(catchError(() => of([] as AdminRole[]))),
      requests: this.api.getRequests(0, 100, {}, { silent: true }).pipe(catchError(() => of(empty<AdminRequest>(100)))),
    }).subscribe({
      next: ({ users, entreprises, roles, requests }) => {
        this._users.set(users.content);
        this._entreprises.set(entreprises.content);
        this._roles.set(Array.isArray(roles) ? roles : []);
        this._requests.set(requests.content);
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.refreshing.set(false);
      }
    });
  }

  /* ── helpers ───────────────────────────────────────── */
  private loadFirstName(): void {
    try {
      const raw = localStorage.getItem('auth_user') ?? localStorage.getItem('user') ?? localStorage.getItem('currentUser');
      if (raw) {
        const u = JSON.parse(raw);
        this.firstName.set(u?.prenom ?? u?.firstName ?? u?.name?.split(' ')[0] ?? 'Admin');
      }
    } catch {
      /* ignore */
    }
  }

  private countRole(role: string): number {
    const key = `ROLE_${role}`;
    return this._users().filter(u =>
      u.role === key || u.roles?.some(r => r.nom?.toUpperCase().includes(role))
    ).length;
  }

  private isPending(s: string): boolean {
    return ['EN_ATTENTE', 'EN_ATTENTE_MANAGER', 'EN_ATTENTE_RH'].includes(s);
  }

  initials(name?: string | null): string {
    return (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() ?? '')
      .join('') || 'WT';
  }

  gradient(name: string): string {
    const g = [
      'linear-gradient(135deg,#667eea,#764ba2)',
      'linear-gradient(135deg,#f093fb,#f5576c)',
      'linear-gradient(135deg,#4facfe,#00f2fe)',
      'linear-gradient(135deg,#43e97b,#38f9d7)',
      'linear-gradient(135deg,#fa709a,#fee140)',
      'linear-gradient(135deg,#a18cd1,#fbc2eb)',
      'linear-gradient(135deg,#fccb90,#d57eeb)',
      'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
    ];
    const h = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return g[h % g.length];
  }

  progressBg(pct: number, color: string): string {
    const angle = (pct / 100) * 360;
    return `conic-gradient(${color} ${angle}deg, #e2e8f0 ${angle}deg)`;
  }

  private ownerLabel(r: AdminRequest): string {
    if (r.utilisateur?.fullName) return r.utilisateur.fullName;
    const p = `${r.utilisateur?.prenom ?? ''} ${r.utilisateur?.nom ?? ''}`.trim();
    return p || r.utilisateur?.email || 'Utilisateur';
  }

  private typeLabel(t: string): string {
    const m: Record<string, string> = {
      CONGE: 'Congé',
      TELETRAVAIL: 'Télétravail',
      AUTORISATION: 'Autorisation',
      DOCUMENT: 'Document'
    };
    return m[t?.toUpperCase()] ?? t ?? 'Autre';
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      EN_ATTENTE: 'En attente',
      EN_ATTENTE_MANAGER: 'Attente mgr',
      EN_ATTENTE_RH: 'Attente RH',
      APPROUVEE: 'Approuvée',
      VALIDEE: 'Validée',
      REFUSEE: 'Refusée',
      REJETEE: 'Rejetée'
    };
    return m[s] ?? s;
  }

  statusTone(s: string): 'success' | 'warning' | 'danger' | 'info' {
    if (['APPROUVEE', 'VALIDEE'].includes(s)) return 'success';
    if (['REFUSEE', 'REJETEE'].includes(s)) return 'danger';
    return 'warning';
  }

  private relDate(d: string | null | undefined): string {
    if (!d) return '–';
    try {
      const diff = Date.now() - new Date(d).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'À l\'instant';
      if (m < 60) return `il y a ${m} min`;
      const h = Math.floor(diff / 3600000);
      if (h < 24) return `il y a ${h}h`;
      const dd = Math.floor(diff / 86400000);
      if (dd < 7) return `il y a ${dd}j`;
      return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch {
      return '–';
    }
  }

  private ms(d: string | null | undefined): number {
    try {
      return d ? new Date(d).getTime() : 0;
    } catch {
      return 0;
    }
  }

  trackById(_: number, item: any): any {
    return item?.id ?? _;
  }
}
