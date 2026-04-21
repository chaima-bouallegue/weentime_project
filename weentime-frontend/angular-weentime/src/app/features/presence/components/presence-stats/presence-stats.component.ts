import { Component, OnInit, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService } from '../../services/presence.service';

@Component({
  selector: 'app-presence-stats',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stats-card">
      <div class="card-header">
        <h2>Statistiques</h2>
        <span class="subtitle">Cette semaine</span>
      </div>

      <div *ngIf="presenceService.stats()" class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Présent</span>
          <span class="stat-value">{{ presenceService.stats()!.totalPresent }}</span>
          <span class="stat-unit">jours</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Absent</span>
          <span class="stat-value">{{ presenceService.stats()!.totalAbsent }}</span>
          <span class="stat-unit">jours</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Retards</span>
          <span class="stat-value">{{ presenceService.stats()!.lateCount }}</span>
          <span class="stat-unit">fois</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Heures travaillées</span>
          <span class="stat-value">{{ presenceService.stats()!.totalHoursWorked }}</span>
          <span class="stat-unit">heures</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">À l'heure</span>
          <span class="stat-value">{{ presenceService.stats()!.onTimeCount }}</span>
          <span class="stat-unit">jours</span>
        </div>

        <div class="stat-item">
          <span class="stat-label">Arrivée moyenne</span>
          <span class="stat-value">{{ formatArrivalTime() }}</span>
          <span class="stat-unit"></span>
        </div>
      </div>

      <div *ngIf="!presenceService.stats()" class="empty-state">
        <p>Aucune donnée disponible</p>
      </div>
    </div>
  `,
  styles: [`
    .stats-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .card-header h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .subtitle {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1.5rem;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem;
      background: linear-gradient(135deg, #f3f4f6 0%, #fafbfc 100%);
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      text-align: center;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #6b7280;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #1f2937;
    }

    .stat-unit {
      font-size: 0.75rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }

    .empty-state {
      padding: 2rem;
      text-align: center;
      color: #6b7280;
    }

    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 480px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class PresenceStatsComponent implements OnInit {
  presenceService = inject(PresenceService);

  formattedArrivalTime = computed(() => {
    const time = this.presenceService.stats()?.averageArrivalTime;
    return time ? time.substring(0, 5) : '--:--';
  });

  ngOnInit(): void {
    this.presenceService.loadStats();
  }

  formatArrivalTime(): string {
    return this.formattedArrivalTime();
  }
}
