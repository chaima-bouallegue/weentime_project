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
import { interval, Subscription } from 'rxjs';
import {
  LucideAngularModule,
  Users,
  UserCheck,
  UserX,
  Clock,
  Inbox,
  Briefcase,
  RefreshCw,
  ChevronRight,
  BarChart3,
  PieChart,
  Activity,
  AlertTriangle,
  CheckCircle2,
  History,
  Calendar,
  TrendingUp,
  AlertCircle,
  Sparkles,
  Shield,
  Eye,
  FileText,
  Settings
} from 'lucide-angular';
import { RhDashboardService } from './rh-dashboard.service';
import {
  AnomalyDashboardResponse,
  AnomalyRecord,
  MlAnomalyService,
} from '../../../core/services/ml-anomaly.service';
import { AnomalyAlertCardComponent } from '../../../shared/components/anomaly-alert-card/anomaly-alert-card.component';
import {
  DashboardViewModel,
  DashboardLeaveRequest,
  HighlightedMember,
  AttendanceBarItem,
  RequestMixItem
} from './rh-dashboard.models';

interface DashAlert {
  title: string;
  description: string;
  tone: 'warning' | 'danger' | 'info' | 'success';
  icon: any;
}

@Component({
  selector: 'app-rh-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, AnomalyAlertCardComponent],
  templateUrl: './rh-dashboard.component.html',
  styleUrl: './rh-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhDashboardComponent implements OnInit, OnDestroy {
  private readonly svc = inject(RhDashboardService);
  private readonly mlAnomaly = inject(MlAnomalyService);

  /* ── icons ──────────────────────────────────────────── */
  protected readonly ic = {
    users: Users,
    userCheck: UserCheck,
    userX: UserX,
    clock: Clock,
    inbox: Inbox,
    briefcase: Briefcase,
    refresh: RefreshCw,
    chevron: ChevronRight,
    chart: BarChart3,
    pie: PieChart,
    activity: Activity,
    alert: AlertTriangle,
    check: CheckCircle2,
    history: History,
    calendar: Calendar,
    trending: TrendingUp,
    alertCircle: AlertCircle,
    sparkles: Sparkles,
    shield: Shield,
    eye: Eye,
    file: FileText,
    settings: Settings
  };

  /* ── state ──────────────────────────────────────────── */
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('RH');

  private readonly _data = signal<DashboardViewModel | null>(null);
  private readonly _anomalyData = signal<AnomalyDashboardResponse | null>(null);
  readonly anomalyLoading = signal(true);
  readonly anomalies = computed<AnomalyRecord[]>(() => this._anomalyData()?.anomalies ?? []);
  readonly anomalyTotals = computed(() => {
    const d = this._anomalyData();
    const anomalies = d?.anomalies ?? [];
    // Never trust counts when the records array is empty -- guards against
    // any stale/cached envelope shape with non-zero totals and 0 records.
    if (anomalies.length === 0) {
      return { total: 0, critical: 0, high: 0, medium: 0 };
    }
    return {
      total: d?.totalAnomalies ?? anomalies.length,
      critical: d?.critical ?? 0,
      high: d?.high ?? 0,
      medium: d?.medium ?? 0,
    };
  });
  private clockSub?: Subscription;
  private dataSub?: Subscription;
  private anomalySub?: Subscription;

  /* ── computed ───────────────────────────────────────── */
  readonly todayLabel = computed(() =>
    this.now().toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  );

  readonly totalEmployees = computed(() => this._data()?.totalEmployees ?? 0);
  readonly presentCount = computed(() => this._data()?.presentCount ?? 0);
  readonly absentCount = computed(() => this._data()?.absentCount ?? 0);
  readonly pendingCount = computed(() => this._data()?.pendingRequests?.length ?? 0);
  readonly hoursWorked = computed(() => this._data()?.hoursWorked ?? 0);
  readonly attendanceRate = computed(() => this._data()?.attendanceRate ?? 0);

  readonly attendanceBars = computed<AttendanceBarItem[]>(() =>
    this._data()?.attendanceBars ?? []
  );

  readonly requestMix = computed<RequestMixItem[]>(() =>
    this._data()?.requestMix ?? []
  );

  readonly pendingRequests = computed<DashboardLeaveRequest[]>(() =>
    this._data()?.pendingRequests ?? []
  );

  readonly highlightedMembers = computed<HighlightedMember[]>(() =>
    this._data()?.highlightedMembers ?? []
  );

  readonly activityFeed = computed(() => this._data()?.activityFeed ?? []);

  readonly alerts = computed<DashAlert[]>(() => {
    const out: DashAlert[] = [];
    const pending = this.pendingCount();
    const absent = this.absentCount();
    const rate = this.attendanceRate();

    if (pending > 0) {
      out.push({
        title: `${pending} demande${pending > 1 ? 's' : ''} RH en attente`,
        description: 'Validation requise pour finaliser le workflow.',
        tone: 'warning',
        icon: this.ic.inbox
      });
    }
    if (absent > 3) {
      out.push({
        title: `${absent} absences signalées`,
        description: 'Taux d\'absence supérieur à la moyenne.',
        tone: 'danger',
        icon: this.ic.userX
      });
    }
    if (rate >= 95) {
      out.push({
        title: 'Excellente présence globale',
        description: `${rate}% de taux de présence aujourd'hui.`,
        tone: 'success',
        icon: this.ic.check
      });
    }
    if (out.length === 0) {
      out.push({
        title: 'Situation stable',
        description: 'Aucune alerte majeure à signaler.',
        tone: 'info',
        icon: this.ic.shield
      });
    }
    return out;
  });

  readonly suggestedActions = computed(() => {
    const out: { label: string; icon: any; route: string; priority: boolean }[] = [];
    const pending = this.pendingCount();
    const rate = this.attendanceRate();
    const day = this.now().getDay(); // 0=Sun, 5=Fri
    const hour = this.now().getHours();

    if (pending > 0) {
      out.push({ label: 'Valider les demandes', icon: this.ic.check, route: '/app/rh/requests', priority: true });
    }

    if (rate < 80 && hour >= 10) {
      out.push({ label: 'Vérifier les retards', icon: this.ic.clock, route: '/app/rh/employees', priority: true });
    }

    if (day === 5 && hour >= 14) {
      out.push({ label: 'Rapport de semaine', icon: this.ic.chart, route: '/app/rh/reports', priority: false });
    }

    out.push({ label: 'Nouveau collaborateur', icon: this.ic.users, route: '/app/rh/employees', priority: false });
    
    return out.slice(0, 3);
  });

  readonly skeletons = Array.from({ length: 5 }, (_, i) => i);

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

  private loadAnomalies(): void {
    this.anomalyLoading.set(true);
    this.anomalySub = this.mlAnomaly.getDashboardSummary().subscribe({
      next: (data) => {
        this._anomalyData.set(data);
        this.anomalyLoading.set(false);
      },
      error: () => this.anomalyLoading.set(false),
    });
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
        this.firstName.set(u?.prenom ?? u?.firstName ?? 'RH');
      }
    } catch { /* ignore */ }
  }

  initials(name: string): string {
    return (name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0]?.toUpperCase() ?? '')
      .join('') || 'RH';
  }

  avatarGradient(name: string): string {
    const g = [
      'linear-gradient(135deg,#8b5cf6,#a855f7)',
      'linear-gradient(135deg,#6366f1,#818cf8)',
      'linear-gradient(135deg,#ec4899,#f43f5e)',
      'linear-gradient(135deg,#f59e0b,#f97316)',
      'linear-gradient(135deg,#10b981,#14b8a6)',
      'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    ];
    const h = (name ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return g[h % g.length];
  }

  requestOwner(req: DashboardLeaveRequest): string {
    return req.employeeName || `Employé #${req.userId}`;
  }

  requestPeriod(req: DashboardLeaveRequest): string {
    if (!req.startDate) return 'Date non précisée';
    const from = new Date(req.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const to = req.endDate ? new Date(req.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : null;
    return to && to !== from ? `${from} → ${to}` : from;
  }

  memberTone(status: string): string {
    const m: Record<string, string> = {
      ACTIVE: 'success', ABSENT: 'danger', ON_LEAVE: 'warning'
    };
    return m[status] ?? 'neutral';
  }

  memberLabel(status: string): string {
    const m: Record<string, string> = {
      ACTIVE: 'Actif', ABSENT: 'Absent', ON_LEAVE: 'Congé'
    };
    return m[status] ?? status;
  }

  trackById(_: number, item: any): any {
    return item?.id ?? _;
  }
}
