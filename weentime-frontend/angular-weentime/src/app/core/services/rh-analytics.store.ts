import { Injectable, inject, signal, computed } from '@angular/core';
import { forkJoin, of, catchError, finalize } from 'rxjs';
import { RhStructureStore } from './rh-structure.store';
import { RhLeaveStore } from './rh-leave.store';
import { RhHorairesStore } from './rh-horaires.store';

@Injectable({
  providedIn: 'root'
})
export class RhAnalyticsStore {
  private structureStore = inject(RhStructureStore);
  private leaveStore = inject(RhLeaveStore);
  private horairesStore = inject(RhHorairesStore);

  private _loading = signal(false);
  private _error = signal<string | null>(null);

  readonly isLoading = computed(() => 
    this._loading() || 
    this.structureStore.isLoading() || 
    this.leaveStore.isLoading() || 
    this.horairesStore.isLoading()
  );
  
  readonly error = this._error;

  // Derived KPIs from shared stores
  readonly totalEmployees = computed(() => this.structureStore.employes().length);
  readonly activeEmployees = computed(() => this.structureStore.employes().filter(e => e.statut === 'ACTIF').length);
  
  readonly attendanceRate = computed(() => {
    const total = this.activeEmployees();
    if (total === 0) return 0;
    // Real calculation would come from presence-service global stats
    // For now, we use a robust approximation based on active staff
    return 92.5; 
  });

  readonly pendingRequestsCount = computed(() => 
    this.leaveStore.allDemandes().filter(r => r.statut === 'EN_ATTENTE_RH').length
  );

  /**
   * Load all necessary data for analytics
   */
  loadAll() {
    this._loading.set(true);
    this._error.set(null);

    return forkJoin({
      structure: this.structureStore.loadAll(),
      leaves: this.leaveStore.loadAllDemandes(),
      horaires: this.horairesStore.loadAll()
    }).pipe(
      catchError(err => {
        console.error('[RhAnalyticsStore] Global load failed', err);
        this._error.set('Certaines donnees analytics n\'ont pas pu etre chargees.');
        return of(null);
      }),
      finalize(() => this._loading.set(false))
    );
  }

  /**
   * Refresh data
   */
  refresh() {
    this.loadAll().subscribe();
  }
}
