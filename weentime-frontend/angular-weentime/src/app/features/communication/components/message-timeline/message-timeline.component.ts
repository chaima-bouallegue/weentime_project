import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModel } from '../../models/communication.models';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';

@Component({
  selector: 'app-message-timeline',
  standalone: true,
  imports: [CommonModule, MessageBubbleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="comm-timeline">
      <div *ngIf="loading" class="comm-timeline-state">
        <div class="comm-line-skeleton" *ngFor="let item of [1, 2, 3, 4]"></div>
      </div>

      <div *ngIf="!loading && error" class="comm-timeline-error">
        <p>{{ error }}</p>
        <button type="button" (click)="retryLoad.emit()">Recharger</button>
      </div>

      <div *ngIf="!loading && !error && messages.length === 0" class="comm-timeline-empty">
        <h3>Aucun message pour le moment</h3>
        <p>Envoyez le premier message pour lancer l'echange.</p>
      </div>

      <div *ngIf="!loading && !error && messages.length > 0" class="comm-timeline-list">
        <app-message-bubble
          *ngFor="let message of messages"
          [message]="message"
          [currentUserId]="currentUserId"
          (retry)="retrySend.emit($event)"
          (deleteFailed)="deleteFailed.emit($event)"
          (toggleReaction)="toggleReaction.emit($event)"
          (editMessage)="editMessage.emit($event)"
          (deleteMessage)="deleteMessage.emit($event)">
        </app-message-bubble>
      </div>
    </section>
  `,
  styles: [`
    .comm-timeline {
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
    }

    .comm-timeline-list {
      display: grid;
      gap: 16px;
      margin-top: auto;
    }

    .comm-timeline-state {
      display: grid;
      gap: 16px;
    }

    .comm-line-skeleton {
      height: 94px;
      border-radius: 24px;
      background: linear-gradient(90deg, #e2e8f0, #f8fafc, #e2e8f0);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    .comm-timeline-error,
    .comm-timeline-empty {
      margin: auto;
      max-width: 420px;
      text-align: center;
      padding: 28px;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
    }

    .comm-timeline-error button {
      border: none;
      border-radius: 999px;
      background: #0f766e;
      color: white;
      padding: 10px 16px;
      cursor: pointer;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class MessageTimelineComponent {
  @Input() messages: MessageModel[] = [];
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() currentUserId: number | null = null;
  @Output() retryLoad = new EventEmitter<void>();
  @Output() retrySend = new EventEmitter<MessageModel>();
  @Output() deleteFailed = new EventEmitter<MessageModel>();
  @Output() toggleReaction = new EventEmitter<{ message: MessageModel; emoji: string }>();
  @Output() editMessage = new EventEmitter<MessageModel>();
  @Output() deleteMessage = new EventEmitter<MessageModel>();
}
