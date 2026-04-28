import {
  Component,
  inject,
  signal,
  computed,
  OnDestroy,
  OnInit,
  DestroyRef,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Play,
  Square,
  ChevronRight,
  TrendingUp,
} from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, startWith, Subscription, switchMap } from 'rxjs';
import { animate, keyframes, style, transition, trigger } from '@angular/animations';
import { PointageEntry, PointageStats } from './pointage.models';
import { PointageService } from './pointage.service';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-employee-pointage',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './employee-pointage.component.html',
  styleUrls: ['./employee-pointage.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('0.5s cubic-bezier(0.19, 1, 0.22, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('pulse', [
      transition('* => active', [
        animate(
          '2s infinite',
          keyframes([
            style({ boxShadow: '0 0 0 0 rgba(124, 58, 237, 0.4)' }),
            style({ boxShadow: '0 0 0 20px rgba(124, 58, 237, 0)' }),
          ]),
        ),
      ]),
    ]),
  ],
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
  readonly iconChevron = ChevronRight;
  readonly iconTrend = TrendingUp;

  readonly currentTime = signal<string>('00:00:00');
  readonly currentDate = signal<string>('');
  readonly stats = signal<PointageStats | null>(null);
  readonly history = signal<PointageEntry[]>([]);
  readonly statusMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isDayOff = signal(false);

  readonly sessionDuration = this.pointageService.sessionDuration;
  readonly isCheckedIn = this.pointageService.isCheckedIn;

  readonly enterpriseName = computed(() => this.authService.currentUser()?.entreprise?.nom ?? 'Mon Entreprise');
  readonly circleProgress = computed(() => {
    if (!this.isCheckedIn()) return 0;
    const goalMs = 8 * 3_600_000;
    return Math.min((this.pointageService.sessionDurationMs() / goalMs) * 100, 100);
  });
  readonly currentDateTimeFormatted = computed(() => `${this.currentDate()} • ${this.currentTime().substring(0, 5)}`);

  private clockSub?: Subscription;
  private statsSub?: Subscription;

  ngOnInit(): void {
    this.updateDate();
    this.startClock();
    this.pointageService.refreshStatus();
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
        this.pointageService.refreshStatus();
        this.refreshOverview();
      });
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.statsSub?.unsubscribe();
  }

  onTogglePointage(): void {
    if (this.isLoading() || this.isDayOff()) return;

    this.isLoading.set(true);
    this.statusMessage.set(null);

    const isStarting = !this.isCheckedIn();
    const request$ = isStarting ? this.pointageService.checkIn() : this.pointageService.checkOut();

    request$.subscribe({
      next: () => {
        this.toast.success(isStarting ? 'Session demarree' : 'Session terminee');
        this.isDayOff.set(false);
        this.refreshOverview();
        this.isLoading.set(false);
      },
      error: (err: any) => {
        const code = err?.error?.code ?? err?.error?.error;
        const errorMsg = err?.error?.details ?? err?.error?.message ?? err?.error?.error ?? 'Erreur lors du pointage';

        if (
          code === 'ATTENDANCE_SESSION_ALREADY_OPEN' ||
          String(errorMsg).toLowerCase().includes('already open') ||
          String(errorMsg).toLowerCase().includes('deja ouverte')
        ) {
          this.pointageService.refreshStatus();
          this.refreshOverview();
          this.isLoading.set(false);
          return;
        }

        if (
          err?.status === 403 ||
          String(errorMsg).toLowerCase().includes('leave') ||
          String(errorMsg).toLowerCase().includes('conge')
        ) {
          this.isDayOff.set(true);
          this.statusMessage.set("Vous avez un conge approuve pour aujourd'hui.");
          this.isLoading.set(false);
          return;
        }

        this.toast.error(errorMsg);
        this.isLoading.set(false);
      },
    });
  }

  getDayProgressColor(status: string): string {
    switch (status) {
      case 'OK':
        return '#10b981';
      case 'RETARD':
        return '#f43f5e';
      case 'OFF':
        return 'rgba(0,0,0,0.1)';
      default:
        return 'var(--ring-bg)';
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
      .pipe(startWith(0), switchMap(() => this.pointageService.getWeeklyStats()))
      .subscribe(data => {
        this.stats.set(data);
        this.evaluateDayOff(data);
      });
  }

  private evaluateDayOff(data: PointageStats | null): void {
    if (!data?.joursParStatus) return;
    const todayAbbr = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const todayStatus = data.joursParStatus.find(item => item.jour === todayAbbr);
    if (todayStatus?.statut === 'OFF') {
      this.isDayOff.set(true);
    } else if (!this.isLoading()) {
      this.isDayOff.set(false);
    }
  }

  private loadTodayHistory(): void {
    this.pointageService.getTodayPointages().subscribe({
      next: entries => this.history.set(entries),
      error: () => this.history.set([]),
    });
  }

  private refreshOverview(): void {
    this.loadTodayHistory();
    this.pointageService.getWeeklyStats().subscribe({
      next: stats => {
        this.stats.set(stats);
        this.evaluateDayOff(stats);
      },
      error: () => this.stats.set(null),
    });
  }
}
