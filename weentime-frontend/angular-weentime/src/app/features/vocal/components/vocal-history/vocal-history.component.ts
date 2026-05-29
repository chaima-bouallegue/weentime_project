// [WEENTIME-VOCAL] History Component
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VocalSession } from '../../models/vocal-session.model';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-vocal-history',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history-container">
      <h3 class="title">Historique Récent</h3>
      <div class="timeline">
        @if(sessions.length === 0) {
          <p class="empty-text">Aucune interaction vocale récente.</p>
        }
        @for(session of sessions; track session.id; let isLast = $last) {
          <div class="timeline-item">
            <div class="line" *ngIf="!isLast"></div>
            <div class="node">
              <lucide-icon name="message-square" size="12"></lucide-icon>
            </div>
            <div class="content">
              <div class="content-header">
                <span class="intent-name">{{ formatIntentType(session.intent.type) }}</span>
                <span class="time">{{ session.timestamp | date:'HH:mm:ss' }}</span>
              </div>
              <div class="content-body">
                <p class="user-text">« {{ session.intent.rawText }} »</p>
                <div class="bot-response" [class.ar-text]="session.langue === 'ar'">
                  {{ session.response.text | slice:0:80 }}{{ session.response.text.length > 80 ? '...' : '' }}
                </div>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .history-container {
      width: 100%;
    }
    .title {
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0 0 20px 0;
    }
    .empty-text {
      font-size: 14px;
      color: #94a3b8;
      font-style: italic;
    }
    .timeline {
      display: flex;
      flex-direction: column;
    }
    .timeline-item {
      display: flex;
      gap: 16px;
      position: relative;
      padding-bottom: 20px;
    }
    .line {
      position: absolute;
      left: 11px;
      top: 24px;
      bottom: 0px;
      width: 2px;
      background: #e2e8f0;
    }
    .node {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #EEEDFE;
      color: #4f46e5;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      z-index: 2;
    }
    .content { flex: 1; min-width: 0; }
    .content-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .intent-name {
      font-size: 12px;
      font-weight: 800;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .time { font-size: 11px; color: #94a3b8; font-weight: 600; }
    .user-text {
      font-size: 14px;
      color: #475569;
      margin: 0 0 8px 0;
      font-style: italic;
    }
    .bot-response {
      background: #FFFFFF;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      color: #64748b;
      border: 1px solid #f1f5f9;
    }
    .bot-response.ar-text {
      font-family: 'Tajawal', 'Cairo', sans-serif;
      text-align: right;
      direction: rtl;
    }
    .timeline-item:last-child { padding-bottom: 0; }
  `]
})
export class VocalHistoryComponent {
  @Input() sessions: VocalSession[] = [];

  formatIntentType(type: string): string {
    return type.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}
