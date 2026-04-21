import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenceService } from '../../services/presence.service';

@Component({
  selector: 'app-check-in-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="check-in-card">
      <div class="card-header">
        <h2>Actions</h2>
      </div>

      <div class="action-buttons">
        <button
          class="btn btn-check-in"
          [disabled]="checkInDisabled()"
          (click)="onCheckIn()"
        >
          <span *ngIf="presenceService.loading()" class="spinner"></span>
          Pointer arrivée
        </button>

        <button
          class="btn btn-check-out"
          [disabled]="checkOutDisabled()"
          (click)="onCheckOut()"
        >
          <span *ngIf="presenceService.loading()" class="spinner"></span>
          Pointer départ
        </button>
      </div>

      <div *ngIf="presenceService.error()" class="error-message">
        <svg class="error-icon" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        {{ presenceService.error() }}
      </div>
    </div>
  `,
  styles: [`
    .check-in-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .card-header h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .action-buttons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      border: none;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-check-in {
      background: #10b981;
      color: white;
    }

    .btn-check-in:hover:not(:disabled) {
      background: #059669;
    }

    .btn-check-out {
      background: #ef4444;
      color: white;
    }

    .btn-check-out:hover:not(:disabled) {
      background: #dc2626;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error-message {
      display: flex;
      gap: 0.75rem;
      padding: 1rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      margin-top: 1rem;
      font-size: 0.875rem;
    }

    .error-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      .action-buttons {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class CheckInCardComponent {
  presenceService = inject(PresenceService);

  checkInDisabled = computed(() => this.presenceService.isCheckedIn() || this.presenceService.loading());
  checkOutDisabled = computed(() => !this.presenceService.isCheckedIn() || this.presenceService.loading());

  onCheckIn(): void {
    this.presenceService.checkIn('WEB');
  }

  onCheckOut(): void {
    this.presenceService.checkOut('WEB');
  }
}
