import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@app/core/services/auth.service';
import { ChannelHeaderComponent } from '../components/channel-header/channel-header.component';
import { MessageComposerComponent } from '../components/message-composer/message-composer.component';
import { MessageTimelineComponent } from '../components/message-timeline/message-timeline.component';
import { MessageModel } from '../models/communication.models';
import { CommunicationStoreService } from '../services/communication-store.service';

@Component({
  selector: 'app-channel-page',
  standalone: true,
  imports: [CommonModule, ChannelHeaderComponent, MessageTimelineComponent, MessageComposerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-channel-shell" *ngIf="store.activeChannel(); else emptyState">
      <app-channel-header
        [channel]="store.activeChannel()"
        [typingLabel]="store.typingLabel()"
        [connectionState]="store.connectionState()"
        [readRetryPending]="store.readRetryPending()">
      </app-channel-header>

      <app-message-timeline
        [messages]="store.activeMessages()"
        [loading]="store.loadingMessages()"
        [error]="store.messagesError()"
        [currentUserId]="currentUserId"
        (retryLoad)="store.retryLoadMessages()"
        (retrySend)="retryMessage($event)"
        (deleteFailed)="store.removeFailedMessage($event)"
        (toggleReaction)="toggleReaction($event.message, $event.emoji)"
        (editMessage)="editMessage($event)"
        (deleteMessage)="deleteMessage($event)">
      </app-message-timeline>

      <app-message-composer
        [disabled]="!store.canSend()"
        [typingLabel]="store.typingLabel()"
        (submitText)="store.sendMessage($event)"
        (typing)="store.publishTyping($event)">
      </app-message-composer>
    </section>

    <ng-template #emptyState>
      <section *ngIf="store.activeChannelError(); else noSelection" class="comm-empty-state error">
        <div>
          <p>Communication interne</p>
          <h2>Conversation indisponible</h2>
          <span>{{ store.activeChannelError() }}</span>
          <button type="button" class="comm-retry-btn" (click)="store.retryActiveChannel()">Reessayer</button>
        </div>
      </section>

      <ng-template #noSelection>
      <section class="comm-empty-state">
        <div>
          <p>Communication interne</p>
          <h2>Choisissez une conversation</h2>
          <span>Selectionnez un canal ou un message direct depuis la colonne de gauche.</span>
        </div>
      </section>
      </ng-template>
    </ng-template>
  `,
  styles: [`
    .comm-channel-shell {
      min-height: calc(100vh - 220px);
      display: flex;
      flex-direction: column;
      border-radius: 30px;
      overflow: hidden;
      background:
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 26%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(241, 245, 249, 0.96));
      border: 1px solid rgba(148, 163, 184, 0.16);
      box-shadow: 0 32px 80px rgba(15, 23, 42, 0.1);
    }

    .comm-empty-state {
      min-height: calc(100vh - 220px);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border-radius: 30px;
      background:
        radial-gradient(circle at top, rgba(15, 118, 110, 0.14), transparent 28%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(236, 253, 245, 0.96));
      border: 1px solid rgba(148, 163, 184, 0.16);
    }

    .comm-empty-state.error {
      background:
        radial-gradient(circle at top, rgba(248, 113, 113, 0.14), transparent 28%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(254, 242, 242, 0.96));
    }

    .comm-empty-state p {
      margin: 0 0 10px;
      color: #0f766e;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 11px;
    }

    .comm-empty-state h2 {
      margin: 0;
      font-size: 32px;
      color: #0f172a;
    }

    .comm-empty-state span {
      display: inline-block;
      margin-top: 10px;
      color: #64748b;
    }

    .comm-retry-btn {
      margin-top: 18px;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      background: #0f766e;
      color: white;
      cursor: pointer;
    }
  `]
})
export class ChannelPage {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(CommunicationStoreService);
  readonly currentUserId = inject(AuthService).currentUser()?.id ?? null;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(paramMap => {
      const channelId = paramMap.get('channelId');
      if (channelId) {
        this.store.selectChannel(channelId);
      } else {
        this.store.clearActiveChannel();
      }
    });
  }

  retryMessage(message: MessageModel): void {
    this.store.retryMessage(message);
  }

  toggleReaction(message: MessageModel, emoji: string): void {
    this.store.toggleReaction(message, emoji);
  }

  editMessage(message: MessageModel): void {
    const nextBody = globalThis.prompt('Modifier le message', message.body ?? '');
    if (nextBody === null) {
      return;
    }
    const trimmed = nextBody.trim();
    if (!trimmed || trimmed === (message.body ?? '')) {
      return;
    }
    this.store.updateMessage(message, trimmed);
  }

  deleteMessage(message: MessageModel): void {
    if (!globalThis.confirm('Supprimer ce message ?')) {
      return;
    }
    this.store.deleteMessage(message);
  }
}
