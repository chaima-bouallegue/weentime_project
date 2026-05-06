import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="comm-composer">
      <div class="comm-composer-meta">
        <span *ngIf="typingLabel">{{ typingLabel }} est en train d'ecrire...</span>
        <span *ngIf="!typingLabel && disabled">L'ecriture est desactivee pour cette conversation.</span>
        <span *ngIf="!typingLabel && !disabled">Entree pour envoyer, Maj+Entree pour une nouvelle ligne.</span>
      </div>

      <textarea
        [(ngModel)]="draft"
        [disabled]="disabled"
        rows="3"
        placeholder="Ecrire un message..."
        (input)="handleInput()"
        (keydown)="handleKeydown($event)"></textarea>

      <div class="comm-composer-actions">
        <button type="button" [disabled]="disabled || !trimmedDraft" (click)="submit()">Envoyer</button>
      </div>
    </footer>
  `,
  styles: [`
    .comm-composer {
      border-top: 1px solid rgba(148, 163, 184, 0.16);
      padding: 18px 24px 22px;
      background: rgba(255, 255, 255, 0.92);
    }

    .comm-composer-meta {
      margin-bottom: 10px;
      color: #64748b;
      font-size: 13px;
    }

    textarea {
      width: 100%;
      resize: none;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 22px;
      padding: 16px 18px;
      font: inherit;
      background: #f8fafc;
      min-height: 84px;
    }

    textarea:focus {
      outline: 2px solid rgba(15, 118, 110, 0.22);
      border-color: rgba(15, 118, 110, 0.4);
    }

    .comm-composer-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 12px;
    }

    button {
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      background: linear-gradient(135deg, #0f766e, #0ea5e9);
      color: white;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  `]
})
export class MessageComposerComponent {
  @Input() disabled = false;
  @Input() typingLabel: string | null = null;
  @Output() submitText = new EventEmitter<string>();
  @Output() typing = new EventEmitter<boolean>();

  draft = '';
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;

  get trimmedDraft(): string {
    return this.draft.trim();
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  handleInput(): void {
    if (this.disabled) {
      return;
    }
    this.typing.emit(true);
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.typingTimeout = setTimeout(() => this.typing.emit(false), 1200);
  }

  submit(): void {
    if (this.disabled || !this.trimmedDraft) {
      return;
    }
    this.submitText.emit(this.trimmedDraft);
    this.typing.emit(false);
    this.draft = '';
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }
}
