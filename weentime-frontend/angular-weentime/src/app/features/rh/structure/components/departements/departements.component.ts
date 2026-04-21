import { Component, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StructureService } from '../../structure.service';
import { Departement } from '../../models/structure.model';
import { DepartementFormComponent } from './departement-form/departement-form.component';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-departements',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DepartementFormComponent],
  templateUrl: './departements.component.html',
  styleUrl: './departements.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepartementsComponent {
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  departements = signal<Departement[]>([]);
  isLoading = signal(true);
  showDrawer = signal(false);
  departementToEdit = signal<Departement | null>(null);
  showDeleteConfirm = signal<Departement | null>(null);
  isDeleting = signal(false);

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.structureService.getDepartements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.departements.set(data); this.isLoading.set(false); },
        error: () => this.isLoading.set(false)
      });
  }

  refresh(): void {
    this.isLoading.set(true);
    this.structureService.getDepartements().subscribe({
      next: (data) => { this.departements.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false)
    });
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
        this.refresh();
      },
      error: () => this.isDeleting.set(false)
    });
  }
}
