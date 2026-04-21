import { Component, Input, Output, EventEmitter, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { EntrepriseSelectItem, CreateRhOwnerRequest } from '../../models/rh-owner.model';
import { RhOwnerService } from '../../rh-owner.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-create-rh-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './create-rh-form.component.html',
  styleUrl: './create-rh-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreateRhFormComponent implements OnInit {
  @Input() entreprises: EntrepriseSelectItem[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private rhOwnerService = inject(RhOwnerService);
  private toastService = inject(ToastService);

  form!: FormGroup;
  isSubmitting = signal(false);
  showPassword = signal(false);
  emailChecking = signal(false);
  emailUnique = signal(true);
  passwordStrength = signal<'weak' | 'medium' | 'strong'>('weak');

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.form = this.fb.group({
      prenom: ['', [Validators.required, Validators.minLength(2)]],
      nom: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      telephone: ['', [Validators.pattern(/^\+?[0-9\s\-]{8,}$/)]],
      motDePasse: ['', [Validators.required, Validators.minLength(8)]],
      entrepriseId: [null, [Validators.required]]
    });
  }

  generatePassword(): void {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const specials = '@#$%&!?*';

    // Format cible: Wt@2026Xk (10 caractères)
    // Structure: Upper + Lower + Special + 4 Digits + Upper + Lower
    let pwd = '';
    pwd += upper[Math.floor(Math.random() * upper.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];
    pwd += specials[Math.floor(Math.random() * specials.length)];
    pwd += Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
    pwd += upper[Math.floor(Math.random() * upper.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)]; // Total 10

    this.form.get('motDePasse')?.setValue(pwd);
    this.form.get('motDePasse')?.markAsTouched();
    this.evaluatePasswordStrength(pwd);
  }

  evaluatePasswordStrength(password: string): void {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) this.passwordStrength.set('weak');
    else if (score <= 3) this.passwordStrength.set('medium');
    else this.passwordStrength.set('strong');
  }

  onPasswordInput(): void {
    const pwd = this.form.get('motDePasse')?.value ?? '';
    this.evaluatePasswordStrength(pwd);
  }

  togglePasswordVisibility(): void {
    this.showPassword.update(v => !v);
  }

  copyPassword(): void {
    const pwd = this.form.get('motDePasse')?.value;
    if (pwd) {
      navigator.clipboard.writeText(pwd);
      this.toastService.success('Mot de passe copié');
    }
  }

  checkEmailUnique(): void {
    const email = this.form.get('email')?.value;
    if (!email || this.form.get('email')?.invalid) return;

    this.emailChecking.set(true);
    this.rhOwnerService.checkEmailUnique(email).subscribe({
      next: (unique) => {
        this.emailUnique.set(unique);
        this.emailChecking.set(false);
      },
      error: () => this.emailChecking.set(false)
    });
  }

  onSubmit(): void {
    if (this.form.invalid || !this.emailUnique()) return;

    this.isSubmitting.set(true);
    const data: CreateRhOwnerRequest = this.form.getRawValue();

    this.rhOwnerService.createRhOwner(data).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        const email = this.form.get('email')?.value;
        this.toastService.success(`Compte RH créé — identifiants envoyés à ${email}`);
        this.saved.emit();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toastService.error('Une erreur est survenue');
      }
    });
  }

  getSelectedEntreprise(): EntrepriseSelectItem | undefined {
    const id = this.form.get('entrepriseId')?.value;
    return this.entreprises.find(e => e.id === id);
  }
}
