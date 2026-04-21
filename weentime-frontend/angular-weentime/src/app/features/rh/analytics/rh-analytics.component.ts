import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import {
  Activity,
  BarChart,
  Briefcase,
  Inbox,
  LucideAngularModule,
  Network,
  Timer,
  UserX
} from 'lucide-angular';
import { ToastService } from '../../../core/services/toast.service';
import { RhApiService, RhStatsOverview } from '../rh-api.service';

interface AnalyticsEntry {
  label: string;
  value: number;
  percent: number;
}

@Component({
  selector: 'app-rh-analytics',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './rh-analytics.component.html',
  styleUrl: './rh-analytics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RhAnalyticsComponent {
  private readonly api = inject(RhApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly iconActivity = Activity;
  readonly iconUserX = UserX;
  readonly iconTimer = Timer;
  readonly iconInbox = Inbox;
  readonly iconNetwork = Network;
  readonly iconBarChart2 = BarChart;
  readonly iconBriefcase = Briefcase;

  readonly isLoading = signal(true);
  readonly stats = signal<RhStatsOverview | null>(null);

  readonly attendanceRate = computed(() => Math.round(this.stats()?.attendanceRate ?? 0));
  readonly absenceRate = computed(() => Math.round(this.stats()?.absenceRate ?? 0));
  readonly overtimeHours = computed(() => Math.round(this.stats()?.overtimeHours ?? 0));
  readonly pendingRequestsCount = computed(() => this.stats()?.pendingRequests ?? 0);

  readonly departmentBars = computed(() =>
    this.toEntries(this.stats()?.departmentEmployeeCounts ?? {}, 8)
  );

  readonly requestTypeEntries = computed(() =>
    this.toEntries(this.stats()?.requestTypeDistribution ?? {}, 8)
  );

  readonly monthlySeries = computed(() => {
    const source = this.stats()?.monthlyRequestEvolution ?? {};
    const entries = Object.entries(source)
      .map(([month, value]) => ({
        label: this.monthName(Number(month)),
        value: Number(value) || 0,
        percent: 0
      }))
      .sort((a, b) => this.monthIndex(a.label) - this.monthIndex(b.label));
    const max = Math.max(...entries.map(item => item.value), 1);
    return entries.map(item => ({ ...item, percent: (item.value / max) * 100 }));
  });

  readonly chartPoints = computed(() => {
    const series = this.monthlySeries();
    const width = 600;
    const height = 220;
    const max = Math.max(...series.map(item => item.value), 1);
    return series.map((item, index) => ({
      ...item,
      x: 20 + ((width - 40) / Math.max(series.length - 1, 1)) * index,
      y: height - ((item.value / max) * (height - 40)) - 20
    }));
  });

  readonly linePath = computed(() => {
    const points = this.chartPoints();
    if (points.length === 0) {
      return '';
    }
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  });

  readonly lineAreaPath = computed(() => {
    const points = this.chartPoints();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) {
      return '';
    }
    return `M ${first.x} 240 L ${points.map(point => `${point.x} ${point.y}`).join(' L ')} L ${last.x} 240 Z`;
  });

  constructor() {
    this.refreshData();
  }

  refreshData(): void {
    this.isLoading.set(true);
    this.api.getStatsOverview()
      .pipe(
        finalize(() => this.isLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: stats => this.stats.set(stats),
        error: () => {
          this.stats.set(null);
          this.toast.error('Impossible de charger les analytiques RH');
        }
      });
  }

  private toEntries(source: Record<string, number>, limit: number): AnalyticsEntry[] {
    const entries = Object.entries(source)
      .map(([label, value]) => ({
        label,
        value: Number(value) || 0,
        percent: 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
    const max = Math.max(...entries.map(item => item.value), 1);
    return entries.map(item => ({ ...item, percent: (item.value / max) * 100 }));
  }

  private monthName(month: number): string {
    const names = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[Math.max(0, Math.min(11, month - 1))] ?? String(month);
  }

  private monthIndex(label: string): number {
    return ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(label);
  }
}
