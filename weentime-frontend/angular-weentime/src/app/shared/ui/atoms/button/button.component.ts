import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiIconComponent } from '../icon/icon.component';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule, UiIconComponent],
  template: `
    <button
      class="ui-btn"
      [class.ui-btn--primary]="variant === 'primary'"
      [class.ui-btn--secondary]="variant === 'secondary'"
      [class.ui-btn--ghost]="variant === 'ghost'"
      [class.ui-btn--danger]="variant === 'danger'"
      [disabled]="disabled || loading"
      [attr.type]="type"
      [attr.aria-label]="ariaLabel || label"
      (click)="onClick()">
      <ui-icon *ngIf="icon" [icon]="icon" [size]="16"></ui-icon>
      <span>{{ label }}</span>
      <span *ngIf="loading" class="ui-btn__dot"></span>
    </button>
  `,
  styles: [`
    .ui-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition: transform .2s ease, box-shadow .2s ease, background-color .2s ease, color .2s ease;
      text-decoration: none;
      white-space: nowrap;
    }

    .ui-btn:disabled {
      opacity: .6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .ui-btn:not(:disabled):hover {
      transform: translateY(-1px);
    }

    .ui-btn--primary {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #fff;
      box-shadow: 0 10px 26px rgba(37, 99, 235, 0.28);
    }

    .ui-btn--secondary {
      background: rgba(255, 255, 255, 0.78);
      color: #0f172a;
      border: 1px solid rgba(148, 163, 184, .32);
      backdrop-filter: blur(8px);
    }

    .ui-btn--ghost {
      background: rgba(15, 23, 42, 0.04);
      color: #334155;
      border: 1px solid rgba(148, 163, 184, .2);
    }

    .ui-btn--danger {
      background: linear-gradient(135deg, #dc2626, #be123c);
      color: #fff;
      box-shadow: 0 10px 24px rgba(220, 38, 38, 0.3);
    }

    .ui-btn__dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
      opacity: .7;
      animation: pulse .9s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(0.8); opacity: .4; }
      50% { transform: scale(1.2); opacity: 1; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiButtonComponent {
  @Input() label = '';
  @Input() icon: string | any = '';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() ariaLabel = '';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary';
  @Output() pressed = new EventEmitter<void>();

  onClick(): void {
    if (this.disabled || this.loading) {
      return;
    }
    this.pressed.emit();
  }
}
