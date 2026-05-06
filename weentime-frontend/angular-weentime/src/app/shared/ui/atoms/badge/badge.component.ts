import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiTone } from '../../models/dashboard-ui.models';

@Component({
  selector: 'ui-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="ui-badge" [class]="toneClass">
      <ng-content></ng-content>
      <span *ngIf="label">{{ label }}</span>
    </span>
  `,
  styles: [`
    .ui-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
      border: 1px solid transparent;
      white-space: nowrap;
    }

    .ui-badge.primary { background: rgba(99, 102, 241, .12); color: #4f46e5; border-color: rgba(99, 102, 241, .22); }
    .ui-badge.info { background: rgba(14, 165, 233, .12); color: #0369a1; border-color: rgba(14, 165, 233, .2); }
    .ui-badge.success { background: rgba(16, 185, 129, .13); color: #047857; border-color: rgba(16, 185, 129, .2); }
    .ui-badge.warning { background: rgba(245, 158, 11, .14); color: #b45309; border-color: rgba(245, 158, 11, .24); }
    .ui-badge.danger { background: rgba(239, 68, 68, .13); color: #b91c1c; border-color: rgba(239, 68, 68, .22); }
    .ui-badge.neutral { background: rgba(148, 163, 184, .14); color: #475569; border-color: rgba(148, 163, 184, .2); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiBadgeComponent {
  @Input() label = '';
  @Input() tone: UiTone = 'neutral';

  get toneClass(): string {
    return this.tone;
  }
}
