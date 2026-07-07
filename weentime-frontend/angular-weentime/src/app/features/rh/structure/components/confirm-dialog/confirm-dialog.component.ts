import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="confirm-card">
      <div class="confirm-icon" [class.danger]="type === 'danger'" [class.warning]="type === 'warning'">
        <lucide-icon [name]="iconName" size="28"></lucide-icon>
      </div>
      <h3 class="confirm-title">{{ title }}</h3>
      <p class="confirm-message">{{ message }}</p>
      @if (extraMessage) {
        <p class="confirm-extra">{{ extraMessage }}</p>
      }
      <div class="confirm-actions">
        <button class="btn-ghost" (click)="close.emit()" [disabled]="isProcessing">Annuler</button>
        <button class="btn-danger" (click)="confirm.emit()" [disabled]="isProcessing">
          @if (isProcessing) {
            <lucide-icon name="loader-2" size="16" class="animate-spin"></lucide-icon>
          }
          {{ confirmText }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .confirm-card {
      max-width: 400px;
      width: 90vw;
      background: white;
      border-radius: 24px;
      padding: 32px;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.3);
    }
    :host-context(.dark) .confirm-card { background: #0f172a; }
    .confirm-icon {
      width: 48px; height: 48px;
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .confirm-icon.danger { background: #fef2f2; color: #ef4444; }
    .confirm-icon.warning { background: #fffbeb; color: #f59e0b; }
    :host-context(.dark) .confirm-icon.danger { background: rgba(239,68,68,0.1); }
    :host-context(.dark) .confirm-icon.warning { background: rgba(245,158,11,0.1); }
    .confirm-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 8px; }
    :host-context(.dark) .confirm-title { color: white; }
    .confirm-message { font-size: 14px; color: #64748b; font-weight: 500; margin: 0 0 4px; line-height: 1.5; }
    .confirm-extra {
      font-size: 12px; color: #ef4444; font-weight: 700;
      background: #fef2f2; padding: 12px; border-radius: 12px; margin: 16px 0;
    }
    :host-context(.dark) .confirm-extra { background: rgba(239,68,68,0.1); }
    .confirm-actions {
      display: flex; gap: 12px; margin-top: 24px;
    }
    .confirm-actions button { flex: 1; padding: 12px; border-radius: 12px; font-weight: 700; font-size: 14px; transition: all 0.2s; }
    .btn-ghost {
      background: transparent; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer;
    }
    .btn-ghost:hover { background: #f8fafc; }
    :host-context(.dark) .btn-ghost { border-color: #334155; color: #94a3b8; }
    :host-context(.dark) .btn-ghost:hover { background: #1e293b; }
    .btn-danger {
      background: #ef4444; border: none; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .btn-danger:hover:not(:disabled) { background: #dc2626; transform: translateY(-1px); }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `]
})
export class ConfirmDialogComponent {
  @Input() title = '';
  @Input() message = '';
  @Input() confirmText = 'Confirmer';
  @Input() iconName = 'alert-triangle';
  @Input() type: 'danger' | 'warning' = 'danger';
  @Input() isProcessing = false;
  @Input() extraMessage = '';

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
}
