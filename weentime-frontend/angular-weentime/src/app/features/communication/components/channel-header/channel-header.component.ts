import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelModel } from '../../models/communication.models';
import { CommunicationConnectionState } from '../../services/communication-websocket.service';

@Component({
  selector: 'app-channel-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header *ngIf="channel" class="comm-header">
      <div>
        <p class="comm-header-kicker">{{ channel.type === 'DIRECT' ? 'Message direct' : 'Conversation' }}</p>
        <h1>{{ channel.name }}</h1>
        <p class="comm-header-meta">
          <span>{{ channel.memberCount }} membre{{ channel.memberCount > 1 ? 's' : '' }}</span>
          <span *ngIf="channel.description">{{ channel.description }}</span>
          <span *ngIf="typingLabel">{{ typingLabel }} est en train d'ecrire...</span>
        </p>
      </div>

      <div class="comm-header-badges">
        <span class="comm-badge" [class.warn]="connectionState !== 'connected'">
          {{ connectionState === 'connected' ? 'WebSocket en ligne' : connectionState === 'connecting' ? 'Reconnexion...' : 'WebSocket hors ligne' }}
        </span>
        <span class="comm-badge" [class.dim]="!channel.permissions.canWrite">
          {{ channel.permissions.canWrite ? 'Ecriture autorisee' : 'Lecture seule' }}
        </span>
        <span *ngIf="readRetryPending" class="comm-badge warn">
          Lecture en attente de resynchronisation
        </span>
      </div>
    </header>
  `,
  styles: [`
    .comm-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 24px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
      background:
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.14), transparent 30%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(240, 249, 255, 0.9));
    }

    .comm-header-kicker {
      margin: 0 0 6px;
      color: #0f766e;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.18em;
    }

    .comm-header h1 {
      margin: 0;
      font-size: 28px;
      color: #0f172a;
    }

    .comm-header-meta {
      margin: 10px 0 0;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      color: #64748b;
    }

    .comm-header-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }

    .comm-badge {
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      color: #0f766e;
      font-size: 13px;
      white-space: nowrap;
    }

    .comm-badge.warn {
      background: rgba(251, 146, 60, 0.14);
      color: #c2410c;
    }

    .comm-badge.dim {
      background: rgba(100, 116, 139, 0.14);
      color: #475569;
    }

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
}
