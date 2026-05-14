import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';
import { DashboardQuickAction } from '../../models/dashboard-ui.models';
import { DashboardHeaderComponent } from '../../organisms/dashboard-header/dashboard-header.component';

@Component({
  selector: 'ui-dashboard-layout',
  standalone: true,
  imports: [CommonModule, DashboardHeaderComponent],
  animations: [
    trigger('fadeInUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        animate('260ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ],
  template: `
    <div class="layout-root" @fadeInUp>
      <ui-dashboard-header
        [title]="title"
        [subtitle]="subtitle"
        [roleBadge]="roleBadge"
        [quickActions]="quickActions"
        [loading]="loading"
        (refresh)="refresh.emit()">
      </ui-dashboard-header>

      <section class="layout-block">
        <ng-content select="[layout-metrics]"></ng-content>
      </section>

      <section class="layout-main">
        <div class="layout-primary">
          <ng-content select="[layout-primary]"></ng-content>
        </div>
        <aside class="layout-side">
          <ng-content select="[layout-side]"></ng-content>
        </aside>
      </section>

      <section class="layout-bottom">
        <ng-content select="[layout-bottom]"></ng-content>
      </section>
    </div>
  `,
  styles: [`
    .layout-root {
      --layout-gap: 32px;
      width: min(1400px, 100%);
      margin-inline: auto;
      padding: calc(24px + env(safe-area-inset-top)) 24px 40px;
      display: grid;
      gap: var(--layout-gap);
      box-sizing: border-box;
      overflow-x: clip;
    }

    .layout-block,
    .layout-bottom {
      display: grid;
      gap: var(--layout-gap);
    }

    .layout-main {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(310px, 1fr);
      gap: var(--layout-gap);
      align-items: start;
    }

    .layout-primary,
    .layout-side {
      display: grid;
      gap: var(--layout-gap);
      min-width: 0;
    }

    @media (max-width: 1140px) {
      .layout-main {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardLayoutComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() roleBadge = '';
  @Input() quickActions: DashboardQuickAction[] = [];
  @Input() loading = false;
  @Output() refresh = new EventEmitter<void>();
}
