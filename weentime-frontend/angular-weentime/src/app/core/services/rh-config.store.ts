import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, forkJoin, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * RhConfigStore — Centralized state for RH Parameters and Global Configuration.
 */
@Injectable({ providedIn: 'root' })
export class RhConfigStore {
  private readonly http = inject(HttpClient);

  // ── State signals ──
  private readonly _teletravailQuota = signal<number>(4);
  private readonly _loading = signal(false);

  // ── Public Accessors ──
  readonly teletravailQuota = computed(() => this._teletravailQuota());
  readonly isLoading = computed(() => this._loading());

  /**
   * Load global RH configurations.
   */
  loadInitial(): Observable<any> {
    this._loading.set(true);
    return this.http.get<any>(`${environment.apiUrl}/rh/config-teletravail`).pipe(
      tap(config => {
        this._teletravailQuota.set(config.quotaMensuel ?? 4);
        this._loading.set(false);
      })
    );
  }

  /**
   * Update global teletravail quota.
   */
  saveTeletravailQuota(quota: number): Observable<any> {
    return this.http.put(`${environment.apiUrl}/rh/config-teletravail`, { quotaMensuel: quota }).pipe(
      tap(() => this._teletravailQuota.set(quota))
    );
  }
}
