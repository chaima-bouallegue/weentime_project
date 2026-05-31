import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProfileService, ChangePasswordRequest } from '../../profile.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-profile-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="password-form">
      <!-- Current password -->
      <div class="form-field">
        <label class="form-label">Mot de passe actuel</label>
        <div class="input-wrapper">
          <lucide-icon name="lock" size="16" class="input-icon"></lucide-icon>
          <input
            [type]="showCurrent() ? 'text' : 'password'"
            formControlName="currentPassword"
            placeholder="••••••••"
            class="form-input" />
          <button type="button" (click)="showCurrent.set(!showCurrent())" class="eye-btn">
            <lucide-icon [name]="showCurrent() ? 'eye-off' : 'eye'" size="16"></lucide-icon>
          </button>
        </div>
      </div>

      <!-- New password -->
      <div class="form-field">
        <label class="form-label">Nouveau mot de passe</label>
        <div class="input-wrapper">
          <lucide-icon name="lock" size="16" class="input-icon"></lucide-icon>
          <input
            [type]="showNew() ? 'text' : 'password'"
            formControlName="newPassword"
            placeholder="••••••••"
            class="form-input" />
          <button type="button" (click)="showNew.set(!showNew())" class="eye-btn">
            <lucide-icon [name]="showNew() ? 'eye-off' : 'eye'" size="16"></lucide-icon>
          </button>
        </div>
        <!-- Strength bar -->
        <div class="strength-row">
          <div class="strength-bars">
            @for (i of [1,2,3,4]; track i) {
              <div class="bar" [class]="strength().score >= i ? strength().colorClass : 'bg-default'"></div>
            }
          </div>
          <span class="strength-label">{{ strength().label }}</span>
        </div>
      </div>

      <!-- Confirm password -->
      <div class="form-field">
        <label class="form-label">Confirmer le nouveau mot de passe</label>
        <div class="input-wrapper">
          <lucide-icon name="lock" size="16" class="input-icon"></lucide-icon>
          <input
            [type]="showConfirm() ? 'text' : 'password'"
            formControlName="confirmPassword"
            placeholder="••••••••"
            class="form-input" />
          <button type="button" (click)="showConfirm.set(!showConfirm())" class="eye-btn">
            <lucide-icon [name]="showConfirm() ? 'eye-off' : 'eye'" size="16"></lucide-icon>
          </button>
        </div>
        @if (form.hasError('passwordMismatch') && form.get('confirmPassword')?.touched) {
          <p class="error-msg">
            <lucide-icon name="alert-circle" size="12"></lucide-icon>
            Les mots de passe ne correspondent pas
          </p>
        }
        @if (form.hasError('sameAsOld') && form.get('newPassword')?.touched) {
          <p class="error-msg">
            <lucide-icon name="alert-circle" size="12"></lucide-icon>
            Le nouveau mot de passe doit être différent de l'actuel
          </p>
        }
      </div>

      <button type="submit" [disabled]="form.invalid || saving()" class="btn-submit">
        @if (saving()) {
          <lucide-icon name="loader-2" size="16" class="animate-spin"></lucide-icon>
        }
        {{ saving() ? 'Modification…' : 'Changer le mot de passe' }}
      </button>
    </form>
  `,
  styles: [`
    .password-form { display: flex; flex-direction: column; gap: 18px; max-width: 480px; }

    .form-field { display: flex; flex-direction: column; gap: 5px; }

    .form-label { font-size: 12px; font-weight: 700; color: #64748b; }
    :host-context(.dark) .form-label { color: #94a3b8; }

    .input-wrapper { position: relative; display: flex; align-items: center; }

    .input-icon {
      position: absolute; left: 12px; color: #94a3b8;
      pointer-events: none; z-index: 1;
    }

    .form-input {
      width: 100%; padding: 10px 40px 10px 36px; border-radius: 10px;
      border: 1px solid var(--border); background: #fff;
      font-size: 14px; font-weight: 500; color: #1e293b;
      outline: none; transition: all 0.2s; font-family: inherit;
    }
    .form-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    :host-context(.dark) .form-input { background: #141821; border-color: #2d3548; color: var(--border); }

    .eye-btn {
      position: absolute; right: 10px; background: none; border: none;
      cursor: pointer; color: #94a3b8; transition: color 0.15s;
      display: flex; padding: 4px;
    }
    .eye-btn:hover { color: #6366f1; }

    .strength-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .strength-bars { display: flex; gap: 3px; flex: 1; }
    .bar { height: 4px; flex: 1; border-radius: 4px; transition: all 0.3s; }
    .bg-default { background: #e2e8f0; }
    :host-context(.dark) .bg-default { background: #2d3548; }
    .bg-red { background: #ef4444; }
    .bg-orange { background: #f97316; }
    .bg-yellow { background: #eab308; }
    .bg-green { background: #10b981; }
    .strength-label { font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }

    .error-msg {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600; color: #ef4444; margin: 0;
    }

    .btn-submit {
      padding: 12px 24px; border-radius: 12px; border: none;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .btn-submit:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ProfilePasswordComponent {
  private fb = inject(FormBuilder);
  private profileService = inject(ProfileService);
  private toastService = inject(ToastService);

  showCurrent = signal(false);
  showNew = signal(false);
  showConfirm = signal(false);
  saving = signal(false);

  form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: [this.passwordMatchValidator, this.notSameAsOldValidator] });

  strength = () => {
    const pass = this.form.get('newPassword')?.value ?? '';
    if (!pass) return { score: 0, label: '', colorClass: 'bg-default' };

    let score = 0;
    if (pass.length >= 8) score = 1;
    if (pass.length >= 8 && /[a-z]/.test(pass) && /[A-Z]/.test(pass)) score = 2;
    if (score === 2 && /[0-9]/.test(pass)) score = 3;
    if (score === 3 && /[^a-zA-Z0-9]/.test(pass)) score = 4;

    const labels = ['', 'FAIBLE', 'MOYEN', 'FORT', 'TRÈS FORT'];
    const colors = ['bg-default', 'bg-red', 'bg-orange', 'bg-yellow', 'bg-green'];
    return { score, label: labels[score], colorClass: colors[score] };
  };

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPw = control.get('newPassword');
    const confirm = control.get('confirmPassword');
    if (!newPw || !confirm || !confirm.value) return null;
    return newPw.value === confirm.value ? null : { passwordMismatch: true };
  }

  notSameAsOldValidator(control: AbstractControl): ValidationErrors | null {
    const current = control.get('currentPassword');
    const newPw = control.get('newPassword');
    if (!current || !newPw || !newPw.value || !current.value) return null;
    return current.value !== newPw.value ? null : { sameAsOld: true };
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.saving.set(true);
    const data: ChangePasswordRequest = this.form.getRawValue();

    this.profileService.changePassword(data).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset();
        this.toastService.success('Mot de passe modifié avec succès.');
      },
      error: () => {
        this.saving.set(false);
        this.toastService.error('Erreur lors du changement de mot de passe.');
      }
    });
  }
}
