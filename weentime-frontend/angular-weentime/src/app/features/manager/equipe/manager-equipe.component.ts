import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../../core/services/toast.service';
import { ManagerApiService } from '../manager-api.service';
import { ManagerApprovalRequest, ManagerTeamMember } from '../manager.models';
import { PresenceMemberStatus } from '../../presence/models/presence.model';

interface TeamMemberView extends ManagerTeamMember {
  pendingRequests: number;
  latestRequestLabel: string;
}

@Component({
  selector: 'app-manager-equipe',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="manager-page">
      <header class="hero-card">
        <div>
          <p class="eyebrow">Manager workspace</p>
          <h1>Mon equipe</h1>
          <p class="subtitle">Suivez les presences, les demandes en attente et accedez rapidement aux actions utiles.</p>
        </div>
        <button type="button" class="refresh-btn" (click)="load()" [disabled]="isLoading()">
          <lucide-icon name="refresh-cw" size="16"></lucide-icon>
          Actualiser
        </button>
      </header>

      <section class="stats-grid">
        <article class="stat-card">
          <span class="stat-label">Membres</span>
          <strong>{{ members().length }}</strong>
          <small>Equipe active rattachee au manager</small>
        </article>
        <article class="stat-card">
          <span class="stat-label">Presents</span>
          <strong>{{ presentCount() }}</strong>
          <small>Signal temps reel aujourd hui</small>
        </article>
        <article class="stat-card">
          <span class="stat-label">Retards</span>
          <strong>{{ lateCount() }}</strong>
          <small>Collaborateurs a suivre</small>
        </article>
        <article class="stat-card">
          <span class="stat-label">Demandes</span>
          <strong>{{ pendingCount() }}</strong>
          <small>En attente de traitement manager</small>
        </article>
      </section>

      <section class="filters-card">
        <label class="field">
          <span>Recherche</span>
          <input type="text" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event || '')" placeholder="Nom, email, poste">
        </label>
        <label class="field">
          <span>Departement</span>
          <select [ngModel]="departmentFilter()" (ngModelChange)="departmentFilter.set($event || '')">
            <option value="">Tous</option>
            @for (department of departments(); track department) {
              <option [value]="department">{{ department }}</option>
            }
          </select>
        </label>
      </section>

      @if (warningMessage()) {
        <div class="warning-banner">
          <lucide-icon name="triangle-alert" size="16"></lucide-icon>
          <span>{{ warningMessage() }}</span>
        </div>
      }

      @if (isLoading()) {
        <section class="grid">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="skeleton-card"></div>
          }
        </section>
      } @else if (filteredMembers().length === 0) {
        <section class="empty-card">
          <lucide-icon name="users" size="36"></lucide-icon>
          <h2>Aucun collaborateur a afficher</h2>
          <p>Modifiez vos filtres ou verifiez l affectation d equipe cote organisation.</p>
        </section>
      } @else {
        <section class="grid">
          @for (member of filteredMembers(); track member.id) {
            <article class="member-card">
              <div class="member-head">
                <div class="identity">
                  <div class="avatar">{{ initials(member.fullName) }}</div>
                  <div>
                    <h2>{{ member.fullName }}</h2>
                    <p>{{ member.email }}</p>
                  </div>
                </div>
                <span class="status-pill" [class]="presenceTone(member.presence)">{{ presenceLabel(member.presence) }}</span>
              </div>

              <div class="meta-grid">
                <div class="meta-card">
                  <span>Poste</span>
                  <strong>{{ member.poste || 'Non renseigne' }}</strong>
                </div>
                <div class="meta-card">
                  <span>Departement</span>
                  <strong>{{ member.departementNom || 'Non renseigne' }}</strong>
                </div>
                <div class="meta-card">
                  <span>Equipe</span>
                  <strong>{{ member.equipeNom || 'Non renseignee' }}</strong>
                </div>
                <div class="meta-card">
                  <span>Presence</span>
                  <strong>{{ checkInLabel(member.presence) }}</strong>
                </div>
              </div>

              <div class="member-footer">
                <div>
                  <small>Derniere demande</small>
                  <strong>{{ member.latestRequestLabel }}</strong>
                </div>
                <div class="actions">
                  <a routerLink="/app/manager/presence" class="action-link">Vue</a>
                  <a [href]="messageLink(member.email)" class="action-link">Message</a>
                  <a routerLink="/app/manager/approbations" class="action-link">Stats</a>
                </div>
              </div>
            </article>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .manager-page { display: grid; gap: 20px; }
    .hero-card, .filters-card, .member-card, .stat-card, .empty-card, .warning-banner {
      border-radius: 24px;
      border: 1px solid var(--border);
      background: #fff;
    }
    :host-context(.dark) .hero-card,
    :host-context(.dark) .filters-card,
    :host-context(.dark) .member-card,
    :host-context(.dark) .stat-card,
    :host-context(.dark) .empty-card,
    :host-context(.dark) .warning-banner { background: #141821; border-color: #1e293b; }
    .hero-card {
      padding: 24px 28px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: center;
      background: linear-gradient(135deg, rgba(37,99,235,.08), rgba(79,70,229,.05));
    }
    .eyebrow { margin: 0 0 8px; text-transform: uppercase; letter-spacing: .15em; font-size: 11px; font-weight: 800; color: #6366f1; }
    h1 { margin: 0; font-size: 32px; font-weight: 900; color: #0f172a; }
    h2 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
    p, small, span { color: #64748b; }
    :host-context(.dark) h1, :host-context(.dark) h2 { color: #f8fafc; }
    .subtitle { margin: 8px 0 0; max-width: 680px; }
    .refresh-btn, .action-link {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 14px; border-radius: 14px; font-weight: 800; text-decoration: none;
    }
    .refresh-btn { border: none; background: #1d4ed8; color: white; }
    .refresh-btn:disabled { opacity: .65; cursor: not-allowed; }
    .stats-grid, .grid { display: grid; gap: 16px; }
    .stats-grid { grid-template-columns: repeat(4, minmax(0,1fr)); }
    .stat-card { padding: 18px; display: grid; gap: 8px; }
    .stat-label { text-transform: uppercase; letter-spacing: .12em; font-size: 11px; font-weight: 800; }
    .stat-card strong { font-size: 32px; font-weight: 900; color: #0f172a; }
    :host-context(.dark) .stat-card strong { color: #fff; }
    .filters-card {
      padding: 18px;
      display: grid;
      grid-template-columns: minmax(0,1.6fr) minmax(240px,.8fr);
      gap: 14px;
    }
    .field { display: grid; gap: 8px; }
    .field span { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    .field input, .field select {
      border-radius: 14px; border: 1px solid #cbd5e1; background: #FFFFFF; padding: 12px 14px; color: #0f172a;
    }
    :host-context(.dark) .field input, :host-context(.dark) .field select {
      background: #0f172a; border-color: #334155; color: #f8fafc;
    }
    .warning-banner { padding: 14px 16px; display: inline-flex; align-items: center; gap: 10px; color: #b45309; background: #fff7ed; border-color: rgba(245,158,11,.25); }
    .grid { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .member-card { padding: 20px; display: grid; gap: 18px; }
    .member-head, .member-footer { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
    .identity { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .avatar {
      width: 48px; height: 48px; border-radius: 16px; display: grid; place-items: center;
      background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; font-weight: 900;
    }
    .status-pill { padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 800; }
    .status-pill.success { background: rgba(34,197,94,.15); color: #15803d; }
    .status-pill.warning { background: rgba(245,158,11,.18); color: #b45309; }
    .status-pill.info { background: rgba(59,130,246,.14); color: #2563eb; }
    .status-pill.danger { background: rgba(239,68,68,.14); color: #dc2626; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
    .meta-card { display: grid; gap: 6px; padding: 14px; border-radius: 16px; background: rgba(148,163,184,.08); }
    .meta-card strong, .member-footer strong { color: #0f172a; }
    :host-context(.dark) .meta-card strong, :host-context(.dark) .member-footer strong { color: #f8fafc; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .action-link { background: rgba(67,56,202,.08); color: #4338ca; }
    .empty-card { padding: 48px 24px; text-align: center; display: grid; gap: 12px; place-items: center; }
    .skeleton-card { height: 260px; border-radius: 24px; background: linear-gradient(90deg, #F8F9FA, #FFFFFF, #F8F9FA); background-size: 200% 100%; animation: pulse 1.3s infinite; }
    @keyframes pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    @media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 768px) { .stats-grid, .filters-card, .meta-grid { grid-template-columns: 1fr; } .hero-card { flex-direction: column; align-items: flex-start; } }
  `]
})
export class ManagerEquipeComponent {
  private readonly managerApi = inject(ManagerApiService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isLoading = signal(true);
  protected readonly warningMessage = signal<string | null>(null);
  protected readonly members = signal<TeamMemberView[]>([]);
  protected readonly searchTerm = signal('');
  protected readonly departmentFilter = signal('');

  protected readonly departments = computed(() =>
    Array.from(new Set(this.members().map(member => member.departementNom).filter((value): value is string => Boolean(value)))).sort()
  );
  protected readonly filteredMembers = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const department = this.departmentFilter();

    return this.members().filter(member => {
      const haystack = [
        member.fullName,
        member.email,
        member.poste ?? '',
        member.departementNom ?? '',
        member.equipeNom ?? ''
      ].join(' ').toLowerCase();

      return (!search || haystack.includes(search)) && (!department || member.departementNom === department);
    });
  });
  protected readonly presentCount = computed(() => this.members().filter(member => this.isPresent(member.presence)).length);
  protected readonly lateCount = computed(() => this.members().filter(member => member.presence?.lateArrival).length);
  protected readonly pendingCount = computed(() => this.members().reduce((sum, member) => sum + member.pendingRequests, 0));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.isLoading.set(true);
    this.warningMessage.set(null);

    forkJoin({
      teamMembers: this.managerApi.getManagerTeamMembers().pipe(catchError(() => of([] as ManagerTeamMember[]))),
      overview: this.managerApi.getManagerPresenceOverview().pipe(catchError(() => of(null))),
      requests: this.managerApi.getAllManagerRequests(0, 200).pipe(catchError(() => of(null)))
    })
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ teamMembers, overview, requests }) => {
          const warnings: string[] = [];
          if (teamMembers.length === 0) {
            warnings.push('Aucun collaborateur n est actuellement rattache a ce manager.');
          }
          if (overview === null) {
            warnings.push('Le flux de presence est temporairement indisponible.');
          }
          if (requests === null) {
            warnings.push('Le backlog des demandes n a pas pu etre recharge.');
          }

          this.members.set(this.buildMemberViews(teamMembers, overview?.members ?? [], requests?.content ?? []));
          this.warningMessage.set(warnings.length > 0 ? warnings.join(' ') : null);

          if (warnings.length > 0 && teamMembers.length === 0 && requests === null && overview === null) {
            this.toastService.error('Les donnees equipe manager n ont pas pu etre chargees.');
          }
        },
        error: () => {
          this.members.set([]);
          this.warningMessage.set('Les donnees equipe manager n ont pas pu etre chargees.');
          this.toastService.error('Les donnees equipe manager n ont pas pu etre chargees.');
        }
      });
  }

  protected initials(fullName: string): string {
    return fullName.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'WT';
  }

  protected presenceTone(presence: PresenceMemberStatus | null | undefined): 'success' | 'warning' | 'danger' | 'info' {
    if (!presence || presence.status === 'ABSENT' || presence.status === 'ON_LEAVE') {
      return 'danger';
    }
    if (presence.lateArrival || presence.status === 'LATE') {
      return 'warning';
    }
    if (presence.status === 'REMOTE') {
      return 'info';
    }
    return 'success';
  }

  protected presenceLabel(presence: PresenceMemberStatus | null | undefined): string {
    if (!presence) return 'Aucun signal';
    switch (presence.status) {
      case 'PRESENT': return 'Present';
      case 'LATE': return 'En retard';
      case 'REMOTE': return 'Remote';
      case 'ON_LEAVE': return 'Conge';
      default: return 'Absent';
    }
  }

  protected checkInLabel(presence: PresenceMemberStatus | null | undefined): string {
    if (!presence?.heureEntree) return 'Aucun pointage';
    return `Entree ${this.formatTime(presence.heureEntree)}`;
  }

  protected messageLink(email: string): string {
    return `mailto:${email}`;
  }

  private buildMemberViews(
    members: ManagerTeamMember[],
    presenceList: PresenceMemberStatus[],
    requests: ManagerApprovalRequest[]
  ): TeamMemberView[] {
    const presenceByUser = new Map(presenceList.map(item => [item.utilisateurId, item]));
    const requestsByUser = new Map<number, ManagerApprovalRequest[]>();

    for (const request of requests) {
      const bucket = requestsByUser.get(request.utilisateurId) ?? [];
      bucket.push(request);
      requestsByUser.set(request.utilisateurId, bucket);
    }

    return members.map(member => {
      const memberRequests = requestsByUser.get(member.id) ?? [];
      const latestRequest = memberRequests[0];

      return {
        ...member,
        presence: presenceByUser.get(member.id) ?? null,
        pendingRequests: memberRequests.filter(request => request.statut === 'EN_ATTENTE_MANAGER').length,
        latestRequestLabel: latestRequest ? this.requestSummary(latestRequest) : 'Aucune demande recente'
      };
    });
  }

  private requestSummary(request: ManagerApprovalRequest): string {
    const type = request.type.replace('_', ' ').toLowerCase();
    const status = request.statut === 'EN_ATTENTE_RH' ? 'transmis rh' : request.statut.toLowerCase().split('_').join(' ');
    return `${type} - ${status}`;
  }

  private isPresent(presence: PresenceMemberStatus | null | undefined): boolean {
    return Boolean(presence && ['PRESENT', 'LATE', 'REMOTE'].includes(presence.status));
  }

  private formatTime(value: string): string {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const match = value.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
  }
}
