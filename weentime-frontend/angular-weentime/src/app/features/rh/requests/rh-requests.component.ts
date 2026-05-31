import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../../core/services/toast.service';
import { AdminEmptyStateComponent } from '../../../shared/components/admin-empty-state/admin-empty-state.component';
import { AdminPageHeaderComponent } from '../../../shared/components/admin-page-header/admin-page-header.component';
import { AdminSkeletonComponent } from '../../../shared/components/admin-skeleton/admin-skeleton.component';
import { AdminStatCardComponent } from '../../../shared/components/admin-stat-card/admin-stat-card.component';
import { RhDashboardService } from '../dashboard/rh-dashboard.service';
import { RhApiService, RhRequest } from '../rh-api.service';
import { ValidationStore } from '../../../core/services/validation.store';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';

type RequestAction = 'approve' | 'reject';
type StatusTab = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

@Component({
  selector: 'app-rh-requests',
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
        eyebrow="Global request management"
        title="RH request workflow"
        description="Final validation queue for leave, absence and telework requests with server-backed filters."
        [breadcrumbs]="breadcrumbs"
        primaryLabel="Refresh queue"
        primaryIcon="refresh-cw"
        (primaryAction)="load()">
      </app-admin-page-header>

      <section class="admin-grid kpi-grid">
        <app-admin-stat-card label="Pending" icon="inbox" [value]="pendingCount()" [delta]="pendingDelta()" hint="Requests waiting for RH action." tone="warning"></app-admin-stat-card>
        <app-admin-stat-card label="Approved" icon="badge-check" [value]="approvedCount()" hint="Requests fully approved by RH." tone="success"></app-admin-stat-card>
        <app-admin-stat-card label="Rejected" icon="x-circle" [value]="rejectedCount()" hint="Requests rejected during RH validation." tone="danger"></app-admin-stat-card>
        <app-admin-stat-card label="Telework" icon="laptop" [value]="teleworkCount()" hint="Telework requests visible in the RH queue." tone="info"></app-admin-stat-card>
      </section>

      <section class="admin-surface filter-panel">
        <div class="status-tabs">
          @for (tab of tabs; track tab.value) {
            <button type="button" class="status-tab" [class.active]="statusTab() === tab.value" (click)="statusTab.set(tab.value)">
              {{ tab.label }}
            </button>
          }
        </div>

        <div class="filters-grid">
          <label class="admin-form-field">
            <span>Employee</span>
            <div class="search-shell">
              <lucide-icon name="search" size="16"></lucide-icon>
              <input class="admin-input" [ngModel]="employeeFilter()" (ngModelChange)="employeeFilter.set($event || '')" placeholder="Search employee name or email" />
            </div>
          </label>

          <label class="admin-form-field">
            <span>Type</span>
            <select class="admin-select" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event || '')">
              <option value="">All request types</option>
              @for (type of requestTypes; track type) {
                <option [value]="type">{{ formatType(type) }}</option>
              }
            </select>
          </label>

          <label class="admin-form-field">
            <span>Date from</span>
            <input class="admin-input" type="date" [ngModel]="dateFrom()" (ngModelChange)="dateFrom.set($event || '')" />
          </label>

          <label class="admin-form-field">
            <span>Date to</span>
            <input class="admin-input" type="date" [ngModel]="dateTo()" (ngModelChange)="dateTo.set($event || '')" />
          </label>
        </div>
      </section>

      @if (errorMessage()) {
        <section class="inline-alert">
          <lucide-icon name="triangle-alert" size="18"></lucide-icon>
          <span>{{ errorMessage() }}</span>
        </section>
      }

      @if (isLoading()) {
        <app-admin-skeleton [count]="6" [columns]="3"></app-admin-skeleton>
      } @else if (requests().length === 0) {
        <app-admin-empty-state title="No requests in this view" description="No RH request matches the current filters." icon="inbox"></app-admin-empty-state>
      } @else {
        <section class="request-grid">
          @for (request of requests(); track request.id) {
            <article class="admin-surface request-card">
              <div class="card-head">
                <div class="meta-stack">
                  <span class="type-pill">{{ formatType(request.type) }}</span>
                  <span class="status-pill" [class]="statusTone(request.statut)">{{ formatStatus(request.statut) }}</span>
                </div>
                <small>{{ formatDateTime(request.dateCreation) }}</small>
              </div>

              <div class="request-main">
                <div>
                  <h3>{{ requestOwner(request) }}</h3>
                  <p>{{ request.utilisateur?.email || 'No email available' }}</p>
                </div>
                <div class="side-card">
                  <span>Manager</span>
                  <strong>{{ managerName(request) }}</strong>
                </div>
              </div>

              <div class="detail-grid">
                <div class="mini-card">
                  <span>Period</span>
                  <strong>{{ requestPeriod(request) }}</strong>
                </div>
                <div class="mini-card">
                  <span>Duration</span>
                  <strong>{{ durationLabel(request) }}</strong>
                </div>
              </div>

              @if (request.motif || request.commentaire || request.commentaireValidateur) {
                <div class="note-card">
                  {{ request.motif || request.commentaire || request.commentaireValidateur }}
                </div>
              }

              <div class="request-footer">
                <span class="age-pill" [class.stale]="isStale(request)">{{ ageLabel(request) }}</span>

                @if (canReview(request)) {
                  <div class="admin-actions">
                    <button type="button" class="admin-button ghost" (click)="openDecision(request, 'reject')">Reject</button>
                    <button type="button" class="admin-button primary" (click)="openDecision(request, 'approve')">Approve</button>
                  </div>
                }
              </div>
            </article>
          }
        </section>

        <div class="admin-toolbar pager-bar">
          <button type="button" class="admin-button secondary" (click)="changePage(-1)" [disabled]="page() === 0">Previous</button>
          <span>Page {{ page() + 1 }} / {{ totalPages() }}</span>
          <button type="button" class="admin-button secondary" (click)="changePage(1)" [disabled]="page() + 1 >= totalPages()">Next</button>
        </div>
      }

      @if (selectedRequest() && selectedAction()) {
        <div class="admin-modal-backdrop" (click)="closeDecision()"></div>
        <section class="admin-modal admin-surface">
          <div class="decision-modal">
            <div class="modal-head">
              <span class="type-pill">{{ selectedAction() === 'approve' ? 'Approve request' : 'Reject request' }}</span>
              <button type="button" class="icon-button" (click)="closeDecision()" [disabled]="submitting()">
                <lucide-icon name="x" size="16"></lucide-icon>
              </button>
            </div>

            <div>
              <h2>{{ requestOwner(selectedRequest()!) }}</h2>
              <p>{{ formatType(selectedRequest()!.type) }} · {{ requestPeriod(selectedRequest()!) }}</p>
            </div>

            <label class="admin-form-field">
              <span>RH comment</span>
              <textarea class="admin-input comment-box" [(ngModel)]="decisionComment" placeholder="Add a final RH comment"></textarea>
            </label>

            <div class="admin-actions">
              <button type="button" class="admin-button ghost" (click)="closeDecision()" [disabled]="submitting()">Cancel</button>
              <button type="button" class="admin-button" [class.primary]="selectedAction() === 'approve'" [class.danger-btn]="selectedAction() === 'reject'" (click)="confirmDecision()" [disabled]="submitting()">
                {{ submitting() ? 'Saving...' : selectedAction() === 'approve' ? 'Confirm approval' : 'Confirm rejection' }}
              </button>
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
    .filter-panel { display: grid; gap: 18px; padding: 20px; }
    .status-tabs { display: inline-flex; flex-wrap: wrap; gap: 8px; padding: 6px; border-radius: 18px; background: rgba(148, 163, 184, 0.12); width: fit-content; }
    .status-tab { border: none; border-radius: 14px; padding: 10px 14px; background: transparent; color: var(--saas-muted); font-weight: 800; cursor: pointer; }
    .status-tab.active { color: #fff; background: linear-gradient(135deg, #2563eb, #7c3aed); }
    .filters-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .search-shell { position: relative; }
    .search-shell lucide-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--saas-muted); }
    .search-shell .admin-input { padding-left: 40px; }
    .inline-alert { display: inline-flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 16px; color: #b45309; background: #fff7ed; border: 1px solid rgba(245, 158, 11, 0.2); }
    .request-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .request-card { display: grid; gap: 18px; padding: 20px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .request-card:hover { transform: translateY(-2px); box-shadow: 0 24px 50px rgba(15, 23, 42, 0.08); }
    .card-head, .request-main, .request-footer, .modal-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
    .meta-stack { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .type-pill, .status-pill, .age-pill { display: inline-flex; align-items: center; justify-content: center; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; }
    .type-pill { color: #1d4ed8; background: rgba(37, 99, 235, 0.12); }
    .status-pill.warning, .age-pill.stale { color: #b45309; background: rgba(245, 158, 11, 0.16); }
    .status-pill.success { color: #15803d; background: rgba(34, 197, 94, 0.14); }
    .status-pill.danger { color: #dc2626; background: rgba(239, 68, 68, 0.14); }
    .status-pill.info, .age-pill { color: #2563eb; background: rgba(37, 99, 235, 0.12); }
    h2, h3, .side-card strong, .mini-card strong { margin: 0; color: var(--saas-text); }
    p, small, .side-card span, .mini-card span { margin: 0; color: var(--saas-muted); }
    .side-card, .mini-card { display: grid; gap: 6px; padding: 14px; border-radius: 16px; background: rgba(148, 163, 184, 0.08); }
    .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .note-card { padding: 14px; border-radius: 16px; background: rgba(148, 163, 184, 0.08); color: var(--saas-text); line-height: 1.6; }
    .pager-bar { justify-content: center; font-weight: 700; color: var(--saas-muted); }
    .decision-modal { display: grid; gap: 18px; padding: 4px; }
    .comment-box { min-height: 120px; padding: 14px; resize: vertical; }
    .icon-button { border: none; width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: var(--saas-muted); background: rgba(148, 163, 184, 0.12); cursor: pointer; }
    .danger-btn { color: #fff; background: linear-gradient(135deg, #ef4444, #dc2626); }
    @media (max-width: 1200px) { .kpi-grid, .filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 768px) { .kpi-grid, .filters-grid, .detail-grid { grid-template-columns: 1fr; } }
    @keyframes page-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class RhRequestsComponent {
  private readonly api = inject(RhApiService);
  private readonly validationStore = inject(ValidationStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dashboardService = inject(RhDashboardService);
  private readonly assistantSync = inject(AssistantSyncService);

  readonly breadcrumbs = [{ label: 'RH', route: '/app/rh/dashboard' }, { label: 'Requests' }];
  readonly tabs = [
    { label: 'Pending', value: 'PENDING' as const },
    { label: 'Approved', value: 'APPROVED' as const },
    { label: 'Rejected', value: 'REJECTED' as const },
    { label: 'All', value: 'ALL' as const }
  ];
  readonly requestTypes: RhRequest['type'][] = ['CONGE', 'ABSENCE', 'TELETRAVAIL', 'AUTORISATION', 'DOCUMENT'];

  readonly isLoading = this.validationStore.isLoading;
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly requests = signal<RhRequest[]>([]);
  readonly totalElements = signal(0);
  readonly totalPages = signal(1);
  readonly page = signal(0);
  readonly size = signal(12);
  readonly statusTab = signal<StatusTab>('PENDING');
  readonly employeeFilter = signal('');
  readonly typeFilter = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly selectedRequest = signal<RhRequest | null>(null);
  readonly selectedAction = signal<RequestAction | null>(null);
  decisionComment = '';

  readonly pendingCount = computed(() => this.requests().filter(request => request.statut === 'EN_ATTENTE_RH').length);
  readonly approvedCount = computed(() => this.requests().filter(request => request.statut === 'APPROUVEE').length);
  readonly rejectedCount = computed(() => this.requests().filter(request => request.statut === 'REFUSEE').length);
  readonly teleworkCount = computed(() => this.requests().filter(request => request.type === 'TELETRAVAIL').length);
  readonly pendingDelta = computed(() => `${this.requests().filter(request => request.type === 'CONGE').length} leave`);

  constructor() {
    // Sync from store
    effect(() => {
      const initialRequests = this.validationStore.rhRequests();
      if (initialRequests.length > 0 && this.requests().length === 0) {
        this.requests.set(initialRequests);
      }
    });

    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.actionResult?.tool === 'process_request') {
          this.load();
        }
      });

    effect(() => {
      this.statusTab();
      this.employeeFilter();
      this.typeFilter();
      this.dateFrom();
      this.dateTo();
      this.page.set(0);
      queueMicrotask(() => this.load());
    });
  }

  load(): void {
    this.errorMessage.set(null);

    this.api.getRequests(this.page(), this.size(), {
      statut: this.mapStatusTab(this.statusTab()),
      type: this.typeFilter() || undefined,
      employee: this.employeeFilter().trim() || undefined,
      dateFrom: this.dateFrom() || undefined,
      dateTo: this.dateTo() || undefined
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: page => {
          this.requests.set(page.content);
          this.totalElements.set(page.totalElements);
          this.totalPages.set(page.totalPages || 1);
        },
        error: () => {
          this.requests.set([]);
          this.errorMessage.set('RH requests could not be loaded.');
          this.toast.error('Unable to load RH requests.');
        }
      });
  }

  changePage(offset: number): void {
    const next = this.page() + offset;
    if (next < 0 || next >= this.totalPages()) {
      return;
    }
    this.page.set(next);
    this.load();
  }

  openDecision(request: RhRequest, action: RequestAction): void {
    this.selectedRequest.set(request);
    this.selectedAction.set(action);
    this.decisionComment = '';
  }

  closeDecision(): void {
    this.selectedRequest.set(null);
    this.selectedAction.set(null);
    this.decisionComment = '';
  }

  confirmDecision(): void {
    const request = this.selectedRequest();
    const action = this.selectedAction();
    if (!request || !action) {
      return;
    }

    this.submitting.set(true);
    const operation$ = action === 'approve'
      ? this.api.approveRequest(request, this.decisionComment)
      : this.api.rejectRequest(request, this.decisionComment);

    operation$
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: updated => {
          this.toast.success(action === 'approve' ? 'Request approved.' : 'Request rejected.');
          this.requests.update(items => items.map(item => item.id === updated.id ? updated : item));
          this.dashboardService.refresh();
          this.closeDecision();
          this.load();
        },
        error: () => this.toast.error(`Unable to ${action === 'approve' ? 'approve' : 'reject'} this request.`)
      });
  }

  protected canReview(request: RhRequest): boolean {
    return request.statut === 'EN_ATTENTE_RH';
  }

  protected formatType(type: RhRequest['type'] | string): string {
    return String(type).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  }

  protected formatStatus(status: RhRequest['statut']): string {
    switch (status) {
      case 'EN_ATTENTE_RH':
        return 'Pending RH';
      case 'APPROUVEE':
        return 'Approved';
      case 'REFUSEE':
        return 'Rejected';
      case 'EN_ATTENTE_MANAGER':
        return 'Pending manager';
      default:
        return 'Cancelled';
    }
  }

  protected statusTone(status: RhRequest['statut']): 'warning' | 'success' | 'danger' | 'info' {
    switch (status) {
      case 'EN_ATTENTE_RH':
        return 'warning';
      case 'APPROUVEE':
        return 'success';
      case 'REFUSEE':
        return 'danger';
      default:
        return 'info';
    }
  }

  protected requestOwner(request: RhRequest): string {
    return request.utilisateur?.fullName
      || `${request.utilisateur?.prenom ?? ''} ${request.utilisateur?.nom ?? ''}`.trim()
      || request.utilisateur?.email
      || `Employee #${request.utilisateurId}`;
  }

  protected managerName(request: RhRequest): string {
    return request.manager?.fullName || `${request.manager?.prenom ?? ''} ${request.manager?.nom ?? ''}`.trim() || 'No manager';
  }

  protected requestPeriod(request: RhRequest): string {
    if (request.dateDebut && request.dateFin) {
      return `${this.formatDate(request.dateDebut)} to ${this.formatDate(request.dateFin)}`;
    }
    if (request.dateDebut) {
      return this.formatDate(request.dateDebut);
    }
    return request.motif || request.commentaire || 'No details';
  }

  protected durationLabel(request: RhRequest): string {
    if (request.nombreJours != null) {
      return `${request.nombreJours} day${request.nombreJours > 1 ? 's' : ''}`;
    }
    if (request.duree != null) {
      return `${request.duree} min`;
    }
    return 'N/A';
  }

  protected ageLabel(request: RhRequest): string {
    if (!request.dateCreation) {
      return 'Recently submitted';
    }
    const createdAt = new Date(request.dateCreation);
    if (Number.isNaN(createdAt.getTime())) {
      return 'Recently submitted';
    }
    const hours = Math.floor((Date.now() - createdAt.getTime()) / 3600000);
    if (hours < 24) {
      return `${Math.max(hours, 1)}h in queue`;
    }
    return `${Math.floor(hours / 24)}d in queue`;
  }

  protected isStale(request: RhRequest): boolean {
    if (!request.dateCreation) {
      return false;
    }
    const createdAt = new Date(request.dateCreation);
    return !Number.isNaN(createdAt.getTime()) && (Date.now() - createdAt.getTime()) > 48 * 3600000;
  }

  protected formatDateTime(value?: string): string {
    if (!value) {
      return 'N/A';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private mapStatusTab(tab: StatusTab): string | undefined {
    switch (tab) {
      case 'PENDING':
        return 'EN_ATTENTE_RH';
      case 'APPROVED':
        return 'APPROUVEE';
      case 'REJECTED':
        return 'REFUSEE';
      default:
        return undefined;
    }
  }
}
