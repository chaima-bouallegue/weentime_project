import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ChannelModel } from '../../models/communication.models';
import { FriendlyDatePipe } from '../../pipes/friendly-date.pipe';

@Component({
  selector: 'app-direct-message-list-item',
  standalone: true,
  imports: [CommonModule, RouterModule, FriendlyDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="comm-nav-item" [class.active]="active" [routerLink]="route" [title]="channel.name">
      <div class="comm-avatar-wrapper">
        <span class="comm-avatar">{{ initials }}</span>
        <span class="comm-status-dot online"></span>
      </div>
      <span class="comm-nav-text">
        <div class="comm-nav-header">
          <strong>{{ channel.name }}</strong>
          <span class="comm-nav-time" *ngIf="channel.lastMessage">{{ channel.lastMessage.createdAt | friendlyDate }}</span>
        </div>
        <small>{{ channel.lastMessage?.body || 'Conversation privée' }}</small>
      </span>
      <span *ngIf="channel.unreadCount > 0" class="comm-nav-unread">{{ channel.unreadCount }}</span>
    </a>
  `,
  styles: [`
    .comm-nav-item {
      display: grid;
      grid-template-columns: 32px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-radius: 16px;
      color: #475569;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .comm-nav-item:hover {
      background: rgba(83, 74, 183, 0.05);
      color: #534AB7;
    }

    .comm-nav-item.active {
      background: #EEEDFE;
      color: #312e81; /* Violet 800ish */
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.08);
    }

    .comm-avatar-wrapper {
      position: relative;
      width: 32px;
      height: 32px;
    }

    .comm-avatar {
      width: 100%;
      height: 100%;
      border-radius: 12px;
      background: linear-gradient(135deg, #534AB7, #8B5CF6);
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      box-shadow: 0 2px 8px rgba(83, 74, 183, 0.2);
    }

    .comm-status-dot {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #94a3b8;
      border: 2px solid white;
    }

    .comm-status-dot.online {
      background: #22c55e;
      box-shadow: 0 0 0 2px white, 0 0 8px rgba(34, 197, 94, 0.4);
      animation: pulse-green 2s infinite;
    }

    @keyframes pulse-green {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
      70% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    .comm-nav-item.active .comm-avatar {
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.3);
    }

    .comm-nav-text {
      display: grid;
      min-width: 0;
    }

    .comm-nav-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }

    .comm-nav-text strong {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .comm-nav-time {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
    }

    .comm-nav-item.active .comm-nav-time {
      color: #534AB7;
      opacity: 0.8;
    }

    .comm-nav-text small {
      font-size: 12px;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .comm-nav-item.active .comm-nav-text small {
      color: #534AB7;
      opacity: 0.7;
    }

    .comm-nav-unread {
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 999px;
      background: #ef4444;
      color: white;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);
    }
  `]
})
export class DirectMessageListItemComponent {
  @Input({ required: true }) channel!: ChannelModel;
  @Input({ required: true }) route!: string;
  @Input() active = false;

  get initials(): string {
    const name = this.channel?.name?.trim() ?? '';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || 'DM';
  }
}
