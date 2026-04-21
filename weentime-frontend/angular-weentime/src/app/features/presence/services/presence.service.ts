import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, interval, map, Observable, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AttendanceDayStatus,
  AttendanceSession,
  AttendanceSessionStatus,
  CheckInRequest,
  CheckOutRequest,
  Presence,
  PresenceError,
  PresenceSource,
  PresenceStats,
} from '../models/presence.model';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { ToastService } from '../../../core/services/toast.service';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error: string | null;
  details: string | null;
  message?: string | null;
  timestamp?: string;
}

@Injectable({
  providedIn: 'root',
})
export class PresenceService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly todaySignal = signal<Presence | null>(null);
  private readonly historySignal = signal<AttendanceSession[]>([]);
  private readonly statsSignal = signal<PresenceStats | null>(null);
  private readonly errorSignal = signal<string | null>(null);

  private readonly todayLoadingSignal = signal(false);
  private readonly historyLoadingSignal = signal(false);
  private readonly statsLoadingSignal = signal(false);
  private readonly actionLoadingSignal = signal(false);
  private readonly timerSignal = signal(0);

  private timerSubscription: Subscription | null = null;

  readonly today = computed(() => this.todaySignal());
  readonly history = computed(() => this.historySignal());
  readonly stats = computed(() => this.statsSignal());
  readonly error = computed(() => this.errorSignal());

  readonly isLoadingToday = computed(() => this.todayLoadingSignal());
  readonly isLoadingHistory = computed(() => this.historyLoadingSignal());
  readonly isLoadingStats = computed(() => this.statsLoadingSignal());
  readonly isSubmitting = computed(() => this.actionLoadingSignal());
  readonly isLoading = computed(() =>
    this.todayLoadingSignal()
    || this.historyLoadingSignal()
    || this.statsLoadingSignal()
    || this.actionLoadingSignal()
  );

  readonly currentSession = computed(() => this.todaySignal()?.activeSession ?? null);
  readonly isWorking = computed(() => !!this.currentSession());
  readonly hasStartedToday = computed(() => (this.todaySignal()?.sessions?.length ?? 0) > 0);
  readonly isFinishedToday = computed(() => this.hasStartedToday() && !this.isWorking());

  readonly timerSeconds = computed(() => this.timerSignal());
  readonly formattedTimer = computed(() => this.formatDigitalDuration(this.timerSignal()));

  readonly uiState = computed<'NOT_STARTED' | 'WORKING' | 'FINISHED'>(() => {
    if (this.isWorking()) {
      return 'WORKING';
    }
    if (this.hasStartedToday()) {
      return 'FINISHED';
    }
    return 'NOT_STARTED';
  });

  readonly todayPresenceSignal = computed(() => this.todaySignal());
  readonly presenceHistorySignal = computed(() => this.historySignal());
  readonly loadingSignal = computed(() => this.isLoading());
  readonly isCheckedInSignal = computed(() => this.isWorking());
  readonly presence = computed(() => this.todaySignal());
  readonly loading = computed(() => this.isLoading());
  readonly formattedDuration = computed(() => this.formattedTimer());
  readonly isCheckedIn = computed(() => this.isWorking());

  readonly displayStatus = computed<AttendanceDayStatus>(() => this.todaySignal()?.status ?? AttendanceDayStatus.ABSENT);
  readonly formattedTime = computed(() => ({
    arrival: this.formatShortTime(this.todaySignal()?.heureEntree),
    departure: this.formatShortTime(this.todaySignal()?.heureSortie),
  }));
  readonly totalPresenceToday = computed(() => this.formatCompactDuration(this.timerSignal()));

  constructor() {
    effect(() => {
      const today = this.todaySignal();
      const baseSeconds = Number(today?.totalDuration ?? 0);
      this.timerSignal.set(Math.max(baseSeconds, 0));

      if (this.timerSubscription) {
        this.timerSubscription.unsubscribe();
        this.timerSubscription = null;
      }

      if (today?.activeSession) {
        this.timerSubscription = interval(1000)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.timerSignal.update(value => value + 1));
      }
    });
  }

  async checkIn(_location?: string): Promise<void> {
    if (this.actionLoadingSignal()) {
      return;
    }

    this.actionLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const payload: CheckInRequest = {
        source: PresenceSource.WEB,
        localisation: 'web',
      };
      const response = await firstValueFrom(
        this.http.post<ApiEnvelope<unknown>>(this.api.PRESENCE.CHECK_IN, payload)
      );
      this.applySummary(this.unwrap(response));
      this.toast.success('Pointage demarre');
      await Promise.allSettled([this.getHistory(), this.getStats()]);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.actionLoadingSignal.set(false);
    }
  }

  async checkOut(_location?: string): Promise<void> {
    if (this.actionLoadingSignal()) {
      return;
    }

    if (!this.isWorking()) {
      this.toast.warn('Aucune session ouverte a arreter.');
      return;
    }

    this.actionLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const payload: CheckOutRequest = { localisation: 'web' };
      const response = await firstValueFrom(
        this.http.post<ApiEnvelope<unknown>>(this.api.PRESENCE.CHECK_OUT, payload)
      );
      this.applySummary(this.unwrap(response));
      this.toast.success('Pointage cloture');
      await Promise.allSettled([this.getHistory(), this.getStats()]);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.actionLoadingSignal.set(false);
    }
  }

  async getToday(): Promise<void> {
    this.todayLoadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<ApiEnvelope<unknown>>(this.api.PRESENCE.GET_MY_TODAY)
      );
      this.applySummary(this.unwrap(response));
    } catch (error) {
      this.handleError(error, false);
      this.todaySignal.set(null);
    } finally {
      this.todayLoadingSignal.set(false);
    }
  }

  async getHistory(size: number = 30): Promise<void> {
    this.historyLoadingSignal.set(true);

    try {
      const response = await firstValueFrom(
        this.http.get<ApiEnvelope<unknown>>(`${this.api.PRESENCE.GET_MY_HISTORY}?page=0&size=${size}`)
      );
      const page = this.unwrap<any>(response);
      const content = Array.isArray(page?.content) ? page.content : [];
      this.historySignal.set(content.map((session: unknown) => this.mapSession(session)));
    } catch (error) {
      this.handleError(error, false);
      this.historySignal.set([]);
    } finally {
      this.historyLoadingSignal.set(false);
    }
  }

  async getStats(): Promise<void> {
    this.statsLoadingSignal.set(true);

    try {
      const response = await firstValueFrom(
        this.http.get<ApiEnvelope<unknown>>(this.api.PRESENCE.GET_MY_STATS)
      );
      this.statsSignal.set(this.mapStats(this.unwrap(response)));
    } catch (error) {
      this.handleError(error, false);
      this.statsSignal.set(null);
    } finally {
      this.statsLoadingSignal.set(false);
    }
  }

  async refresh(): Promise<void> {
    await Promise.allSettled([
      this.getToday(),
      this.getHistory(),
      this.getStats(),
    ]);
  }

  getPresenceStats(): Observable<PresenceStats> {
    return this.http
      .get<ApiEnvelope<unknown>>(this.api.PRESENCE.GET_MY_STATS)
      .pipe(map(response => this.mapStats(this.unwrap(response))));
  }

  async loadTodayPresence(): Promise<void> {
    await this.getToday();
  }

  async loadPresenceHistory(size: number = 30): Promise<void> {
    await this.getHistory(size);
  }

  async loadStats(): Promise<void> {
    await this.getStats();
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  private applySummary(summaryDto: unknown): void {
    this.todaySignal.set(this.mapPresence(summaryDto));
    this.errorSignal.set(null);
  }

  private handleError(error: unknown, notify: boolean = true): void {
    const presenceError = this.toPresenceError(error);
    this.errorSignal.set(presenceError.message);
    if (notify) {
      this.toast.error(presenceError.message);
    }
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'success' in (response as Record<string, unknown>)) {
      return (response as ApiEnvelope<T>).data;
    }
    return response as T;
  }

  private mapPresence(dto: any): Presence {
    const sessions = Array.isArray(dto?.sessions) ? dto.sessions.map((item: unknown) => this.mapSession(item)) : [];
    const activeSession = dto?.activeSession
      ? this.mapSession(dto.activeSession)
      : sessions.find((session: AttendanceSession) => session.status === AttendanceSessionStatus.OPEN) ?? null;

    return {
      utilisateurId: Number(dto?.utilisateurId ?? 0),
      date: dto?.date ?? new Date().toISOString().slice(0, 10),
      status: (dto?.status as AttendanceDayStatus) ?? AttendanceDayStatus.ABSENT,
      lateArrival: Boolean(dto?.lateArrival),
      hasOpenSession: Boolean(dto?.hasOpenSession),
      totalDuration: Number(dto?.totalDuration ?? 0),
      heureEntree: dto?.heureEntree ?? null,
      heureSortie: dto?.heureSortie ?? null,
      source: (dto?.source as PresenceSource) ?? null,
      activeSession,
      sessions,
    };
  }

  private mapSession(dto: any): AttendanceSession {
    return {
      id: Number(dto?.id ?? 0),
      utilisateurId: Number(dto?.utilisateurId ?? 0),
      date: dto?.date ?? '',
      checkInTime: dto?.checkInTime ?? '',
      checkOutTime: dto?.checkOutTime ?? null,
      duration: Number(dto?.duration ?? 0),
      status: (dto?.status as AttendanceSessionStatus) ?? AttendanceSessionStatus.CLOSED,
      source: (dto?.source as PresenceSource) ?? PresenceSource.WEB,
      localisation: dto?.localisation ?? null,
      lateArrival: Boolean(dto?.lateArrival),
      dailyStatus: (dto?.dailyStatus as AttendanceDayStatus) ?? AttendanceDayStatus.IDLE,
      createdAt: dto?.createdAt ?? '',
    };
  }

  private mapStats(dto: any): PresenceStats {
    return {
      dateFrom: dto?.dateFrom ?? '',
      dateTo: dto?.dateTo ?? '',
      totalPresent: Number(dto?.totalPresent ?? 0),
      totalAbsent: Number(dto?.totalAbsent ?? 0),
      lateCount: Number(dto?.lateCount ?? 0),
      totalHoursThisWeek: Number(dto?.totalHoursThisWeek ?? 0),
      totalHoursWorked: Number(dto?.totalHoursWorked ?? 0),
      averageArrivalTime: dto?.averageArrivalTime ?? '--:--',
      onTimeCount: Number(dto?.onTimeCount ?? 0),
      overtimeHours: Number(dto?.overtimeHours ?? 0),
      onTimeArrivals: Number(dto?.onTimeArrivals ?? 0),
      lateArrivals: Number(dto?.lateArrivals ?? 0),
    };
  }

  private toPresenceError(error: any): PresenceError {
    const payload = error?.error ?? {};
    const message = payload?.details || payload?.message || error?.message || 'Operation impossible';

    return {
      status: Number(error?.status ?? 0),
      code: payload?.error || 'UNKNOWN_ERROR',
      message,
      timestamp: payload?.timestamp,
    };
  }

  private formatShortTime(value: string | null | undefined): string {
    if (!value) {
      return '--:--';
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    const match = value.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '--:--';
  }

  private formatCompactDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  private formatDigitalDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
}
