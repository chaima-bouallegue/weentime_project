import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { CommunicationSidebarComponent } from '../components/communication-sidebar/communication-sidebar.component';
import { CreateChannelModalComponent } from '../components/create-channel-modal/create-channel-modal.component';
import { CommunicationStoreService } from '../services/communication-store.service';

@Component({
  selector: 'app-communication-shell-page',
  standalone: true,
  imports: [CommonModule, RouterOutlet, CommunicationSidebarComponent, CreateChannelModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-page">
      <div class="comm-banner-root"
           *ngIf="store.tenantContextAvailable() && (store.connectionState() !== 'connected' || store.websocketError())">
        <div class="comm-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 18px; height: 18px;"><path d="m2 22 1-1h3l9-9"/><path d="M3 14c.83 0 1.5-.67 1.5-1.5S3.83 11 3 11s-1.5.67-1.5 1.5S2.17 14 3 14zm0 0v5"/><path d="M19 10c.83 0 1.5-.67 1.5-1.5S19.83 7 19 7s-1.5.67-1.5 1.5S18.17 10 19 10zm0 0v5"/><path d="M14 14c.83 0 1.5-.67 1.5-1.5S14.83 11 14 11s-1.5.67-1.5 1.5S13.17 14 14 14zm0 0v5"/><path d="M21 2h-6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
          <ng-container [ngSwitch]="store.connectionState()">
            <span *ngSwitchCase="'connecting'">Tentative de reconnexion au serveur de messagerie...</span>
            <span *ngSwitchDefault>La connexion en temps réel a été interrompue. Les messages récents s'afficheront après reconnexion.</span>
          </ng-container>
        </div>
      </div>

      <div class="comm-layout">
        <app-communication-sidebar
          [channels]="store.visibleChannels()"
          [directMessages]="store.directMessages()"
          [activeChannelId]="store.activeChannelId()"
          [loading]="store.loadingChannels() || store.bootstrapInProgress()"
          [error]="store.channelsError()"
          [canSync]="store.canSync()"
          [canCreateChannel]="store.canCreateChannel()"
          [syncing]="store.syncInProgress()"
          [syncResult]="store.syncResult()"
          [syncError]="store.syncError()"
          (retry)="store.loadChannels()"
          (syncRequested)="store.runCommunicationSync()"
          (addChannelRequested)="showCreateModal.set(true)">
        </app-communication-sidebar>

        <app-create-channel-modal
          *ngIf="showCreateModal()"
          (close)="showCreateModal.set(false)"
          (create)="onCreateChannel($event)">
        </app-create-channel-modal>

        <div class="comm-conversation">
          <router-outlet />
        </div>
      </div>
    </section>
  `,
  styles: [`
    .comm-page {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-height: calc(100vh - 190px);
      padding: 0 24px 24px;
    }

    .comm-banner-root {
      pointer-events: none;
      position: relative;
      z-index: 10;
    }

    .comm-banner {
      pointer-events: auto;
      padding: 14px 24px;
      border-radius: 16px;
      background: #EEEDFE;
      color: #3C3489;
      border: 1px solid rgba(83, 74, 183, 0.15);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(83, 74, 183, 0.1);
    }

    .comm-layout {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 24px;
      min-height: 0;
      flex: 1;
    }

    .comm-conversation {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 1100px) {
      .comm-layout {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CommunicationShellPage implements OnInit {
  readonly store = inject(CommunicationStoreService);
  showCreateModal = signal(false);

  ngOnInit(): void {
    this.store.initialize();
  }

  onCreateChannel(request: { name: string; description: string; isPrivate: boolean }): void {
    this.store.createChannel(request).subscribe({
      next: () => this.showCreateModal.set(false),
      error: () => {
        // Handle error (optional: show toast)
      }
    });
  }
}
