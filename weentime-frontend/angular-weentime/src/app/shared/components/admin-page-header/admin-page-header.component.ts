import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminBreadcrumb } from '../../../features/admin/admin-ui';

@Component({
  selector: 'app-admin-page-header',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="admin-page-header admin-surface">
      <div class="header-copy">
        @if (breadcrumbs().length > 0) {
          <nav class="breadcrumbs">
            @for (crumb of breadcrumbs(); track crumb.label; let last = $last) {
              @if (crumb.route && !last) {
                <a [routerLink]="crumb.route">{{ crumb.label }}</a>
              } @else {
                <span>{{ crumb.label }}</span>
              }
              @if (!last) {
                <lucide-icon name="chevron-right" size="14"></lucide-icon>
              }
            }
          </nav>
        }

        @if (eyebrow()) {
          <span class="admin-pill">{{ eyebrow() }}</span>
        }

        <div>
          <h1>{{ title() }}</h1>
          @if (description()) {
            <p>{{ description() }}</p>
          }
        </div>
      </div>

      <div class="header-actions">
        <ng-content></ng-content>

        @if (primaryLabel()) {
          <button type="button" class="admin-button primary" (click)="primaryAction.emit()">
            @if (primaryIcon()) {
              <lucide-icon [name]="primaryIcon()!" size="18"></lucide-icon>
            }
            <span>{{ primaryLabel() }}</span>
          </button>
        }
      </div>
    </section>
  `,
  styles: [`
    .admin-page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 24px 28px;
    }

    .header-copy {
      display: grid;
      gap: 10px;
    }

    .breadcrumbs {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      color: var(--saas-muted);
      font-size: 12px;
      font-weight: 700;
    }

    .breadcrumbs a,
    .breadcrumbs span {
      text-decoration: none;
      color: inherit;
    }

    h1 {
      margin: 0;
      color: var(--saas-text);
      font-size: clamp(1.8rem, 2vw, 2.4rem);
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    p {
      margin: 8px 0 0;
      max-width: 46rem;
      color: var(--saas-muted);
      line-height: 1.6;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    @media (max-width: 900px) {
      .admin-page-header {
        flex-direction: column;
      }

      .header-actions {
        width: 100%;
        justify-content: flex-start;
      }
    }
  `]
})
export class AdminPageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>('');
  readonly eyebrow = input<string>('');
  readonly primaryLabel = input<string>('');
  readonly primaryIcon = input<string | null>(null);
  readonly breadcrumbs = input<AdminBreadcrumb[]>([]);

  readonly hasPrimaryAction = computed(() => Boolean(this.primaryLabel()));
  readonly primaryAction = output<void>();
}
