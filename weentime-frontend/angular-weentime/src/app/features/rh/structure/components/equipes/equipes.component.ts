import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../structure.service';
import { Equipe, Departement, EmployeRH } from '../../models/structure.model';
import { EquipeFormComponent } from './equipe-form/equipe-form.component';
import { ToastService } from '../../../../../core/services/toast.service';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';

@Component({
  selector: 'app-equipes',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    EquipeFormComponent
  ],
  templateUrl: './equipes.component.html',
  styleUrl: './equipes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipesComponent {
  private structureStore = inject(RhStructureStore);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  equipes = this.structureStore.equipes;
  departements = this.structureStore.departements;
  managers = this.structureStore.managers;
  isLoading = this.structureStore.isLoading;
  showDrawer = signal(false);
  equipeToEdit = signal<Equipe | null>(null);
  showDeleteConfirm = signal<Equipe | null>(null);
  isDeleting = signal(false);

  refresh(): void {
    this.structureStore.loadAll(true).subscribe();
  }

  getEquipesByDept(): { dept: string; equipes: Equipe[] }[] {
    const map = new Map<string, Equipe[]>();
    for (const eq of this.equipes()) {
      const list = map.get(eq.departementNom) ?? [];
      list.push(eq);
      map.set(eq.departementNom, list);
    }
    return Array.from(map.entries()).map(([dept, equipes]) => ({ dept, equipes }));
  }

  openCreate(): void {
    this.equipeToEdit.set(null);
    this.showDrawer.set(true);
  }

  openEdit(eq: Equipe): void {
    this.equipeToEdit.set(eq);
    this.showDrawer.set(true);
  }

  onFormSaved(): void {
    this.showDrawer.set(false);
    this.refresh();
  }

  confirmDelete(eq: Equipe): void {
    this.showDeleteConfirm.set(eq);
  }

  onDelete(): void {
    const eq = this.showDeleteConfirm();
    if (!eq) return;
    this.isDeleting.set(true);
    this.structureService.deleteEquipe(eq.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteConfirm.set(null);
        this.toastService.success('Équipe supprimée');
        this.structureStore.deleteEquipe(eq.id);
      },
      error: () => this.isDeleting.set(false)
    });
  }

  getInitials(name: string): string {
    if (!name) return '??';
    return name.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
