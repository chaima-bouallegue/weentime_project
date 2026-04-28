import { Component, ChangeDetectionStrategy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ProfileService, UpdateProfileRequest, UserProfile } from '../../profile.service';
import { StructureService } from '../../../rh/structure/structure.service';
import { Departement } from '../../../rh/structure/models/structure.model';

@Component({
  selector: 'app-profile-info',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!editing()) {
      <div class="info-grid">
        @for (field of displayFields(); track field.label) {
          <div class="info-field">
            <div class="field-icon">
              <lucide-icon [name]="field.icon" size="16"></lucide-icon>
            </div>
            <div class="field-content">
              <p class="field-label">{{ field.label }}</p>
              <p class="field-value" [class.not-set]="!field.value">
                {{ field.value || 'Non renseigne' }}
              </p>
            </div>
          </div>
        }
      </div>
      <button (click)="startEditing()" class="edit-btn">
        <lucide-icon name="edit-3" size="16"></lucide-icon>
        Modifier le profil
      </button>
    } @else {
      <form [formGroup]="form" (ngSubmit)="onSave()" class="edit-form">
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Prenom</label>
            <input formControlName="prenom" class="form-input" placeholder="Prenom" />
          </div>
          <div class="form-field">
            <label class="form-label">Nom</label>
            <input formControlName="nom" class="form-input" placeholder="Nom" />
          </div>

          <div class="form-field col-span-2">
            <label class="form-label">
              Email
              <span class="form-hint">
                <lucide-icon name="lock" size="12"></lucide-icon>
                Non modifiable
              </span>
            </label>
            <input [value]="profile()?.email ?? ''" disabled class="form-input disabled" />
          </div>

          <div class="form-field">
            <label class="form-label">Telephone</label>
            <input formControlName="telephone" class="form-input" placeholder="+216 XX XXX XXX" />
          </div>
          <div class="form-field">
            <label class="form-label">Poste</label>
            <input formControlName="poste" class="form-input" placeholder="Ex: Developpeur Senior" />
          </div>

          <div class="form-field col-span-2">
            <label class="form-label">Departement</label>
            <select formControlName="departementId" class="form-input">
              <option [value]="0">Selectionnez un departement</option>
              @for (dept of departements(); track dept.id) {
                <option [value]="dept.id">{{ dept.nom }}</option>
              }
            </select>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" (click)="cancelEditing()" class="btn-cancel">Annuler</button>
          <button type="submit" [disabled]="form.invalid || saving()" class="btn-save">
            @if (saving()) {
              <lucide-icon name="loader-2" size="16" class="animate-spin"></lucide-icon>
            }
            {{ saving() ? 'Enregistrement...' : 'Enregistrer' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [`
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 640px) { .info-grid { grid-template-columns: 1fr; } }

    .info-field {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; border-radius: 12px;
      background: #f8fafc; border: 1px solid #f1f5f9;
      transition: all 0.2s;
    }
    :host-context(.dark) .info-field { background: #1a1f2e; border-color: #2d3548; }

    .field-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      background: #fff; color: #6366f1; flex-shrink: 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    :host-context(.dark) .field-icon { background: #0f172a; color: #818cf8; }

    .field-content { display: flex; flex-direction: column; }
    .field-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
    .field-value { font-size: 14px; font-weight: 600; color: #1e293b; margin: 1px 0 0; }
    :host-context(.dark) .field-value { color: #e2e8f0; }

    .field-value.not-set { font-style: italic; color: #94a3b8; font-weight: 500; }

    .edit-btn {
      display: flex; align-items: center; gap: 8px;
      margin-top: 24px; padding: 10px 20px; border-radius: 12px;
      border: 1px solid #e2e8f0; background: #fff; color: #475569;
      font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s;
    }
    .edit-btn:hover { background: #f8fafc; border-color: #6366f1; color: #6366f1; }
    :host-context(.dark) .edit-btn { background: #1a1f2e; border-color: #2d3548; color: #94a3b8; }
    :host-context(.dark) .edit-btn:hover { border-color: #818cf8; color: #818cf8; }

    .edit-form { display: flex; flex-direction: column; gap: 20px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
    .col-span-2 { grid-column: span 2; }

    .form-field { display: flex; flex-direction: column; gap: 6px; }
    .form-label { font-size: 12px; font-weight: 700; color: #64748b; display: flex; align-items: center; gap: 6px; }
    :host-context(.dark) .form-label { color: #94a3b8; }

    .form-hint { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: #94a3b8; font-weight: 600; }

    .form-input {
      padding: 10px 14px; border-radius: 10px;
      border: 1px solid #e2e8f0; background: #fff;
      font-size: 14px; font-weight: 500; color: #1e293b;
      outline: none; transition: all 0.2s;
    }
    .form-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .form-input.disabled { background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }
    :host-context(.dark) .form-input { background: #141821; border-color: #2d3548; color: #e2e8f0; }
    :host-context(.dark) .form-input.disabled { background: #0f1117; color: #64748b; }

    .form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 10px; }

    .btn-cancel {
      padding: 10px 20px; border-radius: 10px;
      border: 1px solid #e2e8f0; background: #fff;
      font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; transition: all 0.2s;
    }
    .btn-cancel:hover { background: #f8fafc; }
    :host-context(.dark) .btn-cancel { background: #1a1f2e; border-color: #2d3548; color: #94a3b8; }

    .btn-save {
      padding: 10px 24px; border-radius: 10px; border: none;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; gap: 6px;
    }
    .btn-save:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ProfileInfoComponent implements OnInit {
  profile = input.required<UserProfile | null>();
  profileUpdated = output<UserProfile>();
  profileSaved = output<UserProfile>();

  private fb = inject(FormBuilder);
  private profileService = inject(ProfileService);
  private authService = inject(AuthService);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  editing = signal(false);
  saving = signal(false);
  departements = signal<Departement[]>([]);

  form = this.fb.nonNullable.group({
    prenom: ['', [Validators.required, Validators.minLength(2)]],
    nom: ['', [Validators.required, Validators.minLength(2)]],
    telephone: [''],
    poste: [''],
    departementId: [0]
  });

  ngOnInit(): void {
    this.structureService.getDepartements().subscribe({
      next: depts => this.departements.set(depts),
      error: () => this.departements.set([])
    });
  }

  displayFields = computed(() => {
    const p = this.profile();
    if (!p) {
      return [];
    }

    return [
      { label: 'Prenom', value: p.prenom, icon: 'user' },
      { label: 'Nom', value: p.nom, icon: 'user' },
      { label: 'Email', value: p.email, icon: 'mail' },
      { label: 'Telephone', value: p.telephone, icon: 'phone' },
      { label: 'Poste', value: p.poste, icon: 'briefcase' },
      { label: 'Departement', value: p.departement?.nom ?? 'Non assigné', icon: 'building-2' },
      { label: 'Entreprise', value: p.entreprise?.nom ?? 'Non assigné', icon: 'building' }
    ];
  });

  startEditing(): void {
    const p = this.profile();
    if (p) {
      this.form.patchValue({
        prenom: p.prenom,
        nom: p.nom,
        telephone: p.telephone ?? '',
        poste: p.poste ?? '',
        departementId: p.departement?.id ?? 0
      });
    }
    this.editing.set(true);
  }

  cancelEditing(): void {
    this.editing.set(false);
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const rawValue = this.form.getRawValue();
    const data: UpdateProfileRequest = {
      nom: rawValue.nom,
      prenom: rawValue.prenom,
      telephone: rawValue.telephone,
      poste: rawValue.poste,
      departementId: rawValue.departementId > 0 ? rawValue.departementId : undefined
    };

    this.profileService.updateProfile(data).subscribe({
      next: updated => {
        this.saving.set(false);
        this.editing.set(false);
        this.profileSaved.emit(updated);

        const current = this.authService.currentUser();
        if (current) {
          const updatedUser = {
            ...current,
            nom: updated.nom,
            prenom: updated.prenom
          };
          this.authService.currentUser.set(updatedUser);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }

        this.profileUpdated.emit(updated);
        this.toastService.success('Profil mis a jour avec succes.');
      },
      error: () => {
        this.saving.set(false);
        this.toastService.error('Erreur lors de la mise a jour du profil.');
      }
    });
  }
}
