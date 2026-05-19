import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';

export interface AttendanceBreakdownInput {
  total: number;
  present: number;
  absent: number;
  remote: number;
  presentPct: number;
  absentPct: number;
  remotePct: number;
}

@Component({
  selector: 'ui-attendance-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attendance-summary.component.html',
  styleUrls: ['./attendance-summary.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceSummaryComponent {
  @Input() title = "Couverture présence";
  @Input() subtitle = "Répartition temps réel";
  @Input() loading = false;

  @Input() set breakdown(value: AttendanceBreakdownInput | null | undefined) {
    this._breakdown.set(value ?? null);
  }
  get breakdown(): AttendanceBreakdownInput | null {
    return this._breakdown();
  }
  private readonly _breakdown = signal<AttendanceBreakdownInput | null>(null);

  /** Stable display values, clamped 0..100 so the stacked bar never overflows. */
  readonly clamped = computed(() => {
    const b = this._breakdown();
    if (!b) return { present: 0, absent: 0, remote: 0, presentPct: 0, absentPct: 0, remotePct: 0, total: 0 };
    const presentPct = clamp(b.presentPct);
    const remotePct = clamp(b.remotePct);
    const absentPct = clamp(b.absentPct);
    return {
      present: Math.max(0, b.present | 0),
      absent: Math.max(0, b.absent | 0),
      remote: Math.max(0, b.remote | 0),
      total: Math.max(0, b.total | 0),
      presentPct,
      absentPct,
      remotePct,
    };
  });

  readonly coverageLabel = computed(() => {
    const b = this.clamped();
    const covered = b.presentPct + b.remotePct;
    return `${Math.min(100, covered)}%`;
  });
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
