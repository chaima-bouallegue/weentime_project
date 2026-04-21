import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService } from '../../services/presence.service';
import { CheckInCardComponent } from '../check-in-card/check-in-card.component';
import { MainStatusCardComponent } from '../main-status-card/main-status-card.component';
import { PresenceHistoryComponent } from '../presence-history/presence-history.component';
import { PresenceStatsComponent } from '../presence-stats/presence-stats.component';

@Component({
  selector: 'app-presence-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CheckInCardComponent,
    MainStatusCardComponent,
    PresenceHistoryComponent,
    PresenceStatsComponent,
  ],
  template: `
    <div class="presence-page">
      <!-- Header -->
      <div class="presence-header">
        <h1>Pointage</h1>
        <p class="subtitle">Gestion du temps de travail</p>
      </div>

      <!-- Main Status Card -->
      <app-main-status-card></app-main-status-card>

      <!-- Check-in/Check-out Card -->
      <app-check-in-card></app-check-in-card>

      <!-- Presence History -->
      <app-presence-history></app-presence-history>

      <!-- Presence Stats -->
      <app-presence-stats></app-presence-stats>
    </div>
  `,
  styles: [`
    .presence-page {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      gap: 2rem;
      display: flex;
      flex-direction: column;
    }

    .presence-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .presence-header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin: 0;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      font-size: 1rem;
      color: #6b7280;
      margin-top: 0.5rem;
    }
  `],
})
export class PresencePageComponent implements OnInit {
  presenceService = inject(PresenceService);

  ngOnInit(): void {
    void this.presenceService.refresh();
  }
}
