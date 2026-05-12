import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Clock, CircleCheck, CircleX } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { StructureService } from '../../structure.service';
import { EmployeRH } from '../../models/structure.model';
import { EmployeFormComponent } from './employe-form/employe-form.component';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-employes',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, EmployeFormComponent],
  templateUrl: './employes.component.html',
  styleUrl: './employes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployesComponent {
  readonly ClockIcon = Clock;
  readonly CheckIcon = CircleCheck;
  readonly XIcon = CircleX;
  protected Math = Math;
  private structureStore = inject(RhStructureStore);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  employes = this.structureStore.employes;
  pendingEmployes = this.structureStore.pendingEmployes;
  departements = this.structureStore.departements;
  equipes = this.structureStore.equipes;
  managers = this.structureStore.managers;
  isLoading = this.structureStore.isLoading;
  
  showDrawer = signal(false);
  isValidationMode = signal(false);
  selectedPendingUser = signal<EmployeRH | null>(null);
  selectedRejectUser = signal<EmployeRH | null>(null);
  isRejecting = signal(false);
  
  searchQuery = signal('');
  filterDept = signal<number | null>(null);
  filterStatut = signal<'ALL' | 'ACTIF' | 'INACTIF'>('ALL');
  currentPage = signal(1);
  pageSize = 10;

  private searchSubject = new Subject<string>();

  filteredEmployes = computed(() => {
    let list = this.employes().filter(e => e.statut !== 'PENDING');
    const query = this.searchQuery().toLowerCase();
    const dept = this.filterDept();
    const statut = this.filterStatut();

    if (query) {
      list = list.filter(e =>
        e.nom.toLowerCase().includes(query) ||
        e.prenom.toLowerCase().includes(query) ||
        e.email.toLowerCase().includes(query) ||
        e.poste.toLowerCase().includes(query)
      );
    }
    if (dept) list = list.filter(e => e.departementId === dept);
    if (statut !== 'ALL') list = list.filter(e => e.statut === statut);
    return list;
  });

  paginatedEmployes = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredEmployes().slice(start, start + this.pageSize);
  });

  totalPages = computed(() => Math.ceil(this.filteredEmployes().length / this.pageSize) || 1);

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(q => {
      this.searchQuery.set(q);
      this.currentPage.set(1);
    });
  }

  refresh(): void {
    this.structureStore.loadAll(true).subscribe();
  }

  onSearchInput(value: string): void {
    this.searchSubject.next(value);
  }

  setDeptFilter(deptId: number | null): void {
    this.filterDept.set(deptId);
    this.currentPage.set(1);
  }

  setStatutFilter(statut: 'ALL' | 'ACTIF' | 'INACTIF'): void {
    this.filterStatut.set(statut);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  onToggleStatus(id: number): void {
    this.structureService.toggleEmployeStatus(id).subscribe(() => this.refresh());
  }

  onOpenValidation(user: EmployeRH): void {
    this.selectedPendingUser.set(user);
    this.isValidationMode.set(true);
    this.showDrawer.set(true);
  }

  onValidate(id: number, request: any): void {
    this.structureService.validateUser(id, request).subscribe({
      next: () => {
        this.showDrawer.set(false);
        this.selectedPendingUser.set(null);
        this.isValidationMode.set(false);
        this.toastService.success('Le collaborateur a été validé avec succès.');
        this.refresh();
      },
      error: () => {
        this.toastService.error('Une erreur est survenue lors de la validation.');
      }
    });
  }

  onOpenReject(user: EmployeRH): void {
    this.selectedRejectUser.set(user);
  }

  onCancelReject(): void {
    this.selectedRejectUser.set(null);
    this.isRejecting.set(false);
  }

  confirmReject(): void {
    const user = this.selectedRejectUser();
    if (!user) return;
    
    this.isRejecting.set(true);
    this.structureService.rejectUser(user.id).subscribe({
      next: () => {
        this.selectedRejectUser.set(null);
        this.isRejecting.set(false);
        this.toastService.success('La demande d\'inscription a été rejetée et supprimée.');
        this.refresh();
      },
      error: () => {
        this.isRejecting.set(false);
        this.toastService.error('Une erreur est survenue lors du rejet.');
      }
    });
  }

  onFormSaved(): void {
    this.showDrawer.set(false);
    this.isValidationMode.set(false);
    this.selectedPendingUser.set(null);
    this.refresh();
  }

  onCloseDrawer(): void {
    this.showDrawer.set(false);
    this.isValidationMode.set(false);
    this.selectedPendingUser.set(null);
  }

  getManagersForForm(): EmployeRH[] {
    return this.managers();
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

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
