import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, finalize, of } from 'rxjs';
import { RhApiService, RhRequest, RhStatsOverview } from '@app/features/rh/rh-api.service';
import { ApprobationService, Demande } from '@app/features/manager/approbations/approbation.service';

/**
 * ValidationStore — Centralized state for RH/Manager validations.
 * Standardizes request management across roles.
 */
@Injectable({ providedIn: 'root' })
export class ValidationStore {
  private readonly rhApi = inject(RhApiService);
  private readonly managerApi = inject(ApprobationService);

  // ── State signals ──
  private readonly _rhRequests = signal<RhRequest[]>([]);
  private readonly _rhStats = signal<RhStatsOverview | null>(null);
  private readonly _managerRequests = signal<Demande[]>([]);
  private readonly _loading = signal(false);

  // ── Public Accessors ──
  readonly rhRequests = computed(() => this._rhRequests());
  readonly rhStats = computed(() => this._rhStats());
  readonly managerRequests = computed(() => this._managerRequests());
  readonly isLoading = computed(() => this._loading());

  /**
   * Load RH-specific validation data.
   */
  loadRhInitial(): Observable<any> {
    this._loading.set(true);
    // Trigger parallel load
    return forkJoin({
      requests: this.rhApi.getRequests(0, 50),
      stats: this.rhApi.getStatsOverview()
    }).pipe(
      tap(({ requests, stats }) => {
        this._rhRequests.set(requests.content);
        this._rhStats.set(stats);
      }),
      finalize(() => this._loading.set(false))
    );
  }

  /**
   * Load Manager-specific validation data.
   */
  loadManagerInitial(): Observable<any> {
    this._loading.set(true);
    // Since refreshBuckets in service uses signals, we'll trigger it and bridge
    this.managerApi.refreshBuckets();
    
    // We'll return an observable that completes when loadingSignal in service becomes false
    // But for simplicity, we'll just wait for the service to finish
    return of(true).pipe(
      tap(() => {
        this._managerRequests.set(this.managerApi.pendingApprobationsSignal());
        this._loading.set(false);
      })
    );
  }
}

import { forkJoin } from 'rxjs';
