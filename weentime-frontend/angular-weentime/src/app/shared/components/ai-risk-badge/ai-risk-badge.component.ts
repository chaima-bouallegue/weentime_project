import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

@Component({
  selector: 'app-ai-risk-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-risk-badge.component.html',
  styleUrls: ['./ai-risk-badge.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiRiskBadgeComponent {
  @Input() risk: RiskLevel = 'LOW';
  /** Pulse animation is rendered for CRITICAL / HIGH unless explicitly disabled. */
  @Input() showPulse = true;

  get label(): string {
    const labels: Record<RiskLevel, string> = {
      CRITICAL: 'Critique',
      HIGH: 'Élevé',
      MEDIUM: 'Modéré',
      LOW: 'Faible',
    };
    return labels[this.risk] ?? 'Faible';
  }

  get cssClass(): string {
    return `badge--${(this.risk || 'low').toLowerCase()}`;
  }

  get pulseActive(): boolean {
    return this.showPulse && (this.risk === 'CRITICAL' || this.risk === 'HIGH');
  }
}
