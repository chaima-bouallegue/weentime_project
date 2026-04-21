import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceStateService } from '../services/presence-state.service';

/**
 * Presence Component - uses PresenceStateService for all state management
 */
@Component({
  selector: 'app-presence',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="presence-container">
      <!-- Header -->
      <div class="presence-header">
        <h1 class="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Pointage
        </h1>
        <p class="text-gray-600 mt-2">{{ getCurrentTimeFormatted() }}</p>
      </div>

      <!-- Main Card -->
      <div class="presence-card">
        <!-- Status Display -->
        <div class="status-section">
          <div class="status-indicator" [ngClass]="getStatusClass()">
            <div class="status-dot"></div>
            <span class="status-text">{{ getStatusLabel() }}</span>
          </div>
          <div class="clock-display">
            <div class="time-value">{{ currentTime() }}</div>
            <div class="time-label">Heure actuelle</div>
          </div>
        </div>

        <!-- Presence Info -->
        @if (presenceState.todayPresence(); as presence) {
          <div class="presence-info">
            @if (presence.heureEntree) {
              <div class="info-item">
                <span class="label">Arrivée</span>
                <span class="value">{{ formatTime(presence.heureEntree) }}</span>
              </div>
            }
            @if (presence.heureSortie) {
              <div class="info-item">
                <span class="label">Départ</span>
                <span class="value">{{ formatTime(presence.heureSortie) }}</span>
              </div>
            }
            <div class="info-item">
              <span class="label">Durée</span>
              <span class="value font-mono">{{ presenceState.totalPresenceToday() }}</span>
            </div>
          </div>
        }

        <!-- Action Button -->
        <div class="action-section">
          <button
            class="action-button"
            [ngClass]="getButtonClass()"
            [disabled]="presenceState.isLoading()"
            (click)="onActionClick()"
          >
            @if (presenceState.isLoading()) {
              <span class="spinner"></span>
              <span>Chargement...</span>
            } @else {
              {{ getButtonLabel() }}
            }
          </button>
        </div>

        <!-- Error Message -->
        @if (presenceState.error(); as errorMsg) {
          <div class="error-message">
            <svg class="error-icon" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
              />
            </svg>
            {{ errorMsg }}
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .presence-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 2rem;
    }

    .presence-header {
      text-align: center;
      margin-bottom: 3rem;
    }

    .presence-card {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 24px;
      padding: 2.5rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1), 0 0 1px rgba(0, 0, 0, 0.05);
      animation: slideUp 0.4s ease-out;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .status-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 2px solid rgba(0, 0, 0, 0.05);
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
      font-size: 1.1rem;
    }

    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .status-indicator.working .status-dot {
      background-color: #10b981;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);
    }

    .status-indicator.finished .status-dot {
      background-color: #8b5cf6;
    }

    .status-indicator.not-started .status-dot {
      background-color: #ef4444;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .clock-display { text-align: right; }

    .time-value {
      font-size: 2.5rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .time-label {
      font-size: 0.875rem;
      color: #9ca3af;
      margin-top: 0.25rem;
    }

    .presence-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding: 1.5rem;
      background: rgba(249, 250, 251, 0.8);
      border-radius: 16px;
      border: 1px solid rgba(0, 0, 0, 0.05);
    }

    .info-item {
      display: flex;
      flex-direction: column;
    }

    .info-item .label {
      font-size: 0.875rem;
      color: #6b7280;
      font-weight: 500;
      margin-bottom: 0.5rem;
    }

    .info-item .value {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
    }

    .action-section { margin-bottom: 1rem; }

    .action-button {
      width: 100%;
      padding: 1rem;
      font-size: 1.1rem;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
    }

    .action-button.check-in {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
    }

    .action-button.check-in:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(16, 185, 129, 0.4);
    }

    .action-button.check-out {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
    }

    .action-button.check-out:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(245, 158, 11, 0.4);
    }

    .action-button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background-color: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      color: #991b1b;
      font-size: 0.95rem;
      line-height: 1.5;
      margin-top: 1rem;
      animation: shake 0.3s ease-in-out;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }

    .error-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    @media (max-width: 640px) {
      .presence-container { padding: 1rem; }
      .presence-card { padding: 1.5rem; }
      .time-value { font-size: 2rem; }
      .presence-info { grid-template-columns: 1fr; }
    }
  `]
})
export class PresenceComponent implements OnInit, OnDestroy {
  protected presenceState = inject(PresenceStateService);
  currentTime = signal<string>(this.getCurrentTime());
  private clockIntervalId: number | null = null;

  constructor() {
    // Update clock every second
    this.clockIntervalId = window.setInterval(() => {
      this.currentTime.set(this.getCurrentTime());
    }, 1000);
  }

  ngOnInit(): void {
    // Load initial data from state service
    this.presenceState.refresh();
  }

  onActionClick(): void {
    if (this.presenceState.isLoading()) return;

    if (this.presenceState.status() === 'CHECKED_IN') {
      this.presenceState.checkOut();
    } else {
      this.presenceState.checkIn();
    }
  }

  getStatusLabel(): string {
    const status = this.presenceState.status();
    if (status === 'NONE') return 'Non commencé';
    if (status === 'CHECKED_IN') return 'En cours';
    return 'Terminé';
  }

  getStatusClass(): string {
    const status = this.presenceState.status();
    if (status === 'NONE') return 'not-started';
    if (status === 'CHECKED_IN') return 'working';
    return 'finished';
  }

  getButtonLabel(): string {
    return this.presenceState.status() === 'CHECKED_IN'
      ? 'Pointer le départ'
      : 'Pointer l\'arrivée';
  }

  getButtonClass(): string {
    return this.presenceState.status() === 'CHECKED_IN'
      ? 'action-button check-out'
      : 'action-button check-in';
  }

  formatTime(timeStr: string): string {
    if (!timeStr) return '--:--';
    try {
      // Handle ISO format like "2026-04-02T09:15:30"
      const isoMatch = timeStr.match(/T(\d{2}):(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[1]}:${isoMatch[2]}`;
      }
      const date = new Date(`2000-01-01T${timeStr}`);
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeStr;
    }
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  getCurrentTimeFormatted(): string {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  ngOnDestroy(): void {
    if (this.clockIntervalId !== null) {
      window.clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
  }
}
