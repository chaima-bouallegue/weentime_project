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
      border-radius: 16px;
      background: white;
      border: 1px solid rgba(226, 232, 240, 0.8);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      min-height: 160px;
      animation: cardIn 0.5s ease both;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -4px rgba(0, 0, 0, 0.04);
      border-color: rgba(99, 102, 241, 0.2);
    }

    .stat-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .stat-card__icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f1f5f9;
      color: #6366f1;
      border: 1px solid #f1f5f9;
      transition: all 0.3s ease;
    }

    .stat-card:hover .stat-card__icon {
      background: rgba(99, 102, 241, 0.1);
      color: #4f46e5;
      border-color: rgba(99, 102, 241, 0.2);
    }

    .stat-card__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .stat-card__value {
      margin: 0;
      color: #0f172a;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1.1;
    }

    .stat-card__detail {
      margin-top: 4px;
      color: #64748b;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
    }

    .stat-card__foot {
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid #f1f5f9;
    }

    .stat-card__skeleton {
      display: grid;
      gap: 12px;
    }

    .stat-card__skeleton span {
      display: block;
      background: #f1f5f9;
      border-radius: 4px;
      animation: shimmer 2s infinite linear;
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
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
