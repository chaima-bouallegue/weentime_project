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
      border: 1px solid rgba(148, 163, 184, 0.1);
      border-radius: 20px;
      padding: 3px 10px;
      background: white;
      color: #64748b;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 13px;
      box-shadow: 0 2px 4px rgba(15, 23, 42, 0.02);
    }

    .comm-reaction:hover:not(:disabled) {
      background: #f8fafc;
      border-color: rgba(83, 74, 183, 0.2);
      transform: translateY(-1px);
    }

    .comm-reaction.active {
      background: #EEEDFE;
      color: #534AB7;
      border-color: rgba(83, 74, 183, 0.3);
      box-shadow: 0 4px 10px rgba(83, 74, 183, 0.1);
    }

    .comm-reaction small {
      font-weight: 700;
    }
  `]
})
export class ReactionBarComponent {
  @Input() reactions: ReactionSummaryModel[] = [];
  @Input() disabled = false;
  @Output() toggle = new EventEmitter<string>();
}
