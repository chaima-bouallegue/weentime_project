import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, forkJoin, tap, map, catchError, finalize } from 'rxjs';
import { TeletravailService } from './teletravail.service';
import { QuotaTeletravail, DemandeTeletravail } from './models/teletravail.model';

/**
 * TeletravailStore — Centralized state with 30s TTL cache.
 */
@Injectable({ providedIn: 'root' })
export class TeletravailStore {
  private service = inject(TeletravailService);

  private _lastFetch = 0;
  private _loading = false;
  private readonly CACHE_TTL = 300_000; // 5 minutes cache for better performance

  readonly quota = signal<QuotaTeletravail | null>(null);
  readonly historique = signal<DemandeTeletravail[]>([]);
  readonly holidayDates = signal<string[]>([]);
  readonly isLoading = signal(false);
  readonly isRefreshing = signal(false);

  /**
   * loadAll — Loads all required data.
   * If cache is valid, it emits immediately.
   * If not, it triggers a refresh.
   */
  loadAll(force = false): Observable<void> {
    const now = Date.now();
    const isCacheValid = this._isCacheValid(now);

    // If cache is valid and not forced, just return
    if (!force && isCacheValid && this._lastFetch > 0) {
      return of(void 0);
    }

    // If already loading, wait for current load
    if (this._loading) return of(void 0);

    this._loading = true;
    
    // If we have no data at all, show main loader
    if (this.historique().length === 0 && !this.quota()) {
      this.isLoading.set(true);
    } else {
      this.isRefreshing.set(true);
    }

    return forkJoin({
      quota: this.service.getQuota().pipe(catchError(() => of(null))),
      historique: this.service.getHistorique().pipe(catchError(() => of([]))),
      holidays: this.service.getJoursFeries().pipe(catchError(() => of([])))
    }).pipe(
      tap(({ quota, historique, holidays }) => {
        this.quota.set(quota);
        this.historique.set(historique);
        this.holidayDates.set(holidays);
        this._lastFetch = Date.now();
      }),
      finalize(() => {
        this._loading = false;
        this.isLoading.set(false);
        this.isRefreshing.set(false);
      }),
      map(() => void 0)
    );
  }

  invalidateCache(): void { this._lastFetch = 0; }
  refresh(): Observable<void> { return this.loadAll(true); }
  private _isCacheValid(now: number): boolean { return (now - this._lastFetch) < this.CACHE_TTL; }
}
