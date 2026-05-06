import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-skeleton-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="skeleton-chart" [style.min-height.px]="height" aria-hidden="true">
      <div class="skeleton-chart__head">
        <span></span>
        <span></span>
      </div>
      <div class="skeleton-chart__bars">
        @for (item of bars; track item) {
          <span [style.height.%]="item"></span>
        }
      </div>
    </article>
  `,
  styles: [`
    .skeleton-chart {
      border-radius: 16px;
      border: 1px solid rgba(226, 232, 240, .78);
      background: rgba(255, 255, 255, .82);
      box-shadow: 0 14px 34px rgba(15, 23, 42, .05);
      padding: 16px;
      display: grid;
      gap: 18px;
    }

    .skeleton-chart__head {
      display: grid;
      gap: 8px;
    }

    .skeleton-chart__head span,
    .skeleton-chart__bars span {
      display: block;
      border-radius: 999px;
      background: linear-gradient(90deg, #e2e8f0 20%, #f8fafc 50%, #e2e8f0 80%);
      background-size: 220% 100%;
      animation: shimmer 1.15s linear infinite;
    }

    .skeleton-chart__head span:first-child {
      width: 44%;
      height: 16px;
    }

    .skeleton-chart__head span:last-child {
      width: 68%;
      height: 11px;
    }

    .skeleton-chart__bars {
      min-height: 170px;
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 10px;
      align-items: end;
    }

    .skeleton-chart__bars span {
      border-radius: 12px 12px 8px 8px;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonChartComponent {
  @Input() height = 260;
  readonly bars = [45, 72, 56, 84, 64, 38];
}
