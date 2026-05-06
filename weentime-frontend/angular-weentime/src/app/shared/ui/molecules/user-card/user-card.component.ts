import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardPeopleItem } from '../../models/dashboard-ui.models';
import { UiAvatarComponent } from '../../atoms/avatar/avatar.component';
import { UiStatusIndicatorComponent } from '../../atoms/status-indicator/status-indicator.component';

@Component({
  selector: 'ui-user-card',
  standalone: true,
  imports: [CommonModule, UiAvatarComponent, UiStatusIndicatorComponent],
  template: `
    <article class="user-card" *ngIf="person">
      <div class="user-card__identity">
        <ui-avatar [name]="person.fullName" [size]="40"></ui-avatar>
        <div class="user-card__text">
          <h4>{{ person.fullName }}</h4>
          <p>{{ person.subline }}</p>
        </div>
      </div>
      <ui-status-indicator [label]="person.status" [tone]="person.statusTone || 'neutral'"></ui-status-indicator>
    </article>
  `,
  styles: [`
    .user-card {
      border-radius: 16px;
      background: rgba(255, 255, 255, .74);
      border: 1px solid rgba(148, 163, 184, .22);
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .user-card__identity {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .user-card__text {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .user-card__text h4 {
      margin: 0;
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-card__text p {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserCardComponent {
  @Input() person: DashboardPeopleItem | null = null;
}
