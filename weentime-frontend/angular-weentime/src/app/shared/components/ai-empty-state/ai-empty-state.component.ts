import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ai-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-empty-state.component.html',
  styleUrls: ['./ai-empty-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiEmptyStateComponent {
  @Input() title = 'Aucune anomalie détectée';
  @Input() subtitle = "L'IA surveille en temps réel";
  @Input() statusLabel = 'Surveillance active';
}
