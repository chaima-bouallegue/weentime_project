import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Home, Laptop, LucideAngularModule, LucideIconData, Sun, Sunrise, Sunset } from 'lucide-angular';
import { DemandeTeletravailWorkflow, TypeTeletravail } from '../../../../shared/models/workflow-teletravail.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';

@Component({
  selector: 'app-demandes-list',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DateFrPipe],
  templateUrl: './demandes-list.component.html',
  styleUrl: './demandes-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemandesListComponent {
  @Input() demandes: DemandeTeletravailWorkflow[] = [];
  @Input() isLoading = false;

  @Output() valider = new EventEmitter<DemandeTeletravailWorkflow>();
  @Output() refuser = new EventEmitter<DemandeTeletravailWorkflow>();

  getTypeIcon(type: TypeTeletravail): LucideIconData {
    switch (type) {
      case 'JOURNEE_COMPLETE': return Sun;
      case 'DEMI_JOURNEE_MATIN': return Sunrise;
      case 'DEMI_JOURNEE_APRES_MIDI': return Sunset;
      case 'SEMAINE_COMPLETE': return Home;
      default: return Laptop;
    }
  }

  getTypeColor(type: TypeTeletravail): string {
    switch (type) {
      case 'JOURNEE_COMPLETE': return '#6366f1';
      case 'DEMI_JOURNEE_MATIN': return '#3b82f6';
      case 'DEMI_JOURNEE_APRES_MIDI': return '#f59e0b';
      case 'SEMAINE_COMPLETE': return '#8b5cf6';
      default: return '#64748b';
    }
  }

  getAvatarColor(initiales: string | null | undefined): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    const value = initiales ?? '';
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = value.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  truncateMotif(motif: string | null | undefined, max: number = 80): string {
    const value = motif?.trim();
    if (!value) {
      return '-';
    }
    return value.length > max ? `${value.substring(0, max)}...` : value;
  }
}
