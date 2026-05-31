import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelModel } from '../../models/communication.models';

@Component({
  selector: 'app-members-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="comm-side-panel">
      <header class="panel-header">
        <div class="header-content">
          <h3>Membres</h3>
          <span class="member-count">{{ channel?.members?.length || 0 }} personnes</span>
        </div>
        <button class="close-btn" (click)="close.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="panel-body">
        <div class="member-list">
          <div *ngFor="let member of channel?.members" class="member-item">
            <div class="member-avatar">
              <img *ngIf="member.avatarUrl" [src]="member.avatarUrl" [alt]="member.fullName">
              <div *ngIf="!member.avatarUrl" class="avatar-initials">
                {{ getInitials(member.fullName) }}
              </div>
            </div>
            <div class="member-info">
              <span class="member-name">{{ member.fullName }}</span>
              <span class="member-status">Membre</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .comm-side-panel {
      width: 350px;
      height: 100%;
      background: white;
      border-left: 1px solid rgba(83, 74, 183, 0.1);
      display: flex;
      flex-direction: column;
      box-shadow: -20px 0 60px rgba(15, 23, 42, 0.08);
      z-index: 150;
      animation: slideIn 0.3s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .panel-header {
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(83, 74, 183, 0.05);
    }

    .header-content h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #1e1b4b;
    }

    .member-count {
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: #FFFFFF;
      color: #64748b;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: #FFFFFF;
      color: #1e1b4b;
    }

    .close-btn svg {
      width: 18px;
      height: 18px;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .member-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 12px;
      transition: background 0.2s ease;
    }

    .member-item:hover {
      background: #f8f7ff;
    }

    .member-avatar {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .member-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initials {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #534AB7 0%, #4338ca 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }

    .member-info {
      display: flex;
      flex-direction: column;
    }

    .member-name {
      font-size: 14px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .member-status {
      font-size: 12px;
      color: #94a3b8;
    }
  `]
})
export class MembersPanelComponent {
  @Input() channel: ChannelModel | null = null;
  @Output() close = new EventEmitter<void>();

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }
}
