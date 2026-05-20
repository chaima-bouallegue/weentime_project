import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';

export type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type StatTrend = 'up' | 'down' | 'flat';

@Component({
  selector: 'ui-smart-stat-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smart-stat-card.component.html',
  styleUrls: ['./smart-stat-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartStatCardComponent implements OnChanges {
  @Input({ required: true }) label = '';
  @Input() value: number | string | null = null;
  @Input() suffix = '';
  @Input() prefix = '';
  /** Short context line under the value (e.g. "sur 124 actifs"). */
  @Input() context = '';
  /** Tone drives accent color (icon background, badge). */
  @Input() tone: StatTone = 'primary';
  /** Inline SVG/lucide icon — pass as a raw SVG string for now to avoid Lucide coupling here. */
  @Input() icon: string | null = null;
  /** Small contextual badge (e.g. "Live", "MAJ il y a 2 min"). */
  @Input() badge = '';
  @Input() badgeTone: StatTone = 'neutral';
  /** Optional trend hint rendered as a small caret + delta value. */
  @Input() trend: StatTrend | null = null;
  @Input() trendLabel = '';
  @Input() loading = false;

  /** Numeric value rendered with counter animation; falls back to raw value otherwise. */
  readonly animatedValue = signal<number | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes) {
      if (typeof this.value === 'number' && Number.isFinite(this.value)) {
        this.animateTo(this.value);
      } else {
        this.animatedValue.set(null);
      }
    }
  }

  private animateTo(target: number): void {
    const current = this.animatedValue() ?? 0;
    if (target === current) {
      this.animatedValue.set(target);
      return;
    }
    const duration = 500;
    const start = performance.now();
    const from = current;
    const delta = target - from;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + delta * eased;
      this.animatedValue.set(Number.isInteger(target) ? Math.round(next) : Math.round(next * 10) / 10);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        this.animatedValue.set(target);
      }
    };
    requestAnimationFrame(tick);
  }
}
