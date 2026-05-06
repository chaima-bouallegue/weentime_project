import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ChannelModel } from '../../models/communication.models';

@Component({
  selector: 'app-direct-message-list-item',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="comm-nav-item" [class.active]="active" [routerLink]="route">
      <span class="comm-avatar">{{ initials }}</span>
      <span class="comm-nav-text">
        <strong>{{ channel.name }}</strong>
        <small>{{ channel.lastMessage?.body || 'Conversation privee' }}</small>
      </span>
      <span *ngIf="channel.unreadCount > 0" class="comm-nav-unread">{{ channel.unreadCount }}</span>
    </a>
  `,
  styles: [`
    .comm-nav-item {
      display: grid;
      grid-template-columns: 32px 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 10px 14px;
      border-radius: 16px;
      color: #314158;
      text-decoration: none;
      transition: background-color 0.18s ease, transform 0.18s ease;
    }

    .comm-nav-item:hover,
    .comm-nav-item.active {
      background: rgba(14, 116, 144, 0.12);
      transform: translateX(2px);
    }

    .comm-avatar {
      width: 32px;
      height: 32px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0f766e, #0ea5e9);
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .comm-nav-text {
      display: grid;
      min-width: 0;
    }

    .comm-nav-text strong,
    .comm-nav-text small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .comm-nav-text small {
      color: #64748b;
    }

    .comm-nav-unread {
      min-width: 24px;
      height: 24px;
      padding: 0 8px;
      border-radius: 999px;
      background: #0ea5e9;
      color: white;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
