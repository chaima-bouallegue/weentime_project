import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, Subscription, catchError, forkJoin, interval, map, of, startWith, switchMap, tap, throwError } from 'rxjs';

import { ApiConfigService } from '../../../core/services/api-config.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/request-context.tokens';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { normalizeAttendanceSnapshot } from '../../../core/utils/attendance-state.mapper';
import { diffMinutes, parseApiDate } from '../../../core/utils/date-time.util';
import { AttendanceUiState, DayStatus, PointageEntry, PointageStats } from './pointage.models';

@Injectable({ providedIn: 'root' })
export class PointageService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly dashboardService = inject(DashboardService);
  private readonly optionalRequestContext = new HttpContext().set(SKIP_ERROR_TOAST, true);

  private readonly _isCheckedIn = signal(false);
  readonly isCheckedIn = computed(() => this._isCheckedIn());

  private readonly _attendanceState = signal<AttendanceUiState>('NOT_STARTED');
  readonly attendanceState = computed(() => this._attendanceState());

  private readonly _checkInTime = signal<string | null>(null);
  readonly checkInTime = computed(() => this._checkInTime());

  private readonly _checkOutTime = signal<string | null>(null);
  readonly checkOutTime = computed(() => this._checkOutTime());

  private readonly _lastError = signal<string | null>(null);
  readonly lastError = computed(() => this._lastError());

  readonly sessionDuration = signal<string>('00:00:00');
  readonly sessionDurationMs = signal<number>(0);
  private tickerSub?: Subscription;
  private readonly statusPollSub: Subscription;

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (!user?.id) {
        this.resetSessionSignals();
        return;
      }
      this.refreshStatus();
    });

    this.statusPollSub = interval(60_000).subscribe(() => {
      if (this.authService.currentUser()?.id) {
        this.refreshStatus();
      }
    });
  }

  refreshStatus(): void {
    this.loadTodayStatus().subscribe();
  }

  loadTodayStatus(): Observable<AttendanceUiState> {
    const user = this.authService.currentUser();
    if (!user) {
      this.resetSessionSignals();
      return of('NOT_STARTED');
    }

    return this.getTodaySummary().pipe(
      tap(summary => this.applyTodayState(summary)),
      map(() => this._attendanceState()),
      catchError(error => {
        this.handleTodaySyncError(error);
        return of(this._attendanceState());
      })
    );
  }

  getTodayPointages(): Observable<PointageEntry[]> {
    const user = this.authService.currentUser();
    if (!user) {
      return of([]);
    }

    const params = new HttpParams().set('page', '0').set('size', '40');
    const todayKey = new Date().toLocaleDateString('en-CA');

    return this.http.get<any>(this.apiConfig.PRESENCE.GET_MY_HISTORY, { params }).pipe(
      map(response => this.unwrap(response)),
      map(payload => {
        const content = this.extractHistoryContent(payload);
        const todaySessions = content.filter(item => this.isSameDay(
          item?.date,
          this.extractDateValue(item, ['checkInTime', 'checkIn', 'heureEntree', 'heureArrivee', 'entryTime']),
          todayKey
        ));
        return this.mapHistorySessionsToPointages(todaySessions);
      }),
      catchError(() => of([]))
    );
  }

  getWeeklyStats(): Observable<PointageStats> {
    const user = this.authService.currentUser();
    if (!user) {
      return of(this.emptyStats());
    }

    const currentYear = new Date().getFullYear();
    return forkJoin({
      today: this.getTodaySummary().pipe(catchError(() => of(null))),
      myStats: this.http.get<any>(this.apiConfig.PRESENCE.GET_MY_STATS).pipe(
        map(response => this.unwrap(response)),
        catchError(() => of(null))
      ),
      leaveBalance: this.http.get<any>(this.apiConfig.RH.GET_LEAVE_BALANCE(currentYear), {
        context: this.optionalRequestContext
      }).pipe(
        map(response => this.unwrap(response)),
        catchError(() => of([]))
      )
    }).pipe(
      map(({ today, myStats, leaveBalance }) => this.mapStats(today, myStats, leaveBalance)),
      catchError(() => of(this.emptyStats()))
    );
  }

  checkIn(): Observable<PointageEntry> {
    const user = this.authService.currentUser();
    if (!user) {
      return throwError(() => new Error('Utilisateur non connecté.'));
    }

    return this.http.post<any>(this.apiConfig.PRESENCE.CHECK_IN, { source: 'WEB' }).pipe(
      map(response => this.unwrap(response)),
      tap(summary => {
        this.applyTodayState(summary);
        this.invalidateDashboards();
      }),
      switchMap(summary => this.refreshTodayAfterMutation(summary)),
      map(summary => this.mapSummaryToEntry(summary, 'ENTREE')),
      catchError(error => {
        if (this.isSessionAlreadyOpenError(error)) {
          this.loadTodayStatus().subscribe();
        } else {
          this._attendanceState.set('ERROR');
          this._lastError.set(this.toFrenchError(error));
        }
        return throwError(() => error);
      })
    );
  }

  checkOut(): Observable<PointageEntry> {
    const user = this.authService.currentUser();
    if (!user) {
      return throwError(() => new Error('Utilisateur non connecté.'));
    }

    return this.http.post<any>(this.apiConfig.PRESENCE.CHECK_OUT, {}).pipe(
      map(response => this.unwrap(response)),
      tap(summary => {
        this.applyTodayState(summary);
        this.invalidateDashboards();
      }),
      switchMap(summary => this.refreshTodayAfterMutation(summary)),
      map(summary => this.mapSummaryToEntry(summary, 'SORTIE')),
      catchError(error => {
        this._attendanceState.set('ERROR');
        this._lastError.set(this.toFrenchError(error));
        return throwError(() => error);
      })
    );
  }

  isSessionAlreadyOpenError(error: any): boolean {
    const code = String(error?.error?.code ?? error?.error?.error ?? '').toUpperCase();
    const details = String(error?.error?.details ?? error?.error?.message ?? '').toLowerCase();

    if (error?.status === 409 && (code.includes('ALREADY_OPEN') || details.includes('already open') || details.includes('session ouverte'))) {
      return true;
    }

    return code.includes('ALREADY_OPEN');
  }

  toFrenchError(error: any): string {
    if (this.isSessionAlreadyOpenError(error)) {
      return 'Session déjà démarrée. Synchronisation en cours.';
    }

    const details = String(error?.error?.details ?? error?.error?.message ?? error?.error?.error ?? '').toLowerCase();

    if (error?.status === 403 || details.includes('leave') || details.includes('congé') || details.includes('conge')) {
      return 'Vous avez un congé approuvé aujourd’hui.';
    }

    if (error?.status === 400) {
      return 'Action de pointage invalide. Veuillez synchroniser puis réessayer.';
    }

    if ((error?.status ?? 0) >= 500) {
      return 'Erreur serveur temporaire. Veuillez réessayer.';
    }

    return 'Une erreur est survenue lors du pointage.';
  }

  private getTodaySummary(): Observable<any> {
    return this.http.get<any>(this.apiConfig.PRESENCE.GET_MY_TODAY).pipe(
      map(response => this.unwrap(response))
    );
  }

  private applyTodayState(summary: any | null): void {
    if (!summary) {
      this._attendanceState.set('NOT_STARTED');
      this._isCheckedIn.set(false);
      this._lastError.set(null);
      this.stopGlobalTicker();
      return;
    }

    const snapshot = normalizeAttendanceSnapshot(summary);
    const activeSessionStart = snapshot.activeSession?.checkInTime ?? snapshot.checkInTime ?? null;

    this._checkInTime.set(snapshot.checkInTime);
    this._checkOutTime.set(snapshot.checkOutTime);
    this._lastError.set(null);

    this._attendanceState.set(snapshot.state);
    this._isCheckedIn.set(snapshot.state === 'ACTIVE');

    if (snapshot.state === 'ACTIVE' && activeSessionStart) {
      this.initializeTicker(activeSessionStart);
      return;
    }

    this.stopGlobalTicker();
  }

  private resetSessionSignals(): void {
    this._isCheckedIn.set(false);
    this._attendanceState.set('NOT_STARTED');
    this._checkInTime.set(null);
    this._checkOutTime.set(null);
    this._lastError.set(null);
    this.stopGlobalTicker();
  }

  private stopGlobalTicker(): void {
    this.tickerSub?.unsubscribe();
    this.tickerSub = undefined;
    this.sessionDuration.set('00:00:00');
    this.sessionDurationMs.set(0);
  }

  private initializeTicker(startTime: string): void {
    const startDate = parseApiDate(startTime);
    if (!startDate) {
      this.stopGlobalTicker();
      return;
    }

    this.stopGlobalTicker();
    this.tickerSub = interval(1000).pipe(startWith(0)).subscribe(() => {
      const elapsedMinutes = diffMinutes(startDate, new Date());
      const exactMs = Math.max(0, Date.now() - startDate.getTime());
      const diffMs = Math.max(elapsedMinutes * 60_000, exactMs);
      this.sessionDurationMs.set(diffMs);
      this.sessionDuration.set(this.formatDuration(diffMs));
    });
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  private unwrap(response: any): any {
    return response?.data ?? response;
  }

  private mapHistorySessionsToPointages(sessions: any[]): PointageEntry[] {
    const entries = sessions.flatMap((session: any) => {
      const hasCheckIn = !!this.extractDateValue(session, ['checkInTime', 'checkIn', 'heureEntree', 'heureArrivee', 'entryTime']);
      const hasCheckOut = !!this.extractDateValue(session, ['checkOutTime', 'checkOut', 'heureSortie', 'heureDepart', 'exitTime']);
      const points: PointageEntry[] = [];
      if (hasCheckIn) {
        points.push(this.mapSessionToEntry(session, 'ENTREE'));
      }
      if (hasCheckOut) {
        points.push(this.mapSessionToEntry(session, 'SORTIE'));
      }
      return points;
    });

    return entries.sort((left, right) => this.toDateMs(right.timestamp) - this.toDateMs(left.timestamp));
  }

  private mapSessionToEntry(session: any, type: 'ENTREE' | 'SORTIE'): PointageEntry {
    const checkInTime = this.extractDateValue(session, ['checkInTime', 'checkIn', 'heureEntree', 'heureArrivee', 'entryTime']);
    const checkOutTime = this.extractDateValue(session, ['checkOutTime', 'checkOut', 'heureSortie', 'heureDepart', 'exitTime']);
    const timestamp = (type === 'ENTREE' ? checkInTime : checkOutTime) ?? new Date().toISOString();
    const rawDuration = Number(
      session?.duration
      ?? session?.workedSeconds
      ?? session?.durationSeconds
      ?? session?.totalSeconds
      ?? session?.duree
      ?? 0
    );

    return {
      id: session?.id,
      utilisateurId: Number(session?.utilisateurId ?? session?.userId ?? this.authService.currentUser()?.id ?? 0),
      type,
      timestamp,
      heureEntree: checkInTime ?? undefined,
      heureSortie: checkOutTime ?? undefined,
      duree: rawDuration,
      dureeMinutes: Math.round(rawDuration / 60),
      estEnRetard: session?.lateArrival === true,
      minutesRetard: Number(session?.lateMinutes ?? session?.minutesRetard ?? 0),
      isAutoClosed: session?.autoClosed === true || session?.isAutoClosed === true,
      overtimeMinutes: Number(session?.overtimeMinutes ?? session?.overtime ?? 0) || undefined,
    };
  }

  private mapSummaryToEntry(summary: any, fallbackType: 'ENTREE' | 'SORTIE'): PointageEntry {
    const snapshot = normalizeAttendanceSnapshot(summary);
    const session = snapshot.activeSession?.raw
      ?? [...snapshot.sessions.map(item => item.raw)].pop()
      ?? (summary ?? {});
    return this.mapSessionToEntry(session, fallbackType);
  }

  private mapStats(todaySummary: any, stats: any, leaveBalance: any): PointageStats {
    const weekHours = this.toNumber(stats?.totalHoursThisWeek ?? stats?.totalHoursWorked);
    const late = this.toNumber(stats?.lateCount ?? stats?.lateArrivals);
    const onTime = this.toNumber(stats?.onTimeCount ?? stats?.onTimeArrivals);
    const total = late + onTime;
    const ponctualitePct = total > 0 ? Math.round((onTime / total) * 100) : 100;

    const todaySeconds = this.toNumber(
      todaySummary?.totalDuration
      ?? todaySummary?.workedSeconds
      ?? todaySummary?.durationSeconds
      ?? todaySummary?.totalSeconds
    );
    const todayMinutes = Math.floor(todaySeconds / 60);
    const weekMinutes = Math.round(weekHours * 60);
    const leaveDays = this.ensureArray<any>(leaveBalance)
      .map(item => this.toNumber(item?.joursRestants))
      .reduce((sum, value) => sum + value, 0);

    return {
      ponctualitePct,
      soldeConges: Number(leaveDays.toFixed(1)),
      heuresAujourdhui: this.minutesToHourLabel(todayMinutes),
      heuresSemaine: this.minutesToHourLabel(weekMinutes),
      minutesAujourdhui: todayMinutes,
      minutesSemaine: weekMinutes,
      joursParStatus: this.mapWeekStatuses(stats?.dailyStatuses),
    };
  }

  private mapWeekStatuses(dailyStatuses: any): DayStatus[] {
    const fromStats = this.ensureArray<any>(dailyStatuses);
    if (fromStats.length > 0) {
      return fromStats
        .map(item => {
          const date = parseApiDate(item?.date);
          const minutes = Math.max(0, Math.floor(this.toNumber(item?.workedSeconds) / 60));
          const isWorkingDay = item?.workingDay !== false;
          return {
            jour: this.weekdayAbbreviation(date),
            statut: isWorkingDay ? this.mapAttendanceStatus(item?.status) : ('OFF' as const),
            minutes,
            objectifHeures: 8,
          } as DayStatus;
        })
        .filter(item => item.jour.length > 0);
    }

    const weekOrder = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return weekOrder.map(day => {
      const weekend = day === 'SAT' || day === 'SUN';
      return {
        jour: day,
        statut: weekend ? 'OFF' : 'ABSENT',
        minutes: 0,
        objectifHeures: 8,
      } as DayStatus;
    });
  }

  private extractHistoryContent(payload: any): any[] {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.content)) {
      return payload.content;
    }
    if (Array.isArray(payload?.sessions)) {
      return payload.sessions;
    }
    return [];
  }

  private isSameDay(rawDate: unknown, fallbackDateTime: unknown, todayKey: string): boolean {
    const dateString = typeof rawDate === 'string' ? rawDate : '';
    if (dateString) {
      return dateString.slice(0, 10) === todayKey;
    }

    const fallback = parseApiDate(fallbackDateTime);
    if (!fallback) {
      return false;
    }

    return fallback.toLocaleDateString('en-CA') === todayKey;
  }

  private handleTodaySyncError(error: any): void {
    this._lastError.set(this.toFrenchError(error));
    const currentState = this._attendanceState();
    if (currentState !== 'ACTIVE' && currentState !== 'CLOSED') {
      this._attendanceState.set('NOT_STARTED');
      this._isCheckedIn.set(false);
      this.stopGlobalTicker();
    }
  }

  private refreshTodayAfterMutation(summary: any): Observable<any> {
    return this.getTodaySummary().pipe(
      tap(today => this.applyTodayState(today)),
      map(today => today ?? summary),
      catchError(error => {
        this.handleTodaySyncError(error);
        return of(summary);
      })
    );
  }

  private extractDateValue(source: any, keys: string[]): string | null {
    if (!source || typeof source !== 'object') {
      return null;
    }

    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private mapAttendanceStatus(rawStatus: unknown): DayStatus['statut'] {
    const status = String(rawStatus ?? '').toUpperCase();
    switch (status) {
      case 'LATE':
      case 'RETARD':
        return 'RETARD';
      case 'ABSENT':
        return 'ABSENT';
      case 'ON_LEAVE':
        return 'OFF';
      default:
        return 'OK';
    }
  }

  private weekdayAbbreviation(date: Date | null): string {
    if (!date) {
      return '';
    }
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase();
  }

  private minutesToHourLabel(minutes: number): string {
    const safe = Math.max(0, Math.floor(minutes));
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${hours}h${mins.toString().padStart(2, '0')}`;
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private ensureArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
  }

  private toDateMs(value: unknown): number {
    const date = parseApiDate(value);
    return date ? date.getTime() : 0;
  }

  private emptyStats(): PointageStats {
    return {
      ponctualitePct: 100,
      soldeConges: 0,
      heuresAujourdhui: '0h00',
      heuresSemaine: '0h00',
      minutesAujourdhui: 0,
      minutesSemaine: 0,
      joursParStatus: [],
    };
  }

  private invalidateDashboards(): void {
    this.dashboardService.clearCache();
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

