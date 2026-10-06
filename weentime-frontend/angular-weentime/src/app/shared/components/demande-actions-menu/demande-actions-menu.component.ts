import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-demande-actions-menu',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './demande-actions-menu.component.html',
  styleUrls: ['./demande-actions-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemandeActionsMenuComponent {
  @Input() canView = false;
  @Input() canEdit = false;
  @Input() canCancel = false;
  @Input() canDownload = false;

  @Input() viewLabel = 'Consulter les détails';
  @Input() editLabel = 'Modifier la demande';
  @Input() cancelLabel = 'Annuler la demande';
  @Input() downloadLabel = 'Télécharger';

  @Output() view = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
}
