import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactionSummaryModel } from '../../models/communication.models';

@Component({
  selector: 'app-reaction-bar',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comm-reactions">
      <button
        type="button"
        *ngFor="let reaction of reactions"
        class="comm-reaction"
        [class.active]="reaction.reactedByMe"
        [disabled]="disabled"
        (click)="toggle.emit(reaction.emoji)">
        <span>{{ reaction.emoji }}</span>
        <small>{{ reaction.count }}</small>
      </button>

      <button type="button" class="comm-reaction add" [disabled]="disabled" (click)="toggle.emit('👍')">+ 👍</button>
    </div>
  `,
  styles: [`
    .comm-reactions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .comm-reaction {
      border: none;
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(226, 232, 240, 0.8);
      color: #334155;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      cursor: pointer;
    }

    .comm-reaction.active {
      background: rgba(14, 165, 233, 0.16);
      color: #0369a1;
    }

    .comm-reaction.add {
      background: rgba(15, 118, 110, 0.1);
      color: #0f766e;
    }
  `]
})
export class ReactionBarComponent {
  @Input() reactions: ReactionSummaryModel[] = [];
  @Input() disabled = false;
  @Output() toggle = new EventEmitter<string>();
}
