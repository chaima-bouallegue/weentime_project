import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../structure.service';
import { Departement } from '../../models/structure.model';
import { DepartementFormComponent } from './departement-form/departement-form.component';
import { ToastService } from '../../../../../core/services/toast.service';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';
import { OverlayDrawerService } from '../../../../../core/services/overlay-drawer.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

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
  private drawerService = inject(OverlayDrawerService);

  departements = this.structureStore.departements;
  isLoading = this.structureStore.isLoading;
  showDrawer = signal(false);
  departementToEdit = signal<Departement | null>(null);
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
    const extra = dept.nombreEquipes > 0
      ? `Ce département contient ${dept.nombreEquipes} équipes et ${dept.nombreEmployes} employés.`
      : '';
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Supprimer « ${dept.nom} » ?`,
        message: 'Cette action est irréversible.',
        confirmText: 'Supprimer',
        iconName: 'alert-triangle',
        type: 'danger',
        extraMessage: extra,
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.isDeleting.set(true);
      this.structureService.deleteDepartement(dept.id).subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.toastService.success('Département supprimé');
          this.structureStore.deleteDepartement(dept.id);
        },
        error: () => this.isDeleting.set(false)
      });
    });
  }
}
