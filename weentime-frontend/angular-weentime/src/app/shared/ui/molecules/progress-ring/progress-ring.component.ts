import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-progress-ring',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ring" [style.--percent]="ratio" [style.width.px]="size" [style.height.px]="size">
      <div class="ring__inner">
        <strong>{{ ratio }}%</strong>
        <span>{{ label }}</span>
      </div>
    </div>
  `,
  styles: [`
    .ring {
      --percent: 0;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: conic-gradient(#2563eb calc(var(--percent) * 1%), rgba(148, 163, 184, .2) 0);
      display: grid;
      place-items: center;
      position: relative;
    }

    .ring::before {
      content: '';
      position: absolute;
      inset: 8px;
      border-radius: inherit;
      background: rgba(255, 255, 255, .92);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, .8);
    }

    .ring__inner {
      position: relative;
      z-index: 1;
      text-align: center;
      display: grid;
      gap: 2px;
    }

    .ring__inner strong {
      font-size: 15px;
      color: #0f172a;
      line-height: 1;
      font-weight: 900;
    }

    .ring__inner span {
      font-size: 10px;
      color: #64748b;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProgressRingComponent {
  @Input() size = 96;
  @Input() value = 0;
  @Input() max = 100;
  @Input() label = 'Score';

  get ratio(): number {
    if (this.max <= 0) {
      return 0;
    }
    const ratio = Math.round((this.value / this.max) * 100);
    return Math.max(0, Math.min(ratio, 100));
  }
}
