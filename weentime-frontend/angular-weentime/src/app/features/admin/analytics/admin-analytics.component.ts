import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { AdminApiService } from '../admin-api.service';
import { PresenceMonitoringService } from '../../presence/services/presence-monitoring.service';
import { GlobalPresenceAnalytics, PresenceStats } from '../../presence/models/presence.model';
import { ToastService } from '../../../core/services/toast.service';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminStatCardComponent } from '../../../shared/components/admin-stat-card/admin-stat-card.component';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule, AdminPageHeaderComponent, AdminStatCardComponent, AdminEmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page">
      <app-admin-page-header
        eyebrow="Analytics"
        title="Operational analytics"
        description="Suivi des heures, des heures supplémentaires, du taux d’absence et de la distribution par département."
        [breadcrumbs]="breadcrumbs">
      </app-admin-page-header>

      @if (isLoading()) {
        <section class="admin-grid kpis">
          <div class="admin-surface admin-panel placeholder"></div>
          <div class="admin-surface admin-panel placeholder"></div>
          <div class="admin-surface admin-panel placeholder"></div>
          <div class="admin-surface admin-panel placeholder"></div>
        </section>
      } @else {
        <section class="admin-grid kpis">
          <app-admin-stat-card label="Total hours" icon="clock" [value]="totalHours()" hint="Volume global travaillé aujourd’hui"></app-admin-stat-card>
          <app-admin-stat-card label="Overtime" icon="timer" [value]="overtime()" tone="warning" hint="Heures supplémentaires remontées par présence"></app-admin-stat-card>
          <app-admin-stat-card label="Absence rate" icon="alert-triangle" [value]="absenceRate()" tone="danger" hint="Part des absents sur la population suivie"></app-admin-stat-card>
          <app-admin-stat-card label="Average session" icon="activity" [value]="averageSession()" tone="success" hint="Durée moyenne d’une session de présence"></app-admin-stat-card>
        </section>

        <section class="admin-grid dual">
          <article class="admin-surface admin-panel">
            <div class="panel-head">
              <div>
                <span class="admin-pill">Bar chart</span>
                <h2>Department stats</h2>
              </div>
            </div>

            @if (departmentBars().length === 0) {
              <app-admin-empty-state title="No department distribution" description="Aucune statistique par département n’a été remontée." icon="network"></app-admin-empty-state>
            } @else {
              <div class="bar-chart">
                @for (item of departmentBars(); track item.label) {
                  <div class="bar-col">
                    <div class="bar-value">{{ item.value }}</div>
                    <div class="bar-track">
                      <div class="bar" [style.height.%]="item.percent"></div>
                    </div>
                    <span>{{ item.label }}</span>
                  </div>
                }
              </div>
            }
          </article>

          <article class="admin-surface admin-panel">
            <div class="panel-head">
              <div>
                <span class="admin-pill">Line trend</span>
                <h2>Monthly requests evolution</h2>
              </div>
            </div>

            @if (chartPoints().length === 0) {
              <app-admin-empty-state title="No trend data" description="Aucune évolution mensuelle disponible pour le moment." icon="bar-chart-2"></app-admin-empty-state>
            } @else {
              <svg viewBox="0 0 640 260" class="trend-chart" preserveAspectRatio="none">
                <path [attr.d]="lineAreaPath()" class="area"></path>
                <path [attr.d]="linePath()" class="stroke"></path>
                @for (point of chartPoints(); track point.label) {
                  <circle [attr.cx]="point.x" [attr.cy]="point.y" r="5" class="dot"></circle>
                }
              </svg>
              <div class="line-labels">
                @for (item of monthlySeries(); track item.label) {
                  <div><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div>
                }
              </div>
            }
          </article>
        </section>

        <section class="admin-surface admin-panel">
          <div class="panel-head">
            <div>
              <span class="admin-pill">Workload distribution</span>
              <h2>Request type mix</h2>
            </div>
          </div>

          @if (requestTypeEntries().length === 0) {
            <app-admin-empty-state title="No request mix" description="Le backend RH n’a pas encore retourné de répartition des demandes." icon="briefcase"></app-admin-empty-state>
          } @else {
            <div class="request-mix">
              @for (item of requestTypeEntries(); track item.label) {
                <div class="mix-row">
                  <div class="mix-head">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                  <div class="mix-track">
                    <div class="mix-fill" [style.width.%]="item.percent"></div>
                  </div>
                </div>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .placeholder {
      min-height: 140px;
    }

    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 18px;
    }

    h2 {
      margin: 8px 0 0;
      color: var(--saas-text);
      font-size: 1.2rem;
      font-weight: 900;
    }

    .bar-chart {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
      gap: 12px;
      align-items: end;
      min-height: 280px;
    }

    .bar-col {
      display: grid;
      gap: 10px;
      justify-items: center;
    }

    .bar-value,
    .bar-col span,
    .line-labels span {
      color: var(--saas-muted);
      font-weight: 700;
    }

    .bar-track {
      display: flex;
      align-items: end;
      width: 100%;
      height: 180px;
      padding: 8px;
      border-radius: 18px;
      background: rgba(148, 163, 184, 0.08);
    }

    .bar {
      width: 100%;
      border-radius: 14px;
      background: linear-gradient(180deg, #2563eb, #7c3aed);
      transition: height 0.35s ease;
    }

    .trend-chart {
      width: 100%;
      height: 260px;
    }

    .area {
      fill: rgba(37, 99, 235, 0.12);
    }

    .stroke {
      fill: none;
      stroke: #2563eb;
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .dot {
      fill: #fff;
      stroke: #2563eb;
      stroke-width: 4;
    }

    .line-labels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }

    .line-labels div {
      display: grid;
      gap: 4px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(148, 163, 184, 0.08);
    }

    .line-labels strong,
    .mix-head strong {
      color: var(--saas-text);
    }

    .request-mix {
      display: grid;
      gap: 14px;
    }

    .mix-row {
      display: grid;
      gap: 8px;
    }

    .mix-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-weight: 700;
      color: var(--saas-text);
    }

    .mix-track {
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(148, 163, 184, 0.16);
    }

    .mix-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(135deg, #14b8a6, #2563eb);
    }
  `]
})
export class AdminAnalyticsComponent {
  private readonly api = inject(AdminApiService);
  private readonly monitoringService = inject(PresenceMonitoringService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly breadcrumbs = [{ label: 'Admin', route: '/app/admin/dashboard' }, { label: 'Analytics' }];
  readonly isLoading = signal(true);
  readonly analytics = signal<GlobalPresenceAnalytics | null>(null);
  readonly presenceStats = signal<PresenceStats | null>(null);
  readonly demandBreakdown = signal<Record<string, number>>({});
  readonly monthlyEvolution = signal<Record<number, number>>({});

  readonly totalHours = computed(() => Number((this.analytics()?.totalHoursWorkedToday ?? 0).toFixed(1)));
  readonly overtime = computed(() => Number((this.presenceStats()?.overtimeHours ?? 0).toFixed(1)));
  readonly averageSession = computed(() => Number((this.analytics()?.averageSessionHours ?? 0).toFixed(1)));
  readonly absenceRate = computed(() => {
    const total = this.analytics()?.totalTrackedUsers ?? 0;
    if (!total) {
      return 0;
    }
    return Math.round(((this.analytics()?.absentToday ?? 0) / total) * 100);
  });
  readonly departmentBars = computed(() => this.toMetricEntries(this.analytics()?.departmentDistribution ?? {}, 8));
  readonly requestTypeEntries = computed(() => this.toMetricEntries(this.demandBreakdown()));
  readonly monthlySeries = computed(() =>
    Object.entries(this.monthlyEvolution())
      .map(([month, value]) => ({ month: Number(month), label: this.monthName(Number(month)), value: Number(value) }))
      .sort((left, right) => left.month - right.month)
  );
  readonly chartPoints = computed(() => {
    const series = this.monthlySeries();
    if (series.length === 0) {
      return [];
    }
    const max = Math.max(...series.map(item => item.value), 1);
    const width = 600;
    const height = 220;
    return series.map((item, index) => ({
      ...item,
      x: 20 + ((width - 40) / Math.max(series.length - 1, 1)) * index,
      y: height - ((item.value / max) * (height - 40)) - 20
    }));
  });
  readonly linePath = computed(() => {
    const points = this.chartPoints();
    if (points.length === 0) {
      return '';
    }
    return `M ${points.map(point => `${point.x} ${point.y}`).join(' L ')}`;
  });
  readonly lineAreaPath = computed(() => {
    const points = this.chartPoints();
    if (points.length === 0) {
      return '';
    }
    const first = points[0];
    const last = points[points.length - 1];
    return `M ${first.x} 240 L ${points.map(point => `${point.x} ${point.y}`).join(' L ')} L ${last.x} 240 Z`;
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    forkJoin({
      analytics: this.monitoringService.getGlobalAnalytics(),
      presenceStats: this.api.getPresenceStats(),
      demandBreakdown: this.api.getDemandesByType(),
      monthlyEvolution: this.api.getMonthlyEvolution()
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ analytics, presenceStats, demandBreakdown, monthlyEvolution }) => {
          this.analytics.set(analytics);
          this.presenceStats.set(presenceStats);
          this.demandBreakdown.set(demandBreakdown || {});
          this.monthlyEvolution.set(monthlyEvolution || {});
        },
        error: () => this.toast.error('Erreur lors du chargement des analytics admin')
      });
  }

  private toMetricEntries(source: Record<string, number>, limit = Number.MAX_SAFE_INTEGER): Array<{ label: string; value: number; percent: number }> {
    const entries = Object.entries(source)
      .map(([label, value]) => ({
        label: label.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()),
        value: Number(value)
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, limit);
    const max = Math.max(...entries.map(item => item.value), 1);
    return entries.map(item => ({ ...item, percent: (item.value / max) * 100 }));
  }

  private monthName(month: number): string {
    return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(2026, Math.max(month - 1, 0), 1));
  }
}
