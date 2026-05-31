import {
  Component, Input, Output, EventEmitter, inject,
  ChangeDetectionStrategy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X, Save, Edit3, Plus, Shield, Info } from 'lucide-angular';
import { RoleService } from '../../role.service';
import { Role, RoleRequest } from '../../role.model';
import { ToastService } from '../../../../../core/services/toast.service';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './role-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleFormComponent {

  @Input() set role(val: Role | null) {
    this._role.set(val);
    if (val) {
      this.nom = val.nom;
      this.description = val.description;
      this.nomInput = val.nom.startsWith('ROLE_') ? val.nom.substring(5) : val.nom;
    } else {
      this.nom = '';
      this.nomInput = '';
      this.description = '';
    }
  }
  get role() { return this._role(); }

  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private roleService = inject(RoleService);
  private toastService = inject(ToastService);

  private _role = signal<Role | null>(null);

  nom = '';
  nomInput = '';   // Partie saisie par l'utilisateur (sans préfixe ROLE_)
  description = '';
  saving = signal(false);

  /** Suggestions rapides — cliquables en mode création */
  readonly suggestions = [
    'EMPLOYEE', 'MANAGER', 'RH', 'ADMIN',
    'PHARMACIE', 'CLINIQUE', 'MEDECIN', 'CAISSIER', 'LIVREUR'
  ];

  readonly iconX = X;
  readonly iconSave = Save;
  readonly iconEdit = Edit3;
  readonly iconPlus = Plus;
  readonly iconShield = Shield;
  readonly iconInfo = Info;

  /** Normalise la saisie : majuscules, espaces → underscore, caractères invalides supprimés */
  onNomInputChange(val: string): void {
    this.nomInput = val.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    this.nom = this.nomInput ? `ROLE_${this.nomInput}` : '';
  }

  selectSuggestion(s: string): void {
    this.nomInput = s;
    this.nom = `ROLE_${s}`;
  }

  onSubmit(): void {
    if (!this.nom || this.nom === 'ROLE_') {
      this.toastService.error('Le nom du rôle est requis.');
      return;
    }
    if (!/^ROLE_[A-Z0-9_]+$/.test(this.nom)) {
      this.toastService.error('Format invalide. Ex: ROLE_PHARMACIE');
      return;
    }

    const request: RoleRequest = { nom: this.nom, description: this.description };
    this.saving.set(true);

    const action$ = this._role()
      ? this.roleService.updateRole(this._role()!.id, request)
      : this.roleService.createRole(request);

    action$.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.toastService.success(this._role() ? 'Rôle mis à jour.' : 'Rôle créé avec succès.');
        this.saved.emit();
      },
      error: (err) => this.toastService.error(err.error?.message || 'Erreur.')
    });
  }
}