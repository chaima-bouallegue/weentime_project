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
  MessageSquare,
  Search
} from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { LogoComponent } from '../../../../shared/components/logo/logo.component';
import { ThemeService } from '../../../../core/services/theme.service';
import { CommunicationStoreService } from '@app/features/communication/services/communication-store.service';
import { ApprobationService } from '../../../manager/approbations/approbation.service';
import { RhLeaveStore } from '../../../../core/services/rh-leave.store';
import { RhTeletravailStore } from '../../../../core/services/rh-teletravail.store';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
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
  private readonly approbationService = inject(ApprobationService);
  private readonly rhLeaveStore = inject(RhLeaveStore);
  private readonly rhTeletravailStore = inject(RhTeletravailStore);
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
  readonly iconSearch = Search;

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

    if (role !== 'ADMIN') {
      items.push({ id: 'reunions', label: 'Réunions', icon: 'calendar-check', route: '/app/reunions' });
    }

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
        { id: 'manager-documents', label: 'Documents', icon: 'folder-open', route: `${base}/documents` },
        { id: 'manager-approbations', label: 'Approbations', icon: 'check-circle', route: `${base}/approbations` }
      );
    }

    if (role === 'RH') {
      items.push(
        { id: 'rh-analytics', label: 'Analytics', icon: 'bar-chart', route: `${base}/analytics` },
        { id: 'rh-planning', label: 'Calendrier Global', icon: 'calendar', route: `${base}/planning` },
        { id: 'rh-recrutement', label: 'Recrutement', icon: 'search', route: `${base}/recrutement` },
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

  readonly groupedNavItems = computed<NavGroup[]>(() => {
    const items = this.navItems();
    const principalItems: NavItem[] = [];
    const gestionItems: NavItem[] = [];
    const adminItems: NavItem[] = [];

    const principalIds = ['dashboard', 'messages', 'reunions'];
    const gestionIds = [
      'rh-analytics', 'rh-planning', 'rh-recrutement', 'rh-structure', 
      'manager-equipe', 'rh-employes', 'employee-conges', 'rh-conges', 
      'employee-teletravail', 'manager-teletravail', 'rh-teletravail', 
      'employee-documents', 'manager-documents', 'rh-documents', 
      'manager-approbations'
    ];

    for (const item of items) {
      if (principalIds.includes(item.id)) {
        principalItems.push(item);
      } else if (gestionIds.includes(item.id)) {
        gestionItems.push(item);
      } else {
        adminItems.push(item);
      }
    }

    const groups: NavGroup[] = [];
    if (principalItems.length > 0) {
      groups.push({ label: 'PRINCIPAL', items: principalItems });
    }
    if (gestionItems.length > 0) {
      groups.push({ label: 'GESTION', items: gestionItems });
    }
    if (adminItems.length > 0) {
      groups.push({ label: 'ADMIN', items: adminItems });
    }
    return groups;
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

  readonly managerPendingApprobationsCount = computed(() => {
    const pending = this.approbationService.pendingApprobationsSignal();
    return pending.filter(d => d.type !== 'TELETRAVAIL').length;
  });

  readonly managerPendingTeletravailCount = computed(() => {
    const pending = this.approbationService.pendingApprobationsSignal();
    return pending.filter(d => d.type === 'TELETRAVAIL').length;
  });

  readonly rhPendingCongesCount = computed(() => {
    return this.rhLeaveStore.allDemandes().filter(d => d.statut === 'EN_ATTENTE_RH').length;
  });

  readonly rhPendingTeletravailCount = computed(() => {
    return this.rhTeletravailStore.demandesEnAttente().length;
  });

  constructor() {
    this.communicationStore.bootstrapUnreadTracking();
    const role = this.userRole();
    if (role === 'MANAGER') {
      this.approbationService.refreshBuckets();
    } else if (role === 'RH') {
      this.rhLeaveStore.loadAllDemandes().subscribe();
      this.rhTeletravailStore.loadAll(true).subscribe();
    }
  }

  getBadgeCount(itemId: string): number {
    const role = this.userRole();
    if (itemId === 'messages') {
      return this.messageUnreadCount();
    }
    if (role === 'MANAGER') {
      if (itemId === 'manager-approbations') {
        return this.managerPendingApprobationsCount();
      }
      if (itemId === 'manager-teletravail') {
        return this.managerPendingTeletravailCount();
      }
    }
    if (role === 'RH') {
      if (itemId === 'rh-conges') {
        return this.rhPendingCongesCount();
      }
      if (itemId === 'rh-teletravail') {
        return this.rhPendingTeletravailCount();
      }
    }
    return 0;
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
      case 'search': return this.iconSearch;
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
