import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardStat, UiTone } from '../../models/dashboard-ui.models';
import { UiBadgeComponent } from '../../atoms/badge/badge.component';
import { UiIconComponent } from '../../atoms/icon/icon.component';

@Component({
  selector: 'ui-stat-card',
  standalone: true,
  imports: [CommonModule, UiBadgeComponent, UiIconComponent],
  template: `
    <article class="stat-card" [class.stat-card--loading]="loadingState()" [class.stat-card--error]="errorMessage()">
      <header class="stat-card__head">
        <span class="stat-card__icon"><ui-icon [icon]="iconValue()" [size]="18"></ui-icon></span>
        <ui-badge [tone]="toneValue()" [label]="labelValue()"></ui-badge>
      </header>

      @if (loadingState()) {
        <div class="stat-card__skeleton">
          <span></span>
          <span></span>
        </div>
      } @else if (errorMessage()) {
        <div class="stat-card__body">
          <p class="stat-card__value stat-card__value--muted">--</p>
          <p class="stat-card__detail">{{ errorMessage() }}</p>
        </div>
      } @else {
        <div class="stat-card__body">
          <p class="stat-card__value">{{ animatedValue() }}</p>
          <p class="stat-card__detail">{{ detailValue() }}</p>
        </div>
      }

      <footer class="stat-card__foot" *ngIf="trendValue()">
        <ui-badge [tone]="trendToneValue()" [label]="trendValue()"></ui-badge>
      </footer>
    </article>
  `,
  styles: [`
    .stat-card {
      border-radius: 20px;
      background: linear-gradient(170deg, rgba(255,255,255,.82), rgba(255,255,255,.66));
      border: 1px solid rgba(255,255,255,.52);
      backdrop-filter: blur(14px);
      padding: 16px;
      display: grid;
      gap: 14px;
      box-shadow: 0 14px 34px rgba(15, 23, 42, .06);
      transition: transform .24s ease, box-shadow .24s ease;
      min-height: 154px;
      animation: cardIn .36s ease both;
    }

    .stat-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 22px 40px rgba(15, 23, 42, .11);
    }

    .stat-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .stat-card__icon {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, rgba(37, 99, 235, .18), rgba(124, 58, 237, .2));
      color: #1e40af;
    }

    .stat-card__body {
      display: grid;
      gap: 6px;
    }

    .stat-card__value {
      margin: 0;
      color: #0f172a;
      font-size: clamp(1.4rem, 1.8vw, 1.9rem);
      font-weight: 900;
      letter-spacing: -0.03em;
      animation: numberPop .28s ease both;
    }

    .stat-card__value--muted {
      color: #94a3b8;
    }

    .stat-card__detail {
      margin: 0;
      color: #64748b;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
    }

    .stat-card__skeleton {
      display: grid;
      gap: 10px;
      align-content: center;
    }

    .stat-card__skeleton span {
      display: block;
      height: 18px;
      border-radius: 999px;
      background: linear-gradient(90deg, #e2e8f0 20%, #f8fafc 50%, #e2e8f0 80%);
      background-size: 210% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    .stat-card__skeleton span:first-child {
      width: 62%;
      height: 30px;
    }

    .stat-card__skeleton span:last-child {
      width: 84%;
    }

    .stat-card--error {
      border-color: rgba(239, 68, 68, .24);
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @keyframes numberPop {
      from { opacity: .35; transform: translateY(4px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes cardIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatCardComponent implements OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private animationFrame: number | null = null;
  private animationStart = 0;
  private previousNumericValue = 0;

  @Input() stat: DashboardStat | null = null;
  @Input() icon = '';
  @Input() label = '';
  @Input() value: string | number | null = null;
  @Input() subLabel = '';
  @Input() trendLabel = '';
  @Input() trendType: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() colorTone: UiTone = 'neutral';

  readonly animatedValue = signal('-');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['stat'] || changes['value']) {
      this.animateValue();
    }
  }

  ngOnDestroy(): void {
    this.cancelAnimation();
  }

  iconValue(): string {
    return this.icon || this.stat?.icon || 'activity';
  }

  labelValue(): string {
    return this.label || this.stat?.label || '';
  }

  valueValue(): string {
    const raw = this.value ?? this.stat?.value ?? '-';
    return String(raw || '-');
  }

  detailValue(): string {
    return this.subLabel || this.stat?.subLabel || this.stat?.detail || 'Aucune précision';
  }

  trendValue(): string {
    return this.trendLabel || this.stat?.trendLabel || this.stat?.trend || '';
  }

  toneValue(): UiTone {
    return this.colorTone || this.stat?.colorTone || this.stat?.tone || 'neutral';
  }

  trendToneValue(): 'success' | 'warning' | 'danger' | 'neutral' {
    if (this.stat?.trendType) {
      return this.stat.trendType;
    }
    if (this.trendLabel) {
      return this.trendType;
    }
    return this.stat?.trendUp ? 'success' : 'warning';
  }

  loadingState(): boolean {
    return this.loading || Boolean(this.stat?.loading);
  }

  errorMessage(): string {
    return this.error || this.stat?.error || '';
  }

  private animateValue(): void {
    this.cancelAnimation();

    const targetText = this.valueValue();
    const parsed = this.parseNumericValue(targetText);
    if (!parsed) {
      this.animatedValue.set(targetText);
      return;
    }

    const startValue = this.previousNumericValue;
    const endValue = parsed.value;
    const duration = 600;
    this.animationStart = performance.now();

    const step = (timestamp: number) => {
      const progress = Math.min((timestamp - this.animationStart) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * eased;
      this.animatedValue.set(`${parsed.prefix}${this.formatAnimatedNumber(current, parsed.decimals)}${parsed.suffix}`);
      this.cdr.markForCheck();

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        this.previousNumericValue = endValue;
        this.animatedValue.set(targetText);
        this.cdr.markForCheck();
      }
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  private parseNumericValue(value: string): { prefix: string; suffix: string; value: number; decimals: number } | null {
    const match = value.match(/-?\d[\d\s\u00a0\u202f]*(?:[,.]\d+)?/);
    if (!match || match.index == null) {
      return null;
    }

    const rawNumber = match[0];
    const normalized = rawNumber.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    const decimalMatch = normalized.match(/[.](\d+)$/);
    return {
      prefix: value.slice(0, match.index),
      suffix: value.slice(match.index + rawNumber.length),
      value: numeric,
      decimals: decimalMatch ? decimalMatch[1].length : 0
    };
  }

  private formatAnimatedNumber(value: number, decimals: number): string {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }

  private cancelAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
}
