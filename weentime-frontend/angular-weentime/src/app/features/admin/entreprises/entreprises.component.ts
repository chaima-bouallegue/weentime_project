import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, MousePointerClick, Plus, RefreshCw } from 'lucide-angular';
import { EntrepriseService, Entreprise, StatutEntreprise } from './entreprise.service';
import { EntrepriseListComponent } from './components/entreprise-list/entreprise-list.component';
import { EntrepriseDetailComponent } from './components/entreprise-detail/entreprise-detail.component';
import { EntrepriseFormComponent } from './components/entreprise-form/entreprise-form.component';
import { EntrepriseDeleteConfirmComponent } from './components/entreprise-delete-confirm/entreprise-delete-confirm.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-entreprises',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    EntrepriseListComponent,
    EntrepriseDetailComponent,
    EntrepriseFormComponent,
    EntrepriseDeleteConfirmComponent
  ],
  templateUrl: './entreprises.component.html',
  styleUrl: './entreprises.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntreprisesComponent {
  private entrepriseService = inject(EntrepriseService);

  readonly iconRefresh = RefreshCw;
  readonly iconPlus = Plus;
  readonly iconMouse = MousePointerClick;

  // State Signals
  entreprises = signal<Entreprise[]>([]);
  loading = signal(true);
  selectedId = signal<number | null>(null);
  searchQuery = signal('');
  statusFilter = signal<'ALL' | StatutEntreprise>('ALL');

  // UI State Signals
  isFormOpen = signal(false);
  isDeleteConfirmOpen = signal(false);
  entrepriseToEdit = signal<Entreprise | null>(null);
  entrepriseToDelete = signal<Entreprise | null>(null);

  // Computed
  filteredEntreprises = computed(() => {
    let list = this.entreprises();
    const query = this.searchQuery().toLowerCase();
    const filter = this.statusFilter();

    if (query) {
      list = list.filter(e =>
        e.nom.toLowerCase().includes(query) ||
        e.siret.includes(query) ||
        (e.email && e.email.toLowerCase().includes(query))
      );
    }

    if (filter !== 'ALL') {
      list = list.filter(e => e.status === filter);
    }

    return list;
  });

  selectedEntreprise = computed(() => {
    const id = this.selectedId();
    return id ? this.entreprises().find(e => e.id === id) ?? null : null;
  });

  constructor() {
    this.loadEntreprises();
  }

  loadEntreprises(): void {
    this.loading.set(true);
    this.entrepriseService.getEntreprises().subscribe({
      next: (res) => {
        this.entreprises.set(res.content || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSelect(id: number): void {
    this.selectedId.set(id);
  }

  openCreateForm(): void {
    this.entrepriseToEdit.set(null);
    this.isFormOpen.set(true);
  }

  openEditForm(entreprise: Entreprise): void {
    this.entrepriseToEdit.set(entreprise);
    this.isFormOpen.set(true);
  }

  openDeleteConfirm(entreprise: Entreprise): void {
    this.entrepriseToDelete.set(entreprise);
    this.isDeleteConfirmOpen.set(true);
  }

  onFormSaved(): void {
    this.isFormOpen.set(false);
    this.loadEntreprises();
  }

  onDeleted(): void {
    this.isDeleteConfirmOpen.set(false);
    this.selectedId.set(null);
    this.loadEntreprises();
  }
}
