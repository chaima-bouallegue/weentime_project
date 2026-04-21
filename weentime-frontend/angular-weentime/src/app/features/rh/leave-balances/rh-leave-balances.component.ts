import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, forkJoin } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { AdminApiService, AdminUser } from '../../admin/admin-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminSkeletonComponent } from '../../../shared/components/admin-skeleton/admin-skeleton.component';
import { AdminStatCardComponent } from '../../../shared/components/admin-stat-card/admin-stat-card.component';
import { RhApiService, RhLeaveBalance, TypeCongeOption } from '../rh-api.service';

interface BalanceView extends RhLeaveBalance {
  typeLabel: string;
  maxDays: number;
}

@Component({
  selector: 'app-rh-leave-balances',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    AdminPageHeaderComponent,
    AdminStatCardComponent,
    AdminEmptyStateComponent,
    AdminSkeletonComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rh-page page-fade">
      <app-admin-page-header
        eyebrow="Leave management"
        title="Leave balances and quotas"
        description="Initialize, review and adjust employee leave balances with safe defaults."
        [breadcrumbs]="breadcrumbs"
        primaryLabel="Refresh balances"
        primaryIcon="refresh-cw"
        (primaryAction)="loadBalances()">
      </app-admin-page-header>

      <section class="admin-grid kpi-grid">
        <app-admin-stat-card label="Tracked balances" icon="wallet" [value]="balances().length" hint="Leave types available for the selected employee." tone="info"></app-admin-stat-card>
        <app-admin-stat-card label="Acquired days" icon="calendar-range" [value]="totalAcquired()" hint="Total acquired leave days." tone="success"></app-admin-stat-card>
        <app-admin-stat-card label="Remaining days" icon="calendar-check" [value]="totalRemaining()" hint="Remaining leave days after consumption." tone="warning"></app-admin-stat-card>
        <app-admin-stat-card label="Pending days" icon="hourglass" [value]="totalPending()" hint="Days reserved by pending leave requests." tone="danger"></app-admin-stat-card>
      </section>

      <section class="admin-surface filter-panel">
        <div class="filters-grid">
          <label class="admin-form-field">
            <span>Employee</span>
            <select class="admin-select" [ngModel]="selectedUserId()" (ngModelChange)="selectedUserId.set(toOptionalNumber($event))">
              <option [ngValue]="null">Choose an employee</option>
              @for (user of userOptions(); track user.id) {
                <option [ngValue]="user.id">{{ user.prenom }} {{ user.nom }} · {{ user.email }}</option>
              }
            </select>
          </label>

          <label class="admin-form-field">
            <span>Year</span>
            <input class="admin-input" type="number" [ngModel]="selectedYear()" (ngModelChange)="selectedYear.set(toYear($event))" />
          </label>
        </div>
      </section>

      @if (isLoading()) {
        <app-admin-skeleton [count]="4" [columns]="2"></app-admin-skeleton>
      } @else if (!selectedUserId()) {
        <app-admin-empty-state title="Choose an employee" description="Select an employee to initialize and manage leave balances." icon="users"></app-admin-empty-state>
      } @else if (balances().length === 0) {
        <app-admin-empty-state title="No leave balance found" description="Default balances will be created automatically when the employee is loaded." icon="calendar-x-2"></app-admin-empty-state>
      } @else {
        <section class="balance-grid">
          @for (balance of balances(); track balance.typeCongeId) {
            <article class="admin-surface balance-card">
              <div class="card-head">
                <div>
                  <span class="type-pill">{{ balance.typeLabel }}</span>
                  <h2>{{ balance.maxDays }} max days</h2>
                </div>
                <button type="button" class="icon-button" (click)="openEdit(balance)">
                  <lucide-icon name="pencil" size="16"></lucide-icon>
                </button>
              </div>

              <div class="balance-metrics">
                <div class="metric-box">
                  <span>Acquired</span>
                  <strong>{{ balance.joursAcquis }}</strong>
                </div>
                <div class="metric-box">
                  <span>Used</span>
                  <strong>{{ balance.joursUtilises }}</strong>
                </div>
                <div class="metric-box">
                  <span>Remaining</span>
                  <strong>{{ balance.joursRestants }}</strong>
                </div>
                <div class="metric-box">
                  <span>Pending</span>
                  <strong>{{ balance.joursEnAttente }}</strong>
                </div>
              </div>
            </article>
          }
        </section>
      }

      @if (editingBalance()) {
        <div class="admin-modal-backdrop" (click)="closeEdit()"></div>
        <section class="admin-modal admin-surface">
          <div class="decision-modal">
            <div class="modal-head">
              <span class="type-pill">Adjust balance</span>
              <button type="button" class="icon-button" (click)="closeEdit()">
                <lucide-icon name="x" size="16"></lucide-icon>
              </button>
            </div>

            <div>
              <h2>{{ editingBalance()!.typeLabel }}</h2>
              <p>{{ selectedUserLabel() }} · {{ selectedYear() }}</p>
            </div>

            <div class="form-grid">
              <label class="admin-form-field"><span>Acquired</span><input class="admin-input" type="number" [(ngModel)]="draft.joursAcquis" /></label>
              <label class="admin-form-field"><span>Used</span><input class="admin-input" type="number" [(ngModel)]="draft.joursUtilises" /></label>
              <label class="admin-form-field"><span>Remaining</span><input class="admin-input" type="number" [(ngModel)]="draft.joursRestants" /></label>
              <label class="admin-form-field"><span>Pending</span><input class="admin-input" type="number" [(ngModel)]="draft.joursEnAttente" /></label>
            </div>

            <div class="admin-actions">
              <button type="button" class="admin-button ghost" (click)="closeEdit()">Cancel</button>
              <button type="button" class="admin-button primary" (click)="saveEdit()" [disabled]="isSaving()">Save balance</button>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .rh-page { display: grid; gap: 20px; }
    .page-fade { animation: page-fade 0.28s ease; }
    .kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .filter-panel { padding: 20px; }
    .filters-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(180px, 0.5fr); gap: 14px; }
    .balance-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .balance-card { display: grid; gap: 18px; padding: 20px; }
    .card-head, .modal-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
    .type-pill { display: inline-flex; width: fit-content; margin-bottom: 8px; padding: 6px 10px; border-radius: 999px; color: #1d4ed8; background: rgba(37, 99, 235, 0.12); font-size: 12px; font-weight: 800; }
    h2 { margin: 0; color: var(--saas-text); font-size: 1.1rem; font-weight: 900; }
    p, .metric-box span { margin: 0; color: var(--saas-muted); }
    .balance-metrics, .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .metric-box { display: grid; gap: 6px; padding: 14px; border-radius: 16px; background: rgba(148, 163, 184, 0.08); }
    .metric-box strong { color: var(--saas-text); }
    .icon-button { border: none; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: var(--saas-muted); background: rgba(148, 163, 184, 0.12); cursor: pointer; }
    .decision-modal { display: grid; gap: 18px; padding: 4px; }
    @media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 768px) { .kpi-grid, .filters-grid, .balance-metrics, .form-grid { grid-template-columns: 1fr; } }
    @keyframes page-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class RhLeaveBalancesComponent {
  private readonly api = inject(RhApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly breadcrumbs = [{ label: 'RH', route: '/app/rh/dashboard' }, { label: 'Leave balances' }];
  readonly currentYear = new Date().getFullYear();
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly users = signal<AdminUser[]>([]);
  readonly typeConges = signal<TypeCongeOption[]>([]);
  readonly balances = signal<BalanceView[]>([]);
  readonly selectedUserId = signal<number | null>(null);
  readonly selectedYear = signal(this.currentYear);
  readonly editingBalance = signal<BalanceView | null>(null);
  draft = { joursAcquis: 0, joursUtilises: 0, joursRestants: 0, joursEnAttente: 0 };

  readonly userOptions = computed(() => this.users().filter(user => user.roles.some(role => role.nom === 'ROLE_EMPLOYEE')));
  readonly totalAcquired = computed(() => this.sumBalance('joursAcquis'));
  readonly totalRemaining = computed(() => this.sumBalance('joursRestants'));
  readonly totalPending = computed(() => this.sumBalance('joursEnAttente'));
  readonly selectedUserLabel = computed(() => {
    const user = this.users().find(item => item.id === this.selectedUserId());
    return user ? `${user.prenom} ${user.nom}` : 'Unknown employee';
  });

  constructor() {
    this.loadReferences();

    effect(() => {
      this.selectedUserId();
      this.selectedYear();
      if (this.selectedUserId()) {
        queueMicrotask(() => this.loadBalances());
      }
    });
  }

  private loadReferences(): void {
    this.isLoading.set(true);
    forkJoin({
      users: this.adminApi.getUsers(0, 200),
      typeConges: this.api.getTypeConges()
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ users, typeConges }) => {
          this.users.set(users.content);
          this.typeConges.set(typeConges);
        },
        error: () => this.toast.error('Unable to load leave balance references.')
      });
  }

  loadBalances(): void {
    const userId = this.selectedUserId();
    if (!userId) {
      this.balances.set([]);
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.api.getLeaveBalances(userId, this.selectedYear())
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: balances => this.balances.set(balances.map(balance => this.toView(balance))),
        error: () => {
          this.balances.set([]);
          this.toast.error('Unable to load leave balances.');
        }
      });
  }

  openEdit(balance: BalanceView): void {
    this.editingBalance.set(balance);
    this.draft = {
      joursAcquis: balance.joursAcquis,
      joursUtilises: balance.joursUtilises,
      joursRestants: balance.joursRestants,
      joursEnAttente: balance.joursEnAttente
    };
  }

  closeEdit(): void {
    this.editingBalance.set(null);
  }

  saveEdit(): void {
    const balance = this.editingBalance();
    const userId = this.selectedUserId();
    if (!balance || !userId) {
      return;
    }

    this.isSaving.set(true);
    this.api.saveLeaveBalance({
      id: balance.id,
      utilisateurId: userId,
      typeCongeId: balance.typeCongeId,
      annee: this.selectedYear(),
      joursAcquis: Number(this.draft.joursAcquis),
      joursUtilises: Number(this.draft.joursUtilises),
      joursRestants: Number(this.draft.joursRestants),
      joursEnAttente: Number(this.draft.joursEnAttente)
    })
      .pipe(
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: saved => {
          this.toast.success('Leave balance updated.');
          this.balances.update(items => items.map(item => item.typeCongeId === saved.typeCongeId ? this.toView(saved) : item));
          this.closeEdit();
        },
        error: () => this.toast.error('Unable to save leave balance.')
      });
  }

  protected toOptionalNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  protected toYear(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : this.currentYear;
  }

  private toView(balance: RhLeaveBalance): BalanceView {
    const type = this.typeConges().find(item => item.id === balance.typeCongeId);
    return {
      ...balance,
      typeLabel: type?.libelle || `Type #${balance.typeCongeId}`,
      maxDays: Number(type?.nombreJoursMax ?? balance.joursAcquis ?? 0)
    };
  }

  private sumBalance(key: keyof Pick<BalanceView, 'joursAcquis' | 'joursRestants' | 'joursEnAttente'>): number {
    return this.balances().reduce((sum, balance) => sum + Number(balance[key] ?? 0), 0);
  }
}
