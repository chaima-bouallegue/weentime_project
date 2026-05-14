import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelModel } from '../../models/communication.models';
import { CommunicationConnectionState } from '../../services/communication-websocket.service';

@Component({
  selector: 'app-channel-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comm-header-wrapper">
      <header *ngIf="channel" class="comm-header">
        <div class="comm-header-main">
          <div class="comm-header-title-row">
            <span class="comm-header-hash">#</span>
            <h1>{{ channel.name }}</h1>
            <span class="comm-header-dot">·</span>
            <p class="comm-header-desc">{{ channel.description || 'Canal RH pour les échanges' }}</p>
          </div>
          
          <div class="comm-header-meta">
            <div class="member-stack">
              <div class="member-avatars">
                <ng-container *ngFor="let member of channel.members.slice(0, 4)">
                  <div class="avatar-item" [title]="member.fullName">
                    <img *ngIf="member.avatarUrl" [src]="member.avatarUrl">
                    <div *ngIf="!member.avatarUrl" class="avatar-initials" [style.background-color]="getAvatarColor(member.fullName)">
                      {{ getInitials(member.fullName) }}
                    </div>
                  </div>
                </ng-container>
                <div *ngIf="channel.members.length > 4" class="avatar-more">
                  +{{ channel.members.length - 4 }}
                </div>
              </div>
              <span class="member-count">{{ channel.members.length }} membres</span>
            </div>
            <span class="comm-header-dot">·</span>
            <div class="connection-status" [class]="connectionState">
              <span class="status-indicator" [class.pulse]="connectionState === 'connecting'"></span>
              <span class="status-text">
                {{ connectionState === 'connected' ? 'En direct' : connectionState === 'connecting' ? 'Connexion...' : 'Hors ligne' }}
              </span>
            </div>
          </div>
        </div>

        <div class="comm-header-actions">
          <button class="action-btn" (click)="toggleSearch()" [class.active]="showSearch" title="Rechercher">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
          <button class="action-btn" (click)="togglePinned()" [class.active]="showPinned" title="Messages épinglés">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><path d="M5 20h14"/></svg>
          </button>
          <button class="action-btn" (click)="viewAttachments.emit()" title="Pièces jointes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <button class="action-btn" (click)="viewMembers.emit()" title="Membres">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
          <div class="action-separator"></div>
          <button class="action-btn" (click)="openSettings.emit()" title="Paramètres">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </header>

      <!-- Inline Search Bar -->
      <div class="inline-search-bar" *ngIf="showSearch">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" [placeholder]="'Rechercher dans #' + channel?.name + '...'" 
               (input)="onSearchInput($event)"
               autofocus>
        <div class="search-actions">
          <span class="result-count">{{ searchResultsCount }} résultats</span>
          <button class="close-search" (click)="toggleSearch()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <!-- Pinned Messages Indicator -->
      <div class="pinned-indicator-bar" *ngIf="(channel?.pinnedCount || showPinned) && !forceHidePinned">
        <div class="pinned-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><path d="M5 20h14"/></svg>
          <strong>{{ channel?.pinnedCount || 0 }} messages épinglés</strong>
          <span class="pinned-action" (click)="onPinnedBarClick()">· Cliquer pour voir</span>
        </div>
        <button class="close-pinned" (click)="forceHidePinned = true">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .comm-header-wrapper {
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      z-index: 50;
    }

    .comm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 32px;
      gap: 20px;
    }

    .comm-header-main {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .comm-header-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .comm-header-hash {
      font-size: 20px;
      font-weight: 800;
      color: #534AB7;
    }

    .comm-header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #1e1b4b;
      letter-spacing: -0.01em;
    }

    .comm-header-dot {
      color: #cbd5e1;
      font-weight: 800;
    }

    .comm-header-desc {
      margin: 0;
      font-size: 14px;
      color: var(--text-tertiary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .comm-header-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .member-stack {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .member-avatars {
      display: flex;
      align-items: center;
    }

    .avatar-item, .avatar-more {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid white;
      margin-left: -12px;
      flex-shrink: 0;
      position: relative;
      background: white;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.1);
      transition: transform 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-item:hover { 
      transform: translateY(-2px); 
      z-index: 10;
    }
    .avatar-item:first-child { margin-left: 0; }
    .avatar-item img { width: 100%; height: 100%; object-fit: cover; }
    
    .avatar-initials {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      color: white;
    }

    .avatar-more {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      background: #f1f5f9;
      border-color: #f1f5f9;
    }

    .member-count {
      font-size: 13px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .online-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #94a3b8;
    }
    .status-dot.online { background: #10b981; }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .connection-status.connected { background: #ecfdf5; color: #059669; }
    .connection-status.connecting { background: #fffbeb; color: #d97706; }
    .connection-status.disconnected { background: #fef2f2; color: #dc2626; }

    .status-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .connection-status.connecting .status-indicator {
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.4; }
      100% { opacity: 1; }
    }

    .online-count {
      font-size: 13px;
      font-weight: 700;
      color: #22c55e;
    }

    .comm-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .action-btn {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      border: none;
      background: none;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: all 0.2s;
    }
    .action-btn:hover, .action-btn.active {
      background: var(--surface-alt);
      color: #534AB7;
    }
    .action-btn svg { width: 18px; height: 18px; }

    .action-separator {
      width: 1.5px;
      height: 20px;
      background: var(--border);
      margin: 0 8px;
      opacity: 0.5;
    }

    /* Inline Search Bar */
    .inline-search-bar {
      padding: 12px 32px;
      background: #EEEDFE;
      display: flex;
      align-items: center;
      gap: 16px;
      border-top: 1px solid rgba(83, 74, 183, 0.1);
      animation: slideDown 0.2s ease-out;
    }

    @keyframes slideDown {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .search-icon { width: 18px; height: 18px; color: #534AB7; }
    .inline-search-bar input {
      flex: 1;
      background: none;
      border: none;
      font-size: 15px;
      font-weight: 600;
      color: #1e1b4b;
      outline: none;
    }
    .inline-search-bar input::placeholder { color: #534AB7; opacity: 0.5; }

    .search-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .result-count { font-size: 13px; font-weight: 700; color: #534AB7; }
    .close-search { background: none; border: none; color: #534AB7; cursor: pointer; display: flex; }
    .close-search svg { width: 18px; height: 18px; }

    /* Pinned Indicator Bar */
    .pinned-indicator-bar {
      padding: 10px 32px;
      background: #fef3c7; /* Amber 100ish */
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(217, 119, 6, 0.1);
    }
    .pinned-info { display: flex; align-items: center; gap: 8px; color: #92400e; font-size: 14px; }
    .pinned-info svg { width: 16px; height: 16px; }
    .pinned-info strong { font-weight: 800; }
    .pinned-action { cursor: pointer; font-weight: 700; text-decoration: underline; }
    .close-pinned { background: none; border: none; color: #92400e; cursor: pointer; display: flex; }
    .close-pinned svg { width: 16px; height: 16px; }

    @media (max-width: 900px) {
      .comm-header {
        flex-direction: column;
      }
    }
  `]
})
export class ChannelHeaderComponent {
  @Input() channel: ChannelModel | null = null;
  @Input() typingLabel: string | null = null;
  @Input() connectionState: CommunicationConnectionState = 'disconnected';
  @Input() readRetryPending = false;
  @Input() searchResultsCount = 0;
  @Output() viewPinned = new EventEmitter<void>();
  @Output() search = new EventEmitter<string>();
  @Output() viewAttachments = new EventEmitter<void>();
  @Output() viewMembers = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();

  showSearch = false;
  showPinned = false;
  forceHidePinned = false;

  toggleSearch(): void {
    this.showSearch = !this.showSearch;
    if (this.showSearch) {
      this.showPinned = false;
      this.search.emit('');
    }
  }

  togglePinned(): void {
    this.showPinned = !this.showPinned;
    if (this.showPinned) {
      this.showSearch = false;
      this.forceHidePinned = false;
    }
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.search.emit(query);
  }

  onPinnedBarClick(): void {
    this.viewPinned.emit();
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  readonly avatarColors = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#10b981', '#06b6d4', '#3b82f6'];

  getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % this.avatarColors.length;
    return this.avatarColors[index];
  }
}
