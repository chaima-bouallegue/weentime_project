import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService, AdminEntreprise, AdminRole } from '../admin-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminStatCardComponent } from '../../../shared/components/admin-stat-card/admin-stat-card.component';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, AdminPageHeaderComponent, AdminStatCardComponent, AdminEmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page">
      <app-admin-page-header
        eyebrow="Settings"
        title="Company limits and system configuration"
        description="Vue admin centralisée des limites de tenants, du maillage organisationnel et des politiques d’accès."
        [breadcrumbs]="breadcrumbs">
        <a routerLink="/app/admin/entreprises" class="admin-button primary">Manage companies</a>
      </app-admin-page-header>

      @if (isLoading()) {
        <section class="admin-grid kpis">
          <div class="admin-surface admin-panel placeholder"></div>
          <div class="admin-surface admin-panel placeholder"></div>
          <div class="admin-surface admin-panel placeholder"></div>
          <div class="admin-surface admin-panel placeholder"></div>
        </section>
      } @else {
        <section class="admin-grid kpis">
          <app-admin-stat-card label="Global users" icon="users" [value]="totalUsers()" hint="Utilisateurs recensés via organisation-service"></app-admin-stat-card>
          <app-admin-stat-card label="Active companies" icon="building-2" [value]="activeEntreprises()" tone="success" hint="Tenants actuellement actifs"></app-admin-stat-card>
          <app-admin-stat-card label="Departments" icon="network" [value]="totalDepartements()" hint="Structures déclarées côté organisation"></app-admin-stat-card>
          <app-admin-stat-card label="Teams" icon="briefcase" [value]="totalEquipes()" hint="Equipes disponibles pour les affectations"></app-admin-stat-card>
        </section>

        <section class="admin-grid dual">
          <article class="admin-surface admin-panel">
            <div class="panel-head">
              <div>
                <span class="admin-pill">Company settings</span>
                <h2>Tenant limits</h2>
              </div>
            </div>

            @if (entreprises().length === 0) {
              <app-admin-empty-state title="No companies available" description="Aucune entreprise n’a été configurée dans le système." icon="building"></app-admin-empty-state>
            } @else {
              <div class="company-list">
                @for (entreprise of entreprises(); track entreprise.id) {
                  <div class="company-row">
                    <div>
                      <strong>{{ entreprise.nom }}</strong>
                      <p>{{ entreprise.email || entreprise.secteur || 'No company metadata' }}</p>
                    </div>
                    <div class="company-metrics">
                      <span class="admin-badge" [class]="entreprise.estActive ? 'success' : 'neutral'">{{ entreprise.estActive ? 'Active' : 'Inactive' }}</span>
                      <strong>{{ entreprise.currentUsers || 0 }} / {{ entreprise.maxUsers || '∞' }}</strong>
                    </div>
                    <div class="metric-track">
                      <div class="metric-fill" [style.width.%]="companyUsage(entreprise)"></div>
                    </div>
                  </div>
                }
              </div>
            }
          </article>

          <article class="admin-surface admin-panel">
            <div class="panel-head">
              <div>
                <span class="admin-pill">System config</span>
                <h2>Policy overview</h2>
              </div>
            </div>

            <div class="config-grid">
              <div class="config-card">
                <span>Role templates</span>
                <strong>{{ roles().length }}</strong>
                <small>Rôles configurés côté backend</small>
              </div>
              <div class="config-card">
                <span>Permission rules</span>
                <strong>{{ totalPermissions() }}</strong>
                <small>Permissions explicites agrégées sur tous les rôles</small>
              </div>
              <div class="config-card">
                <span>Capacity pressure</span>
                <strong>{{ constrainedCompanies() }}</strong>
                <small>Tenant(s) proches de leur limite utilisateur</small>
              </div>
              <div class="config-card">
                <span>Tenant codes</span>
                <strong>{{ invitationCoverage() }}%</strong>
                <small>Entreprises avec code d’invitation généré</small>
              </div>
            </div>
          </article>
        </section>

        <section class="admin-surface admin-panel">
          <div class="panel-head">
            <div>
              <span class="admin-pill">Role coverage</span>
              <h2>Roles and permissions matrix</h2>
            </div>
          </div>

          @if (roles().length === 0) {
            <app-admin-empty-state title="No role policies" description="Aucun rôle n’est actuellement disponible." icon="shield"></app-admin-empty-state>
          } @else {
            <div class="roles-matrix">
              @for (role of roles(); track role.id) {
                <div class="matrix-card">
                  <div class="matrix-head">
                    <strong>{{ role.nom }}</strong>
                    <span class="admin-badge info">{{ role.permissions?.length || 0 }} permission(s)</span>
                  </div>
                  <p>{{ role.description || 'No description defined.' }}</p>
                  <div class="permission-cloud">
                    @for (permission of role.permissions || []; track permission) {
                      <span>{{ permission }}</span>
                    } @empty {
                      <span class="muted">No explicit permissions</span>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .placeholder {
      min-height: 140px;
    }

    .panel-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }

    h2 {
      margin: 8px 0 0;
      color: var(--saas-text);
      font-size: 1.2rem;
      font-weight: 900;
    }

    .company-list,
    .roles-matrix {
      display: grid;
      gap: 14px;
    }

    .company-row,
    .matrix-card,
    .config-card {
      display: grid;
      gap: 10px;
      padding: 16px;
      border-radius: 18px;
      background: rgba(148, 163, 184, 0.08);
    }

    .company-row strong,
    .matrix-head strong,
    .config-card strong {
      color: var(--saas-text);
    }

    .company-row p,
    .matrix-card p,
    .config-card small {
      margin: 0;
      color: var(--saas-muted);
      line-height: 1.5;
    }

    .company-metrics,
    .matrix-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .metric-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.16);
      overflow: hidden;
    }

    .metric-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
    }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .config-card span {
      color: var(--saas-muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
    }

    .config-card strong {
      font-size: 1.6rem;
      font-weight: 900;
    }

    .permission-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .permission-cloud span {
      display: inline-flex;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(37, 99, 235, 0.1);
      color: #1d4ed8;
      font-size: 12px;
      font-weight: 800;
    }

    .permission-cloud span.muted {
      background: rgba(148, 163, 184, 0.12);
      color: var(--saas-muted);
    }

    @media (max-width: 768px) {
      .config-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class AdminSettingsComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly breadcrumbs = [{ label: 'Admin', route: '/app/admin/dashboard' }, { label: 'Settings' }];
  readonly isLoading = signal(true);
  readonly totalUsers = signal(0);
  readonly activeEntreprises = signal(0);
  readonly totalDepartements = signal(0);
  readonly totalEquipes = signal(0);
  readonly entreprises = signal<AdminEntreprise[]>([]);
  readonly roles = signal<AdminRole[]>([]);

  readonly totalPermissions = computed(() => this.roles().reduce((sum, role) => sum + (role.permissions?.length || 0), 0));
  readonly constrainedCompanies = computed(() =>
    this.entreprises().filter(entreprise => {
      if (!entreprise.maxUsers) {
        return false;
      }
      return (entreprise.currentUsers || 0) / entreprise.maxUsers >= 0.8;
    }).length
  );
  readonly invitationCoverage = computed(() => {
    if (this.entreprises().length === 0) {
      return 0;
    }
    const covered = this.entreprises().filter(entreprise => Boolean(entreprise.codeInvitation)).length;
    return Math.round((covered / this.entreprises().length) * 100);
  });

  constructor() {
    forkJoin({
      users: this.api.getUsers(0, 200),
      entreprises: this.api.getEntreprises(0, 200),
      departements: this.api.getDepartements(0, 200),
      equipes: this.api.getEquipes(0, 200),
      roles: this.api.getRoles()
    }).pipe(
      finalize(() => this.isLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: ({ users, entreprises, departements, equipes, roles }) => {
        this.totalUsers.set(users.totalElements);
        this.activeEntreprises.set(entreprises.content.filter(item => item.estActive).length);
        this.totalDepartements.set(departements.totalElements);
        this.totalEquipes.set(equipes.totalElements);
        this.entreprises.set(entreprises.content);
        this.roles.set(roles);
      },
      error: () => this.toast.error('Erreur lors du chargement des paramètres admin')
    });
  }

  companyUsage(entreprise: AdminEntreprise): number {
    if (!entreprise.maxUsers) {
      return 12;
    }
    return Math.min(100, Math.round(((entreprise.currentUsers || 0) / entreprise.maxUsers) * 100));
  }
}
