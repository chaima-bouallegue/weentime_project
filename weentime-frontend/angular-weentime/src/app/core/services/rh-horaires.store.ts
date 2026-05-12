import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, forkJoin, map, of } from 'rxjs';
import { HoraireService } from './horaire.service';
import { Horaire, AffectationHoraire } from '../models/horaire.model';

/**
 * RhHorairesStore — Centralized state for Work Schedules & Assignments.
 * Follows the signal-based store pattern for instant UI rendering.
 */
@Injectable({ providedIn: 'root' })
export class RhHorairesStore {
  private readonly horaireService = inject(HoraireService);

  // ── State signals ──
  private readonly _horaires = signal<Horaire[]>([]);
  private readonly _affectations = signal<AffectationHoraire[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // ── Public Accessors ──
  readonly horaires = computed(() => this._horaires());
  readonly affectations = computed(() => this._affectations());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /**
   * Load all horaires and affectations.
   */
  loadAll(): Observable<any> {
    this._loading.set(true);
    this._error.set(null);

    return forkJoin({
      horaires: this.horaireService.getHoraires(0, 500),
      affectations: this.horaireService.getAffectations(0, 500)
    }).pipe(
      tap({
        next: ({ horaires, affectations }) => {
          this._horaires.set(horaires.content || []);
          this._affectations.set(affectations.content || []);
          this._loading.set(false);
        },
        error: (err) => {
          console.error('[RhHorairesStore] Load failed', err);
          this._error.set('Impossible de charger les données des horaires');
          this._loading.set(false);
        }
      })
    );
  }

  /**
   * Refresh data in background (no loader if already have data).
   */
  refresh(): void {
    this.loadAll().subscribe();
  }

  /**
   * Optimistically add/update/delete could be implemented here if needed.
   */
  removeHoraire(id: number) {
    this._horaires.update(prev => prev.filter(h => h.id !== id));
  }

  removeAffectation(id: number) {
    this._affectations.update(prev => prev.filter(a => a.id !== id));
  }
}
