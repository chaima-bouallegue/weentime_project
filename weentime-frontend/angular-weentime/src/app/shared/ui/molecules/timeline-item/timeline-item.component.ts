import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardActivity } from '../../models/dashboard-ui.models';
import { UiBadgeComponent } from '../../atoms/badge/badge.component';

@Component({
  selector: 'ui-timeline-item',
  standalone: true,
  imports: [CommonModule, UiBadgeComponent],
  template: `
    <article class="timeline-item" *ngIf="item">
      <div class="timeline-item__line"></div>
      <div class="timeline-item__content">
        <div class="timeline-item__head">
          <h4>{{ item.title }}</h4>
          <ui-badge [tone]="item.tone || 'neutral'" [label]="item.timestamp"></ui-badge>
        </div>
        <p>{{ item.description }}</p>
      </div>
    </article>
  `,
  styles: [`
    .timeline-item {
      position: relative;
      padding-left: 24px;
    }

    .timeline-item::before {
      content: '';
      position: absolute;
      left: 4px;
      top: 0;
      bottom: -16px;
      width: 1px;
      background: #FFFFFF;
    }

    .timeline-item:last-child::before {
      bottom: 0;
      height: 20px;
    }

    .timeline-item__line {
      position: absolute;
      left: 0;
      top: 6px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: white;
      border: 2px solid #6366f1;
      z-index: 1;
    }

    .timeline-item__content {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .timeline-item__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .timeline-item__head h4 {
      margin: 0;
      color: #0f172a;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.4;
    }

    .timeline-item__content p {
      margin: 0;
      color: #64748b;
      font-size: 13px;
      line-height: 1.5;
      font-weight: 500;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimelineItemComponent {
  @Input() item: DashboardActivity | null = null;
}
