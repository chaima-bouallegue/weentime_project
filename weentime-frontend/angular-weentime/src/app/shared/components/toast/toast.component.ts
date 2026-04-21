import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="'toast-' + toast.type">
          <lucide-icon
            [name]="getIcon(toast.type)"
            size="18">
          </lucide-icon>
          <span class="toast-msg">{{ toast.message }}</span>
          <button (click)="toastService.dismiss(toast.id)" class="toast-close">
            <lucide-icon name="x" size="14"></lucide-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 380px;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 600;
      font-family: 'Plus Jakarta Sans', sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      animation: toast-in 0.35s cubic-bezier(0.16,1,0.3,1);
      backdrop-filter: blur(8px);
      border: 1px solid transparent;
    }

    @keyframes toast-in {
      from { opacity: 0; transform: translateY(20px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .toast-success {
      background: #ecfdf5;
      color: #065f46;
      border-color: #a7f3d0;
    }
    :host-context(.dark) .toast-success {
      background: rgba(16,185,129,0.15);
      color: #6ee7b7;
      border-color: rgba(16,185,129,0.3);
    }

    .toast-error {
      background: #fef2f2;
      color: #991b1b;
      border-color: #fecaca;
    }
    :host-context(.dark) .toast-error {
      background: rgba(239,68,68,0.15);
      color: #fca5a5;
      border-color: rgba(239,68,68,0.3);
    }

    .toast-warning {
      background: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }
    :host-context(.dark) .toast-warning {
      background: rgba(245,158,11,0.15);
      color: #fcd34d;
      border-color: rgba(245,158,11,0.3);
    }

    .toast-info {
      background: #eef2ff;
      color: #3730a3;
      border-color: #c7d2fe;
    }
    :host-context(.dark) .toast-info {
      background: rgba(99,102,241,0.15);
      color: #a5b4fc;
      border-color: rgba(99,102,241,0.3);
    }

    .toast-msg { flex: 1; }

    .toast-close {
      background: none;
      border: none;
      cursor: pointer;
      color: inherit;
      opacity: 0.5;
      transition: opacity 0.15s;
      padding: 2px;
      display: flex;
    }
    .toast-close:hover { opacity: 1; }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  getIcon(type: string): string {
    switch(type) {
      case 'success': return 'check-circle';
      case 'error': return 'x-circle';
      case 'warning': return 'alert-triangle';
      default: return 'info';
    }
  }
}
