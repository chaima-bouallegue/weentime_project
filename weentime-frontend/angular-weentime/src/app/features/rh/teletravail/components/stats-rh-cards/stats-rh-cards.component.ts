import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StatsRH } from '../../../../shared/models/workflow-teletravail.model';

@Component({
  selector: 'app-stats-rh-cards',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './stats-rh-cards.component.html',
  styleUrl: './stats-rh-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatsRhCardsComponent {
  @Input() stats: StatsRH | null = null;
  @Input() isLoading = false;
}
