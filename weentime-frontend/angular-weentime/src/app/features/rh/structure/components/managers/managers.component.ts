import { Component, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StructureService } from '../../structure.service';
import { Departement, EmployeRH, Equipe } from '../../models/structure.model';
import { ManagerFormComponent } from './manager-form/manager-form.component';
import { ToastService } from '../../../../../core/services/toast.service';
import { EmployeFormComponent } from '../employes/employe-form/employe-form.component';

@Component({
  selector: 'app-managers',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, ManagerFormComponent, EmployeFormComponent],
  templateUrl: './managers.component.html',
  styleUrl: './managers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagersComponent {
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  managers = signal<EmployeRH[]>([]);
  equipesSansManager = signal<Equipe[]>([]);
  departements = signal<Departement[]>([]);
  equipes = signal<Equipe[]>([]);
  isLoading = signal(true);
  showAssignModal = signal<EmployeRH | null>(null);
  showCreateDrawer = signal(false);

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.structureService.getManagers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.managers.set(data); this.isLoading.set(false); },
        error: () => this.isLoading.set(false)
      });
    this.structureService.getEquipesSansManager()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.equipesSansManager.set(data));
    this.structureService.getDepartements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.departements.set(data));
    this.structureService.getEquipes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.equipes.set(data));
  }

  refresh(): void {
    this.isLoading.set(true);
    this.structureService.getManagers().subscribe({
      next: (data) => { this.managers.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false)
    });
    this.structureService.getEquipesSansManager()
      .subscribe(data => this.equipesSansManager.set(data));
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

    // Optimistic update
    const previousStatut = manager.statut;
    const newStatut = previousStatut === 'ACTIF' ? 'INACTIF' : 'ACTIF';
    this.managers.set(currentList.map(m => m.id === id ? { ...m, statut: newStatut } : m));

    this.structureService.toggleEmployeStatus(id).subscribe({
      next: (updated) => {
        this.managers.set(this.managers().map(m => m.id === id ? updated : m));
        this.toastService.success('Statut mis à jour');
      },
      error: () => {
        this.managers.set(currentList);
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
