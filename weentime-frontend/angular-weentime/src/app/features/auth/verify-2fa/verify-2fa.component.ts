import { AfterViewInit, Component, ElementRef, OnInit, inject, signal, viewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-verify-2fa',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, LogoComponent, RouterModule],
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
    .shake { animation: shake 0.4s ease-in-out; }
  `]
})
export class Verify2faComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  readonly tempToken = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly digits = signal<string[]>(['', '', '', '', '', '']);

  private readonly inputElements = viewChildren<ElementRef<HTMLInputElement>>('digitInput');
  private rememberMe = true;

  ngOnInit(): void {
    const navigationState = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    const storedChallenge = this.authService.getMfaChallenge();
    const stateToken = typeof navigationState?.tempToken === 'string' ? navigationState.tempToken : null;
    const token = stateToken ?? storedChallenge?.mfaToken ?? null;

    if (!token) {
      void this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    this.tempToken.set(token);
    this.rememberMe = typeof navigationState?.rememberMe === 'boolean'
      ? navigationState.rememberMe
      : storedChallenge?.rememberMe !== false;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.inputElements()[0]?.nativeElement.focus(), 250);
  }

  onInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');

    if (value.length > 1) {
      const nextDigits = value.slice(0, 6).split('');
      this.digits.set([...nextDigits, ...Array(6 - nextDigits.length).fill('')].slice(0, 6));
      this.focusFirstEmpty();
      this.checkAndSubmit();
      return;
    }

    this.digits.update(digits => {
      digits[index] = value;
      return [...digits];
    });

    if (value && index < 5) {
      this.inputElements()[index + 1]?.nativeElement.focus();
    }

    this.checkAndSubmit();
  }

  onKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.inputElements()[index - 1]?.nativeElement.focus();
    }
  }

  verify(): void {
    const token = this.tempToken();
    const code = this.digits().join('');
    if (!token || !/^\d{6}$/.test(code) || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.authService.verify2fa(code, token, this.rememberMe).subscribe({
      next: response => {
        this.isLoading.set(false);
        this.redirectByUserRole(response);
      },
      error: error => {
        this.isLoading.set(false);
        this.error.set(this.resolve2faError(error));
        this.digits.set(['', '', '', '', '', '']);
        setTimeout(() => this.inputElements()[0]?.nativeElement.focus(), 50);
      }
    });
  }

  private checkAndSubmit(): void {
    if (this.digits().join('').length === 6) {
      this.verify();
    }
  }

  private focusFirstEmpty(): void {
    const index = this.digits().findIndex(digit => !digit);
    this.inputElements()[index >= 0 ? index : 5]?.nativeElement.focus();
  }

  private redirectByUserRole(response: any): void {
    const rawRole = response.roles?.[0] || this.authService.currentUser()?.roles?.[0] || 'EMPLOYEE';
    const role = rawRole.startsWith('ROLE_') ? rawRole.substring(5) : rawRole;
    let destination = '/app/employee/dashboard';

    switch (role.toUpperCase()) {
      case 'ADMIN':
        destination = '/app/admin/dashboard';
        break;
      case 'RH':
        destination = '/app/rh/dashboard';
        break;
      case 'MANAGER':
        destination = '/app/manager/dashboard';
        break;
      default:
        destination = '/app/employee/dashboard';
        break;
    }

    this.startPerf('navigation');
    void this.router.navigate([destination]).then(() => {
      this.authService.refreshCurrentUserInBackground(this.rememberMe);
    }).finally(() => this.endPerf('navigation'));
  }

  private resolve2faError(error: any): string {
    const reason = error?.error?.error || error?.error?.reason;
    if (error?.status === 401 || reason === 'INVALID_TEMP_TOKEN') {
      this.authService.clearMfaChallenge();
      return 'Session MFA expirée, reconnectez-vous';
    }
    return 'Code invalide ou expiré';
  }

  private startPerf(label: string): void {
    if (!environment.production) {
      console.time(`[mfa] ${label}`);
    }
  }

  private endPerf(label: string): void {
    if (!environment.production) {
      console.timeEnd(`[mfa] ${label}`);
    }
  }
}
