import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertTriangle, LucideAngularModule } from 'lucide-angular';
import { InactivityService } from '../../../core/services/inactivity.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-session-warning-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    @if (inactivityService.showWarning()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <!-- Overlay -->
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>

        <!-- Modal card -->
        <div class="relative bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 max-w-md w-full p-8 text-center space-y-6 animate-in">

          <!-- Icon -->
          <div class="w-16 h-16 bg-amber-100 dark:bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 mx-auto">
            <lucide-icon [img]="AlertTriangleIcon" size="32"></lucide-icon>
          </div>

          <!-- Title -->
          <div class="space-y-2">
            <h2 class="text-xl font-black text-slate-900 dark:text-white">
              Session expirante
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Votre session expirera dans
            </p>
          </div>

          <!-- Countdown -->
          <div class="text-5xl font-black text-amber-500 tabular-nums">
            {{ inactivityService.remainingSeconds() }}<span class="text-lg font-bold text-slate-400 ml-1">s</span>
          </div>

          <p class="text-xs text-slate-400 dark:text-slate-500 font-medium">
            Vous serez déconnecté automatiquement pour des raisons de sécurité.
          </p>

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button
              (click)="onLogout()"
              class="flex-1 py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
              Déconnexion
            </button>
            <button
              (click)="onStayConnected()"
              class="flex-[2] py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all">
              Rester connecté
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    @keyframes modal-in {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .animate-in {
      animation: modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `]
})
export class SessionWarningModalComponent {
  readonly AlertTriangleIcon = AlertTriangle;
  inactivityService = inject(InactivityService);
  private authService = inject(AuthService);

  onStayConnected(): void {
    this.inactivityService.resetTimer();
  }

  onLogout(): void {
    this.inactivityService.showWarning.set(false);
    this.authService.logout();
  }
}
