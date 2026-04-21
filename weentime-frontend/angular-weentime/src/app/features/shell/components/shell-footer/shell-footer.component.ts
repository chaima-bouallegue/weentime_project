import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';
import { LogoComponent } from '../../../../shared/components/logo/logo.component';
import { ThemeService } from '../../../../core/services/theme.service';

@Component({
  selector: 'app-shell-footer',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="shell-footer">
      <!-- Left: Logo & Context -->
      <div class="footer-left">
        <app-logo [size]="6" [variant]="themeService.isDark() ? 'white' : 'full'" [showText]="true" />
        <div class="divider hidden sm:block"></div>
        <div class="context-info hidden sm:flex">
          <span class="entreprise-name">{{ entrepriseNom() }}</span>
          <span class="role-badge">{{ roleLabel() }}</span>
        </div>
      </div>

      <!-- Center: Quick Links -->
      <div class="footer-center hidden md:flex">
        <a routerLink="/help" class="footer-link">Aide</a>
        <a routerLink="/privacy" class="footer-link">Confidentialité</a>
        <a routerLink="/terms" class="footer-link">Conditions</a>
        <a routerLink="/contact" class="footer-link">Contact</a>
      </div>

      <!-- Right: Status & Version -->
      <div class="footer-right">
        <div class="status-indicator">
          <div class="status-dot"></div>
          <span class="status-text hidden sm:inline">Tous les services actifs</span>
        </div>
        <div class="divider"></div>
        <span class="version-text">v1.0.0</span>
      </div>
    </footer>
  `,
  styles: [`
    :host { 
      display: block;
      width: 100%;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
      height: 52px;
      z-index: 40;
    }

    :host-context(.dark) {
      background: #0f1117;
      border-color: #1e293b;
    }

    .shell-footer {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      gap: 20px;
    }

    @media (max-width: 640px) {
      .shell-footer { padding: 0 16px; }
    }

    .footer-left, .footer-right, .footer-center {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .divider {
      width: 1px;
      height: 16px;
      background: #e2e8f0;
    }
    :host-context(.dark) .divider { background: #2d3548; }

    .context-info {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .entreprise-name {
      font-size: 11px;
      font-weight: 700;
      color: #1e293b;
    }
    :host-context(.dark) .entreprise-name { color: #f1f5f9; }

    .role-badge {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
    }

    .footer-center {
      gap: 24px;
    }

    .footer-link {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      text-decoration: none;
      transition: color 0.15s;
    }
    .footer-link:hover { color: #6366f1; }
    :host-context(.dark) .footer-link:hover { color: #818cf8; }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: #f0fdf4;
      border-radius: 6px;
      color: #16a34a;
    }
    :host-context(.dark) .status-indicator {
      background: rgba(22, 163, 74, 0.1);
      color: #4ade80;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
    }

    .status-text {
      font-size: 11px;
      font-weight: 700;
    }

    .version-text {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
    }
  `]
})
export class ShellFooterComponent {
  private authService = inject(AuthService);
  themeService = inject(ThemeService);

  entrepriseNom = computed(() => this.authService.currentUser()?.entreprise?.nom ?? 'Weentime App');
  
  roleLabel = computed(() => {
    const role = this.authService.currentUser()?.roles?.[0] ?? '';
    if (role === 'ROLE_ADMIN') return 'Administrateur';
    if (role === 'ROLE_RH') return 'Ressources Humaines';
    if (role === 'ROLE_MANAGER') return 'Manager';
    if (role === 'ROLE_EMPLOYEE') return 'Collaborateur';
    return 'Utilisateur';
  });
}
