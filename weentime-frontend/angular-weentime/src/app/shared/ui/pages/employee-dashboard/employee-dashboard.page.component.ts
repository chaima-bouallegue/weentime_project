import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DashboardService } from '@app/features/dashboard/dashboard.service';
import { DashboardPayload, DashboardSegment } from '../../models/dashboard-ui.models';
import { DashboardLayoutComponent } from '../../templates/dashboard-layout/dashboard-layout.component';
import { DashboardStatsGridComponent } from '../../organisms/dashboard-stats-grid/dashboard-stats-grid.component';
import { AnalyticsPanelComponent } from '../../organisms/analytics-panel/analytics-panel.component';
import { ActivityFeedComponent } from '../../organisms/activity-feed/activity-feed.component';
import { QuickActionsComponent } from '../../organisms/quick-actions/quick-actions.component';
import { NotificationsPanelComponent } from '../../organisms/notifications-panel/notifications-panel.component';
import { MetricTileComponent } from '../../molecules/metric-tile/metric-tile.component';
import { ProgressRingComponent } from '../../molecules/progress-ring/progress-ring.component';
import { UserCardComponent } from '../../molecules/user-card/user-card.component';
import { UiButtonComponent } from '../../atoms/button/button.component';
import { UiSpinnerComponent } from '../../atoms/spinner/spinner.component';
import { AnalyticsLayoutComponent } from '../../templates/analytics-layout/analytics-layout.component';
import { SkeletonCardComponent } from '../../atoms/skeleton-card/skeleton-card.component';
import { SkeletonChartComponent } from '../../molecules/skeleton-chart/skeleton-chart.component';
import { SkeletonListComponent } from '../../molecules/skeleton-list/skeleton-list.component';

