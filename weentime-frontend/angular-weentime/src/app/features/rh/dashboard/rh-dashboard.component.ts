import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  ChartColumnBig,
  Check,
  ChevronRight,
  Clock3,
  History,
  Inbox,
  LucideAngularModule,
  RefreshCw,
  UserX,
  Users
} from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { RhDashboardService } from './rh-dashboard.service';

@Component({
  selector: 'app-rh-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './rh-dashboard.component.html',
  styleUrl: './rh-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhDashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(RhDashboardService);

  readonly iconUsers = Users;
  readonly iconBadgeCheck = BadgeCheck;
  readonly iconUserX = UserX;
  readonly iconInbox = Inbox;
  readonly iconClock3 = Clock3;
  readonly iconChart = ChartColumnBig;
  readonly iconCheck = Check;
  readonly iconChevronRight = ChevronRight;
  readonly iconHistory = History;
  readonly iconAlert = AlertTriangle;
  readonly iconActivity = RefreshCw;
  readonly iconBriefcase = Briefcase;

  readonly dashboard = toSignal(this.dashboardService.getDashboardData(), { initialValue: null });

  readonly firstName = computed(() => this.authService.currentUser()?.prenom ?? 'RH');
  readonly isLoading = computed(() => this.dashboard() === null);
  readonly warningMessage = computed(() =>
    this.dashboard() && this.dashboard()!.totalEmployees === 0 ? 'Aucune donnee RH consolidee n est disponible pour le moment.' : null
  );

  readonly totalEmployees = computed(() => this.dashboard()?.totalEmployees ?? 0);
  readonly presentCount = computed(() => this.dashboard()?.presentCount ?? 0);
  readonly absentCount = computed(() => this.dashboard()?.absentCount ?? 0);
  readonly pendingRequests = computed(() => this.dashboard()?.pendingRequests ?? []);
  readonly hoursWorked = computed(() => (this.dashboard()?.hoursWorked ?? 0).toFixed(1));
  readonly attendanceRate = computed(() => this.dashboard()?.attendanceRate ?? 0);
  readonly attendanceBars = computed(() => this.dashboard()?.attendanceBars ?? []);
  readonly requestMix = computed(() => this.dashboard()?.requestMix ?? []);
  readonly highlightedMembers = computed(() => this.dashboard()?.highlightedMembers ?? []);
  readonly activityFeed = computed(() => this.dashboard()?.activityFeed ?? []);

  refreshData(): void {
    this.dashboardService.refresh();
  }

  protected requestOwner(request: { employeeName?: string; userId: number }): string {
    return request.employeeName || `Employe #${request.userId}`;
  }

  protected requestPeriod(request: { startDate: string | null; endDate: string | null }): string {
    if (request.startDate && request.endDate) {
      return `${this.formatDate(request.startDate)} au ${this.formatDate(request.endDate)}`;
    }
    if (request.startDate) {
      return this.formatDate(request.startDate);
    }
    return 'Periode non renseignee';
  }

  protected getInitials(value: string): string {
    const parts = value.split(' ').filter(Boolean);
    return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || 'RH';
  }

  protected memberTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
    switch (status) {
      case 'ABSENT':
        return 'danger';
      case 'ON_LEAVE':
        return 'warning';
      default:
        return 'info';
    }
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
}
