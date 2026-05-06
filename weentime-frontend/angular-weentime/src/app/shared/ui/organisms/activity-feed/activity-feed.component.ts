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
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: rgba(255,255,255,.78);
      padding: 16px;
      display: grid;
      gap: 14px;
    }

    .feed__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .feed__head h3 {
      margin: 0;
      color: #0f172a;
      font-size: 15px;
      font-weight: 900;
    }

    .feed__head p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .feed__list {
      display: grid;
      gap: 10px;
    }

    .feed__empty {
      margin: 0;
      min-height: 120px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      border: 1px dashed rgba(148, 163, 184, .4);
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityFeedComponent {
  @Input() title = 'Activite recente';
  @Input() subtitle = '';
  @Input() activities: DashboardActivity[] = [];
}
