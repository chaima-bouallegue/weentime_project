import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-skeleton-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="skeleton-card" [style.min-height.px]="height" aria-hidden="true">
      <span class="skeleton-card__icon"></span>
      <span class="skeleton-card__line skeleton-card__line--wide"></span>
      <span class="skeleton-card__value"></span>
      <span class="skeleton-card__line"></span>
    </article>
  `,
  styles: [`
    .skeleton-card {
      border-radius: 16px;
      border: 1px solid rgba(226, 232, 240, .78);
      background: rgba(255, 255, 255, .82);
      box-shadow: 0 14px 34px rgba(15, 23, 42, .06);
      padding: 16px;
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .skeleton-card span {
      display: block;
      border-radius: 999px;
      background: linear-gradient(90deg, #e2e8f0 20%, #f8fafc 50%, #e2e8f0 80%);
      background-size: 220% 100%;
      animation: shimmer 1.15s linear infinite;
    }

    .skeleton-card__icon {
      width: 38px;
      height: 38px;
      border-radius: 13px !important;
    }

    .skeleton-card__line {
      height: 12px;
      width: 70%;
    }

    .skeleton-card__line--wide {
      width: 88%;
    }

    .skeleton-card__value {
      height: 30px;
      width: 48%;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkeletonCardComponent {
  @Input() height = 156;
}
