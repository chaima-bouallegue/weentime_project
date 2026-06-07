import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AnomalyRecord } from '../../../core/services/ml-anomaly.service';
import { AiRiskBadgeComponent } from '../ai-risk-badge/ai-risk-badge.component';
import { AiScoreBarComponent } from '../ai-score-bar/ai-score-bar.component';
import { AiConfidenceChipComponent } from '../ai-confidence-chip/ai-confidence-chip.component';

/** Action emitted by the inline buttons. Parents decide how to handle each. */
export type AnomalyAction = 'dismiss' | 'contact' | 'open';

@Component({
  selector: 'ui-anomaly-alert-card',
  standalone: true,
  imports: [CommonModule, AiRiskBadgeComponent, AiScoreBarComponent, AiConfidenceChipComponent],
  templateUrl: './anomaly-alert-card.component.html',
  styleUrls: ['./anomaly-alert-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnomalyAlertCardComponent {
  /** One record per card — parents render the list/grid. */
  @Input({ required: true }) anomaly!: AnomalyRecord;
  @Input() compact = false;

  @Output() action = new EventEmitter<{ kind: AnomalyAction; anomaly: AnomalyRecord }>();

  get cardModifier(): string {
    const risk = (this.anomaly?.risk || 'low').toString().toLowerCase();
    return `anomaly-card--${risk}`;
  }

  get employeeName(): string {
    return this.anomaly?.employeeName?.trim() || 'Employé inconnu';
  }

  get title(): string {
    return this.anomaly?.title?.trim() || String(this.anomaly?.category || 'Anomalie de présence');
  }

  get summary(): string {
    return this.anomaly?.summary?.trim()
      || this.anomaly?.explanation?.trim()
      || 'Une anomalie de présence nécessite une vérification.';
  }

  get primaryReason(): string {
    const detected = this.anomaly?.detectedReasons?.[0];
    if (detected) {
      const main = detected.label || detected.code || 'Raison détectée';
      if (detected.value && detected.expected) {
        return `${main} - ${detected.value} / attendu ${detected.expected}`;
      }
      if (detected.value) {
        return `${main} - ${detected.value}`;
      }
      return detected.description ? `${main} - ${detected.description}` : main;
    }
    return this.anomaly?.reasons?.[0] || this.title;
  }

  get reasonCount(): number {
    const detectedCount = this.anomaly?.detectedReasons?.length ?? 0;
    return detectedCount > 0 ? detectedCount : (this.anomaly?.reasons?.length ?? 0);
  }

  get extraReasonCount(): number {
    return Math.max(0, this.reasonCount - 1);
  }

  get formattedDate(): string {
    if (!this.anomaly?.date) return '';
    const d = new Date(this.anomaly.date);
    if (Number.isNaN(d.getTime())) return this.anomaly.date;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  getInitials(name: string | undefined): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2)
      .map(p => p.charAt(0).toUpperCase()).join('') || '?';
  }

  /** Heuristic confidence: anomaly score maps to model confidence as a percent. */
  getConfidence(score: number | undefined): number {
    if (!Number.isFinite(score) || score === undefined) return 0;
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
  }

  emit(kind: AnomalyAction): void {
    this.action.emit({ kind, anomaly: this.anomaly });
  }
}
