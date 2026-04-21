import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, RefreshCw, UserPlus } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RhOwnerService } from './rh-owner.service';
import { RhOwner, EntrepriseSelectItem } from './models/rh-owner.model';
import { RhListComponent } from './components/rh-list/rh-list.component';
import { CreateRhFormComponent } from './components/create-rh-form/create-rh-form.component';

@Component({
  selector: 'app-admin-rh-owner',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RhListComponent, CreateRhFormComponent],
  templateUrl: './admin-rh-owner.component.html',
  styleUrl: './admin-rh-owner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminRhOwnerComponent {
  private rhOwnerService = inject(RhOwnerService);

  readonly iconRefresh = RefreshCw;
  readonly iconUserPlus = UserPlus;

  rhOwners = signal<RhOwner[]>([]);
  entreprises = signal<EntrepriseSelectItem[]>([]);
  isLoading = signal(true);
  showDrawer = signal(false);
  searchQuery = signal('');

  rhFiltre = computed(() => {
    const owners = Array.isArray(this.rhOwners()) ? this.rhOwners() : [];
    const query = this.searchQuery().toLowerCase();

    return owners.filter(rh =>
      rh.nom.toLowerCase().includes(query) ||
      rh.prenom.toLowerCase().includes(query) ||
      rh.entrepriseNom.toLowerCase().includes(query)
    );
  });

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    this.rhOwnerService.getRhOwners()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (data) => {
          this.rhOwners.set(Array.isArray(data) ? data : []);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      });

    this.rhOwnerService.getEntreprisesForSelect()
      .pipe(takeUntilDestroyed())
      .subscribe(data => this.entreprises.set(Array.isArray(data) ? data : []));
  }

  refreshList(): void {
    this.isLoading.set(true);
    this.rhOwnerService.getRhOwners().subscribe({
      next: (data) => {
        this.rhOwners.set(Array.isArray(data) ? data : []);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  onToggleStatus(id: number): void {
    this.rhOwnerService.toggleRhStatus(id).subscribe(() => this.refreshList());
  }

  onFormSaved(): void {
    this.showDrawer.set(false);
    this.refreshList();
  }
}
