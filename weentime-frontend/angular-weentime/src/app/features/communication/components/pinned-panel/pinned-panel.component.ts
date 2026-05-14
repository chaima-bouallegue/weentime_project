import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageModel } from '../../models/communication.models';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';

@Component({
  selector: 'app-pinned-panel',
  standalone: true,
  imports: [CommonModule, MessageBubbleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pinned-panel">
      <header class="panel-header">
        <div class="header-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><path d="M5 20h14"/></svg>
          <h3>Messages épinglés</h3>
        </div>
        <button class="close-btn" (click)="close.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="panel-body">
        <div *ngIf="messages.length === 0" class="empty-state">
          <p>Aucun message épinglé pour le moment.</p>
        </div>
        
        <div *ngIf="messages.length > 0" class="pinned-list">
          <div class="pinned-item" *ngFor="let message of messages">
            <app-message-bubble 
              [message]="message" 
              [currentUserId]="currentUserId"
              (toggleReaction)="toggleReaction.emit($event)"
              (pinMessage)="pinMessage.emit($event)">
            </app-message-bubble>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 400px;
      height: 100%;
      background: white;
      border-left: 1px solid rgba(83, 74, 183, 0.1);
      box-shadow: -20px 0 60px rgba(15, 23, 42, 0.05);
    }

    .pinned-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .panel-header {
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(83, 74, 183, 0.05);
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #1e1b4b;
    }

    .header-title svg { width: 20px; height: 20px; color: #534AB7; }
    .header-title h3 { margin: 0; font-size: 18px; font-weight: 800; }

    .close-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      border: none;
      background: #f1f5f9;
      color: #64748b;
      cursor: pointer;
      transition: all 0.2s;
    }
    .close-btn:hover { background: #e2e8f0; color: #1e1b4b; }
    .close-btn svg { width: 18px; height: 18px; }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 0;
    }

    .empty-state {
      padding: 40px 24px;
      text-align: center;
      color: #64748b;
      font-size: 14px;
      font-weight: 500;
    }

    .pinned-list {
      display: flex;
      flex-direction: column;
    }

    .pinned-item {
      padding: 4px 0;
      border-bottom: 1px solid rgba(83, 74, 183, 0.03);
    }
    .pinned-item:last-child { border-bottom: none; }
  `]
})
export class PinnedPanelComponent {
  @Input() messages: MessageModel[] = [];
  @Input() currentUserId: number | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() toggleReaction = new EventEmitter<{ message: MessageModel; emoji: string }>();
  @Output() pinMessage = new EventEmitter<MessageModel>();
}
