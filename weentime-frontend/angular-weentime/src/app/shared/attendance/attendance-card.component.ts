import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  Clock3,
  LucideAngularModule,
  Play,
  RefreshCw,
  Square,
  Timer,
} from 'lucide-angular';
import { AttendanceUiState, PointageEntry, PointageStats } from '../../features/employee/pointage/pointage.models';
import { formatLocalTime } from '../../core/utils/date-time.util';

@Component({
  selector: 'app-attendance-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './attendance-card.component.html',
  styleUrl: './attendance-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceCardComponent {
  @Input({ required: true }) currentTime = '--:--:--';
  @Input({ required: true }) dailyDuration = '00:00:00';
  @Input() checkInTime: string | null = null;
  @Input() checkOutTime: string | null = null;
  @Input({ required: true }) state: AttendanceUiState = 'NOT_STARTED';
  @Input() roleLabel = 'Collaborateur';
  @Input() weeklyStats: PointageStats | null = null;
  @Input() activityLogs: PointageEntry[] = [];
  @Input() isLoading = false;

  @Output() readonly checkIn = new EventEmitter<void>();
  @Output() readonly checkOut = new EventEmitter<void>();
  @Output() readonly refresh = new EventEmitter<void>();

  readonly iconClock = Clock3;
  readonly iconTimer = Timer;
  readonly iconCheck = CheckCircle;
  readonly iconAlert = AlertCircle;
  readonly iconPlay = Play;
  readonly iconSquare = Square;
  readonly iconRefresh = RefreshCw;
  readonly iconCalendar = CalendarDays;

  get statusLabel(): string {
    switch (this.state) {
      case 'ACTIVE':
        return 'Session démarrée';
      case 'CLOSED':
        return 'Journée clôturée';
      case 'ERROR':
        return 'Erreur de synchronisation';
      default:
        return 'Aucun pointage aujourd’hui';
    }
  }

  get primaryLabel(): string {
    switch (this.state) {
      case 'ACTIVE':
        return 'Pointer ma sortie';
      case 'CLOSED':
        return 'Journée clôturée';
      case 'ERROR':
        return 'Réessayer la synchronisation';
      default:
        return 'Pointer mon entrée';
    }
  }

  get circleProgress(): number {
    const workedSeconds = this.parseDurationToSeconds(this.dailyDuration);
    const goalSeconds = 8 * 3600;
    return Math.min((workedSeconds / goalSeconds) * 100, 100);
  }

  get primaryDisabled(): boolean {
    if (this.isLoading) {
      return true;
    }
    return this.state === 'CLOSED';
  }

  onPrimaryAction(): void {
    if (this.primaryDisabled) {
      return;
    }

    if (this.state === 'ACTIVE') {
      this.checkOut.emit();
      return;
    }

    if (this.state === 'ERROR') {
      this.refresh.emit();
      return;
    }

    this.checkIn.emit();
  }

  onRefresh(): void {
    if (!this.isLoading) {
      this.refresh.emit();
    }
  }

  formatTime(value: string | null): string {
    return formatLocalTime(value);
  }

  private parseDurationToSeconds(value: string): number {
    if (!value) {
      return 0;
    }

    const hhmmss = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hhmmss) {
      const hours = Number(hhmmss[1] ?? 0);
      const minutes = Number(hhmmss[2] ?? 0);
      const seconds = Number(hhmmss[3] ?? 0);
      return (hours * 3600) + (minutes * 60) + seconds;
    }

    const compact = value.match(/^(\d+)h\s?(\d{1,2})$/i);
    if (compact) {
      const hours = Number(compact[1] ?? 0);
      const minutes = Number(compact[2] ?? 0);
      return (hours * 3600) + (minutes * 60);
    }

    return 0;
  }
}


