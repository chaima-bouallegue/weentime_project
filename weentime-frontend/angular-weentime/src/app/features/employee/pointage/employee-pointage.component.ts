import {
  Component, inject, signal, computed,
  OnInit, OnDestroy, DestroyRef, ViewEncapsulation
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Clock, Calendar, CheckCircle, AlertCircle,
  Play, Square, ChevronRight, TrendingUp
} from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PointageService } from './pointage.service';
import { PointageStats, PointageEntry } from './pointage.models';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { interval, Subscription, startWith, switchMap } from 'rxjs';
import { animate, style, transition, trigger, keyframes } from '@angular/animations';

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
        animate('0.5s cubic-bezier(0.19, 1, 0.22, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('pulse', [
      transition('* => active', [
        animate('2s infinite', keyframes([
          style({ boxShadow: '0 0 0 0 rgba(124, 58, 237, 0.4)' }),
          style({ boxShadow: '0 0 0 20px rgba(124, 58, 237, 0)' })
        ]))
      ])
    ])
  ]
})
export class EmployeePointageComponent implements OnInit, OnDestroy {
  private pointageService = inject(PointageService);
  private authService     = inject(AuthService);
  private toast           = inject(ToastService);
  private assistantSync   = inject(AssistantSyncService);
  private destroyRef      = inject(DestroyRef);

  // ── Icônes ──────────────────────────────────────────────────────────────────
  readonly iconClock    = Clock;
  readonly iconCalendar = Calendar;
  readonly iconCheck    = CheckCircle;
  readonly iconAlert    = AlertCircle;
  readonly iconPlay     = Play;
  readonly iconSquare   = Square;
  readonly iconChevron  = ChevronRight;
  readonly iconTrend    = TrendingUp;

  // ── Signaux ─────────────────────────────────────────────────────────────────
  currentTime  = signal<string>('00:00:00');
  currentDate  = signal<string>('');
  stats        = signal<PointageStats | null>(null);
  history      = signal<PointageEntry[]>([]);
  statusMessage = signal<string | null>(null);
  isLoading    = signal(false);
  isDayOff     = signal(false);

  // ── Délégués au service ──────────────────────────────────────────────────────
  sessionDuration = this.pointageService.sessionDuration;
  isCheckedIn     = this.pointageService.isCheckedIn;

  // ── Computed ──────────────────────────────────────────────────────────────────
  enterpriseName = computed(() =>
    this.authService.currentUser()?.entreprise?.nom ?? 'Mon Entreprise'
  );

  circleProgress = computed(() => {
    if (!this.isCheckedIn()) return 0;
    const goalMs = 8 * 3_600_000;
    return Math.min((this.pointageService.sessionDurationMs() / goalMs) * 100, 100);
  });

  currentDateTimeFormatted = computed(() =>
    `${this.currentDate()} • ${this.currentTime().substring(0, 5)}`
  );

  // ── Souscriptions privées ────────────────────────────────────────────────────
  private clockSub?: Subscription;
  private statsSub?: Subscription;

  // ── Cycle de vie ─────────────────────────────────────────────────────────────
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
        if (!event.actionResult?.executed ||
            (tool !== 'clock_in' && tool !== 'clock_out')) return;
        this.statusMessage.set(null);
        this.pointageService.refreshStatus();
        this.refreshOverview();
      });
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.statsSub?.unsubscribe();
  }

  // ── Action principale ─────────────────────────────────────────────────────────
  onTogglePointage(): void {
    if (this.isLoading() || this.isDayOff()) return;

    this.isLoading.set(true);
    this.statusMessage.set(null);
    const isStarting = !this.isCheckedIn();
    const action$ = isStarting
      ? this.pointageService.checkIn()
      : this.pointageService.checkOut();

    action$.subscribe({
      next: () => {
        this.toast.success(isStarting ? 'Session démarrée' : 'Session terminée');
        this.isDayOff.set(false);
        this.refreshOverview();
        this.isLoading.set(false);
      },
      error: (err: any) => {
        const code     = err?.error?.code ?? err?.error?.error;
        const errorMsg = err?.error?.details ?? err?.error?.message ?? err?.error?.error
                         ?? 'Erreur lors du pointage';

        // ✅ Session déjà ouverte : on resynchronise l'état sans alarmer
        if (
          code === 'ATTENDANCE_SESSION_ALREADY_OPEN' ||
          errorMsg.toLowerCase().includes('deja ouverte') ||
          errorMsg.toLowerCase().includes('déjà ouverte')
        ) {
          this.statusMessage.set(
            'Une session est déjà ouverte. Fermez la session en cours avant de pointer à nouveau.'
          );
          this.toast.info('Session déjà ouverte');
          this.pointageService.refreshStatus();
          this.refreshOverview();
          this.isLoading.set(false);
          return;
        }

        // ✅ Congé approuvé : on passe en mode "jour de repos" plutôt que d'afficher une erreur brute
        if (
          err.status === 403 ||
          errorMsg.toLowerCase().includes('leave') ||
          errorMsg.toLowerCase().includes('conge') ||
          errorMsg.toLowerCase().includes('congé')
        ) {
          this.isDayOff.set(true);
          this.statusMessage.set('Vous avez un congé approuvé pour aujourd\'hui.');
          this.isLoading.set(false);
          return;
        }

        this.toast.error(errorMsg);
        this.isLoading.set(false);
      }
    });
  }

  getDayProgressColor(status: string): string {
    switch (status) {
      case 'OK':     return '#10b981';
      case 'RETARD': return '#f43f5e';
      case 'OFF':    return 'rgba(0,0,0,0.1)';
      default:       return 'var(--ring-bg)';
    }
  }

  // ── Privées ───────────────────────────────────────────────────────────────────
  private updateDate(): void {
    this.currentDate.set(
      new Date().toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long'
      })
    );
  }

  private startClock(): void {
    this.clockSub = interval(1000).pipe(startWith(0)).subscribe(() => {
      this.currentTime.set(
        new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
      );
    });
  }

  private startStatsPolling(): void {
    this.statsSub = interval(60_000).pipe(
      startWith(0),
      switchMap(() => this.pointageService.getWeeklyStats())
    ).subscribe(data => {
      this.stats.set(data);
      this.evaluateDayOff(data);
    });
  }

  /**
   * ✅ FIX : détection jour OFF déplacée dans une méthode dédiée et protégée
   * contre l'écrasement pendant un chargement en cours.
   */
  private evaluateDayOff(data: PointageStats | null): void {
    if (!data?.joursParStatus) return;
    const todayAbbr = new Date()
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase();
    const todayStatus = data.joursParStatus.find(d => d.jour === todayAbbr);
    if (todayStatus?.statut === 'OFF') {
      this.isDayOff.set(true);
    } else if (!this.isLoading()) {
      // Ne pas réinitialiser si un pointage est en cours
      this.isDayOff.set(false);
    }
  }

  private loadTodayHistory(): void {
    this.pointageService.getTodayPointages().subscribe({
      next:  history => this.history.set(history),
      error: ()      => this.history.set([])
    });
  }

  private refreshOverview(): void {
    this.loadTodayHistory();
    this.pointageService.getWeeklyStats().subscribe({
      next:  stats => { this.stats.set(stats); this.evaluateDayOff(stats); },
      error: ()    => this.stats.set(null)
    });
  }
}