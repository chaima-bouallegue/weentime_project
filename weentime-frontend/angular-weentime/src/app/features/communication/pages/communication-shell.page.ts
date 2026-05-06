import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { CommunicationSidebarComponent } from '../components/communication-sidebar/communication-sidebar.component';
import { CommunicationStoreService } from '../services/communication-store.service';

@Component({
  selector: 'app-communication-shell-page',
  standalone: true,
  imports: [CommonModule, RouterOutlet, CommunicationSidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-page">
      <div class="comm-banner-root" *ngIf="store.connectionState() !== 'connected' || store.websocketError()">
        <div class="comm-banner">
          <ng-container [ngSwitch]="store.connectionState()">
            <span *ngSwitchCase="'connecting'">Reconnexion temps réel en cours. Les messages restent visibles.</span>
            <span *ngSwitchDefault>{{ store.websocketError() || 'Connexion temps réel indisponible' }}</span>
          </ng-container>
          <span *ngIf="store.connectionState() === 'connecting' && store.websocketError()"> {{ store.websocketError() }}</span>
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
          [syncing]="store.syncInProgress()"
          [syncResult]="store.syncResult()"
          [syncError]="store.syncError()"
          (retry)="store.loadChannels()"
          (syncRequested)="store.runCommunicationSync()">
        </app-communication-sidebar>

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
      gap: 16px;
      min-height: calc(100vh - 190px);
    }

    .comm-banner-root {
      pointer-events: none;
      position: relative;
      z-index: 2;
    }

    .comm-banner {
      pointer-events: auto;
      padding: 12px 16px;
      border-radius: 18px;
      background: rgba(251, 146, 60, 0.14);
      color: #9a3412;
      border: 1px solid rgba(251, 146, 60, 0.22);
    }

    .comm-layout {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 18px;
      min-height: 0;
      flex: 1;
    }

    .comm-conversation {
      min-width: 0;
      min-height: 0;
    }

    @media (max-width: 1024px) {
      .comm-layout {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class CommunicationShellPage implements OnInit {
  readonly store = inject(CommunicationStoreService);

  ngOnInit(): void {
    this.store.initialize();
  }
}
