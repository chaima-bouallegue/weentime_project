import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

export interface WorkflowMetric {
  label: string;
  value: string;
  detail: string;
  icon: string;
  accent: string;
}

export interface WorkflowRequest {
  id: string;
  employee: string;
  type: string;
  team: string;
  submittedAt: string;
  slaLabel: string;
  priority: 'critical' | 'high' | 'normal';
}

export interface WorkflowLane {
  id: string;
  label: string;
  owner: string;
  icon: string;
  accent: string;
  description: string;
  items: WorkflowRequest[];
}

@Component({
  selector: 'app-workflow-bpm-board',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="workflow-board saas-panel">
      <div class="workflow-header">
        <div>
          <span class="saas-kicker">{{ kicker() }}</span>
          <h2>{{ title() }}</h2>
          <p>{{ subtitle() }}</p>
        </div>

        <div class="workflow-chip">
          <lucide-icon name="git-branch" size="16"></lucide-icon>
          <span>{{ totalItems() }} dossiers actifs</span>
        </div>
      </div>

      <div class="metric-row">
        @for (metric of metrics(); track metric.label) {
          <article class="metric-card">
            <div class="metric-icon" [style.background]="metric.accent + '18'" [style.color]="metric.accent">
              <lucide-icon [name]="metric.icon" size="18"></lucide-icon>
            </div>
            <div>
              <strong>{{ metric.value }}</strong>
              <p>{{ metric.label }}</p>
              <small>{{ metric.detail }}</small>
            </div>
          </article>
        }
      </div>

      <div class="lane-grid">
        @for (lane of lanes(); track lane.id) {
          <section class="lane-card">
            <div class="lane-head">
              <div class="lane-title">
                <div class="lane-icon" [style.background]="lane.accent + '18'" [style.color]="lane.accent">
                  <lucide-icon [name]="lane.icon" size="16"></lucide-icon>
                </div>
                <div>
                  <h3>{{ lane.label }}</h3>
                  <p>{{ lane.owner }}</p>
                </div>
              </div>
              <span class="lane-count">{{ lane.items.length }}</span>
            </div>

            <p class="lane-description">{{ lane.description }}</p>

            <div class="request-list">
              @for (request of lane.items; track request.id) {
                <article class="request-card">
                  <div class="request-head">
                    <div>
                      <strong>{{ request.employee }}</strong>
                      <p>{{ request.type }} - {{ request.team }}</p>
                    </div>
                    <span class="priority" [class.high]="request.priority === 'high'" [class.critical]="request.priority === 'critical'">
                      {{ priorityLabel(request.priority) }}
                    </span>
                  </div>

                  <div class="request-meta">
                    <span>{{ request.submittedAt }}</span>
                    <span>{{ request.slaLabel }}</span>
                  </div>
                </article>
              } @empty {
                <div class="empty-state">
                  <lucide-icon name="check-circle2" size="16"></lucide-icon>
                  <span>Aucun dossier en attente.</span>
                </div>
              }
            </div>
          </section>
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .workflow-board {
      display: grid;
      gap: 20px;
      padding: 24px;
    }

    .workflow-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .workflow-header h2 {
      margin: 8px 0 6px;
      font-size: clamp(1.3rem, 2.2vw, 1.7rem);
      line-height: 1.05;
      color: var(--saas-text);
    }

    .workflow-header p {
      margin: 0;
      max-width: 50rem;
      color: var(--saas-muted);
    }

    .workflow-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: var(--saas-chip-bg);
      color: var(--saas-text);
      font-weight: 700;
      white-space: nowrap;
    }

    .metric-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }

    .metric-card {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 16px;
      border-radius: 18px;
      background: var(--saas-subtle-bg);
      border: 1px solid var(--saas-border);
    }

    .metric-icon,
    .lane-icon {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .metric-card strong {
      display: block;
      color: var(--saas-text);
      font-size: 1.15rem;
      font-weight: 800;
    }

    .metric-card p,
    .metric-card small {
      margin: 0;
    }

    .metric-card p {
      color: var(--saas-text);
      font-weight: 700;
    }

    .metric-card small {
      color: var(--saas-muted);
    }

    .lane-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }

    .lane-card {
      display: grid;
      gap: 14px;
      padding: 18px;
      border-radius: 20px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(247, 250, 252, 0.92));
      border: 1px solid var(--saas-border);
      min-height: 100%;
    }

    :host-context(.dark) .lane-card {
      background: linear-gradient(180deg, rgba(17, 24, 39, 0.88), rgba(15, 23, 42, 0.96));
    }

    .lane-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .lane-title {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .lane-title h3,
    .request-head strong {
      margin: 0;
      color: var(--saas-text);
    }

    .lane-title p,
    .lane-description,
    .request-head p,
    .request-meta {
      margin: 0;
      color: var(--saas-muted);
    }

    .lane-count {
      min-width: 34px;
      height: 34px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: var(--saas-chip-bg);
      color: var(--saas-text);
      font-weight: 800;
    }

    .request-list {
      display: grid;
      gap: 10px;
    }

    .request-card {
      display: grid;
      gap: 10px;
      padding: 14px;
      border-radius: 16px;
      background: var(--saas-surface);
      border: 1px solid var(--saas-border);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32);
    }

    .request-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
    }

    .request-meta {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 0.8rem;
    }

    .priority {
      display: inline-flex;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(37, 99, 235, 0.12);
      color: #1d4ed8;
      font-size: 0.72rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .priority.high {
      background: rgba(245, 158, 11, 0.16);
      color: #b45309;
    }

    .priority.critical {
      background: rgba(239, 68, 68, 0.16);
      color: #b91c1c;
    }

    .empty-state {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px;
      border-radius: 16px;
      background: var(--saas-subtle-bg);
      color: var(--saas-muted);
      border: 1px dashed var(--saas-border-strong);
    }

    @media (max-width: 1080px) {
      .lane-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .workflow-board {
        padding: 18px;
      }

      .workflow-header,
      .request-meta {
        grid-template-columns: 1fr;
        display: grid;
      }
    }
  `]
})
export class WorkflowBpmBoardComponent {
  readonly kicker = input('Workflow BPM');
  readonly title = input('Validation manager vers RH');
  readonly subtitle = input('Un pipeline visuel pour monitorer les decisions, les escalades et les delais de traitement.');
  readonly metrics = input<WorkflowMetric[]>([]);
  readonly lanes = input<WorkflowLane[]>([]);

  readonly totalItems = computed(() =>
    this.lanes().reduce((total, lane) => total + lane.items.length, 0)
  );

  protected priorityLabel(priority: WorkflowRequest['priority']): string {
    if (priority === 'critical') {
      return 'Critique';
    }

    if (priority === 'high') {
      return 'Haute';
    }

    return 'Normale';
  }
}
