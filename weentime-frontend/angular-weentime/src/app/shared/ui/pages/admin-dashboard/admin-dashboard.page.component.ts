import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { interval, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { DashboardService } from '@app/features/dashboard/dashboard.service';
import { DashboardStore } from '@app/core/services/dashboard.store';
import { UiButtonComponent } from '../../atoms/button/button.component';
import { UiIconComponent } from '../../atoms/icon/icon.component';
import { UiSpinnerComponent } from '../../atoms/spinner/spinner.component';
import { SkeletonCardComponent } from '../../atoms/skeleton-card/skeleton-card.component';
import { StatCardComponent } from '../../molecules/stat-card/stat-card.component';
import { SkeletonChartComponent } from '../../molecules/skeleton-chart/skeleton-chart.component';
import { SkeletonListComponent } from '../../molecules/skeleton-list/skeleton-list.component';
import {
  DashboardChartSeries,
  DashboardPayload,
  DashboardStat,
  DashboardWidgetWarning
} from '../../models/dashboard-ui.models';

interface ChartEntry {
  label: string;
  value: number;
}

@Component({
  selector: 'ui-admin-dashboard-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    UiButtonComponent,
    UiIconComponent,
    UiSpinnerComponent,
    SkeletonCardComponent,
    StatCardComponent,
    SkeletonChartComponent,
    SkeletonListComponent
  ],
  template: `
    <section class="dashboard-root">
      <header class="hero">
        <div class="hero-copy">
          <p class="hero-tag">Administration</p>
          <h1>{{ data()?.heroTitle || 'Vue système globale' }}</h1>
          <p>{{ data()?.heroSubtitle || 'Pilotage des utilisateurs, entreprises et présence' }}</p>
        </div>

        <div class="hero-actions">
          <a class="action-link" routerLink="/app/admin/users">
            <ui-icon icon="users" [size]="14"></ui-icon>
            <span>Gérer utilisateurs</span>
          </a>
          <a class="action-link" routerLink="/app/admin/entreprises">
            <ui-icon icon="building-2" [size]="14"></ui-icon>
            <span>Gérer entreprises</span>
          </a>
          <ui-button
            [label]="'Actualiser'"
            [icon]="'refresh'"
            [variant]="'secondary'"
            [loading]="loading()"
            (pressed)="manualRefresh()">
          </ui-button>
        </div>
      </header>

      @if (loading() && data()) {
        <div class="inline-loading">
          <ui-spinner [size]="16"></ui-spinner>
          <span>Mise à jour en cours...</span>
        </div>
      }

      @if (hasPartialData()) {
        <section class="partial-banner">
          <div class="partial-banner__copy">
            <ui-icon icon="alert-triangle" [size]="14"></ui-icon>
            <span>Données partielles: certaines sections ne sont pas disponibles.</span>
          </div>
          <button type="button" (click)="manualRefresh()" [disabled]="loading()">Réessayer</button>
        </section>
      }

      @if (loading() && !data()) {
        <section class="skeleton-grid">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <ui-skeleton-card></ui-skeleton-card>
          }
        </section>
        <section class="skeleton-panels">
          <ui-skeleton-chart></ui-skeleton-chart>
          <ui-skeleton-list [rows]="5"></ui-skeleton-list>
        </section>
      } @else if (error() && !data()) {
        <section class="state-card">
          <p>{{ error() }}</p>
          <ui-button label="Réessayer" icon="refresh" [variant]="'secondary'" (pressed)="manualRefresh()"></ui-button>
        </section>
      } @else {
        <section class="kpi-grid">
          @for (stat of primaryStats(); track stat.id) {
            <ui-stat-card [stat]="stat"></ui-stat-card>
          }
        </section>

        <section class="panel-grid">
          <article class="panel">
            <h2>Répartition des rôles</h2>
            @if (roleEntries().length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="list-rows">
                @for (item of roleEntries(); track item.label) {
                  <div class="list-row">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                }
              </div>
            }
          </article>

          <article class="panel">
            <h2>Santé des entreprises</h2>
            @if (enterpriseHealthEntries().length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="list-rows">
                @for (item of enterpriseHealthEntries(); track item.label) {
                  <div class="list-row">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                }
              </div>
            }
          </article>

          <article class="panel">
            <h2>Synthèse présence</h2>
            @if (presenceEntries().length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="list-rows">
                @for (item of presenceEntries(); track item.label) {
                  <div class="list-row">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                  </div>
                }
              </div>
            }
          </article>

          <article class="panel">
            <h2>Alertes système</h2>
            @if (systemAlerts().length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="alert-list">
                @for (notification of systemAlerts(); track notification.id) {
                  <div
                    class="alert-row"
                    [class.warn]="notification.tone === 'warning'"
                    [class.danger]="notification.tone === 'danger'"
                    [class.success]="notification.tone === 'success'">
                    <p>{{ notification.title }}</p>
                    <span>{{ notification.message }}</span>
                  </div>
                }
              </div>
            }
          </article>
        </section>

        <section class="lower-grid">
          <article class="panel panel-wide">
            <h2>Tendances complémentaires</h2>
            @if (remainingCharts().length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="trend-grid">
                @for (chart of remainingCharts(); track chart.id) {
                  <article class="trend-card">
                    <p class="trend-title">{{ chart.title }}</p>
                    <div class="list-rows">
                      @for (item of toChartEntries(chart).slice(0, 4); track item.label) {
                        <div class="list-row">
                          <span>{{ item.label }}</span>
                          <strong>{{ item.value }}</strong>
                        </div>
                      }
                    </div>
                  </article>
                }
              </div>
            }
          </article>

          <article class="panel">
            <h2>Activité récente</h2>
            @if ((data()?.activities || []).length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="activity-list">
                @for (activity of (data()?.activities || []).slice(0, 6); track activity.id) {
                  <div class="activity-row">
                    <p>{{ activity.title }}</p>
                    <span>{{ activity.description }}</span>
                  </div>
                }
              </div>
            }
          </article>

          <article class="panel">
            <h2>Utilisateurs récents</h2>
            @if ((data()?.people || []).length === 0) {
              <p class="empty-state">Aucune donnée disponible</p>
            } @else {
              <div class="activity-list">
                @for (person of (data()?.people || []).slice(0, 6); track person.id) {
                  <div class="activity-row">
                    <p>{{ person.fullName }}</p>
                    <span>{{ person.subline }}</span>
                  </div>
                }
              </div>
            }
          </article>

          <article class="panel quick-panel">
            <h2>Actions rapides</h2>
            @if ((data()?.quickActions || []).length === 0) {
              <p class="empty-state">Aucune action disponible</p>
            } @else {
              <div class="quick-actions">
                @for (action of (data()?.quickActions || []); track action.id) {
                  <a class="quick-action" [routerLink]="action.route">
                    <span class="icon-wrap smallicon">
                      <ui-icon [icon]="action.icon || 'activity'" [size]="15"></ui-icon>
                    </span>
                    <span>{{ action.label }}</span>
                  </a>
                }
              </div>
            }
          </article>
        </section>
      }
    </section>
  `,
  styles: [`
    .dashboard-root {
      width: min(1320px, 100%);
      margin-inline: auto;
      padding: 18px 16px 24px;
      display: grid;
      gap: 24px;
      box-sizing: border-box;
      border-radius: 24px;
      background:
        radial-gradient(circle at 12% 4%, rgba(37, 99, 235, .08), transparent 34%),
        radial-gradient(circle at 90% 8%, rgba(124, 58, 237, .09), transparent 30%),
        linear-gradient(180deg, rgba(248, 250, 252, .92), rgba(239, 246, 255, .55));
    }

    .hero {
      border-radius: 16px;
      border: 1px solid rgba(148, 163, 184, .24);
      background:
        linear-gradient(135deg, rgba(255,255,255,.95) 0%, rgba(239,246,255,.88) 58%, rgba(237,233,254,.72) 100%);
      box-shadow: 0 18px 38px rgba(37, 99, 235, .10);
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      flex-wrap: wrap;
      animation: riseIn .42s ease both;
    }

    .hero-copy {
      display: grid;
      gap: 6px;
    }

    .hero-tag {
      margin: 0;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .hero h1 {
      margin: 0;
      color: #0f172a;
      font-size: 1.45rem;
      font-weight: 900;
      line-height: 1.1;
    }

    .hero p {
      margin: 0;
      color: #475569;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }

    .hero-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .action-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, .26);
      background: #fff;
      color: #0f172a;
      text-decoration: none;
      padding: 9px 11px;
      font-size: 12px;
      font-weight: 700;
      transition: transform .2s ease, box-shadow .2s ease;
    }

    .action-link:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(15, 23, 42, .08);
    }

    .inline-loading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
    }

    .partial-banner {
      border-radius: 12px;
      border: 1px solid rgba(245, 158, 11, .3);
      background: rgba(255, 251, 235, .82);
      color: #92400e;
      padding: 9px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
    }

    .partial-banner__copy {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .partial-banner button {
      border: 1px solid rgba(245, 158, 11, .42);
      border-radius: 999px;
      background: rgba(255, 255, 255, .82);
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

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 24px;
    }

    .kpi-card {
      min-height: 148px;
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: #fff;
      box-shadow: 0 10px 20px rgba(15, 23, 42, .04);
      padding: 14px;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 10px;
      transition: transform .2s ease, box-shadow .2s ease;
      animation: riseIn .46s ease both;
    }

    .kpi-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 26px rgba(15, 23, 42, .08);
    }

    .kpi-card header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kpi-card header p {
      margin: 0;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
    }

    .icon-wrap {
      width: 30px;
      height: 30px;
      border-radius: 9px;
      background: linear-gradient(135deg, rgba(37, 99, 235, .15), rgba(79, 70, 229, .15));
      color: #1d4ed8;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .kpi-value {
      margin: 0;
      color: #0f172a;
      font-size: 1.7rem;
      font-weight: 900;
      line-height: 1;
      word-break: break-word;
    }

    .kpi-detail {
      margin: 0;
      color: #64748b;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
    }

    .panel-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .panel {
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: #fff;
      box-shadow: 0 8px 18px rgba(15, 23, 42, .04);
      padding: 14px;
      display: grid;
      gap: 10px;
      align-content: start;
      min-width: 0;
      animation: riseIn .5s ease both;
    }

    .kpi-card:nth-child(2), .panel:nth-child(2) { animation-delay: .04s; }
    .kpi-card:nth-child(3), .panel:nth-child(3) { animation-delay: .08s; }
    .kpi-card:nth-child(4), .panel:nth-child(4) { animation-delay: .12s; }

    .panel h2 {
      margin: 0;
      color: #0f172a;
      font-size: 14px;
      font-weight: 800;
      line-height: 1.3;
    }

    .list-rows {
      display: grid;
      gap: 8px;
    }

    .list-row {
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, .2);
      background: #f8fafc;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .list-row span {
      color: #475569;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      min-width: 0;
    }

    .list-row strong {
      color: #0f172a;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }

    .alert-list,
    .activity-list {
      display: grid;
      gap: 8px;
    }

    .alert-row,
    .activity-row {
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, .2);
      background: #f8fafc;
      padding: 8px 10px;
      display: grid;
      gap: 4px;
    }

    .alert-row p,
    .activity-row p {
      margin: 0;
      color: #0f172a;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.3;
    }

    .alert-row span,
    .activity-row span {
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      line-height: 1.35;
    }

    .alert-row.warn {
      border-color: rgba(245, 158, 11, .35);
      background: rgba(255, 251, 235, .9);
    }

    .alert-row.danger {
      border-color: rgba(239, 68, 68, .32);
      background: rgba(254, 242, 242, .9);
    }

    .alert-row.success {
      border-color: rgba(34, 197, 94, .32);
      background: rgba(240, 253, 244, .9);
    }

    .lower-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .panel-wide {
      grid-column: 1 / -1;
    }

    .trend-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .trend-card {
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, .2);
      background: #f8fafc;
      padding: 10px;
      display: grid;
      gap: 8px;
      min-width: 0;
    }

    .trend-title {
      margin: 0;
      color: #0f172a;
      font-size: 12px;
      font-weight: 800;
      line-height: 1.3;
    }

    .quick-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }

    .quick-action {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 48px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, .2);
      background: linear-gradient(135deg, #f8fafc, #fff);
      color: #0f172a;
      text-decoration: none;
      padding: 10px;
      font-size: 12px;
      font-weight: 800;
      transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
    }

    .quick-action:hover {
      transform: translateY(-2px);
      border-color: rgba(37, 99, 235, .28);
      box-shadow: 0 12px 22px rgba(37, 99, 235, .10);
    }

    .smallicon {
      width: 28px;
      height: 28px;
      border-radius: 9px;
    }

    .empty-state {
      margin: 0;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
    }

    .state-card {
      border-radius: 14px;
      border: 1px solid rgba(239, 68, 68, .26);
      background: rgba(254, 242, 242, .85);
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: #b91c1c;
      font-size: 12px;
      font-weight: 700;
    }

    .state-card p {
      margin: 0;
    }

    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 24px;
    }

    .skeleton-card,
    .skeleton-panel {
      border-radius: 14px;
      background: linear-gradient(90deg, #e2e8f0 20%, #f8fafc 50%, #e2e8f0 80%);
      background-size: 210% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    .skeleton-card {
      min-height: 148px;
    }

    .skeleton-panels {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 24px;
    }

    .skeleton-panel {
      min-height: 190px;
    }

    @media (max-width: 1120px) {
      .kpi-grid,
      .skeleton-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .trend-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 860px) {
      .panel-grid,
      .lower-grid,
      .skeleton-panels {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .kpi-grid,
      .skeleton-grid,
      .trend-grid,
      .quick-actions {
        grid-template-columns: 1fr;
      }

      .hero-actions {
        width: 100%;
      }

      .action-link,
      ui-button {
        width: 100%;
      }
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @keyframes riseIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboardPageComponent {
  private readonly store = inject(DashboardStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly data = this.store.adminData;
  readonly loading = this.store.isLoading('ADMIN');
  readonly error = this.store.getError('ADMIN');

  readonly warnings = computed<DashboardWidgetWarning[]>(() => this.data()?.warnings ?? []);
  readonly hasPartialData = computed(() => this.warnings().length > 0);
  readonly primaryStats = computed<DashboardStat[]>(() => (this.data()?.stats ?? []).slice(0, 6));
  readonly roleEntries = computed(() => this.toChartEntries(this.findChart('admin-donut-role-distribution')));
  readonly enterpriseHealthEntries = computed(() => this.toChartEntries(this.findChart('admin-bar-enterprise-health')));
  readonly presenceEntries = computed(() => this.toChartEntries(this.findChart('admin-area-presence')));
  readonly systemAlerts = computed(() => (this.data()?.notifications ?? []).slice(0, 5));
  readonly remainingCharts = computed(() => {
    const hiddenIds = new Set(['admin-donut-role-distribution', 'admin-bar-enterprise-health', 'admin-area-presence']);
    return (this.data()?.charts ?? [])
      .filter(chart => !hiddenIds.has(chart.id))
      .filter(chart => this.toChartEntries(chart).length > 0);
  });

  constructor() {
    interval(60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadData(false, true));
  }

  manualRefresh(): void {
    this.loadData(true, true);
  }

  private loadData(showLoader: boolean, forceRefresh: boolean): void {
    this.store.loadDashboard('ADMIN', forceRefresh).pipe(take(1)).subscribe();
  }

  isUnavailableStat(stat: DashboardStat): boolean {
    const value = String(stat?.value ?? '').trim().toLowerCase();
    return !value || value.includes('aucune donnee disponible') || value.includes('aucune donnée disponible');
  }

  toChartEntries(chart: DashboardChartSeries | null): ChartEntry[] {
    if (!chart) {
      return [];
    }

    const labels = Array.isArray(chart.labels) ? chart.labels : [];
    const values = Array.isArray(chart.values) ? chart.values : [];
    if (labels.length === 0 || values.length === 0) {
      return [];
    }

    const entries = labels.map((label, index) => ({
      label,
      value: this.toFiniteNumber(values[index])
    }));
    const hasFallbackLabel = entries.length === 1 && entries[0].label.toLowerCase().includes('aucune donnee');
    const hasPositiveValue = entries.some(entry => entry.value > 0);

    if (hasFallbackLabel || !hasPositiveValue) {
      return [];
    }

    return entries;
  }


  private findChart(id: string): DashboardChartSeries | null {
    return (this.data()?.charts ?? []).find(chart => chart.id === id) ?? null;
  }

  private toFiniteNumber(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}

