import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ai-confidence-chip',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-confidence-chip.component.html',
  styleUrls: ['./ai-confidence-chip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiConfidenceChipComponent {
  /** 0..100 confidence percentage. Values outside the range are clamped. */
  @Input() set confidence(value: number) {
    if (!Number.isFinite(value)) {
      this._confidence = 0;
      return;
    }
    this._confidence = Math.max(0, Math.min(100, Math.round(value)));
  }
  get confidence(): number {
    return this._confidence;
  }
  private _confidence = 0;

  @Input() label = 'IA';
}
