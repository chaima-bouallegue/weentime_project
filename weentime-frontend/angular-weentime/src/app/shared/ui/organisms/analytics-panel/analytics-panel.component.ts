import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardChartSeries } from '../../models/dashboard-ui.models';
import { ChartCardComponent } from '../../molecules/chart-card/chart-card.component';

@Component({
  selector: 'ui-analytics-panel',
  standalone: true,
  imports: [CommonModule, ChartCardComponent],
  template: `
    <section class="analytics-grid">
      @if (charts.length === 0) {
        <article class="analytics-empty">
          <strong>Aucune donnée graphique</strong>
          <span>Les graphiques apparaîtront quand les endpoints fourniront des valeurs réelles.</span>
        </article>
      } @else {
        @for (chart of charts; track chart.id) {
          <ui-chart-card [chart]="chart"></ui-chart-card>
        }
      }
    </section>
  `,
  styles: [`
    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .analytics-empty {
      grid-column: 1 / -1;
      min-height: 220px;
      border-radius: 20px;
      border: 1px dashed rgba(148, 163, 184, .44);
      background: rgba(255,255,255,.72);
      display: grid;
      place-items: center;
      align-content: center;
      gap: 8px;
      text-align: center;
      color: #64748b;
      padding: 18px;
    }

    .analytics-empty strong {
      color: #0f172a;
      font-size: 14px;
      font-weight: 900;
    }

    .analytics-empty span {
      font-size: 12px;
      font-weight: 700;
      max-width: 44ch;
      line-height: 1.45;
    }

    @media (max-width: 980px) {
      .analytics-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalyticsPanelComponent {
  @Input() charts: DashboardChartSeries[] = [];
}
