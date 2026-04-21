import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService, PresenceRecord } from './presence.service';
import { AuthService } from '@app/core/services/auth.service';
import { LoaderComponent } from '@app/shared/components/loader/loader.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-presence-history',
  standalone: true,
  imports: [CommonModule, LoaderComponent, LucideAngularModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 class="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <i-lucide name="clock" class="w-6 h-6 text-indigo-600"></i-lucide>
          Historique de Présence
        </h2>
        <p class="text-gray-600 mt-2">Consultez votre historique de pointage</p>
      </div>

      <!-- Loading State -->
      @if (presenceService.loadingSignal()) {
        <div class="bg-white rounded-xl shadow-sm p-12 text-center border border-gray-100">
          <app-loader></app-loader>
          <p class="text-gray-600 mt-4 font-medium">Chargement de l'historique...</p>
        </div>
      }

      <!-- Empty State -->
      @if (!presenceService.loadingSignal() && presenceService.presenceHistorySignal().length === 0) {
        <div class="bg-white rounded-xl shadow-sm p-12 text-center border-2 border-dashed border-gray-300">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
            <i-lucide name="inbox" class="w-8 h-8 text-gray-400"></i-lucide>
          </div>
          <p class="text-gray-600 font-medium mb-1">Aucun historique disponible</p>
          <p class="text-gray-500 text-sm">Votre historique de présence apparaîtra ici</p>
        </div>
      }

      <!-- History Table -->
      @if (!presenceService.loadingSignal() && presenceService.presenceHistorySignal().length > 0) {
        <div class="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                  <th class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                  <th class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Arrivée</th>
                  <th class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Départ</th>
                  <th class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Durée</th>
                  <th class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Heures Supp.</th>
                  <th class="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                @for (record of presenceService.presenceHistorySignal(); track record.id || $index) {
                  <tr class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-6 py-4 text-sm text-gray-900 font-medium">
                      {{ formatDate(record.date) }}
                    </td>
                    <td class="px-6 py-4 text-sm">
                      @if (record.heureArrivee) {
                        <div class="flex items-center gap-2">
                          <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span class="text-green-700 font-semibold">{{ record.heureArrivee }}</span>
                        </div>
                      } @else {
                        <span class="text-gray-400">--:--</span>
                      }
                    </td>
                    <td class="px-6 py-4 text-sm">
                      @if (record.heureDepart) {
                        <div class="flex items-center gap-2">
                          <div class="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span class="text-red-700 font-semibold">{{ record.heureDepart }}</span>
                        </div>
                      } @else {
                        <span class="text-gray-400">--:--</span>
                      }
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-900 font-semibold">
                      {{ formatDuration(record.dureeActuelle) }}
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-700">
                      --
                    </td>
                    <td class="px-6 py-4 text-sm">
                      <span [ngClass]="getStatusClass(record.status)" class="px-3 py-1 rounded-full text-xs font-bold inline-block">
                        {{ getStatusLabel(record.status) }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
            <div class="text-gray-700 text-xs font-semibold uppercase tracking-wide mb-1">Total Jours</div>
            <div class="text-2xl font-bold text-blue-600">
              {{ presenceService.presenceHistorySignal().length }}
            </div>
          </div>

          <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
            <div class="text-gray-700 text-xs font-semibold uppercase tracking-wide mb-1">Présents</div>
            <div class="text-2xl font-bold text-green-600">
              {{ getCountByStatus('CHECKED_OUT') }}
            </div>
          </div>

          <div class="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border border-yellow-200">
            <div class="text-gray-700 text-xs font-semibold uppercase tracking-wide mb-1">En Cours</div>
            <div class="text-2xl font-bold text-yellow-600">
              {{ getCountByStatus('CHECKED_IN') }}
            </div>
          </div>

          <div class="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
            <div class="text-gray-700 text-xs font-semibold uppercase tracking-wide mb-1">Absents</div>
            <div class="text-2xl font-bold text-red-600">
              {{ getCountByStatus('ABSENT') }}
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    table {
      margin-bottom: 0;
    }
  `]
})
export class PresenceHistoryComponent implements OnInit {
  readonly presenceService = inject(PresenceService);
  private readonly authService = inject(AuthService);

  ngOnInit(): void {
    this.presenceService.loadPresenceHistory();
  }

  formatDate(date: string): string {
    try {
      return new Date(date).toLocaleDateString('fr-FR', { 
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return date || 'N/A';
    }
  }

  formatDuration(minutes?: number): string {
    if (minutes === null || minutes === undefined || minutes < 0) return '0h 00m';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  getStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'CHECKED_IN': 'bg-yellow-100 text-yellow-800',
      'CHECKED_OUT': 'bg-green-100 text-green-800',
      'ABSENT': 'bg-red-100 text-red-800',
      'LATE': 'bg-orange-100 text-orange-800'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'CHECKED_IN': 'En Cours',
      'CHECKED_OUT': 'Complet',
      'ABSENT': 'Absent',
      'LATE': 'Retard'
    };
    return labels[status] || status;
  }

  getCountByStatus(status: string): number {
    if (!status) return 0;
    try {
      const history = this.presenceService.presenceHistorySignal();
      if (!Array.isArray(history)) return 0;
      return history.filter(record => record?.status === status).length;
    } catch {
      return 0;
    }
  }
}

