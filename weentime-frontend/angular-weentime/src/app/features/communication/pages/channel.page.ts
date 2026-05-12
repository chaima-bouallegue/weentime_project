import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '@app/core/services/auth.service';
import { ChannelHeaderComponent } from '../components/channel-header/channel-header.component';
import { MessageComposerComponent } from '../components/message-composer/message-composer.component';
import { MessageTimelineComponent } from '../components/message-timeline/message-timeline.component';
import { ThreadPanelComponent } from '../components/thread-panel/thread-panel.component';
import { MessageModel } from '../models/communication.models';
import { CommunicationStoreService } from '../services/communication-store.service';

@Component({
  selector: 'app-channel-page',
  standalone: true,
  imports: [
    CommonModule, 
    ChannelHeaderComponent, 
    MessageTimelineComponent, 
    MessageComposerComponent,
    ThreadPanelComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-channel-shell" *ngIf="store.activeChannel(); else emptyState">
      <div class="comm-channel-main">
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
          (retrySend)="store.retryMessage($event)"
          (deleteFailed)="store.removeFailedMessage($event)"
          (toggleReaction)="toggleReaction($event.message, $event.emoji)"
          (editMessage)="onEditMessage($event)"
          (deleteForEveryone)="onDeleteForEveryone($event)"
          (deleteForMe)="onDeleteForMe($event)"
          (replyThread)="store.openThread($event.id)">
        </app-message-timeline>

        <app-message-composer
          [disabled]="!store.canSend()"
          [typingLabel]="store.typingLabel()"
          (submitMessage)="store.sendMessage($event.text, $event.attachmentIds)"
          (typing)="store.publishTyping($event)">
        </app-message-composer>
      </div>

        <app-thread-panel
          *ngIf="store.activeThreadRootId()"
          [rootMessage]="store.activeThreadRoot()"
          [replies]="store.activeThreadReplies()"
          [loading]="store.loadingThread()"
          [currentUserId]="store.currentUserId()"
          (close)="store.closeThread()"
          (submitReply)="store.sendReply($event.text, $event.attachmentIds)"
          (toggleReaction)="store.toggleReaction($event.message, $event.emoji)">
        </app-thread-panel>
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
      flex-direction: row;
      border-radius: 32px;
      overflow: hidden;
      background: white;
      border: 1px solid rgba(83, 74, 183, 0.1);
      box-shadow: 0 32px 80px rgba(83, 74, 183, 0.08);
    }

    .comm-channel-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      border-right: 1px solid rgba(83, 74, 183, 0.05);
    }

    .comm-empty-state {
      min-height: calc(100vh - 220px);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border-radius: 32px;
      background:
        radial-gradient(circle at top, rgba(83, 74, 183, 0.08), transparent 40%),
        linear-gradient(180deg, white, #fdfdff);
      border: 1px solid rgba(83, 74, 183, 0.1);
    }

    .comm-empty-state.error {
      background:
        radial-gradient(circle at top, rgba(244, 63, 94, 0.08), transparent 40%),
        linear-gradient(180deg, white, #fff1f2);
      border-color: rgba(244, 63, 94, 0.1);
    }

    .comm-empty-state p {
      margin: 0 0 12px;
      color: #534AB7;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      font-size: 11px;
      font-weight: 700;
      opacity: 0.8;
    }

    .comm-empty-state h2 {
      margin: 0;
      font-size: 32px;
      font-weight: 800;
      color: #1e1b4b;
      letter-spacing: -0.02em;
    }

    .comm-empty-state span {
      display: inline-block;
      margin-top: 12px;
      color: #64748b;
      font-size: 15px;
      max-width: 400px;
    }

    .comm-retry-btn {
      margin-top: 24px;
      border: none;
      border-radius: 999px;
      padding: 12px 24px;
      background: #534AB7;
      color: white;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.2);
    }

    .comm-retry-btn:hover {
      background: #4338ca;
      transform: translateY(-1px);
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

  toggleReaction(message: MessageModel, emoji: string): void {
    this.store.toggleReaction(message, emoji);
  }

  onEditMessage(event: { message: MessageModel; body: string }): void {
    this.store.updateMessage(event.message, event.body);
  }

  onDeleteForEveryone(message: MessageModel): void {
    this.store.deleteMessage(message);
  }

  onDeleteForMe(message: MessageModel): void {
    this.store.hideMessageForMe(message);
  }
}
