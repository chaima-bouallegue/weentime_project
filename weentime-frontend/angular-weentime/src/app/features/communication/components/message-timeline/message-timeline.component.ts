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
          (deleteForEveryone)="deleteForEveryone.emit($event)"
          (deleteForMe)="deleteForMe.emit($event)"
          (replyThread)="replyThread.emit($event)">
        </app-message-bubble>
      </div>
    </section>
  `,
  styles: [`
    .comm-timeline {
      flex: 1;
      overflow: auto;
      padding: 32px 0;
      display: flex;
      flex-direction: column;
    }

    .comm-timeline-list {
      display: flex;
      flex-direction: column;
      margin-top: auto;
      padding-bottom: 80px;
    }

    .comm-timeline-state {
      display: grid;
      gap: 16px;
      padding: 0 32px;
    }

    .comm-line-skeleton {
      height: 80px;
      border-radius: 20px;
      background: linear-gradient(90deg, #f5f3ff, #ede9fe, #f5f3ff);
      background-size: 200% 100%;
      animation: shimmer 1.5s linear infinite;
    }

    .comm-timeline-error,
    .comm-timeline-empty {
      margin: auto;
      max-width: 400px;
      text-align: center;
      padding: 40px;
      border-radius: 32px;
      background: white;
      box-shadow: 0 20px 50px rgba(83, 74, 183, 0.06);
      border: 1px solid rgba(83, 74, 183, 0.1);
    }

    .comm-timeline-empty h3 {
      font-size: 20px;
      font-weight: 800;
      color: #1e1b4b;
      margin-bottom: 8px;
    }

    .comm-timeline-empty p {
      color: #64748b;
      font-size: 14px;
      line-height: 1.6;
    }

    .comm-timeline-error p {
      color: #f43f5e;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .comm-timeline-error button {
      border: none;
      border-radius: 999px;
      background: #534AB7;
      color: white;
      padding: 10px 20px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .comm-timeline-error button:hover {
      background: #4338ca;
      transform: translateY(-1px);
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
  @Output() editMessage = new EventEmitter<{ message: MessageModel; body: string }>();
  @Output() deleteForEveryone = new EventEmitter<MessageModel>();
  @Output() deleteForMe = new EventEmitter<MessageModel>();
  @Output() replyThread = new EventEmitter<MessageModel>();
}
