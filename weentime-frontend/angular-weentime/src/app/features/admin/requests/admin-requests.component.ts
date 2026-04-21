import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AdminApiService, AdminRequest } from '../admin-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { REQUEST_STATUS_META, REQUEST_STATUS_TABS } from '../admin-ui';

@Component({
  selector: 'app-admin-requests',
  standalone: true,
  imports: [CommonModule, AdminPageHeaderComponent, AdminEmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-page">
      <app-admin-page-header
        eyebrow="Request monitoring"
        title="Leave and telework workflow stream"
        description="Suivi unifié des demandes RH avec filtrage par statut, utilisateur et type de demande."
        [breadcrumbs]="breadcrumbs">
      </app-admin-page-header>

      <section class="admin-surface admin-panel">
        <div class="tabs">
          @for (tab of tabs; track tab.value) {
            <button type="button" class="tab-btn" [class.active]="statusTab() === tab.value" (click)="changeTab(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>

        <div class="filters-grid">
          <label class="admin-form-field">
            <span>User</span>
            <input class="admin-input" [value]="userFilter()" (input)="userFilter.set(($any($event.target).value || '').trim())" placeholder="Search by employee" />
          </label>
          <label class="admin-form-field">
            <span>Type</span>
            <input class="admin-input" [value]="typeFilter()" (input)="typeFilter.set(($any($event.target).value || '').trim())" placeholder="Leave, telework, absence..." />
          </label>
        </div>
      </section>

      @if (isLoading()) {
        <section class="card-grid">
          @for (item of [0,1,2]; track item) {
            <div class="admin-surface admin-panel placeholder"></div>
          }
        </section>
      } @else if (filteredRequests().length === 0) {
        <app-admin-empty-state title="No requests in this view" description="Aucune demande ne correspond au statut ou aux filtres actuels." icon="inbox"></app-admin-empty-state>
      } @else {
        <section class="card-grid">
          @for (request of filteredRequests(); track request.id) {
            <article class="admin-surface admin-panel request-card">
              <div class="card-head">
                <span class="admin-badge" [class]="statusMeta(request.statut).tone">{{ statusMeta(request.statut).label }}</span>
                <strong>#{{ request.id }}</strong>
              </div>

              <div class="request-title">
                <strong>{{ formatType(request.typeDemande) }}</strong>
                <p>{{ request.utilisateur?.fullName || fullName(request.utilisateur) || 'Unknown user' }}</p>
              </div>

              <div class="meta-grid">
                <div>
                  <span>Period</span>
                  <strong>{{ formatRange(request) }}</strong>
                </div>
                <div>
                  <span>Created</span>
                  <strong>{{ formatDate(request.createdAt) }}</strong>
                </div>
                <div>
                  <span>Manager</span>
                  <strong>{{ request.manager?.fullName || fullName(request.manager) || 'Not assigned' }}</strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>{{ durationLabel(request) }}</strong>
                </div>
              </div>

              @if (request.motif || request.commentaire) {
                <div class="request-note">
                  {{ request.motif || request.commentaire }}
                </div>
              }
            </article>
          }
        </section>

        <div class="admin-toolbar pager-bar">
          <button type="button" class="admin-button secondary" (click)="changePage(-1)" [disabled]="page() === 0">Previous</button>
          <span>Page {{ page() + 1 }} / {{ totalPages() }}</span>
          <button type="button" class="admin-button secondary" (click)="changePage(1)" [disabled]="page() + 1 >= totalPages()">Next</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .tabs {
      display: inline-flex;
      gap: 8px;
      padding: 6px;
      border-radius: 18px;
      background: rgba(148, 163, 184, 0.1);
      margin-bottom: 16px;
    }

    .tab-btn {
      min-width: 110px;
      padding: 10px 14px;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: var(--saas-muted);
      font-weight: 800;
      cursor: pointer;
    }

    .tab-btn.active {
      color: #fff;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
    }

    .filters-grid,
    .card-grid {
      display: grid;
      gap: 14px;
    }

    .filters-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card-grid {
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    }

    .placeholder {
      min-height: 220px;
    }

    .request-card {
      display: grid;
      gap: 16px;
    }

    .card-head,
    .meta-grid {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .request-title,
    .meta-grid div {
      display: grid;
      gap: 6px;
    }

    .request-title strong,
    .card-head strong,
    .meta-grid strong {
      color: var(--saas-text);
    }

    .request-title p,
    .meta-grid span {
      margin: 0;
      color: var(--saas-muted);
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .request-note {
      padding: 14px;
      border-radius: 16px;
      background: rgba(148, 163, 184, 0.08);
      color: var(--saas-text);
      line-height: 1.6;
    }

    .pager-bar {
      justify-content: center;
      color: var(--saas-muted);
      font-weight: 700;
    }

    @media (max-width: 768px) {
      .filters-grid,
      .meta-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class AdminRequestsComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly breadcrumbs = [{ label: 'Admin', route: '/app/admin/dashboard' }, { label: 'Requests' }];
  readonly tabs = REQUEST_STATUS_TABS;
  readonly statusTab = signal<string>('EN_ATTENTE');
  readonly page = signal(0);
  readonly size = signal(12);
  readonly totalElements = signal(0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalElements() / this.size())));
  readonly isLoading = signal(true);
  readonly requests = signal<AdminRequest[]>([]);
  readonly userFilter = signal('');
  readonly typeFilter = signal('');

  readonly filteredRequests = computed(() => {
    const user = this.userFilter().toLowerCase();
    const type = this.typeFilter().toLowerCase();

    return this.requests().filter(request => {
      const requestUser = (request.utilisateur?.fullName || this.fullName(request.utilisateur)).toLowerCase();
      const requestType = this.formatType(request.typeDemande).toLowerCase();
      return (!user || requestUser.includes(user)) && (!type || requestType.includes(type));
    });
  });

  constructor() {
    this.load();
  }

  changeTab(tab: string): void {
    this.statusTab.set(tab);
    this.page.set(0);
    this.load();
  }

  changePage(offset: number): void {
    this.page.update(current => Math.max(0, current + offset));
    this.load();
  }

  statusMeta(status: string) {
    return REQUEST_STATUS_META[status] ?? { label: status, tone: 'neutral' };
  }

  formatType(type: string): string {
    return (type || 'REQUEST')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  fullName(profile?: { prenom?: string; nom?: string } | null): string {
    return `${profile?.prenom || ''} ${profile?.nom || ''}`.trim();
  }

  formatDate(value?: string | null): string {
    if (!value) {
      return 'N/A';
    }
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));
  }

  formatRange(request: AdminRequest): string {
    if (request.dateDebut && request.dateFin) {
      return `${this.formatDate(request.dateDebut)} - ${this.formatDate(request.dateFin)}`;
    }
    return request.dateDebut ? this.formatDate(request.dateDebut) : 'N/A';
  }

  durationLabel(request: AdminRequest): string {
    if (request.nombreJours != null) {
      return `${request.nombreJours} day(s)`;
    }
    if (request.duree != null) {
      return `${request.duree} min`;
    }
    return 'N/A';
  }

  private load(): void {
    this.isLoading.set(true);
    this.api.getRequests(this.page(), this.size(), { statut: this.statusTab() })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: page => {
          this.requests.set(page.content);
          this.totalElements.set(page.totalElements);
        },
        error: () => this.toast.error('Erreur lors du chargement des demandes admin')
      });
  }
}
