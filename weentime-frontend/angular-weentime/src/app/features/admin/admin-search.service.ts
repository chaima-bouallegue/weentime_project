import { Injectable, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AdminApiService } from './admin-api.service';

export interface AdminSearchItem {
  id: string;
  label: string;
  subtitle: string;
  type: 'user' | 'company';
  route: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminSearchService {
  private readonly api = inject(AdminApiService);

  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly items = signal<AdminSearchItem[]>([]);

  ensureIndexLoaded(): void {
    if (this.loaded() || this.loading()) {
      return;
    }

    this.loading.set(true);
    forkJoin({
      users: this.api.getUsers(0, 200),
      entreprises: this.api.getEntreprises(0, 200)
    }).subscribe({
      next: ({ users, entreprises }) => {
        this.items.set([
          ...users.content.map(user => ({
            id: `user-${user.id}`,
            label: `${user.prenom} ${user.nom}`.trim(),
            subtitle: `${user.email} · ${user.entrepriseNom || 'No company'}`,
            type: 'user' as const,
            route: '/app/admin/users',
            search: `${user.prenom} ${user.nom}`.trim()
          })),
          ...entreprises.content.map(entreprise => ({
            id: `company-${entreprise.id}`,
            label: entreprise.nom,
            subtitle: entreprise.email || entreprise.siret,
            type: 'company' as const,
            route: '/app/admin/entreprises',
            search: entreprise.nom
          }))
        ]);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }
}
