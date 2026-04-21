import { Component, Input, ChangeDetectionStrategy, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Monitor, Calendar, Clock, Sparkles } from 'lucide-angular';
import { QuotaTeletravail } from '../../models/teletravail.model';

@Component({
  selector: 'app-quota-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './quota-card.component.html',
  styleUrl: './quota-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class QuotaCardComponent {
  @Input() quota: QuotaTeletravail | null = null;
  @Input() isLoading = false;

  // Icons
  readonly iconMonitor = Monitor;
  readonly iconCalendar = Calendar;
  readonly iconClock = Clock;
  readonly iconSparkles = Sparkles;

  progressWidth = computed(() => {
    if (!this.quota || this.quota.joursAutorises === 0) return '0%';
    const percent = (this.quota.joursUtilises / this.quota.joursAutorises) * 100;
    return `${Math.min(percent, 100)}%`;
  });

  couleurBarre = computed(() => {
    const quota = this.quota;
    if (!quota) return 'bg-gray-300';
    const pct = (quota.joursRestants / quota.joursAutorises) * 100;
    if (pct > 50) return 'bg-green-500';
    if (pct > 20) return 'bg-orange-400';
    return 'bg-red-500';
  });

  getFormattedPeriod(): string {
    if (!this.quota) return '';
    const date = new Date(this.quota.periodeDebut);
    return date.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  }
}
