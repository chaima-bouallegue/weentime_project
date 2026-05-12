import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, forkJoin, of } from 'rxjs';
import { RhApiService, TypeCongeOption, RhLeaveBalance, RhRequest } from '../../features/rh/rh-api.service';
import { AdminApiService, AdminUser } from '../../features/admin/admin-api.service';
import { CongeService } from '../../features/employee/conges/conge.service';
import { DemandeConge } from '../../features/employee/conges/models/conge.model';

/**
 * RhLeaveStore — Centralized state for RH Time-off Management (Conges, Absences, Balances).
 */
@Injectable({ providedIn: 'root' })
export class RhLeaveStore {
  private readonly rhApi = inject(RhApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly congeService = inject(CongeService);

  // ── State signals ──
  private readonly _leaveTypes = signal<TypeCongeOption[]>([]);
  private readonly _users = signal<AdminUser[]>([]);
  private readonly _allDemandes = signal<DemandeConge[]>([]);
  private readonly _leaveBalances = signal<RhLeaveBalance[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // ── Public Accessors ──
  readonly leaveTypes = computed(() => this._leaveTypes());
  readonly users = computed(() => this._users());
  readonly allDemandes = computed(() => this._allDemandes());
  readonly leaveBalances = computed(() => this._leaveBalances());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /**
   * Load reference data for leave management.
   */
  loadReferences(force = false): Observable<any> {
    if (!force && this._leaveTypes().length > 0 && this._users().length > 0) {
      return of(null);
    }

    this._loading.set(true);
    return forkJoin({
      users: this.adminApi.getUsers(0, 500),
      typeConges: this.rhApi.getTypeConges()
    }).pipe(
      tap(({ users, typeConges }) => {
        this._users.set(users.content);
        this._leaveTypes.set(typeConges);
        this._loading.set(false);
      })
    );
  }

  /**
   * Load all conge requests for the global RH view.
   */
  loadAllDemandes(): Observable<DemandeConge[]> {
    this._loading.set(true);
    return this.congeService.getAllDemandes().pipe(
      tap(data => {
        this._allDemandes.set(data);
        this._loading.set(false);
      })
    );
  }

  /**
   * Load leave balances for a specific user and year.
   */
  loadLeaveBalances(userId: number, year: number): Observable<RhLeaveBalance[]> {
    this._loading.set(true);
    return this.rhApi.getLeaveBalances(userId, year).pipe(
      tap(data => {
        this._leaveBalances.set(data);
        this._loading.set(false);
      })
    );
  }

  // ── Mutations ──
  updateDemande(updated: DemandeConge) {
    this._allDemandes.update(list => list.map(d => d.id === updated.id ? updated : d));
  }

  updateBalance(updated: RhLeaveBalance) {
    this._leaveBalances.update(list => list.map(b => b.typeCongeId === updated.typeCongeId ? updated : b));
  }
}
