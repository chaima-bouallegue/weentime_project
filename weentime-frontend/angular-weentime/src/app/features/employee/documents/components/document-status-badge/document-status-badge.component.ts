import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StatutDocument } from '../../models/document.model';

interface BadgeConfig {
  label: string;
  icon: string;
  colorClass: string;
}

const BADGE_MAP: Record<StatutDocument, BadgeConfig> = {
  EN_ATTENTE: { label: 'En attente RH', icon: 'clock', colorClass: 'badge-warning' },
  EN_COURS: { label: 'En cours', icon: 'loader-2', colorClass: 'badge-info' },
  PRET: { label: 'Pret', icon: 'check', colorClass: 'badge-success' },
  REFUSE: { label: 'Refuse', icon: 'x', colorClass: 'badge-danger' },
  ANNULE: { label: 'Annule', icon: 'minus-circle', colorClass: 'badge-neutral' },
  PENDING: { label: 'En attente', icon: 'clock', colorClass: 'badge-warning' },
  GENERATING: { label: 'Generation', icon: 'loader-2', colorClass: 'badge-info' },
  READY: { label: 'Pret', icon: 'check', colorClass: 'badge-success' },
  REJECTED: { label: 'Refuse', icon: 'x', colorClass: 'badge-danger' },
};

@Component({
  selector: 'app-document-status-badge',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-status-badge.component.html',
  styleUrl: './document-status-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentStatusBadgeComponent {
  @Input({ required: true }) statut!: StatutDocument;

  get config(): BadgeConfig {
    return BADGE_MAP[this.statut];
  }
}
