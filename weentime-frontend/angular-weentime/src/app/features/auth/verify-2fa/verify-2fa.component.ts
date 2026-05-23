import { Component, OnInit, OnDestroy, inject, signal, viewChildren, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService, TwoFactorMethod } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

@Component({
  selector: 'app-verify-2fa',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LucideAngularModule, LogoComponent, RouterModule],
  templateUrl: './verify-2fa.component.html',
  styles: [`
    :host { display: block; }
    
    .otp-input {
      @apply w-12 h-14 text-center text-2xl font-bold bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-slate-900 dark:text-white;
    }

    .otp-input-error {
      @apply border-red-400 focus:border-red-500 focus:ring-red-500/10;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-5px); }
      40%, 80% { transform: translateX(5px); }
    }

    .shake {
      animation: shake 0.4s ease-in-out;
    }
  `]
})
export class Verify2faComponent implements OnInit, AfterViewInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  themeService = inject(ThemeService);

  tempToken = signal<string | null>(null);
  isLoading = signal(false);
  isSending = signal(false);
  error = signal<string | null>(null);
  showBackupOption = signal(false);
  availableMethods = signal<TwoFactorMethod[]>(['TOTP']);
  selectedMethod = signal<TwoFactorMethod>('TOTP');
  maskedEmail = signal<string | null>(null);
  maskedPhone = signal<string | null>(null);
  resendSeconds = signal(0);

  // Array of 6 digits
  digits = signal<string[]>(['', '', '', '', '', '']);

  private inputElements = viewChildren<ElementRef>('digitInput');
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    const navigationState = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    const tempToken = typeof navigationState?.tempToken === 'string' ? navigationState.tempToken : null;
    this.tempToken.set(tempToken);
    const methods = Array.isArray(navigationState?.availableMethods) && navigationState.availableMethods.length
      ? navigationState.availableMethods.map((method: string) => this.normalizeMethod(method)).filter(Boolean)
      : ['TOTP'];
    this.availableMethods.set([...new Set(methods)] as TwoFactorMethod[]);
    this.selectedMethod.set(this.availableMethods()[0] ?? 'TOTP');
    this.maskedEmail.set(typeof navigationState?.maskedEmail === 'string' ? navigationState.maskedEmail : null);
    this.maskedPhone.set(typeof navigationState?.maskedPhone === 'string' ? navigationState.maskedPhone : null);

    if (!this.tempToken()) {
      void this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    this.rememberMe = !!navigationState?.rememberMe;

    if (this.selectedMethod() !== 'TOTP') {
      this.sendCode();
    }
  }

  private rememberMe = false;

  ngAfterViewInit() {
    // Focus first input automatically
    setTimeout(() => {
      const inputs = this.inputElements();
      if (inputs.length > 0) {
        inputs[0].nativeElement.focus();
      }
    }, 500);
  }

  ngOnDestroy() {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  selectMethod(method: TwoFactorMethod) {
    if (this.selectedMethod() === method || this.isLoading()) return;
    this.selectedMethod.set(method);
    this.error.set(null);
    this.digits.set(['', '', '', '', '', '']);
    if (method !== 'TOTP') {
      this.sendCode();
    }
  }

  sendCode() {
    if (!this.tempToken() || this.selectedMethod() === 'TOTP' || this.resendSeconds() > 0) return;
    this.isSending.set(true);
    this.error.set(null);
    this.authService.send2faCode(this.selectedMethod(), this.tempToken()!).subscribe({
      next: () => {
        this.isSending.set(false);
        this.startResendCountdown();
      },
      error: (err) => {
        this.isSending.set(false);
        this.error.set(this.resolve2faError(err));
      }
    });
  }

  onInput(event: any, index: number) {
    const val = event.target.value;

    // Only allow numbers
    if (!/^\d*$/.test(val)) {
      this.digits.update(d => {
        d[index] = '';
        return [...d];
      });
      return;
    }

    // Handle pasting (if user pastes a 6 digit code)
    if (val.length > 1) {
      const pasteData = val.slice(0, 6).split('');
      this.digits.set([...pasteData, ...Array(6 - pasteData.length).fill('')].slice(0, 6));
      this.checkAndSubmit();
      return;
    }

    this.digits.update(d => {
      d[index] = val;
      return [...d];
    });

    if (val && index < 5) {
      this.inputElements()[index + 1].nativeElement.focus();
    }

    this.checkAndSubmit();
  }

  onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.inputElements()[index - 1].nativeElement.focus();
    }
  }

  checkAndSubmit() {
    const code = this.digits().join('');
    if (code.length === 6) {
      this.verify();
    }
  }

  verify() {
    const code = this.digits().join('');
    if (code.length < 6) return;

    this.isLoading.set(true);
    this.error.set(null);

    this.authService.verify2fa(code, this.tempToken()!, this.rememberMe, this.selectedMethod()).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        this.redirectByUserRole(res);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.error.set(this.resolve2faError(err));
        // Visual feedback
        this.digits.set(['', '', '', '', '', '']);
        this.inputElements()[0].nativeElement.focus();
      }
    });
  }

  private redirectByUserRole(res: any) {
    const rawRole = res.roles?.[0] || this.authService.currentUser()?.roles?.[0] || 'ROLE_EMPLOYEE';
    const role = rawRole.startsWith('ROLE_') ? rawRole : `ROLE_${rawRole}`.toUpperCase();

    switch (role) {
      case 'ROLE_ADMIN': this.router.navigate(['/app/admin/dashboard']); break;
      case 'ROLE_RH': this.router.navigate(['/app/rh/dashboard']); break;
      case 'ROLE_MANAGER': this.router.navigate(['/app/manager/dashboard']); break;
      case 'ROLE_EMPLOYEE': this.router.navigate(['/app/employee/dashboard']); break;
      default: this.router.navigate(['/']); break;
    }
  }

  toggleBackup() {
    this.showBackupOption.set(!this.showBackupOption());
    this.error.set(null);
  }

  methodLabel(method: TwoFactorMethod): string {
    switch (method) {
      case 'EMAIL': return 'Email';
      case 'SMS': return 'SMS';
      default: return 'Authenticator';
    }
  }

  methodHint(): string {
    switch (this.selectedMethod()) {
      case 'EMAIL':
        return this.maskedEmail() ? `Code envoyé à ${this.maskedEmail()}` : 'Code envoyé par email.';
      case 'SMS':
        return this.maskedPhone() ? `Code envoyé au ${this.maskedPhone()}` : 'Code envoyé par SMS.';
      default:
        return 'Entrez le code généré par votre application d’authentification.';
    }
  }

  private startResendCountdown() {
    this.resendSeconds.set(60);
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => {
      const next = this.resendSeconds() - 1;
      this.resendSeconds.set(Math.max(0, next));
      if (next <= 0 && this.resendTimer) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
    }, 1000);
  }

  private normalizeMethod(value: string): TwoFactorMethod | null {
    const normalized = value.toUpperCase() === 'AUTHENTICATOR' ? 'TOTP' : value.toUpperCase();
    return ['TOTP', 'EMAIL', 'SMS'].includes(normalized) ? normalized as TwoFactorMethod : null;
  }

  private resolve2faError(err: any): string {
    const reason = err?.error?.error || err?.error?.reason;
    if (err?.status === 0) return 'Service indisponible. Réessayez plus tard.';
    if (err?.status === 429 || reason === 'TOO_MANY_ATTEMPTS') return 'Trop de tentatives. Réessayez plus tard.';
    if (reason === 'OTP_EXPIRED' || reason === 'OTP_NOT_FOUND' || reason === 'INVALID_TEMP_TOKEN') return 'Code expiré.';
    return 'Code incorrect.';
  }
}
