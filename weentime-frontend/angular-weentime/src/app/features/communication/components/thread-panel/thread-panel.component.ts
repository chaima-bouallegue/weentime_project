import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModel } from '../../models/communication.models';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { MessageComposerComponent } from '../message-composer/message-composer.component';

@Component({
  selector: 'app-thread-panel',
  standalone: true,
  imports: [CommonModule, MessageBubbleComponent, MessageComposerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="thread-panel">
      <header class="thread-header">
        <div class="thread-header-main">
          <h3>Fil de discussion</h3>
          <p *ngIf="rootMessage">avec {{ rootMessage.sender.fullName }}</p>
        </div>
        <button type="button" class="close-btn" (click)="close.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="thread-content">
        <div class="thread-root" *ngIf="rootMessage">
          <app-message-bubble 
            [message]="rootMessage" 
            [currentUserId]="currentUserId"
            (toggleReaction)="toggleReaction.emit($event)">
          </app-message-bubble>
          <div class="thread-divider">
            <span>{{ replies.length }} réponse{{ replies.length > 1 ? 's' : '' }}</span>
          </div>
        </div>

        <div class="thread-replies">
          <div *ngIf="loading" class="thread-loading">Chargement des réponses...</div>
          
          <app-message-bubble
            *ngFor="let reply of replies"
            [message]="reply"
            [currentUserId]="currentUserId"
            (toggleReaction)="toggleReaction.emit($event)">
          </app-message-bubble>
        </div>
      </div>

      <footer class="thread-footer">
        <app-message-composer
          [disabled]="loading"
          (submitMessage)="submitReply.emit($event)">
        </app-message-composer>
      </footer>
    </aside>
  `,
  styles: [`
    .thread-panel {
      width: 400px;
      height: 100%;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.2);
      animation: slideIn 0.3s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .thread-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .thread-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: var(--text-primary);
    }

    .thread-header p {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: none;
      color: var(--text-tertiary);
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: var(--surface-alt);
      color: var(--text-primary);
    }

    .close-btn svg {
      width: 18px;
      height: 18px;
    }

    .thread-content {
      flex: 1;
      overflow: auto;
      padding: 24px 0;
    }

    .thread-root {
      margin-bottom: 24px;
    }

    .thread-divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      padding: 0 24px;
    }

    .thread-divider::before,
    .thread-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .thread-divider span {
      padding: 0 12px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .thread-replies {
      display: flex;
      flex-direction: column;
    }

    .thread-loading {
      text-align: center;
      padding: 24px;
      color: var(--text-secondary);
      font-style: italic;
    }

    .thread-footer {
      border-top: 1px solid var(--border);
      background: var(--surface-alt);
    }

    /* Override composer padding for thread panel */
    ::ng-deep .thread-footer .comm-composer {
      padding: 12px 16px 16px;
    }
  `]
})
export class ThreadPanelComponent {
  @Input() rootMessage: MessageModel | null = null;
  @Input() replies: MessageModel[] = [];
  @Input() loading = false;
  @Input() currentUserId: number | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() submitReply = new EventEmitter<{ text: string; attachmentIds: string[] }>();
  @Output() toggleReaction = new EventEmitter<{ message: MessageModel; emoji: string }>();
}
