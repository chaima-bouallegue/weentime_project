import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { AttendanceSessionStatus } from '@app/features/presence/models/presence.model';
import { PresenceService } from '@app/features/presence/services/presence.service';

@Component({
  selector: 'app-presence',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './presence.component.html',
  styleUrl: './presence.component.scss',
})
export class PresenceComponent {
  protected readonly presenceService = inject(PresenceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly openStatus = AttendanceSessionStatus.OPEN;
  protected readonly currentTime = signal(this.formatCurrentTime(new Date()));
  protected readonly isRippling = signal(false);

  protected readonly statsCards = computed(() => {
    const stats = this.presenceService.stats();

    return [
      {
        label: 'Heures semaine',
        value: this.formatDecimalHours(stats?.totalHoursThisWeek ?? 0),
        hint: 'Somme consolidee des sessions closes.',
      },
      {
        label: 'Ponctualite',
        value: `${stats?.onTimeArrivals ?? 0}`,
        hint: 'Arrivees a l heure comptabilisees.',
      },
      {
        label: 'Retards',
        value: `${stats?.lateArrivals ?? 0}`,
        hint: 'Retards detectes sur la periode.',
      },
      {
        label: 'Arrivee moyenne',
        value: (stats?.averageArrivalTime ?? '--:--').slice(0, 5),
        hint: 'Heure moyenne d ouverture de session.',
      },
    ];
  });

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.currentTime.set(this.formatCurrentTime(new Date())));

    void this.presenceService.refresh();
  }

  protected longDate(): string {
    return new Date().toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected statusLabel(): string {
    switch (this.presenceService.uiState()) {
      case 'WORKING':
        return 'En cours';
      case 'FINISHED':
        return 'Journee terminee';
      default:
        return 'Pas commence';
    }
  }

  protected primaryLabel(): string {
    return this.presenceService.uiState() === 'WORKING' ? 'Arreter' : 'Pointer';
  }

  protected timerFootnote(): string {
    switch (this.presenceService.uiState()) {
      case 'WORKING':
        return 'Le timer evolue chaque seconde et sera confirme au check-out.';
      case 'FINISHED':
        return 'Le total du jour est calcule et conserve dans la base.';
      default:
        return 'Le compteur demarre au premier check-in.';
    }
  }

  protected activeSessionLabel(): string {
    const session = this.presenceService.currentSession();
    if (!session) {
      return this.presenceService.isFinishedToday() ? 'Cloturee' : 'Aucune';
    }
    return this.formatDateTime(session.checkInTime);
  }

  protected activeSessionMeta(): string {
    const session = this.presenceService.currentSession();
    if (!session) {
      return this.presenceService.isFinishedToday()
        ? 'Resume disponible dans l historique'
        : 'Pret a ouvrir une nouvelle session';
    }
    return `Session ${session.status.toLowerCase()} depuis ${this.formatDateTime(session.checkInTime)}`;
  }

  protected async onPrimaryAction(): Promise<void> {
    if (this.presenceService.isSubmitting()) {
      return;
    }

    this.triggerRipple();

    if (this.presenceService.uiState() === 'WORKING') {
      await this.presenceService.checkOut();
      return;
    }

    await this.presenceService.checkIn();
  }

  protected async onRefresh(): Promise<void> {
    await this.presenceService.refresh();
  }

  protected formatDateTime(value: string | null | undefined): string {
    if (!value) {
      return '--:--';
    }

    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    const match = value.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '--:--';
  }

  protected formatSessionDay(dateString: string): string {
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleDateString('fr-FR', { day: '2-digit' });
  }

  protected formatSessionDate(dateString: string): string {
    const date = new Date(dateString);
    return Number.isNaN(date.getTime())
      ? dateString
      : date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  }

  protected formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  }

  private formatCurrentTime(date: Date): string {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  private formatDecimalHours(value: number): string {
    return `${Number(value).toFixed(2)}h`;
  }

  private triggerRipple(): void {
    this.isRippling.set(false);
    queueMicrotask(() => this.isRippling.set(true));
    setTimeout(() => this.isRippling.set(false), 620);
  }
}
