import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ui-avatar" [style.width.px]="size" [style.height.px]="size" [style.fontSize.px]="fontSize()" [style.background]="background()">
      {{ initials() }}
    </div>
  `,
  styles: [`
    .ui-avatar {
      border-radius: 14px;
      display: grid;
      place-items: center;
      font-weight: 800;
      color: #fff;
      letter-spacing: .02em;
      box-shadow: 0 8px 20px rgba(79, 70, 229, .24);
      flex-shrink: 0;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiAvatarComponent {
  private readonly nameSignal = signal('WT');
  private readonly palette = [
    'linear-gradient(135deg, #2563eb, #6366f1)',
    'linear-gradient(135deg, #0ea5e9, #2563eb)',
    'linear-gradient(135deg, #10b981, #0ea5e9)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)'
  ];

  @Input() size = 40;

  @Input()
  set name(value: string | null | undefined) {
    this.nameSignal.set((value || 'WT').trim());
  }

  readonly initials = computed(() => {
    const parts = this.nameSignal().split(/\s+/).filter(Boolean);
    const source = parts.length > 0 ? parts.slice(0, 2).map(part => part.charAt(0)).join('') : this.nameSignal().slice(0, 2);
    return source.toUpperCase();
  });

  readonly background = computed(() => {
    const seed = this.nameSignal().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return this.palette[Math.abs(seed) % this.palette.length];
  });

  readonly fontSize = computed(() => Math.max(Math.floor(this.size * 0.34), 11));
}
