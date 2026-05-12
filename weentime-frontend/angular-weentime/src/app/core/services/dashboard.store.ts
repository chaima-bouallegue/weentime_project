import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, of } from 'rxjs';
import { DashboardService } from '@app/features/dashboard/dashboard.service';
import { DashboardPayload, DashboardRole } from '@app/shared/ui/models/dashboard-ui.models';

/**
 * DashboardStore — Manages the state of all dashboards with prefetching and caching.
 * Provides a "World-Class" premium UX by making data instantly available.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly dashboardService = inject(DashboardService);

  // ── State signals ──
  private readonly _adminData = signal<DashboardPayload | null>(null);
  private readonly _rhData = signal<DashboardPayload | null>(null);
  private readonly _managerData = signal<DashboardPayload | null>(null);
  private readonly _employeeData = signal<DashboardPayload | null>(null);

  private readonly _loading = signal<Record<DashboardRole, boolean>>({
    ADMIN: false,
    RH: false,
    MANAGER: false,
    EMPLOYEE: false
  });

  private readonly _error = signal<Record<DashboardRole, string | null>>({
    ADMIN: null,
    RH: null,
    MANAGER: null,
    EMPLOYEE: null
  });

  // ── Public Accessors ──
  readonly adminData = computed(() => this._adminData());
  readonly rhData = computed(() => this._rhData());
  readonly managerData = computed(() => this._managerData());
  readonly employeeData = computed(() => this._employeeData());

  readonly isLoading = (role: DashboardRole) => computed(() => this._loading()[role]);
  readonly getError = (role: DashboardRole) => computed(() => this._error()[role]);

  /**
   * Prefetch or refresh dashboard data for a specific role.
   */
  loadDashboard(role: DashboardRole, force = false): Observable<DashboardPayload> {
    const currentData = this._getDataSignal(role)();
    
    // If we already have data and not forcing refresh, return it immediately
    if (!force && currentData) {
      return of(currentData);
    }

    this._setLoading(role, true);
    this._setError(role, null);

    let loader$: Observable<DashboardPayload>;
    switch (role) {
      case 'ADMIN': loader$ = this.dashboardService.getAdminDashboard(force); break;
      case 'RH': loader$ = this.dashboardService.getRhDashboard(force); break;
      case 'MANAGER': loader$ = this.dashboardService.getManagerDashboard(force); break;
      case 'EMPLOYEE': loader$ = this.dashboardService.getEmployeeDashboard(force); break;
      default: return of({} as DashboardPayload);
    }

    return loader$.pipe(
      tap({
        next: (data) => {
          this._setData(role, data);
          this._setLoading(role, false);
        },
        error: (err) => {
          this._setError(role, err.message || 'Erreur de chargement');
          this._setLoading(role, false);
        }
      })
    );
  }

  /**
   * Update specific dashboard state manually
   */
  updateData(role: DashboardRole, data: DashboardPayload): void {
    this._setData(role, data);
  }

  // ── Private Helpers ──

  private _getDataSignal(role: DashboardRole) {
    switch (role) {
      case 'ADMIN': return this._adminData;
      case 'RH': return this._rhData;
      case 'MANAGER': return this._managerData;
      case 'EMPLOYEE': return this._employeeData;
    }
  }

  private _setData(role: DashboardRole, data: DashboardPayload) {
    this._getDataSignal(role).set(data);
  }

  private _setLoading(role: DashboardRole, value: boolean) {
    this._loading.update(prev => ({ ...prev, [role]: value }));
  }

  private _setError(role: DashboardRole, value: string | null) {
    this._error.update(prev => ({ ...prev, [role]: value }));
  }
}
