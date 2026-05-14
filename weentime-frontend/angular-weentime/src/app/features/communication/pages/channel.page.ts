import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { PinnedPanelComponent } from '../components/pinned-panel/pinned-panel.component';
import { MembersPanelComponent } from '../components/members-panel/members-panel.component';
import { AttachmentsPanelComponent } from '../components/attachments-panel/attachments-panel.component';
import { SettingsPanelComponent } from '../components/settings-panel/settings-panel.component';

@Component({
  selector: 'app-channel-page',
  standalone: true,
  imports: [
    CommonModule, 
    ChannelHeaderComponent, 
    MessageTimelineComponent, 
    MessageComposerComponent,
    ThreadPanelComponent,
    PinnedPanelComponent,
    MembersPanelComponent,
    AttachmentsPanelComponent,
    SettingsPanelComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-channel-shell" *ngIf="store.activeChannel(); else emptyState">
      <div class="comm-channel-main">
        <app-channel-header
          [channel]="store.activeChannel()"
          [typingLabel]="store.typingLabel()"
          [connectionState]="store.connectionState()"
          [readRetryPending]="store.readRetryPending()"
          [searchResultsCount]="filteredMessages().length"
          (viewPinned)="openPanel('pinned')"
          (search)="onSearch($event)"
          (viewAttachments)="openPanel('attachments')"
          (viewMembers)="openPanel('members')"
          (openSettings)="openPanel('settings')">
        </app-channel-header>

        <app-message-timeline
          [messages]="filteredMessages()"
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
          (replyThread)="store.openThread($event.id)"
          (pinMessage)="store.togglePin($event)">
        </app-message-timeline>

        <div class="comm-typing-wrapper" *ngIf="store.typingLabel()">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <span class="typing-text">{{ store.typingLabel() }} est en train d'écrire...</span>
        </div>

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

        <!-- Pinned Messages Drawer -->
        <app-pinned-panel
          *ngIf="showPinnedPanel()"
          [messages]="store.pinnedMessages()"
          [currentUserId]="currentUserId"
          (close)="showPinnedPanel.set(false)"
          (toggleReaction)="toggleReaction($event.message, $event.emoji)"
          (pinMessage)="store.togglePin($event)">
        </app-pinned-panel>

        <!-- Members Drawer -->
        <app-members-panel
          *ngIf="showMembersPanel()"
          [channel]="store.activeChannel()"
          (close)="showMembersPanel.set(false)">
        </app-members-panel>

        <!-- Attachments Drawer -->
        <app-attachments-panel
          *ngIf="showAttachmentsPanel()"
          [messages]="store.activeMessages()"
          (close)="showAttachmentsPanel.set(false)">
        </app-attachments-panel>

        <!-- Settings Drawer -->
        <app-settings-panel
          *ngIf="showSettingsPanel()"
          [channel]="store.activeChannel()"
          [currentLevel]="store.activeChannel()?.notificationLevel || 'ALL'"
          (close)="showSettingsPanel.set(false)"
          (updateNotificationLevel)="onUpdateNotificationLevel($event)">
        </app-settings-panel>
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
    :host {
      display: block;
      height: calc(100vh - 120px);
      box-sizing: border-box;
    }

    .comm-channel-shell {
      height: 100%;
      display: flex;
      flex-direction: row;
      border-radius: 32px;
      overflow: hidden;
      background: white;
      border: 1px solid rgba(83, 74, 183, 0.1);
      box-shadow: 0 32px 80px rgba(83, 74, 183, 0.08);
      position: relative; /* Base for thread drawer */
    }

    .comm-channel-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    app-channel-header {
      flex-shrink: 0;
      z-index: 20;
    }

    app-message-timeline {
      flex: 1;
      min-height: 0; /* Important for flex child with overflow */
    }

    app-message-composer {
      flex-shrink: 0;
      z-index: 20;
    }

    app-thread-panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      border-left: 1px solid rgba(83, 74, 183, 0.1);
      background: white;
      box-shadow: -20px 0 60px rgba(15, 23, 42, 0.15);
    }

    .comm-empty-state {
      height: 100%;
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

    .comm-typing-wrapper {
      padding: 8px 32px;
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(4px);
      z-index: 10;
      border-top: 1px solid rgba(83, 74, 183, 0.05);
      flex-shrink: 0;
    }

    .typing-indicator {
      display: flex;
      gap: 3px;
    }

    .typing-indicator span {
      width: 5px;
      height: 5px;
      background: #534AB7;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }

    .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1.0); }
    }

    .typing-text {
      font-size: 13px;
      font-weight: 600;
      color: #534AB7;
      opacity: 0.8;
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
  showEmojiPicker = signal(false);
  showPinnedPanel = signal(false);
  showMembersPanel = signal(false);
  showAttachmentsPanel = signal(false);
  showSettingsPanel = signal(false);
  searchQuery = signal('');

  private readonly route = inject(ActivatedRoute);
  readonly store = inject(CommunicationStoreService);

  readonly filteredMessages = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const messages = this.store.activeMessages();
    if (!query) return messages;
    return messages.filter(m => m.body?.toLowerCase().includes(query));
  });
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

  onSearch(query: string): void {
    this.searchQuery.set(query);
  }

  openPanel(panel: 'pinned' | 'members' | 'attachments' | 'settings'): void {
    // Close others first
    this.showPinnedPanel.set(panel === 'pinned');
    this.showMembersPanel.set(panel === 'members');
    this.showAttachmentsPanel.set(panel === 'attachments');
    this.showSettingsPanel.set(panel === 'settings');
    
    // Also close thread if opening a panel
    if (this.store.activeThreadRootId()) {
      this.store.closeThread();
    }
  }

  onUpdateNotificationLevel(level: string): void {
    this.store.updateNotificationLevel(level);
  }

  onNotImplemented(feature: string): void {
    alert(`${feature} sera disponible prochainement dans WeenTime !`);
  }

  onDeleteForMe(message: MessageModel): void {
    this.store.hideMessageForMe(message);
  }
}
