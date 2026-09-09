import { ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrganisationService, SimpleUser } from '../../../../core/services/organisation.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-new-direct-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <div class="header-title">
            <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <h2>Nouveau message direct</h2>
          </div>
          <button class="close-btn" (click)="close.emit()" aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <div class="search-bar">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Rechercher un collègue par nom ou email..."
              autofocus
            />
            <button *ngIf="searchQuery" class="clear-search" (click)="searchQuery = ''">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="users-list-wrapper">
            <div *ngIf="loading()" class="state-loading">
              <div class="spinner"></div>
              <span>Chargement des collaborateurs...</span>
            </div>

            <div *ngIf="!loading() && error()" class="state-error">
              <p>{{ error() }}</p>
              <button type="button" class="btn-retry" (click)="loadUsers()">Réessayer</button>
            </div>

            <div *ngIf="!loading() && !error() && filteredUsers().length === 0" class="state-empty">
              <p>Aucun collaborateur trouvé pour « {{ searchQuery }} ».</p>
            </div>

            <ul *ngIf="!loading() && !error() && filteredUsers().length > 0" class="users-list">
              <li *ngFor="let user of filteredUsers()" class="user-item" (click)="selectUser(user)">
                <div class="user-avatar" [style.background-color]="getAvatarColor(user)">
                  {{ getInitials(user) }}
                </div>
                <div class="user-info">
                  <strong class="user-name">{{ user.prenom }} {{ user.nom }}</strong>
                  <span class="user-email">{{ user.email }}</span>
                </div>
                <button type="button" class="btn-start-chat" (click)="$event.stopPropagation(); selectUser(user)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  <span>Échanger</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <footer class="modal-footer">
          <button type="button" class="btn-secondary" (click)="close.emit()">Fermer</button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      animation: fadeIn 0.2s ease;
    }

    .modal-content {
      background: var(--surface, #ffffff);
      width: 100%;
      max-width: 520px;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      max-height: 85vh;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

    .modal-header {
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border, #f1f5f9);
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .header-icon {
      width: 22px;
      height: 22px;
      color: var(--primary, #534ab7);
    }

    .modal-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary, #1e1b4b);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-tertiary, #64748b);
      cursor: pointer;
      padding: 6px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: var(--surface-hover, #f8fafc);
      color: var(--text-primary, #1e1b4b);
    }

    .close-btn svg { width: 18px; height: 18px; }

    .modal-body {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: hidden;
      flex: 1;
    }

    .search-bar {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 14px;
      width: 18px;
      height: 18px;
      color: var(--text-tertiary, #94a3b8);
      pointer-events: none;
    }

    .search-bar input {
      width: 100%;
      padding: 12px 38px 12px 42px;
      border-radius: 12px;
      border: 1.5px solid var(--border, #e2e8f0);
      background: var(--input-bg, #f8fafc);
      color: var(--text-primary, #1e1b4b);
      font-size: 14px;
      font-family: inherit;
      transition: all 0.2s;
    }

    .search-bar input:focus {
      outline: none;
      background: #ffffff;
      border-color: var(--primary, #534ab7);
      box-shadow: 0 0 0 4px rgba(83, 74, 183, 0.1);
    }

    .clear-search {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      color: var(--text-tertiary, #94a3b8);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .clear-search svg { width: 14px; height: 14px; }

    .users-list-wrapper {
      flex: 1;
      overflow-y: auto;
      min-height: 240px;
      max-height: 360px;
      border: 1px solid var(--border, #f1f5f9);
      border-radius: 14px;
      padding: 6px;
    }

    .state-loading, .state-empty, .state-error {
      padding: 36px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--text-secondary, #64748b);
      font-size: 14px;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 2.5px solid var(--border, #e2e8f0);
      border-top-color: var(--primary, #534ab7);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .btn-retry {
      background: var(--primary, #534ab7);
      color: white;
      border: none;
      padding: 6px 16px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
    }

    .users-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .user-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .user-item:hover {
      background: var(--surface-hover, #f8fafc);
    }

    .user-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      color: white;
      font-weight: 700;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      letter-spacing: 0.5px;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-size: 14px;
      color: var(--text-primary, #1e1b4b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-email {
      font-size: 12px;
      color: var(--text-tertiary, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .btn-start-chat {
      background: none;
      border: 1px solid var(--border, #e2e8f0);
      color: var(--primary, #534ab7);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .btn-start-chat svg { width: 14px; height: 14px; }

    .user-item:hover .btn-start-chat {
      background: var(--primary, #534ab7);
      color: white;
      border-color: var(--primary, #534ab7);
    }

    .modal-footer {
      padding: 14px 24px;
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--border, #f1f5f9);
    }

    .btn-secondary {
      background: white;
      color: var(--text-secondary, #64748b);
      border: 1px solid var(--border, #e2e8f0);
      padding: 8px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: var(--surface-hover, #f8fafc);
      color: var(--text-primary, #1e1b4b);
    }
  `]
})
export class NewDirectMessageModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();
  @Output() userSelected = new EventEmitter<number>();

  private readonly organisationService = inject(OrganisationService);
  private readonly authService = inject(AuthService);

  readonly allUsers = signal<SimpleUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  searchQuery = '';

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    const currentUserId = this.authService.currentUser()?.id;
    const users = this.allUsers().filter(u => u.id !== currentUserId);

    if (!q) return users;
    return users.filter(u => 
      `${u.prenom} ${u.nom}`.toLowerCase().includes(q) || 
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.organisationService.getUsers(0, 100).subscribe({
      next: res => {
        const list = res.content || [];
        this.allUsers.set(list);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err?.message || 'Erreur lors du chargement des collaborateurs.');
        this.loading.set(false);
      }
    });
  }

  private selecting = false;

  selectUser(user: SimpleUser): void {
    if (this.selecting) return;
    this.selecting = true;
    this.userSelected.emit(user.id);
  }

  getInitials(user: SimpleUser): string {
    const first = (user.prenom || '').charAt(0).toUpperCase();
    const last = (user.nom || '').charAt(0).toUpperCase();
    return `${first}${last}` || 'U';
  }

  getAvatarColor(user: SimpleUser): string {
    const colors = ['#534AB7', '#2563EB', '#0D9488', '#D97706', '#DB2777', '#7C3AED', '#059669'];
    const idx = (user.id || 0) % colors.length;
    return colors[idx];
  }
}
