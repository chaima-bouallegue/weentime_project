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
            <span>Canaux</span>
          </div>
          <div *ngIf="channels.length === 0" class="comm-empty">Aucun canal visible.</div>
          <app-channel-list-item
            *ngFor="let channel of channels"
            [channel]="channel"
            [route]="'/app/messages/channel/' + channel.id"
            [active]="channel.id === activeChannelId">
          </app-channel-list-item>
        </section>

        <section class="comm-section">
          <div class="comm-section-heading">
            <span>Messages directs</span>
          </div>
          <div *ngIf="directMessages.length === 0" class="comm-empty">Aucune conversation directe.</div>
          <app-direct-message-list-item
            *ngFor="let channel of directMessages"
            [channel]="channel"
            [route]="'/app/messages/channel/' + channel.id"
            [active]="channel.id === activeChannelId">
          </app-direct-message-list-item>
        </section>
      </ng-container>
    </aside>
  `,
  styles: [`
    .comm-sidebar {
      height: 100%;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(238, 237, 254, 0.98)),
        linear-gradient(135deg, #ffffff, #f5f3ff);
      border: 1px solid rgba(83, 74, 183, 0.12);
      border-radius: 28px;
      padding: 18px;
      overflow: auto;
      box-shadow: 0 24px 60px rgba(83, 74, 183, 0.08);
    }

    .comm-sidebar-header p {
      margin: 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: #534AB7;
      opacity: 0.8;
    }

    .comm-sidebar-header h2 {
      margin: 6px 0 0;
      font-size: 24px;
      color: #1e1b4b;
      font-weight: 800;
    }

    .comm-sidebar-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 24px;
    }

    .comm-sync-btn {
      border: none;
      border-radius: 999px;
      padding: 10px 14px;
      background: #534AB7;
      color: white;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.2);
    }

    .comm-sync-btn:hover {
      background: #4338ca;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(83, 74, 183, 0.3);
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
  @Input() syncResult: ProvisioningSyncResponse | null = null;
  @Input() syncError: string | null = null;
  @Output() retry = new EventEmitter<void>();
  @Output() syncRequested = new EventEmitter<void>();
}
