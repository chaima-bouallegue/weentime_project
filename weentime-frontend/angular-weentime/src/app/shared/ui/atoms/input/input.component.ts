import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'ui-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <label class="ui-input">
      <span *ngIf="label">{{ label }}</span>
      <input
        [type]="type"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [ngModel]="model"
        (ngModelChange)="modelChange.emit($event)" />
    </label>
  `,
  styles: [`
    .ui-input {
      display: grid;
      gap: 6px;
      color: #475569;
      font-size: 12px;
      font-weight: 700;
    }

    .ui-input input {
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, .38);
      background: rgba(255, 255, 255, .74);
      padding: 10px 12px;
      font-size: 13px;
      color: #0f172a;
      outline: none;
      transition: border-color .2s ease, box-shadow .2s ease;
    }

    .ui-input input:focus {
      border-color: rgba(79, 70, 229, .52);
      box-shadow: 0 0 0 4px rgba(99, 102, 241, .12);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiInputComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() type = 'text';
  @Input() model = '';
  @Input() disabled = false;
  @Output() modelChange = new EventEmitter<string>();
}
