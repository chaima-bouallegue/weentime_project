import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeTeletravailWorkflow, TypeTeletravail } from '../../../../shared/models/workflow-teletravail.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';

@Component({
  selector: 'app-demandes-rh-list',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DateFrPipe],
  templateUrl: './demandes-rh-list.component.html',
  styleUrl: './demandes-rh-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemandesRhListComponent {
  @Input() demandes: DemandeTeletravailWorkflow[] = [];
  @Input() isLoading = false;

  @Output() approuver = new EventEmitter<DemandeTeletravailWorkflow>();
  @Output() refuser = new EventEmitter<DemandeTeletravailWorkflow>();

  getTypeIcon(type: TypeTeletravail): string {
    switch (type) {
      case 'JOURNEE_COMPLETE': return 'sun';
      case 'DEMI_JOURNEE_MATIN': return 'sunrise';
      case 'DEMI_JOURNEE_APRES_MIDI': return 'sunset';
      case 'SEMAINE_COMPLETE': return 'home';
      default: return 'laptop';
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

  getAvatarColor(initiales: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    let hash = 0;
    for (let i = 0; i < initiales.length; i++) hash = initiales.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  truncateMotif(motif: string, max: number = 80): string {
    return motif.length > max ? motif.substring(0, max) + '…' : motif;
  }
}
