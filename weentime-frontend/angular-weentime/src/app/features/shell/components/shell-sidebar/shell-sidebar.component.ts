import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, LayoutDashboard, Clock, Calendar, Timer, Laptop, FolderOpen, Users, ClipboardList, CheckCircle, Network, Briefcase, CalendarCheck, FileStack, Settings, Building, UserCog, User, LogOut, Menu, PanelLeft, PanelLeftClose, ChevronRight, Sparkles, Bell, BarChart, Shield } from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { LogoComponent } from '../../../../shared/components/logo/logo.component';
import { ThemeService } from '../../../../core/services/theme.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  RH: 'Ressources Humaines',
  MANAGER: 'Manager',
  EMPLOYEE: 'Collaborateur'
};

@Component({
  selector: 'app-shell-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, LogoComponent],
  templateUrl: './shell-sidebar.component.html',
  styleUrls: ['./shell-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class ShellSidebarComponent {
  private readonly authService = inject(AuthService);
  readonly themeService = inject(ThemeService);

  // Icons
  readonly iconDashboard = LayoutDashboard;
  readonly iconClock = Clock;
  readonly iconCalendar = Calendar;
  readonly iconTimer = Timer;
  readonly iconLaptop = Laptop;
  readonly iconFolder = FolderOpen;
  readonly iconUsers = Users;
  readonly iconClipboard = ClipboardList;
  readonly iconCheck = CheckCircle;
  readonly iconNetwork = Network;
  readonly iconBriefcase = Briefcase;
  readonly iconCalendarCheck = CalendarCheck;
  readonly iconFiles = FileStack;
  readonly iconSettings = Settings;
  readonly iconBuilding = Building;
  readonly iconUserCog = UserCog;
  readonly iconUser = User;
  readonly iconLogout = LogOut;
  readonly iconMenu = Menu;
  readonly iconPanelOpen = PanelLeft;
  readonly iconPanelClose = PanelLeftClose;
  readonly iconChevronRight = ChevronRight;
  readonly iconSparkles = Sparkles;
  readonly iconBell = Bell;
  readonly iconBarChart = BarChart;
  readonly iconShield = Shield;

  collapsed = signal(false);
  mobileOpen = signal(false);

  private readonly userRole = computed(() => this.normalizeRole(this.authService.currentUser()?.roles?.[0]));
  private readonly roleBase = computed(() => {
    const role = this.userRole();
    if (role === 'EMPLOYEE') return 'employee';
    if (role === 'MANAGER') return 'manager';
    if (role === 'RH') return 'rh';
    if (role === 'ADMIN') return 'admin';
    return 'employee';
  });

  readonly navItems = computed<NavItem[]>(() => {
    const base = `/app/${this.roleBase()}`;
    const role = this.userRole();
    const items: NavItem[] = [
      { label: 'Tableau de bord', icon: 'layout-dashboard', route: `${base}/dashboard` },
    ];

    if (role === 'EMPLOYEE') {
      items.push(
        { label: 'Planning', icon: 'clock', route: `${base}/horaires` },
        { label: 'Congés', icon: 'calendar', route: `${base}/conges` },
        { label: 'Pointage', icon: 'clock', route: `${base}/pointage` },
        { label: 'Autorisations', icon: 'timer', route: `${base}/autorisations` },
        { label: 'Télétravail', icon: 'laptop', route: `${base}/teletravail` },
        { label: 'Documents', icon: 'folder-open', route: `${base}/documents` }
      );
    }

    if (role === 'MANAGER') {
      items.push(
        { label: 'Équipe', icon: 'users', route: `${base}/equipe` },
        { label: 'Pointage', icon: 'clock', route: `${base}/pointage` },
        { label: 'Présence', icon: 'clipboard-list', route: `${base}/presence` },
        { label: 'Horaires', icon: 'clock', route: `${base}/horaires` },
        { label: 'Autorisations', icon: 'timer', route: `${base}/autorisations` },
        { label: 'Télétravail', icon: 'laptop', route: `${base}/teletravail` },
        { label: 'Approbations', icon: 'check-circle', route: `${base}/approbations` }
      );
    }

    if (role === 'RH') {
      items.push(
        { label: 'Analytics', icon: 'bar-chart', route: `${base}/analytics` },
        { label: 'Structure', icon: 'network', route: `${base}/structure` },
        { label: 'Employés', icon: 'briefcase', route: `${base}/employes` },
        { label: 'Congés', icon: 'calendar-check', route: `${base}/conges` },
        { label: 'Horaires', icon: 'clock', route: `${base}/horaires` },
        { label: 'Autorisations', icon: 'timer', route: `${base}/autorisations` },
        { label: 'Télétravail', icon: 'laptop', route: `${base}/teletravail` },
        { label: 'Documents', icon: 'file-stack', route: `${base}/documents` },
        { label: 'Paramètres', icon: 'settings', route: `${base}/parametres` }
      );
    }

    if (role === 'ADMIN') {
      items.push(
        { label: 'Pointage', icon: 'clock-3', route: `${base}/presence` },
        { label: 'Utilisateurs', icon: 'users', route: `${base}/users` },
        { label: 'Roles', icon: 'shield-check', route: `${base}/roles` },
        { label: 'Entreprises', icon: 'building', route: `${base}/entreprises` },
        { label: 'Gestionnaires RH', icon: 'user-cog', route: `${base}/rh-owners` },
        { label: 'Rôles', icon: 'shield', route: `${base}/roles` },
        { label: 'Paramètres', icon: 'settings', route: `${base}/parametres` }
      );
    }

    items.push({ label: 'Profil', icon: 'user', route: `${base}/profil` });

    return items;
  });

  readonly fullName = computed(() => {
    const user = this.authService.currentUser();
    return user ? `${user.prenom ?? ''} ${user.nom ?? ''}`.trim() || user.email : '';
  });

  readonly initials = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return '?';
    const first = user.prenom?.[0]?.toUpperCase() ?? '';
    const last = user.nom?.[0]?.toUpperCase() ?? '';
    return (first + last) || user.email[0].toUpperCase();
  });

  readonly avatarColor = computed(() => {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    const name = this.fullName();
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
      hash = name.charCodeAt(index) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  });

  readonly roleLabel = computed(() => ROLE_LABELS[this.userRole()] ?? 'Utilisateur');

  private normalizeRole(role: string | null | undefined): string {
    const normalized = String(role ?? '').trim().toUpperCase();
    return normalized.startsWith('ROLE_') ? normalized.substring('ROLE_'.length) : normalized;
  }

  getNavItemIcon(iconName: string): any {
    switch (iconName) {
      case 'layout-dashboard': return this.iconDashboard;
      case 'clock': return this.iconClock;
      case 'calendar': return this.iconCalendar;
      case 'timer': return this.iconTimer;
      case 'laptop': return this.iconLaptop;
      case 'folder-open': return this.iconFolder;
      case 'users': return this.iconUsers;
      case 'clipboard-list': return this.iconClipboard;
      case 'check-circle': return this.iconCheck;
      case 'network': return this.iconNetwork;
      case 'briefcase': return this.iconBriefcase;
      case 'calendar-check': return this.iconCalendarCheck;
      case 'file-stack': return this.iconFiles;
      case 'settings': return this.iconSettings;
      case 'building': return this.iconBuilding;
      case 'user-cog': return this.iconUserCog;
      case 'user': return this.iconUser;
      case 'bell': return this.iconBell;
      case 'bar-chart': return this.iconBarChart;
      case 'shield': return this.iconShield;
      default: return this.iconUser;
    }
  }

  toggleCollapsed(): void {
    this.collapsed.update(value => !value);
  }

  onLogout(): void {
    this.authService.logout();
  }
}
