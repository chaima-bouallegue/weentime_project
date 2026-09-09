import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Observable, tap, forkJoin, of } from 'rxjs';
import { StructureService } from '../../features/rh/structure/structure.service';
import { AuthService } from './auth.service';
import { Departement, Equipe, EmployeRH } from '../../features/rh/structure/models/structure.model';

/**
 * RhStructureStore — Centralized state for RH Organization (Depts, Teams, Staff).
 * Ensures instant UI updates and data consistency across the structure module.
 */
@Injectable({ providedIn: 'root' })
export class RhStructureStore {
  private readonly structureService = inject(StructureService);
  private readonly authService = inject(AuthService);

  constructor() {
    effect(() => {
      if (!this.authService.currentUser()) {
        this.reset();
      }
    });
  }

  // ── State signals ──
  private readonly _departements = signal<Departement[]>([]);
  private readonly _equipes = signal<Equipe[]>([]);
  private readonly _employes = signal<EmployeRH[]>([]);
  private readonly _pendingEmployes = signal<EmployeRH[]>([]);
  private readonly _managers = signal<EmployeRH[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // ── Public Accessors ──
  readonly departements = computed(() => this._departements());
  readonly equipes = computed(() => this._equipes());
  readonly equipesSansManager = computed(() => this._equipes().filter(e => !e.managerId));
  readonly employes = computed(() => this._employes());
  readonly pendingEmployes = computed(() => this._pendingEmployes());
  readonly managers = computed(() => this._managers());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /**
   * Wipe all cached state. Called automatically when the authenticated user
   * disappears (logout, session expiry) so cached data from a previous
   * tenant is never served to the next account.
   */
  reset(): void {
    this._departements.set([]);
    this._equipes.set([]);
    this._employes.set([]);
    this._pendingEmployes.set([]);
    this._managers.set([]);
    this._loading.set(false);
    this._error.set(null);
  }

  /**
   * Refresh the entire structure data in parallel.
   */
  loadAll(force = false): Observable<any> {
    if (!force && this._departements().length > 0) {
      return of(null);
    }

    this._loading.set(true);
    this._error.set(null);

    return forkJoin({
      departements: this.structureService.getDepartements(),
      equipes: this.structureService.getEquipes(),
      employes: this.structureService.getEmployes(),
      managers: this.structureService.getManagers(),
      pending: this.structureService.getPendingUsers()
    }).pipe(
      tap({
        next: ({ departements, equipes, employes, managers, pending }) => {
          this._departements.set(departements);
          this._equipes.set(equipes);
          this._employes.set(employes);
          this._managers.set(managers);
          this._pendingEmployes.set(pending);
          this._loading.set(false);
        },
        error: (err) => {
          this._error.set('Erreur lors du chargement de la structure organisationnelle');
          this._loading.set(false);
        }
      })
    );
  }

  // ── Mutation Helpers (to avoid full reloads) ──

  addDepartement(dept: Departement) {
    this._departements.update(list => [dept, ...list]);
  }

  updateDepartement(dept: Departement) {
    this._departements.update(list => list.map(d => d.id === dept.id ? dept : d));
  }

  deleteDepartement(id: number) {
    this._departements.update(list => list.filter(d => d.id !== id));
  }

  addEquipe(eq: Equipe) {
    this._equipes.update(list => [eq, ...list]);
  }

  updateEquipe(eq: Equipe) {
    this._equipes.update(list => list.map(e => e.id === eq.id ? eq : e));
  }

  deleteEquipe(id: number) {
    this._equipes.update(list => list.filter(e => e.id !== id));
  }

  addEmploye(emp: EmployeRH) {
    this._employes.update(list => [emp, ...list]);
  }

  updateEmploye(emp: EmployeRH) {
    this._employes.update(list => list.map(e => e.id === emp.id ? emp : e));
  }
}
