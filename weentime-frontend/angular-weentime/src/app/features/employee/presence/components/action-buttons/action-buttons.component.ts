import { Component, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceStateService } from '@app/features/presence/services/presence-state.service';
import { ToastService } from '@app/core/services/toast.service';
import { LoaderComponent } from '@app/shared/components/loader/loader.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-action-buttons',
  standalone: true,
  imports: [CommonModule, LoaderComponent, LucideAngularModule],
  template: `
    <div class="flex gap-4 flex-wrap">
      <!-- Check In Button -->
      @if (!presenceStateService.isCheckedIn()) {
        <button
          (click)="onCheckIn()"
          [disabled]="presenceStateService.isLoading() || presenceStateService.isPending()"
          class="flex-1 min-w-[200px] bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
        >
          @if (presenceStateService.isLoading() || presenceStateService.isPending()) {
            <app-loader></app-loader>
            <span>Traitement...</span>
          } @else {
            <i-lucide name="log-in" class="w-5 h-5"></i-lucide>
            <span>Pointer l'Arrivée</span>
          }
        </button>
      }

      <!-- Check Out Button -->
      @if (presenceStateService.isCheckedIn()) {
        <button
          (click)="onCheckOut()"
          [disabled]="presenceStateService.isLoading() || presenceStateService.isPending()"
          class="flex-1 min-w-[200px] bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
        >
          @if (presenceStateService.isLoading() || presenceStateService.isPending()) {
            <app-loader></app-loader>
            <span>Traitement...</span>
          } @else {
            <i-lucide name="log-out" class="w-5 h-5"></i-lucide>
            <span>Pointer le Départ</span>
          }
        </button>
      }

      <!-- Voice Clock Button (UI Only) -->
      <button
        disabled
        class="flex-1 min-w-[200px] bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-3 shadow-lg"
      >
        <i-lucide name="mic" class="w-5 h-5"></i-lucide>
        <span>Horloge Vocale</span>
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class ActionButtonsComponent {
  readonly presenceStateService = inject(PresenceStateService);
  private readonly toastService = inject(ToastService);

  constructor() {
    // Watch for error changes and show toast
    effect(() => {
      const error = this.presenceStateService.error();
      if (error) {
        this.toastService.error(error);
        // Clear error after showing toast
        setTimeout(() => this.presenceStateService.clearError(), 100);
      }
    });
  }

  async onCheckIn(): Promise<void> {
    try {
      await this.presenceStateService.checkIn();
      // Toast is already shown by state service on success
    } catch {
      // Error is already handled by state service
    }
  }

  async onCheckOut(): Promise<void> {
    try {
      await this.presenceStateService.checkOut();
      // Toast is already shown by state service on success
    } catch {
      // Error is already handled by state service
    }
  }
}
