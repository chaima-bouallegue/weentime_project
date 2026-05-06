import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardMetricTile } from '../../models/dashboard-ui.models';

@Component({
  selector: 'ui-metric-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="tile" [class]="tile?.tone || 'neutral'">
      <p>{{ tile?.label || '-' }}</p>
      <strong>{{ tile?.value || '-' }}</strong>
    </article>
  `,
  styles: [`
    .tile {
      border-radius: 14px;
      padding: 12px;
      border: 1px solid rgba(148, 163, 184, .2);
      background: rgba(255,255,255,.72);
      display: grid;
      gap: 6px;
    }

    .tile p {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .tile strong {
      margin: 0;
      font-size: 18px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.02em;
    }

    .tile.primary { box-shadow: inset 0 0 0 1px rgba(79, 70, 229, .26); }
    .tile.info { box-shadow: inset 0 0 0 1px rgba(14, 165, 233, .24); }
    .tile.success { box-shadow: inset 0 0 0 1px rgba(16, 185, 129, .24); }
    .tile.warning { box-shadow: inset 0 0 0 1px rgba(245, 158, 11, .3); }
    .tile.danger { box-shadow: inset 0 0 0 1px rgba(239, 68, 68, .3); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MetricTileComponent {
  @Input() tile: DashboardMetricTile | null = null;
}
