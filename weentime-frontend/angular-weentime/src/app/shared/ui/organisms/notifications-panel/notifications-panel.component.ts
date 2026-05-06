import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardNotification } from '../../models/dashboard-ui.models';
import { UiBadgeComponent } from '../../atoms/badge/badge.component';
import { UiIconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'ui-notifications-panel',
  standalone: true,
  imports: [CommonModule, UiBadgeComponent, UiIconComponent],
  template: `
    <section class="notifications">
      <header class="notifications__head">
        <div>
          <h3>{{ title }}</h3>
          <p>{{ subtitle }}</p>
        </div>
        <ui-icon icon="bell" [size]="16"></ui-icon>
      </header>

      @if (notifications.length === 0) {
        <p class="notifications__empty">Aucune notification</p>
      } @else {
        <div class="notifications__list">
          @for (item of notifications; track item.id) {
            <article class="notifications__item">
              <div class="notifications__item-head">
                <h4>{{ item.title }}</h4>
                <ui-badge [tone]="item.tone || 'neutral'" [label]="item.timestamp"></ui-badge>
              </div>
              <p>{{ item.message }}</p>
              <span class="notifications__new" *ngIf="item.unread">Nouveau</span>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .notifications {
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: rgba(255,255,255,.78);
      padding: 16px;
      display: grid;
      gap: 14px;
    }

    .notifications__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .notifications__head h3 {
      margin: 0;
      color: #0f172a;
      font-size: 15px;
      font-weight: 900;
    }

    .notifications__head p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .notifications__list {
      display: grid;
      gap: 8px;
    }

    .notifications__item {
      border-radius: 12px;
      border: 1px solid rgba(148,163,184,.2);
      background: rgba(255,255,255,.72);
      padding: 10px 11px;
      display: grid;
      gap: 7px;
      position: relative;
    }

    .notifications__item-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }

    .notifications__item h4 {
      margin: 0;
      color: #0f172a;
      font-size: 12px;
      font-weight: 800;
    }

    .notifications__item p {
      margin: 0;
      color: #475569;
      font-size: 12px;
      line-height: 1.35;
      font-weight: 600;
    }

    .notifications__new {
      position: absolute;
      top: 8px;
      right: 8px;
      font-size: 9px;
      font-weight: 900;
      text-transform: uppercase;
      color: #4f46e5;
    }

    .notifications__empty {
      margin: 0;
      min-height: 120px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      border: 1px dashed rgba(148,163,184,.4);
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsPanelComponent {
  @Input() title = 'Notifications';
  @Input() subtitle = '';
  @Input() notifications: DashboardNotification[] = [];
}
