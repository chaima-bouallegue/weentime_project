import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AttendanceSession, AttendanceSessionStatus } from '../../models/presence.model';
import { PresenceService } from '../../services/presence.service';

@Component({
  selector: 'app-presence-history',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history-card">
      <div class="card-header">
        <h2>Historique des sessions</h2>
        <span class="subtitle">30 dernieres sessions</span>
      </div>

      <div *ngIf="history().length === 0" class="empty-state">
        <p>Aucune session enregistree</p>
      </div>

      <div *ngIf="history().length > 0" class="table-container">
        <table class="history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Duree</th>
              <th>Etat</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of history(); trackBy: trackByHistoryId; let even = even" [ngClass]="{ even: even }">
              <td data-label="Date">{{ formatDate(item.date) }}</td>
              <td data-label="Check-in">{{ formatDateTime(item.checkInTime) }}</td>
              <td data-label="Check-out">{{ item.checkOutTime ? formatDateTime(item.checkOutTime) : '--:--' }}</td>
              <td data-label="Duree">{{ formatDuration(item.duration) }}</td>
              <td data-label="Etat">
                <span class="status-badge" [ngClass]="item.status === openStatus ? 'status-open' : 'status-closed'">
                  {{ item.status === openStatus ? 'Ouverte' : 'Cloturee' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .history-card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb; }
    .card-header h2 { margin: 0; font-size: 1.5rem; font-weight: 600; }
    .subtitle { font-size: 0.875rem; color: #6b7280; }
    .empty-state { padding: 2rem; text-align: center; color: #6b7280; }
    .table-container { overflow-x: auto; }
    .history-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .history-table th { background: #f9fafb; padding: 1rem; text-align: left; font-weight: 600; color: #1f2937; border-bottom: 2px solid #e5e7eb; }
    .history-table td { padding: 1rem; border-bottom: 1px solid #e5e7eb; color: #374151; }
    .history-table tbody tr:hover { background: #f9fafb; }
    .history-table tbody tr.even { background: #fafbfc; }
    .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 6px; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-open { background: #dbeafe; color: #1d4ed8; }
    .status-closed { background: #dcfce7; color: #166534; }
    @media (max-width: 768px) {
      .history-table thead { display: none; }
      .history-table tbody tr { display: block; margin-bottom: 1rem; border: 1px solid #e5e7eb; border-radius: 8px; }
      .history-table tbody td { display: block; padding: 0.5rem 1rem 0.5rem 150px; text-align: right; border: none; position: relative; }
      .history-table tbody td::before { content: attr(data-label); position: absolute; left: 1rem; font-weight: 600; color: #6b7280; }
      .history-table tbody td:first-child { background: #f9fafb; border-radius: 8px 8px 0 0; }
      .history-table tbody td:last-child { border-radius: 0 0 8px 8px; }
    }
  `],
})
export class PresenceHistoryComponent implements OnInit {
  readonly presenceService = inject(PresenceService);
  readonly history = computed(() => this.presenceService.presenceHistorySignal());
  readonly openStatus = AttendanceSessionStatus.OPEN;

  ngOnInit(): void {
    void this.presenceService.loadPresenceHistory(30);
  }

  trackByHistoryId(index: number, item: AttendanceSession): number {
    return item.id || index;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '--:--';
    }
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  formatDuration(duration: number): string {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
}
