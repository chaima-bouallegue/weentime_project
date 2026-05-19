import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ai-score-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-score-bar.component.html',
  styleUrls: ['./ai-score-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiScoreBarComponent {
  /** 0..1 normalized anomaly score. */
  @Input() set score(value: number) {
    if (!Number.isFinite(value)) {
      this._score = 0;
      return;
    }
    this._score = Math.max(0, Math.min(1, value));
  }
  get score(): number {
    return this._score;
  }
  private _score = 0;

  @Input() animated = true;
  @Input() showLabel = true;

  get scorePercent(): number {
    return Math.round(this._score * 100);
  }

  /** Maps the score to a CSS variable token defined in styles.scss. */
  get barColor(): string {
    if (this._score >= 0.85) return 'var(--wt-risk-critical)';
    if (this._score >= 0.70) return 'var(--wt-risk-high)';
    if (this._score >= 0.50) return 'var(--wt-risk-medium)';
    return 'var(--wt-risk-low)';
  }
}
