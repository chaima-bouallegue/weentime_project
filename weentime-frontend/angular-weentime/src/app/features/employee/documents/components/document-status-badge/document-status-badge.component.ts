import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StatutDocument } from '../../models/document.model';

interface BadgeConfig {
  label: string;
  icon: string;
  colorClass: string;
}

const BADGE_MAP: Record<StatutDocument, BadgeConfig> = {
  EN_ATTENTE: { label: 'En attente', icon: 'clock', colorClass: 'badge-warning' },
  EN_COURS: { label: 'En cours', icon: 'loader-2', colorClass: 'badge-info' },
  PRET: { label: 'Prêt', icon: 'check', colorClass: 'badge-success' },
  REFUSE: { label: 'Refusé', icon: 'x', colorClass: 'badge-danger' },
  ANNULE: { label: 'Annulé', icon: 'minus-circle', colorClass: 'badge-neutral' }
};

@Component({
  selector: 'app-document-status-badge',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-status-badge.component.html',
  styleUrl: './document-status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentStatusBadgeComponent {
  @Input({ required: true }) statut!: StatutDocument;

  get config(): BadgeConfig {
    return BADGE_MAP[this.statut];
  }
}
