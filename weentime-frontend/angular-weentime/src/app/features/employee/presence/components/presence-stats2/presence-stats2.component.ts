import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceStateService } from '@app/features/presence/services/presence-state.service';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-presence-stats',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="space-y-4 mb-6">
      <h3 class="text-xl font-bold text-gray-900">Statistiques de cette semaine</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <!-- Total Hours -->
        <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-700 font-semibold text-sm">Heures Travaillées</span>
            <div class="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <i-lucide name="clock" class="w-5 h-5 text-blue-600"></i-lucide>
            </div>
          </div>
          <div class="text-3xl font-bold text-blue-600 mb-1">
            {{ formatHours(stateService.weeklyStats()?.totalHoursThisWeek || 0) }}
          </div>
          <div class="text-xs text-gray-600">Total cette semaine</div>
        </div>

        <!-- Average Arrival Time -->
        <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-700 font-semibold text-sm">Arrivée Moyenne</span>
            <div class="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <i-lucide name="trending-up" class="w-5 h-5 text-green-600"></i-lucide>
            </div>
          </div>
          <div class="text-3xl font-bold text-green-600 mb-1">
            {{ stateService.weeklyStats()?.averageArrivalTime || '--:--' }}
          </div>
          <div class="text-xs text-gray-600">Moyenne d'arrivée</div>
        </div>

        <!-- On-Time Arrivals -->
        <div class="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-700 font-semibold text-sm">À L'Heure</span>
            <div class="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <i-lucide name="check-circle" class="w-5 h-5 text-purple-600"></i-lucide>
            </div>
          </div>
          <div class="text-3xl font-bold text-purple-600 mb-1">
            {{ stateService.weeklyStats()?.onTimeArrivals || 0 }}
          </div>
          <div class="text-xs text-gray-600">Arrivées ponctuelles</div>
        </div>

        <!-- Late Arrivals -->
        <div class="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border border-orange-200 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center justify-between mb-3">
            <span class="text-gray-700 font-semibold text-sm">Retards</span>
            <div class="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <i-lucide name="alert-circle" class="w-5 h-5 text-orange-600"></i-lucide>
            </div>
          </div>
          <div class="text-3xl font-bold text-orange-600 mb-1">
            {{ stateService.weeklyStats()?.lateArrivals || 0 }}
          </div>
          <div class="text-xs text-gray-600">Arrivées tardives</div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class PresenceStatsComponent {
  readonly stateService = inject(PresenceStateService);

  formatHours(minutes: number): string {
    if (!minutes || minutes < 0) return '0h';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins}m`;
    }
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
  }
}
