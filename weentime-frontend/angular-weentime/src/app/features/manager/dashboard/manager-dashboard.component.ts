import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, Activity, BadgeCheck, Check, ChevronRight, ClipboardCheck, Clock3, Inbox, Sparkles, Timer, UserX, Users } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ManagerDashboardService } from './manager-dashboard.service';
import { ManagerApprovalRequest, ManagerDashboardActivity, ManagerTeamMember } from '../manager.models';

interface DashboardAlert {
  title: string;
  description: string;
  tone: 'warning' | 'danger' | 'info' | 'success';
  icon: any;
}

interface DashboardMemberView {
  id: number;
  fullName: string;
  email: string;
  status: string;
  isLate: boolean;
  arrivalTime: string | null;
}

@Component({
  selector: 'app-manager-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './manager-dashboard.component.html',
  styleUrl: './manager-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerDashboardComponent {
  private readonly authService = inject(AuthService);
  protected readonly notificationService = inject(NotificationService);
  private readonly dashboardService = inject(ManagerDashboardService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly iconUsers = Users;
  protected readonly iconClipboardCheck = ClipboardCheck;
  protected readonly iconInbox = Inbox;
  protected readonly iconUserX = UserX;
  protected readonly iconTimer = Timer;
  protected readonly iconChevronRight = ChevronRight;
  protected readonly iconSparkles = Sparkles;
  protected readonly iconActivity = Activity;
  protected readonly iconClock = Clock3;
  protected readonly iconBadgeCheck = BadgeCheck;
  protected readonly iconCheck = Check;

  protected readonly isLoading = signal(true);
  private readonly dashboard = signal({
    kpis: {
      totalMembers: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      pendingCount: 0,
      attendanceRate: 0
    },
    members: [] as ManagerTeamMember[],
    pendingRequests: [] as ManagerApprovalRequest[],
    activities: [] as ManagerDashboardActivity[],
    hasLiveSignals: false
  });

  protected readonly firstName = computed(() => this.authService.currentUser()?.prenom ?? 'Manager');
  protected readonly todayLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());

  protected readonly mergedMembers = computed<DashboardMemberView[]>(() =>
    this.dashboard().members.map(member => ({
      id: member.id,
      fullName: member.fullName,
      email: member.email,
      status: member.presence?.status ?? 'ABSENT',
      isLate: Boolean(member.presence?.lateArrival || member.presence?.status === 'LATE'),
      arrivalTime: this.formatTime(member.presence?.heureEntree ?? null)
    }))
  );
  protected readonly pendingRequests = computed(() => this.dashboard().pendingRequests);
  protected readonly alerts = computed<DashboardAlert[]>(() => {
    const data = this.dashboard();
    const items: DashboardAlert[] = [];

    if (data.kpis.pendingCount > 0) {
      items.push({
        title: 'Demandes a traiter',
        description: `${data.kpis.pendingCount} demande(s) attendent votre validation.`,
        tone: 'warning',
        icon: Inbox
      });
    }
    if (data.kpis.lateCount > 0) {
      items.push({
        title: 'Retards detectes',
        description: `${data.kpis.lateCount} collaborateur(s) sont arrives en retard aujourd hui.`,
        tone: 'danger',
        icon: Timer
      });
    }
    if (data.kpis.attendanceRate >= 90) {
      items.push({
        title: 'Presence solide',
        description: `Le taux de presence atteint ${data.kpis.attendanceRate}%.`,
        tone: 'success',
        icon: BadgeCheck
      });
    }
    if (items.length === 0) {
      items.push({
        title: 'Flux stable',
        description: 'Aucune alerte critique sur votre equipe pour le moment.',
        tone: 'info',
        icon: Activity
      });
    }

    return items;
  });

  constructor() {
    this.dashboardService.getDashboardData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        this.dashboard.set(data);
        this.isLoading.set(false);
      });
  }

  protected hasLiveSignals(): boolean {
    return this.dashboard().hasLiveSignals;
  }

  protected totalCount(): number {
    return this.dashboard().kpis.totalMembers;
  }

  protected presentCount(): number {
    return this.dashboard().kpis.presentCount;
  }

  protected absentCount(): number {
    return this.dashboard().kpis.absentCount;
  }

  protected lateCount(): number {
    return this.dashboard().kpis.lateCount;
  }

  protected refreshData(): void {
    this.isLoading.set(true);
    this.dashboardService.refresh();
  }

  protected initials(fullName: string): string {
    return fullName.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'WT';
  }

  protected statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
    if (status === 'LATE') {
      return 'warning';
    }
    if (status === 'REMOTE') {
      return 'info';
    }
    if (status === 'PRESENT') {
      return 'success';
    }
    return 'danger';
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'PRESENT':
        return 'Present';
      case 'LATE':
        return 'Late';
      case 'REMOTE':
        return 'Remote';
      case 'ON_LEAVE':
        return 'On leave';
      default:
        return 'Absent';
    }
  }

  protected requestOwner(request: ManagerApprovalRequest): string {
    return request.utilisateur.fullName;
  }

  protected requestWindow(request: ManagerApprovalRequest): string {
    const start = request.dateDebut ? new Date(request.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '--';
    const end = request.dateFin ? new Date(request.dateFin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : start;
    return `${start} au ${end}`;
  }

  protected activityDate(activity: ManagerDashboardActivity): string {
    const date = new Date(activity.timestamp);
    if (Number.isNaN(date.getTime())) {
      return activity.timestamp;
    }
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  protected readonly activityFeed = computed(() => this.dashboard().activities);

  private formatTime(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const match = value.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
  }
}
