import { Component, inject, EventEmitter, Output, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { NotificationService, Notification } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-notification-dropdown',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <div class="notif-panel" (click)="$event.stopPropagation()">
      <!-- Header -->
      <div class="notif-header">
        <div class="header-left">
          <h3 class="notif-title">Notifications</h3>
          @if (unreadCount() > 0) {
            <span class="unread-pill">{{ unreadCount() }} non lues</span>
          }
        </div>
        <button (click)="markAllAsRead()" class="mark-all-btn" [disabled]="unreadCount() === 0">
          Tout lire
        </button>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-tabs">
        <button (click)="activeFilter.set('ALL')" [class.active]="activeFilter() === 'ALL'">Toutes</button>
        <button (click)="activeFilter.set('UNREAD')" [class.active]="activeFilter() === 'UNREAD'">Non lues</button>
        <button (click)="activeFilter.set('ACTIONS')" [class.active]="activeFilter() === 'ACTIONS'">Actions requises</button>
      </div>

      <!-- List -->
      <div class="notif-list custom-scrollbar">
        @if (filteredNotifications().length === 0) {
          <div class="empty-state">
            <div class="empty-illustration">
              <lucide-icon name="bell-off" size="48"></lucide-icon>
            </div>
            <p>Aucune notification</p>
            <span class="empty-sub">Vous êtes à jour !</span>
          </div>
        } @else {
          <!-- Grouped by Date -->
          @for (group of groupedNotifications(); track group.label) {
            <div class="date-group">
              <span class="group-label">{{ group.label }}</span>
              <div class="group-line"></div>
            </div>
            @for (n of group.items; track n.id) {
              <div class="notif-item" [class.unread]="!n.lu" (click)="onNotifClick(n)">
                <div class="notif-status">
                   @if (!n.lu) { <div class="blue-dot"></div> }
                </div>
                <div class="notif-icon-container" [class]="n.type.toLowerCase()">
                  <lucide-icon [name]="getIcon(n.type)" size="18"></lucide-icon>
                </div>
                <div class="notif-body">
                  <div class="notif-top">
                    <span class="notif-item-title">{{ n.titre }}</span>
                    <span class="notif-time">{{ formatTime(n.date) }}</span>
                  </div>
                  <p class="notif-message">{{ n.message }}</p>
                  @if (n.tag) {
                    <span class="notif-tag-pill" [class]="n.type.toLowerCase()">{{ n.tag }}</span>
                  }
                </div>
              </div>
            }
          }
        }
      </div>

      <!-- Footer -->
      <div class="notif-footer">
        <a [routerLink]="['/app/notifications']" (click)="close.emit()" class="footer-link-main">
          Voir tout l'historique
        </a>
        <button (click)="clearAll()" class="clear-all-btn">Effacer tout</button>
      </div>
    </div>
  `,
  styles: [`
    .notif-panel {
      position: absolute;
      top: calc(100% + 12px);
      right: 0;
      width: 380px;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 20px 50px -12px rgba(0,0,0,0.15);
      border: 1px solid #e2e8f0;
      z-index: 2000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: panel-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    :host-context(.dark) .notif-panel {
      background: #1a1f2e;
      border-color: #2d3548;
      box-shadow: 0 20px 50px -12px rgba(0,0,0,0.4);
    }

    @keyframes panel-in {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Header */
    .notif-header {
      padding: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #fff;
    }
    :host-context(.dark) .notif-header { background: #1a1f2e; }

    .header-left { display: flex; align-items: center; gap: 10px; }

    .notif-title {
      font-size: 18px;
      font-weight: 800;
      color: #1e293b;
      margin: 0;
    }
    :host-context(.dark) .notif-title { color: #f8fafc; }

    .unread-pill {
      background: #EEEDFE;
      color: #534AB7;
      padding: 2px 10px;
      border-radius: 100px;
      font-size: 11px;
      font-weight: 700;
    }
    :host-context(.dark) .unread-pill { background: rgba(83, 74, 183, 0.2); }

    .mark-all-btn {
      font-size: 13px;
      font-weight: 700;
      color: #534AB7;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .mark-all-btn:hover:not(:disabled) { transform: translateY(-1px); opacity: 0.8; }
    .mark-all-btn:disabled { color: #94a3b8; cursor: default; }

    /* Filter Tabs */
    .filter-tabs {
      display: flex;
      padding: 0 16px;
      border-bottom: 1px solid #f1f5f9;
      gap: 20px;
    }
    :host-context(.dark) .filter-tabs { border-color: #2d3548; }

    .filter-tabs button {
      padding: 12px 4px;
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-tabs button.active {
      color: #534AB7;
      border-bottom-color: #534AB7;
    }
    :host-context(.dark) .filter-tabs button.active { color: #818cf8; border-bottom-color: #818cf8; }

    /* List */
    .notif-list {
      max-height: 480px;
      overflow-y: auto;
      padding: 16px 0;
    }

    .date-group {
      padding: 12px 20px 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .group-label {
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .group-line { flex: 1; height: 1px; background: #f1f5f9; }
    :host-context(.dark) .group-line { background: #2d3548; }

    /* Items */
    .notif-item {
      padding: 16px 20px;
      display: flex;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }
    .notif-item:hover { background: #f8fafc; }
    :host-context(.dark) .notif-item:hover { background: rgba(255,255,255,0.03); }

    .notif-item.unread { background: #EEEDFE22; }
    :host-context(.dark) .notif-item.unread { background: rgba(83, 74, 183, 0.05); }

    .notif-status { width: 8px; display: flex; align-items: center; justify-content: center; }
    .blue-dot {
      width: 8px;
      height: 8px;
      background: #534AB7;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(83, 74, 183, 0.4);
    }

    .notif-icon-container {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* Colors */
    .conge_approuve, .autorisation_approuvee { background: #ecfdf5; color: #10b981; }
    .conge_refuse { background: #fef2f2; color: #ef4444; }
    .teletravail_approuve { background: #f5f3ff; color: #8b5cf6; }
    .validation_requise { background: #fffbeb; color: #f59e0b; }
    .nouvel_employe { background: #f5f3ff; color: #534AB7; }

    :host-context(.dark) .conge_approuve { background: rgba(16, 185, 129, 0.15); }
    :host-context(.dark) .conge_refuse { background: rgba(239, 68, 68, 0.15); }
    :host-context(.dark) .teletravail_approuve { background: rgba(139, 92, 246, 0.15); }
    :host-context(.dark) .validation_requise { background: rgba(245, 158, 11, 0.15); }

    .notif-body { flex: 1; min-width: 0; }

    .notif-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .notif-item-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
    }
    :host-context(.dark) .notif-item-title { color: #f1f5f9; }

    .notif-time { font-size: 11px; color: #94a3b8; font-weight: 500; }

    .notif-message {
      font-size: 13px;
      color: #64748b;
      margin: 0 0 8px;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    :host-context(.dark) .notif-message { color: #94a3b8; }

    .notif-tag-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .notif-tag-pill.conge_approuve, .notif-tag-pill.conge_refuse { background: rgba(16, 185, 129, 0.1); color: #059669; }
    .notif-tag-pill.conge_refuse { background: rgba(239, 68, 68, 0.1); color: #dc2626; }
    .notif-tag-pill.validation_requise { background: rgba(245, 158, 11, 0.1); color: #d97706; }
    .notif-tag-pill.teletravail_approuve, .notif-tag-pill.nouvel_employe { background: rgba(83, 74, 183, 0.1); color: #534AB7; }

    /* Footer */
    .notif-footer {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8fafc;
      border-top: 1px solid #f1f5f9;
    }
    :host-context(.dark) .notif-footer { background: #1a1f2e; border-color: #2d3548; }

    .footer-link-main {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      text-decoration: none;
      transition: color 0.2s;
    }
    .footer-link-main:hover { color: #534AB7; }
    :host-context(.dark) .footer-link-main { color: #94a3b8; }

    .clear-all-btn {
      font-size: 12px;
      font-weight: 600;
      color: #ef4444;
      background: transparent;
      border: none;
      cursor: pointer;
    }

    /* Empty State */
    .empty-state {
      padding: 60px 40px;
      text-align: center;
    }
    .empty-illustration {
      width: 100px;
      height: 100px;
      background: #EEEDFE;
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #534AB7;
    }
    :host-context(.dark) .empty-illustration { background: rgba(83, 74, 183, 0.1); }
    
    .empty-state p { font-size: 16px; font-weight: 800; color: #1e293b; margin: 0; }
    .empty-sub { font-size: 13px; color: #94a3b8; }
    :host-context(.dark) .empty-state p { color: #f8fafc; }

    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
    :host-context(.dark) .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
  `]
})
export class NotificationDropdownComponent implements OnInit {
  private notificationService = inject(NotificationService);
  
  @Output() close = new EventEmitter<void>();

  activeFilter = signal<'ALL' | 'UNREAD' | 'ACTIONS'>('ALL');
  
  notifications = this.notificationService.notifications;
  unreadCount = this.notificationService.unreadCount;

  ngOnInit(): void {
    this.notificationService.getNotifications().subscribe();
  }

  filteredNotifications = computed(() => {
    const list = this.notifications();
    const filter = this.activeFilter();
    
    if (filter === 'UNREAD') return list.filter(n => !n.lu);
    if (filter === 'ACTIONS') return list.filter(n => 
      n.type === 'CONGE_SOUMIS' || 
      n.type === 'CONGE_VALIDATION_RH' || 
      n.type === 'USER_PENDING'
    );
    return list;
  });

  groupedNotifications = computed(() => {
    const list = this.filteredNotifications();
    const groups: { label: string, items: Notification[] }[] = [];
    
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    
    const todayItems = list.filter(n => new Date(n.date).toDateString() === today.toDateString());
    const yesterdayItems = list.filter(n => new Date(n.date).toDateString() === yesterday.toDateString());
    const olderItems = list.filter(n => {
      const d = new Date(n.date);
      return d.toDateString() !== today.toDateString() && d.toDateString() !== yesterday.toDateString();
    });

    if (todayItems.length > 0) groups.push({ label: "Aujourd'hui", items: todayItems });
    if (yesterdayItems.length > 0) groups.push({ label: "Hier", items: yesterdayItems });
    if (olderItems.length > 0) groups.push({ label: "Cette semaine", items: olderItems });

    return groups;
  });

  getIcon(type: string): string {
    switch(type) {
      case 'CONGE_APPROUVE': return 'check-circle';
      case 'CONGE_REFUSE': return 'x-circle';
      case 'CONGE_SOUMIS':
      case 'CONGE_VALIDATION_RH': return 'clock';
      case 'USER_PENDING': return 'user-plus';
      case 'ACCOUNT_ACTIVATED': return 'user-check';
      case 'ACCOUNT_REJECTED': return 'user-x';
      case 'TELETRAVAIL_SOUMIS':
      case 'TELETRAVAIL_VALIDATION_RH': return 'clock';
      case 'TELETRAVAIL_APPROUVE': return 'check-circle';
      case 'TELETRAVAIL_REFUSE': return 'x-circle';
      case 'RETARD_EMPLOYE':
      case 'RETARD_MEMBRE': return 'alert-triangle';
      default: return 'bell';
    }
  }

  formatTime(date: Date): string {
    const d = new Date(date);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  clearAll(): void {
    this.notificationService.clearAll();
  }

  onNotifClick(n: Notification): void {
    this.notificationService.navigateToNotification(n);
    this.close.emit();
  }
}
