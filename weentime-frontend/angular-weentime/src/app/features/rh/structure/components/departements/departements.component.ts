import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../structure.service';
import { Departement } from '../../models/structure.model';
import { DepartementFormComponent } from './departement-form/departement-form.component';
import { ToastService } from '../../../../../core/services/toast.service';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';

@Component({
  selector: 'app-departements',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DepartementFormComponent],
  templateUrl: './departements.component.html',
  styleUrl: './departements.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepartementsComponent {
  private structureStore = inject(RhStructureStore);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  departements = this.structureStore.departements;
  isLoading = this.structureStore.isLoading;
  showDrawer = signal(false);
  departementToEdit = signal<Departement | null>(null);
  showDeleteConfirm = signal<Departement | null>(null);
  isDeleting = signal(false);

  refresh(): void {
    this.structureStore.loadAll(true).subscribe();
  }

  openCreate(): void {
    this.departementToEdit.set(null);
    this.showDrawer.set(true);
  }

  openEdit(dept: Departement): void {
    this.departementToEdit.set(dept);
    this.showDrawer.set(true);
  }

  onFormSaved(): void {
    this.showDrawer.set(false);
    // The form itself or the resolver might refresh, but we force refresh to be sure
    this.refresh();
  }

  confirmDelete(dept: Departement): void {
    this.showDeleteConfirm.set(dept);
  }

  onDelete(): void {
    const dept = this.showDeleteConfirm();
    if (!dept) return;
    this.isDeleting.set(true);
    this.structureService.deleteDepartement(dept.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteConfirm.set(null);
        this.toastService.success('Département supprimé');
        this.structureStore.deleteDepartement(dept.id);
      },
      error: () => this.isDeleting.set(false)
    });
  }
}
