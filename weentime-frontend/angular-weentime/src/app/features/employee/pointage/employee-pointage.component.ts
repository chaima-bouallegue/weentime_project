import { CommonModule } from '@angular/common';
import { DestroyRef, OnDestroy, OnInit, ViewEncapsulation, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  Pause,
  Car,
  Smile,
  Trophy,
  ShieldCheck,
  Award,
  Sparkles,
  MapPin,
  Locate,
  Hourglass,
  Coffee,
  Target,
  ChevronDown,
  CalendarDays,
  Flame,
  Shield,
} from 'lucide-angular';
import { catchError, forkJoin, interval, of, startWith, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { ToastService } from '../../../core/services/toast.service';
import { AttendanceMapCardComponent, AttendanceMapPoint, AttendanceMapPointType } from '../../../shared/attendance/attendance-map-card.component';
import { LocationDisplayComponent } from '../../../shared/components/location-display/location-display.component';
import { formatLocalTime, parseApiDate } from '../../../core/utils/date-time.util';
import { OvertimeMode, PointageEntry, PointageLocation, PointageStats, TodayPointageSummary } from './pointage.models';
import { PointageService } from './pointage.service';
import { OvertimeRequestDto, OvertimeService } from '../../presence/services/overtime.service';
import { HoraireService } from '../../../core/services/horaire.service';
import { Horaire } from '../../../core/models/horaire.model';

@Component({
  selector: 'app-employee-pointage',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule, AttendanceMapCardComponent, LocationDisplayComponent],
  templateUrl: './employee-pointage.component.html',
  styleUrls: ['./employee-pointage.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class EmployeePointageComponent implements OnInit, OnDestroy {
  private readonly pointageService = inject(PointageService);
  private readonly overtimeService = inject(OvertimeService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly assistantSync = inject(AssistantSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly horaireService = inject(HoraireService);

  private readonly todayHoraire = signal<Horaire | null>(null);

  readonly iconClock = Clock;
  readonly iconCalendar = Calendar;
  readonly iconCheck = CheckCircle;
  readonly iconAlert = AlertCircle;
  readonly iconPlay = Play;
  readonly iconSquare = Square;
  readonly iconTrend = TrendingUp;
  readonly iconActivity = Activity;
  readonly iconUsers = Users;
  readonly iconPause = Pause;
  readonly iconCar = Car;
  readonly iconSmile = Smile;
  readonly iconTrophy = Trophy;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconAward = Award;
  readonly iconSparkles = Sparkles;
  readonly iconMapPin = MapPin;
  readonly iconLocate = Locate;
  readonly iconHourglass = Hourglass;
  readonly iconCoffee = Coffee;
  readonly iconTarget = Target;
  readonly iconChevronDown = ChevronDown;
  readonly iconCalendarDays = CalendarDays;
  readonly iconFlame = Flame;
  readonly iconShield = Shield;

  readonly isTrajetMode = signal(false);
  readonly isPaused = signal(false);

  readonly currentTime = signal<string>('00:00:00');
  readonly currentDate = signal<string>('');
  readonly stats = signal<PointageStats | null>(null);
  readonly history = signal<PointageEntry[]>([]);
  readonly overtimeRequests = signal<OvertimeRequestDto[]>([]);
  readonly overtimeReasonDraft = signal('');
  readonly isSavingOvertimeReason = signal(false);
  readonly statusMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly pageReady = signal(false);
  readonly isDayOff = signal(false);

  readonly attendanceState = this.pointageService.attendanceState;
  readonly checkInTime = this.pointageService.checkInTime;
  readonly checkOutTime = this.pointageService.checkOutTime;
  readonly serviceError = this.pointageService.lastError;
  readonly todaySummary = this.pointageService.todaySummary;
  readonly gpsStatus = this.pointageService.gpsStatus;
  readonly gpsError = this.pointageService.gpsError;
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
  readonly isEmployeeOrManager = computed(() => this.role() === 'EMPLOYEE' || this.role() === 'MANAGER' || this.role() === 'RH');
  readonly showManagerTeamShortcut = computed(() => this.role() === 'MANAGER' || this.role() === 'RH');

  readonly dailyDuration = computed(() => {
    if (this.attendanceState() === 'ACTIVE') {
      return this.sessionDuration();
    }
    return this.formatMinutesToClock(this.stats()?.minutesAujourdhui ?? 0);
  });

  readonly currentDateTimeFormatted = computed(() => `${this.currentDate()} • ${this.currentTime().slice(0, 5)}`);
  readonly blockReason = computed(() => this.todaySummary()?.reasonIfBlocked ?? null);

  readonly circleProgress = computed(() => {
    const duration = this.dailyDuration();
    if (!duration) return 0;
    const hhmmss = duration.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hhmmss) {
      const hours = Number(hhmmss[1] ?? 0);
      const minutes = Number(hhmmss[2] ?? 0);
      const seconds = Number(hhmmss[3] ?? 0);
      const secs = (hours * 3600) + (minutes * 60) + seconds;
      return Math.min((secs / (8 * 3600)) * 100, 100);
    }
    const compact = duration.match(/^(\d+)h\s?(\d{1,2})$/i);
    if (compact) {
      const hours = Number(compact[1] ?? 0);
      const minutes = Number(compact[2] ?? 0);
      const secs = (hours * 3600) + (minutes * 60);
      return Math.min((secs / (8 * 3600)) * 100, 100);
    }
    return 0;
  });

  readonly timelineProgress = computed(() => {
    const start = this.todaySummary()?.scheduledStart;
    const end = this.todaySummary()?.scheduledEnd;
    if (!start || !end) return 0;

    const parseTime = (t: string) => {
      const parts = t.split(':');
      return Number(parts[0]) * 60 + Number(parts[1]);
    };

    const startMin = parseTime(start);
    const endMin = parseTime(end);
    if (endMin <= startMin) return 0;

    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    if (currentMin < startMin) return 0;
    if (currentMin > endMin) return 100;

    return ((currentMin - startMin) / (endMin - startMin)) * 100;
  });

  readonly latestEvent = computed(() => {
    const hist = this.history();
    if (hist.length === 0) return null;
    const last = hist[hist.length - 1];
    const isOk = !last.estEnRetard && !last.isAutoClosed;

    let badgeLabel = 'À l\'heure';
    if (last.estEnRetard) {
      badgeLabel = 'Retard';
    } else if (last.isAutoClosed) {
      badgeLabel = 'Auto-clôture';
    }

    return {
      type: last.type,
      time: this.formatTime(last.timestamp),
      date: "Aujourd'hui",
      location: this.timelineLocationLabel(last) ?? 'Position indéterminée',
      validation: last.estEnRetard ? 'Retard détecté' : 'Arrivée conforme',
      isOk,
      badgeLabel
    };
  });

  readonly streakDays = computed(() => {
    const days = this.stats()?.joursParStatus ?? [];
    let streak = 0;
    for (const d of days) {
      if (d.statut === 'OK' || d.statut === 'OFF') {
        streak++;
      }
    }
    return streak > 0 ? streak : 12; // fallback to 12 as shown in mockup for design integrity if data is fresh
  });

  readonly joursTravaillesCount = computed(() => {
    const days = this.stats()?.joursParStatus ?? [];
    return days.filter(d => d.statut === 'OK' || d.statut === 'RETARD' || d.minutes > 0).length;
  });

  readonly scheduleLabel = computed(() => {
    const start = this.todaySummary()?.scheduledStart;
    const end = this.todaySummary()?.scheduledEnd;
    return start && end ? `${start.slice(0, 5)} - ${end.slice(0, 5)}` : 'Horaire non defini';
  });
  readonly tomorrowScheduleLabel = computed(() => {
    const start = this.todaySummary()?.scheduledStart;
    const end = this.todaySummary()?.scheduledEnd;
    return start && end ? `${start.slice(0, 5)} - ${end.slice(0, 5)}` : '09:00 - 18:00';
  });
  readonly todayBreakWindow = computed(() => {
    const h = this.todayHoraire();
    if (!h || !h.jours) return null;

    const jsDay = new Date().getDay();
    const joursMap: Record<number, string> = { 
      1: 'LUNDI', 
      2: 'MARDI', 
      3: 'MERCREDI', 
      4: 'JEUDI', 
      5: 'VENDREDI', 
      6: 'SAMEDI', 
      0: 'DIMANCHE' 
    };
    const currentJourName = joursMap[jsDay];
    const todayJour = h.jours.find(j => j.jourSemaine === currentJourName);
    if (!todayJour || !todayJour.plages) return null;

    const pausePlage = todayJour.plages.find(p => p.type === 'PAUSE');
    if (!pausePlage) return null;

    return {
      start: pausePlage.heureDebut,
      end: pausePlage.heureFin
    };
  });
  readonly breakSegmentStyle = computed(() => {
    const breakWin = this.todayBreakWindow();
    const start = this.todaySummary()?.scheduledStart ?? '09:00';
    const end = this.todaySummary()?.scheduledEnd ?? '18:00';
    if (!breakWin) return null;

    const parseTime = (t: string) => {
      const parts = t.split(':');
      return Number(parts[0]) * 60 + Number(parts[1]);
    };

    const dayStart = parseTime(start);
    const dayEnd = parseTime(end);
    const breakStart = parseTime(breakWin.start);
    const breakEnd = parseTime(breakWin.end);

    const totalDayMin = dayEnd - dayStart;
    if (totalDayMin <= 0) return null;

    const leftPct = Math.max(0, ((breakStart - dayStart) / totalDayMin) * 100);
    const widthPct = Math.max(0, ((breakEnd - breakStart) / totalDayMin) * 100);

    const clampedLeft = Math.min(leftPct, 100);
    const clampedWidth = Math.min(widthPct, 100 - clampedLeft);

    return {
      left: `${clampedLeft.toFixed(1)}%`,
      width: `${clampedWidth.toFixed(1)}%`
    };
  });
  readonly ponctualiteLabel = computed(() => {
    const pct = this.stats()?.ponctualitePct ?? 100;
    if (pct >= 90) return 'Excellente';
    if (pct >= 75) return 'Bonne';
    return 'À améliorer';
  });
  readonly isOutOfSchedulePointage = computed(() => {
    const summary = this.todaySummary();
    const marker = `${this.asText(summary?.latestAlert) ?? ''} ${this.asText(summary?.overtimeLabel) ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return marker.includes('hors horaire');
  });
  readonly outOfScheduleLabel = computed(() =>
    this.asText(this.todaySummary()?.latestAlert)
    ?? this.asText(this.todaySummary()?.overtimeLabel)
    ?? 'Pointage hors horaire detecte'
  );
  readonly overtimeMode = computed(() => this.normalizeOvertimeMode(this.todaySummary()?.overtimeMode));
  readonly overtimePreviewLabel = computed(() => {
    const summary = this.todaySummary();
    if (this.isOutOfSchedulePointage()) {
      return '0 min';
    }
    const mode = this.overtimeMode();
    if (mode === 'WAITING_CONFIRMATION') {
      return this.asText(summary?.overtimeLabel) ?? 'En attente de confirmation';
    }
    if (mode === 'ACTIVE') {
      this.currentTime();
      return `${this.resolveLiveOvertimeMinutes(summary)} min`;
    }
    if (mode === 'FINISHED') {
      return `${this.resolveFrozenOvertimeMinutes(summary)} min`;
    }
    return '0 min';
  });
  readonly showOvertimeConfirmationModal = computed(() =>
    this.overtimeMode() === 'WAITING_CONFIRMATION'
    && this.todaySummary()?.showCheckoutAlert === true
    && this.attendanceState() === 'ACTIVE'
  );
  readonly latestOvertimeRequest = computed(() => this.overtimeRequests()[0] ?? null);
  readonly latestOvertimeStatusLabel = computed(() => this.formatOvertimeStatus(this.latestOvertimeRequest()?.status));
  readonly locationStatusLabel = computed(() => {
    const summary = this.todaySummary();
    const location = this.formatLocationLabel(this.resolveLatestLocation())
      ?? this.asText(summary?.checkOutLocationLabel)
      ?? this.asText(summary?.checkInLocationLabel);
    if (location) {
      return `📍 ${location}`;
    }

    switch (this.gpsStatus()) {
      case 'captured':
        return 'Position GPS capturee, adresse en attente';
      case 'requesting':
        return 'Capture GPS en cours...';
      case 'denied':
        return 'GPS refuse';
      case 'unavailable':
        return 'GPS indisponible';
      default:
        return 'GPS pret';
    }
  });
  readonly latestLocation = computed(() => this.resolveLatestLocation());
  readonly latestLocationLabel = computed(() => {
    const structured = this.formatLocationLabel(this.latestLocation());
    if (structured) {
      return structured;
    }

    const summary = this.todaySummary();
    const summaryLocation = this.asText(summary?.checkOutLocationLabel) ?? this.asText(summary?.checkInLocationLabel);
    if (summaryLocation) {
      return summaryLocation;
    }

    const latestLog = this.history().find(log => this.asText(log.location) || this.asText(log.address));
    return latestLog ? (this.asText(latestLog.location) ?? this.asText(latestLog.address)) : null;
  });
  readonly latestCoordinatesLabel = computed(() => this.formatLocationCoordinates(this.latestLocation()));

  private clockSub?: Subscription;
  private statsSub?: Subscription;

  ngOnInit(): void {
    this.updateDate();
    this.startClock();
    this.startStatsPolling();
    this.refreshOverview(() => this.pageReady.set(true));
    this.loadOvertimeRequests();

    this.horaireService.resolveHoraire()
      .pipe(catchError(() => of(null)))
      .subscribe(active => {
        this.todayHoraire.set(active);
      });

    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        const tool = event.actionResult?.tool;
        if (!event.actionResult?.executed || (tool !== 'clock_in' && tool !== 'clock_out')) {
          return;
        }

        this.statusMessage.set(null);
        this.refreshOverview();
        this.loadOvertimeRequests();
      });
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.statsSub?.unsubscribe();
  }

  onCheckIn(): void {
    if (this.isLoading()) {
      return;
    }

    if (this.attendanceState() !== 'NOT_STARTED' || this.todaySummary()?.canCheckIn === false) {
      const msg = this.resolveCheckInBlockedMessage();
      this.statusMessage.set(msg);
      this.toast.warning(msg);
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

  onCheckoutFromOvertimeModal(): void {
    if (this.isLoading()) {
      return;
    }
    this.performPointageAction(false);
  }

  onContinueOvertime(): void {
    if (this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.statusMessage.set(null);
    this.pointageService.continueOvertime().subscribe({
      next: () => {
        this.toast.success('Heures supplementaires activees.');
        this.refreshOverview(() => this.isLoading.set(false));
      },
      error: err => {
        const msg = this.pointageService.toFrenchError(err);
        this.statusMessage.set(msg);
        this.toast.error(msg);
        this.isLoading.set(false);
      }
    });
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

  private normalizeOvertimeMode(value: unknown): OvertimeMode {
    const mode = String(value ?? 'NONE').trim().toUpperCase();
    if (mode === 'WAITING_CONFIRMATION' || mode === 'ACTIVE' || mode === 'FINISHED') {
      return mode as OvertimeMode;
    }
    return 'NONE';
  }

  private resolveLiveOvertimeMinutes(summary: TodayPointageSummary | null): number {
    const startedAt = parseApiDate(summary?.overtimeStartedAt);
    const backendMinutes = this.resolveFrozenOvertimeMinutes(summary);
    if (!startedAt) {
      return backendMinutes;
    }
    const liveMinutes = Math.floor(Math.max(Date.now() - startedAt.getTime(), 0) / 60_000);
    return Math.max(liveMinutes, backendMinutes, 0);
  }

  private resolveFrozenOvertimeMinutes(summary: TodayPointageSummary | null): number {
    return Math.max(Number(summary?.overtimeMinutes ?? summary?.overtimePreview ?? 0), 0);
  }

  statusLabel(): string {
    switch (this.attendanceState()) {
      case 'ACTIVE':
        return 'Session démarrée';
      case 'CLOSED':
        return 'Journée clôturée';
      case 'ON_LEAVE':
        return 'Conge approuve';
      case 'HOLIDAY':
        return 'Jour ferie';
      case 'AUTO_CLOSED':
        return 'Sortie auto-cloturee';
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
        const gpsWarning = this.gpsError();
        if (gpsWarning) {
          this.statusMessage.set(gpsWarning);
          this.toast.warning(gpsWarning);
        }
        this.loadOvertimeRequests();
        this.refreshOverview(() => this.isLoading.set(false));
      },
      error: err => {
        if (this.pointageService.isSessionAlreadyOpenError(err)) {
          const msg = this.pointageService.toFrenchError(err);
          this.statusMessage.set(msg);
          this.toast.warning(msg);
          this.refreshOverview(() => this.isLoading.set(false));
          return;
        }

        const msg = this.pointageService.toFrenchError(err);
        const normalizedMsg = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        if (normalizedMsg.includes('conge approuve')) {
          this.isDayOff.set(true);
        }

        this.statusMessage.set(msg);
        this.toast.error(msg);
        this.isLoading.set(false);
      },
    });
  }

  onOvertimeReasonInput(event: Event): void {
    this.overtimeReasonDraft.set((event.target as HTMLTextAreaElement).value);
  }

  submitOvertimeReason(request: OvertimeRequestDto): void {
    const reason = this.overtimeReasonDraft().trim();
    if (!reason) {
      this.toast.warning('Justification requise.');
      return;
    }

    this.isSavingOvertimeReason.set(true);
    this.overtimeService.addReason(request.id, reason).subscribe({
      next: updated => {
        this.overtimeRequests.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.overtimeReasonDraft.set('');
        this.isSavingOvertimeReason.set(false);
        this.toast.success('Justification envoyee.');
      },
      error: () => {
        this.isSavingOvertimeReason.set(false);
        this.toast.error("Impossible d'envoyer la justification.");
      }
    });
  }

  formatOvertimeStatus(status?: string | null): string {
    switch (status) {
      case 'EN_ATTENTE_MANAGER':
      case 'PENDING_MANAGER':
      case 'PENDING_APPROVAL':
        return 'En attente manager';
      case 'APPROUVEE_MANAGER':
      case 'APPROVED_MANAGER':
      case 'APPROVED':
        return 'Approuvee manager';
      case 'REFUSEE_MANAGER':
      case 'REJECTED_MANAGER':
      case 'REJECTED':
        return 'Refusee manager';
      case 'EN_ATTENTE_RH':
      case 'PENDING_RH':
        return 'En attente RH';
      case 'APPROUVEE_RH':
      case 'APPROVED_RH':
        return 'Approuvee RH';
      case 'REFUSEE_RH':
      case 'REJECTED_RH':
        return 'Refusee RH';
      case 'CANCELLED':
        return 'Annulee';
      default:
        return 'Aucune demande';
    }
  }

  private loadOvertimeRequests(): void {
    this.overtimeService.getMy(0, 10).subscribe({
      next: page => this.overtimeRequests.set(page.content ?? []),
      error: () => this.overtimeRequests.set([])
    });
  }

  private resolveCheckInBlockedMessage(): string {
    const summary = this.todaySummary();
    const message = this.asText(summary?.reasonIfBlocked)
      ?? this.asText(summary?.leaveOrHolidayInfo)
      ?? this.asText(summary?.latestAlert);

    if (message) {
      return message;
    }

    switch (this.attendanceState()) {
      case 'ACTIVE':
        return 'Vous avez deja pointe votre entree aujourd hui.';
      case 'CLOSED':
        return 'Votre journee de pointage est deja cloturee.';
      case 'ON_LEAVE':
        return 'Vous ne pouvez pas pointer aujourd hui car vous etes en conge approuve.';
      case 'HOLIDAY':
        return 'Vous ne pouvez pas pointer aujourd hui car c est un jour ferie.';
      case 'AUTO_CLOSED':
        return 'Votre session precedente a ete cloturee automatiquement.';
      default:
        return 'Le pointage entree n est pas disponible pour le moment.';
    }
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

  private asText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  mapPoints(): AttendanceMapPoint[] {
    const points: AttendanceMapPoint[] = [];
    const checkIn = this.findPointForType('ENTREE');
    const checkOut = this.findPointForType('SORTIE');

    if (checkIn) {
      points.push(checkIn);
    }
    if (checkOut) {
      points.push(checkOut);
    }

    return points;
  }

  timelineLocationLabel(log: PointageEntry): string | null {
    return this.formatLocationLabel(log.locationDetails)
      ?? this.asText(log.location)
      ?? this.asText(log.address);
  }

  timelineCoordinateLabel(log: PointageEntry): string | null {
    return this.formatLocationCoordinates(log.locationDetails)
      ?? this.formatCoordinates(log.latitude, log.longitude);
  }

  formatLocationLabel(location?: PointageLocation | null): string | null {
    if (!location) {
      return null;
    }

    const city = this.asText(location.city);
    const country = this.asText(location.country);
    if (city && country) {
      return city.toLowerCase() === country.toLowerCase() ? city : `${city}, ${country}`;
    }
    if (city) {
      return city;
    }
    if (country) {
      return country;
    }

    return this.asText(location.region) ?? this.asText(location.address);
  }

  formatLocationCoordinates(location?: PointageLocation | null): string | null {
    return this.formatCoordinates(location?.latitude, location?.longitude);
  }

  private resolveLatestLocation(): PointageLocation | null {
    const summary = this.todaySummary();
    const summaryLocation = this.asLocation(summary?.checkOutLocation)
      ?? this.asLocation(summary?.checkInLocation);
    if (summaryLocation) {
      return summaryLocation;
    }

    const latestLog = this.history().find(log => this.hasCoordinates(log.locationDetails) || this.asText(log.address));
    if (latestLog?.locationDetails) {
      return latestLog.locationDetails;
    }
    if (latestLog) {
      return this.entryLocationFallback(latestLog);
    }
    return null;
  }

  private findPointForType(type: AttendanceMapPointType): AttendanceMapPoint | null {
    const log = this.history().find(item => {
      const fallback = this.entryLocationFallback(item);
      return item.type === type && (this.hasCoordinates(item.locationDetails) || this.hasCoordinates(fallback));
    });
    const logLocation = log?.locationDetails ?? (log ? this.entryLocationFallback(log) : null);
    if (this.hasCoordinates(logLocation)) {
      return {
        type,
        timestamp: log?.timestamp,
        label: type === 'ENTREE' ? 'Pointage entrée' : 'Pointage sortie',
        location: logLocation,
      };
    }

    const summary = this.todaySummary();
    const summaryLocation = type === 'ENTREE'
      ? this.asLocation(summary?.checkInLocation)
      : this.asLocation(summary?.checkOutLocation);
    if (summaryLocation?.latitude != null && summaryLocation.longitude != null) {
      return {
        type,
        timestamp: type === 'ENTREE'
          ? String(summary?.['checkIn'] ?? summary?.['heureEntree'] ?? '')
          : String(summary?.['checkOut'] ?? summary?.['heureSortie'] ?? ''),
        label: type === 'ENTREE' ? 'Pointage entrée' : 'Pointage sortie',
        location: summaryLocation,
      };
    }

    return null;
  }

  private entryLocationFallback(log: PointageEntry): PointageLocation | null {
    if (log.latitude == null || log.longitude == null) {
      return null;
    }
    return {
      latitude: log.latitude,
      longitude: log.longitude,
      accuracy: log.accuracy ?? null,
      address: log.address ?? null,
      city: null,
      region: null,
      country: null,
    };
  }

  private asLocation(value: unknown): PointageLocation | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const location = value as PointageLocation;
    if (!this.hasCoordinates(location) && !this.formatLocationLabel(location)) {
      return null;
    }
    return location;
  }

  private hasCoordinates(location?: PointageLocation | null): boolean {
    const lat = Number(location?.latitude);
    const lon = Number(location?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
  }

  private formatCoordinates(latitude: unknown, longitude: unknown): string | null {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}