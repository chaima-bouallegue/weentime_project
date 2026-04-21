import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService } from '../../presence.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-main-status-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl shadow-2xl p-8 text-white relative">

      <div class="flex items-center justify-between mb-8">
        <div>
          <div *ngIf="presenceService.isCheckedInSignal(); else stopped"
            class="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm font-semibold">
            <span class="w-3 h-3 bg-green-300 rounded-full animate-pulse"></span>
            En cours
          </div>

          <ng-template #stopped>
            <div class="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full text-sm font-semibold">
              <span class="w-3 h-3 bg-gray-300 rounded-full"></span>
              Arrêt
            </div>
          </ng-template>
        </div>

        <div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
          <i-lucide name="clock" class="w-8 h-8"></i-lucide>
        </div>
      </div>

      <!-- Time -->
      <div class="mb-8">
        <div class="text-6xl font-bold">
          {{ getCurrentTime() }}
        </div>
        <div class="text-sm opacity-80">
          {{ getCurrentDate() }}
        </div>
      </div>

      <!-- Data -->
      <div class="grid grid-cols-3 gap-4">

        <div>
          <div class="text-xs opacity-70">Arrivée</div>
          <div class="text-xl font-bold">
            {{ presenceService.formattedTime().arrival }}
          </div>
        </div>

        <div>
          <div class="text-xs opacity-70">Durée</div>
          <div class="text-xl font-bold text-green-300">
            {{ presenceService.totalPresenceToday() }}
          </div>
        </div>

        <div>
          <div class="text-xs opacity-70">Départ</div>
          <div class="text-xl font-bold">
            {{ presenceService.formattedTime().departure }}
          </div>
        </div>

      </div>

    </div>
  `
})
export class MainStatusCardComponent {

  readonly presenceService = inject(PresenceService);

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }
}