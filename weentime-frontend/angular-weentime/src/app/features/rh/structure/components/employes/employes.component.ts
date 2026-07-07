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
import { OverlayDrawerService } from '../../../../../core/services/overlay-drawer.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-employes',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
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
  private drawerService = inject(OverlayDrawerService);

  employes = this.structureStore.employes;
  pendingEmployes = this.structureStore.pendingEmployes;
  departements = this.structureStore.departements;
  equipes = this.structureStore.equipes;
  managers = this.structureStore.managers;
  isLoading = this.structureStore.isLoading;
  
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

  openCreateEmployee(): void {
    const ref = this.drawerService.open<EmployeFormComponent>({
      component: EmployeFormComponent,
      inputs: {
        employee: null,
        embedded: true,
        departements: this.departements(),
        equipes: this.equipes(),
        managers: this.managers(),
      } as unknown as Partial<EmployeFormComponent>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).close?.subscribe(() => this.drawerService.close());
    (ref.componentRef.instance as any).saved?.subscribe(() => { this.drawerService.close(); this.refresh(); });
  }

  onOpenValidation(user: EmployeRH): void {
    const ref = this.drawerService.open<EmployeFormComponent>({
      component: EmployeFormComponent,
      inputs: {
        pendingUser: user,
        employee: null,
        isValidationMode: true,
        embedded: true,
        departements: this.departements(),
        equipes: this.equipes(),
        managers: this.managers(),
      } as unknown as Partial<EmployeFormComponent>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).close?.subscribe(() => this.drawerService.close());
    (ref.componentRef.instance as any).saved?.subscribe(() => { this.drawerService.close(); this.refresh(); });
    (ref.componentRef.instance as any).validate?.subscribe((ev: { id: number; request: any }) => {
      this.structureService.validateUser(ev.id, ev.request).subscribe({
        next: () => {
          this.drawerService.close();
          this.toastService.success('Le collaborateur a été validé avec succès.');
          this.refresh();
        },
        error: () => {
          this.toastService.error('Une erreur est survenue lors de la validation.');
        }
      });
    });
  }

  onOpenReject(user: EmployeRH): void {
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Rejeter l'inscription de « ${user.prenom} ${user.nom} » ?`,
        message: 'Cette action supprimera définitivement le compte en attente.',
        confirmText: 'Rejeter',
        iconName: 'x',
        type: 'danger',
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.isRejecting.set(true);
      this.structureService.rejectUser(user.id).subscribe({
        next: () => {
          this.isRejecting.set(false);
          this.toastService.success("La demande d'inscription a été rejetée et supprimée.");
          this.refresh();
        },
        error: () => {
          this.isRejecting.set(false);
          this.toastService.error('Une erreur est survenue lors du rejet.');
        }
      });
    });
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
