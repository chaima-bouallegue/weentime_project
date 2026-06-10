import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminAnomalyDashboardResponse,
  AdminAnomalyFilters,
  AdminAnomalyItem,
  AdminAnomalyListResponse,
  AdminAnomalyStatus,
  AnomalyRisk,
  MlAnomalyService,
} from '../../../core/services/ml-anomaly.service';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminStatCardComponent } from '../../../shared/components/admin-stat-card/admin-stat-card.component';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { ChartCardComponent } from '../../../shared/ui/molecules/chart-card/chart-card.component';
import { DashboardChartSeries } from '../../../shared/ui/models/dashboard-ui.models';

type FilterKey = 'fromDate' | 'toDate' | 'risk' | 'category' | 'status' | 'employeeId' | 'sort';

@Component({
  selector: 'app-admin-anomalies',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    AdminPageHeaderComponent,
    AdminStatCardComponent,
    AdminEmptyStateComponent,
    ChartCardComponent,
  ],
  templateUrl: './admin-anomalies.component.html',
  styleUrl: './admin-anomalies.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAnomaliesComponent implements OnInit {
  private readonly ml = inject(MlAnomalyService);

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<AdminAnomalyDashboardResponse | null>(null);
  readonly list = signal<AdminAnomalyListResponse | null>(null);
  readonly selected = signal<AdminAnomalyItem | null>(null);
  readonly statusComment = signal('');
  readonly updatingStatus = signal<AdminAnomalyStatus | null>(null);

  readonly filters = signal<AdminAnomalyFilters>({
    fromDate: this.isoDateOffset(-7),
    toDate: this.isoDateOffset(0),
    page: 1,
    size: 12,
    sort: '-score',
  });

  readonly riskOptions: Array<{ value: '' | AnomalyRisk; label: string }> = [
    { value: '', label: 'Tous risques' },
    { value: 'CRITICAL', label: 'Critique' },
    { value: 'HIGH', label: 'Eleve' },
    { value: 'MEDIUM', label: 'Moyen' },
    { value: 'LOW', label: 'Faible' },
  ];

  readonly statusOptions: Array<{ value: '' | AdminAnomalyStatus; label: string }> = [
    { value: '', label: 'Tous statuts' },
    { value: 'UNVERIFIED', label: 'Non verifie' },
    { value: 'IN_PROGRESS', label: 'En cours' },
    { value: 'SUSPICIOUS', label: 'Suspect' },
    { value: 'JUSTIFIED', label: 'Justifie' },
    { value: 'CLOSED', label: 'Clos' },
  ];

  readonly categoryOptions = computed(() => {
    const categories = new Map<string, string>();
    for (const bucket of this.dashboard()?.byType ?? []) {
      categories.set(bucket.category, bucket.label);
    }
    for (const item of this.list()?.items ?? []) {
      categories.set(item.category, item.categoryLabel);
    }
    return [
      { value: '', label: 'Tous types' },
      ...Array.from(categories, ([value, label]) => ({ value, label })),
    ];
  });

  readonly summary = computed(() => this.dashboard()?.summary ?? this.list()?.summary ?? null);
  readonly items = computed(() => this.list()?.items ?? []);
  readonly total = computed(() => this.list()?.total ?? 0);
  readonly page = computed(() => this.list()?.page ?? this.filters().page ?? 1);
  readonly totalPages = computed(() => this.list()?.totalPages ?? 0);
  readonly backendUnavailable = computed(() => this.dashboard()?.backendStatus === 'unavailable' || this.list()?.backendStatus === 'unavailable');

  readonly riskChart = computed<DashboardChartSeries>(() => ({
    id: 'admin-anomaly-risk',
    title: 'Risque',
    subtitle: 'Repartition par severite',
    type: 'donut',
    labels: (this.dashboard()?.byRisk ?? []).map(item => this.riskLabel(item.risk)),
    values: (this.dashboard()?.byRisk ?? []).map(item => item.count),
    tone: 'danger',
  }));

  readonly typeChart = computed<DashboardChartSeries>(() => ({
    id: 'admin-anomaly-type',
    title: 'Types',
    subtitle: 'Signaux les plus frequents',
    type: 'bar',
    labels: (this.dashboard()?.byType ?? []).slice(0, 6).map(item => item.label),
    values: (this.dashboard()?.byType ?? []).slice(0, 6).map(item => item.count),
    tone: 'warning',
  }));

  readonly dayChart = computed<DashboardChartSeries>(() => ({
    id: 'admin-anomaly-day',
    title: 'Evolution',
    subtitle: 'Volume par jour',
    type: 'area',
    labels: (this.dashboard()?.byDay ?? []).map(item => this.shortDate(item.date)),
    values: (this.dashboard()?.byDay ?? []).map(item => item.count),
    tone: 'info',
  }));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const firstLoad = !this.dashboard() && !this.list();
    this.loading.set(firstLoad);
    this.refreshing.set(!firstLoad);
    this.error.set(null);
    const query = this.filters();
    forkJoin({
      dashboard: this.ml.getAdminAnomalyDashboard(query),
      list: this.ml.getAdminAnomalies(query),
    }).subscribe({
      next: ({ dashboard, list }) => {
        this.dashboard.set(dashboard);
        this.list.set(list);
        this.selected.set(list.items[0] ?? null);
        this.statusComment.set(list.items[0]?.statusComment ?? '');
        this.error.set(dashboard.success || list.success ? null : 'Service ML indisponible.');
        this.loading.set(false);
        this.refreshing.set(false);
      },
      error: () => {
        this.error.set('Service ML indisponible: les indicateurs ne representent pas un resultat a zero.');
        this.dashboard.set(null);
        this.list.set(null);
        this.selected.set(null);
        this.loading.set(false);
        this.refreshing.set(false);
      },
    });
  }

  setFilter(key: FilterKey, value: string): void {
    this.filters.update(current => {
      const next: AdminAnomalyFilters = { ...current, page: 1 };
      if (key === 'employeeId') {
        const parsed = Number(value);
        next.employeeId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      } else {
        next[key] = value || null;
      }
      return next;
    });
  }

  applyFilters(): void {
    this.load();
  }

  resetFilters(): void {
    this.filters.set({
      fromDate: this.isoDateOffset(-7),
      toDate: this.isoDateOffset(0),
      page: 1,
      size: 12,
      sort: '-score',
    });
    this.load();
  }

  nextPage(): void {
    if (this.page() >= this.totalPages()) return;
    this.filters.update(current => ({ ...current, page: (current.page ?? 1) + 1 }));
    this.load();
  }

  previousPage(): void {
    if (this.page() <= 1) return;
    this.filters.update(current => ({ ...current, page: Math.max(1, (current.page ?? 1) - 1) }));
    this.load();
  }

  select(item: AdminAnomalyItem): void {
    this.selected.set(item);
    this.statusComment.set(item.statusComment ?? '');
  }

  updateStatus(status: AdminAnomalyStatus): void {
    const item = this.selected();
    if (!item || this.updatingStatus()) return;
    this.updatingStatus.set(status);
    this.ml.updateAdminAnomalyStatus(item.id, status, this.statusComment()).subscribe({
      next: response => {
        const updated: AdminAnomalyItem = {
          ...item,
          status: response.status,
          statusComment: response.comment ?? null,
          statusUpdatedAt: response.updatedAt,
        };
        this.selected.set(updated);
        this.patchItem(updated);
        this.updatingStatus.set(null);
      },
      error: () => {
        this.error.set('Mise a jour du statut impossible.');
        this.updatingStatus.set(null);
      },
    });
  }

  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.ml.exportAdminAnomalies(this.filters()).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `anomalies-admin-${this.isoDateOffset(0)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => {
        this.error.set('Export CSV indisponible.');
        this.exporting.set(false);
      },
    });
  }

  scorePercent(item: AdminAnomalyItem): number {
    return Math.round((item.score || 0) * 100);
  }

  riskLabel(risk: AnomalyRisk): string {
    return {
      CRITICAL: 'Critique',
      HIGH: 'Eleve',
      MEDIUM: 'Moyen',
      LOW: 'Faible',
    }[risk];
  }

  statusLabel(status: AdminAnomalyStatus): string {
    return {
      UNVERIFIED: 'Non verifie',
      IN_PROGRESS: 'En cours',
      JUSTIFIED: 'Justifie',
      SUSPICIOUS: 'Suspect',
      CLOSED: 'Clos',
    }[status];
  }

  riskTone(risk: AnomalyRisk): string {
    return risk.toLowerCase();
  }

  statusTone(status: AdminAnomalyStatus): string {
    return status.toLowerCase().replace('_', '-');
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  shortDate(value: string): string {
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  trackById(_: number, item: AdminAnomalyItem): string {
    return item.id;
  }

  private patchItem(updated: AdminAnomalyItem): void {
    this.list.update(current => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map(item => item.id === updated.id ? updated : item),
      };
    });
    this.dashboard.update(current => {
      if (!current) return current;
      return {
        ...current,
        topAnomalies: current.topAnomalies.map(item => item.id === updated.id ? updated : item),
      };
    });
  }

  private isoDateOffset(offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }
}
