import { ChangeDetectionStrategy, Component, DestroyRef, TrackByFunction, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { PresenceService, PresenceStatsDTO } from '../../presence.service';

interface StatCard {
  label: string;
  value: string | number;
  unit?: string;
  icon: string;
  color: string;
  backgroundColor: string;
}

@Component({
  selector: 'app-presence-stats',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './presence-stats.component.html',
  styleUrl: './presence-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PresenceStatsComponent {
  private presenceService = inject(PresenceService);
  private destroyRef = inject(DestroyRef);

  readonly stats = signal<StatCard[]>([]);
  readonly isLoading = signal(true);

  readonly trackByLabel: TrackByFunction<StatCard> = (_index: number, item: StatCard) => item.label;

  constructor() {
    this.loadStats();
  }

  private loadStats(): void {
    this.isLoading.set(true);

    this.presenceService.getPresenceStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.stats.set(this.mapStats(response));
          this.isLoading.set(false);
        },
        error: () => {
          this.stats.set(this.mapStats(null));
          this.isLoading.set(false);
        }
      });
  }

  private mapStats(stats: PresenceStatsDTO | null): StatCard[] {
    return [
      {
        label: 'Heures travaillees',
        value: Number(stats?.totalHoursWorked || 0).toFixed(1),
        unit: 'heures',
        icon: 'clock',
        color: '#6366f1',
        backgroundColor: '#f0f4ff'
      },
      {
        label: 'Temps supplementaire',
        value: Number(stats?.overtimeHours || 0).toFixed(1),
        unit: 'heures',
        icon: 'timer-reset',
        color: '#22c55e',
        backgroundColor: '#f0fdf4'
      },
      {
        label: 'Arrivees a l heure',
        value: stats?.onTimeCount || 0,
        unit: 'jours',
        icon: 'check-circle-2',
        color: '#0ea5e9',
        backgroundColor: '#f0f9ff'
      },
      {
        label: 'Arrivees tardives',
        value: stats?.lateCount || 0,
        unit: 'jour(s)',
        icon: 'alert-circle',
        color: '#f35750',
        backgroundColor: '#fef2f2'
      }
    ];
  }
}
