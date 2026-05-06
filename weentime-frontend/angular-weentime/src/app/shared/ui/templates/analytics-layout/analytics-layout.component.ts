import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-analytics-layout',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="analytics-layout">
      <div class="analytics-layout__main">
        <ng-content select="[analytics-main]"></ng-content>
      </div>
      <aside class="analytics-layout__side">
        <ng-content select="[analytics-side]"></ng-content>
      </aside>
    </section>
  `,
  styles: [`
    .analytics-layout {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: 14px;
      align-items: start;
      min-width: 0;
    }

    .analytics-layout__main,
    .analytics-layout__side {
      display: grid;
      gap: 14px;
      min-width: 0;
    }

    @media (max-width: 1040px) {
      .analytics-layout {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalyticsLayoutComponent {}
