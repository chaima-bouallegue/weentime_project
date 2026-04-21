import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { StructureService } from '../../structure.service';
import { EmployeRH, Departement, Equipe } from '../../models/structure.model';
import { EmployeFormComponent } from './employe-form/employe-form.component';

@Component({
  selector: 'app-employes',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, EmployeFormComponent],
  templateUrl: './employes.component.html',
  styleUrl: './employes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployesComponent {
  private structureService = inject(StructureService);
  private destroyRef = inject(DestroyRef);

  employes = signal<EmployeRH[]>([]);
  departements = signal<Departement[]>([]);
  equipes = signal<Equipe[]>([]);
  isLoading = signal(true);
  showDrawer = signal(false);
  searchQuery = signal('');
  filterDept = signal<number | null>(null);
  filterStatut = signal<'ALL' | 'ACTIF' | 'INACTIF'>('ALL');
  currentPage = signal(1);
  pageSize = 10;

  private searchSubject = new Subject<string>();

  filteredEmployes = computed(() => {
    let list = this.employes();
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
    this.loadData();
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(q => {
      this.searchQuery.set(q);
      this.currentPage.set(1);
    });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.structureService.getEmployes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.employes.set(data); this.isLoading.set(false); },
        error: () => this.isLoading.set(false)
      });
    this.structureService.getDepartements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(d => this.departements.set(d));
    this.structureService.getEquipes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(e => this.equipes.set(e));
  }

  refresh(): void {
    this.isLoading.set(true);
    this.structureService.getEmployes().subscribe({
      next: (data) => { this.employes.set(data); this.isLoading.set(false); },
      error: () => this.isLoading.set(false)
    });
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

  onFormSaved(): void {
    this.showDrawer.set(false);
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

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
