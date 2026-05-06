import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-skeleton-list',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="skeleton-list" aria-hidden="true">
      <span class="skeleton-list__title"></span>
      @for (row of rowsArray(); track row) {
        <div class="skeleton-list__row">
          <span class="skeleton-list__avatar"></span>
          <span class="skeleton-list__copy"></span>
          <span class="skeleton-list__pill"></span>
        </div>
      }
    </article>
  `,
  styles: [`
    .skeleton-list {
      border-radius: 16px;
      border: 1px solid rgba(226, 232, 240, .78);
      background: rgba(255, 255, 255, .82);
      box-shadow: 0 14px 34px rgba(15, 23, 42, .05);
      padding: 16px;
      display: grid;
      gap: 12px;
    }

    .skeleton-list span {
      display: block;
      border-radius: 999px;
      background: linear-gradient(90deg, #e2e8f0 20%, #f8fafc 50%, #e2e8f0 80%);
      background-size: 220% 100%;
      animation: shimmer 1.15s linear infinite;
    }

    .skeleton-list__title {
      width: 52%;
      height: 16px;
    }

    .skeleton-list__row {
      min-height: 48px;
      display: grid;
      grid-template-columns: 34px 1fr 56px;
      gap: 10px;
      align-items: center;
    }

    .skeleton-list__avatar {
      width: 34px;
      height: 34px;
      border-radius: 12px !important;
    }

    .skeleton-list__copy {
      height: 12px;
      width: 82%;
    }

    .skeleton-list__pill {
      height: 18px;
      width: 56px;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonListComponent {
  @Input() rows = 4;

  rowsArray(): number[] {
    return Array.from({ length: Math.max(1, this.rows) }, (_, index) => index);
  }
}
