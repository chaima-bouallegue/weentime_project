import { Component, Input, Output, EventEmitter, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X, Save, Edit3, Plus, Shield } from 'lucide-angular';
import { RoleService } from '../../role.service';
import { Role, RoleNom, RoleRequest } from '../../role.model';
import { ToastService } from '../../../../../core/services/toast.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './role-form.component.html',
  styleUrls: ['./role-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleFormComponent {
  @Input() set role(val: Role | null) {
    this._role.set(val);
    if (val) {
      this.nom = val.nom;
      this.description = val.description;
    } else {
      this.nom = RoleNom.ROLE_EMPLOYEE;
      this.description = '';
    }
  }
  get role() { return this._role(); }

  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private roleService = inject(RoleService);
  private toastService = inject(ToastService);

  private _role = signal<Role | null>(null);
  
  nom: RoleNom = RoleNom.ROLE_EMPLOYEE;
  description = '';
  saving = signal(false);

  // Enum array iteration helper
  roleNoms = Object.values(RoleNom);

  readonly iconX = X;
  readonly iconSave = Save;
  readonly iconEdit = Edit3;
  readonly iconPlus = Plus;
  readonly iconShield = Shield;

  onSubmit(): void {
    if (!this.nom) {
      this.toastService.error('Le nom du rôle est requis.');
      return;
    }

    const request: RoleRequest = {
      nom: this.nom,
      description: this.description
    };

    this.saving.set(true);

    if (this._role()) {
      // Edit
      this.roleService.updateRole(this._role()!.id, request)
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.toastService.success('Rôle mis à jour.');
            this.saved.emit();
          },
          error: (err) => this.toastService.error(err.error?.message || 'Erreur lors de la mise à jour.')
        });
    } else {
      // Create
      this.roleService.createRole(request)
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.toastService.success('Rôle créé avec succès.');
            this.saved.emit();
          },
          error: (err) => this.toastService.error(err.error?.message || 'Erreur lors de la création.')
        });
    }
  }
}
