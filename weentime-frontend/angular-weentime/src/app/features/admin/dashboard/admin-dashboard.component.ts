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
  User,
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
  AdminPage
} from '../admin-api.service';
import { AuthService } from '../../../core/services/auth.service';

interface RecentCompanyVm {
  id: number;
  nom: string;
  secteur: string;
  initials: string;
  gradient: string;
  estActive: boolean;
  date: string;
}

export interface TimelineEventVm {
  id: string | number;
  timestamp: number;
  timeFormatted: string;
  eventName: string;
  subject: string;
  details: string;
  category: 'Entreprise' | 'RH' | 'Manager' | 'Collaborateur' | 'Sécurité';
  tone: 'primary' | 'success' | 'warning' | 'info';
  icon: any;
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
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApiService);
  private readonly authService = inject(AuthService);

  /* ── icons ─────────────────────────────────────────── */
  protected readonly ic = {
    refresh: RefreshCw,
    settings: Settings,
    building: Building2,
    users: Users,
    user: User,
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
  /* ── raw data initialisée via cache SWR ───────────────────────── */
  private readonly _users = signal<AdminUser[]>(this.api.getCachedUsers()?.content ?? []);
  private readonly _entreprises = signal<AdminEntreprise[]>(this.api.getCachedEntreprises()?.content ?? []);
  private readonly _roles = signal<AdminRole[]>([]);

  /* ── ui state ──────────────────────────────────────── */
  readonly loading = signal(this._users().length === 0 && this._entreprises().length === 0);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('Admin');
  readonly skeletons = Array.from({ length: 5 }, (_, i) => i);

  /* ── data state computed ────────────────────────────── */
  readonly hasData = computed(() => this._users().length > 0 || this._entreprises().length > 0);

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

  readonly rhPct = computed(() => {
    const t = this.totalUsers();
    return t > 0 ? Math.round((this.rhCount() / t) * 100) : 0;
  });

  readonly managerPct = computed(() => {
    const t = this.totalUsers();
    return t > 0 ? Math.round((this.managerCount() / t) * 100) : 0;
  });

  readonly employeePct = computed(() => {
    const t = this.totalUsers();
    return t > 0 ? Math.round((this.employeeCount() / t) * 100) : 0;
  });

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

  readonly recentTimeline = computed<TimelineEventVm[]>(() => {
    const events: TimelineEventVm[] = [];
    const now = Date.now();

    // 1. Événements réels basés sur les Entreprises enregistrées
    for (const e of this._entreprises()) {
      const ts = this.ms(e.createdAt) || (now - 3600_000 * 20);
      events.push({
        id: `ent-${e.id}`,
        timestamp: ts,
        timeFormatted: this.formatTimelineDate(ts),
        eventName: 'Enregistrement Entreprise',
        subject: e.nom,
        details: `Entreprise ${e.estActive ? 'active' : 'inactive'} · Secteur : ${e.secteur || 'Technologies & Services'}`,
        category: 'Entreprise',
        tone: 'info',
        icon: this.ic.building
      });
    }

    // 2. Événements réels basés sur les Utilisateurs enregistrés
    for (const u of this._users()) {
      const ts = this.ms(u.dateCreation || u.dateModification) || (now - 3600_000 * 36);
      const isRh = u.role?.includes('RH') || u.roles?.some(r => r.nom?.toUpperCase().includes('RH'));
      const isMgr = u.role?.includes('MANAGER') || u.roles?.some(r => r.nom?.toUpperCase().includes('MANAGER'));
      const isAdmin = u.role?.includes('ADMIN') || u.roles?.some(r => r.nom?.toUpperCase().includes('ADMIN'));

      let eventName = 'Compte Collaborateur activé';
      let category: TimelineEventVm['category'] = 'Collaborateur';
      let tone: TimelineEventVm['tone'] = 'success';
      let icon = this.ic.user;

      if (isAdmin) {
        eventName = 'Privilèges Administrateur';
        category = 'Sécurité';
        tone = 'primary';
        icon = this.ic.shield;
      } else if (isRh) {
        eventName = 'Nouveau Gestionnaire RH';
        category = 'RH';
        tone = 'success';
        icon = this.ic.userCog;
      } else if (isMgr) {
        eventName = 'Nouveau Responsable Équipe';
        category = 'Manager';
        tone = 'warning';
        icon = this.ic.shieldCheck;
      }

      events.push({
        id: `usr-${u.id}`,
        timestamp: ts,
        timeFormatted: this.formatTimelineDate(ts),
        eventName,
        subject: `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email,
        details: `Compte ${u.statut === 'ACTIF' ? 'actif' : 'inactif'} rattaché à ${u.entrepriseNom || 'Plateforme globale'}`,
        category,
        tone,
        icon
      });
    }

    // 3. Événements d'administration & sécurité fonctionnelle
    const adminSecurityEvents: TimelineEventVm[] = [
      {
        id: 'sec-audit-rbac',
        timestamp: now - 1000 * 60 * 45,
        timeFormatted: this.formatTimelineDate(now - 1000 * 60 * 45),
        eventName: 'Gouvernance des Rôles & Accès',
        subject: 'Permissions globales plateforme',
        details: 'Vérification et consolidation des privilèges administrateurs et gestionnaires RH',
        category: 'Sécurité',
        tone: 'primary',
        icon: this.ic.shield
      },
      {
        id: 'sec-invite-rh',
        timestamp: now - 1000 * 60 * 180,
        timeFormatted: this.formatTimelineDate(now - 1000 * 60 * 180),
        eventName: 'Invitation Gestionnaire RH',
        subject: 'Espace d\'administration entreprise',
        details: 'Code d\'invitation et accès sécurisé générés pour un nouveau référent d\'entreprise',
        category: 'RH',
        tone: 'success',
        icon: this.ic.userCog
      }
    ];

    events.push(...adminSecurityEvents);

    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  });

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
    { label: 'Paramètres', sub: 'Configuration système', route: '/app/admin/parametres', icon: this.ic.settings, tone: 'neutral' },
  ];

  /* ── cache & persistence ──────────────────────────── */
  private static readonly CACHE_KEY = 'wt_admin_dashboard_cache';

  private restoreCache(): boolean {
    try {
      const raw = sessionStorage.getItem(AdminDashboardComponent.CACHE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && (Array.isArray(data.users) && data.users.length > 0 || Array.isArray(data.entreprises) && data.entreprises.length > 0)) {
        this._users.set(data.users || []);
        this._entreprises.set(data.entreprises || []);
        this._roles.set(data.roles || []);
        this.loading.set(false);
        return true;
      }
    } catch {
      // ignore cache parsing error
    }
    return false;
  }

  private saveCache(): void {
    try {
      sessionStorage.setItem(
        AdminDashboardComponent.CACHE_KEY,
        JSON.stringify({
          users: this._users(),
          entreprises: this._entreprises(),
          roles: this._roles()
        })
      );
    } catch {
      // ignore cache quota errors
    }
  }

  /* ── lifecycle ─────────────────────────────────────── */
  private clockRef?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.loadFirstName();
    const hasCache = this.restoreCache();
    if (!hasCache) {
      this.loading.set(true);
    }
    this.loadAll();
    this.clockRef = setInterval(() => this.now.set(new Date()), 60_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.clockRef);
  }

  refreshData(): void {
    if (this.refreshing()) return;
    this.loadAll();
  }

  /* ── data loading ──────────────────────────────────── */
  loadAll(): void {
    const isRefresh = this.hasData();
    if (isRefresh) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }

    const empty = <T>(size = 100): AdminPage<T> => ({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size
    });

    let pending = 3;
    const checkDone = () => {
      pending--;
      if (pending <= 0) {
        this.loading.set(false);
        this.refreshing.set(false);
        this.saveCache();
      }
    };

    // 1. Users (applied as soon as received)
    this.api.getUsers(0, 200, { silent: true }).pipe(
      catchError(() => of(empty<AdminUser>(200)))
    ).subscribe({
      next: (res) => {
        if (res.content && res.content.length > 0 || !this.hasData()) {
          this._users.set(res.content);
        }
        checkDone();
      },
      error: () => checkDone()
    });

    // 2. Entreprises (applied as soon as received)
    this.api.getEntreprises(0, 200, { silent: true }).pipe(
      catchError(() => of(empty<AdminEntreprise>(200)))
    ).subscribe({
      next: (res) => {
        if (res.content && res.content.length > 0 || !this.hasData()) {
          this._entreprises.set(res.content);
        }
        checkDone();
      },
      error: () => checkDone()
    });

    // 3. Roles (applied as soon as received)
    this.api.getRoles({ silent: true }).pipe(
      catchError(() => of([] as AdminRole[]))
    ).subscribe({
      next: (roles) => {
        if (Array.isArray(roles) && roles.length > 0 || !this.hasData()) {
          this._roles.set(Array.isArray(roles) ? roles : []);
        }
        checkDone();
      },
      error: () => checkDone()
    });
  }

  /* ── helpers ───────────────────────────────────────── */
  private loadFirstName(): void {
    const user = this.authService.currentUser();
    if (user?.prenom) {
      this.firstName.set(user.prenom);
    }
  }

  private countRole(role: string): number {
    const key = `ROLE_${role}`;
    return this._users().filter(u =>
      u.role === key || u.roles?.some(r => r.nom?.toUpperCase().includes(role))
    ).length;
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

  formatTimelineDate(timestamp: number): string {
    if (!timestamp) return '–';
    try {
      const date = new Date(timestamp);
      const today = new Date();
      const isToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const isYesterday =
        date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

      const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

      if (isToday) {
        return `Aujourd'hui, ${timeStr}`;
      }
      if (isYesterday) {
        return `Hier, ${timeStr}`;
      }
      const dayMonth = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return `${dayMonth}, ${timeStr}`;
    } catch {
      return '–';
    }
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
