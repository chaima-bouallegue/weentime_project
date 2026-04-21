import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { AttendanceDayStatus } from '../../models/presence.model';
import { PresenceService } from '../../services/presence.service';

@Component({
  selector: 'app-main-status-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="main-status-card">
      <div class="status-display">
        <div class="status-indicator" [ngClass]="statusClass()">
          <span class="status-dot"></span>
          <span class="status-label">{{ statusLabel() }}</span>
        </div>

        <div class="clock">
          <div class="current-time">{{ currentTime() }}</div>
          <div class="time-label">Heure actuelle</div>
        </div>
      </div>

      <div *ngIf="presenceService.presence()" class="presence-details">
        <div class="detail-item">
          <span class="detail-label">Premiere entree</span>
          <span class="detail-value">{{ formatDateTime(presenceService.presence()?.heureEntree) }}</span>
        </div>

        <div class="detail-item">
          <span class="detail-label">Derniere sortie</span>
          <span class="detail-value">{{ formatDateTime(presenceService.presence()?.heureSortie) }}</span>
        </div>

        <div class="detail-item highlight">
          <span class="detail-label">Duree du jour</span>
          <span class="detail-value">{{ presenceService.formattedDuration() }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .main-status-card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
    .status-display { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid #e5e7eb; }
    .status-indicator { display: flex; align-items: center; gap: 0.75rem; font-weight: 600; font-size: 1.125rem; }
    .status-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; animation: pulse 2s infinite; }
    .status-indicator.present .status-dot { background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
    .status-indicator.late .status-dot { background: #f59e0b; }
    .status-indicator.absent .status-dot { background: #ef4444; }
    .status-indicator.remote .status-dot { background: #2563eb; }
    .status-indicator.leave .status-dot { background: #7c3aed; }
    .status-indicator.none .status-dot { background: #d1d5db; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    .clock { text-align: right; }
    .current-time { font-size: 2.5rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #1f2937; }
    .time-label { font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem; }
    .presence-details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
    .detail-item { display: flex; flex-direction: column; padding: 1rem; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
    .detail-item.highlight { background: #eff6ff; border-color: #bfdbfe; }
    .detail-label { font-size: 0.875rem; color: #6b7280; font-weight: 500; }
    .detail-value { font-size: 1.25rem; font-weight: 600; color: #1f2937; margin-top: 0.5rem; font-family: 'Monaco', 'Courier New', monospace; }
    @media (max-width: 768px) {
      .presence-details { grid-template-columns: 1fr; }
      .status-display { flex-direction: column; align-items: flex-start; gap: 1rem; }
      .clock { text-align: left; width: 100%; }
    }
  `],
})
export class MainStatusCardComponent {
  readonly presenceService = inject(PresenceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentTimeSignal = signal<string>(this.getFormattedTime());

  readonly currentTime = computed(() => this.currentTimeSignal());

  readonly statusClass = computed(() => {
    switch (this.presenceService.displayStatus()) {
      case AttendanceDayStatus.WORKING:
      case AttendanceDayStatus.IDLE:
        return 'present';
      case AttendanceDayStatus.LATE:
        return 'late';
      case AttendanceDayStatus.REMOTE:
        return 'remote';
      case AttendanceDayStatus.ON_LEAVE:
        return 'leave';
      case AttendanceDayStatus.ABSENT:
      default:
        return 'absent';
    }
  });

  readonly statusLabel = computed(() => {
    switch (this.presenceService.displayStatus()) {
      case AttendanceDayStatus.WORKING:
        return 'En cours';
      case AttendanceDayStatus.IDLE:
        return 'Journee cloturee';
      case AttendanceDayStatus.LATE:
        return 'Arrivee tardive';
      case AttendanceDayStatus.REMOTE:
        return 'Teletravail';
      case AttendanceDayStatus.ON_LEAVE:
        return 'En conge';
      case AttendanceDayStatus.ABSENT:
      default:
        return 'Aucune session';
    }
  });

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentTimeSignal.set(this.getFormattedTime());
      });
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '--:--';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '--:--'
      : date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  private getFormattedTime(): string {
    return new Date().toLocaleTimeString('fr-FR', { hour12: false });
  }
}
