import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { LucideAngularModule, Plus, RefreshCw } from 'lucide-angular';
import { ToastService } from '../../../core/services/toast.service';
import { Role } from './role.model';
import { RoleService } from './role.service';
import { RoleListComponent } from './components/role-list/role-list.component';
import { RoleFormComponent } from './components/role-form/role-form.component';

@Component({
  selector: 'app-admin-roles',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RoleListComponent, RoleFormComponent],
  templateUrl: './admin-roles.component.html',
  styleUrl: './admin-roles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRolesComponent {
  private readonly roleService = inject(RoleService);
  private readonly toast = inject(ToastService);

  readonly iconRefresh = RefreshCw;
  readonly iconPlus = Plus;

  readonly roles = signal<Role[]>([]);
  readonly isLoading = signal(false);
  readonly isFormOpen = signal(false);
  readonly roleToEdit = signal<Role | null>(null);

  constructor() {
    this.loadRoles();
  }

  loadRoles(): void {
    this.isLoading.set(true);
    this.roleService.getAllRoles()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: roles => this.roles.set(roles ?? []),
        error: () => this.toast.error('Impossible de charger les roles')
      });
  }

  openCreateForm(): void {
    this.roleToEdit.set(null);
    this.isFormOpen.set(true);
  }

  openEditForm(role: Role): void {
    this.roleToEdit.set(role);
    this.isFormOpen.set(true);
  }

  onFormSaved(): void {
    this.isFormOpen.set(false);
    this.loadRoles();
  }

  onDelete(roleOrId: Role | number): void {
    const id = typeof roleOrId === 'number' ? roleOrId : roleOrId?.id;
    if (!id) {
      return;
    }
    this.roleService.deleteRole(id).subscribe({
      next: () => {
        this.toast.success('Role supprime');
        this.loadRoles();
      },
      error: () => this.toast.error('Suppression impossible')
    });
  }
}
