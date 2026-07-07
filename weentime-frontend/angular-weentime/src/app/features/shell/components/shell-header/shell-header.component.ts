import { Component, inject, signal, computed, ChangeDetectionStrategy, effect, HostListener, ViewContainerRef, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { PointageService } from '../../../../features/employee/pointage/pointage.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { CommunicationStoreService } from '@app/features/communication/services/communication-store.service';
import { NotificationDropdownComponent } from '../notification-dropdown/notification-dropdown.component';
import { environment } from '../../../../../environments/environment';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

export function getRouteTitle(router: Router): string {
  let route = router.routerState.root;
  let title = 'Tableau de bord';
  while (route.firstChild) {
    route = route.firstChild;
    if (route.snapshot.data['title']) {
      title = route.snapshot.data['title'] as string;
    }
  }
  return title;
}

@Component({
  selector: 'app-shell-header',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, NotificationDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="shell-header">
      <div class="header-left">
        <div class="breadcrumb">
          @if (pageTitle() === 'Tableau de bord') {
            <span class="bc-root">WeenTime</span>
            <lucide-icon name="chevron-right" size="14" class="bc-separator"></lucide-icon>
            <span class="bc-current" [class.bc-active]="true">Tableau de bord</span>
          } @else {
            <a [routerLink]="['/app', userRole(), 'dashboard']" class="bc-root hover:text-[#6366f1] transition-colors">Tableau de bord</a>
            <lucide-icon name="chevron-right" size="14" class="bc-separator"></lucide-icon>
            <span class="bc-current" [class.bc-active]="true">{{ pageTitle() }}</span>
          }
        </div>
      </div>

      <div class="header-center hidden md:flex">
        <div class="search-bar">
          <lucide-icon name="search" size="16" class="search-icon"></lucide-icon>
          <input type="text" placeholder="Recherche globale... (Ctrl+K)" class="search-input" />
          <kbd class="global-search-kbd">Ctrl K</kbd>
        </div>
      </div>

      <div class="header-right">
        <!-- Live User Status Section -->
        <div class="status-section">
          <button [routerLink]="['/app', userRole(), 'pointage']"
                  class="live-status-pill"
                  [class.is-active]="isPointageActive()"
                  [attr.data-tooltip]="isPointageActive() ? 'Session en cours' : 'Hors session'">
            <div class="status-indicator">
              <div class="status-dot"></div>
              @if (isPointageActive()) {
                <div class="status-pulse"></div>
              }
            </div>
            <span class="status-text">{{ isPointageActive() ? 'En activité' : 'Non pointé' }}</span>
            @if (isPointageActive()) {
              <span class="status-timer">{{ pointageService.sessionDuration() }}</span>
            }
          </button>
        </div>

        <div class="header-divider"></div>

        <!-- System Actions & Profile Group -->
        <div class="actions-section">
          <div class="system-controls">
            <button (click)="themeService.toggleTheme()" class="action-btn" data-tooltip="Thème">
              <lucide-icon [name]="themeService.isDark() ? 'sun' : 'moon'" size="18"></lucide-icon>
            </button>

            @if (showMessaging()) {
              <a routerLink="/app/messages" class="action-btn" [class.has-badge]="communicationUnreadTotal() > 0" data-tooltip="Messages">
                <lucide-icon name="message-square" size="18"></lucide-icon>
                @if (communicationUnreadTotal() > 0) {
                  <span class="btn-badge">{{ communicationUnreadTotal() > 9 ? '9+' : communicationUnreadTotal() }}</span>
                }
              </a>

              <div class="notif-container">
                <button
                  type="button"
                  (click)="toggleNotifications($event)"
                  class="action-btn"
                  [class.has-badge]="unreadCount() > 0"
                  [class.shake]="shakeBell()"
                  [attr.aria-expanded]="notifOpen()"
                  aria-haspopup="dialog"
                  data-tooltip="Notifications">
                  <lucide-icon name="bell" size="18"></lucide-icon>
                  @if (unreadCount() > 0) {
                    <span class="btn-badge btn-badge--danger">{{ unreadCount() > 9 ? '9+' : unreadCount() }}</span>
                  }
                </button>
                @if (notifOpen()) {
                  <app-notification-dropdown (close)="notifOpen.set(false)"></app-notification-dropdown>
                }
              </div>
            }
          </div>

          <div class="profile-trigger-wrapper user-dropdown-wrapper">
             <button (click)="dropdownOpen.set(!dropdownOpen())" class="profile-trigger">
                <div class="avatar-box" [style.background]="avatarColor()">
                  {{ initials() }}
                </div>
                <lucide-icon name="chevron-down" size="14" class="trigger-arrow" [class.rotated]="dropdownOpen()"></lucide-icon>
             </button>

             @if (dropdownOpen()) {
               <div class="user-dropdown-menu">
                 <div class="menu-header">
                   <strong>{{ fullName() }}</strong>
                   <span>{{ roleLabel() }}</span>
                 </div>
                 <div class="menu-divider"></div>
                 <a [routerLink]="profileRoute()" class="menu-item" (click)="dropdownOpen.set(false)">
                   <lucide-icon name="user" size="16"></lucide-icon>
                   Mon Profil
                 </a>
                 <button class="menu-item text-red-500" (click)="onLogout()">
                   <lucide-icon name="log-out" size="16"></lucide-icon>
                   Déconnexion
                 </button>
               </div>
             }
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    :host { display: block; height: 56px; overflow: visible; }

    .shell-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      background: #ffffff;
      border-bottom: 1px solid #E5E7EB;
      box-shadow: 0 1px 0 #E5E7EB;
      height: 56px;
      position: relative;
      z-index: 50;
    }

    .notif-container {
      position: relative;
      display: flex;
      align-items: center;
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
      padding: 0 60px 0 38px;
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

    .global-search-kbd {
      position: absolute;
      right: 12px;
      padding: 2px 6px;
      background: #ffffff;
      border: 1px solid rgba(226, 232, 240, 0.8);
      border-radius: 4px;
      font-size: 10px;
      color: #94a3b8;
      font-family: monospace;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    :host-context(.dark) .global-search-kbd {
      background: #1e293b;
      border-color: rgba(45, 53, 72, 0.8);
      color: #64748b;
    }

    a.bc-root {
      text-decoration: none;
      transition: color var(--transition-fast, 0.2s);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .header-divider {
      width: 1px;
      height: 24px;
      background: var(--border);
    }

    /* --- Status Section --- */
    .live-status-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      border-radius: 100px;
      background: var(--surface-alt);
      border: 1px solid var(--border);
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .live-status-pill:hover {
      background: var(--surface);
      border-color: var(--primary-light);
      transform: translateY(-1px);
    }

    .live-status-pill.is-active {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.2);
    }

    .status-indicator {
      position: relative;
      width: 8px;
      height: 8px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: var(--muted-light);
      border-radius: 50%;
    }

    .is-active .status-dot {
      background: var(--accent);
    }

    .status-pulse {
      position: absolute;
      inset: 0;
      background: var(--accent);
      border-radius: 50%;
      animation: status-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    }

    @keyframes status-ping {
      75%, 100% { transform: scale(3); opacity: 0; }
    }

    .status-text {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-secondary);
    }

    .is-active .status-text {
      color: var(--accent-dark);
    }

    .status-timer {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-dark);
      padding-left: 8px;
      border-left: 1px solid rgba(16, 185, 129, 0.2);
    }

    /* --- Actions Section --- */
    .actions-section {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .system-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-right: 16px;
      border-right: 1px solid var(--border);
    }

    .action-btn {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      cursor: pointer;
      position: relative;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: var(--surface-alt);
      color: var(--primary);
      transform: translateY(-1px);
    }

    .btn-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      background: var(--primary);
      color: white;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--surface);
    }

    .btn-badge--danger {
      background: var(--danger);
    }

    .action-btn.shake {
      animation: bell-shake 0.5s ease both;
    }

    /* --- Profile Section --- */
    .profile-trigger {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px;
      border-radius: 14px;
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .profile-trigger:hover {
      background: var(--surface-alt);
      border-color: var(--border);
    }

    .avatar-box {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .trigger-arrow {
      color: var(--text-tertiary);
      transition: transform 0.2s ease;
    }

    .trigger-arrow.rotated {
      transform: rotate(180deg);
    }

    .user-dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 220px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow-xl);
      padding: 8px;
      z-index: 1000;
      animation: slide-up-fade 0.2s ease;
    }

    .menu-header {
      padding: 12px;
      display: flex;
      flex-direction: column;
    }

    .menu-header strong {
      display: block;
      font-size: 14px;
      color: var(--text-primary);
    }

    .menu-header span {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .menu-divider {
      height: 1px;
      background: var(--border);
      margin: 4px 0;
    }

    .menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: none;
      background: transparent;
      transition: all 0.15s ease;
    }

    .menu-item:hover {
      background: var(--surface-alt);
      color: var(--primary);
    }

    @keyframes slide-up-fade {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .notif-container {
      position: relative;
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
      border: 1px solid var(--border);
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
        padding: 0 16px 0 56px;
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

    @keyframes bell-shake {
      0%, 100% { transform: rotate(0); }
      20%, 60% { transform: rotate(10deg); }
      40%, 80% { transform: rotate(-10deg); }
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
  private communicationStore = inject(CommunicationStoreService);
  themeService = inject(ThemeService);
  pointageService = inject(PointageService);

  isPointageActive = this.pointageService.isCheckedIn;
  dropdownOpen = signal(false);
  notifOpen = signal(false);
  shakeBell = signal(false);

  unreadCount = this.notificationService.unreadCount;
  communicationUnreadTotal = this.communicationStore.totalUnread;

  readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => getRouteTitle(this.router))
    ),
    { initialValue: getRouteTitle(inject(Router)) }
  );

  userRole = computed(() => {
    const user = this.authService.currentUser();
    const role = this.normalizeRole(user?.role);
    if (role === 'EMPLOYEE') return 'employee';
    if (role === 'MANAGER') return 'manager';
    if (role === 'RH') return 'rh';
    if (role === 'ADMIN') return 'admin';
    return 'employee';
  });

  readonly isAdmin = computed(() => this.authService.hasRole('ADMIN'));

  readonly showMessaging = computed(() => {
    const user = this.authService.currentUser();
    return user?.entrepriseId != null;
  });

  constructor() {
    this.communicationStore.bootstrapUnreadTracking();
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

  readonly fullName = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return 'Utilisateur';
    return `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.email;
  });

  readonly roleLabel = computed(() => {
    const role = this.userRole();
    switch (role) {
      case 'admin': return 'Administrateur';
      case 'rh': return 'Responsable RH';
      case 'manager': return 'Manager d\'équipe';
      default: return 'Collaborateur';
    }
  });

  onLogout(): void {
    this.authService.logout();
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    const nextOpen = !this.notifOpen();
    this.dropdownOpen.set(false);
    this.notifOpen.set(nextOpen);

    if (!environment.production) {
      console.debug('[Notifications] Bell click fired', {
        open: nextOpen,
        unreadCount: this.unreadCount()
      });
    }

    if (nextOpen) {
      this.notificationService.getNotifications().subscribe();
    }
  }

  private normalizeRole(role: string | null | undefined): string {
    const normalized = String(role ?? '').trim().toUpperCase();
    return normalized.startsWith('ROLE_') ? normalized.substring('ROLE_'.length) : normalized;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // FIX: utiliser composedPath pour eviter les faux positifs
    // et ne traiter que si un menu est ouvert
    if (!this.notifOpen() && !this.dropdownOpen()) {
      return;
    }

    const path = event.composedPath() as HTMLElement[];
    const isInsideNotif = path.some(el =>
      el?.classList?.contains?.('notif-container')
      || el?.classList?.contains?.('notif-panel')
      || (typeof el?.tagName === 'string' && el.tagName.toLowerCase() === 'app-notification-dropdown')
    );
    const isInsideDropdown = path.some(el => el?.classList?.contains?.('user-dropdown-wrapper'));

    if (this.notifOpen() && !isInsideNotif) {
      this.notifOpen.set(false);
    }

    if (this.dropdownOpen() && !isInsideDropdown) {
      this.dropdownOpen.set(false);
    }
  }
}
