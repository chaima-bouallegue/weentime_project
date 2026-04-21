import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { PresenceRecord } from '../../presence.service';

@Component({
  selector: 'app-presence-history',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './presence-history.component.html',
  styleUrl: './presence-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PresenceHistoryComponent {
  @Input() history: PresenceRecord[] = [];
  @Input() isLoading = false;

  formatTime(time?: string): string {
    if (!time) return '--:--';
    try {
      if (time.includes('T')) {
        return new Date(time).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      return time;
    } catch {
      return time || '--:--';
    }
  }

  formatDate(date: string): string {
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return date;
    }
  }

  formatDuration(minutes?: number): string {
    if (!minutes || minutes === 0) return '--';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'CHECKED_IN':
        return 'badge-active';
      case 'CHECKED_OUT':
        return 'badge-done';
      case 'LATE':
        return 'badge-late';
      case 'ABSENT':
        return 'badge-absent';
      default:
        return 'badge-default';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'CHECKED_IN':
        return 'Pointé';
      case 'CHECKED_OUT':
        return 'Départ enregistré';
      case 'LATE':
        return 'Tardif';
      case 'ABSENT':
        return 'Absent';
      default:
        return status;
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'CHECKED_IN':
        return 'log-in';
      case 'CHECKED_OUT':
        return 'log-out';
      case 'LATE':
        return 'alert-circle';
      case 'ABSENT':
        return 'x-circle';
      default:
        return 'circle';
    }
  }
}
