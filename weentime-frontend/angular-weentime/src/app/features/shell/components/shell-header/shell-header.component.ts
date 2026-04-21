import { Component, inject, signal, computed, ChangeDetectionStrategy, effect, HostListener, ViewContainerRef, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { PointageService } from '../../../../features/employee/pointage/pointage.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { NotificationDropdownComponent } from '../notification-dropdown/notification-dropdown.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

@Component({
  selector: 'app-shell-header',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, NotificationDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="shell-header">
      <div class="header-left">
        <div class="breadcrumb">
          <span class="bc-root">Weentime</span>
          <lucide-icon name="chevron-right" size="14" class="bc-separator"></lucide-icon>
          <span class="bc-current" [class.bc-active]="true">{{ pageTitle() }}</span>
        </div>
      </div>

      <div class="header-center hidden md:flex">
        <div class="search-bar">
          <lucide-icon name="search" size="16" class="search-icon"></lucide-icon>
          <input type="text" placeholder="Rechercher…" class="search-input" />
        </div>
      </div>

      <div class="header-right">
        <!-- Pointage Status Pill -->
        <button [routerLink]="['/app', userRole(), 'pointage']"
                class="pointage-status-pill group"
                [class.active]="isPointageActive()"
                [attr.data-tooltip]="isPointageActive() ? 'Session active' : 'Pointer maintenant'">
          @if (isPointageActive()) {
            <div class="pulse-dot"></div>
            <lucide-icon name="zap" size="16" class="status-icon" [strokeWidth]="2.5"></lucide-icon>
            <span class="status-label">Pointé</span>
            <span class="status-timer hidden sm:inline-block">{{ pointageService.sessionDuration() }}</span>
          } @else {
            <lucide-icon name="play" size="16" class="status-icon" [strokeWidth]="2.5"></lucide-icon>
            <span class="status-label text-xs sm:text-sm">Non pointé</span>
          }
        </button>

        <div class="system-group">
          <!-- Dark mode toggle -->
          <button (click)="themeService.toggleTheme()" class="icon-btn" data-tooltip="Changer le thème">
            <lucide-icon [name]="themeService.isDark() ? 'sun' : 'moon'" size="18" [strokeWidth]="2"></lucide-icon>
          </button>

          <!-- Notifications -->
          <div class="notif-wrapper">
            <button (click)="notifOpen.set(!notifOpen())"
                    class="icon-btn notif-btn"
                    [class.has-unread]="unreadCount() > 0"
                    [class.bell-shake]="shakeBell()"
                    data-tooltip="Notifications">
              <lucide-icon name="bell" size="18" [strokeWidth]="2"></lucide-icon>
              @if (unreadCount() > 0) {
                <span class="notif-badge">{{ unreadCount() > 9 ? '9+' : unreadCount() }}</span>
              }
            </button>

            @if (notifOpen()) {
              <app-notification-dropdown (close)="notifOpen.set(false)"></app-notification-dropdown>
            }
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; height: 72px; overflow: visible; }

    .shell-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      height: 72px;
      position: relative;
      z-index: 50; /* FIX: au-dessus du contenu mais ne bloque pas les clics en dessous */
    }

    :host-context(.dark) .shell-header {
      background: rgba(9, 17, 31, 0.82);
    }

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .header-left { display: flex; align-items: center; }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bc-root {
      font-size: 14px;
      font-weight: 600;
      color: #64748b;
    }

    .bc-separator {
      color: #cbd5e1;
    }

    .bc-current {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }

    .bc-active {
      color: #6366f1;
    }

    :host-context(.dark) .bc-root { color: #94a3b8; }
    :host-context(.dark) .bc-current { color: #f8fafc; }
    :host-context(.dark) .bc-active { color: #818cf8; }

    .header-center {
      flex: 1;
      max-width: 400px;
      margin: 0 40px;
    }

    .search-bar {
      width: 100%;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      color: #94a3b8;
    }

    .search-input {
      width: 100%;
      height: 38px;
      padding: 0 16px 0 38px;
      border-radius: 12px;
      border: 1px solid rgba(226, 232, 240, 0.8);
      background: rgba(243, 244, 246, 0.4);
      backdrop-filter: blur(4px);
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
      outline: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .search-input:focus {
      border-color: #6366f1;
      background: #fff;
      box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.08);
      transform: translateY(-1px);
    }

    :host-context(.dark) .search-input {
      background: rgba(26, 31, 46, 0.4);
      border-color: rgba(45, 53, 72, 0.8);
      color: #f1f5f9;
    }

    :host-context(.dark) .search-input:focus {
      border-color: #818cf8;
      background: #0f1117;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .system-group {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-left: 12px;
      margin-left: 4px;
      border-left: 1px solid rgba(226, 232, 240, 0.8);
    }

    :host-context(.dark) .system-group {
      border-left-color: rgba(45, 53, 72, 0.8);
    }

    .icon-btn {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: transparent;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      transition: all 0.25s ease;
      position: relative;
    }

    .icon-btn:hover {
      background: rgba(0, 0, 0, 0.04);
      color: #1e1b4b;
      transform: translateY(-1px);
    }

    :host-context(.dark) .icon-btn {
      color: #94a3b8;
    }

    :host-context(.dark) .icon-btn:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #f8fafc;
    }

    /* Minimalist Tooltip */
    .icon-btn::after, .pointage-status-pill::after {
      content: attr(data-tooltip);
      position: absolute;
      top: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      background: #0f172a;
      color: #ffffff;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .icon-btn:hover::after, .pointage-status-pill:hover::after {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }

    /* Pointage Status Pill */
    .pointage-status-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      height: 38px;
      outline: none;
    }

    .pointage-status-pill:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      transform: translateY(-1px);
    }

    .pointage-status-pill.active {
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.3);
      color: #059669;
      padding-right: 16px;
    }

    .pointage-status-pill.active:hover {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      position: relative;
    }

    .pulse-dot::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: inherit;
      animation: status-pulse 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
    }

    @keyframes status-pulse {
      0% { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(2.8); opacity: 0; }
    }

    .status-timer {
      font-family: 'JetBrains Mono', 'Monaco', monospace;
      font-size: 12px;
      font-weight: 600;
      padding-left: 10px;
      border-left: 1px solid rgba(5, 150, 105, 0.2);
    }

    :host-context(.dark) .pointage-status-pill {
      background: #1a1f2e;
      border-color: #2d3548;
      color: #94a3b8;
    }

    :host-context(.dark) .pointage-status-pill:hover {
      background: #2d3548;
      color: #e2e8f0;
    }

    :host-context(.dark) .pointage-status-pill.active {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }

    .notif-wrapper { position: relative; }
    .notif-btn { position: relative; }

    .notif-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      min-width: 15px;
      height: 15px;
      background: #534AB7;
      color: white;
      border-radius: 500px;
      font-size: 9px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border: 2px solid #fff;
    }

    :host-context(.dark) .notif-badge {
      border-color: #0f1117;
    }

    .bell-shake {
      animation: bell-shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
    }

    @keyframes bell-shake {
      0%, 100% { transform: rotate(0); }
      20%, 60% { transform: rotate(15deg); }
      40%, 80% { transform: rotate(-15deg); }
    }

    .notification-count {
      position: absolute;
      top: -6px;
      right: -6px;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: #ef4444;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      box-shadow: 0 10px 20px rgba(239, 68, 68, 0.25);
      animation: badge-pulse 1.8s ease-in-out infinite;
    }

    .notification-btn.has-unread {
      color: #0f172a;
      border-color: rgba(239, 68, 68, 0.24);
      box-shadow: 0 14px 28px rgba(239, 68, 68, 0.12);
      animation: bell-wiggle 2.8s ease-in-out infinite;
    }

    .notification-popover {
      width: min(420px, calc(100vw - 32px));
      padding: 12px;
      animation: popover-slide-in 0.2s ease;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    }

    .popover-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 8px 10px;
    }

    .popover-head strong {
      color: #0f172a;
      font-size: 0.95rem;
    }

    .popover-head p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 0.8rem;
    }

    .text-btn {
      border: none;
      background: none;
      color: #1d4ed8;
      font-size: 0.8rem;
      font-weight: 800;
      cursor: pointer;
    }

    .quick-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 999px;
      background: rgba(20, 184, 166, 0.12);
      color: #0f766e;
      font-size: 0.78rem;
      font-weight: 800;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.36);
      animation: pulse 1.8s infinite;
    }

    .user-trigger {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px 4px 4px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .header-avatar {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .header-avatar-img {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      object-fit: cover;
      border: 2px solid #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    :host-context(.dark) .header-avatar-img {
      border-color: #1e293b;
    }

    .dd-chevron {
      color: #94a3b8;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dd-chevron.rotated {
      transform: rotate(180deg);
    }

    .dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 210px;
      padding: 6px;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #ffffff;
      box-shadow: 0 10px 40px rgba(0,0,0,0.12);
      z-index: 1000;
      animation: dropdown-in 0.15s ease;
    }

    .dd-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-radius: 10px;
      background: none;
      color: #0f172a;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .dd-danger {
      color: #ef4444;
    }

    .dd-danger:hover {
      background: rgba(239, 68, 68, 0.08);
    }

    @media (max-width: 900px) {
      .quick-status {
        display: none;
      }

      .admin-search {
        width: min(280px, 46vw);
      }
    }

    @media (max-width: 768px) {
      .shell-header {
        padding: 12px 16px 12px 56px;
      }

      .admin-search {
        display: none;
      }
    }

    @keyframes dropdown-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes popover-slide-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes pulse {
      70% { box-shadow: 0 0 0 10px rgba(20, 184, 166, 0); }
    }

    @keyframes badge-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }

    @keyframes bell-wiggle {
      0%, 85%, 100% { transform: rotate(0deg); }
      88% { transform: rotate(-12deg); }
      91% { transform: rotate(10deg); }
      94% { transform: rotate(-6deg); }
      97% { transform: rotate(4deg); }
    }

    /*** Global overlay styles ***/
    ::ng-deep .notification-overlay-pane {
      z-index: 9999 !important;
    }
  `]
})
export class ShellHeaderComponent {
  public authService = inject(AuthService);
  private router = inject(Router);
  private notificationService = inject(NotificationService);
  themeService = inject(ThemeService);
  pointageService = inject(PointageService);

  isPointageActive = this.pointageService.isCheckedIn;
  dropdownOpen = signal(false);
  notifOpen = signal(false);
  shakeBell = signal(false);

  unreadCount = this.notificationService.unreadCount;

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.root;
        let title = 'Tableau de bord';

        while (route.firstChild) {
          route = route.firstChild;
          if (route.snapshot.data['title']) {
            title = route.snapshot.data['title'] as string;
          }
        }

        return title;
      })
    ),
    { initialValue: 'Tableau de bord' }
  );

  userRole = computed(() => {
    const role = this.authService.currentUser()?.roles?.[0] ?? '';
    if (role === 'ROLE_EMPLOYEE') return 'employee';
    if (role === 'ROLE_MANAGER') return 'manager';
    if (role === 'ROLE_RH') return 'rh';
    if (role === 'ROLE_ADMIN') return 'admin';
    return 'employee';
  });

  readonly isAdmin = computed(() => this.authService.currentUser()?.roles?.includes('ROLE_ADMIN') ?? false);

  constructor() {
    // Effet pour déclencher le shake quand le nombre de notifs augmente
    effect(() => {
      const count = this.unreadCount();
      if (count > 0) {
        this.shakeBell.set(true);
        setTimeout(() => this.shakeBell.set(false), 500);
      }
    });
  }

  readonly profileRoute = computed(() => `/app/${this.userRole()}/profil`);

  readonly initials = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return '?';

    const first = user.prenom?.[0]?.toUpperCase() ?? '';
    const last = user.nom?.[0]?.toUpperCase() ?? '';
    return (first + last) || user.email[0].toUpperCase();
  });

  readonly avatarColor = computed(() => {
    const colors = ['#2563eb', '#0f766e', '#7c3aed', '#db2777', '#f59e0b', '#ef4444'];
    const user = this.authService.currentUser();
    const name = user ? `${user.prenom ?? ''}${user.nom ?? ''}` : '';
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
      hash = name.charCodeAt(index) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  });

  onLogout(): void {
    this.authService.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // FIX: utiliser composedPath pour eviter les faux positifs
    // et ne traiter que si un menu est ouvert
    if (!this.notifOpen() && !this.dropdownOpen()) {
      return;
    }

    const path = event.composedPath() as HTMLElement[];
    const isInsideNotif = path.some(el => el?.classList?.contains?.('notif-wrapper'));
    const isInsideDropdown = path.some(el => el?.classList?.contains?.('user-dropdown-wrapper'));

    if (this.notifOpen() && !isInsideNotif) {
      this.notifOpen.set(false);
    }

    if (this.dropdownOpen() && !isInsideDropdown) {
      this.dropdownOpen.set(false);
    }
  }
}
