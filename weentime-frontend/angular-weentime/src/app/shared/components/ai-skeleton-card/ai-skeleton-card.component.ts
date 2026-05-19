import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ai-skeleton-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-skeleton-card.component.html',
  styleUrls: ['./ai-skeleton-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiSkeletonCardComponent {}
