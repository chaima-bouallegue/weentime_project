import { 
  ChangeDetectionStrategy, 
  Component, 
  EventEmitter, 
  Input, 
  Output, 
  HostListener, 
  inject,
  signal 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MessageModel, AttachmentModel } from '../../models/communication.models';
import { ReactionBarComponent } from '../reaction-bar/reaction-bar.component';
import { AuthSrcDirective } from '../../../../shared/directives/auth-src.directive';
import { CommunicationApiService } from '../../services/communication-api.service';
import { FriendlyDatePipe } from '../../pipes/friendly-date.pipe';

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  { label: 'Smileys', icon: '😀', emojis: ['😀','😃','😄','😁','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','🤪','🤨','🧐','🤓','😎','🤠','🥳','🤗','🤭','😐','😑','😶','🙄','😏','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😤','😠','😡','🤬'] },
  { label: 'Gestes', icon: '👋', emojis: ['👍','👎','👊','✊','🤛','🤜','👏','🙌','🤝','🤲','👐','🙏','💪','✌️','🤟','🤘','👌','🤌','👋','🤙','👆','👇','👉','👈','🫶','🫡'] },
  { label: 'Cœurs', icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','🔥','⭐','✨','💯','🎉','🎊','💎','🏆','🥇'] },
];

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactionBarComponent, AuthSrcDirective, FriendlyDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="comm-message" [class.mine]="isMine">
      <div class="comm-message-avatar">
        <img *ngIf="message.sender.avatarUrl" [src]="message.sender.avatarUrl" [alt]="message.sender.fullName">
        <div *ngIf="!message.sender.avatarUrl" class="avatar-initials" [style.background-color]="isMine ? '#534AB7' : '#8B5CF6'">
          {{ getInitials(message.sender.fullName) }}
        </div>
      </div>

      <div class="comm-message-content">
        <header class="comm-message-header">
          <strong class="sender-name">{{ message.sender.fullName }}</strong>
          <span class="timestamp">{{ message.createdAt | friendlyDate }}</span>
          <span *ngIf="message.editedAt && message.status !== 'DELETED'" class="edited-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            modifié
          </span>
        </header>

        <div class="comm-message-body-wrapper" *ngIf="!editing()">
          <div class="comm-message-body" *ngIf="message.status !== 'DELETED'" [innerHTML]="renderContent(message.body || '')"></div>
          <p class="comm-message-body deleted" *ngIf="message.status === 'DELETED'">🚫 Ce message a été supprimé.</p>

          <!-- Attachments -->
          <div class="comm-attachments" *ngIf="message.status !== 'DELETED' && message.attachments.length">
            <div *ngFor="let att of message.attachments" class="att-item">
              <a *ngIf="isImage(att.contentType)" [href]="getDownloadUrl(att.id)" target="_blank" class="att-img-preview">
                <img [authSrc]="getDownloadUrl(att.id)" [alt]="att.originalName">
              </a>
              <a *ngIf="!isImage(att.contentType)" [href]="getDownloadUrl(att.id)" target="_blank" class="att-file-card">
                <div class="att-icon">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="att-info">
                  <span class="att-name">{{ att.originalName }}</span>
                  <span class="att-meta">{{ formatSize(att.fileSize) }}</span>
                </div>
              </a>
            </div>
          </div>
        </div>

        <!-- Inline Edit Mode -->
        <div class="inline-edit" *ngIf="editing()">
          <textarea class="edit-textarea" [(ngModel)]="editDraft" (keydown.enter)="saveEdit($event)" (keydown.escape)="editing.set(false)" autofocus></textarea>
          <div class="edit-actions">
            <button type="button" class="edit-cancel" (click)="editing.set(false)">Annuler</button>
            <button type="button" class="edit-save" (click)="saveEdit($event)">Enregistrer</button>
          </div>
        </div>

        <div class="comm-message-actions" *ngIf="message.status !== 'DELETED'">
          <div class="action-group">
            <app-reaction-bar
              [reactions]="message.reactions"
              [disabled]="message.localState === 'sending'"
              (toggle)="toggleReaction.emit({ message, emoji: $event })">
            </app-reaction-bar>
            
            <div class="reaction-trigger-wrapper">
              <button class="bubble-action-btn" [class.active]="showQuickReactions() || showEmojiPicker()" (click)="toggleQuickReactions($event)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>

              <!-- Quick Reactions Popup -->
              <div class="wa-quick-reactions" *ngIf="showQuickReactions()" (click)="$event.stopPropagation()">
                <button type="button" class="quick-emoji" *ngFor="let e of quickEmojis" (click)="pickEmoji(e)">{{ e }}</button>
                <button type="button" class="quick-plus" (click)="openFullPicker($event)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
            </div>
            <button class="bubble-action-btn pill-btn" (click)="replyThread.emit(message)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
              <span>Répondre</span>
            </button>
            <button class="bubble-action-btn pill-btn" (click)="onCtxPin($event)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><path d="M5 20h14"/></svg>
              <span>{{ isPinned ? 'Désépingler' : 'Épingler' }}</span>
            </button>
            <button class="bubble-action-btn" (click)="toggleContextMenu($event)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
          </div>
        </div>

        <!-- Context menu popup -->
        <div class="wa-ctx-menu" *ngIf="showCtxMenu()" (click)="$event.stopPropagation()">
          <button type="button" *ngIf="isMine" (click)="onCtxEdit()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Modifier
          </button>
          <button type="button" class="ctx-danger" *ngIf="isMine" (click)="onCtxDeleteAll()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Supprimer pour tous
          </button>
          <button type="button" class="ctx-danger" (click)="onCtxDeleteMe()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            Supprimer pour moi
          </button>
        </div>

        <!-- Thread Pill -->
        <div class="comm-thread-summary" *ngIf="message.thread && message.thread.replyCount > 0" (click)="replyThread.emit(message)">
          <div class="thread-meta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
            <span class="reply-count">{{ message.thread.replyCount }} réponse{{ message.thread.replyCount > 1 ? 's' : '' }}</span>
            <span class="separator">•</span>
            <span class="last-reply">dernière à {{ message.thread.lastReplyAt | friendlyDate }}</span>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      <!-- Emoji Picker Popup -->
      <div class="wa-emoji-picker" *ngIf="showEmojiPicker()" (click)="$event.stopPropagation()">
        <div class="emoji-tabs">
          <button *ngFor="let cat of emojiCategories; let i = index" type="button"
                  class="emoji-tab" [class.active]="activeTab() === i"
                  (click)="activeTab.set(i)">{{ cat.icon }}</button>
        </div>
        <div class="emoji-grid">
          <button type="button" class="emoji-cell" *ngFor="let e of emojiCategories[activeTab()].emojis"
                  (click)="pickEmoji(e)">{{ e }}</button>
        </div>
      </div>
    </article>
  `,
  styles: [`
    .comm-message { 
      display: flex; 
      gap: 12px; 
      margin-bottom: 12px; 
      padding: 0 24px; 
      transition: all 0.2s ease;
      position: relative;
    }
    .comm-message.mine {
      flex-direction: row-reverse;
    }
    .comm-message:hover {
      background: rgba(83, 74, 183, 0.01);
    }
    
    .comm-message-avatar { 
      flex-shrink: 0; 
      width: 42px; 
      height: 42px; 
    }
    .comm-message-avatar img { width:100%; height:100%; border-radius:12px; object-fit:cover; }
    .avatar-initials { 
      width:100%; height:100%; border-radius:12px; 
      color:white; display:flex; align-items:center; 
      justify-content:center; font-size:14px; font-weight:800; 
      border: 2px solid rgba(255, 255, 255, 0.8);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .comm-message-content { 
      flex: 1; 
      min-width: 0; 
      display: flex; 
      flex-direction: column; 
      gap: 2px; 
      position: relative;
      max-width: 80%;
    }
    .comm-message.mine .comm-message-content {
      align-items: flex-end;
    }

    .comm-message-header { 
      display: flex; 
      align-items: center; 
      gap: 8px; 
      margin-bottom: 2px;
    }
    .comm-message.mine .comm-message-header {
      flex-direction: row-reverse;
    }
    .sender-name { font-size: 13px; font-weight: 800; color: #1e1b4b; }
    .timestamp { font-size: 11px; color: var(--text-tertiary); font-weight: 600; opacity: 0.6; }

    .edited-badge { 
      display: inline-flex; 
      align-items: center; 
      gap: 4px; 
      padding: 2px 8px; 
      border-radius: 6px; 
      background: #EEEDFE; 
      color: #3C3489; 
      font-size: 11px; 
      font-weight: 700; 
    }
    .comm-message.mine .edited-badge {
      background: rgba(255,255,255,0.2);
      color: white;
    }
    .edited-badge svg { width: 10px; height: 10px; }

    .comm-message-body-wrapper {
      position: relative;
      padding: 12px 16px;
      border-radius: 18px;
      background: #f1f5f9; /* Neutral grey for others */
      color: #1e1b4b;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      width: fit-content;
      max-width: 100%;
    }
    .comm-message.mine .comm-message-body-wrapper {
      background: linear-gradient(135deg, #534AB7 0%, #4338ca 100%); /* Elegant gradient */
      color: white;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.2);
    }
    .comm-message:not(.mine) .comm-message-body-wrapper {
      border-bottom-left-radius: 4px;
    }

    .comm-message-body { 
      margin: 0; 
      font-size: 15px; 
      line-height: 1.6; 
      word-break: break-word;
      white-space: pre-wrap;
      color: inherit;
    }
    
    .comm-message-body :host ::ng-deep b, 
    .comm-message-body :host ::ng-deep strong { font-weight: 800; }
    
    .comm-message-body :host ::ng-deep ul { 
      margin: 8px 0; 
      padding-left: 20px; 
      list-style-type: disc;
    }
    
    .comm-message-body :host ::ng-deep li { margin-bottom: 4px; }

    .comm-message-body.deleted { color: #94a3b8; font-style: italic; font-weight: 500; }
    .comm-message.mine .comm-message-body.deleted { color: rgba(255,255,255,0.7); }

    /* Actions */
    .comm-message-actions { 
      margin-top: 6px; 
      opacity: 0; 
      transition: opacity 0.2s ease;
    }
    .comm-message:hover .comm-message-actions { opacity: 1; }

    .action-group { 
      display: flex; 
      align-items: center; 
      gap: 8px; 
    }

    .bubble-action-btn { 
      height: 32px; 
      padding: 0 10px; 
      border-radius: 10px; 
      border: 1px solid var(--border); 
      background: var(--surface); 
      color: var(--text-secondary); 
      cursor: pointer; 
      display: flex; 
      align-items: center; 
      gap: 6px; 
      font-size: 12px; 
      font-weight: 700; 
      transition: all 0.2s; 
    }
    .bubble-action-btn:hover, .bubble-action-btn.active { 
      background: #EEEDFE; 
      color: #534AB7; 
      border-color: rgba(83, 74, 183, 0.3); 
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.1);
    }
    .bubble-action-btn svg { width: 14px; height: 14px; }
    .bubble-action-btn.pill-btn { border-radius: 20px; }

    /* Attachments */
    .comm-attachments { display:flex; flex-direction:column; gap:8px; margin-top:10px; }
    .att-item { width:100%; }
    .att-img-preview { 
      display:block; 
      border-radius:12px; 
      overflow:hidden; 
      border:1px solid rgba(0,0,0,0.05); 
      max-width:320px; 
      background: #f8fafc;
      transition: transform 0.2s ease;
    }
    .att-img-preview:hover { transform: scale(1.02); }
    .att-img-preview img { 
      width:100%; 
      height:100%; 
      max-height:320px; 
      display:block; 
      object-fit:cover; 
    }
    
    .att-file-card { 
      display:flex; align-items:center; gap:12px; padding:12px; 
      background: white; border:1px solid rgba(0,0,0,0.05); 
      border-radius:12px; text-decoration:none; color:inherit; 
      max-width: 400px; 
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .comm-message.mine .att-file-card {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
    }
    .att-icon { 
      width:36px; height:36px; display:flex; align-items:center; justify-content:center; 
      background:white; color:#534AB7; border-radius:8px; 
    }
    .att-icon svg { width:20px; height:20px; }
    .att-name { font-size:14px; font-weight:700; color:#1e1b4b; }
    .att-meta { font-size:11px; color:var(--text-tertiary); }

    /* Thread Pill */
    .comm-thread-summary { 
      margin-top: 10px; 
      display: flex; 
      align-items: center; 
      justify-content: space-between; 
      padding: 10px 16px; 
      background: #f8fafc; 
      border: 1.5px solid #edf2f7; 
      border-radius: 12px; 
      cursor: pointer; 
      max-width: fit-content; 
      gap: 20px; 
      transition: all 0.2s; 
    }
    .comm-thread-summary:hover { 
      background: #EEEDFE; 
      border-color: rgba(83, 74, 183, 0.2); 
    }
    .thread-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #534AB7; }
    .thread-meta svg { width: 16px; height: 16px; }
    .separator { color: #cbd5e1; }
    .last-reply { color: var(--text-tertiary); font-weight: 600; font-size: 12px; }
    .chevron { width: 16px; height: 16px; color: var(--text-tertiary); opacity: 0.6; }

    /* CTX & Emoji */
    .wa-emoji-picker { 
      position:absolute; 
      bottom:calc(100% + 12px); 
      left:0; 
      width:320px; 
      background:rgba(255,255,255,0.98); 
      backdrop-filter:blur(20px); 
      border:1px solid rgba(83,74,183,0.15); 
      border-radius:20px; 
      box-shadow:0 20px 50px rgba(15,23,42,0.2); 
      z-index:1000; 
      overflow:hidden;
      animation: pickerFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .comm-message.mine .wa-emoji-picker { left:auto; right:0; }
    
    @keyframes pickerFadeIn {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .emoji-tabs { display:flex; border-bottom:1px solid rgba(83,74,183,0.1); padding:8px 12px 0; gap:4px; background:rgba(83,74,183,0.02); }
    .emoji-tab { background:none; border:none; font-size:20px; padding:8px 12px; cursor:pointer; border-radius:10px 10px 0 0; border-bottom:3px solid transparent; transition:all 0.2s; }
    .emoji-tab:hover { background:rgba(83,74,183,0.05); }
    .emoji-tab.active { border-bottom-color:#534AB7; background:white; color:#534AB7; }
    .emoji-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:4px; padding:12px; max-height:240px; overflow-y:auto; }
    .emoji-cell { background:none; border:none; font-size:22px; padding:6px; cursor:pointer; border-radius:10px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; }
    .emoji-cell:hover { background:#EEEDFE; transform:scale(1.25); }

    /* Context Menu Popup */
    .wa-ctx-menu { 
      position: absolute; 
      bottom: 48px; 
      right: 0; 
      background: white; 
      border: 1px solid rgba(83, 74, 183, 0.15); 
      border-radius: 14px; 
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15); 
      padding: 8px; 
      min-width: 220px; 
      z-index: 100; 
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: menuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes menuFadeIn {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .wa-ctx-menu button { 
      display: flex; 
      align-items: center; 
      gap: 12px; 
      width: 100%; 
      background: none; 
      border: none; 
      padding: 10px 14px; 
      font-size: 13.5px; 
      font-weight: 600; 
      color: #1e1b4b; 
      cursor: pointer; 
      border-radius: 10px; 
      transition: all 0.15s ease;
      text-align: left;
    }
    .wa-ctx-menu button:hover { background: #f8fafc; color: #534AB7; }
    .wa-ctx-menu button.ctx-danger { color: #ef4444; }
    .wa-ctx-menu button.ctx-danger:hover { background: #fef2f2; }
    .wa-ctx-menu button svg { 
      width: 16px !important; 
      height: 16px !important; 
      flex-shrink: 0;
      opacity: 0.8;
    }

    /* Inline Edit Mode */
    .inline-edit { margin-top:12px; display:flex; flex-direction:column; gap:12px; }
    .edit-textarea { width:100%; min-height:80px; padding:12px; border-radius:12px; border:1.5px solid rgba(83,74,183,0.2); background:white; color:#1e1b4b; font-family:inherit; font-size:15px; line-height:1.5; resize:vertical; transition:all .2s; outline:none; }
    .edit-textarea:focus { border-color:#534AB7; box-shadow:0 0 0 4px rgba(83,74,183,0.1); }
    .comm-message.mine .edit-textarea { background:rgba(255,255,255,0.95); }
    
    .edit-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
    .edit-save, .edit-cancel { 
      padding:8px 18px; 
      border-radius:12px; 
      font-size:13px; 
      font-weight:700; 
      cursor:pointer; 
      transition:all .2s; 
      border:none; 
    }
    
    .edit-save { 
      background:#534AB7; 
      color:white; 
      box-shadow:0 4px 12px rgba(83,74,183,0.25); 
    }
    .edit-save:hover { background:#4338ca; transform:translateY(-1px); }
    
    .edit-cancel { 
      background: rgba(148, 163, 184, 0.1); 
      color: #64748b; 
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .edit-cancel:hover { 
      background: rgba(148, 163, 184, 0.2); 
      color: #1e1b4b; 
    }

    /* Theme-specific overrides */
    .comm-message.mine .edit-save { 
      background: #534AB7; 
      color: white; 
      box-shadow: 0 4px 12px rgba(83, 74, 183, 0.25); 
    }
    
    .comm-message.mine .edit-cancel { 
      background: white; 
      color: #64748b; 
      border: 1px solid #e2e8f0;
    }
    .comm-message.mine .edit-cancel:hover { 
      background: #f8fafc; 
      color: #1e1b4b; 
    }

    .edited-indicator { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; padding:2px 6px; border-radius:4px; background:#e0e7ff; color:#4338ca; margin-left:4px; }
    .comm-message.mine .edited-indicator { background:rgba(255,255,255,0.25); color:white; }

    /* Thread Indicator */
    .comm-message-thread { 
      margin-top: 8px; 
      display: flex; 
      align-items: center; 
      justify-content: space-between; 
      padding: 10px 14px; 
      background: #EEEDFE; 
      border-radius: 12px; 
      cursor: pointer; 
      transition: all 0.2s; 
      border: 1px solid rgba(83, 74, 183, 0.1); 
    }
    .comm-message-thread:hover { 
      background: #e0e7ff; 
      border-color: rgba(83, 74, 183, 0.2); 
    }
    
    .thread-info { display:flex; align-items:center; gap:12px; }
    .reply-count { font-size:12px; font-weight:800; color:#3C3489; }
    .last-reply { font-size:11px; color:#64748b; font-weight: 600; }
    
    .thread-action { font-size:11px; font-weight:700; color:#534AB7; text-transform:uppercase; letter-spacing:0.05em; opacity:0.8; }
    .comm-message-thread:hover .thread-action { opacity:1; }

    .reaction-trigger-wrapper {
      position: relative;
    }

    .wa-quick-reactions {
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 8px;
      background: white;
      border: 1px solid rgba(83, 74, 183, 0.1);
      border-radius: 20px;
      padding: 4px;
      display: flex;
      gap: 2px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      z-index: 1000;
      animation: popIn 0.2s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes popIn {
      from { opacity: 0; transform: scale(0.8) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .quick-emoji {
      width: 32px;
      height: 32px;
      border: none;
      background: none;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s ease;
    }

    .quick-emoji:hover {
      background: #f5f3ff;
      transform: scale(1.2);
    }

    .quick-plus {
      width: 32px;
      height: 32px;
      border: none;
      background: #f8fafc;
      color: #64748b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s ease;
    }

    .quick-plus:hover {
      background: #f1f5f9;
      color: #534AB7;
    }

    .quick-plus svg {
      width: 16px;
      height: 16px;
    }
  `]
})
export class MessageBubbleComponent {
  /** Injected API Service */
  private readonly api = inject(CommunicationApiService);
  private readonly sanitizer = inject(DomSanitizer);
  
  @Input({ required: true }) message!: MessageModel;
  @Input() currentUserId: number | null = null;
  @Output() retry = new EventEmitter<MessageModel>();
  @Output() deleteFailed = new EventEmitter<MessageModel>();
  @Output() toggleReaction = new EventEmitter<{ message: MessageModel; emoji: string }>();
  @Output() editMessage = new EventEmitter<{ message: MessageModel; body: string }>();
  @Output() deleteForEveryone = new EventEmitter<MessageModel>();
  @Output() deleteForMe = new EventEmitter<MessageModel>();
  @Output() replyThread = new EventEmitter<MessageModel>();
  @Output() pinMessage = new EventEmitter<MessageModel>();

  readonly quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  readonly emojiCategories = EMOJI_CATEGORIES;
  activeTab = signal(0);
  showQuickReactions = signal(false);
  showEmojiPicker = signal(false);
  showCtxMenu = signal(false);
  editing = signal(false);
  editDraft = '';

  @HostListener('document:click') onDocClick() { this.closeAllMenus(); }

  get isMine(): boolean {
    return this.currentUserId !== null && this.message.sender.id === this.currentUserId;
  }

  get isPinned(): boolean {
    return !!this.message.pinnedAt;
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  isImage(contentType: string): boolean {
    return !!contentType && contentType.toLowerCase().startsWith('image/');
  }

  getDownloadUrl(id: string): string {
    return this.api.getDownloadUrl(id);
  }

  formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  toggleQuickReactions(event: Event): void {
    event.stopPropagation();
    this.showQuickReactions.update(v => !v);
    this.showEmojiPicker.set(false);
    this.showCtxMenu.set(false);
  }

  openFullPicker(event: Event): void {
    event.stopPropagation();
    this.showQuickReactions.set(false);
    this.showEmojiPicker.set(true);
  }

  toggleEmojiPicker(event: Event): void {
    event.stopPropagation();
    this.showEmojiPicker.update(v => !v);
    this.showQuickReactions.set(false);
    this.showCtxMenu.set(false);
  }

  pickEmoji(emoji: string): void {
    this.toggleReaction.emit({ message: this.message, emoji });
    this.showEmojiPicker.set(false);
    this.showQuickReactions.set(false);
  }

  toggleContextMenu(event: Event): void {
    event.stopPropagation();
    this.showCtxMenu.update(v => !v);
    this.showEmojiPicker.set(false);
  }

  onCtxReply(): void { this.closeAllMenus(); this.replyThread.emit(this.message); }

  onCtxEdit(): void {
    this.closeAllMenus();
    this.editing.set(true);
    this.editDraft = this.message.body ?? '';
  }

  onCtxPin(event: Event): void {
    event.stopPropagation();
    this.pinMessage.emit(this.message);
  }

  saveEdit(event: Event): void {
    event.preventDefault();
    const trimmed = this.editDraft.trim();
    if (trimmed && trimmed !== (this.message.body ?? '')) {
      this.editMessage.emit({ message: this.message, body: trimmed });
    }
    this.editing.set(false);
  }

  cancelEdit(): void { this.editing.set(false); this.editDraft = ''; }

  onCtxDeleteAll(): void { this.closeAllMenus(); this.deleteForEveryone.emit(this.message); }
  onCtxDeleteMe(): void { this.closeAllMenus(); this.deleteForMe.emit(this.message); }

  private closeAllMenus(): void { 
    this.showCtxMenu.set(false); 
    this.showEmojiPicker.set(false); 
    this.showQuickReactions.set(false);
  }

  renderContent(content: string | null | undefined): SafeHtml {
    if (!content) return '';
    
    // Basic markdown parsing
    let html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // List: - item
    const lines = html.split('\n');
    let inList = false;
    let result = [];

    for (let line of lines) {
      if (line.trim().startsWith('- ')) {
        if (!inList) {
          result.push('<ul>');
          inList = true;
        }
        result.push(`<li>${line.trim().substring(2)}</li>`);
      } else {
        if (inList) {
          result.push('</ul>');
          inList = false;
        }
        result.push(line);
      }
    }
    if (inList) result.push('</ul>');
    
    html = result.join('\n');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
