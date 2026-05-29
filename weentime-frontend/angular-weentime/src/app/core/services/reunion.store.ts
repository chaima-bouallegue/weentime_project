import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, of, tap, catchError, shareReplay, take, timeout } from 'rxjs';
import { ReunionService } from './reunion.service';
import { Reunion } from '../models/reunion.model';

/**
 * ReunionStore — Centralized state management with in-memory cache.
 *
 * Cache rules:
 * - TTL = 30 seconds (configurable)
 * - Invalidated after any mutation (create, RSVP, close, cancel)
 * - force=true bypasses TTL for explicit refresh actions
 *
 * Key design: in-flight HTTP requests are shared via shareReplay(1)
 * so duplicate resolver calls don't hang (BehaviorSubject never completes,
 * but a shared HTTP observable does).
 */
@Injectable({ providedIn: 'root' })
export class ReunionStore {
  private reunionService = inject(ReunionService);

  // ── Internal state ──
  private readonly _reunions = new BehaviorSubject<Reunion[]>([]);
  private readonly _detailCache = new Map<string, { data: Reunion; timestamp: number }>();
  private _lastListFetch = 0;

  /** Shared in-flight request — avoids duplicate calls AND completes for resolvers */
  private _inflight$: Observable<Reunion[]> | null = null;

  private readonly CACHE_TTL = 30_000; // 30 seconds

  // ── Public signals (consumed by components) ──
  readonly reunions = signal<Reunion[]>([]);
  readonly isLoading = signal(false);

  constructor() {
    // Keep signal in sync with BehaviorSubject
    this._reunions.subscribe(data => this.reunions.set(data));
  }

  // ── List operations ──

  /**
   * Load reunions from API or return cached data.
   * Called by the resolver BEFORE the component mounts.
   *
   * Returns an Observable that ALWAYS completes — safe for Angular resolvers.
   */
  loadReunions(force = false): Observable<Reunion[]> {
    const now = Date.now();

    // Return cached data instantly if still valid
    if (!force && this._isCacheValid(now) && this._reunions.value.length > 0) {
      this.isLoading.set(false);
      return of(this._reunions.value);
    }

    // If a request is already in flight, return the SAME shared observable
    // (shareReplay ensures it completes when the HTTP call finishes)
    if (this._inflight$) {
      return this._inflight$;
    }

    this.isLoading.set(true);

    this._inflight$ = this.reunionService.getMesReunions().pipe(
      timeout(10_000), // Don't let the resolver hang forever
      tap(data => {
        this._reunions.next(data);
        this._lastListFetch = Date.now();
        this._inflight$ = null;
        this.isLoading.set(false);
      }),
      catchError(err => {
        console.error('[ReunionStore] loadReunions failed — returning cached/empty list', err);
        this._inflight$ = null;
        this.isLoading.set(false);
        // Return current cache (or empty) so the resolver COMPLETES
        // instead of blocking navigation.
        return of(this._reunions.value);
      }),
      shareReplay(1) // Share the result with all subscribers; completes after emit
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
    this._detailCache.clear();
    this._inflight$ = null;
  }

  /**
   * Invalidate a specific detail entry.
   * Used after actions on a single reunion (RSVP, clôturer, annuler).
   */
  invalidateDetail(uuid: string): void {
    this._detailCache.delete(uuid);
  }

  // ── Private helpers ──

  private _isCacheValid(now: number): boolean {
    return (now - this._lastListFetch) < this.CACHE_TTL;
  }
}
