import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable, tap, map, catchError, of, interval,
  Subscription, startWith, switchMap, throwError
} from 'rxjs';
import { PointageEntry, PointageStats } from './pointage.models';
import { AuthService } from '../../../core/services/auth.service';
import { ApiConfigService } from '../../../core/services/api-config.service';

@Injectable({ providedIn: 'root' })
export class PointageService {
  private http       = inject(HttpClient);
  private authService = inject(AuthService);
  private apiConfig  = inject(ApiConfigService);

  // ── État local ──────────────────────────────────────────────────────────────
  private _isCheckedIn = signal(false);
  isCheckedIn          = computed(() => this._isCheckedIn());

  sessionDuration   = signal<string>('00:00:00');
  sessionDurationMs = signal<number>(0);
  private tickerSub?: Subscription;

  constructor() {
    this.refreshStatus();
  }

  // ── API publique ────────────────────────────────────────────────────────────

  refreshStatus(): void {
    const user = this.authService.currentUser();
    if (!user) return;

    this.getActiveSession().pipe(
      switchMap(activeSession => {
        if (activeSession) return of(activeSession);

        return this.http.get<any>(this.apiConfig.PRESENCE.GET_MY_TODAY).pipe(
          map(response => this.unwrap(response)?.activeSession ?? null),
          catchError(() => of(null))
        );
      }),
      catchError(() => of(null))
    ).subscribe(activeSession => this.applyActiveSessionState(activeSession));
  }

  getTodayPointages(): Observable<PointageEntry[]> {
    const user = this.authService.currentUser();
    if (!user) return of([]);

    return this.http.get<any>(this.apiConfig.PRESENCE.GET_MY_TODAY).pipe(
      map(response => this.mapTodayToPointages(this.unwrap(response)))
    );
  }

  getWeeklyStats(): Observable<PointageStats> {
    const user = this.authService.currentUser();
    if (!user) return of({} as PointageStats);

    return this.http.get<any>(this.apiConfig.PRESENCE.GET_MY_STATS).pipe(
      map(response => this.mapStats(this.unwrap(response)))
    );
  }

  checkIn(): Observable<PointageEntry> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Utilisateur non connecté');

