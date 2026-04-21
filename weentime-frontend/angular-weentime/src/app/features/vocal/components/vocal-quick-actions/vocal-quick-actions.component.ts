// [WEENTIME-VOCAL] Quick Actions Component
import { Component, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-vocal-quick-actions',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quick-actions">
      <div class="actions-header">SUGGESTIONS :</div>
      <div class="actions-list">
        @for(action of suggestions; track action.label) {
          <button class="chip" (click)="triggerAction(action.phrase)">
            <lucide-icon [name]="action.icon" size="14"></lucide-icon>
            {{ action.label }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .quick-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .actions-header {
      font-size: 11px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      white-space: nowrap;
    }
    .actions-list {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: none; /* Firefox */
    }
    .actions-list::-webkit-scrollbar { display: none; }
    
    .chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-radius: 100px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.7);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      backdrop-filter: blur(8px);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .chip:hover {
      background: rgba(255, 255, 255, 0.15);
      color: white;
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
  `]
})
export class VocalQuickActionsComponent {
  @Output() actionTriggered = new EventEmitter<string>();

  suggestions = [
    { label: "Mon solde de congés", icon: "calendar", phrase: "Quel est mon solde de congés restant ?" },
    { label: "Pointer mon arrivée", icon: "arrow-right-circle", phrase: "Je pointe mon entrée" },
    { label: "Demande télétravail", icon: "laptop", phrase: "Je veux faire une demande de télétravail pour demain" },
    { label: "Absences équipe", icon: "users", phrase: "Qui est absent aujourd'hui dans mon équipe ?" },
    { label: "Check planning", icon: "calendar-clock", phrase: "Quel est mon planning cette semaine ?" }
  ];

  triggerAction(phrase: string): void {
    this.actionTriggered.emit(phrase);
  }
}
