import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-skeleton',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="skeleton-grid" [style.--columns]="columns()">
      @for (item of items(); track $index) {
        <div class="skeleton-card">
          <span class="skeleton-line wide"></span>
          <span class="skeleton-line medium"></span>
          <span class="skeleton-line short"></span>
        </div>
      }
    </div>
  `,
  styles: [`
    .skeleton-grid {
      --columns: 3;
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
      gap: 16px;
    }

    .skeleton-card {
      display: grid;
      gap: 12px;
      padding: 20px;
      border-radius: 24px;
      border: 1px solid var(--saas-border);
      background: var(--saas-surface);
      box-shadow: var(--saas-shadow);
    }

    .skeleton-line {
      display: block;
      height: 12px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.28), rgba(148, 163, 184, 0.12));
      background-size: 200% 100%;
      animation: shimmer 1.3s linear infinite;
    }

    .wide { width: 74%; height: 14px; }
    .medium { width: 54%; }
    .short { width: 38%; }

    @media (max-width: 900px) {
      .skeleton-grid {
        grid-template-columns: 1fr;
      }
    }

    @keyframes shimmer {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }
  `]
})
export class AdminSkeletonComponent {
  readonly count = input(3);
  readonly columns = input(3);
  readonly items = computed(() => Array.from({ length: this.count() }, (_, index) => index));
}
