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
  imports: [CommonModule, RouterModule, UiIconComponent],
  template: `
    <header class="dashboard-header">
      <div class="mesh-layer"></div>
      <div class="glow-layer"></div>
      
      <div class="header-inner">
        <div class="main-info">
          <div class="badge-row">
            <span class="role-badge">{{ roleBadge }}</span>
            <div class="status-dot" [class.loading]="loading"></div>
          </div>
          <h1>{{ title }}</h1>
          <p class="subtitle">{{ subtitle }}</p>
        </div>

        <div class="meta-info">
          <div class="clock-box">
            <ui-icon icon="clock" [size]="14"></ui-icon>
            <span>{{ nowLabel() }}</span>
          </div>

          <div class="actions-box">
            @for (action of quickActions.slice(0, 2); track action.id) {
              <a [routerLink]="action.route" class="action-link">
                <ui-icon [icon]="action.icon || 'arrow-right'" [size]="14"></ui-icon>
                <span>{{ action.label }}</span>
              </a>
            }
            <button class="refresh-btn" [class.is-loading]="loading" (click)="refresh.emit()">
              <ui-icon icon="refresh" [size]="14"></ui-icon>
              <span>Actualiser</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    :host {
      display: block;
      --header-bg: #0f172a; /* Slate 900 */
      --header-accent: #6366f1; /* Indigo 500 */
      --header-text: #f8fafc;
      --header-text-dim: #94a3b8;
    }

    .dashboard-header {
      position: relative;
      border-radius: 20px;
      background: var(--header-bg);
      padding: 32px;
      overflow: hidden;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: var(--header-text);
      isolation: isolate;
    }

    /* Mesh & Glow Effects */
    .mesh-layer {
      position: absolute;
      inset: 0;
      background-image: 
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.1) 0px, transparent 50%);
      z-index: -1;
    }

    .glow-layer {
      position: absolute;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, transparent 70%);
      top: -200px;
      right: -100px;
      z-index: -1;
      filter: blur(40px);
    }

    .header-inner {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 32px;
      z-index: 1;
    }

    .main-info {
      display: grid;
      gap: 12px;
    }

    .badge-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .role-badge {
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
    }

    .status-dot.loading {
      background: #f59e0b;
      box-shadow: 0 0 10px #f59e0b;
      animation: pulse 1.5s infinite;
    }

    h1 {
      margin: 0;
      font-size: 2.25rem;
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: 1;
    }

    .subtitle {
      margin: 0;
      font-size: 0.95rem;
      color: var(--header-text-dim);
      font-weight: 500;
      max-width: 500px;
    }

    .meta-info {
      display: grid;
      gap: 16px;
      justify-items: end;
    }

    .clock-box {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--header-text-dim);
      background: rgba(255, 255, 255, 0.03);
      padding: 6px 12px;
      border-radius: 99px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .actions-box {
      display: flex;
      gap: 8px;
    }

    .action-link, .refresh-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      transition: all 0.2s ease;
      cursor: pointer;
      text-decoration: none;
    }

    .action-link {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
    }

    .action-link:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-2px);
    }

    .refresh-btn {
      background: var(--header-accent);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: white;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    .refresh-btn:hover {
      background: #4f46e5;
      transform: translateY(-2px);
    }

    .refresh-btn.is-loading ui-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
      .header-inner {
        flex-direction: column;
        align-items: flex-start;
      }
      .meta-info {
        justify-items: start;
        width: 100%;
      }
      .actions-box {
        width: 100%;
      }
      h1 { font-size: 1.75rem; }
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
