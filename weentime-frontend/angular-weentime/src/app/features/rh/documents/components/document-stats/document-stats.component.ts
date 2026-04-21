import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StatsDocuments } from '../../models/rh-document.model';

@Component({
  selector: 'app-document-stats',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-stats.component.html',
  styleUrl: './document-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentStatsComponent {
  @Input({ required: true }) stats: StatsDocuments | null = null;
}
