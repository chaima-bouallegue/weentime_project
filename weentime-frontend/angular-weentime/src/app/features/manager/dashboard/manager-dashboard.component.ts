import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common'; // Removed DecimalPipe
import { RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import {
  LucideAngularModule,
  Users,
  UserCheck,
  UserX,
  Clock,
  ClipboardCheck,
  ChevronRight,
  Activity,
  Zap,
  TrendingUp,
  Bell,
  RefreshCw,
  Shield,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Home,
  ArrowUpRight,
  Sparkles,
  Target,
  BarChart3,
  Inbox,
  BadgeCheck,
  Star,
  Flame,
  Eye
} from 'lucide-angular';
import { ManagerDashboardService } from './manager-dashboard.service';
import {
  AnomalyRecord,
  MlAnomalyService,
} from '../../../core/services/ml-anomaly.service';
import { AnomalyAlertCardComponent } from '../../../shared/components/anomaly-alert-card/anomaly-alert-card.component';
import { AiEmptyStateComponent } from '../../../shared/components/ai-empty-state/ai-empty-state.component';
import { AiSkeletonCardComponent } from '../../../shared/components/ai-skeleton-card/ai-skeleton-card.component';
import {
  ManagerDashboardData,
  ManagerTeamMember,
  ManagerApprovalRequest
} from '../manager.models';

interface MergedMember {
  id: number;
  fullName: string;
  email: string;
  poste: string | null;
  equipeNom: string | null;
  avatarUrl: string | null;
  status: string;
  arrivalTime: string | null;
  isLate: boolean;
  durationSeconds: number;
}

interface DashAlert {
  title: string;
  description: string;
  tone: 'warning' | 'danger' | 'info' | 'success';
  icon: any;
}

@Component({
  selector: 'app-manager-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LucideAngularModule,
    AnomalyAlertCardComponent,
    AiEmptyStateComponent,
    AiSkeletonCardComponent,
  ],
  templateUrl: './manager-dashboard.component.html',
  styleUrl: './manager-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerDashboardComponent implements OnInit, OnDestroy {
  private readonly svc = inject(ManagerDashboardService);
  private readonly mlAnomaly = inject(MlAnomalyService);

  /* ── icons ──────────────────────────────────────────── */
  protected readonly ic = {
    users: Users,
    userCheck: UserCheck,
    userX: UserX,
    clock: Clock,
    clipboard: ClipboardCheck,
    chevron: ChevronRight,
    activity: Activity,
    zap: Zap,
    trending: TrendingUp,
    bell: Bell,
    refresh: RefreshCw,
    shield: Shield,
    calendar: Calendar,
    check: CheckCircle2,
    alert: AlertTriangle,
    timer: Timer,
    home: Home,
    arrowUp: ArrowUpRight,
    sparkles: Sparkles,
    target: Target,
    chart: BarChart3,
    inbox: Inbox,
    badge: BadgeCheck,
    star: Star,
    flame: Flame,
    eye: Eye
  };

  /* ── state ──────────────────────────────────────────── */
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('Manager');

  private readonly _data = signal<ManagerDashboardData | null>(null);

  /** Cards rendered in the team anomaly feed. Filtered + sorted at load time. */
  readonly anomalies = signal<AnomalyRecord[]>([]);
  readonly anomaliesLoading = signal(true);
  readonly anomaliesError = signal(false);
  readonly criticalCount = computed(() => this.anomalies().filter(a => a.risk === 'CRITICAL').length);
  readonly highCount = computed(() => this.anomalies().filter(a => a.risk === 'HIGH').length);
  readonly mediumCount = computed(() => this.anomalies().filter(a => a.risk === 'MEDIUM').length);
  /** Kept for backward compatibility with any external template binding. */
  readonly anomalyLoading = this.anomaliesLoading;
  readonly anomalyTotals = computed(() => ({
    total: this.anomalies().length,
    critical: this.criticalCount(),
    high: this.highCount(),
    medium: this.mediumCount(),
  }));
  private clockSub?: Subscription;
  private dataSub?: Subscription;
  private anomalySub?: Subscription;

  /* ── computed ───────────────────────────────────────── */
  readonly todayLabel = computed(() =>
    this.now().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  );

  readonly timeLabel = computed(() =>
    this.now().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  );

  readonly totalCount = computed(() => this._data()?.kpis.totalMembers ?? 0);
  readonly presentCount = computed(() => this._data()?.kpis.presentCount ?? 0);
  readonly absentCount = computed(() => this._data()?.kpis.absentCount ?? 0);
  readonly lateCount = computed(() => this._data()?.kpis.lateCount ?? 0);
  readonly pendingCount = computed(() => this._data()?.kpis.pendingCount ?? 0);
  readonly attendanceRate = computed(() => this._data()?.kpis.attendanceRate ?? 0);
  readonly hasLiveSignals = computed(() => this._data()?.hasLiveSignals ?? false);

  readonly pendingRequests = computed<ManagerApprovalRequest[]>(() =>
    this._data()?.pendingRequests ?? []
  );

  readonly mergedMembers = computed<MergedMember[]>(() => {
    const data = this._data();
    if (!data) return [];

    return data.members.slice(0, 10).map(m => {
      const pres = m.presence;
      return {
        id: m.id,
        fullName: m.fullName || `${m.prenom} ${m.nom}`.trim(),
        email: m.email,
        poste: m.poste,
        equipeNom: m.equipeNom,
        avatarUrl: m.avatarUrl ?? null,
        status: pres?.status ?? 'ABSENT',
        arrivalTime: pres?.heureEntree ? this.formatTime(pres.heureEntree) : null,
        isLate: pres?.lateArrival ?? pres?.status === 'LATE',
        durationSeconds: pres?.durationSeconds ?? 0
      };
    });
  });

  readonly alerts = computed<DashAlert[]>(() => {
    const out: DashAlert[] = [];
    const pending = this.pendingCount();
    const absent = this.absentCount();
    const late = this.lateCount();
    const rate = this.attendanceRate();

    if (pending > 0) {
      out.push({
        title: `${pending} demande${pending > 1 ? 's' : ''} en attente`,
        description: 'Des collaborateurs attendent votre validation.',
        tone: 'warning',
        icon: this.ic.inbox
      });
    }
    if (absent > 0) {
      out.push({
        title: `${absent} absence${absent > 1 ? 's' : ''} détectée${absent > 1 ? 's' : ''}`,
        description: 'Vérifiez les justifications ou contactez les concernés.',
        tone: 'danger',
        icon: this.ic.userX
      });
    }
    if (late > 0) {
      out.push({
        title: `${late} retard${late > 1 ? 's' : ''} signalé${late > 1 ? 's' : ''}`,
        description: 'Arrivées tardives à surveiller ce matin.',
        tone: 'info',
        icon: this.ic.timer
      });
    }
    if (rate >= 90) {
      out.push({
        title: 'Excellente présence équipe',
        description: `${rate}% de taux de présence aujourd'hui.`,
        tone: 'success',
        icon: this.ic.badge
      });
    }
    if (out.length === 0) {
      out.push({
        title: 'Tout est stable',
        description: 'Aucune alerte en cours pour votre équipe.',
        tone: 'success',
        icon: this.ic.check
      });
    }
    return out;
  });

  readonly skeletons = Array.from({ length: 4 }, (_, i) => i);

  /* ── lifecycle ──────────────────────────────────────── */
  ngOnInit(): void {
    this.loadFirstName();
    this.loadData();
    this.loadAnomalies();
    this.clockSub = interval(60_000).subscribe(() => this.now.set(new Date()));
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.dataSub?.unsubscribe();
    this.anomalySub?.unsubscribe();
  }

  loadTeamAnomalies(): void {
    this.anomaliesLoading.set(true);
    this.anomaliesError.set(false);
    this.anomalySub?.unsubscribe();
    this.anomalySub = this.mlAnomaly.getTeamAnomalies().subscribe({
      next: (response) => {
        const significant = (response.anomalies || [])
          .filter(a => a && ['MEDIUM', 'HIGH', 'CRITICAL'].includes(a.risk))
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 5);
        this.anomalies.set(significant);
        this.anomaliesError.set(!response.success);
        this.anomaliesLoading.set(false);
      },
      error: () => {
        this.anomaliesError.set(true);
        this.anomaliesLoading.set(false);
      },
    });
  }

  /** Kept name for any internal caller (refresh button etc). */
  private loadAnomalies(): void {
    this.loadTeamAnomalies();
  }

  /* ── actions ────────────────────────────────────────── */
  refreshData(): void {
    this.refreshing.set(true);
    this.svc.refresh();
    setTimeout(() => this.refreshing.set(false), 1200);
  }

  /* ── helpers ────────────────────────────────────────── */
  private loadData(): void {
    this.loading.set(true);
    this.dataSub = this.svc.getDashboardData().subscribe({
      next: (data) => {
        this._data.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private loadFirstName(): void {
    try {
      const raw = localStorage.getItem('auth_user') ?? localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        this.firstName.set(u?.prenom ?? u?.firstName ?? 'Manager');
      }
    } catch { /* ignore */ }
  }

  initials(name: string): string {
    return (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() ?? '')
      .join('') || 'MT';
  }

  avatarGradient(name: string): string {
    const g = [
      'linear-gradient(135deg,#6366f1,#8b5cf6)',
      'linear-gradient(135deg,#0ea5e9,#06b6d4)',
      'linear-gradient(135deg,#10b981,#14b8a6)',
      'linear-gradient(135deg,#f59e0b,#f97316)',
      'linear-gradient(135deg,#ec4899,#f43f5e)',
      'linear-gradient(135deg,#8b5cf6,#a855f7)',
    ];
    const h = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return g[h % g.length];
  }

  statusLabel(status: string): string {
    const m: Record<string, string> = {
      PRESENT: 'Présent', LATE: 'Retard',
      REMOTE: 'Télétravail', ABSENT: 'Absent', OFF: 'Congé'
    };
    return m[status] ?? status;
  }

  statusTone(status: string): string {
    const m: Record<string, string> = {
      PRESENT: 'success', LATE: 'warning',
      REMOTE: 'info', ABSENT: 'danger', OFF: 'neutral'
    };
    return m[status] ?? 'neutral';
  }

  statusDot(status: string): string {
    const m: Record<string, string> = {
      success: '#10b981', warning: '#f59e0b',
      info: '#0ea5e9', danger: '#ef4444', neutral: '#94a3b8'
    };
    return m[this.statusTone(status)] ?? '#94a3b8';
  }

  requestOwner(r: ManagerApprovalRequest): string {
    return r.utilisateur?.fullName || `${r.utilisateur?.prenom ?? ''} ${r.utilisateur?.nom ?? ''}`.trim() || 'Collaborateur';
  }

  requestWindow(r: ManagerApprovalRequest): string {
    if (!r.dateDebut) return 'Date non précisée';
    const from = new Date(r.dateDebut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const to = r.dateFin ? new Date(r.dateFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;
    const days = r.nombreJours ? ` · ${r.nombreJours}j` : '';
    return to && to !== from ? `${from} → ${to}${days}` : `${from}${days}`;
  }

  typeLabel(type: string): string {
    const m: Record<string, string> = {
      CONGE: 'Congé', TELETRAVAIL: 'Télétravail',
      AUTORISATION: 'Autorisation', DOCUMENT: 'Document', ABSENCE: 'Absence'
    };
    return m[type] ?? type;
  }

  private formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return '–'; }
  }

  trackById(_: number, item: any): any {
    return item?.id ?? _;
  }
}
