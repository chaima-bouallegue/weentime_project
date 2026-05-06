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
      display: grid;
      grid-template-columns: 12px 1fr;
      gap: 12px;
      align-items: flex-start;
    }

    .timeline-item__line {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-top: 8px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      box-shadow: 0 0 0 5px rgba(99, 102, 241, .15);
    }

    .timeline-item__content {
      border-radius: 14px;
      border: 1px solid rgba(148, 163, 184, .2);
      background: rgba(255, 255, 255, .74);
      padding: 10px 12px;
      display: grid;
      gap: 8px;
    }

    .timeline-item__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .timeline-item__head h4 {
      margin: 0;
      color: #0f172a;
      font-size: 13px;
      font-weight: 800;
    }

    .timeline-item__content p {
      margin: 0;
      color: #475569;
      font-size: 12px;
      line-height: 1.35;
      font-weight: 600;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimelineItemComponent {
  @Input() item: DashboardActivity | null = null;
}
