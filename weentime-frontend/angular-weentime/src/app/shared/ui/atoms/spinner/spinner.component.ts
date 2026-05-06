import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'ui-spinner',
  standalone: true,
  template: `
    <div class="ui-spinner" [style.width.px]="size" [style.height.px]="size"></div>
  `,
  styles: [`
    .ui-spinner {
      border: 2px solid rgba(99, 102, 241, .2);
      border-top-color: #4f46e5;
      border-radius: 999px;
      animation: spin .75s linear infinite;
      display: inline-block;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiSpinnerComponent {
  @Input() size = 18;
}
