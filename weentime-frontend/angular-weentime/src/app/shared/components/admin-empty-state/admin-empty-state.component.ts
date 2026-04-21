import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-admin-empty-state',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state admin-surface">
      <div class="icon-wrap">
        <lucide-icon [name]="icon()" size="22"></lucide-icon>
      </div>
      <div>
        <h3>{{ title() }}</h3>
        <p>{{ description() }}</p>
      </div>
    </div>
  `,
  styles: [`
    .empty-state {
      display: grid;
      gap: 14px;
      justify-items: center;
      text-align: center;
      padding: 28px;
    }

    .icon-wrap {
      width: 56px;
      height: 56px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: rgba(37, 99, 235, 0.1);
      color: #2563eb;
    }

    h3 {
      margin: 0;
      color: var(--saas-text);
      font-size: 1rem;
      font-weight: 800;
    }

    p {
      margin: 8px 0 0;
      color: var(--saas-muted);
      line-height: 1.6;
    }
  `]
})
export class AdminEmptyStateComponent {
  readonly title = input('No data');
  readonly description = input('Nothing to display for this section yet.');
  readonly icon = input('inbox');
}
