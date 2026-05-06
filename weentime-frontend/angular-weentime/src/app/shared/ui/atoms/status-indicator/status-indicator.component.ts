import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiTone } from '../../models/dashboard-ui.models';

@Component({
  selector: 'ui-status-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="ui-status" [class]="tone">
      <span class="ui-status__dot"></span>
      <span>{{ label }}</span>
    </span>
  `,
  styles: [`
    .ui-status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
    }

    .ui-status__dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 16%, transparent);
    }

    .ui-status.success { color: #059669; }
    .ui-status.warning { color: #d97706; }
    .ui-status.danger { color: #dc2626; }
    .ui-status.info { color: #0284c7; }
    .ui-status.primary { color: #4f46e5; }
    .ui-status.neutral { color: #64748b; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiStatusIndicatorComponent {
  @Input() label = '';
  @Input() tone: UiTone = 'neutral';
}
