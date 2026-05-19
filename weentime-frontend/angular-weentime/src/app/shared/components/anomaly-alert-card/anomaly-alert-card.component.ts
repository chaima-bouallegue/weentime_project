import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AnomalyRecord, AnomalyRisk } from '../../../core/services/ml-anomaly.service';

@Component({
  selector: 'ui-anomaly-alert-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './anomaly-alert-card.component.html',
  styleUrls: ['./anomaly-alert-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnomalyAlertCardComponent {
  @Input() loading = false;
  @Input() title = "Anomalies de présence";
  @Input() subtitle = "Détectées aujourd'hui";
  @Input() anomalies: AnomalyRecord[] = [];
  @Input() totalAnomalies = 0;
  @Input() critical = 0;
  @Input() high = 0;
  @Input() medium = 0;
  @Input() emptyMessage = "Aucune anomalie détectée aujourd'hui.";
  @Input() maxVisible = 5;

  riskClass(risk: AnomalyRisk | string | undefined): string {
    switch ((risk || '').toString().toUpperCase()) {
      case 'CRITICAL':
        return 'risk--critical';
      case 'HIGH':
        return 'risk--high';
      case 'MEDIUM':
        return 'risk--medium';
      default:
        return 'risk--low';
    }
  }

  formatScore(score: number | undefined): string {
    if (score === undefined || score === null || Number.isNaN(score)) {
      return '0%';
    }
    return `${Math.round(score * 100)}%`;
  }

  initials(name: string | undefined): string {
    if (!name) {
      return '?';
    }
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p.charAt(0).toUpperCase()).join('') || '?';
  }

  trackByEmployee(_index: number, item: AnomalyRecord): string {
    return `${item.employeeId}-${item.date}`;
  }

  get visibleAnomalies(): AnomalyRecord[] {
    return (this.anomalies || []).slice(0, this.maxVisible);
  }

  get overflowCount(): number {
    return Math.max(0, (this.anomalies?.length ?? 0) - this.maxVisible);
  }
}
