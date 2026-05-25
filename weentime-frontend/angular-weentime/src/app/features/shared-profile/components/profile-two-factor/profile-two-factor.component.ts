import { Component, EventEmitter, Input, OnChanges, Output, inject, isDevMode, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProfileService, TwoFactorSetupResponse, UserProfile, normalizeMfaTotpCode } from '../../profile.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-profile-two-factor',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="two-factor-card">
      <div class="card-header">
        <div class="header-icon" [class.enabled]="is2faEnabled">
          <lucide-icon [name]="is2faEnabled ? 'shield-check' : 'shield-off'" size="20"></lucide-icon>
        </div>
        <div class="header-info">
          <h3 class="card-title">MFA par application d'authentification</h3>
          <p class="card-description">
            Protegez votre compte avec un code TOTP genere par Google Authenticator ou Microsoft Authenticator.
          </p>
        </div>
        <div class="status-indicator" [class.active]="is2faEnabled">
          {{ is2faEnabled ? 'Active' : 'Desactive' }}
        </div>
      </div>

      <div class="card-body">
        <ng-container *ngIf="!is2faEnabled && !setupData()">
          <button (click)="startSetup()" class="option-btn" [disabled]="loading()">
            <div class="option-icon">
              <lucide-icon name="smartphone" size="18"></lucide-icon>
            </div>
            <div class="option-text">
              <span class="option-title">Activer MFA</span>
              <span class="option-desc">Scannez un QR code avec votre application d'authentification.</span>
            </div>
            <lucide-icon name="chevron-right" size="16" class="arrow"></lucide-icon>
          </button>
        </ng-container>

        <ng-container *ngIf="setupData() && !is2faEnabled">
          <div class="setup-container">
            <div class="setup-step">
              <span class="step-number">1</span>
              <p>Scannez ce QR code avec Google Authenticator ou Microsoft Authenticator.</p>
            </div>

            <div class="qr-wrapper">
              <img [src]="setupData()!.qrCodeBase64" alt="QR code MFA" class="qr-code">
              <div class="secret-box">
                <span class="secret-label">Cle de configuration</span>
                <code class="secret-code">{{ setupData()!.secret }}</code>
              </div>
            </div>

            <div class="setup-step">
              <span class="step-number">2</span>
              <p>Entrez le code a 6 chiffres affiche dans l'application.</p>
            </div>

            <div class="verification-row">
              <input type="text"
                     [(ngModel)]="verificationCode"
                     placeholder="000000"
                     maxlength="6"
                     inputmode="numeric"
                     class="code-input">
              <button (click)="confirmSetup()" [disabled]="!isValidCode(verificationCode) || loading()" class="btn-confirm">
                <lucide-icon *ngIf="loading()" name="loader-2" size="16" class="animate-spin"></lucide-icon>
                {{ loading() ? 'Verification...' : 'Activer MFA' }}
              </button>
            </div>

            <button (click)="cancelSetup()" class="btn-cancel">Annuler</button>
          </div>
        </ng-container>

        <ng-container *ngIf="is2faEnabled">
          <div class="enabled-container">
            <div class="info-alert">
              <lucide-icon name="info" size="16"></lucide-icon>
              <span>MFA est actif. Un code TOTP sera demande lors de votre prochaine connexion.</span>
            </div>

            <div class="danger-zone">
              <h4 class="section-title text-red">Desactiver MFA</h4>
              <p class="section-desc">Confirmez avec votre mot de passe et le code actuel de votre application d'authentification.</p>
              <input type="password"
                     [(ngModel)]="disablePassword"
                     placeholder="Mot de passe actuel"
                     autocomplete="current-password"
                     class="code-input text-left">
              <input type="text"
                     [(ngModel)]="disableCode"
                     placeholder="Code MFA"
                     maxlength="16"
                     inputmode="numeric"
                     autocomplete="one-time-code"
                     class="code-input">
              <button (click)="disable2fa()" [disabled]="loading()" class="btn-danger">
                <lucide-icon *ngIf="loading()" name="loader-2" size="16" class="animate-spin"></lucide-icon>
                Desactiver MFA
              </button>
            </div>
          </div>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    .two-factor-card { display: flex; flex-direction: column; gap: 24px; padding-top: 10px; }
    .card-header { display: flex; align-items: flex-start; gap: 16px; position: relative; }
    .header-icon {
      width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      background: #f1f5f9; color: #64748b; transition: all 0.3s;
    }
    .header-icon.enabled { background: #ecfdf5; color: #10b981; }
    :host-context(.dark) .header-icon { background: #1e293b; color: #94a3b8; }
    :host-context(.dark) .header-icon.enabled { background: rgba(16,185,129,0.15); color: #34d399; }
    .header-info { flex: 1; }
    .card-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
    :host-context(.dark) .card-title { color: #f8fafc; }
    .card-description { font-size: 13px; color: #64748b; margin: 0; line-height: 1.5; }
    :host-context(.dark) .card-description { color: #94a3b8; }
    .status-indicator {
      font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;
      padding: 4px 10px; border-radius: 20px; background: #f1f5f9; color: #64748b;
    }
    .status-indicator.active { background: #10b981; color: #fff; }
    .option-btn {
      width: 100%; display: flex; align-items: center; gap: 16px; padding: 16px;
      border: 1px solid #e2e8f0; border-radius: 14px; background: #fff;
      cursor: pointer; text-align: left; transition: all 0.2s;
    }
    :host-context(.dark) .option-btn { background: #1a1f2e; border-color: #2d3548; }
    .option-btn:hover { border-color: #6366f1; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .option-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .option-icon {
      width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
      color: #fff; background: #6366f1;
    }
    .option-text { flex: 1; display: flex; flex-direction: column; }
    .option-title { font-size: 14px; font-weight: 700; color: #1e293b; }
    :host-context(.dark) .option-title { color: #f1f5f9; }
    .option-desc { font-size: 12px; color: #64748b; }
    .arrow { color: #cbd5e1; }
    .setup-container {
      display: flex; flex-direction: column; gap: 20px; align-items: center;
      padding: 24px; background: #f8fafc; border-radius: 16px;
    }
    :host-context(.dark) .setup-container { background: #1e293b; }
    .setup-step { width: 100%; display: flex; align-items: center; gap: 12px; }
    .step-number {
      width: 24px; height: 24px; border-radius: 50%; background: #6366f1; color: #fff;
      font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center;
    }
    .setup-step p { font-size: 13px; font-weight: 600; color: #475569; margin: 0; }
    :host-context(.dark) .setup-step p { color: #cbd5e1; }
    .qr-wrapper { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .qr-code { width: 170px; height: 170px; background: #fff; padding: 10px; border-radius: 12px; border: 1px solid #e2e8f0; }
    .secret-box { text-align: center; max-width: 100%; }
    .secret-label { font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px; }
    .secret-code { display: block; max-width: 260px; overflow-wrap: anywhere; font-size: 13px; font-weight: 700; color: #6366f1; letter-spacing: 1px; }
    .verification-row { display: flex; gap: 10px; width: 100%; max-width: 340px; }
    .code-input {
      width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0;
      text-align: center; letter-spacing: 3px; font-weight: 700; outline: none; margin-bottom: 10px;
    }
    .code-input.text-left { text-align: left; letter-spacing: 0; }
    .code-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
    .btn-confirm, .btn-danger {
      padding: 0 18px; min-height: 44px; border-radius: 10px; border: none; font-weight: 700;
      cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .btn-confirm { background: #6366f1; color: #fff; white-space: nowrap; }
    .btn-confirm:hover { background: #4f46e5; }
    .btn-confirm:disabled, .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-cancel { background: none; border: none; font-size: 13px; font-weight: 600; color: #94a3b8; cursor: pointer; }
    .btn-cancel:hover { color: #f43f5e; }
    .enabled-container { display: flex; flex-direction: column; gap: 24px; }
    .info-alert {
      display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      background: #eff6ff; color: #1e40af; border-radius: 12px; font-size: 13px; font-weight: 500;
    }
    :host-context(.dark) .info-alert { background: rgba(59,130,246,0.1); color: #93c5fd; }
    .danger-zone { max-width: 420px; }
    .section-title { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 6px; }
    :host-context(.dark) .section-title { color: #f1f5f9; }
    .section-desc { font-size: 12px; color: #64748b; margin-bottom: 16px; line-height: 1.5; }
    .text-red { color: #ef4444; }
    .btn-danger { width: 100%; border: 1px solid #fee2e2; color: #ef4444; background: #fff; }
    .btn-danger:hover { background: #fef2f2; border-color: #f87171; }
    :host-context(.dark) .btn-danger { background: #1a1f2e; border-color: #451a1a; color: #f87171; }
    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ProfileTwoFactorComponent implements OnChanges {
  @Input() profile: UserProfile | null = null;
  @Output() refreshProfile = new EventEmitter<void>();

  private readonly profileService = inject(ProfileService);
  private readonly toastService = inject(ToastService);

  is2faEnabled = false;
  setupData = signal<TwoFactorSetupResponse | null>(null);
  verificationCode = '';
  disablePassword = '';
  disableCode = '';
  loading = signal(false);

  ngOnChanges(): void {
    this.is2faEnabled = !!this.profile?.twoFactorEnabled;
  }

  startSetup(): void {
    this.loading.set(true);
    this.profileService.setup2fa('TOTP').subscribe({
      next: response => {
        this.setupData.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.toastService.error('Erreur lors de la configuration MFA.');
        this.loading.set(false);
      }
    });
  }

  cancelSetup(): void {
    this.setupData.set(null);
    this.verificationCode = '';
  }

  confirmSetup(): void {
    if (!this.isValidCode(this.verificationCode)) {
      return;
    }

    this.loading.set(true);
    this.profileService.confirm2fa('TOTP', this.verificationCode).subscribe({
      next: () => {
        this.is2faEnabled = true;
        this.setupData.set(null);
        this.verificationCode = '';
        this.loading.set(false);
        this.toastService.success('MFA active.');
        this.refreshProfile.emit();
      },
      error: () => {
        this.toastService.error('Code invalide ou expire.');
        this.loading.set(false);
      }
    });
  }

  disable2fa(): void {
    const password = this.disablePassword ?? '';
    const code = this.normalizeCode(this.disableCode);

    if (!password) {
      this.toastService.error('Mot de passe requis.');
      return;
    }

    if (!this.isValidCode(code)) {
      this.toastService.error('Code MFA invalide. Entrez les 6 chiffres affiches.');
      return;
    }

    if (!confirm('Desactiver MFA pour votre compte ?')) {
      return;
    }

    this.logDisablePayloadShape(password, code);

    this.loading.set(true);
    this.profileService.disable2fa(password, code).subscribe({
      next: () => {
        this.is2faEnabled = false;
        this.setupData.set(null);
        this.verificationCode = '';
        this.disablePassword = '';
        this.disableCode = '';
        this.loading.set(false);
        this.toastService.success('MFA desactive.');
        this.refreshProfile.emit();
      },
      error: (err) => {
        this.toastService.error(this.disableErrorMessage(err));
        this.loading.set(false);
      }
    });
  }

  isValidCode(value: string): boolean {
    return /^\d{6}$/.test(this.normalizeCode(value));
  }

  private normalizeCode(value: string): string {
    return normalizeMfaTotpCode(value);
  }

  private logDisablePayloadShape(password: string, code: string): void {
    if (!isDevMode()) {
      return;
    }

    console.debug('[ProfileTwoFactor] Disable MFA request', {
      endpoint: '/api/v1/auth/mfa/disable',
      payloadKeys: ['password', 'code'],
      passwordPresent: password.length > 0,
      codeDigits: code.length
    });
  }

  private disableErrorMessage(err: any): string {
    const error = err?.error?.error ?? err?.error?.code;
    const backendMessage = err?.error?.details ?? err?.error?.message ?? err?.message;

    switch (error) {
      case 'PASSWORD_INVALID':
      case 'INVALID_PASSWORD':
        return backendMessage || 'Mot de passe incorrect.';
      case 'INVALID_TOTP':
      case 'INVALID_MFA_CODE':
        return backendMessage || 'Code MFA invalide ou expire.';
      case 'MFA_NOT_ENABLED':
        return backendMessage || "MFA n'est pas active pour ce compte.";
      case 'INVALID_MFA_CONFIGURATION':
        return backendMessage || 'Configuration MFA invalide. Reconfigurez MFA.';
      default:
        return backendMessage || 'Impossible de desactiver MFA. Reessayez plus tard.';
    }
  }
}
