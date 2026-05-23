import { Component, inject, signal, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ProfileService, TwoFactorSetupResponse } from '../../profile.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserProfile } from '../../profile.service';
import { environment } from '../../../../../environments/environment';

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
          <h3 class="card-title">Authentification à deux facteurs (2FA)</h3>
          <p class="card-description">
            Ajoutez une couche de sécurité supplémentaire à votre compte en exigeant un code de vérification en plus de votre mot de passe.
          </p>
        </div>
        <div class="status-indicator" [class.active]="is2faEnabled">
          {{ is2faEnabled ? 'Activé' : 'Désactivé' }}
        </div>
      </div>

      <div class="card-body">
        <!-- State: Disabled -->
        <ng-container *ngIf="!is2faEnabled && !setupData()">
          <div class="setup-options">
            <button (click)="startSetup('TOTP')" class="option-btn">
              <div class="option-icon bg-indigo">
                <lucide-icon name="smartphone" size="18"></lucide-icon>
              </div>
              <div class="option-text">
                <span class="option-title">Application d'authentification</span>
                <span class="option-desc">Utilisez Google Authenticator, Authy ou similaire pour générer des codes.</span>
              </div>
              <lucide-icon name="chevron-right" size="16" class="arrow"></lucide-icon>
            </button>

            <button (click)="startSetup('EMAIL')" class="option-btn">
              <div class="option-icon bg-emerald">
                <lucide-icon name="mail" size="18"></lucide-icon>
              </div>
              <div class="option-text">
                <span class="option-title">E-mail de secours</span>
                <span class="option-desc">Recevez un code de validation par e-mail lors de chaque connexion.</span>
              </div>
              <lucide-icon name="chevron-right" size="16" class="arrow"></lucide-icon>
            </button>

            <button (click)="startSetup('SMS')" class="option-btn" [disabled]="!smsOtpEnabled || !profile?.telephone">
              <div class="option-icon bg-indigo">
                <lucide-icon name="message-square" size="18"></lucide-icon>
              </div>
              <div class="option-text">
                <span class="option-title">Code SMS</span>
                <span class="option-desc">{{ smsDescription }}</span>
              </div>
              <lucide-icon name="chevron-right" size="16" class="arrow"></lucide-icon>
            </button>
          </div>
        </ng-container>

        <!-- State: Setup Authenticator -->
        <ng-container *ngIf="setupData() && setupType === 'TOTP'">
          <div class="setup-container animate-fade-in">
            <div class="setup-step">
              <span class="step-number">1</span>
              <p>Scannez ce code QR avec votre application d'authentification.</p>
            </div>
            
            <div class="qr-wrapper">
              <img [src]="setupData()!.qrCodeBase64" alt="QR Code Setup" class="qr-code">
              <div class="secret-box">
                <span class="secret-label">Clé de configuration :</span>
                <code class="secret-code">{{ setupData()!.secret }}</code>
              </div>
            </div>

            <div class="setup-step">
              <span class="step-number">2</span>
              <p>Entrez le code à 6 chiffres généré par l'application.</p>
            </div>

            <div class="verification-row">
              <input type="text" [(ngModel)]="verificationCode" placeholder="000 000" maxlength="6" class="code-input">
              <button (click)="confirmSetup()" [disabled]="verificationCode.length < 6 || loading()" class="btn-confirm">
                <lucide-icon *ngIf="loading()" name="loader-2" size="16" class="animate-spin"></lucide-icon>
                {{ loading() ? 'Vérification...' : 'Activer 2FA' }}
              </button>
            </div>
            
            <button (click)="cancelSetup()" class="btn-cancel">Annuler</button>
          </div>
        </ng-container>

        <ng-container *ngIf="setupData() && setupType !== 'TOTP'">
          <div class="setup-container animate-fade-in">
            <div class="setup-step">
              <span class="step-number">1</span>
              <p>Entrez le code à 6 chiffres reçu par {{ setupType === 'SMS' ? 'SMS' : 'email' }}.</p>
            </div>
            <div class="verification-row">
              <input type="text" [(ngModel)]="verificationCode" placeholder="000 000" maxlength="6" class="code-input">
              <button (click)="confirmSetup()" [disabled]="verificationCode.length < 6 || loading()" class="btn-confirm">
                <lucide-icon *ngIf="loading()" name="loader-2" size="16" class="animate-spin"></lucide-icon>
                {{ loading() ? 'Vérification...' : 'Activer 2FA' }}
              </button>
            </div>
            <button (click)="cancelSetup()" class="btn-cancel">Annuler</button>
          </div>
        </ng-container>

        <!-- State: Enabled -->
        <ng-container *ngIf="is2faEnabled">
          <div class="enabled-container">
            <div class="info-alert">
              <lucide-icon name="info" size="16"></lucide-icon>
              <span>Votre compte est protégé. Vous devrez saisir un code lors de votre prochaine connexion.</span>
            </div>

            <div class="action-grid">
              <div class="backup-section" *ngIf="backupCodes().length > 0">
                <h4 class="section-title">Codes de secours</h4>
                <p class="section-desc">Conservez ces codes en lieu sûr. Ils vous permettront d'accéder à votre compte si vous perdez votre téléphone.</p>
                <div class="codes-grid">
                  <code *ngFor="let code of backupCodes()">{{ code }}</code>
                </div>
                <button (click)="copyBackupCodes()" class="btn-secondary">
                  <lucide-icon name="copy" size="14"></lucide-icon>
                  Copier les codes
                </button>
              </div>

            <div class="danger-zone">
                <h4 class="section-title text-red">Zone de danger</h4>
                <p class="section-desc">La désactivation du 2FA réduit la sécurité de votre compte.</p>
                <input type="password" [(ngModel)]="disablePassword" placeholder="Mot de passe actuel" class="code-input" style="letter-spacing:0;text-align:left;margin-bottom:10px;width:100%;">
                <button (click)="disable2fa()" [disabled]="loading()" class="btn-danger">
                  <lucide-icon *ngIf="loading()" name="loader-2" size="16" class="animate-spin"></lucide-icon>
                  Désactiver 2FA
                </button>
              </div>
            </div>
          </div>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    .two-factor-card {
      display: flex; flex-direction: column; gap: 24px;
      padding-top: 10px;
    }

    .card-header {
      display: flex; align-items: flex-start; gap: 16px; position: relative;
    }

    .header-icon {
      width: 44px; height: 44px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: #f1f5f9; color: #64748b;
      transition: all 0.3s;
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

    /* Setup Options */
    .setup-options { display: flex; flex-direction: column; gap: 12px; }
    .option-btn {
      display: flex; align-items: center; gap: 16px; padding: 16px;
      border: 1px solid #e2e8f0; border-radius: 14px; background: #fff;
      cursor: pointer; text-align: left; transition: all 0.2s;
    }
    :host-context(.dark) .option-btn { background: #1a1f2e; border-color: #2d3548; }
    .option-btn:hover { border-color: #6366f1; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    
    .option-icon {
      width: 40px; height: 40px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; color: #fff;
    }
    .bg-indigo { background: #6366f1; }
    .bg-emerald { background: #10b981; }

    .option-text { flex: 1; display: flex; flex-direction: column; }
    .option-title { font-size: 14px; font-weight: 700; color: #1e293b; }
    :host-context(.dark) .option-title { color: #f1f5f9; }
    .option-desc { font-size: 12px; color: #64748b; }
    .arrow { color: #cbd5e1; }

    /* Setup Container */
    .setup-container {
      display: flex; flex-direction: column; gap: 20px; align-items: center;
      padding: 24px; background: #f8fafc; border-radius: 16px;
    }
    :host-context(.dark) .setup-container { background: #1e293b; }

    .setup-step { width: 100%; display: flex; align-items: center; gap: 12px; }
    .step-number {
      width: 24px; height: 24px; border-radius: 50%; background: #6366f1;
      color: #fff; font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
    }
    .setup-step p { font-size: 13px; font-weight: 600; color: #475569; margin: 0; }
    :host-context(.dark) .setup-step p { color: #cbd5e1; }

    .qr-wrapper {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .qr-code { width: 160px; height: 160px; background: #fff; padding: 10px; border-radius: 12px; border: 1px solid #e2e8f0; }

    .secret-box { text-align: center; }
    .secret-label { font-size: 11px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 4px; }
    .secret-code { font-size: 14px; font-weight: 700; color: #6366f1; letter-spacing: 2px; }

    .verification-row { display: flex; gap: 10px; width: 100%; max-width: 320px; }
    .code-input {
      flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0;
      text-align: center; letter-spacing: 4px; font-weight: 700; outline: none;
    }
    .code-input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }

    .btn-confirm {
      padding: 0 20px; border-radius: 10px; border: none; background: #6366f1; color: #fff;
      font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;
    }
    .btn-confirm:hover { background: #4f46e5; }
    .btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-cancel { background: none; border: none; font-size: 13px; font-weight: 600; color: #94a3b8; cursor: pointer; }
    .btn-cancel:hover { color: #f43f5e; }

    /* Enabled Container */
    .enabled-container { display: flex; flex-direction: column; gap: 24px; }
    .info-alert {
      display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      background: #eff6ff; color: #1e40af; border-radius: 12px; font-size: 13px; font-weight: 500;
    }
    :host-context(.dark) .info-alert { background: rgba(59,130,246,0.1); color: #93c5fd; }

    .section-title { font-size: 14px; font-weight: 700; color: #1e293b; margin: 0 0 6px; }
    :host-context(.dark) .section-title { color: #f1f5f9; }
    .section-desc { font-size: 12px; color: #64748b; margin-bottom: 16px; line-height: 1.5; }
    .text-red { color: #ef4444; }

    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    @media (max-width: 600px) { .action-grid { grid-template-columns: 1fr; } }

    .codes-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;
    }
    .codes-grid code {
      background: #f1f5f9; padding: 8px; border-radius: 8px; text-align: center;
      font-size: 13px; font-weight: 700; color: #475569; letter-spacing: 1px;
    }
    :host-context(.dark) .codes-grid code { background: #1e293b; color: #cbd5e1; }

    .btn-secondary, .btn-danger {
      width: 100%; padding: 10px; border-radius: 10px; border: 1px solid #e2e8f0;
      font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .btn-secondary { background: #fff; color: #475569; }
    .btn-secondary:hover { background: #f8fafc; border-color: #6366f1; color: #6366f1; }
    :host-context(.dark) .btn-secondary { background: #1a1f2e; border-color: #2d3548; color: #94a3b8; }

    .btn-danger { border-color: #fee2e2; color: #ef4444; background: #fff; }
    .btn-danger:hover { background: #fef2f2; border-color: #f87171; }
    :host-context(.dark) .btn-danger { background: #1a1f2e; border-color: #451a1a; color: #f87171; }

    .animate-fade-in { animation: fadeIn 0.3s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class ProfileTwoFactorComponent implements OnChanges {
  @Input() profile: UserProfile | null = null;
  
  private profileService = inject(ProfileService);
  private toastService = inject(ToastService);

  is2faEnabled = false;
  setupType: 'TOTP' | 'EMAIL' | 'SMS' | null = null;
  setupData = signal<TwoFactorSetupResponse | null>(null);
  verificationCode = '';
  disablePassword = '';
  backupCodes = signal<string[]>([]);
  loading = signal(false);
  readonly smsOtpEnabled = environment.smsOtpEnabled === true;

  ngOnChanges() {
    this.is2faEnabled = !!this.profile?.twoFactorEnabled;
  }

  getQrCodeUrl(url: string): string {
    return url;
  }

  get smsDescription(): string {
    if (!this.smsOtpEnabled) {
      return 'Architecture prête, fournisseur SMS non configuré.';
    }
    return this.profile?.telephone
      ? 'Recevez un code sur votre téléphone.'
      : 'Ajoutez un téléphone pour activer cette méthode.';
  }

  startSetup(type: 'TOTP' | 'EMAIL' | 'SMS') {
    if (type === 'SMS' && (!this.smsOtpEnabled || !this.profile?.telephone)) {
      this.toastService.error('Service SMS indisponible pour le moment.');
      return;
    }
    this.loading.set(true);
    this.setupType = type;
    this.profileService.setup2fa(type).subscribe({
      next: (res) => {
        this.setupData.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.toastService.error(type === 'SMS' ? 'Service SMS indisponible pour le moment.' : 'Erreur lors de la configuration du 2FA.');
        this.loading.set(false);
      }
    });
  }

  cancelSetup() {
    this.setupData.set(null);
    this.setupType = null;
    this.verificationCode = '';
  }

  confirmSetup() {
    if (!this.setupType || !this.verificationCode) return;
    
    this.loading.set(true);
    const data = this.setupData()!;
    
    this.profileService.confirm2fa(
      this.setupType, 
      this.verificationCode, 
      data.secret, 
      data.setupToken
    ).subscribe({
      next: (res) => {
        this.is2faEnabled = true;
        this.backupCodes.set(res.backupCodes || []);
        this.setupData.set(null);
        this.loading.set(false);
        this.toastService.success('Authentification à deux facteurs activée !');
      },
      error: (err) => {
        this.toastService.error('Code invalide. Veuillez réessayer.');
        this.loading.set(false);
      }
    });
  }

  disable2fa() {
    if (!confirm('Êtes-vous sûr de vouloir désactiver le 2FA ?')) return;

    this.loading.set(true);
    this.profileService.disable2fa(this.disablePassword).subscribe({
      next: () => {
        this.is2faEnabled = false;
        this.backupCodes.set([]);
        this.disablePassword = '';
        this.loading.set(false);
        this.toastService.success('2FA désactivé.');
      },
      error: () => {
        this.toastService.error('Erreur lors de la désactivation.');
        this.loading.set(false);
      }
    });
  }

  copyBackupCodes() {
    const text = this.backupCodes().join('\\n');
    navigator.clipboard.writeText(text).then(() => {
      this.toastService.info('Codes de secours copiés dans le presse-papier.');
    });
  }
}
