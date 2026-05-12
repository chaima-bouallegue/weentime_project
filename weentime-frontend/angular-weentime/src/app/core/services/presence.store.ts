import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, from } from 'rxjs';
import { PresenceService } from '@app/features/presence/services/presence.service';
import { Presence, AttendanceSession, PresenceStats } from '@app/features/presence/models/presence.model';

/**
 * PresenceStore — Centralized state for Employee Presence/Attendance.
 * Ensures pointage data is instantly available.
 */
@Injectable({ providedIn: 'root' })
export class PresenceStore {
  private readonly presenceService = inject(PresenceService);

  // ── State signals ──
  private readonly _today = signal<Presence | null>(null);
  private readonly _history = signal<AttendanceSession[]>([]);
  private readonly _stats = signal<PresenceStats | null>(null);
  private readonly _loading = signal(false);

  // ── Public Accessors ──
  readonly today = computed(() => this._today());
  readonly history = computed(() => this._history());
  readonly stats = computed(() => this._stats());
  readonly isLoading = computed(() => this._loading());

  /**
   * Prefetch all presence data.
   */
  prefetch(): Observable<any> {
    this._loading.set(true);
    // Use the existing refresh() method from PresenceService but pipe it for the resolver
    return from(this.presenceService.refresh()).pipe(
      tap(() => {
        // Sync local signals with service signals (since service already has them, 
        // but we want a clean store boundary or just use service as store).
        // For now, I'll bridge them to ensure the resolver waits.
        this._sync();
        this._loading.set(false);
      })
    );
  }

  private _sync() {
    this._today.set(this.presenceService.today());
    this._history.set(this.presenceService.history());
    this._stats.set(this.presenceService.stats());
  }
}
