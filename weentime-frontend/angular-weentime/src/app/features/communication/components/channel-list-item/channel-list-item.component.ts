import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ChannelModel } from '../../models/communication.models';

@Component({
  selector: 'app-channel-list-item',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="comm-nav-item" [class.active]="active" [routerLink]="route">
      <span class="comm-nav-icon">#</span>
      <span class="comm-nav-text">
        <strong>{{ channel.name }}</strong>
        <small>{{ channel.lastMessage?.body || channel.description || 'Canal sans message.' }}</small>
      </span>
      <span *ngIf="channel.unreadCount > 0" class="comm-nav-unread">{{ channel.unreadCount }}</span>
    </a>
  `,
  styles: [`
    .comm-nav-item {
      display: grid;
      grid-template-columns: 24px 1fr auto;
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
      color: #3C3489;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.08);
    }

    .comm-nav-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 8px;
      background: #EEEDFE;
      color: #534AB7;
      font-size: 14px;
      font-weight: 800;
    }

    .comm-nav-item.active .comm-nav-icon {
      background: #534AB7;
      color: white;
    }

    .comm-nav-text {
      display: grid;
      min-width: 0;
    }

    .comm-nav-text strong {
      font-size: 14px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
export class ChannelListItemComponent {
  @Input({ required: true }) channel!: ChannelModel;
  @Input({ required: true }) route!: string;
  @Input() active = false;
}
