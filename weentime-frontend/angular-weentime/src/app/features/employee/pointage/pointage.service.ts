import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, Subscription, catchError, forkJoin, from, interval, map, of, startWith, switchMap, tap, throwError } from 'rxjs';

import { ApiConfigService } from '../../../core/services/api-config.service';
import { SKIP_ERROR_TOAST } from '../../../core/http/request-context.tokens';
import { AuthService } from '../../../core/services/auth.service';
import { DashboardService } from '../../dashboard/dashboard.service';
import { normalizeAttendanceSnapshot } from '../../../core/utils/attendance-state.mapper';
import { diffMinutes, parseApiDate } from '../../../core/utils/date-time.util';
import { AttendanceUiState, DayStatus, GpsCaptureStatus, PointageEntry, PointageLocation, PointageStats, TodayPointageSummary } from './pointage.models';

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

  private readonly _todaySummary = signal<TodayPointageSummary | null>(null);
  readonly todaySummary = computed(() => this._todaySummary());

  private readonly _gpsStatus = signal<GpsCaptureStatus>('idle');
  readonly gpsStatus = computed(() => this._gpsStatus());

  private readonly _gpsError = signal<string | null>(null);
  readonly gpsError = computed(() => this._gpsError());

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

    return from(this.captureGpsPayload()).pipe(
      switchMap(locationPayload => this.http.post<any>(this.apiConfig.PRESENCE.CHECK_IN, {
        source: 'WEB',
        localisation: 'web',
        ...locationPayload
      }))
    ).pipe(
      map(response => this.unwrap(response)),
      tap(summary => {
        this.applyTodayState(summary);
        this.invalidateDashboards();
        // Relire après 4s pour récupérer le géocodage Nominatim async
        setTimeout(() => this.refreshStatus(), 4000);
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

    return from(this.captureGpsPayload()).pipe(
      switchMap(locationPayload => this.http.post<any>(this.apiConfig.PRESENCE.CHECK_OUT, {
        source: 'WEB',
        localisation: 'web',
        ...locationPayload
      }))
    ).pipe(
      map(response => this.unwrap(response)),
      tap(summary => {
        this.applyTodayState(summary);
        this.invalidateDashboards();
        // Relire après 4s pour récupérer le géocodage Nominatim async
        setTimeout(() => this.refreshStatus(), 4000);
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

  continueOvertime(): Observable<TodayPointageSummary> {
    const user = this.authService.currentUser();
    if (!user) {
      return throwError(() => new Error('Utilisateur non connecte.'));
    }

    return this.http.post<any>(this.apiConfig.PRESENCE.CONTINUE_OVERTIME, {}).pipe(
      map(response => this.unwrap(response) as TodayPointageSummary),
      tap(summary => {
        this.applyTodayState(summary);
        this.invalidateDashboards();
      }),
      switchMap(summary => this.refreshTodayAfterMutation(summary)),
      catchError(error => {
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
    const code = String(error?.error?.error ?? error?.error?.code ?? '').toUpperCase();

    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (error?.status === 0) {
      return 'Service de pointage indisponible. Reessayez plus tard.';
    }

    if (error?.status === 401) {
      return 'Session expiree. Reconnectez-vous.';
    }

    if (code.includes('ATTENDANCE_ALREADY_CHECKED_IN')) {
      return 'Vous avez deja pointe votre entree aujourd hui.';
    }

    if (code.includes('ATTENDANCE_ALREADY_CHECKED_OUT')) {
      return 'Vous avez deja pointe votre sortie aujourd hui.';
    }

    if (code.includes('ATTENDANCE_SESSION_NOT_OPEN')) {
      return 'Vous devez pointer votre entree avant de pointer votre sortie.';
    }

    if (details.includes('leave') || details.includes('congé') || details.includes('conge')) {
      return 'Vous avez un congé approuvé aujourd’hui.';
    }

    if (error?.status === 403) {
      return 'Acces refuse pour le pointage.';
    }

    if (code.includes('ATTENDANCE_ON_HOLIDAY') || details.includes('jour ferie') || details.includes('holiday')) {
      return 'Vous ne pouvez pas pointer aujourd hui car c est un jour ferie.';
    }

    if (code.includes('GPS_REQUIRED')) {
      return 'La localisation GPS est requise pour le pointage.';
    }

    if (code.includes('GPS_INVALID')) {
      return 'Coordonnees GPS invalides.';
    }

    if (error?.status === 400) {
      return 'Action de pointage invalide. Veuillez synchroniser puis réessayer.';
    }

    if ((error?.status ?? 0) >= 500) {
      return 'Erreur serveur temporaire. Veuillez réessayer.';
    }

    return 'Une erreur est survenue lors du pointage.';
  }

  private captureGpsPayload(): Promise<Record<string, number>> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this._gpsStatus.set('unavailable');
      this._gpsError.set('Geolocalisation indisponible sur ce navigateur.');
      return Promise.resolve({});
    }

    this._gpsStatus.set('requesting');
    this._gpsError.set(null);

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => {
          this._gpsStatus.set('captured');
          this._gpsError.set(null);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        error => {
          this._gpsStatus.set(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
          this._gpsError.set(error.code === error.PERMISSION_DENIED
            ? 'Localisation refusee par le navigateur.'
            : 'Impossible de recuperer la position GPS.');
          resolve({});
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
      );
    });
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
      this._todaySummary.set(null);
      this.stopGlobalTicker();
      return;
    }

    const snapshot = normalizeAttendanceSnapshot(summary);
    const backendStatus = String(summary?.status ?? summary?.state ?? '').toUpperCase();
    const mappedState = this.mapBackendState(snapshot.state, backendStatus);
    const activeSessionStart = snapshot.activeSession?.checkInTime ?? snapshot.checkInTime ?? null;

    this._checkInTime.set(snapshot.checkInTime);
    this._checkOutTime.set(snapshot.checkOutTime);
    this._lastError.set(null);
    this._todaySummary.set(summary as TodayPointageSummary);

    this._attendanceState.set(mappedState);
    this._isCheckedIn.set(mappedState === 'ACTIVE');

    if (mappedState === 'ACTIVE' && activeSessionStart) {
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
    this._todaySummary.set(null);
    this._lastError.set(null);
    this.stopGlobalTicker();
  }

  private mapBackendState(snapshotState: AttendanceUiState, backendStatus: string): AttendanceUiState {
    if (backendStatus === 'ON_LEAVE') {
      return 'ON_LEAVE';
    }
    if (backendStatus === 'HOLIDAY') {
      return 'HOLIDAY';
    }
    if (backendStatus === 'AUTO_CLOSED' || backendStatus === 'MISSING_CHECKOUT') {
      return 'AUTO_CLOSED';
    }
    return snapshotState;
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
    let latitude = this.extractCoordinate(session, type === 'ENTREE'
      ? ['checkInLatitude', 'latitude']
      : ['checkOutLatitude', 'latitude']);
    let longitude = this.extractCoordinate(session, type === 'ENTREE'
      ? ['checkInLongitude', 'longitude']
      : ['checkOutLongitude', 'longitude']);
    let accuracy = this.extractCoordinate(session, type === 'ENTREE'
      ? ['checkInAccuracy', 'accuracy']
      : ['checkOutAccuracy', 'accuracy']);
    const locationDetails = this.extractPointageLocation(session, type, latitude, longitude, accuracy);
    latitude = this.toFiniteNumber(locationDetails?.latitude) ?? latitude;
    longitude = this.toFiniteNumber(locationDetails?.longitude) ?? longitude;
    accuracy = this.toFiniteNumber(locationDetails?.accuracy) ?? accuracy;
    const location = this.formatLocationDisplay(locationDetails)
      ?? this.resolveSessionLocation(session, type, latitude, longitude);
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
      latitude,
      longitude,
      accuracy,
      address: locationDetails?.address ?? location ?? undefined,
      location: location ?? undefined,
      locationDetails,
      checkInLocation: this.extractLocationLabel(session, 'ENTREE') ?? undefined,
      checkOutLocation: this.extractLocationLabel(session, 'SORTIE') ?? undefined,
      latestAlert: typeof session?.latestAlert === 'string' ? session.latestAlert : undefined,
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

  private resolveSessionLocation(session: any, type: 'ENTREE' | 'SORTIE', latitude?: number, longitude?: number): string | null {
    const location = this.extractLocationLabel(session, type);
    return location ?? this.formatCoordinates(latitude, longitude);
  }

  private extractPointageLocation(
    session: any,
    type: 'ENTREE' | 'SORTIE',
    latitude?: number,
    longitude?: number,
    accuracy?: number
  ): PointageLocation | null {
    if (!session || typeof session !== 'object') {
      return this.buildLocationDetails(latitude, longitude, accuracy, null, null, null, null);
    }

    const rawLocation = type === 'ENTREE' ? session.checkInLocation : session.checkOutLocation;
    const rawObject = rawLocation && typeof rawLocation === 'object' ? rawLocation as Record<string, unknown> : null;
    const address = this.extractText(rawObject, ['address'])
      ?? (type === 'ENTREE'
        ? this.extractText(session, ['checkInAddress', 'address'])
        : this.extractText(session, ['checkOutAddress', 'address']));

    return this.buildLocationDetails(
      this.toFiniteNumber(rawObject?.['latitude']) ?? latitude,
      this.toFiniteNumber(rawObject?.['longitude']) ?? longitude,
      this.toFiniteNumber(rawObject?.['accuracy']) ?? accuracy,
      address,
      this.extractText(rawObject, ['city']),
      this.extractText(rawObject, ['region']),
      this.extractText(rawObject, ['country'])
    );
  }

  private buildLocationDetails(
    latitude?: number | null,
    longitude?: number | null,
    accuracy?: number | null,
    address?: string | null,
    city?: string | null,
    region?: string | null,
    country?: string | null
  ): PointageLocation | null {
    const safeLatitude = this.toFiniteNumber(latitude);
    const safeLongitude = this.toFiniteNumber(longitude);
    const safeAccuracy = this.toFiniteNumber(accuracy);
    const hasCoordinates = safeLatitude !== undefined && safeLongitude !== undefined;
    const hasReadableLocation = [address, city, region, country].some(value => typeof value === 'string' && value.trim().length > 0);

    if (!hasCoordinates && !hasReadableLocation) {
      return null;
    }

    return {
      latitude: safeLatitude ?? null,
      longitude: safeLongitude ?? null,
      accuracy: safeAccuracy ?? null,
      address: address ?? null,
      city: city ?? null,
      region: region ?? null,
      country: country ?? null,
    };
  }

  private extractLocationLabel(source: any, type: 'ENTREE' | 'SORTIE'): string | null {
    if (!source || typeof source !== 'object') {
      return null;
    }

    const label = type === 'ENTREE'
      ? this.extractText(source, ['checkInLocationLabel', 'checkInAddress', 'address', 'location'])
      : this.extractText(source, ['checkOutLocationLabel', 'checkOutAddress', 'address', 'location']);
    if (label) {
      return label;
    }

    const rawLocation = type === 'ENTREE' ? source.checkInLocation : source.checkOutLocation;
    if (rawLocation && typeof rawLocation === 'object') {
      return this.formatLocationDisplay(rawLocation as PointageLocation);
    }

    return null;
  }

  private formatLocationDisplay(location?: PointageLocation | null): string | null {
    if (!location) {
      return null;
    }

    const city = this.normalizeLocationPart(location.city);
    const country = this.normalizeLocationPart(location.country);
    if (city && country) {
      return city.toLowerCase() === country.toLowerCase() ? city : `${city}, ${country}`;
    }
    if (city) {
      return city;
    }
    if (country) {
      return country;
    }

    const region = this.normalizeLocationPart(location.region);
    if (region) {
      return region;
    }

    return this.normalizeLocationPart(location.address);
  }

  private normalizeLocationPart(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private extractText(source: any, keys: string[]): string | null {
    if (!source || typeof source !== 'object') {
      return null;
    }

    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (value && typeof value === 'object') {
        const label = this.formatLocationDisplay(value as PointageLocation);
        if (label) {
          return label;
        }
      }
    }

    return null;
  }

  private extractCoordinate(source: any, keys: string[]): number | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }

    for (const key of keys) {
      const value = Number(source[key]);
      if (Number.isFinite(value)) {
        return value;
      }
    }

    return undefined;
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private formatCoordinates(latitude?: number, longitude?: number): string | null {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return `${latitude!.toFixed(4)}, ${longitude!.toFixed(4)}`;
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

