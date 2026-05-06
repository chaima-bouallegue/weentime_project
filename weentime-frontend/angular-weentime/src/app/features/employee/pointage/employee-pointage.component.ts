import { CommonModule } from '@angular/common';
import { DestroyRef, OnDestroy, OnInit, ViewEncapsulation, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  LucideAngularModule,
  Play,
  Square,
  TrendingUp,
  Users,
} from 'lucide-angular';
import { catchError, forkJoin, interval, of, startWith, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { ToastService } from '../../../core/services/toast.service';
import { AttendanceCardComponent } from '../../../shared/attendance/attendance-card.component';
import { formatLocalTime } from '../../../core/utils/date-time.util';
import { PointageEntry, PointageStats } from './pointage.models';
import { PointageService } from './pointage.service';

@Component({
  selector: 'app-employee-pointage',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, AttendanceCardComponent],
  templateUrl: './employee-pointage.component.html',
  styleUrls: ['./employee-pointage.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class EmployeePointageComponent implements OnInit, OnDestroy {
  private readonly pointageService = inject(PointageService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly assistantSync = inject(AssistantSyncService);
  private readonly destroyRef = inject(DestroyRef);

  readonly iconClock = Clock;
  readonly iconCalendar = Calendar;
  readonly iconCheck = CheckCircle;
  readonly iconAlert = AlertCircle;
  readonly iconPlay = Play;
  readonly iconSquare = Square;
  readonly iconTrend = TrendingUp;
  readonly iconActivity = Activity;
  readonly iconUsers = Users;

  readonly currentTime = signal<string>('00:00:00');
  readonly currentDate = signal<string>('');
  readonly stats = signal<PointageStats | null>(null);
  readonly history = signal<PointageEntry[]>([]);
  readonly statusMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isDayOff = signal(false);

  readonly attendanceState = this.pointageService.attendanceState;
  readonly checkInTime = this.pointageService.checkInTime;
  readonly checkOutTime = this.pointageService.checkOutTime;
  readonly serviceError = this.pointageService.lastError;
  readonly sessionDuration = this.pointageService.sessionDuration;
  readonly isCheckedIn = this.pointageService.isCheckedIn;

  readonly role = computed(() => this.resolveRole(this.authService.currentUser()?.roles?.[0] ?? this.authService.currentUser()?.role));
  readonly roleLabel = computed(() => {
    switch (this.role()) {
      case 'ADMIN':
        return 'ADMINISTRATEUR';
      case 'RH':
        return 'RESSOURCES HUMAINES';
      case 'MANAGER':
        return 'MANAGER';
      default:
        return 'COLLABORATEUR';
    }
  });

  readonly isAdminOrRh = computed(() => this.role() === 'ADMIN' || this.role() === 'RH');
  readonly isEmployeeOrManager = computed(() => this.role() === 'EMPLOYEE' || this.role() === 'MANAGER');
  readonly showManagerTeamShortcut = computed(() => this.role() === 'MANAGER');

  readonly dailyDuration = computed(() => {
    if (this.attendanceState() === 'ACTIVE') {
      return this.sessionDuration();
    }
    return this.formatMinutesToClock(this.stats()?.minutesAujourdhui ?? 0);
  });

  readonly currentDateTimeFormatted = computed(() => `${this.currentDate()} - ${this.currentTime().slice(0, 5)}`);

  private clockSub?: Subscription;
  private statsSub?: Subscription;

  ngOnInit(): void {
    this.updateDate();
    this.startClock();
    this.startStatsPolling();
    this.refreshOverview();

    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        const tool = event.actionResult?.tool;
        if (!event.actionResult?.executed || (tool !== 'clock_in' && tool !== 'clock_out')) {
          return;
        }

        this.statusMessage.set(null);
        this.refreshOverview();
      });
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.statsSub?.unsubscribe();
  }

  onCheckIn(): void {
    if (this.isLoading() || this.isDayOff() || this.attendanceState() !== 'NOT_STARTED') {
      return;
    }

    this.performPointageAction(true);
  }

  onCheckOut(): void {
    if (this.isLoading() || this.attendanceState() !== 'ACTIVE') {
      return;
    }

    this.performPointageAction(false);
  }

  onRefresh(): void {
    if (this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.statusMessage.set(null);
    this.refreshOverview(() => this.isLoading.set(false));
  }

  formatTime(value: string | null): string {
    return formatLocalTime(value);
  }

  statusLabel(): string {
    switch (this.attendanceState()) {
      case 'ACTIVE':
        return 'Session démarrée';
      case 'CLOSED':
        return 'Journée clôturée';
      case 'ERROR':
        return 'Synchronisation requise';
      default:
        return 'Aucun pointage aujourd’hui';
    }
  }

  dayStatusLabel(status: string): string {
    switch (status) {
      case 'RETARD':
        return 'Retard';
      case 'ABSENT':
        return 'Absent';
      case 'OFF':
        return 'Repos';
      default:
        return 'OK';
    }
  }

  dayStatusClass(status: string): string {
    switch (status) {
      case 'RETARD':
        return 'status-chip status-retard';
      case 'ABSENT':
        return 'status-chip status-absent';
      case 'OFF':
        return 'status-chip status-off';
      default:
        return 'status-chip status-ok';
    }
  }

  private updateDate(): void {
    this.currentDate.set(
      new Date().toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }

  private startClock(): void {
    this.clockSub = interval(1000)
      .pipe(startWith(0))
      .subscribe(() => {
        this.currentTime.set(
          new Date().toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        );
      });
  }

  private startStatsPolling(): void {
    this.statsSub = interval(60_000)
      .pipe(switchMap(() => this.pointageService.getWeeklyStats()))
      .subscribe(data => {
        this.stats.set(data);
        this.evaluateDayOff(data);
      });
  }

  private evaluateDayOff(data: PointageStats | null): void {
    if (!data?.joursParStatus) {
      return;
    }

    const todayAbbr = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const todayStatus = data.joursParStatus.find(item => item.jour === todayAbbr);

    if (todayStatus?.statut === 'OFF') {
      this.isDayOff.set(true);
    } else if (!this.isLoading()) {
      this.isDayOff.set(false);
    }
  }

  private refreshOverview(onSettled?: () => void): void {
    this.pointageService.loadTodayStatus().pipe(
      switchMap(() => forkJoin({
        history: this.pointageService.getTodayPointages().pipe(catchError(() => of([] as PointageEntry[]))),
        stats: this.pointageService.getWeeklyStats().pipe(catchError(() => of(null)))
      })),
      catchError(() => of({ history: [] as PointageEntry[], stats: null as PointageStats | null }))
    ).subscribe(({ history, stats }) => {
      this.history.set(history);
      this.stats.set(stats);
      this.evaluateDayOff(stats);
      onSettled?.();
    });
  }

  private performPointageAction(isStarting: boolean): void {
    this.isLoading.set(true);
    this.statusMessage.set(null);

    const request$ = isStarting ? this.pointageService.checkIn() : this.pointageService.checkOut();

    request$.subscribe({
      next: () => {
        this.toast.success(isStarting ? 'Session démarrée' : 'Journée clôturée');
        this.isDayOff.set(false);
        this.refreshOverview(() => this.isLoading.set(false));
      },
      error: err => {
        if (this.pointageService.isSessionAlreadyOpenError(err)) {
          this.refreshOverview(() => this.isLoading.set(false));
          return;
        }

        const msg = this.pointageService.toFrenchError(err);
        const normalizedMsg = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        if (normalizedMsg.includes('conge approuve')) {
          this.isDayOff.set(true);
          this.statusMessage.set(msg);
        }

        this.isLoading.set(false);
      },
    });
  }

  private formatMinutesToClock(minutes: number): string {
    const safeMinutes = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  }

  private resolveRole(value: string | null | undefined): 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE' {
    const normalized = String(value ?? '').trim().toUpperCase();
    const role = normalized.startsWith('ROLE_') ? normalized.substring('ROLE_'.length) : normalized;

    if (role === 'ADMIN' || role === 'RH' || role === 'MANAGER') {
      return role;
    }

    return 'EMPLOYEE';
  }
}


