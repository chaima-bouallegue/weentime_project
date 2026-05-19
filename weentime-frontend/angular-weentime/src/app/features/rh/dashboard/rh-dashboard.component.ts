import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import {
  LucideAngularModule,
  RefreshCw,
  Sparkles,
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  Inbox,
  Clock,
  Home as HomeIcon,
  ArrowUpRight,
} from 'lucide-angular';

import { RhDashboardService } from './rh-dashboard.service';
import { DashboardViewModel } from './rh-dashboard.models';
import {
  AnomalyDashboardResponse,
  AnomalyRecord,
  MlAnomalyService,
} from '../../../core/services/ml-anomaly.service';

import { AiAnomalyFeedComponent } from '../../../shared/dashboard/ai-anomaly-feed/ai-anomaly-feed.component';
import { AttendanceSummaryComponent } from '../../../shared/dashboard/attendance-summary/attendance-summary.component';
import { SmartStatCardComponent } from '../../../shared/dashboard/smart-stat-card/smart-stat-card.component';
import { SmartTimelineComponent, TimelineItem } from '../../../shared/dashboard/smart-timeline/smart-timeline.component';
import { WorkflowOverviewComponent } from '../../../shared/dashboard/workflow-overview/workflow-overview.component';

@Component({
  selector: 'app-rh-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LucideAngularModule,
    SmartStatCardComponent,
    AiAnomalyFeedComponent,
    WorkflowOverviewComponent,
    SmartTimelineComponent,
    AttendanceSummaryComponent,
  ],
  templateUrl: './rh-dashboard.component.html',
  styleUrl: './rh-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RhDashboardComponent implements OnInit, OnDestroy {
  private readonly svc = inject(RhDashboardService);
  private readonly mlAnomaly = inject(MlAnomalyService);

  /* ── icons (Lucide) ─────────────────────────────────── */
  protected readonly ic = {
    refresh: RefreshCw,
    sparkles: Sparkles,
    calendar: CalendarDays,
    users: Users,
    userCheck: UserCheck,
    userX: UserX,
    inbox: Inbox,
    clock: Clock,
    home: HomeIcon,
    arrowUp: ArrowUpRight,
  };

  /* ── core state ─────────────────────────────────────── */
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly now = signal(new Date());
  readonly firstName = signal('RH');

  private readonly _data = signal<DashboardViewModel | null>(null);
  private readonly _anomalyData = signal<AnomalyDashboardResponse | null>(null);
  readonly anomalyLoading = signal(true);

  private clockSub?: Subscription;
  private dataSub?: Subscription;
  private anomalySub?: Subscription;

  /* ── computed helpers ───────────────────────────────── */
  readonly todayLabel = computed(() =>
    this.now().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );

  /* Top-level KPIs (real backend data only). */
  readonly totalEmployees = computed(() => this._data()?.totalEmployees ?? 0);
  readonly presentCount = computed(() => this._data()?.presentCount ?? 0);
  readonly absentCount = computed(() => this._data()?.absentCount ?? 0);
  readonly remoteCount = computed(() => this._data()?.attendanceBreakdown?.remote ?? 0);
  readonly hoursWorked = computed(() => this._data()?.hoursWorked ?? 0);
  readonly attendanceRate = computed(() => Math.round(this._data()?.attendanceRate ?? 0));
  readonly pendingRequestsCount = computed(() => this._data()?.pendingRequests?.length ?? 0);

  /* Workflow + summary props passed through to shared components. */
  readonly workflowBuckets = computed(() => this._data()?.workflowBuckets ?? []);
  readonly attendanceBreakdown = computed(() => this._data()?.attendanceBreakdown ?? null);

  /* Anomalies. */
  readonly anomalies = computed<AnomalyRecord[]>(() => this._anomalyData()?.anomalies ?? []);
  readonly anomalyTotals = computed(() => {
    const d = this._anomalyData();
    const list = d?.anomalies ?? [];
    if (list.length === 0) return { total: 0, critical: 0, high: 0, medium: 0 };
    return {
      total: d?.totalAnomalies ?? list.length,
      critical: d?.critical ?? 0,
      high: d?.high ?? 0,
      medium: d?.medium ?? 0,
    };
  });

  /* Timeline projection from activityFeed — strongly typed for the timeline component. */
  readonly timelineItems = computed<TimelineItem[]>(() =>
    (this._data()?.activityFeed ?? []).map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      date: item.date,
      type: this.guessType(item.title, item.description),
    })),
  );

  /* Hero quick-glance chips. */
  readonly heroChips = computed(() => [
    { label: 'Présents', value: this.presentCount(), tone: 'success' as const, icon: this.ic.userCheck },
    { label: 'Absents', value: this.absentCount(), tone: 'danger' as const, icon: this.ic.userX },
    { label: 'Demandes', value: this.pendingRequestsCount(), tone: 'warning' as const, icon: this.ic.inbox },
  ]);

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

  /* ── actions ────────────────────────────────────────── */
  refreshData(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.svc.refresh();
    this.loadAnomalies();
    // Spinner stops as soon as the data signal updates; cap it defensively.
    setTimeout(() => this.refreshing.set(false), 1200);
  }

  /* ── data loading ───────────────────────────────────── */
  private loadData(): void {
    this.loading.set(true);
    this.dataSub = this.svc.getDashboardData().subscribe({
      next: data => {
        this._data.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadAnomalies(): void {
    this.anomalyLoading.set(true);
    this.anomalySub = this.mlAnomaly.getDashboardSummary().subscribe({
      next: data => {
        this._anomalyData.set(data);
        this.anomalyLoading.set(false);
      },
      error: () => this.anomalyLoading.set(false),
    });
  }

  private loadFirstName(): void {
    try {
      const raw = localStorage.getItem('auth_user') ?? localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        this.firstName.set(u?.prenom ?? u?.firstName ?? 'RH');
      }
    } catch {
      /* ignore */
    }
  }

  /* Best-effort classification used only for the timeline dot color. */
  private guessType(title: string, description: string): string {
    const haystack = `${title || ''} ${description || ''}`.toLowerCase();
    if (haystack.includes('anomal')) return 'anomaly';
    if (haystack.includes('télétrav') || haystack.includes('teletrav')) return 'telework';
    if (haystack.includes('autoris')) return 'authorization';
    if (haystack.includes('document') || haystack.includes('attest')) return 'document';
    if (haystack.includes('congé') || haystack.includes('conge')) return 'leave';
    return 'default';
  }
}
