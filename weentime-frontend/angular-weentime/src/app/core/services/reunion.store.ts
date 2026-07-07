import { Injectable, inject, signal, computed } from '@angular/core';
import { BehaviorSubject, Observable, of, tap, catchError, shareReplay, timeout } from 'rxjs';
import { ReunionService } from './reunion.service';
import { Reunion } from '../models/reunion.model';
import { environment } from '../../../environments/environment';

/**
 * ReunionStore — Centralized state management with in-memory cache.
 *
 * Cache rules:
 * - TTL = 30 seconds (configurable)
 * - Invalidated after any mutation (create, RSVP, close, cancel)
 * - force=true bypasses TTL for explicit refresh actions
 *
 * Key design: in-flight HTTP requests are shared via shareReplay(1)
 * so duplicate calls don't spawn parallel requests.
 */
@Injectable({ providedIn: 'root' })
export class ReunionStore {
  private reunionService = inject(ReunionService);

  // ── Internal state ──
  private readonly _reunions = new BehaviorSubject<Reunion[]>([]);
  private readonly _detailCache = new Map<string, { data: Reunion; timestamp: number }>();
  private _lastListFetch = 0;
  private readonly _hydrated = signal(false);

  /** Shared in-flight request — avoids duplicate calls AND completes for subscribers */
  private _inflight$: Observable<Reunion[]> | null = null;

  private readonly CACHE_TTL = 30_000; // 30 seconds
  /** Dev backends can be slow; keep UX responsive via non-blocking routes + local skeleton */
  private readonly FETCH_TIMEOUT_MS = environment.production ? 15_000 : 30_000;

  // ── Public signals (consumed by components) ──
  readonly reunions = signal<Reunion[]>([]);
  readonly isLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly isHydrated = computed(() => this._hydrated());

  constructor() {
    // Keep signal in sync with BehaviorSubject
    this._reunions.subscribe(data => this.reunions.set(data));
  }

  // ── List operations ──

  /**
   * Loads reunions only when cache is stale or never fetched.
   * Safe to call from resolvers (non-blocking) and page init.
   */
  loadIfNeeded(force = false): Observable<Reunion[]> {
    const now = Date.now();
    if (!force && this._hydrated() && this._isCacheValid(now)) {
      return of(this._reunions.value);
    }
    return this.loadReunions(force);
  }

  /**
   * Load reunions from API or return cached data.
   */
  loadReunions(force = false): Observable<Reunion[]> {
    const now = Date.now();

    // Return cached data instantly if still valid
    if (!force && this._isCacheValid(now) && this._hydrated()) {
      this.isLoading.set(false);
      return of(this._reunions.value);
    }

    // If a request is already in flight, return the SAME shared observable
    if (this._inflight$) {
      return this._inflight$;
    }

    this.isLoading.set(true);
    this.loadError.set(null);

    this._inflight$ = this.reunionService.getMesReunions().pipe(
      timeout(this.FETCH_TIMEOUT_MS),
      tap(data => {
        this._reunions.next(data);
        this._lastListFetch = Date.now();
        this._hydrated.set(true);
        this._inflight$ = null;
        this.isLoading.set(false);
        this.loadError.set(null);
      }),
      catchError(err => {
        this._logLoadFailure(err);
        this._hydrated.set(true);
        this._inflight$ = null;
        this.isLoading.set(false);
        this.loadError.set(this.toUserFacingError(err));
        return of(this._reunions.value);
      }),
      shareReplay(1)
    );

    return this._inflight$;
  }

  // ── Detail operations ──

  /**
   * Get a single reunion detail.
   * Checks in-memory list cache first, then detail cache, then API.
   */
  getDetail(uuid: string): Observable<Reunion> {
    const now = Date.now();

    // 1. Check if it's in the list cache (freshest data)
    if (this._isCacheValid(now)) {
      const fromList = this._reunions.value.find(r => r.uuid === uuid);
      if (fromList) {
        return of(fromList);
      }
    }

    // 2. Check detail-specific cache
    const cached = this._detailCache.get(uuid);
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      return of(cached.data);
    }

    // 3. Fetch from API and cache
    return this.reunionService.getDetail(uuid).pipe(
      tap(data => {
        this._detailCache.set(uuid, { data, timestamp: Date.now() });
      })
    );
  }

  // ── Cache invalidation ──

  /**
   * Invalidate all caches. Call after any mutation (create, RSVP, close, cancel).
   */
  invalidateCache(): void {
    this._lastListFetch = 0;
    this._hydrated.set(false);
    this._detailCache.clear();
    this._inflight$ = null;
    this.loadError.set(null);
  }

  /**
   * Invalidate a specific detail entry.
   */
  invalidateDetail(uuid: string): void {
    this._detailCache.delete(uuid);
  }

  // ── Private helpers ──

  private _isCacheValid(now: number): boolean {
    return (now - this._lastListFetch) < this.CACHE_TTL;
  }

  private _logLoadFailure(err: unknown): void {
    const isTimeout = (err as { name?: string })?.name === 'TimeoutError';
    if (!environment.production) {
      if (isTimeout) {
        console.warn(
          `[ReunionStore] /mes-reunions exceeded ${this.FETCH_TIMEOUT_MS}ms — verify reunion-service is up`
        );
        return;
      }
      console.warn('[ReunionStore] loadReunions failed — using cached/empty list', err);
      return;
    }
    if (!isTimeout) {
      console.error('[ReunionStore] loadReunions failed', err);
    }
  }

  private toUserFacingError(err: unknown): string {
    if ((err as { name?: string })?.name === 'TimeoutError') {
      return 'Le service réunions met trop de temps à répondre. Réessayez dans un instant.';
    }
    return 'Impossible de charger vos réunions pour le moment.';
  }
}
