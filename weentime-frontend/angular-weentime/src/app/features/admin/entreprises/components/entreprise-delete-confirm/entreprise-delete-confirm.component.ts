import { Component, Input, Output, EventEmitter, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { Entreprise, EntrepriseService } from '../../entreprise.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-entreprise-delete-confirm',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './entreprise-delete-confirm.component.html',
  styleUrl: './entreprise-delete-confirm.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrepriseDeleteConfirmComponent {
  @Input() entreprise: Entreprise | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  private entrepriseService = inject(EntrepriseService);
  private toastService = inject(ToastService);
  
  isDeleting = signal(false);

  confirmDelete() {
    if (!this.entreprise) return;
    
    this.isDeleting.set(true);
    this.entrepriseService.deleteEntreprise(this.entreprise.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.toastService.success(`L'entreprise ${this.entreprise?.nom} a été désactivée.`);
        this.deleted.emit();
      },
      error: (err: any) => {
        this.isDeleting.set(false);
        this.toastService.error(err.error?.message || 'Erreur lors de la suppression');
      }
    });
  }
}
