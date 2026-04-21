import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-admin-stat-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="admin-stat-card admin-surface" [class.interactive]="interactive()">
      <div class="stat-top">
        <div class="stat-icon" [class]="tone()">
          <lucide-icon [name]="icon()" size="18"></lucide-icon>
        </div>
        @if (delta()) {
          <span class="delta" [class]="tone()">{{ delta() }}</span>
        }
      </div>

      <div class="stat-body">
        <p class="label">{{ label() }}</p>
        <strong class="value">{{ displayValue() }}</strong>
        @if (hint()) {
          <small>{{ hint() }}</small>
        }
      </div>
    </article>
  `,
  styles: [`
    .admin-stat-card {
      display: grid;
      gap: 18px;
      padding: 20px;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }

    .admin-stat-card.interactive:hover {
      transform: translateY(-2px) scale(1.01);
      box-shadow: 0 24px 50px rgba(15, 23, 42, 0.1);
      border-color: rgba(37, 99, 235, 0.24);
    }

    .stat-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .stat-icon,
    .delta {
      border-radius: 14px;
      font-weight: 800;
    }

    .stat-icon {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      background: rgba(37, 99, 235, 0.12);
      color: #2563eb;
    }

    .delta {
      padding: 6px 10px;
      background: rgba(15, 23, 42, 0.06);
      color: var(--saas-muted);
      font-size: 12px;
    }

    .delta.success,
    .stat-icon.success {
      background: rgba(22, 163, 74, 0.12);
      color: #15803d;
    }

    .delta.warning,
    .stat-icon.warning {
      background: rgba(245, 158, 11, 0.14);
      color: #b45309;
    }

    .delta.danger,
    .stat-icon.danger {
      background: rgba(239, 68, 68, 0.12);
      color: #dc2626;
    }

    .stat-body {
      display: grid;
      gap: 6px;
    }

    .label {
      margin: 0;
      color: var(--saas-muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .value {
      color: var(--saas-text);
      font-size: clamp(1.7rem, 2vw, 2.2rem);
      font-weight: 900;
      letter-spacing: -0.03em;
    }

    small {
      color: var(--saas-muted);
      line-height: 1.5;
    }
  `]
})
export class AdminStatCardComponent {
  private readonly destroyRef = inject(DestroyRef);
  private animationFrameId: number | null = null;

  readonly label = input.required<string>();
  readonly value = input<number | string>(0);
  readonly hint = input<string>('');
  readonly icon = input<string>('activity');
  readonly delta = input<string>('');
  readonly tone = input<'info' | 'success' | 'warning' | 'danger' | 'neutral'>('info');
  readonly interactive = input(true);

  readonly displayValue = signal('0');

  constructor() {
    effect(() => {
      const nextValue = this.value();
      if (typeof nextValue !== 'number' || !Number.isFinite(nextValue)) {
        this.displayValue.set(String(nextValue));
        return;
      }

      const start = performance.now();
      const initial = Number.parseFloat(this.displayValue()) || 0;
      const duration = 500;

      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }

      const animate = (timestamp: number) => {
        const progress = Math.min((timestamp - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = initial + ((nextValue - initial) * eased);
        this.displayValue.set(Number.isInteger(nextValue) ? Math.round(current).toLocaleString('fr-FR') : current.toFixed(1));
        if (progress < 1) {
          this.animationFrameId = requestAnimationFrame(animate);
        }
      };

      this.animationFrameId = requestAnimationFrame(animate);
    });

    this.destroyRef.onDestroy(() => {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
      }
    });
  }
}
