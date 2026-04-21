import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { RealtimeNotificationService } from '../../core/services/realtime-notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <div class="relative">
      <button class="notification-bell-btn" (click)="toggleDropdown()">
        <lucide-icon name="bell" size="22"></lucide-icon>
        <span *ngIf="unreadCount() > 0" class="notif-badge">{{ unreadCount() }}</span>
      </button>
      <div *ngIf="dropdownOpen()" class="notif-dropdown">
        <div class="notif-dropdown-header">
          <span>Notifications</span>
          <button class="mark-all-btn" (click)="markAllAsRead()">Tout marquer comme lu</button>
        </div>
        <div class="notif-list">
          <div *ngFor="let notif of notifications() | slice:0:6" class="notif-item" [class.unread]="!notif.read">
            <lucide-icon [name]="getIcon(notif.type)" size="18"></lucide-icon>
            <div class="notif-content">
              <div class="notif-title">{{ notif.title }}</div>
              <div class="notif-message">{{ notif.message }}</div>
              <div class="notif-date">{{ notif.relativeTime }}</div>
            </div>
          </div>
          <div *ngIf="notifications().length === 0" class="notif-empty">Aucune notification</div>
        </div>
        <div class="notif-dropdown-footer">
          <a routerLink="/notifications" class="see-all-link">Voir tout</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .notification-bell-btn { position: relative; background: none; border: none; cursor: pointer; }
    .notif-badge { position: absolute; top: -4px; right: -4px; background: #ef4444; color: #fff; border-radius: 9999px; font-size: 11px; padding: 0 6px; min-width: 18px; text-align: center; font-weight: bold; }
    .notif-dropdown { position: absolute; right: 0; top: 36px; width: 340px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12); z-index: 100; padding: 0; }
    .notif-dropdown-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #f1f1f1; font-weight: 600; }
    .notif-list { max-height: 320px; overflow-y: auto; }
    .notif-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #f6f6f6; cursor: pointer; transition: background 0.2s; }
    .notif-item.unread { background: #f3f4f6; }
    .notif-content { flex: 1; }
    .notif-title { font-weight: 600; font-size: 14px; }
    .notif-message { font-size: 13px; color: #555; }
    .notif-date { font-size: 11px; color: #888; margin-top: 2px; }
    .notif-empty { padding: 24px; text-align: center; color: #888; }
    .notif-dropdown-footer { padding: 10px 16px; text-align: right; }
    .see-all-link { color: #6366f1; font-weight: 500; text-decoration: none; }
    .mark-all-btn { background: none; border: none; color: #6366f1; font-size: 12px; cursor: pointer; }
  `]
})
export class NotificationBellComponent {
  private notificationService = inject(RealtimeNotificationService);
  dropdownOpen = signal(false);

  notifications = this.notificationService.items;
  unreadCount = this.notificationService.unreadCount;

  toggleDropdown() {
    const nextState = !this.dropdownOpen();
    this.dropdownOpen.set(nextState);
    if (nextState) {
      this.notificationService.getNotifications().subscribe();
    }
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }

  getIcon(type: string): string {
    if (type.includes('REFUSE')) {
      return 'x-circle';
    }
    if (type.includes('APPROUVE') || type.includes('ACTIVATED')) {
      return 'check-circle';
    }
    if (type.includes('PENDING') || type.includes('SOUMIS') || type.includes('VALIDATION')) {
      return 'clock';
    }
    return 'bell';
  }
}