@Component({
  selector: 'ui-employee-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    DashboardLayoutComponent,
    DashboardStatsGridComponent,
    AnalyticsPanelComponent,
    ActivityFeedComponent,
    QuickActionsComponent,
    NotificationsPanelComponent,
    MetricTileComponent,
    ProgressRingComponent,
    UserCardComponent,
    UiButtonComponent,
    UiSpinnerComponent,
    AnalyticsLayoutComponent,
    SkeletonCardComponent,
    SkeletonChartComponent,
    SkeletonListComponent
  ],
  template: `
    <ui-dashboard-layout
      [title]="(data()?.heroTitle || 'Mon espace personnel')"
      [subtitle]="(data()?.heroSubtitle || 'Suivi de ma présence et de mes demandes')"
      [roleBadge]="(data()?.roleBadge || 'Collaborateur')"
      [quickActions]="data()?.quickActions || []"
      [loading]="loading()"
      (refresh)="manualRefresh()">

      <div layout-metrics>
        @if (loading() && !data()) {
          <section class="skeleton-grid">
            @for (i of [1,2,3,4]; track i) {
              <ui-skeleton-card></ui-skeleton-card>
            }
          </section>
        } @else if (error() && !data()) {
          <section class="state-card">
            <p>{{ error() }}</p>
            <ui-button label="Réessayer" icon="refresh" (pressed)="manualRefresh()"></ui-button>
          </section>
        } @else {
          <ui-dashboard-stats-grid [stats]="data()?.stats || []"></ui-dashboard-stats-grid>
          <section class="tile-row">
            @for (tile of data()?.metricTiles || []; track tile.id) {
              <ui-metric-tile [tile]="tile"></ui-metric-tile>
            }
          </section>
        }
      </div>

      <div layout-primary>
        @if (loading() && data()) {
          <div class="inline-loading"><ui-spinner [size]="18"></ui-spinner><span>Synchronisation en cours...</span></div>
        }
        @if (hasPartialData()) {
          <section class="partial-banner">
            <span>Données partielles: certaines sections utilisent uniquement les sources disponibles.</span>
            <button type="button" (click)="manualRefresh()" [disabled]="loading()">Réessayer</button>
          </section>
        }

        @if (loading() && !data()) {
          <section class="section-skeleton-grid">
            <ui-skeleton-chart></ui-skeleton-chart>
            <ui-skeleton-list [rows]="5"></ui-skeleton-list>
          </section>
        } @else {
        <ui-analytics-layout>
          <div analytics-main>
            <ui-analytics-panel [charts]="data()?.charts || []"></ui-analytics-panel>
          </div>
          <div analytics-side class="panel">
            <h3>Mes indicateurs</h3>
            <div class="segment-list">
              @for (segment of data()?.segments || []; track segment.id) {
                <div>
                  <span>{{ segment.label }}</span>
                  <strong>{{ segment.value }}</strong>
                </div>
              }
            </div>
            <ui-progress-ring [label]="'Présence'" [value]="presentSegment()" [max]="segmentTotal()"></ui-progress-ring>
          </div>
        </ui-analytics-layout>

        <ui-activity-feed
          [title]="'Activité du jour'"
          [subtitle]="'Dernières actions personnelles'"
          [activities]="data()?.activities || []">
        </ui-activity-feed>
        }
      </div>

      <div layout-side>
        @if (loading() && !data()) {
          <section class="side-skeleton-stack">
            <ui-skeleton-list [rows]="4"></ui-skeleton-list>
            <ui-skeleton-list [rows]="3"></ui-skeleton-list>
          </section>
        } @else {
        <ui-quick-actions
          [title]="'Actions rapides'"
          [subtitle]="'Pointage, congés, télétravail'"
          [actions]="data()?.quickActions || []">
        </ui-quick-actions>

        <ui-notifications-panel
          [title]="'Mes notifications'"
          [subtitle]="'Informations récentes'"
          [notifications]="data()?.notifications || []">
        </ui-notifications-panel>
        }
      </div>

      <div layout-bottom>
        @if (loading() && !data()) {
          <ui-skeleton-list [rows]="4"></ui-skeleton-list>
        } @else {
        <section class="panel">
          <h3>Aperçu personnel</h3>
          @if ((data()?.people || []).length === 0) {
            <p class="empty">Aucune information personnelle supplémentaire</p>
          } @else {
            <div class="people-grid">
              @for (person of data()?.people || []; track person.id) {
                <ui-user-card [person]="person"></ui-user-card>
              }
            </div>
          }
        </section>
        }
      </div>
    </ui-dashboard-layout>
  `,
  styles: [`
    .section-skeleton-grid {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: 24px;
      animation: fadeIn .28s ease both;
    }

    .side-skeleton-stack {
      display: grid;
      gap: 24px;
      animation: fadeIn .28s ease both;
    }
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 24px;
    }

    .state-card {
      border-radius: 16px;
      border: 1px solid rgba(239, 68, 68, .26);
      background: rgba(254, 242, 242, .7);
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: #b91c1c;
      font-size: 13px;
      font-weight: 700;
    }

    .tile-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .inline-loading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
      padding: 0 2px;
    }

    .partial-banner {
      border-radius: 14px;
      border: 1px solid rgba(245, 158, 11, .3);
      background: rgba(255, 251, 235, .84);
      color: #92400e;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 12px;
      font-weight: 800;
    }

    .partial-banner button {
      border: 1px solid rgba(245, 158, 11, .42);
      border-radius: 999px;
      background: rgba(255, 255, 255, .78);
      color: #92400e;
      cursor: pointer;
      font-size: 11px;
      font-weight: 900;
      padding: 6px 10px;
      transition: transform .18s ease, box-shadow .18s ease;
    }

    .partial-banner button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(245, 158, 11, .14);
    }

    .partial-banner button:disabled {
      cursor: not-allowed;
      opacity: .55;
    }
    .panel {
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: rgba(255,255,255,.78);
      padding: 16px;
      display: grid;
      gap: 12px;
    }

    .panel h3 {
      margin: 0;
      color: #0f172a;
      font-size: 15px;
      font-weight: 900;
    }

    .segment-list {
      display: grid;
      gap: 8px;
    }

    .segment-list div {
      border-radius: 10px;
      border: 1px solid rgba(148,163,184,.2);
      background: rgba(255,255,255,.7);
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .segment-list span {
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .segment-list strong {
      color: #0f172a;
      font-size: 12px;
      font-weight: 900;
    }

    .people-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .empty {
      margin: 0;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
      padding: 12px 0;
    }

    @media (max-width: 1180px) {
      .section-skeleton-grid,
      .skeleton-grid,
      .tile-row,
      .people-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .section-skeleton-grid,
      .skeleton-grid,
      .tile-row,
      .people-grid {
        grid-template-columns: 1fr;
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeDashboardPageComponent {
  private readonly service = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = signal<DashboardPayload | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly warnings = computed(() => this.data()?.warnings ?? []);
  readonly hasPartialData = computed(() => this.warnings().length > 0);

  readonly presentSegment = computed(() => this.segmentValue('Presents'));
  readonly segmentTotal = computed(() =>
    Math.max((this.data()?.segments || []).reduce((acc, item) => acc + item.value, 0), 1)
  );

  constructor() {
    this.loadData(true, false);
    interval(60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData(false, true));
  }

  manualRefresh(): void {
    this.loadData(true, true);
  }

  private loadData(showLoader: boolean, forceRefresh: boolean): void {
    if (showLoader) {
      this.loading.set(true);
    }
    this.error.set(null);

    this.service.getEmployeeDashboard(forceRefresh)
      .pipe(take(1))
      .subscribe({
        next: payload => {
          this.data.set(payload);
          this.loading.set(false);
        },
        error: err => {
          this.loading.set(false);
          const message = err instanceof Error ? err.message : 'Erreur lors du chargement des données.';
          this.error.set(message);
        }
      });
  }

  private segmentValue(label: string): number {
    return this.findSegment(label)?.value ?? 0;
  }

  private findSegment(label: string): DashboardSegment | undefined {
    return (this.data()?.segments || []).find(item => item.label.toLowerCase() === label.toLowerCase());
  }
}
