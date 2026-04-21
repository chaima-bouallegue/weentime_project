import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StatsWorkflow } from '../../../../shared/models/workflow-teletravail.model';

@Component({
  selector: 'app-stats-cards',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './stats-cards.component.html',
  styleUrl: './stats-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatsCardsComponent {
  @Input() stats: StatsWorkflow | null = null;
  @Input() isLoading = false;
}
