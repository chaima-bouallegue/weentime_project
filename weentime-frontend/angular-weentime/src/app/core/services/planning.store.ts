import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, of, forkJoin, map } from 'rxjs';
import { RhPlanningService, PlanningResponseDTO } from '@app/features/rh/planning/rh-planning.service';
import { OrganisationService, SimpleTeam } from '@app/core/services/organisation.service';

/**
 * PlanningStore — Centralized state for Global RH Planning.
 * Caches planning data by month and team to provide instant navigation.
 */
@Injectable({ providedIn: 'root' })
export class PlanningStore {
  private readonly planningService = inject(RhPlanningService);
  private readonly organisationService = inject(OrganisationService);

  // ── State signals ──
  private readonly _planningData = signal<Record<string, PlanningResponseDTO[]>>({});
  private readonly _teams = signal<SimpleTeam[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // ── Public Accessors ──
  readonly teams = computed(() => this._teams());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /**
   * Get planning for a specific month and team.
   */
  getPlanning(monthKey: string, teamId?: number): PlanningResponseDTO[] {
    const key = this._buildKey(monthKey, teamId);
    return this._planningData()[key] || [];
  }

  /**
   * Load planning and teams simultaneously.
   */
  loadInitial(start: string, end: string, teamId?: number): Observable<any> {
    const monthKey = start.substring(0, 7);
    const key = this._buildKey(monthKey, teamId);

    // If we have data and it's not a force refresh, we could return 'of', 
    // but usually planning needs fresh data.
    // However, for UX speed, if we have it, we can return it.
    
    this._loading.set(true);

    return forkJoin({
      teams: this._teams().length > 0 ? of({ content: this._teams() }) : this.organisationService.getTeams(0, 100),
      planning: this.planningService.getPlanning(start, end, teamId)
    }).pipe(
      tap({
        next: ({ teams, planning }) => {
          if (teams.content) this._teams.set(teams.content);
          this._updatePlanning(key, planning);
          this._loading.set(false);
        },
        error: (err) => {
          this._error.set('Erreur lors du chargement du planning');
          this._loading.set(false);
        }
      })
    );
  }

  /**
   * Load just the planning (for month navigation or team filter change).
   */
  loadPlanning(start: string, end: string, teamId?: number): Observable<PlanningResponseDTO[]> {
    const monthKey = start.substring(0, 7);
    const key = this._buildKey(monthKey, teamId);

    this._loading.set(true);
    return this.planningService.getPlanning(start, end, teamId).pipe(
      tap({
        next: (data) => {
          this._updatePlanning(key, data);
          this._loading.set(false);
        },
        error: () => {
          this._error.set('Erreur de chargement');
          this._loading.set(false);
        }
      })
    );
  }

  // ── Private Helpers ──

  private _buildKey(monthKey: string, teamId?: number): string {
    return teamId ? `${monthKey}_team_${teamId}` : monthKey;
  }

  private _updatePlanning(key: string, data: PlanningResponseDTO[]) {
    this._planningData.update(prev => ({ ...prev, [key]: data }));
  }
}
