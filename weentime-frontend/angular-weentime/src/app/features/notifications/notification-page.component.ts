import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { NotificationService, Notification, NotificationType } from '../../core/services/notification.service';

@Component({
  selector: 'app-notification-page',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <div class="notifications-page">
      <!-- Header Section -->
      <header class="page-header">
        <div class="header-content">
          <div class="header-text">
            <h1 class="title">Centre de notifications</h1>
            <p class="subtitle">Suivez l'activité de votre espace de travail et gérez vos alertes</p>
          </div>
          <div class="header-actions">
            <button (click)="markAllAsRead()" class="btn-ghost" [disabled]="unreadCount() === 0">
              <lucide-icon name="check-check" size="18"></lucide-icon>
              Tout marquer comme lu
            </button>
            <button (click)="clearAll()" class="btn-danger-ghost">
              <lucide-icon name="trash-2" size="18"></lucide-icon>
              Effacer tout
            </button>
          </div>
        </div>
      </header>

      <div class="page-grid">
        <!-- Sidebar Filters -->
        <aside class="sidebar">
          <div class="filter-card">
            <div class="filter-section">
              <h3 class="filter-title">État</h3>
              <div class="filter-options">
                <button (click)="statusFilter.set('all')" [class.active]="statusFilter() === 'all'" class="filter-btn">
                   Toutes
                </button>
                <button (click)="statusFilter.set('unread')" [class.active]="statusFilter() === 'unread'" class="filter-btn">
                   Non lues
                   @if (unreadCount() > 0) { <span class="badge">{{ unreadCount() }}</span> }
                </button>
              </div>
            </div>

            <div class="filter-divider"></div>

            <div class="filter-section">
              <h3 class="filter-title">Catégories</h3>
              <div class="categories-list">
                <button (click)="typeFilter.set(null)" [class.active]="typeFilter() === null" class="cat-btn">
                  <div class="cat-icon-box all"> <lucide-icon name="layers" size="16"></lucide-icon> </div>
                  Toutes les notifications
                </button>
                @for (type of availableTypes; track type) {
                  <button (click)="typeFilter.set(type)" [class.active]="typeFilter() === type" class="cat-btn">
                    <div class="cat-icon-box" [class]="type.toLowerCase()"> <lucide-icon [name]="getIcon(type)" size="16"></lucide-icon> </div>
                    {{ formatTypeName(type) }}
                  </button>
                }
              </div>
            </div>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="main-content">
          @if (filteredNotifications().length === 0) {
            <div class="empty-state">
              <div class="empty-illustration">
                <lucide-icon name="bell-off" size="64"></lucide-icon>
              </div>
              <h2>Silence radio !</h2>
              <p>Vous n'avez aucune notification correspondant à ces critères.</p>
              <button (click)="resetFilters()" class="btn-primary-simple">Réinitialiser les filtres</button>
            </div>
          } @else {
            @for (group of groupedNotifications(); track group.dateLabel) {
              <div class="date-group">
                <div class="date-header">
                  <span class="date-label">{{ group.dateLabel }}</span>
                  <div class="line"></div>
                </div>
                
                <div class="notif-cards-list">
                  @for (n of group.items; track n.id) {
                    <div class="notif-card" [class.unread]="!n.lu" (click)="onNotifClick(n)">
                      <div class="card-left">
                        <div class="type-icon-wrapper" [class]="n.type.toLowerCase()">
                          <lucide-icon [name]="getIcon(n.type)" size="22"></lucide-icon>
                        </div>
                      </div>
                      <div class="card-center">
                        <div class="card-meta">
                          <span class="card-tag" [class]="n.type.toLowerCase()">{{ n.tag || formatTypeName(n.type) }}</span>
                          <span class="card-time">{{ n.date | date:'dd MMM yyyy, HH:mm' }}</span>
                        </div>
                        <h4 class="card-title">{{ n.titre }}</h4>
                        <p class="card-description">{{ n.message }}</p>
                      </div>
                      <div class="card-right">
                        @if (!n.lu) {
                          <div class="unread-dot"></div>
                        }
                        <lucide-icon name="chevron-right" size="18" class="arrow-icon"></lucide-icon>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          }
        </main>
      </div>
    </div>
  `,
  styles: [`
    .notifications-page {
      padding: 40px;
      max-width: 1400px;
      margin: 0 auto;
      min-height: 100vh;
    }

    /* Header */
    .page-header { margin-bottom: 40px; }
    .header-content { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
    .title { font-size: 32px; font-weight: 800; color: #1e293b; margin: 0 0 8px; }
    .subtitle { font-size: 16px; color: #64748b; margin: 0; }
    :host-context(.dark) .title { color: #f8fafc; }

    .header-actions { display: flex; gap: 12px; }

    .btn-ghost {
      display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px;
      background: white; border: 1px solid #e2e8f0; color: #475569; font-weight: 700; font-size: 14px;
      cursor: pointer; transition: all 0.2s;
    }
    .btn-ghost:hover:not(:disabled) { border-color: #534AB7; color: #534AB7; background: #EEEDFE; }
    .btn-ghost:disabled { opacity: 0.5; cursor: default; }

    .btn-danger-ghost {
      display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 12px;
      background: white; border: 1px solid #e2e8f0; color: #ef4444; font-weight: 700; font-size: 14px;
      cursor: pointer; transition: all 0.2s;
    }
    .btn-danger-ghost:hover { border-color: #ef4444; background: #fef2f2; }

    :host-context(.dark) .btn-ghost, :host-context(.dark) .btn-danger-ghost {
      background: #1a1f2e; border-color: #2d3548;
    }

    /* Grid Layout */
    .page-grid { display: grid; grid-template-columns: 320px 1fr; gap: 40px; align-items: start; }
    @media (max-width: 1024px) { .page-grid { grid-template-columns: 1fr; } }

    /* Sidebar Filter Card */
    .filter-card {
      background: white; border: 1px solid #e2e8f0; border-radius: 24px; padding: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.03); position: sticky; top: 100px;
    }
    :host-context(.dark) .filter-card { background: #1a1f2e; border-color: #2d3548; }

    .filter-section { margin-bottom: 24px; }
    .filter-divider { height: 1px; background: #f1f5f9; margin: 24px -24px; }
    :host-context(.dark) .filter-divider { background: #2d3548; }

    .filter-title { font-size: 12px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 16px; }

    .filter-options { display: flex; flex-direction: column; gap: 8px; }
    .filter-btn {
      display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;
      border-radius: 12px; border: 1px solid #f1f5f9; background: #f8fafc; color: #64748b;
      font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; text-align: left;
    }
    .filter-btn:hover { border-color: #cbd5e1; color: #1e293b; }
    .filter-btn.active { background: #534AB7; border-color: #534AB7; color: white; }
    .filter-btn .badge { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 6px; font-size: 11px; }

    :host-context(.dark) .filter-btn { background: #1f2937; border-color: #374151; color: #94a3b8; }
    :host-context(.dark) .filter-btn:hover { color: white; border-color: #4b5563; }

    .categories-list { display: flex; flex-direction: column; gap: 4px; }
    .cat-btn {
      display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 12px;
      border: none; background: transparent; color: #475569; font-weight: 600; font-size: 14px;
      cursor: pointer; transition: all 0.2s;
    }
    .cat-btn:hover { background: #f1f5f9; color: #1e293b; }
    .cat-btn.active { background: #EEEDFE; color: #534AB7; }
    
    :host-context(.dark) .cat-btn { color: #94a3b8; }
    :host-context(.dark) .cat-btn:hover { background: #2d3548; color: white; }
    :host-context(.dark) .cat-btn.active { background: rgba(83,74,183,0.15); color: #818cf8; }

    .cat-icon-box {
      width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .cat-icon-box.all { background: #f1f5f9; color: #64748b; }
    .cat-icon-box.conge_approuve, .cat-icon-box.autorisation_approuvee { background: #ecfdf5; color: #10b981; }
    .cat-icon-box.conge_refuse { background: #fef2f2; color: #ef4444; }
    .cat-icon-box.validation_requise { background: #fffbeb; color: #f59e0b; }
    .cat-icon-box.teletravail_approuve, .cat-icon-box.nouvel_employe { background: #f5f3ff; color: #8b5cf6; }

    /* Main Content */
    .date-group { margin-bottom: 40px; }
    .date-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .date-label { font-size: 14px; font-weight: 800; color: #94a3b8; text-transform: uppercase; white-space: nowrap; }
    .date-header .line { flex: 1; height: 1px; background: #e2e8f0; }
    :host-context(.dark) .date-header .line { background: #2d3548; }

    .notif-cards-list { display: flex; flex-direction: column; gap: 16px; }

    .notif-card {
      display: flex; gap: 24px; padding: 24px; background: white; border: 1px solid #e2e8f0; border-radius: 20px;
      cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative;
    }
    .notif-card:hover { transform: translateX(8px); border-color: #534AB7; box-shadow: 0 10px 30px rgba(83, 74, 183, 0.08); }
    .notif-card.unread { background: #534AB703; border-left: 5px solid #534AB7; }
    :host-context(.dark) .notif-card { background: #1a1f2e; border-color: #2d3548; }
    :host-context(.dark) .notif-card.unread { background: rgba(83, 74, 183, 0.04); }

    .type-icon-wrapper {
      width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .type-icon-wrapper.conge_approuve, .type-icon-wrapper.autorisation_approuvee { background: #ecfdf5; color: #059669; }
    .type-icon-wrapper.conge_refuse { background: #fef2f2; color: #dc2626; }
    .type-icon-wrapper.validation_requise { background: #fffbeb; color: #d97706; }
    .type-icon-wrapper.teletravail_approuve, .type-icon-wrapper.nouvel_employe { background: #f5f3ff; color: #534AB7; }

    .card-center { flex: 1; min-width: 0; }
    .card-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .card-tag { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 10px; border-radius: 6px; }
    .card-tag.conge_approuve, .card-tag.autorisation_approuvee { background: #ecfdf5; color: #059669; }
    .card-tag.conge_refuse { background: #fef2f2; color: #dc2626; }
    .card-tag.validation_requise { background: #fffbeb; color: #d97706; }
    .card-tag.teletravail_approuve, .card-tag.nouvel_employe { background: #f5f3ff; color: #534AB7; }

    .card-time { font-size: 13px; color: #94a3b8; font-weight: 500; }
    .card-title { font-size: 18px; font-weight: 700; color: #1e293b; margin: 0 0 6px; }
    :host-context(.dark) .card-title { color: #f1f5f9; }
    .card-description { font-size: 15px; color: #64748b; margin: 0; line-height: 1.6; }
    :host-context(.dark) .card-description { color: #94a3b8; }

    .card-right { display: flex; align-items: center; gap: 16px; }
    .unread-dot { width: 10px; height: 10px; background: #534AB7; border-radius: 50%; box-shadow: 0 0 10px rgba(83,74,183,0.5); align-self: center; }
    .arrow-icon { color: #cbd5e1; align-self: center; transition: transform 0.2s; }
    .notif-card:hover .arrow-icon { transform: translateX(4px); color: #534AB7; }

    /* Empty State */
    .empty-state { padding: 100px 40px; text-align: center; background: white; border-radius: 32px; border: 1px solid #e2e8f0; }
    :host-context(.dark) .empty-state { background: #1a1f2e; border-color: #2d3548; }
    .empty-illustration { width: 120px; height: 120px; background: #EEEDFE; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 32px; color: #534AB7; }
    .empty-state h2 { font-size: 24px; font-weight: 800; color: #1e293b; margin-bottom: 12px; }
    .empty-state p { font-size: 16px; color: #64748b; margin-bottom: 32px; }
    :host-context(.dark) .empty-state h2 { color: white; }

    .btn-primary-simple { background: #534AB7; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: opacity 0.2s; }
    .btn-primary-simple:hover { opacity: 0.9; }
  `]
})
export class NotificationPageComponent {
  private notificationService = inject(NotificationService);

  statusFilter = signal<'all' | 'unread'>('all');
  typeFilter = signal<NotificationType | null>(null);

  unreadCount = this.notificationService.unreadCount;

  availableTypes: NotificationType[] = [
    'CONGE_SOUMIS', 'CONGE_APPROUVE', 'CONGE_REFUSE', 'CONGE_VALIDATION_RH',
    'USER_PENDING', 'ACCOUNT_ACTIVATED', 'ACCOUNT_REJECTED',
    'RETARD_EMPLOYE', 'RETARD_MEMBRE', 'AUTO_CLOSE',
    'TELETRAVAIL_SOUMIS', 'TELETRAVAIL_VALIDATION_RH', 'TELETRAVAIL_APPROUVE', 'TELETRAVAIL_REFUSE',
    'AUTORISATION_APPROUVEE'
  ];

  filteredNotifications = computed(() => {
    let list = this.notificationService.notifications();

    if (this.statusFilter() === 'unread') {
      list = list.filter(n => !n.lu);
    }

    if (this.typeFilter()) {
      list = list.filter(n => n.type === this.typeFilter());
    }

    return list;
  });

  groupedNotifications = computed(() => {
    const groups: { dateLabel: string, items: Notification[] }[] = [];
    const sorted = this.filteredNotifications();

    sorted.forEach(notif => {
      const dateStr = new Date(notif.date).toDateString();
      let label = '';
      
      const now = new Date();
      const yesterday = new Date(); yesterday.setDate(now.getDate() - 1);

      if (dateStr === now.toDateString()) label = "Aujourd'hui";
      else if (dateStr === yesterday.toDateString()) label = "Hier";
      else {
        label = new Intl.DateTimeFormat('fr-FR', {
          day: 'numeric', month: 'long', year: 'numeric'
        }).format(new Date(notif.date));
      }

      let group = groups.find(g => g.dateLabel === label);
      if (!group) {
        group = { dateLabel: label, items: [] };
        groups.push(group);
      }
      group.items.push(notif);
    });

    return groups;
  });

  formatTypeName(type: string): string {
    if (type.startsWith('CONGE')) return 'Congés';
    if (type.startsWith('RETARD') || type === 'AUTO_CLOSE') return 'Présence';
    if (type.startsWith('USER') || type.startsWith('ACCOUNT')) return 'Compte';
    if (type.startsWith('TELETRAVAIL')) return 'Télétravail';
    if (type === 'AUTORISATION_APPROUVEE') return 'Autorisation';
    return 'Alerte';
  }

  getIcon(type: string): string {
    switch (type) {
      case 'CONGE_APPROUVE': return 'check-circle';
      case 'CONGE_REFUSE': return 'x-circle';
      case 'CONGE_SOUMIS':
      case 'CONGE_VALIDATION_RH': return 'clock';
      case 'USER_PENDING': return 'user-plus';
      case 'ACCOUNT_ACTIVATED': return 'user-check';
      case 'ACCOUNT_REJECTED': return 'user-x';
      case 'RETARD_EMPLOYE':
      case 'RETARD_MEMBRE': return 'alert-triangle';
      case 'AUTO_CLOSE': return 'lock';
      case 'TELETRAVAIL_SOUMIS':
      case 'TELETRAVAIL_VALIDATION_RH': return 'clock';
      case 'TELETRAVAIL_APPROUVE': return 'check-circle';
      case 'TELETRAVAIL_REFUSE': return 'x-circle';
      case 'AUTORISATION_APPROUVEE': return 'file-check';
      default: return 'bell';
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  clearAll(): void {
    this.notificationService.clearAll();
  }

  resetFilters(): void {
    this.statusFilter.set('all');
    this.typeFilter.set(null);
  }

  onNotifClick(n: Notification): void {
    this.notificationService.navigateToNotification(n);
  }
}
