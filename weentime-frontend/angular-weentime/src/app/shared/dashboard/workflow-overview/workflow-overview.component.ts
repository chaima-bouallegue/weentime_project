import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type WorkflowKind = 'leave' | 'telework' | 'authorization' | 'document';

export interface WorkflowBucket {
  kind: WorkflowKind;
  label: string;
  count: number;
  urgency: 'calm' | 'attention' | 'critical';
  route: string;
}

@Component({
  selector: 'ui-workflow-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './workflow-overview.component.html',
  styleUrls: ['./workflow-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowOverviewComponent {
  @Input() title = 'Workflow RH';
  @Input() subtitle = 'Demandes en attente par type';
  @Input() buckets: WorkflowBucket[] = [];
  @Input() loading = false;

  totalPending(): number {
    return this.buckets.reduce((sum, b) => sum + (Number.isFinite(b.count) ? b.count : 0), 0);
  }

  trackByKind(_i: number, b: WorkflowBucket): WorkflowKind {
    return b.kind;
  }
}
