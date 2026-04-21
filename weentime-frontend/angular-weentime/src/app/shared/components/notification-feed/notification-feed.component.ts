import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { RealtimeNotificationView } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-feed',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="notification-feed admin-surface">
      <header class="feed-head">
        <div>
          <span class="eyebrow">{{ kicker() }}</span>
          <h2>{{ title() }}</h2>
          <p>{{ subtitle() }}</p>
        </div>
        <span class="unread-pill" [class.clear]="unreadCount() === 0">
          {{ unreadCount() }} unread
        </span>
      </header>

      @if (items().length === 0) {
        <div class="empty-feed">
          <lucide-icon name="bell" size="22"></lucide-icon>
          <span>{{ emptyLabel() }}</span>
        </div>
      } @else {
        <div class="feed-list">
          @for (item of items(); track item.id) {
            <a
              class="feed-item"
              [class.unread]="!item.read"
              [class.priority-high]="item.priority === 'high'"
              [class.priority-critical]="item.priority === 'critical'"
              [routerLink]="item.actionUrl || null">
              <span class="feed-icon">
                <lucide-icon [name]="iconFor(item)" size="17"></lucide-icon>
              </span>
              <span class="feed-copy">
                <span class="feed-title-row">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.relativeTime }}</small>
                </span>
                <span class="message">{{ item.message }}</span>
                <span class="meta">{{ item.actor }} · {{ item.category }}</span>
              </span>
            </a>
          }
        </div>
      }
    </article>
  `,
  styles: [`
    .notification-feed {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-height: 100%;
    }

    .feed-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }

    .feed-head h2 {
      margin: 4px 0 6px;
      color: var(--text-primary, #111827);
      font-size: 1.2rem;
      font-weight: 800;
    }

    .feed-head p {
      margin: 0;
      color: var(--text-secondary, #64748b);
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .eyebrow {
      color: var(--accent, #0f766e);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .unread-pill {
      flex: 0 0 auto;
      padding: 7px 10px;
      border-radius: 999px;
      background: #fff7ed;
      color: #9a3412;
      border: 1px solid #fed7aa;
      font-size: 0.76rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .unread-pill.clear {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }

    .feed-list {
      display: grid;
      gap: 10px;
    }

    .feed-item {
      display: grid;
      grid-template-columns: 38px 1fr;
      gap: 12px;
      padding: 12px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.72);
      color: inherit;
      text-decoration: none;
      border: 1px solid rgba(148, 163, 184, 0.24);
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }

    .feed-item:hover {
      transform: translateY(-1px);
      border-color: rgba(15, 118, 110, 0.35);
      background: rgba(240, 253, 250, 0.86);
    }

    .feed-item.unread {
      border-left: 4px solid #0f766e;
    }

    .feed-item.priority-high {
      border-left-color: #f97316;
    }

    .feed-item.priority-critical {
      border-left-color: #dc2626;
    }

    .feed-icon {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 14px;
      background: #f0fdfa;
      color: #0f766e;
    }

    .priority-high .feed-icon {
      background: #fff7ed;
      color: #ea580c;
    }

    .priority-critical .feed-icon {
      background: #fef2f2;
      color: #dc2626;
    }

    .feed-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .feed-title-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: baseline;
    }

    .feed-title-row strong {
      color: var(--text-primary, #111827);
      font-size: 0.92rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .feed-title-row small,
    .meta {
      color: var(--text-muted, #94a3b8);
      font-size: 0.74rem;
      white-space: nowrap;
    }

    .message {
      color: var(--text-secondary, #475569);
      font-size: 0.84rem;
      line-height: 1.35;
    }

    .empty-feed {
      min-height: 140px;
      display: grid;
      place-items: center;
      gap: 10px;
      color: var(--text-secondary, #64748b);
      border: 1px dashed rgba(148, 163, 184, 0.48);
      border-radius: 20px;
      background: rgba(248, 250, 252, 0.68);
      text-align: center;
      padding: 24px;
    }

    @media (max-width: 640px) {
      .feed-head,
      .feed-title-row {
        flex-direction: column;
        align-items: flex-start;
      }

      .feed-item {
        grid-template-columns: 32px 1fr;
      }

      .feed-icon {
        width: 32px;
        height: 32px;
      }
    }
  `]
})
export class NotificationFeedComponent {
  readonly kicker = input('Notifications');
  readonly title = input('Notification feed');
  readonly subtitle = input('Live workflow and system notifications.');
  readonly emptyLabel = input('No notification available.');
  readonly unreadCount = input(0);
  readonly items = input<RealtimeNotificationView[]>([]);

  iconFor(item: RealtimeNotificationView): string {
    if (item.priority === 'critical') {
      return 'alert-triangle';
    }
    if (item.read) {
      return 'check-circle';
    }
    return 'bell';
  }
}
