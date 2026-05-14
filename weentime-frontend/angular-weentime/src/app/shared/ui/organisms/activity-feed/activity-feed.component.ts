import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardActivity } from '../../models/dashboard-ui.models';
import { TimelineItemComponent } from '../../molecules/timeline-item/timeline-item.component';
import { UiIconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'ui-activity-feed',
  standalone: true,
  imports: [CommonModule, TimelineItemComponent, UiIconComponent],
  template: `
    <section class="feed">
      <header class="feed__head">
        <div>
          <h3>{{ title }}</h3>
          <p>{{ subtitle }}</p>
        </div>
        <ui-icon icon="activity" [size]="16"></ui-icon>
      </header>

      @if (activities.length === 0) {
        <p class="feed__empty">Aucune activite disponible</p>
      } @else {
        <div class="feed__list">
          @for (item of activities; track item.id) {
            <ui-timeline-item [item]="item"></ui-timeline-item>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .feed {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .feed__head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 16px;
    }

    .feed__head h3 {
      margin: 0;
      color: #0f172a;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .feed__head p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 13px;
      font-weight: 500;
    }

    .feed__list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .feed__empty {
      margin: 0;
      min-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 2px dashed #f1f5f9;
      color: #94a3b8;
      font-size: 14px;
      font-weight: 500;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityFeedComponent {
  @Input() title = 'Activite recente';
  @Input() subtitle = '';
  @Input() activities: DashboardActivity[] = [];
}