    return this.getActiveSession().pipe(
      switchMap(activeSession => {
        // ✅ FIX #1 : vérifier checkInTime et pas juste la présence de l'objet
        // Un objet vide {} retourné par l'API était truthy et bloquait le check-in
        if (activeSession?.checkInTime) {
          this.applyActiveSessionState(activeSession);
          return throwError(() => this.buildConflictError(
            'ATTENDANCE_SESSION_ALREADY_OPEN',
            'Session déjà ouverte'
          ));
        }

        return this.http.post<any>(this.apiConfig.PRESENCE.CHECK_IN, { source: 'WEB' }).pipe(
          map(response => this.unwrap(response)),
          tap(summary => this.applyActiveSessionState(summary?.activeSession ?? summary)),
          map(summary => this.mapSummaryToEntry(summary, 'ENTREE'))
        );
      })
    );
  }

  checkOut(): Observable<PointageEntry> {
    const user = this.authService.currentUser();
    if (!user) throw new Error('Utilisateur non connecté');

    return this.http.post<any>(this.apiConfig.PRESENCE.CHECK_OUT, {}).pipe(
      map(response => this.mapSummaryToEntry(this.unwrap(response), 'SORTIE')),
      tap(() => {
        this._isCheckedIn.set(false);
        this.stopGlobalTicker();
      })
    );
  }

  // ── Ticker de session ───────────────────────────────────────────────────────

  private stopGlobalTicker(): void {
    this.tickerSub?.unsubscribe();
    this.tickerSub = undefined;
    this.sessionDuration.set('00:00:00');
    this.sessionDurationMs.set(0);
  }

  private initializeTicker(startTime: string): void {
    const start = new Date(startTime).getTime();
    if (!Number.isFinite(start)) { this.stopGlobalTicker(); return; }

    this.stopGlobalTicker();
    this.tickerSub = interval(1000).pipe(startWith(0)).subscribe(() => {
      const diff = Math.max(0, Date.now() - start);
      this.sessionDurationMs.set(diff);
      this.sessionDuration.set(this.formatDuration(diff));
    });
  }

  private formatDuration(ms: number): string {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  // ── Session active ──────────────────────────────────────────────────────────

  private getActiveSession(): Observable<any | null> {
    return this.http.get<any>(this.apiConfig.PRESENCE.GET_ACTIVE_SESSION).pipe(
      map(response => {
        const data = this.unwrap(response);
        // ✅ FIX #2 : retourner null si pas de checkInTime pour éviter les faux positifs
        return data?.checkInTime ? data : null;
      }),
      catchError(() => of(null))
    );
  }

  private applyActiveSessionState(activeSession: any | null): void {
    // ✅ FIX #3 : même garde ici — on vérifie checkInTime
    if (activeSession?.checkInTime) {
      this._isCheckedIn.set(true);
      this.initializeTicker(activeSession.checkInTime);
      return;
    }
    this._isCheckedIn.set(false);
    this.stopGlobalTicker();
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private unwrap(response: any): any {
    return response?.data ?? response;
  }

  private buildConflictError(code: string, message: string) {
    return { status: 409, error: { code, error: message, message, details: message } };
  }

  private mapTodayToPointages(summary: any): PointageEntry[] {
    const sessions: any[] = Array.isArray(summary?.sessions) ? summary.sessions : [];
    return sessions.flatMap((session: any) => {
      const entries: PointageEntry[] = [];
      if (session?.checkInTime)  entries.push(this.mapSessionToEntry(session, 'ENTREE'));
      if (session?.checkOutTime) entries.push(this.mapSessionToEntry(session, 'SORTIE'));
      return entries;
    });
  }

  private mapSessionToEntry(session: any, type: 'ENTREE' | 'SORTIE'): PointageEntry {
    const timestamp = type === 'ENTREE' ? session?.checkInTime : session?.checkOutTime;

    // ✅ FIX #4 : calcul minutesRetard à partir de la durée réelle
    const rawDuration = Number(session?.duration || 0);
    const durationMin = Math.round(rawDuration / 60);

    return {
      id:             session?.id,
      utilisateurId:  Number(session?.utilisateurId || this.authService.currentUser()?.id || 0),
      type,
      timestamp,
      heureEntree:     session?.checkInTime,
      heureSortie:     session?.checkOutTime,
      duree:           rawDuration,
      dureeMinutes:    durationMin,
      estEnRetard:     session?.lateArrival === true,
      // ✅ FIX #5 : minutesRetard était toujours 0 — on le lit depuis lateMinutes si dispo
      minutesRetard:   Number(session?.lateMinutes ?? session?.minutesRetard ?? 0),
      isAutoClosed:    session?.autoClosed === true || session?.isAutoClosed === true,
      // ✅ FIX #6 : overtimeMinutes était absent du mapping — on le lit depuis le backend
      overtimeMinutes: Number(session?.overtimeMinutes ?? session?.overtime ?? 0) || undefined,
    };
  }

  private mapSummaryToEntry(summary: any, fallbackType: 'ENTREE' | 'SORTIE'): PointageEntry {
    const session =
      summary?.activeSession ??
      [...(summary?.sessions ?? [])].pop() ??
      summary;
    return this.mapSessionToEntry(session, fallbackType);
  }

  private mapStats(stats: any): PointageStats {
    const weekHours  = Number(stats?.totalHoursThisWeek ?? stats?.totalHoursWorked ?? 0);
    const late       = Number(stats?.lateCount ?? stats?.lateArrivals ?? 0);
    const onTime     = Number(stats?.onTimeCount ?? stats?.onTimeArrivals ?? 0);
    const total      = late + onTime;
    const ponctualitePct = total > 0 ? Math.round((onTime / total) * 100) : 100;

    const h = Math.floor(weekHours);
    const min = Math.round((weekHours % 1) * 60).toString().padStart(2, '0');

    // ✅ FIX #7 : heuresAujourdhui était toujours '00:00' — on le calcule depuis minutesToday
    const todayMin   = Number(stats?.minutesToday ?? stats?.minutesAujourdhui ?? 0);
    const todayH     = Math.floor(todayMin / 60);
    const todayMm    = (todayMin % 60).toString().padStart(2, '0');

    return {
      ponctualitePct,
      soldeConges:       Number(stats?.leaveBalance ?? stats?.soldeConges ?? 0),
      heuresAujourdhui:  `${todayH}h${todayMm}`,
      heuresSemaine:     `${h}h${min}`,
      minutesAujourdhui: todayMin,
      minutesSemaine:    Math.round(weekHours * 60),
      joursParStatus:    this.buildWeekStatus(stats),
    };
  }

  private buildWeekStatus(stats: any) {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const days  = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    return days.map(day => ({
      jour:          day,
      // ✅ FIX #8 : on ne présume plus RETARD pour tous les jours si lateCount > 0
      // On marque RETARD uniquement sur le jour actuel SI lateCount > 0
      statut: (day === today && Number(stats?.lateCount ?? 0) > 0)
        ? 'RETARD' as const
        : 'OK' as const,
      minutes:        0,
      objectifHeures: 8,
    }));
  }
}

// ── Utilitaire ─────────────────────────────────────────────────────────────────
function pad(n: number): string { return n.toString().padStart(2, '0'); }