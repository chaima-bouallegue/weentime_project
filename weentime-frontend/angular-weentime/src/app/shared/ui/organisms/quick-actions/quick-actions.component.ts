import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DashboardQuickAction } from '../../models/dashboard-ui.models';
import { UiIconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'ui-quick-actions',
  standalone: true,
  imports: [CommonModule, RouterModule, UiIconComponent],
  template: `
    <section class="quick-actions">
      <header>
        <h3>{{ title }}</h3>
        <p>{{ subtitle }}</p>
      </header>

      <div class="quick-actions__list">
        @for (action of actions; track action.id) {
          @if (action.disabled) {
            <button class="quick-actions__item quick-actions__item--disabled" type="button" disabled>
              <span class="quick-actions__icon"><ui-icon [icon]="action.icon || 'arrow-right'" [size]="16"></ui-icon></span>
              <span>{{ action.label }}</span>
            </button>
          } @else {
            <a [routerLink]="action.route" class="quick-actions__item">
              <span class="quick-actions__icon"><ui-icon [icon]="action.icon || 'arrow-right'" [size]="16"></ui-icon></span>
              <span>{{ action.label }}</span>
            </a>
          }
        }
      </div>
    </section>
  `,
  styles: [`
    .quick-actions {
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: rgba(255,255,255,.78);
      padding: 16px;
      display: grid;
      gap: 14px;
    }

    header h3 {
      margin: 0;
      color: #0f172a;
      font-size: 15px;
      font-weight: 900;
    }

    header p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .quick-actions__list {
      display: grid;
      gap: 8px;
    }

    .quick-actions__item {
      display: grid;
      grid-template-columns: 32px 1fr;
      align-items: center;
      gap: 10px;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, .2);
      padding: 10px 11px;
      text-decoration: none;
      text-align: left;
      color: #0f172a;
      font-size: 12px;
      font-weight: 700;
      background: rgba(255,255,255,.7);
      transition: transform .2s ease, border-color .2s ease;
    }

    .quick-actions__item:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: rgba(99, 102, 241, .36);
    }

    .quick-actions__item--disabled {
      cursor: not-allowed;
      opacity: .52;
    }

    .quick-actions__icon {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      color: #2563eb;
      background: rgba(37, 99, 235, .12);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickActionsComponent {
  @Input() title = 'Actions rapides';
  @Input() subtitle = '';
  @Input() actions: DashboardQuickAction[] = [];
}
