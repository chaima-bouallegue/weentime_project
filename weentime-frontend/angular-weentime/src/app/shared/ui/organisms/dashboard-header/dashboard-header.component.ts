import { ChangeDetectionStrategy, Component, DestroyRef, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { DashboardQuickAction } from '../../models/dashboard-ui.models';
import { UiBadgeComponent } from '../../atoms/badge/badge.component';
import { UiButtonComponent } from '../../atoms/button/button.component';
import { RouterModule } from '@angular/router';
import { UiIconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'ui-dashboard-header',
  standalone: true,
  imports: [CommonModule, RouterModule, UiBadgeComponent, UiButtonComponent, UiIconComponent],
  template: `
    <header class="dashboard-header">
      <div class="dashboard-header__mesh"></div>
      <div class="dashboard-header__content">
        <div class="dashboard-header__main">
          <ui-badge [tone]="'primary'" [label]="roleBadge"></ui-badge>
          <h1>{{ title }}</h1>
          <p>{{ subtitle }}</p>
        </div>

        <div class="dashboard-header__meta">
          <div class="dashboard-header__clock">
            <ui-icon icon="clock" [size]="14"></ui-icon>
            <span>{{ nowLabel() }}</span>
          </div>

          <div class="dashboard-header__actions">
            @for (action of quickActions.slice(0, 2); track action.id) {
              <a [routerLink]="action.route" class="dashboard-header__link">
                <ui-icon [icon]="action.icon || 'arrow-right'" [size]="14"></ui-icon>
                <span>{{ action.label }}</span>
              </a>
            }
            <ui-button
              [label]="'Actualiser'"
              [icon]="'refresh'"
              [variant]="'secondary'"
              [loading]="loading"
              (pressed)="refresh.emit()">
            </ui-button>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .dashboard-header {
      position: relative;
      border-radius: 26px;
      border: 1px solid rgba(255,255,255,.4);
      background: linear-gradient(125deg, #1d4ed8 0%, #4338ca 56%, #7c3aed 100%);
      box-shadow: 0 24px 52px rgba(59, 130, 246, .24);
      overflow: hidden;
      isolation: isolate;
      color: #fff;
    }

    .dashboard-header__mesh {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 12% 24%, rgba(255,255,255,.18), transparent 46%),
        radial-gradient(circle at 82% 84%, rgba(255,255,255,.2), transparent 44%);
      z-index: 0;
    }

    .dashboard-header__content {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 22px;
      padding: 24px;
    }

    .dashboard-header__main {
      display: grid;
      gap: 8px;
      max-width: 760px;
    }

    .dashboard-header__main h1 {
      margin: 0;
      font-size: clamp(1.5rem, 2.6vw, 2.2rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
      font-weight: 900;
    }

    .dashboard-header__main p {
      margin: 0;
      color: rgba(255,255,255,.82);
      font-size: 13px;
      line-height: 1.45;
      font-weight: 600;
      max-width: 58ch;
    }

    .dashboard-header__meta {
      display: grid;
      gap: 12px;
      align-content: start;
      justify-items: end;
    }

    .dashboard-header__clock {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(255,255,255,.14);
      border: 1px solid rgba(255,255,255,.22);
      font-size: 11px;
      font-weight: 800;
    }

    .dashboard-header__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }

    .dashboard-header__link {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 11px;
      border-radius: 11px;
      text-decoration: none;
      color: #fff;
      border: 1px solid rgba(255,255,255,.28);
      background: rgba(255,255,255,.14);
      font-size: 12px;
      font-weight: 700;
      transition: transform .2s ease, background-color .2s ease;
    }

    .dashboard-header__link:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,.22);
    }

    @media (max-width: 900px) {
      .dashboard-header__content {
        grid-template-columns: 1fr;
      }

      .dashboard-header__meta {
        justify-items: start;
      }

      .dashboard-header__actions {
        justify-content: flex-start;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardHeaderComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly nowSignal = signal(new Date());

  @Input() title = 'Tableau de bord';
  @Input() subtitle = '';
  @Input() roleBadge = 'Role';
  @Input() quickActions: DashboardQuickAction[] = [];
  @Input() loading = false;

  @Output() refresh = new EventEmitter<void>();

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nowSignal.set(new Date()));
  }

  nowLabel(): string {
    return this.nowSignal().toLocaleString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
