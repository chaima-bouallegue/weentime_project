import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelModel } from '../../models/communication.models';
import { CommunicationConnectionState } from '../../services/communication-websocket.service';

@Component({
  selector: 'app-channel-header',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header *ngIf="channel" class="comm-header">
      <div class="comm-header-main">
        <div class="comm-header-info">
          <p class="comm-header-kicker">{{ channel.type === 'DIRECT' ? 'Message direct' : 'Conversation' }}</p>
          <h1>{{ channel.name }}</h1>
          <p class="comm-header-meta">
            <span class="comm-header-members" *ngIf="channel.members && channel.members.length">
              <div class="member-avatars">
                <ng-container *ngFor="let member of channel.members.slice(0, 5)">
                  <img *ngIf="member.avatarUrl" [src]="member.avatarUrl" [title]="member.fullName" class="member-avatar">
                  <div *ngIf="!member.avatarUrl" class="member-avatar-initials" [title]="member.fullName">
                    {{ getInitials(member.fullName) }}
                  </div>
                </ng-container>
                <div *ngIf="channel.members.length > 5" class="member-avatar-more">
                  +{{ channel.members.length - 5 }}
                </div>
              </div>
              <span class="member-names" [title]="getMemberNames(channel.members)">
                {{ channel.memberCount }} membre{{ channel.memberCount > 1 ? 's' : '' }}
              </span>
            </span>
            <span class="separator" *ngIf="channel.description">•</span>
            <span class="description" *ngIf="channel.description">{{ channel.description }}</span>
          </p>
        </div>

        <div class="comm-header-typing" *ngIf="typingLabel">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          {{ typingLabel }} est en train d'écrire...
        </div>
      </div>

      <div class="comm-header-actions">
        <button class="action-btn" title="Rechercher">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
        <button class="action-btn" title="Informations">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </button>
      </div>
    </header>
  `,
  styles: [`
    .comm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 32px;
      border-bottom: 1px solid rgba(83, 74, 183, 0.1);
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(8px);
    }

    .comm-header-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .comm-header-kicker {
      margin: 0;
      color: #534AB7;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      opacity: 0.7;
    }

    .comm-header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 800;
      color: #1e1b4b;
      letter-spacing: -0.02em;
    }

    .comm-header-meta {
      margin: 2px 0 0;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #64748b;
      font-size: 13px;
    }

    .comm-header-members {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 12px 4px 4px;
      background: #f8fafc;
      border-radius: 20px;
      border: 1px solid rgba(83, 74, 183, 0.08);
    }
    
    .member-avatars {
      display: flex;
      align-items: center;
    }
    
    .member-avatar, .member-avatar-initials {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid white;
      margin-left: -8px;
      flex-shrink: 0;
      position: relative;
      transition: all 0.2s ease;
    }
    
    .member-avatars > *:first-child { margin-left: 0; }
    
    .member-avatar { object-fit: cover; }
    
    .member-avatar-initials {
      background: #EEEDFE;
      color: #534AB7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
    }
    
    .member-avatar-more {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #f1f5f9;
      color: #64748b;
      font-size: 9px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      margin-left: -8px;
    }
    
    .member-names {
      font-size: 12px;
      font-weight: 600;
      color: #534AB7;
      cursor: help;
    }

    .member-avatar:hover {
      z-index: 10;
      transform: translateY(-2px) scale(1.1);
    }

    .separator {
      opacity: 0.3;
    }

    .comm-header-typing {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #534AB7;
      font-weight: 500;
      margin-top: 4px;
    }

    .typing-indicator {
      display: flex;
      gap: 2px;
    }

    .typing-indicator span {
      width: 4px;
      height: 4px;
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

    .comm-header-actions {
      display: flex;
      gap: 8px;
    }

    .action-btn {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid rgba(83, 74, 183, 0.1);
      background: white;
      color: #64748b;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: #EEEDFE;
      color: #534AB7;
      border-color: rgba(83, 74, 183, 0.2);
    }

    .action-btn svg {
      width: 18px;
      height: 18px;
    }

    @media (max-width: 900px) {
      .comm-header {
        flex-direction: column;
      }
    }
  `]
})
export class ChannelHeaderComponent {
  @Input() channel: ChannelModel | null = null;
  @Input() typingLabel: string | null = null;
  @Input() connectionState: CommunicationConnectionState = 'disconnected';
  @Input() readRetryPending = false;

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.split(' ');
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  getMemberNames(members: any[]): string {
    return members.map(m => m.fullName).join(', ');
  }
}
