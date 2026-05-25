import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService } from '../../../core/services/theme.service';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { AuthService, LoginResponse } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, LucideAngularModule, LogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements AfterViewInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly themeService = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('emailInput') private emailInput?: ElementRef<HTMLInputElement>;

  protected readonly showPassword = signal(false);
  protected readonly isLoading = signal(false);
  protected readonly apiError = signal<string | null>(null);

  protected readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    rememberMe: [true]
  });

  constructor() {
    this.loginForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.apiError()) {
          this.apiError.set(null);
        }
      });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.emailInput?.nativeElement.focus(), 100);
  }

  protected onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.apiError.set(null);

    const formValue = this.loginForm.getRawValue();
    const credentials = {
      email: formValue.email.trim(),
      password: formValue.password
    };

    this.authService.login(credentials, formValue.rememberMe)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (response) => {
          if (response.mfaRequired || response.requiresTwoFactor || response.requires2FA) {
            void this.router.navigate(['/verify-2fa'], {
              state: {
                fromLogin: true,
                rememberMe: formValue.rememberMe,
                tempToken: response.mfaToken ?? response.temporaryToken ?? response.tempToken ?? null,
                availableMethods: ['TOTP']
              }
            });
            return;
          }

          this.redirectByRole(response);
        },
        error: (error) => {
          this.apiError.set(this.resolveLoginError(error));
        }
      });
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update(value => !value);
  }

  protected getFieldError(controlName: 'email' | 'password'): string {
    const control = this.loginForm.controls[controlName];

    if (!control.touched || !control.errors) {
      return '';
    }

    if (control.errors['required']) {
      return controlName === 'email' ? "L'adresse email est requise." : 'Le mot de passe est requis.';
    }

    if (control.errors['email']) {
      return 'Saisissez une adresse email valide.';
    }

    return 'Ce champ est invalide.';
  }

  protected fieldState(controlName: 'email' | 'password'): 'default' | 'invalid' | 'valid' {
    const control = this.loginForm.controls[controlName];

    if (!control.touched) {
      return 'default';
    }

    return control.invalid ? 'invalid' : 'valid';
  }

  private redirectByRole(response: LoginResponse): void {
    const role = response.user?.role || response.roles?.[0] || response.user?.roles?.[0] || '';

    if (!role) {
      this.authService.clearAuthState();
      this.apiError.set('Aucun role d acces n est associe a ce compte. Contactez votre administrateur.');
      return;
    }

    const destination = this.resolveRouteForRole(role);
    void this.router.navigate([destination]);
  }

  private resolveRouteForRole(role: string): string {
    const normalizedRole = role.startsWith('ROLE_') ? role.substring('ROLE_'.length) : role;
    switch (normalizedRole.toUpperCase()) {
      case 'ADMIN':
        return '/app/admin/dashboard';
      case 'RH':
        return '/app/rh/dashboard';
      case 'MANAGER':
        return '/app/manager/dashboard';
      case 'EMPLOYEE':
        return '/app/employee/dashboard';
      default:
        return '/';
    }
  }

  private resolveLoginError(error: { status?: number; message?: string; error?: { message?: string; details?: string } | string }): string {
    const backendMessage = typeof error?.error === 'string'
      ? error.error
      : error?.error?.message || error?.error?.details || error?.message;

    switch (error?.status) {
      case 401:
        return 'Email ou mot de passe incorrect.';
      case 403:
        return backendMessage || 'Votre compte est en attente de validation.';
      case 429:
        return 'Trop de tentatives de connexion. Reessayez plus tard.';
      case 0:
        return 'Impossible de joindre le serveur. Verifiez votre connexion.';
      default:
        return backendMessage || 'Connexion impossible pour le moment.';
    }
  }
}
