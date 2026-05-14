import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelModel, ProvisioningSyncResponse } from '../../models/communication.models';
import { ChannelListItemComponent } from '../channel-list-item/channel-list-item.component';
import { DirectMessageListItemComponent } from '../direct-message-list-item/direct-message-list-item.component';

@Component({
  selector: 'app-communication-sidebar',
  standalone: true,
  imports: [CommonModule, ChannelListItemComponent, DirectMessageListItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="comm-sidebar">
      <header class="comm-sidebar-header">
        <div>
          <p>Workspace</p>
          <h2>Messages</h2>
        </div>
        <button *ngIf="canSync" type="button" class="comm-sync-btn" [disabled]="syncing" (click)="syncRequested.emit()">
          {{ syncing ? 'Synchronisation...' : 'Synchroniser communication' }}
        </button>
      </header>

      <div class="comm-sidebar-nav">
        <div *ngIf="syncError" class="comm-sync-card error">
          <strong>Synchronisation impossible</strong>
          <span>{{ syncError }}</span>
        </div>

        <div *ngIf="syncResult" class="comm-sync-card">
          <strong>Derniere synchronisation</strong>
          <span>{{ syncResult.channelsCreated }} canal(x) cree(s), {{ syncResult.channelsUpdated }} mis a jour</span>
          <span>{{ syncResult.membersAdded }} membre(s) ajoute(s), {{ syncResult.membersRemoved }} retire(s)</span>
          <span *ngIf="syncResult.warnings.length > 0">{{ syncResult.warnings[0] }}</span>
        </div>

        <div *ngIf="loading" class="comm-state-list">
          <div class="comm-skeleton" *ngFor="let item of [1, 2, 3, 4]"></div>
        </div>

        <div *ngIf="!loading && error" class="comm-error">
          <p>{{ error }}</p>
          <button type="button" (click)="retry.emit()">Recharger</button>
        </div>

        <ng-container *ngIf="!loading && !error">
          <section class="comm-section">
            <div class="comm-section-heading">
              <span>Canaux RH</span>
            </div>
            <div class="comm-sidebar-list">
              <!-- Using a slice/filter as a placeholder for grouping -->
              <app-channel-list-item
                *ngFor="let channel of channels.slice(0, 3)"
                [channel]="channel"
                [route]="'/app/messages/channel/' + channel.id"
                [active]="channel.id === activeChannelId">
              </app-channel-list-item>
            </div>
          </section>

          <section class="comm-section">
            <div class="comm-section-heading">
              <span>Entreprise</span>
            </div>
            <div class="comm-sidebar-list">
              <app-channel-list-item
                *ngFor="let channel of channels.slice(3)"
                [channel]="channel"
                [route]="'/app/messages/channel/' + channel.id"
                [active]="channel.id === activeChannelId">
              </app-channel-list-item>
              
              <button *ngIf="canCreateChannel" type="button" class="add-channel-btn" (click)="addChannelRequested.emit()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Ajouter un canal</span>
              </button>
            </div>
          </section>

          <section class="comm-section">
            <div class="comm-section-heading">
              <span>Messages directs</span>
            </div>
            <div *ngIf="directMessages.length === 0" class="comm-empty">Aucune conversation directe.</div>
            <div class="comm-sidebar-list">
              <app-direct-message-list-item
                *ngFor="let channel of directMessages"
                [channel]="channel"
                [route]="'/app/messages/channel/' + channel.id"
                [active]="channel.id === activeChannelId">
              </app-direct-message-list-item>
            </div>
          </section>
        </ng-container>
      </div>
    </aside>
  `,
  styles: [`
    .comm-sidebar {
      width: 320px;
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border-right: 1px solid var(--border);
      height: 100%;
    }

    .comm-sidebar-header {
      padding: 24px;
      border-bottom: 1px solid var(--border);
    }

    .comm-sidebar-header p {
      margin: 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: var(--text-tertiary);
      opacity: 0.8;
    }

    .comm-sidebar-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }

    .comm-sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .comm-sync-btn {
      border: none;
      border-radius: 999px;
      padding: 10px 14px;
      background: var(--primary);
      color: white;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      transition: all 0.2s ease;
    }

    .comm-sync-btn:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }

    .comm-sync-btn:disabled {
      opacity: 0.7;
      cursor: wait;
      transform: none;
    }

    .comm-sync-card {
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(83, 74, 183, 0.06);
      color: #3730a3;
      display: grid;
      gap: 4px;
      font-size: 12px;
      border: 1px solid rgba(83, 74, 183, 0.1);
    }

    .comm-sync-card.error {
      background: rgba(244, 63, 94, 0.06);
      color: #9f1239;
      border-color: rgba(244, 63, 94, 0.1);
    }

    .comm-section {
      display: grid;
      gap: 4px;
      margin-top: 24px;
    }

    .comm-section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #6366f1;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      padding: 0 10px;
      margin-bottom: 8px;
    }

    .comm-empty {
      padding: 10px 14px;
      color: #94a3b8;
      font-size: 13px;
      font-style: italic;
    }

    .add-channel-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      background: none;
      border: none;
      color: var(--text-tertiary);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border-radius: 12px;
      transition: all 0.2s ease;
      margin-top: 4px;
    }

    .add-channel-btn:hover {
      background: var(--surface-alt);
      color: #534AB7;
    }

    .add-channel-btn svg {
      width: 16px;
      height: 16px;
    }

    .comm-state-list {
      display: grid;
      gap: 12px;
      margin-top: 24px;
    }

    .comm-skeleton {
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(90deg, #f5f3ff, #ede9fe, #f5f3ff);
      background-size: 200% 100%;
      animation: shimmer 1.5s linear infinite;
    }

    .comm-error {
      margin-top: 24px;
      padding: 16px;
      border-radius: 20px;
      background: rgba(248, 113, 113, 0.08);
      color: #991b1b;
      display: grid;
      gap: 10px;
    }

    .comm-error button {
      justify-self: start;
      border: none;
      border-radius: 999px;
      background: #991b1b;
      color: white;
      padding: 8px 14px;
      cursor: pointer;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class CommunicationSidebarComponent {
  @Input() channels: ChannelModel[] = [];
  @Input() directMessages: ChannelModel[] = [];
  @Input() activeChannelId: string | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() canSync = false;
  @Input() syncing = false;
  @Input() canCreateChannel = false;
  @Input() syncResult: ProvisioningSyncResponse | null = null;
  @Input() syncError: string | null = null;
  @Output() retry = new EventEmitter<void>();
  @Output() syncRequested = new EventEmitter<void>();
  @Output() addChannelRequested = new EventEmitter<void>();
}
