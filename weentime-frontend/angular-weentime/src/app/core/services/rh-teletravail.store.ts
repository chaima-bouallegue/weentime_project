import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, forkJoin, of } from 'rxjs';
import { TeletravailService } from '../../features/employee/teletravail/teletravail.service';
import { DemandeTeletravailWorkflow, StatsRH } from '../../features/shared/models/workflow-teletravail.model';

/**
 * RhTeletravailStore — Centralized state for RH Teletravail Management.
 */
@Injectable({ providedIn: 'root' })
export class RhTeletravailStore {
  private readonly service = inject(TeletravailService);

  // ── State signals ──
  private readonly _demandesEnAttente = signal<DemandeTeletravailWorkflow[]>([]);
  private readonly _historiqueGlobal = signal<DemandeTeletravailWorkflow[]>([]);
  private readonly _stats = signal<StatsRH | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // ── Public Accessors ──
  readonly demandesEnAttente = computed(() => this._demandesEnAttente());
  readonly historiqueGlobal = computed(() => this._historiqueGlobal());
  readonly stats = computed(() => this._stats());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /**
   * Load all teletravail data for RH.
   */
  loadAll(force = false): Observable<any> {
    if (!force && this._demandesEnAttente().length > 0) {
      return of(null);
    }

    this._loading.set(true);
    return forkJoin({
      stats: this.service.getStatsRH(),
      pending: this.service.getDemandesEnAttenteRH(),
      history: this.service.getHistoriqueGlobal()
    }).pipe(
      tap({
        next: ({ stats, pending, history }) => {
          this._stats.set(stats);
          this._demandesEnAttente.set(pending);
          this._historiqueGlobal.set(history);
          this._loading.set(false);
          this._error.set(null);
        },
        error: () => {
          this._error.set('Certaines données RH sont indisponibles.');
          this._loading.set(false);
        }
      })
    );
  }

  // ── Mutations ──
  updateAfterDecision(id: number, result: DemandeTeletravailWorkflow | null, mode: 'VALIDER' | 'REFUSER') {
    this._demandesEnAttente.update(list => list.filter(d => d.id !== id));
    if (result) {
      this._historiqueGlobal.update(list => [result, ...list]);
    }
    this._stats.update(current => current ? {
      ...current,
      enAttente: Math.max(current.enAttente - 1, 0),
      ...(mode === 'VALIDER'
        ? { approuveCeMois: current.approuveCeMois + 1 }
        : { refuseCeMois: current.refuseCeMois + 1 })
    } : current);
  }
}
