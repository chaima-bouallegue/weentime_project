import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStat } from '../../models/dashboard-ui.models';
import { StatCardComponent } from '../../molecules/stat-card/stat-card.component';

@Component({
  selector: 'ui-dashboard-stats-grid',
  standalone: true,
  imports: [CommonModule, StatCardComponent],
  template: `
    <section class="stats-grid">
      @for (stat of stats; track stat.id) {
        <ui-stat-card [stat]="stat"></ui-stat-card>
      }
    </section>
  `,
  styles: [`
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 24px;
    }

    @media (max-width: 1180px) {
      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 640px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardStatsGridComponent {
  @Input() stats: DashboardStat[] = [];
}
