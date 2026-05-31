import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChannelModel } from '../../models/communication.models';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="comm-side-panel">
      <header class="panel-header">
        <div class="header-content">
          <h3>Paramètres du canal</h3>
          <span class="channel-type">{{ channel?.isPrivate ? 'Privé' : 'Public' }} · {{ channel?.type }}</span>
        </div>
        <button class="close-btn" (click)="close.emit()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="panel-body">
        <section class="settings-section">
          <h4>À PROPOS</h4>
          <div class="info-card">
            <div class="info-row">
              <label>Nom</label>
              <span>#{{ channel?.name }}</span>
            </div>
            <div class="info-row">
              <label>Description</label>
              <p>{{ channel?.description || 'Aucune description fournie.' }}</p>
            </div>
            <div class="info-row">
              <label>Créé le</label>
              <span>{{ channel?.createdAt | date:'d MMMM yyyy':'':'fr-FR' }}</span>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h4>NOTIFICATIONS</h4>
          <div class="options-list">
            <button class="option-item" [class.active]="currentLevel === 'ALL'" (click)="updateLevel('ALL')">
              <div class="option-icon">🔔</div>
              <div class="option-text">
                <span class="option-title">Tous les messages</span>
                <span class="option-desc">Recevoir une notification pour chaque message.</span>
              </div>
              <div class="check-mark" *ngIf="currentLevel === 'ALL'">✓</div>
            </button>
            <button class="option-item" [class.active]="currentLevel === 'MENTIONS'" (click)="updateLevel('MENTIONS')">
              <div class="option-icon">@</div>
              <div class="option-text">
                <span class="option-title">Mentions uniquement</span>
                <span class="option-desc">Seulement si vous êtes cité ou @channel.</span>
              </div>
              <div class="check-mark" *ngIf="currentLevel === 'MENTIONS'">✓</div>
            </button>
            <button class="option-item" [class.active]="currentLevel === 'MUTED'" (click)="updateLevel('MUTED')">
              <div class="option-icon">🔕</div>
              <div class="option-text">
                <span class="option-title">Muet</span>
                <span class="option-desc">Aucune notification pour ce canal.</span>
              </div>
              <div class="check-mark" *ngIf="currentLevel === 'MUTED'">✓</div>
            </button>
          </div>
        </section>

        <section class="settings-section danger-zone">
          <h4>ZONE DE DANGER</h4>
          <button class="danger-btn" (click)="leaveChannel()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Quitter le canal
          </button>
        </section>
      </div>
    </aside>
  `,
  styles: [`
    .comm-side-panel {
      width: 350px;
      height: 100%;
      background: #fdfdff;
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
      background: white;
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

    .channel-type {
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
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

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    .settings-section h4 {
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      letter-spacing: 0.1em;
      margin: 0 0 16px 4px;
    }

    .info-card {
      background: white;
      border-radius: 16px;
      padding: 20px;
      border: 1px solid rgba(83, 74, 183, 0.05);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .info-row label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .info-row span {
      font-size: 14px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .info-row p {
      margin: 0;
      font-size: 14px;
      color: #64748b;
      line-height: 1.5;
    }

    .options-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .option-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: white;
      border: 1px solid rgba(83, 74, 183, 0.05);
      border-radius: 16px;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
      position: relative;
    }

    .option-item:hover {
      background: #f8f7ff;
      border-color: rgba(83, 74, 183, 0.2);
    }

    .option-item.active {
      border-color: #534AB7;
      background: #f5f3ff;
    }

    .option-icon {
      font-size: 20px;
    }

    .option-text {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .option-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .option-desc {
      font-size: 12px;
      color: #64748b;
    }

    .check-mark {
      color: #534AB7;
      font-weight: 900;
      font-size: 18px;
    }

    .danger-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      background: #fff1f2;
      color: #e11d48;
      border: 1px solid #fecdd3;
      border-radius: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .danger-btn:hover {
      background: #ffe4e6;
      transform: translateY(-1px);
    }

    .danger-btn svg {
      width: 18px;
      height: 18px;
    }
  `]
})
export class SettingsPanelComponent {
  @Input() channel: ChannelModel | null = null;
  @Input() currentLevel: string = 'ALL';
  @Output() close = new EventEmitter<void>();
  @Output() updateNotificationLevel = new EventEmitter<string>();

  updateLevel(level: string): void {
    this.updateNotificationLevel.emit(level);
  }

  leaveChannel(): void {
    if (confirm('Voulez-vous vraiment quitter ce canal ?')) {
      alert('Fonctionnalité de départ bientôt disponible !');
    }
  }
}
