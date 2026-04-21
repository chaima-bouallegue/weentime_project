import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import {
  AdminApiService,
  AdminDepartement,
  AdminEntreprise,
  AdminRole,
  AdminUser,
  AdminUserPayload
} from '../admin-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { AdminSkeletonComponent } from '../../../shared/components/admin-skeleton/admin-skeleton.component';
import { ADMIN_ROLE_BADGES, ADMIN_ROLE_OPTIONS, formatRoleLabel } from '../admin-ui';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    LucideAngularModule,
    AdminPageHeaderComponent,
    AdminEmptyStateComponent,
    AdminSkeletonComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page">
      <app-admin-page-header
        eyebrow="User management"
        title="Users, roles and status control"
        description="Gestion complète du parc utilisateurs avec filtres, toggles d’activation, assignation manager et édition des rôles."
        [breadcrumbs]="breadcrumbs"
        primaryLabel="Create user"
        primaryIcon="user-plus"
        (primaryAction)="openCreate()">
      </app-admin-page-header>

      <section class="admin-surface admin-panel">
        <div class="filters-grid">
          <label class="admin-form-field search-field">
            <span>Global search</span>
            <div class="search-box">
              <lucide-icon name="search" size="16"></lucide-icon>
              <input class="admin-input" [value]="search()" (input)="search.set(($any($event.target).value || '').trim())" placeholder="Name or email" />
            </div>
          </label>

          <label class="admin-form-field">
            <span>Role</span>
            <select class="admin-select" [value]="roleFilter()" (change)="roleFilter.set($any($event.target).value)">
              <option value="">All roles</option>
              @for (role of roles(); track role.id) {
                <option [value]="role.nom">{{ formatRole(role.nom) }}</option>
              }
            </select>
          </label>

          <label class="admin-form-field">
            <span>Status</span>
            <select class="admin-select" [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)">
              <option value="">All statuses</option>
              <option value="ACTIF">Active</option>
              <option value="INACTIF">Inactive</option>
            </select>
          </label>

          <label class="admin-form-field">
            <span>Entreprise</span>
            <select class="admin-select" [value]="entrepriseFilter()" (change)="entrepriseFilter.set($any($event.target).value)">
              <option value="">All companies</option>
              @for (entreprise of entreprises(); track entreprise.id) {
                <option [value]="entreprise.id">{{ entreprise.nom }}</option>
              }
            </select>
          </label>
        </div>
      </section>

      @if (isLoading()) {
        <app-admin-skeleton [count]="3" [columns]="3"></app-admin-skeleton>
      } @else if (filteredUsers().length === 0) {
        <app-admin-empty-state title="No users found" description="Aucun utilisateur ne correspond aux filtres actuels." icon="users"></app-admin-empty-state>
      } @else {
        <section class="admin-surface admin-table-shell">
          <div class="admin-toolbar table-toolbar">
            <div>
              <strong>{{ filteredUsers().length }} users</strong>
              <p>{{ totalElements() }} user(s) total côté backend</p>
            </div>
            <div class="admin-actions">
              <button type="button" class="admin-button ghost" (click)="loadUsers()">Refresh</button>
              <div class="pager">
                <button type="button" class="admin-button secondary" (click)="changePage(-1)" [disabled]="page() === 0">Previous</button>
                <span>Page {{ page() + 1 }} / {{ totalPages() }}</span>
                <button type="button" class="admin-button secondary" (click)="changePage(1)" [disabled]="page() + 1 >= totalPages()">Next</button>
              </div>
            </div>
          </div>

          <table class="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role & permissions</th>
                <th>Organisation</th>
                <th>Status</th>
                <th>Manager</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (user of filteredUsers(); track user.id) {
                <tr>
                  <td>
                    <div class="user-cell">
                      <div class="avatar">{{ initials(user) }}</div>
                      <div>
                        <strong>{{ user.prenom }} {{ user.nom }}</strong>
                        <p>{{ user.email }}</p>
                        <small>{{ user.poste || 'No job title' }}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="badge-stack">
                      @for (role of user.roles; track role.id) {
                        <span class="admin-badge" [class]="roleMeta(role.nom).tone">{{ roleMeta(role.nom).label }}</span>
                      }
                    </div>
                    <small>{{ user.permissions?.length || 0 }} inherited permission(s)</small>
                  </td>
                  <td>
                    <strong>{{ user.entrepriseNom || 'Unassigned' }}</strong>
                    <p>{{ user.departementNom || 'No department' }}</p>
                    <small>{{ user.equipeNom || 'No team' }}</small>
                  </td>
                  <td>
                    <button type="button" class="status-toggle" [class.inactive]="user.statut === 'INACTIF'" (click)="toggleStatus(user)">
                      <span class="knob"></span>
                      <span>{{ user.statut === 'ACTIF' ? 'Active' : 'Inactive' }}</span>
                    </button>
                  </td>
                  <td>{{ managerName(user) }}</td>
                  <td class="menu-cell">
                    <button type="button" class="icon-button" (click)="toggleMenu(user.id)">
                      <lucide-icon name="more-vertical" size="16"></lucide-icon>
                    </button>

                    @if (menuOpenId() === user.id) {
                      <div class="action-menu">
                        <button type="button" (click)="openEdit(user)">Edit</button>
                        <button type="button" (click)="remove(user)">Delete</button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      @if (showForm()) {
        <div class="admin-modal-backdrop" (click)="closeForm()"></div>
        <section class="admin-modal admin-surface">
          <div class="admin-panel modal-shell">
            <div class="admin-toolbar">
              <div>
                <span class="admin-pill">{{ editingUser() ? 'Edit user' : 'Create user' }}</span>
                <h2>{{ editingUser() ? 'Update account and access' : 'Provision a new account' }}</h2>
              </div>
              <button type="button" class="admin-button ghost" (click)="closeForm()">Close</button>
            </div>

            <form [formGroup]="form" (ngSubmit)="save()" class="modal-form">
              <div class="admin-form-grid">
                <label class="admin-form-field"><span>First name</span><input class="admin-input" formControlName="prenom" /></label>
                <label class="admin-form-field"><span>Last name</span><input class="admin-input" formControlName="nom" /></label>
                <label class="admin-form-field"><span>Email</span><input class="admin-input" formControlName="email" type="email" /></label>
                <label class="admin-form-field"><span>Password</span><input class="admin-input" formControlName="motDePasse" type="password" [placeholder]="editingUser() ? 'Leave blank to keep current password' : ''" /></label>
                <label class="admin-form-field"><span>Phone</span><input class="admin-input" formControlName="telephone" /></label>
                <label class="admin-form-field"><span>Job title</span><input class="admin-input" formControlName="poste" /></label>
                <label class="admin-form-field">
                  <span>Status</span>
                  <select class="admin-select" formControlName="statut">
                    <option value="ACTIF">Active</option>
                    <option value="INACTIF">Inactive</option>
                  </select>
                </label>
                <label class="admin-form-field">
                  <span>Entreprise</span>
                  <select class="admin-select" formControlName="entrepriseId">
                    <option [ngValue]="null">Choose a company</option>
                    @for (entreprise of entreprises(); track entreprise.id) {
                      <option [ngValue]="entreprise.id">{{ entreprise.nom }}</option>
                    }
                  </select>
                </label>
                <label class="admin-form-field">
                  <span>Department</span>
                  <select class="admin-select" formControlName="departementId">
                    <option [ngValue]="null">No department</option>
                    @for (departement of formDepartements(); track departement.id) {
                      <option [ngValue]="departement.id">{{ departement.nom }}</option>
                    }
                  </select>
                </label>
                <label class="admin-form-field">
                  <span>Team</span>
                  <select class="admin-select" formControlName="equipeId">
                    <option [ngValue]="null">No team</option>
                    @for (equipe of formEquipes(); track equipe.id) {
                      <option [ngValue]="equipe.id">{{ equipe.nom }}</option>
                    }
                  </select>
                </label>
                <label class="admin-form-field">
                  <span>Manager</span>
                  <select class="admin-select" formControlName="managerId">
                    <option [ngValue]="null">No manager</option>
                    @for (manager of managerOptions(); track manager.id) {
                      <option [ngValue]="manager.id">{{ manager.prenom }} {{ manager.nom }}</option>
                    }
                  </select>
                </label>
              </div>

              <div class="roles-section">
                <div class="section-heading">
                  <span class="admin-form-label">Role assignment</span>
                  <small>Select at least one role</small>
                </div>

                <div class="roles-grid">
                  @for (role of roles(); track role.id) {
                    <label class="role-card" [class.selected]="selectedRoleIds().includes(role.id)">
                      <input type="checkbox" [checked]="selectedRoleIds().includes(role.id)" (change)="toggleRole(role.id, $any($event.target).checked)" />
                      <div>
                        <strong>{{ formatRole(role.nom) }}</strong>
                        <span>{{ role.description || 'No role description' }}</span>
                      </div>
                    </label>
                  }
                </div>
              </div>

              @if (submitted() && formError()) {
                <p class="form-error">{{ formError() }}</p>
              }

              <div class="admin-actions">
                <button type="button" class="admin-button ghost" (click)="closeForm()">Cancel</button>
                <button type="submit" class="admin-button primary" [disabled]="isSaving()">
                  {{ isSaving() ? 'Saving...' : 'Save user' }}
                </button>
              </div>
            </form>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .filters-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) repeat(3, minmax(180px, 1fr));
      gap: 14px;
    }

    .search-field .search-box {
      position: relative;
    }

    .search-box lucide-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--saas-muted);
    }

    .search-box .admin-input {
      padding-left: 42px;
    }

    .table-toolbar {
      padding: 20px 24px;
      border-bottom: 1px solid var(--saas-border);
    }

    .table-toolbar strong {
      color: var(--saas-text);
      font-size: 1rem;
    }

    .table-toolbar p {
      margin: 6px 0 0;
      color: var(--saas-muted);
    }

    .pager {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--saas-muted);
      font-size: 0.88rem;
      font-weight: 700;
    }

    .user-cell {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .avatar {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 900;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      flex-shrink: 0;
    }

    td p,
    td small {
      margin: 4px 0 0;
      color: var(--saas-muted);
    }

    .badge-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 6px;
    }

    .status-toggle {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border: none;
      border-radius: 999px;
      font-weight: 800;
      color: #166534;
      background: rgba(22, 163, 74, 0.12);
      cursor: pointer;
    }

    .status-toggle.inactive {
      color: #991b1b;
      background: rgba(239, 68, 68, 0.12);
    }

    .knob {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      background: currentColor;
    }

    .menu-cell {
      position: relative;
      width: 70px;
    }

    .icon-button {
      width: 36px;
      height: 36px;
      border: 1px solid var(--saas-border);
      border-radius: 12px;
      background: transparent;
      color: var(--saas-muted);
      cursor: pointer;
    }

    .action-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 10px;
      display: grid;
      gap: 6px;
      min-width: 140px;
      padding: 8px;
      border-radius: 16px;
      border: 1px solid var(--saas-border);
      background: var(--saas-surface);
      box-shadow: var(--saas-shadow);
      z-index: 4;
    }

    .action-menu button {
      padding: 10px 12px;
      border: none;
      border-radius: 10px;
      text-align: left;
      color: var(--saas-text);
      background: transparent;
      cursor: pointer;
    }

    .action-menu button:hover {
      background: rgba(148, 163, 184, 0.12);
    }

    .modal-shell {
      display: grid;
      gap: 20px;
    }

    h2 {
      margin: 8px 0 0;
      color: var(--saas-text);
      font-size: 1.3rem;
      font-weight: 900;
    }

    .modal-form,
    .roles-section {
      display: grid;
      gap: 18px;
    }

    .section-heading {
      display: grid;
      gap: 6px;
    }

    .section-heading small,
    .role-card span {
      color: var(--saas-muted);
    }

    .roles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .role-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--saas-border);
      cursor: pointer;
      background: rgba(148, 163, 184, 0.08);
    }

    .role-card.selected {
      border-color: rgba(37, 99, 235, 0.34);
      background: rgba(37, 99, 235, 0.1);
    }

    .role-card input {
      margin-top: 2px;
    }

    .role-card div {
      display: grid;
      gap: 6px;
    }

    .form-error {
      margin: 0;
      color: #dc2626;
      font-weight: 800;
    }

    @media (max-width: 1080px) {
      .filters-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 768px) {
      .filters-grid {
        grid-template-columns: 1fr;
      }

      .pager {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class AdminUsersComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  readonly breadcrumbs = [{ label: 'Admin', route: '/app/admin/dashboard' }, { label: 'Users' }];

  readonly page = signal(0);
  readonly size = signal(12);
  readonly totalElements = signal(0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalElements() / this.size())));
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly submitted = signal(false);
  readonly menuOpenId = signal<number | null>(null);

  readonly users = signal<AdminUser[]>([]);
  readonly allUsers = signal<AdminUser[]>([]);
  readonly roles = signal<AdminRole[]>([]);
  readonly entreprises = signal<AdminEntreprise[]>([]);
  readonly departements = signal<AdminDepartement[]>([]);
  readonly equipes = signal<any[]>([]);

  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly statusFilter = signal('');
  readonly entrepriseFilter = signal('');
  readonly selectedEntrepriseId = signal<number | null>(null);
  readonly selectedDepartementId = signal<number | null>(null);

  readonly showForm = signal(false);
  readonly editingUser = signal<AdminUser | null>(null);
  readonly selectedRoleIds = signal<number[]>([]);

  readonly form = this.fb.group({
    nom: ['', Validators.required],
    prenom: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    motDePasse: [''],
    telephone: [''],
    poste: [''],
    statut: ['ACTIF', Validators.required],
    entrepriseId: [null as number | null, Validators.required],
    departementId: [null as number | null],
    equipeId: [null as number | null],
    managerId: [null as number | null]
  });

  readonly filteredUsers = computed(() => {
    const search = this.search().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    const entreprise = this.entrepriseFilter();

    return this.users().filter(user => {
      const matchesSearch = !search
        || `${user.prenom} ${user.nom}`.toLowerCase().includes(search)
        || user.email.toLowerCase().includes(search);
      const matchesRole = !role || user.roles.some(item => item.nom === role);
      const matchesStatus = !status || user.statut === status;
      const matchesEntreprise = !entreprise || String(user.entrepriseId ?? '') === entreprise;
      return matchesSearch && matchesRole && matchesStatus && matchesEntreprise;
    });
  });

  readonly formDepartements = computed(() => {
    const entrepriseId = this.selectedEntrepriseId();
    return this.departements().filter(item => !entrepriseId || item.entrepriseId === entrepriseId);
  });

  readonly formEquipes = computed(() => {
    const departementId = this.selectedDepartementId();
    return this.equipes().filter((item: any) => !departementId || item.departementId === departementId);
  });

  readonly managerOptions = computed(() => this.allUsers().filter(user =>
    user.id !== this.editingUser()?.id && user.roles.some(role => role.nom === 'ROLE_MANAGER')
  ));

  readonly formError = computed(() => {
    if (!this.submitted()) {
      return '';
    }
    if (this.selectedRoleIds().length === 0) {
      return 'Select at least one role.';
    }
    if (!this.editingUser() && !(this.form.controls.motDePasse.value || '').trim()) {
      return 'Password is required when creating a new user.';
    }
    if (this.form.invalid) {
      return 'Complete all required fields before saving.';
    }
    return '';
  });

  constructor() {
    this.loadReferenceData();
    this.loadUsers();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const search = params.get('search');
        if (search) {
          this.search.set(search);
        }
      });

    this.form.controls.entrepriseId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      this.selectedEntrepriseId.set(value ?? null);
      this.form.controls.departementId.setValue(null);
      this.form.controls.equipeId.setValue(null);
    });

    this.form.controls.departementId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      this.selectedDepartementId.set(value ?? null);
      this.form.controls.equipeId.setValue(null);
    });
  }

  formatRole(role: string): string {
    return formatRoleLabel(role);
  }

  roleMeta(role: string) {
    return ADMIN_ROLE_BADGES[role] ?? { label: role, tone: 'neutral' };
  }

  initials(user: AdminUser): string {
    return `${user.prenom[0] ?? ''}${user.nom[0] ?? ''}`.toUpperCase();
  }

  managerName(user: AdminUser): string {
    const manager = this.allUsers().find(candidate => candidate.id === user.managerId);
    return manager ? `${manager.prenom} ${manager.nom}` : 'Unassigned';
  }

  loadReferenceData(): void {
    forkJoin({
      roles: this.api.getRoles(),
      entreprises: this.api.getEntreprises(0, 200),
      departements: this.api.getDepartements(0, 200),
      equipes: this.api.getEquipes(0, 200),
      users: this.api.getUsers(0, 200)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ roles, entreprises, departements, equipes, users }) => {
          this.roles.set(roles);
          this.entreprises.set(entreprises.content);
          this.departements.set(departements.content);
          this.equipes.set(equipes.content);
          this.allUsers.set(users.content);
        },
        error: () => this.toast.error('Erreur lors du chargement des référentiels admin')
      });
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.api.getUsers(this.page(), this.size())
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: page => {
          this.users.set(page.content);
          this.totalElements.set(page.totalElements);
        },
        error: () => this.toast.error('Erreur lors du chargement des utilisateurs')
      });
  }

  changePage(offset: number): void {
    this.page.update(value => Math.max(0, value + offset));
    this.loadUsers();
  }

  toggleMenu(userId: number): void {
    this.menuOpenId.update(current => current === userId ? null : userId);
  }

  openCreate(): void {
    this.menuOpenId.set(null);
    this.editingUser.set(null);
    this.selectedRoleIds.set([]);
    this.submitted.set(false);
    this.form.reset({
      nom: '',
      prenom: '',
      email: '',
      motDePasse: '',
      telephone: '',
      poste: '',
      statut: 'ACTIF',
      entrepriseId: null,
      departementId: null,
      equipeId: null,
      managerId: null
    });
    this.selectedEntrepriseId.set(null);
    this.selectedDepartementId.set(null);
    this.showForm.set(true);
  }

  openEdit(user: AdminUser): void {
    this.menuOpenId.set(null);
    this.editingUser.set(user);
    this.selectedRoleIds.set(user.roles.map(role => role.id));
    this.submitted.set(false);
    this.form.reset({
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      motDePasse: '',
      telephone: user.telephone ?? '',
      poste: user.poste ?? '',
      statut: user.statut,
      entrepriseId: user.entrepriseId ?? null,
      departementId: user.departementId ?? null,
      equipeId: user.equipeId ?? null,
      managerId: user.managerId ?? null
    });
    this.selectedEntrepriseId.set(user.entrepriseId ?? null);
    this.selectedDepartementId.set(user.departementId ?? null);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingUser.set(null);
  }

  toggleRole(roleId: number, checked: boolean): void {
    const current = new Set(this.selectedRoleIds());
    if (checked) {
      current.add(roleId);
    } else {
      current.delete(roleId);
    }
    this.selectedRoleIds.set([...current]);
  }

  toggleStatus(user: AdminUser): void {
    this.api.toggleUserStatus(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Statut utilisateur mis à jour');
          this.loadReferenceData();
          this.loadUsers();
        },
        error: () => this.toast.error('Erreur lors du changement de statut')
      });
  }

  save(): void {
    this.submitted.set(true);
    if (this.formError()) {
      return;
    }

    const value = this.form.getRawValue();
    const payload: AdminUserPayload = {
      nom: value.nom ?? '',
      prenom: value.prenom ?? '',
      email: value.email ?? '',
      motDePasse: value.motDePasse ?? '',
      telephone: value.telephone ?? undefined,
      poste: value.poste ?? undefined,
      statut: (value.statut as 'ACTIF' | 'INACTIF') ?? 'ACTIF',
      entrepriseId: Number(value.entrepriseId),
      departementId: value.departementId ?? null,
      equipeId: value.equipeId ?? null,
      roleIds: this.selectedRoleIds()
    };
    const managerId = value.managerId ?? null;

    this.isSaving.set(true);
    const request$ = this.editingUser()
      ? this.api.updateUser(this.editingUser()!.id, payload)
      : this.api.createUser(payload);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSaving.set(false))
      )
      .subscribe({
        next: user => {
          this.api.assignManager(user.id, managerId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.toast.success(this.editingUser() ? 'Utilisateur mis à jour' : 'Utilisateur créé');
                this.closeForm();
                this.loadReferenceData();
                this.loadUsers();
              },
              error: () => {
                this.toast.error('Compte enregistré, mais manager non affecté');
                this.closeForm();
                this.loadReferenceData();
                this.loadUsers();
              }
            });
        },
        error: () => this.toast.error('Erreur lors de l’enregistrement utilisateur')
      });
  }

  remove(user: AdminUser): void {
    this.menuOpenId.set(null);
    if (!confirm(`Delete ${user.prenom} ${user.nom} ? This will mark the account inactive.`)) {
      return;
    }
    this.api.deleteUser(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success('Utilisateur supprimé');
          this.loadReferenceData();
          this.loadUsers();
        },
        error: () => this.toast.error('Erreur lors de la suppression')
      });
  }

  protected readonly adminRoleOptions = ADMIN_ROLE_OPTIONS;
}
