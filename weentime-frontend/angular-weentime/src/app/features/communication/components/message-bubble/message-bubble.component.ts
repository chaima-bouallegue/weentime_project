import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MessageModel } from '../../models/communication.models';
import { ReactionBarComponent } from '../reaction-bar/reaction-bar.component';

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, DatePipe, ReactionBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="comm-message" [class.mine]="isMine">
      <div class="comm-message-card">
        <header class="comm-message-head">
          <div>
            <strong>{{ message.sender.fullName }}</strong>
            <span>{{ message.createdAt | date: 'shortTime' }}</span>
            <span *ngIf="message.editedAt && message.status !== 'DELETED'" class="edited">Modifie</span>
          </div>
          <small *ngIf="message.localState === 'sending'" class="sending">Envoi...</small>
          <small *ngIf="message.localState === 'failed'" class="failed">Echec</small>
        </header>

        <p class="comm-message-body">{{ message.body || 'Message supprime.' }}</p>

        <app-reaction-bar
          *ngIf="message.status !== 'DELETED'"
          [reactions]="message.reactions"
          [disabled]="message.localState === 'sending'"
          (toggle)="toggleReaction.emit({ message, emoji: $event })">
        </app-reaction-bar>

        <div *ngIf="message.localState === 'failed'" class="comm-message-actions">
          <button type="button" (click)="retry.emit(message)">Reessayer</button>
          <button type="button" class="ghost" (click)="deleteFailed.emit(message)">Supprimer</button>
        </div>

        <div *ngIf="isMine && message.status !== 'DELETED' && !message.localState" class="comm-message-actions">
          <button type="button" class="ghost" (click)="editMessage.emit(message)">Modifier</button>
          <button type="button" (click)="deleteMessage.emit(message)">Supprimer</button>
        </div>
      </div>
    </article>
  `,
  styles: [`
    .comm-message {
      display: flex;
      justify-content: flex-start;
    }

    .comm-message.mine {
      justify-content: flex-end;
    }

    .comm-message-card {
      max-width: min(680px, 92%);
      padding: 16px 18px;
      border-radius: 22px;
      background: white;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      border: 1px solid rgba(226, 232, 240, 0.9);
    }

    .comm-message.mine .comm-message-card {
      background: linear-gradient(135deg, #0f766e, #0ea5e9);
      color: white;
    }

    .comm-message-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      color: inherit;
    }

    .comm-message-head strong {
      margin-right: 8px;
    }

    .edited {
      margin-left: 8px;
    }

    .comm-message-head span,
    .comm-message-head small {
      opacity: 0.72;
    }

    .comm-message-body {
      margin: 0;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .comm-message-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
    }

    .comm-message-actions button {
      border: none;
      border-radius: 999px;
      padding: 8px 12px;
      cursor: pointer;
      background: rgba(248, 113, 113, 0.15);
      color: #991b1b;
    }

    .comm-message-actions .ghost {
      background: rgba(100, 116, 139, 0.12);
      color: #334155;
    }

    .comm-message.mine .comm-message-actions button {
      background: rgba(255, 255, 255, 0.18);
      color: white;
    }
  `]
})
export class MessageBubbleComponent {
  @Input({ required: true }) message!: MessageModel;
  @Input() currentUserId: number | null = null;
  @Output() retry = new EventEmitter<MessageModel>();
  @Output() deleteFailed = new EventEmitter<MessageModel>();
  @Output() toggleReaction = new EventEmitter<{ message: MessageModel; emoji: string }>();
  @Output() editMessage = new EventEmitter<MessageModel>();
  @Output() deleteMessage = new EventEmitter<MessageModel>();

  get isMine(): boolean {
    return this.currentUserId !== null && this.message.sender.id === this.currentUserId;
  }
}
