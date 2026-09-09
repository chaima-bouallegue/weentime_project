import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelModel, SenderSummaryModel } from '../../models/communication.models';
import { CommunicationStoreService } from '../../services/communication-store.service';
import { OrganisationService, SimpleUser } from '../../../../core/services/organisation.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-members-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="comm-side-panel">
      <header class="panel-header">
        <div class="header-content">
          <h3>Membres</h3>
          <span class="member-count">{{ channel?.members?.length || 0 }} personne{{ (channel?.members?.length || 0) > 1 ? 's' : '' }}</span>
        </div>
        <button class="close-btn" (click)="close.emit()" title="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="panel-body">
        <!-- Message d'erreur global -->
        <div *ngIf="actionError()" class="action-error">
          {{ actionError() }}
        </div>

        <!-- Bouton Inviter / Ajouter des membres -->
        <div *ngIf="canManage && !channel?.isArchived && !isDirectChannel && !showAddView()" class="add-members-banner">
          <button type="button" class="btn-open-add" (click)="openAddView()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Ajouter des membres</span>
          </button>
        </div>

        <!-- Vue d'ajout de membres -->
        <div *ngIf="showAddView()" class="add-members-section">
          <div class="add-section-header">
            <h4>Ajouter des collaborateurs</h4>
            <button type="button" class="btn-text-close" (click)="closeAddView()">Fermer</button>
          </div>

          <div class="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              [(ngModel)]="searchUserQuery"
              placeholder="Rechercher par nom ou email..."
              autofocus
            />
          </div>

          <div class="candidate-users-list">
            <div *ngIf="loadingCandidates()" class="loading-state">
              <span>Chargement des collaborateurs...</span>
            </div>

            <div *ngIf="!loadingCandidates() && availableCandidates().length === 0" class="empty-candidates">
              <span>Aucun autre collaborateur à ajouter.</span>
            </div>

            <div
              *ngFor="let user of availableCandidates()"
              class="candidate-item"
              [class.selected]="isUserSelected(user.id)"
              (click)="toggleUserSelection(user.id)">
              <div class="candidate-avatar" [style.background-color]="getAvatarColor(user)">
                {{ getSimpleUserInitials(user) }}
              </div>
              <div class="candidate-info">
                <span class="candidate-name">{{ user.prenom }} {{ user.nom }}</span>
                <span class="candidate-email">{{ user.email }}</span>
              </div>
              <div class="candidate-checkbox">
                <span *ngIf="isUserSelected(user.id)">✓</span>
              </div>
            </div>
          </div>

          <div class="add-actions">
            <button type="button" class="btn-cancel" [disabled]="submittingMembers()" (click)="closeAddView()">
              Annuler
            </button>
            <button
              type="button"
              class="btn-submit-add"
              [disabled]="submittingMembers() || selectedUserIds.size === 0"
              (click)="submitAddMembers()">
              {{ submittingMembers() ? 'Ajout en cours...' : 'Ajouter (' + selectedUserIds.size + ')' }}
            </button>
          </div>
        </div>

        <!-- Liste des membres actuels -->
        <div *ngIf="!showAddView()" class="member-list">
          <div *ngFor="let member of channel?.members" class="member-item">
            <div class="member-avatar">
              <img *ngIf="member.avatarUrl" [src]="member.avatarUrl" [alt]="member.fullName">
              <div *ngIf="!member.avatarUrl" class="avatar-initials" [style.background-color]="getAvatarColorByName(member.fullName)">
                {{ getInitials(member.fullName) }}
              </div>
            </div>
            <div class="member-info">
              <span class="member-name">{{ member.fullName }}</span>
              <span class="member-role" [class.owner-role]="member.role === 'OWNER'">
                {{ formatRole(member.role) }}
              </span>
            </div>

            <!-- Bouton pour retirer le membre -->
            <div class="member-actions" *ngIf="canRemoveMember(member)">
              <button
                type="button"
                class="btn-remove-member"
                title="Retirer ce membre du canal"
                [disabled]="removingUserId() === member.id"
                (click)="onRemoveMember(member)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .comm-side-panel {
      width: 380px;
      height: 100%;
      background: white;
      border-left: 1px solid rgba(83, 74, 183, 0.1);
      display: flex;
      flex-direction: column;
      box-shadow: -20px 0 60px rgba(15, 23, 42, 0.08);
      z-index: 150;
      animation: slideIn 0.3s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .panel-header {
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(83, 74, 183, 0.06);
    }

    .header-content h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #1e1b4b;
    }

    .member-count {
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: #f1f5f9;
      color: #64748b;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: #e2e8f0;
      color: #1e1b4b;
    }

    .close-btn svg {
      width: 18px;
      height: 18px;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .action-error {
      padding: 10px 14px;
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-radius: 10px;
      color: #e11d48;
      font-size: 12px;
    }

    .add-members-banner {
      display: flex;
    }

    .btn-open-add {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px;
      background: #eeedfe;
      color: #534ab7;
      border: 1px dashed rgba(83, 74, 183, 0.4);
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-open-add:hover {
      background: #e5e3fd;
      border-color: #534ab7;
    }

    .btn-open-add svg {
      width: 16px;
      height: 16px;
    }

    .add-members-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .add-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .add-section-header h4 {
      margin: 0;
      font-size: 13px;
      font-weight: 800;
      color: #1e1b4b;
    }

    .btn-text-close {
      background: none;
      border: none;
      color: #64748b;
      font-size: 12px;
      cursor: pointer;
      font-weight: 600;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: white;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 8px 12px;
    }

    .search-box svg {
      width: 16px;
      height: 16px;
      color: #94a3b8;
    }

    .search-box input {
      border: none;
      outline: none;
      font-size: 12px;
      color: #1e1b4b;
      width: 100%;
      background: transparent;
    }

    .candidate-users-list {
      max-height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .loading-state, .empty-candidates {
      padding: 16px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
    }

    .candidate-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .candidate-item:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }

    .candidate-item.selected {
      background: #eeedfe;
      border-color: #534ab7;
    }

    .candidate-avatar {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .candidate-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .candidate-name {
      font-size: 12px;
      font-weight: 700;
      color: #1e1b4b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .candidate-email {
      font-size: 11px;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .candidate-checkbox {
      width: 20px;
      height: 20px;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      color: #534ab7;
      background: white;
    }

    .candidate-item.selected .candidate-checkbox {
      border-color: #534ab7;
      background: #534ab7;
      color: white;
    }

    .add-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }

    .btn-cancel {
      padding: 7px 12px;
      background: white;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
    }

    .btn-submit-add {
      padding: 7px 14px;
      background: #534ab7;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-submit-add:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .member-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .member-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 12px;
      transition: background 0.2s ease;
    }

    .member-item:hover {
      background: #f8f7ff;
    }

    .member-avatar {
      width: 38px;
      height: 38px;
      border-radius: 12px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .member-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initials {
      width: 100%;
      height: 100%;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
    }

    .member-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .member-name {
      font-size: 13px;
      font-weight: 700;
      color: #1e1b4b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .member-role {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 600;
    }

    .owner-role {
      color: #534ab7;
      font-weight: 700;
    }

    .member-actions {
      display: flex;
      align-items: center;
    }

    .btn-remove-member {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: #94a3b8;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .btn-remove-member:hover:not(:disabled) {
      background: #fff1f2;
      color: #e11d48;
    }

    .btn-remove-member:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-remove-member svg {
      width: 15px;
      height: 15px;
    }
  `]
})
export class MembersPanelComponent implements OnInit {
  @Input() channel: ChannelModel | null = null;
  @Output() close = new EventEmitter<void>();

  private readonly store = inject(CommunicationStoreService);
  private readonly organisationService = inject(OrganisationService);
  private readonly authService = inject(AuthService);

  readonly showAddView = signal(false);
  readonly loadingCandidates = signal(false);
  readonly submittingMembers = signal(false);
  readonly removingUserId = signal<number | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly allCandidates = signal<SimpleUser[]>([]);
  readonly selectedUserIds = new Set<number>();
  searchUserQuery = '';

  get canManage(): boolean {
    return this.channel?.permissions?.canManage ?? false;
  }

  get isDirectChannel(): boolean {
    return this.channel?.type === 'DIRECT' || this.channel?.type === 'GROUP_DM';
  }

  get currentUserId(): number | null {
    return this.authService.currentUser()?.id ?? null;
  }

  readonly availableCandidates = computed(() => {
    const query = this.searchUserQuery.trim().toLowerCase();
    const existingMemberIds = new Set(
      (this.channel?.members || []).map(m => m.id).filter((id): id is number => id !== null)
    );

    return this.allCandidates()
      .filter(u => !existingMemberIds.has(u.id))
      .filter(u => {
        if (!query) return true;
        return (
          `${u.prenom} ${u.nom}`.toLowerCase().includes(query) ||
          (u.email && u.email.toLowerCase().includes(query))
        );
      });
  });

  ngOnInit(): void {
    // Candidates will be loaded on opening add view
  }

  openAddView(): void {
    this.selectedUserIds.clear();
    this.searchUserQuery = '';
    this.actionError.set(null);
    this.showAddView.set(true);

    if (this.allCandidates().length === 0) {
      this.loadingCandidates.set(true);
      this.organisationService.getUsers(0, 100).subscribe({
        next: res => {
          this.allCandidates.set(res.content || []);
          this.loadingCandidates.set(false);
        },
        error: err => {
          this.loadingCandidates.set(false);
          this.actionError.set(err?.message || 'Erreur lors du chargement des collaborateurs.');
        }
      });
    }
  }

  closeAddView(): void {
    this.showAddView.set(false);
    this.selectedUserIds.clear();
  }

  toggleUserSelection(userId: number): void {
    if (this.selectedUserIds.has(userId)) {
      this.selectedUserIds.delete(userId);
    } else {
      this.selectedUserIds.add(userId);
    }
  }

  isUserSelected(userId: number): boolean {
    return this.selectedUserIds.has(userId);
  }

  submitAddMembers(): void {
    if (!this.channel || this.selectedUserIds.size === 0) return;

    this.submittingMembers.set(true);
    this.actionError.set(null);

    const ids = Array.from(this.selectedUserIds);
    this.store.addChannelMembers(this.channel.id, ids).subscribe({
      next: () => {
        this.submittingMembers.set(false);
        this.closeAddView();
      },
      error: err => {
        this.submittingMembers.set(false);
        this.actionError.set(err?.message || 'Impossible d\'ajouter ces membres.');
      }
    });
  }

  canRemoveMember(member: SenderSummaryModel): boolean {
    if (!this.canManage || this.channel?.isArchived || this.isDirectChannel) {
      return false;
    }
    // Cannot remove oneself (use leave channel instead)
    if (member.id === this.currentUserId) {
      return false;
    }
    // Cannot remove OWNER
    if (member.role === 'OWNER') {
      return false;
    }
    return true;
  }

  onRemoveMember(member: SenderSummaryModel): void {
    if (!this.channel || member.id === null) return;

    if (!confirm(`Voulez-vous vraiment retirer ${member.fullName} de ce canal ?`)) {
      return;
    }

    this.removingUserId.set(member.id);
    this.actionError.set(null);

    this.store.removeChannelMember(this.channel.id, member.id).subscribe({
      next: () => {
        this.removingUserId.set(null);
      },
      error: err => {
        this.removingUserId.set(null);
        this.actionError.set(err?.message || 'Impossible de retirer ce membre.');
      }
    });
  }

  formatRole(role?: string): string {
    if (!role) return 'Membre';
    switch (role.toUpperCase()) {
      case 'OWNER': return 'Propriétaire';
      case 'ADMIN': return 'Administrateur';
      default: return 'Membre';
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2) || 'U';
  }

  getSimpleUserInitials(user: SimpleUser): string {
    const first = (user.prenom || '').charAt(0).toUpperCase();
    const last = (user.nom || '').charAt(0).toUpperCase();
    return `${first}${last}` || 'U';
  }

  getAvatarColor(user: SimpleUser): string {
    const colors = ['#534AB7', '#2563EB', '#0D9488', '#D97706', '#DB2777', '#7C3AED'];
    const idx = (user.id || 0) % colors.length;
    return colors[idx];
  }

  getAvatarColorByName(name: string): string {
    const colors = ['#534AB7', '#2563EB', '#0D9488', '#D97706', '#DB2777', '#7C3AED'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  }
}
