import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DashboardChartSeries, UiTone } from '../../models/dashboard-ui.models';

@Component({
  selector: 'ui-chart-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="chart-card">
      <header class="chart-card__head">
        <div>
          <h3>{{ chart?.title || 'Graphique' }}</h3>
          <p>{{ chart?.subtitle || 'Analyse' }}</p>
        </div>
      </header>

      @if (!hasData()) {
        <div class="chart-card__empty">Aucune donnee disponible</div>
      } @else {
        @switch (chart?.type) {
          @case ('bar') {
            <div class="bar-wrap">
              @for (item of barItems(); track item.label) {
                <div class="bar-col" [style.--chart-gradient]="item.color">
                  <div class="bar-track">
                    <div class="bar-fill" [style.height.%]="item.percent"></div>
                  </div>
                  <strong>{{ item.value }}</strong>
                  <span>{{ item.label }}</span>
                </div>
              }
            </div>
          }
          @case ('donut') {
            <div class="donut-wrap">
              <div class="donut-chart" [ngStyle]="donutStyle()">
                <div class="donut-chart__inner">
                  <strong>{{ totalValue() }}</strong>
                  <span>Total</span>
                </div>
              </div>
              <div class="donut-legend">
                @for (item of barItems(); track item.label) {
                  <div>
                    <span class="legend-dot" [style.background]="item.color"></span>
                    <p>{{ item.label }}</p>
                    <strong>{{ item.value }}</strong>
                  </div>
                }
              </div>
            </div>
          }
          @default {
            <svg class="line-wrap" viewBox="0 0 600 240" preserveAspectRatio="none">
              <path *ngIf="chart?.type === 'area'" class="area" [attr.d]="areaPath()"></path>
              <path class="line" [attr.d]="linePath()"></path>
              @for (point of points(); track point.index) {
                <circle [attr.cx]="point.x" [attr.cy]="point.y" r="4"></circle>
              }
            </svg>
            <div class="line-legend">
              @for (item of barItems(); track item.label) {
                <div>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              }
            </div>
          }
        }
      }
    </article>
  `,
  styles: [`
    .chart-card {
      border-radius: 20px;
      border: 1px solid rgba(148, 163, 184, .22);
      background: linear-gradient(170deg, rgba(255,255,255,.83), rgba(255,255,255,.67));
      backdrop-filter: blur(14px);
      padding: 16px;
      display: grid;
      gap: 14px;
      min-height: 260px;
    }

    .chart-card__head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }

    .chart-card__head h3 {
      margin: 0;
      color: #0f172a;
      font-size: 15px;
      font-weight: 900;
    }

    .chart-card__head p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
    }

    .chart-card__empty {
      min-height: 180px;
      border-radius: 14px;
      border: 1px dashed rgba(148, 163, 184, .4);
      display: grid;
      place-items: center;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
    }

    .bar-wrap {
      min-height: 190px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
      gap: 10px;
      align-items: end;
    }

    .bar-col {
      display: grid;
      justify-items: center;
      gap: 6px;
    }

    .bar-track {
      width: 100%;
      height: 122px;
      border-radius: 12px;
      background: rgba(148, 163, 184, .16);
      padding: 6px;
      display: flex;
      align-items: end;
    }

    .bar-fill {
      width: 100%;
      border-radius: 9px;
      background: var(--chart-gradient, linear-gradient(180deg, #2563eb, #7c3aed));
      transition: height .28s ease;
    }

    .bar-col strong {
      color: #0f172a;
      font-size: 13px;
      font-weight: 800;
      line-height: 1;
    }

    .bar-col span {
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
    }

    .donut-wrap {
      display: grid;
      grid-template-columns: minmax(120px, 180px) 1fr;
      gap: 14px;
      align-items: center;
      min-height: 190px;
    }

    .donut-chart {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      position: relative;
      display: grid;
      place-items: center;
      margin-inline: auto;
      background: conic-gradient(#93c5fd 100%, #e2e8f0 0);
    }

    .donut-chart__inner {
      width: 112px;
      height: 112px;
      border-radius: 50%;
      background: rgba(255,255,255,.95);
      border: 1px solid rgba(255,255,255,.8);
      display: grid;
      place-items: center;
      text-align: center;
      gap: 3px;
    }

    .donut-chart__inner strong {
      color: #0f172a;
      font-size: 18px;
      font-weight: 900;
      line-height: 1;
    }

    .donut-chart__inner span {
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
    }

    .donut-legend {
      display: grid;
      gap: 8px;
    }

    .donut-legend div {
      display: grid;
      grid-template-columns: 8px 1fr auto;
      align-items: center;
      gap: 8px;
      border-radius: 10px;
      padding: 6px 8px;
      background: rgba(255,255,255,.65);
      border: 1px solid rgba(148, 163, 184, .15);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
    }

    .donut-legend p {
      margin: 0;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
    }

    .donut-legend strong {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
    }

    .line-wrap {
      width: 100%;
      height: 180px;
    }

    .line-wrap .line {
      fill: none;
      stroke: #2563eb;
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .line-wrap .area {
      fill: rgba(37, 99, 235, .16);
    }

    .line-wrap circle {
      fill: #fff;
      stroke: #2563eb;
      stroke-width: 3;
    }

    .line-legend {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: 8px;
    }

    .line-legend div {
      border-radius: 10px;
      padding: 8px;
      background: rgba(255,255,255,.66);
      border: 1px solid rgba(148,163,184,.2);
      display: grid;
      gap: 4px;
    }

    .line-legend span {
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
    }

    .line-legend strong {
      color: #0f172a;
      font-size: 13px;
      font-weight: 900;
    }

    @media (max-width: 720px) {
      .donut-wrap {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartCardComponent {
  @Input() chart: DashboardChartSeries | null = null;

  hasData(): boolean {
    return this.values().some(value => Number(value) > 0);
  }

  labels(): string[] {
    return this.chart?.labels ?? [];
  }

  values(): number[] {
    return this.chart?.values ?? [];
  }

  totalValue(): number {
    return this.values().reduce((acc, value) => acc + value, 0);
  }

  maxValue(): number {
    return Math.max(...this.values(), 1);
  }

  barItems(): Array<{ label: string; value: number; percent: number; color: string }> {
    const labels = this.labels();
    const values = this.values();
    const max = this.maxValue();
    return values.map((value, index) => ({
      label: labels[index] ?? `Serie ${index + 1}`,
      value,
      percent: Math.max(0, Math.min((value / max) * 100, 100)),
      color: this.seriesColor(index, this.chart?.tone || 'primary')
    }));
  }

  points(): Array<{ index: number; x: number; y: number }> {
    const values = this.values();
    if (values.length === 0) {
      return [];
    }
    const max = this.maxValue();
    const width = 560;
    const height = 200;
    return values.map((value, index) => ({
      index,
      x: 20 + ((width - 40) / Math.max(values.length - 1, 1)) * index,
      y: height - ((value / max) * (height - 32)) - 16
    }));
  }

  linePath(): string {
    const points = this.points();
    if (points.length === 0) {
      return '';
    }
    return `M ${points.map(point => `${point.x} ${point.y}`).join(' L ')}`;
  }

  areaPath(): string {
    const points = this.points();
    if (points.length === 0) {
      return '';
    }
    const first = points[0];
    const last = points[points.length - 1];
    return `M ${first.x} 220 L ${points.map(point => `${point.x} ${point.y}`).join(' L ')} L ${last.x} 220 Z`;
  }

  donutStyle(): Record<string, string> {
    const items = this.barItems();
    const total = Math.max(this.totalValue(), 1);
    let cursor = 0;
    const slices = items.map((item, index) => {
      const size = (item.value / total) * 100;
      const start = cursor;
      cursor += size;
      return `${this.seriesColor(index, this.chart?.tone || 'primary')} ${start}% ${cursor}%`;
    });

    return {
      background: `conic-gradient(${slices.join(', ')})`
    };
  }

  private seriesColor(index: number, tone: UiTone): string {
    const palettes: Record<UiTone, string[]> = {
      primary: ['#2563eb', '#4f46e5', '#7c3aed', '#9333ea'],
      info: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'],
      success: ['#059669', '#10b981', '#22c55e', '#4ade80'],
      warning: ['#d97706', '#f59e0b', '#fbbf24', '#fcd34d'],
      danger: ['#dc2626', '#ef4444', '#f87171', '#fca5a5'],
      neutral: ['#475569', '#64748b', '#94a3b8', '#cbd5e1']
    };
    const colors = palettes[tone] ?? palettes.primary;
    return colors[index % colors.length];
  }
}
