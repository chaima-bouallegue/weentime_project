import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../structure.service';
import { Departement, EmployeRH, Equipe } from '../../models/structure.model';
import { ManagerFormComponent } from './manager-form/manager-form.component';
import { ToastService } from '../../../../../core/services/toast.service';
import { EmployeFormComponent } from '../employes/employe-form/employe-form.component';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';

@Component({
  selector: 'app-managers',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ManagerFormComponent, EmployeFormComponent],
  templateUrl: './managers.component.html',
  styleUrl: './managers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagersComponent {
  private structureStore = inject(RhStructureStore);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  managers = this.structureStore.managers;
  equipesSansManager = this.structureStore.equipesSansManager;
  departements = this.structureStore.departements;
  equipes = this.structureStore.equipes;
  isLoading = this.structureStore.isLoading;
  
  showAssignModal = signal<EmployeRH | null>(null);
  showCreateDrawer = signal(false);

  refresh(): void {
    this.structureStore.loadAll(true).subscribe();
  }

  onManagerCreated(): void {
    this.showCreateDrawer.set(false);
    this.toastService.success('Manager cree');
    this.refresh();
  }

  onToggleStatus(id: number): void {
    const currentList = this.managers();
    const manager = currentList.find(e => e.id === id);
    if (!manager) return;

    this.structureService.toggleEmployeStatus(id).subscribe({
      next: (updated) => {
        this.structureStore.updateEmploye(updated);
        // Also refresh managers list specifically if needed, but the store handles structure
        this.refresh();
        this.toastService.success('Statut mis à jour');
      },
      error: () => {
        this.toastService.error('Erreur lors du changement de statut');
      }
    });
  }

  onAssigned(): void {
    this.showAssignModal.set(null);
    this.toastService.success('Équipe assignée');
    this.refresh();
  }

  getInitials(prenom: string, nom: string): string {
    return ((prenom[0] ?? '') + (nom[0] ?? '')).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }
}
