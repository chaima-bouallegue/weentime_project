import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChannelModel } from '../../models/communication.models';
import { CommunicationStoreService } from '../../services/communication-store.service';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside class="comm-side-panel">
      <header class="panel-header">
        <div class="header-content">
          <h3>Paramètres du canal</h3>
          <div class="header-tags">
            <span class="channel-type">{{ channel?.isPrivate ? 'Privé' : 'Public' }} · {{ channel?.type }}</span>
            <span *ngIf="channel?.isArchived" class="badge-archived">Archivé</span>
          </div>
        </div>
        <button class="close-btn" (click)="close.emit()" title="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </header>

      <div class="panel-body">
        <!-- Bannière si canal archivé -->
        <div *ngIf="channel?.isArchived" class="archived-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
          <div>
            <strong>Canal archivé</strong>
            <p>Ce canal est en lecture seule. Plus aucun message ne peut être envoyé.</p>
          </div>
        </div>

        <!-- Section À propos / Modification -->
        <section class="settings-section">
          <div class="section-header-row">
            <h4>À PROPOS</h4>
            <button
              *ngIf="canManage && !channel?.isArchived && !isEditing()"
              type="button"
              class="btn-edit-toggle"
              (click)="startEditing()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              <span>Modifier</span>
            </button>
          </div>

          <!-- Mode Consultation -->
          <div *ngIf="!isEditing()" class="info-card">
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

          <!-- Mode Édition (Nom / Description) -->
          <div *ngIf="isEditing()" class="edit-card">
            <div class="form-group">
              <label for="edit-name">Nom du canal</label>
              <input
                id="edit-name"
                type="text"
                [(ngModel)]="editName"
                placeholder="ex: projet-general"
                maxlength="180"
                required
              />
            </div>
            <div class="form-group">
              <label for="edit-desc">Description</label>
              <textarea
                id="edit-desc"
                rows="3"
                [(ngModel)]="editDescription"
                placeholder="Description du canal..."
                maxlength="2000">
              </textarea>
            </div>

            <div *ngIf="actionError()" class="action-error">
              {{ actionError() }}
            </div>

            <div class="edit-actions">
              <button type="button" class="btn-cancel" [disabled]="saving()" (click)="cancelEditing()">Annuler</button>
              <button type="button" class="btn-save" [disabled]="saving() || !editName.trim()" (click)="saveChanges()">
                {{ saving() ? 'Enregistrement...' : 'Enregistrer' }}
              </button>
            </div>
          </div>
        </section>

        <!-- Section Notifications -->
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

        <!-- Section Zone de danger -->
        <section class="settings-section danger-zone" *ngIf="!isDirectChannel">
          <h4>ZONE DE DANGER</h4>

          <div *ngIf="dangerError()" class="action-error">
            {{ dangerError() }}
          </div>

          <!-- Archiver le canal (pour admin/owner) -->
          <button
            *ngIf="canManage && !channel?.isArchived"
            type="button"
            class="danger-btn archive-btn"
            [disabled]="archiving()"
            (click)="onArchiveChannel()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
            {{ archiving() ? 'Archivage...' : 'Archiver ce canal' }}
          </button>

          <!-- Quitter le canal -->
          <button
            type="button"
            class="danger-btn"
            [disabled]="leaving()"
            (click)="onLeaveChannel()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            {{ leaving() ? 'Départ...' : 'Quitter le canal' }}
          </button>
        </section>
      </div>
    </aside>
  `,
  styles: [`
    .comm-side-panel {
      width: 380px;
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
      padding: 20px 24px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(83, 74, 183, 0.06);
    }

    .header-content h3 {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 800;
      color: #1e1b4b;
    }

    .header-tags {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .channel-type {
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-archived {
      font-size: 11px;
      font-weight: 700;
      background: #fef3c7;
      color: #b45309;
      padding: 2px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: #f1f5f9;
      color: #64748b;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .close-btn:hover {
      background: #e2e8f0;
      color: #1e1b4b;
    }

    .close-btn svg {
      width: 18px;
      height: 18px;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .archived-banner {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 14px;
      color: #92400e;
    }

    .archived-banner svg {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .archived-banner strong {
      font-size: 13px;
      display: block;
      margin-bottom: 2px;
    }

    .archived-banner p {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      color: #b45309;
    }

    .section-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .settings-section h4 {
      font-size: 11px;
      font-weight: 800;
      color: #94a3b8;
      letter-spacing: 0.1em;
      margin: 0;
    }

    .btn-edit-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: #534ab7;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.2s;
    }

    .btn-edit-toggle:hover {
      background: #eeedfe;
    }

    .btn-edit-toggle svg {
      width: 14px;
      height: 14px;
    }

    .info-card {
      background: white;
      border-radius: 16px;
      padding: 18px;
      border: 1px solid rgba(83, 74, 183, 0.08);
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.03);
    }

    .info-row label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      margin-bottom: 2px;
    }

    .info-row span {
      font-size: 14px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .info-row p {
      margin: 0;
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
    }

    .edit-card {
      background: white;
      border-radius: 16px;
      padding: 18px;
      border: 1px solid rgba(83, 74, 183, 0.15);
      box-shadow: 0 6px 20px rgba(83, 74, 183, 0.06);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 12px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .form-group input,
    .form-group textarea {
      padding: 10px 14px;
      border: 1.5px solid #e2e8f0;
      border-radius: 10px;
      font-size: 13px;
      color: #1e1b4b;
      outline: none;
      transition: border-color 0.2s;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      border-color: #534ab7;
    }

    .action-error {
      padding: 10px 12px;
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-radius: 8px;
      color: #e11d48;
      font-size: 12px;
    }

    .edit-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 4px;
    }

    .btn-cancel {
      padding: 8px 14px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
    }

    .btn-save {
      padding: 8px 16px;
      background: #534ab7;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .btn-save:hover:not(:disabled) {
      background: #4338ca;
    }

    .btn-save:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .options-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .option-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px;
      background: white;
      border: 1px solid rgba(83, 74, 183, 0.05);
      border-radius: 14px;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
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
      font-size: 18px;
    }

    .option-text {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .option-title {
      font-size: 13px;
      font-weight: 700;
      color: #1e1b4b;
    }

    .option-desc {
      font-size: 11px;
      color: #64748b;
    }

    .check-mark {
      color: #534AB7;
      font-weight: 900;
      font-size: 16px;
    }

    .danger-zone {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .danger-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      background: #fff1f2;
      color: #e11d48;
      border: 1px solid #fecdd3;
      border-radius: 12px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .danger-btn:hover:not(:disabled) {
      background: #ffe4e6;
      transform: translateY(-1px);
    }

    .danger-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .archive-btn {
      background: #fffbeb;
      color: #b45309;
      border-color: #fde68a;
    }

    .archive-btn:hover:not(:disabled) {
      background: #fef3c7;
    }

    .danger-btn svg {
      width: 16px;
      height: 16px;
    }
  `]
})
export class SettingsPanelComponent {
  @Input() channel: ChannelModel | null = null;
  @Input() currentLevel: string = 'ALL';
  @Output() close = new EventEmitter<void>();
  @Output() updateNotificationLevel = new EventEmitter<string>();

  private readonly store = inject(CommunicationStoreService);

  readonly isEditing = signal(false);
  readonly saving = signal(false);
  readonly archiving = signal(false);
  readonly leaving = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly dangerError = signal<string | null>(null);

  editName = '';
  editDescription = '';

  get canManage(): boolean {
    return this.channel?.permissions?.canManage ?? false;
  }

  get isDirectChannel(): boolean {
    return this.channel?.type === 'DIRECT' || this.channel?.type === 'GROUP_DM';
  }

  startEditing(): void {
    if (!this.channel) return;
    this.editName = this.channel.name;
    this.editDescription = this.channel.description || '';
    this.actionError.set(null);
    this.isEditing.set(true);
  }

  cancelEditing(): void {
    this.isEditing.set(false);
    this.actionError.set(null);
  }

  saveChanges(): void {
    if (!this.channel || !this.editName.trim()) return;

    this.saving.set(true);
    this.actionError.set(null);

    this.store.updateChannel(this.channel.id, {
      name: this.editName.trim(),
      description: this.editDescription.trim() || null
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.isEditing.set(false);
      },
      error: err => {
        this.saving.set(false);
        this.actionError.set(err?.message || 'Impossible de modifier le canal.');
      }
    });
  }

  updateLevel(level: string): void {
    this.updateNotificationLevel.emit(level);
  }

  onArchiveChannel(): void {
    if (!this.channel) return;

    if (!confirm(`Voulez-vous vraiment archiver le canal #${this.channel.name} ? Le canal deviendra accessible en lecture seule.`)) {
      return;
    }

    this.archiving.set(true);
    this.dangerError.set(null);

    this.store.archiveChannel(this.channel.id).subscribe({
      next: () => {
        this.archiving.set(false);
      },
      error: err => {
        this.archiving.set(false);
        this.dangerError.set(err?.message || 'Impossible d\'archiver le canal.');
      }
    });
  }

  onLeaveChannel(): void {
    if (!this.channel) return;

    if (!confirm(`Êtes-vous sûr de vouloir quitter le canal #${this.channel.name} ?`)) {
      return;
    }

    this.leaving.set(true);
    this.dangerError.set(null);

    this.store.leaveChannel(this.channel.id).subscribe({
      next: () => {
        this.leaving.set(false);
        this.close.emit();
      },
      error: err => {
        this.leaving.set(false);
        this.dangerError.set(err?.message || 'Impossible de quitter ce canal (vérifiez que vous n\'en êtes pas le seul propriétaire).');
      }
    });
  }
}
