import { 
  ChangeDetectionStrategy, 
  Component, 
  EventEmitter, 
  Input, 
  Output, 
  HostListener, 
  inject 
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageModel, AttachmentModel } from '../../models/communication.models';
import { ReactionBarComponent } from '../reaction-bar/reaction-bar.component';
import { AuthSrcDirective } from '../../../../shared/directives/auth-src.directive';
import { CommunicationApiService } from '../../services/communication-api.service';

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  { label: 'Smileys', icon: '😀', emojis: ['😀','😃','😄','😁','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😋','😛','🤪','🤨','🧐','🤓','😎','🤠','🥳','🤗','🤭','😐','😑','😶','🙄','😏','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😤','😠','😡','🤬'] },
  { label: 'Gestes', icon: '👋', emojis: ['👍','👎','👊','✊','🤛','🤜','👏','🙌','🤝','🤲','👐','🙏','💪','✌️','🤟','🤘','👌','🤌','👋','🤙','👆','👇','👉','👈','🫶','🫡'] },
  { label: 'Cœurs', icon: '❤️', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','🔥','⭐','✨','💯','🎉','🎊','💎','🏆','🥇'] },
];

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, ReactionBarComponent, AuthSrcDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="comm-message" [class.mine]="isMine">
      <div class="comm-message-avatar" *ngIf="!isMine">
        <img *ngIf="message.sender.avatarUrl" [src]="message.sender.avatarUrl" [alt]="message.sender.fullName">
        <div *ngIf="!message.sender.avatarUrl" class="avatar-initials">
          {{ getInitials(message.sender.fullName) }}
        </div>
      </div>

      <div class="comm-message-card-wrapper">
        <!-- Quick reactions bar on hover -->
        <div class="wa-reaction-picker" *ngIf="message.status !== 'DELETED' && !message.localState && !editing">
          <button type="button" class="wa-emoji-btn" *ngFor="let e of quickEmojis" (click)="toggleReaction.emit({ message, emoji: e })">{{ e }}</button>
          <button type="button" class="wa-emoji-btn wa-plus-btn" (click)="toggleEmojiPicker($event)">+</button>
        </div>

        <!-- Full emoji picker popup -->
        <div class="wa-emoji-picker" *ngIf="showEmojiPicker" (click)="$event.stopPropagation()">
          <div class="emoji-tabs">
            <button *ngFor="let cat of emojiCategories; let i = index" type="button"
                    class="emoji-tab" [class.active]="activeTab === i"
                    (click)="activeTab = i">{{ cat.icon }}</button>
          </div>
          <div class="emoji-grid">
            <button type="button" class="emoji-cell" *ngFor="let e of emojiCategories[activeTab].emojis"
                    (click)="pickEmoji(e)">{{ e }}</button>
          </div>
        </div>

        <!-- Context menu button -->
        <button type="button" class="wa-ctx-btn"
                *ngIf="message.status !== 'DELETED' && !message.localState && !editing"
                (click)="toggleContextMenu($event)">⋮</button>

        <!-- Context dropdown -->
        <div class="wa-ctx-menu" *ngIf="showCtxMenu" (click)="$event.stopPropagation()">
          <button type="button" (click)="onCtxReply()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
            Répondre
          </button>
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

        <div class="comm-message-card" [class.editing-mode]="editing">
          <header class="comm-message-head">
            <div class="sender-info">
              <strong *ngIf="!isMine">{{ message.sender.fullName }}</strong>
              <span class="timestamp">{{ message.createdAt | date: 'HH:mm' }}</span>
              <span *ngIf="message.editedAt && message.status !== 'DELETED'" class="edited-indicator">modifié</span>
            </div>
            <div class="status-indicators">
              <small *ngIf="message.localState === 'sending'" class="sending-badge">
                <span class="dot"></span> Envoi...
              </small>
              <small *ngIf="message.localState === 'failed'" class="failed-badge">Échec</small>
            </div>
          </header>

          <!-- Normal body -->
          <p class="comm-message-body" *ngIf="!editing && message.status !== 'DELETED'">
            {{ message.body }}
          </p>
          <p class="comm-message-body deleted" *ngIf="message.status === 'DELETED'">
            🚫 Ce message a été supprimé.
          </p>

          <!-- Attachments Section -->
          <div class="comm-attachments" *ngIf="message.status !== 'DELETED' && message.attachments.length">
            <div *ngFor="let att of message.attachments" class="att-item" [class.is-image]="isImage(att.contentType)">
              <!-- Image Thumbnail -->
              <a *ngIf="isImage(att.contentType)" [href]="getDownloadUrl(att.id)" target="_blank" class="att-img-preview">
                <img [authSrc]="getDownloadUrl(att.id)" [alt]="att.originalName">
              </a>

              <!-- File Card -->
              <a *ngIf="!isImage(att.contentType)" [href]="getDownloadUrl(att.id)" target="_blank" class="att-file-card">
                <div class="att-icon">
                   <svg *ngIf="isPdf(att.contentType)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="12" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
                   <svg *ngIf="!isPdf(att.contentType)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="att-info">
                  <span class="att-name">{{ att.originalName }}</span>
                  <span class="att-meta">{{ formatSize(att.fileSize) }}</span>
                </div>
                <div class="att-download">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </div>
              </a>
            </div>
          </div>

          <!-- Inline edit mode -->
          <div class="inline-edit" *ngIf="editing">
            <textarea class="edit-textarea" [(ngModel)]="editDraft"
                      (keydown.enter)="saveEdit($event)"
                      (keydown.escape)="cancelEdit()"></textarea>
            <div class="edit-actions">
              <button type="button" class="edit-save" (click)="saveEdit($event)">Enregistrer</button>
              <button type="button" class="edit-cancel" (click)="cancelEdit()">Annuler</button>
            </div>
          </div>

          <app-reaction-bar
            *ngIf="message.status !== 'DELETED'"
            [reactions]="message.reactions"
            [disabled]="message.localState === 'sending'"
            (toggle)="toggleReaction.emit({ message, emoji: $event })">
          </app-reaction-bar>

          <!-- Thread Indicator -->
          <div class="comm-message-thread" *ngIf="message.thread && message.thread.replyCount > 0" (click)="replyThread.emit(message)">
             <div class="thread-info">
               <span class="reply-count">{{ message.thread.replyCount }} {{ message.thread.replyCount > 1 ? 'réponses' : 'réponse' }}</span>
               <span class="last-reply" *ngIf="message.thread.lastReplyAt">Dernière réponse {{ message.thread.lastReplyAt | date:'HH:mm' }}</span>
             </div>
             <div class="thread-action">Ouvrir le fil</div>
          </div>

          <div *ngIf="message.localState === 'failed'" class="comm-message-retry">
            <button type="button" class="retry-btn" (click)="retry.emit(message)">Réessayer</button>
            <button type="button" class="cancel-btn" (click)="deleteFailed.emit(message)">Annuler</button>
          </div>
        </div>
      </div>

      <div class="comm-message-avatar" *ngIf="isMine">
        <img *ngIf="message.sender.avatarUrl" [src]="message.sender.avatarUrl" [alt]="message.sender.fullName">
        <div *ngIf="!message.sender.avatarUrl" class="avatar-initials mine">
          {{ getInitials(message.sender.fullName) }}
        </div>
      </div>
    </article>
  `,
  styles: [`
    .comm-message { display:flex; justify-content:flex-start; gap:12px; margin-bottom:24px; padding:0 20px; }
    .comm-message.mine { justify-content:flex-end; }
    .comm-message-avatar { flex-shrink:0; width:36px; height:36px; margin-top:4px; }
    .comm-message-avatar img { width:100%; height:100%; border-radius:12px; object-fit:cover; }
    .avatar-initials { width:100%; height:100%; border-radius:12px; background:#f1f5f9; color:#64748b; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; border:1px solid rgba(148,163,184,0.2); }
    .avatar-initials.mine { background:#EEEDFE; color:#534AB7; border-color:rgba(83,74,183,0.2); }
    .comm-message-card-wrapper { position:relative; max-width:min(600px,85%); }

    /* Quick reaction bar */
    .wa-reaction-picker { position:absolute; top:-36px; left:0; background:rgba(255,255,255,0.92); backdrop-filter:blur(12px); border:1px solid rgba(83,74,183,0.12); border-radius:20px; padding:4px 6px; display:flex; gap:4px; box-shadow:0 4px 20px rgba(15,23,42,0.1); opacity:0; transform:translateY(8px) scale(0.92); pointer-events:none; transition:all .25s cubic-bezier(.175,.885,.32,1.275); z-index:50; }
    .comm-message.mine .wa-reaction-picker { left:auto; right:0; }
    .comm-message-card-wrapper:hover .wa-reaction-picker { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
    .wa-emoji-btn { background:none; border:none; font-size:18px; padding:4px; cursor:pointer; border-radius:50%; transition:all .2s; line-height:1; }
    .wa-emoji-btn:hover { background:rgba(83,74,183,0.1); transform:scale(1.25); }
    .wa-plus-btn { font-size:16px; font-weight:700; color:#534AB7; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:1px dashed rgba(83,74,183,0.3); border-radius:50%; }

    /* Card */
    .comm-message-card { padding:14px 18px; border-radius:20px; background:white; box-shadow:0 4px 12px rgba(15,23,42,0.03); border:1px solid rgba(148,163,184,0.12); position:relative; transition:border-color .2s, box-shadow .2s; }
    .comm-message.mine .comm-message-card { background:#534AB7; color:white; border:none; box-shadow:0 8px 24px rgba(83,74,183,0.25); }
    .comm-message-card.editing-mode { border-color:#534AB7; box-shadow:0 0 0 3px rgba(83,74,183,0.15); }
    .comm-message-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; }
    .sender-info { display:flex; align-items:center; gap:8px; }
    .sender-info strong { font-size:14px; color:#1e1b4b; }
    .timestamp { font-size:11px; color:#94a3b8; font-weight:500; }
    .comm-message.mine .timestamp { color:rgba(255,255,255,0.7); }
    .comm-message-body { margin:0; font-size:15px; line-height:1.6; white-space:pre-wrap; word-break:break-word; }
    .comm-message-body.deleted { color:#94a3b8; font-style:italic; }
    .comm-message.mine .comm-message-body.deleted { color:rgba(255,255,255,0.6); }

    /* Attachments */
    .comm-attachments { display:flex; flex-direction:column; gap:8px; margin-top:10px; }
    .att-item { width:100%; }
    
    .att-img-preview { display:block; border-radius:12px; overflow:hidden; border:1px solid rgba(148,163,184,0.1); max-width:300px; transition:transform .2s; }
    .att-img-preview:hover { transform:scale(1.02); }
    .att-img-preview img { width:100%; height:auto; display:block; max-height:400px; object-fit:contain; background:#f8fafc; }

    .att-file-card { display:flex; align-items:center; gap:12px; padding:10px 14px; background:#f8fafc; border:1px solid rgba(148,163,184,0.15); border-radius:12px; text-decoration:none; color:inherit; transition:all .2s; }
    .comm-message.mine .att-file-card { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.2); }
    .att-file-card:hover { background:#f1f5f9; border-color:#534AB7; }
    .comm-message.mine .att-file-card:hover { background:rgba(255,255,255,0.15); }

    .att-icon { width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:white; color:#534AB7; border-radius:8px; flex-shrink:0; }
    .comm-message.mine .att-icon { color:white; background:rgba(255,255,255,0.2); }
    .att-icon svg { width:18px; height:18px; }

    .att-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .att-name { font-size:13px; font-weight:700; color:#1e1b4b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .comm-message.mine .att-name { color:white; }
    .att-meta { font-size:11px; color:#64748b; }
    .comm-message.mine .att-meta { color:rgba(255,255,255,0.7); }

    .att-download { color:#94a3b8; opacity:0; transition:all .2s; }
    .att-file-card:hover .att-download { opacity:1; }
    .comm-message.mine .att-download { color:rgba(255,255,255,0.7); }
    .att-download svg { width:16px; height:16px; }

    /* CTX & Emoji */
    .wa-ctx-btn { position:absolute; top:4px; right:4px; background:rgba(255,255,255,0.9); backdrop-filter:blur(4px); border:1px solid rgba(148,163,184,0.15); width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:700; color:#64748b; cursor:pointer; opacity:0; transition:all .2s; z-index:10; }
    .comm-message.mine .wa-ctx-btn { right:auto; left:4px; }
    .comm-message-card-wrapper:hover .wa-ctx-btn { opacity:1; }
    .wa-ctx-menu { position:absolute; top:36px; left:0; background:white; border:1px solid rgba(83,74,183,0.12); border-radius:16px; box-shadow:0 12px 48px rgba(15,23,42,0.2); padding:8px; min-width:200px; z-index:1000; animation:ctxFadeIn .2s ease; overflow-y:auto; max-height:280px; }
    .comm-message.mine .wa-ctx-menu { left:auto; right:0; }
    .wa-ctx-menu button { display:flex; align-items:center; gap:12px; width:100%; background:none; border:none; padding:10px 16px; font-size:14px; font-weight:600; color:#1e1b4b; cursor:pointer; border-radius:12px; transition:all .2s; text-align:left; }
    .wa-ctx-menu button:hover { background:#f5f3ff; color:#534AB7; }
    .wa-ctx-menu button.ctx-danger { color:#ef4444; }
    .wa-ctx-menu button.ctx-danger:hover { background:#fef2f2; }
    .wa-ctx-menu button svg { width:18px; height:18px; opacity:0.8; }

    /* Emoji picker */
    .wa-emoji-picker { position:absolute; bottom:calc(100% + 8px); left:0; width:300px; background:rgba(255,255,255,0.97); backdrop-filter:blur(16px); border:1px solid rgba(83,74,183,0.15); border-radius:16px; box-shadow:0 12px 40px rgba(15,23,42,0.15); z-index:200; overflow:hidden; }
    .comm-message.mine .wa-emoji-picker { left:auto; right:0; }
    .emoji-tabs { display:flex; border-bottom:1px solid rgba(83,74,183,0.1); padding:6px 8px 0; gap:2px; }
    .emoji-tab { background:none; border:none; font-size:18px; padding:6px 10px; cursor:pointer; border-radius:8px 8px 0 0; border-bottom:2px solid transparent; }
    .emoji-tab.active { border-bottom-color:#534AB7; background:#EEEDFE; }
    .emoji-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:2px; padding:8px; max-height:200px; overflow-y:auto; }
    .emoji-cell { background:none; border:none; font-size:20px; padding:4px; cursor:pointer; border-radius:6px; }
    .emoji-cell:hover { background:#EEEDFE; transform:scale(1.2); }

    /* Inline Edit Mode */
    .inline-edit { margin-top:12px; display:flex; flex-direction:column; gap:12px; }
    .edit-textarea { width:100%; min-height:80px; padding:12px; border-radius:12px; border:1.5px solid rgba(83,74,183,0.2); background:white; color:#1e1b4b; font-family:inherit; font-size:15px; line-height:1.5; resize:vertical; transition:all .2s; outline:none; }
    .edit-textarea:focus { border-color:#534AB7; box-shadow:0 0 0 4px rgba(83,74,183,0.1); }
    .comm-message.mine .edit-textarea { background:rgba(255,255,255,0.95); }
    
    .edit-actions { display:flex; justify-content:flex-end; gap:8px; }
    .edit-save, .edit-cancel { padding:8px 16px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; transition:all .2s; border:none; }
    
    .edit-save { background:#534AB7; color:white; box-shadow:0 4px 12px rgba(83,74,183,0.2); }
    .edit-save:hover { background:#4338ca; transform:translateY(-1px); }
    .comm-message.mine .edit-save { background:white; color:#534AB7; box-shadow:0 4px 12px rgba(0,0,0,0.1); }
    .comm-message.mine .edit-save:hover { background:#f8fafc; }
    
    .edit-cancel { background:rgba(148,163,184,0.1); color:#64748b; }
    .edit-cancel:hover { background:rgba(148,163,184,0.2); color:#1e1b4b; }
    .comm-message.mine .edit-cancel { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.9); }
    .comm-message.mine .edit-cancel:hover { background:rgba(255,255,255,0.2); }

    .edited-indicator { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; padding:2px 6px; border-radius:4px; background:rgba(83,74,183,0.1); color:#534AB7; margin-left:4px; }
    .comm-message.mine .edited-indicator { background:rgba(255,255,255,0.2); color:white; }

    /* Thread Indicator */
    .comm-message-thread { margin-top:8px; display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:rgba(83,74,183,0.05); border-radius:10px; cursor:pointer; transition:all .2s; border:1px solid transparent; }
    .comm-message-thread:hover { background:rgba(83,74,183,0.08); border-color:rgba(83,74,183,0.1); }
    .comm-message.mine .comm-message-thread { background:rgba(255,255,255,0.15); }
    .comm-message.mine .comm-message-thread:hover { background:rgba(255,255,255,0.25); }
    
    .thread-info { display:flex; align-items:center; gap:12px; }
    .reply-count { font-size:12px; font-weight:700; color:#534AB7; }
    .comm-message.mine .reply-count { color:white; }
    
    .last-reply { font-size:11px; color:#64748b; }
    .comm-message.mine .last-reply { color:rgba(255,255,255,0.8); }
    
    .thread-action { font-size:11px; font-weight:700; color:#534AB7; text-transform:uppercase; letter-spacing:0.05em; opacity:0; transition:all .2s; }
    .comm-message-thread:hover .thread-action { opacity:1; }
    .comm-message.mine .thread-action { color:white; }
  `]
})
export class MessageBubbleComponent {
  /** Injected API Service */
  private readonly api = inject(CommunicationApiService);
  
  @Input({ required: true }) message!: MessageModel;
  @Input() currentUserId: number | null = null;
  @Output() retry = new EventEmitter<MessageModel>();
  @Output() deleteFailed = new EventEmitter<MessageModel>();
  @Output() toggleReaction = new EventEmitter<{ message: MessageModel; emoji: string }>();
  @Output() editMessage = new EventEmitter<{ message: MessageModel; body: string }>();
  @Output() deleteForEveryone = new EventEmitter<MessageModel>();
  @Output() deleteForMe = new EventEmitter<MessageModel>();
  @Output() replyThread = new EventEmitter<MessageModel>();

  readonly quickEmojis = ['👍','❤️','😂','😮','😢','🙏'];
  readonly emojiCategories = EMOJI_CATEGORIES;
  activeTab = 0;
  showEmojiPicker = false;
  showCtxMenu = false;
  editing = false;
  editDraft = '';

  @HostListener('document:click') onDocClick() { this.closeAllMenus(); }

  get isMine(): boolean {
    return this.currentUserId !== null && this.message.sender.id === this.currentUserId;
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.split(' ');
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  isImage(contentType: string): boolean {
    return !!contentType && contentType.toLowerCase().startsWith('image/');
  }

  isPdf(contentType: string): boolean {
    return !!contentType && contentType.toLowerCase().includes('pdf');
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

  toggleEmojiPicker(event: Event): void {
    event.stopPropagation();
    this.showEmojiPicker = !this.showEmojiPicker;
    this.showCtxMenu = false;
  }

  pickEmoji(emoji: string): void {
    this.toggleReaction.emit({ message: this.message, emoji });
    this.showEmojiPicker = false;
  }

  toggleContextMenu(event: Event): void {
    event.stopPropagation();
    this.showCtxMenu = !this.showCtxMenu;
    this.showEmojiPicker = false;
  }

  onCtxReply(): void { this.closeAllMenus(); this.replyThread.emit(this.message); }

  onCtxEdit(): void {
    this.closeAllMenus();
    this.editing = true;
    this.editDraft = this.message.body ?? '';
  }

  saveEdit(event: Event): void {
    event.preventDefault();
    const trimmed = this.editDraft.trim();
    if (trimmed && trimmed !== (this.message.body ?? '')) {
      this.editMessage.emit({ message: this.message, body: trimmed });
    }
    this.editing = false;
  }

  cancelEdit(): void { this.editing = false; this.editDraft = ''; }

  onCtxDeleteAll(): void { this.closeAllMenus(); this.deleteForEveryone.emit(this.message); }
  onCtxDeleteMe(): void { this.closeAllMenus(); this.deleteForMe.emit(this.message); }

  private closeAllMenus(): void { this.showCtxMenu = false; this.showEmojiPicker = false; }
}
