import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  LayoutDashboard,
  Clock,
  Calendar,
  Timer,
  Laptop,
  FolderOpen,
  Users,
  ClipboardList,
  CheckCircle,
  Network,
  Briefcase,
  CalendarCheck,
  FileStack,
  Settings,
  Building,
  UserCog,
  User,
  LogOut,
  Menu,
  PanelLeft,
  PanelLeftClose,
  ChevronRight,
  Sparkles,
  Bell,
  BarChart,
  Shield,
  MessageSquare
} from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { LogoComponent } from '../../../../shared/components/logo/logo.component';
import { ThemeService } from '../../../../core/services/theme.service';
import { CommunicationStoreService } from '@app/features/communication/services/communication-store.service';

interface NavItem {
  id: string;
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
  private readonly communicationStore = inject(CommunicationStoreService);
  readonly themeService = inject(ThemeService);

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
  readonly iconMessageSquare = MessageSquare;

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
      { id: 'dashboard', label: 'Tableau de bord', icon: 'layout-dashboard', route: `${base}/dashboard` },
      { id: 'messages', label: 'Messages', icon: 'message-square', route: '/app/messages' }
    ];

    if (role === 'EMPLOYEE') {
      items.push(
        { id: 'employee-horaires', label: 'Planning', icon: 'clock', route: `${base}/horaires` },
        { id: 'employee-conges', label: 'Conges', icon: 'calendar', route: `${base}/conges` },
        { id: 'employee-pointage', label: 'Pointage', icon: 'clock', route: `${base}/pointage` },
        { id: 'employee-autorisations', label: 'Autorisations', icon: 'timer', route: `${base}/autorisations` },
        { id: 'employee-teletravail', label: 'Teletravail', icon: 'laptop', route: `${base}/teletravail` },
        { id: 'employee-documents', label: 'Documents', icon: 'folder-open', route: `${base}/documents` }
      );
    }

    if (role === 'MANAGER') {
      items.push(
        { id: 'manager-equipe', label: 'Equipe', icon: 'users', route: `${base}/equipe` },
        { id: 'manager-pointage', label: 'Pointage', icon: 'clock', route: `${base}/pointage` },
        { id: 'manager-presence', label: 'Presence', icon: 'clipboard-list', route: `${base}/presence` },
        { id: 'manager-horaires', label: 'Horaires', icon: 'clock', route: `${base}/horaires` },
        { id: 'manager-autorisations', label: 'Autorisations', icon: 'timer', route: `${base}/autorisations` },
        { id: 'manager-teletravail', label: 'Teletravail', icon: 'laptop', route: `${base}/teletravail` },
        { id: 'manager-approbations', label: 'Approbations', icon: 'check-circle', route: `${base}/approbations` }
      );
    }

    if (role === 'RH') {
      items.push(
        { id: 'rh-analytics', label: 'Analytics', icon: 'bar-chart', route: `${base}/analytics` },
        { id: 'rh-structure', label: 'Structure', icon: 'network', route: `${base}/structure` },
        { id: 'rh-employes', label: 'Employes', icon: 'briefcase', route: `${base}/employes` },
        { id: 'rh-conges', label: 'Conges', icon: 'calendar-check', route: `${base}/conges` },
        { id: 'rh-horaires', label: 'Horaires', icon: 'clock', route: `${base}/horaires` },
        { id: 'rh-pointage', label: 'Pointage', icon: 'clock', route: `${base}/pointage` },
        { id: 'rh-autorisations', label: 'Autorisations', icon: 'timer', route: `${base}/autorisations` },
        { id: 'rh-teletravail', label: 'Teletravail', icon: 'laptop', route: `${base}/teletravail` },
        { id: 'rh-documents', label: 'Documents', icon: 'file-stack', route: `${base}/documents` },
        { id: 'rh-parametres', label: 'Parametres', icon: 'settings', route: `${base}/parametres` }
      );
    }

    if (role === 'ADMIN') {
      items.push(
        { id: 'admin-pointage', label: 'Pointage', icon: 'clock', route: `${base}/presence` },
        { id: 'admin-users', label: 'Utilisateurs', icon: 'users', route: `${base}/users` },
        { id: 'admin-roles', label: 'Roles', icon: 'shield', route: `${base}/roles` },
        { id: 'admin-entreprises', label: 'Entreprises', icon: 'building', route: `${base}/entreprises` },
        { id: 'admin-rh-owners', label: 'Gestionnaires RH', icon: 'user-cog', route: `${base}/rh-owners` },
        { id: 'admin-parametres', label: 'Parametres', icon: 'settings', route: `${base}/parametres` }
      );
    }

    items.push({ id: 'profile', label: 'Profil', icon: 'user', route: `${base}/profil` });
    return this.uniqueNavItems(items);
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
  readonly messageUnreadCount = this.communicationStore.totalUnread;

  constructor() {
    this.communicationStore.bootstrapUnreadTracking();
  }

  navTrackingKey(item: NavItem): string {
    return `${item.id}:${item.route}`;
  }

  private normalizeRole(role: string | null | undefined): string {
    const normalized = String(role ?? '').trim().toUpperCase();
    return normalized.startsWith('ROLE_') ? normalized.substring('ROLE_'.length) : normalized;
  }

  private uniqueNavItems(items: NavItem[]): NavItem[] {
    const seenRoutes = new Set<string>();
    return items.filter(item => {
      if (seenRoutes.has(item.route)) {
        return false;
      }
      seenRoutes.add(item.route);
      return true;
    });
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
      case 'message-square': return this.iconMessageSquare;
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
