import { Injectable, inject, signal, computed, DestroyRef } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { ToastService } from '@app/core/services/toast.service';
import { Observable, of } from 'rxjs';
import { tap, catchError, finalize, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface PresenceDTO {
  id: number;
  utilisateurId: number;
  date: string;
  heureEntree?: string;
  heureSortie?: string;
  totalHeuresTravaillees?: number;
  status: string;
}

export interface PresenceRecord {
  id?: number;
  utilisateurId: number;
  heureArrivee?: string;
  heureDepart?: string;
  date: string;
  status: 'CHECKED_IN' | 'CHECKED_OUT' | 'ABSENT' | 'LATE';
  dureeActuelle?: number;
}

export interface PresenceStatsDTO {
  totalPresent: number;
  totalAbsent: number;
  lateCount: number;
  totalHoursWorked: number;
  totalHoursThisWeek: number;
  averageArrivalTime: string;
  onTimeCount: number;
  overtimeHours: number;
  onTimeArrivals: number;
  lateArrivals: number;
}

export interface FormattedTime {
  arrival: string;
  departure: string;
}

@Injectable({ providedIn: 'root' })
export class PresenceService {

  private http = inject(HttpClient);
  private api = inject(ApiConfigService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  todayPresenceSignal = signal<PresenceRecord | null>(null);
  presenceHistorySignal = signal<PresenceRecord[]>([]);
  isCheckedInSignal = signal(false);
  loadingSignal = signal(false);

  /**
   * Computed property: formatted arrival/departure times
   */
  formattedTime = computed(() => {
    const presence = this.todayPresenceSignal();
    return {
      arrival: presence?.heureArrivee ? this.formatTime(presence.heureArrivee) : '--:--',
      departure: presence?.heureDepart ? this.formatTime(presence.heureDepart) : '--:--'
    };
  });

  /**
   * Computed property: total presence time today in hours and minutes
   */
  totalPresenceToday = computed(() => {
    const presence = this.todayPresenceSignal();
    if (!presence?.heureArrivee) return '0h 00m';
    if (!presence?.heureDepart) return '-- : --';
    
    const hours = Math.floor((presence.dureeActuelle || 0) / 3600);
    const minutes = Math.floor(((presence.dureeActuelle || 0) % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  });

  private mapStatus(status: string, hasCheckout: boolean): PresenceRecord['status'] {
    if (status === 'ABSENT') return 'ABSENT';
    if (status === 'LATE') return 'LATE';

    if (!hasCheckout) return 'CHECKED_IN';
    return 'CHECKED_OUT';
  }

  private mapDto(dto: PresenceDTO): PresenceRecord {
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      date: dto.date,
      heureArrivee: dto.heureEntree,
      heureDepart: dto.heureSortie,
      dureeActuelle: dto.totalHeuresTravaillees,
      status: this.mapStatus(dto.status, !!dto.heureSortie)
    };
  }

  private formatTime(time: string): string {
    if (!time) return '--:--';
    return time.substring(0, 5);
  }

  loadTodayPresence(): void {
    this.loadingSignal.set(true);

    this.http.get<any>(this.api.PRESENCE.GET_TODAY_PRESENCE)
      .pipe(
        tap(res => {
          const dto = res?.data || res;

          if (dto) {
            const record = this.mapDto(dto);
            this.todayPresenceSignal.set(record);
            this.isCheckedInSignal.set(record.status === 'CHECKED_IN');
          } else {
            this.todayPresenceSignal.set(null);
            this.isCheckedInSignal.set(false);
          }
        }),
        catchError(err => {
          this.toast.error('Erreur chargement présence');
          return of(null);
        }),
        finalize(() => this.loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /**
   * Load presence history (30 days)
   */
  loadPresenceHistory(): void {
    this.http.get<any>(this.api.PRESENCE.GET_PRESENCE_HISTORY)
      .pipe(
        tap(res => {
          const payload = res?.data || res || {};
          const items = Array.isArray(payload) ? payload : payload?.content || [];
          const records = items.map((dto: PresenceDTO) => this.mapDto(dto));
          this.presenceHistorySignal.set(records);
        }),
        catchError(err => {
          this.toast.error('Erreur lors du chargement de l historique de presence');
          return of([]);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /**
   * Get presence stats as Observable (for dashboard integration)
   */
  getPresenceStats(): Observable<PresenceStatsDTO | null> {
    return this.http
      .get<any>(this.api.PRESENCE.GET_MY_STATS)
      .pipe(
        map(res => (res?.data || res) as PresenceStatsDTO),
        catchError(err => {
          this.toast.error('Erreur lors du chargement des statistiques de presence');
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      );
  }

  checkIn(): Observable<any> {
    return this.http.post<any>(this.api.PRESENCE.CHECK_IN, { source: 'WEB' }).pipe(
      tap(res => {
        const dto = res?.data || res;
        const record = this.mapDto(dto);
        this.todayPresenceSignal.set(record);
        this.isCheckedInSignal.set(true);
        this.toast.success('Check-in OK');
      }),
      catchError(err => {
        this.toast.error(this.getError(err));
        return of(null);
      })
    );
  }

  // ✅ FIX PAYLOAD
  checkOut(): Observable<any> {
    return this.http.post<any>(this.api.PRESENCE.CHECK_OUT, {
      source: 'WEB',
      localisation: 'web'
    }).pipe(
      tap(res => {
        const dto = res?.data || res;
        const record = this.mapDto(dto);
        this.todayPresenceSignal.set(record);
        this.isCheckedInSignal.set(false);
        this.toast.success('Check-out OK');
      }),
      catchError(err => {
        this.toast.error(this.getError(err));
        return of(null);
      })
    );
  }

  private getError(err: HttpErrorResponse): string {
    if (err.status === 0) return 'Backend non accessible';
    if (err.status === 401) return 'Non authentifié';
    if (err.status === 403) return 'Accès refusé';
    return err.error?.message || 'Erreur';
  }
}
