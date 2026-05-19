import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { AnomalyRecord, AnomalyRisk } from '../../../core/services/ml-anomaly.service';

@Component({
  selector: 'ui-ai-anomaly-feed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-anomaly-feed.component.html',
  styleUrls: ['./ai-anomaly-feed.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAnomalyFeedComponent {
  @Input() loading = false;
  @Input() title = "Anomalies de présence";
  @Input() subtitle = "Détection IA · score normalisé";
  @Input() emptyMessage = "Aucune anomalie détectée aujourd'hui.";
  @Input() maxVisible = 4;

  @Input() set anomalies(value: AnomalyRecord[] | null | undefined) {
    // Sort by score desc and dedupe by (employeeId|date) so the same incident
    // never lands twice in the feed even if the backend duplicates a record.
    const list = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const sorted = [...list]
      .filter(a => a && Number.isFinite(a.score))
      .sort((a, b) => b.score - a.score)
      .filter(a => {
        const key = `${a.employeeId}|${a.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    this._anomalies = sorted;
  }
  get anomalies(): AnomalyRecord[] {
    return this._anomalies;
  }
  private _anomalies: AnomalyRecord[] = [];

  @Input() totalAnomalies = 0;
  @Input() critical = 0;
  @Input() high = 0;
  @Input() medium = 0;

  readonly expanded = signal<string | null>(null);

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  isExpanded(id: string): boolean {
    return this.expanded() === id;
  }

  riskTone(risk: AnomalyRisk | string | undefined): 'critical' | 'high' | 'medium' | 'low' {
    const value = (risk || '').toString().toUpperCase();
    if (value === 'CRITICAL') return 'critical';
    if (value === 'HIGH') return 'high';
    if (value === 'MEDIUM') return 'medium';
    return 'low';
  }

  initials(name: string | undefined): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2)
      .map(p => p.charAt(0).toUpperCase()).join('') || '?';
  }

  scorePct(score: number | undefined): number {
    if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
  }

  trackByAnomaly(_i: number, a: AnomalyRecord): string {
    return `${a.employeeId}-${a.date}`;
  }

  get visibleAnomalies(): AnomalyRecord[] {
    return this._anomalies.slice(0, this.maxVisible);
  }

  get overflowCount(): number {
    return Math.max(0, this._anomalies.length - this.maxVisible);
  }
}
