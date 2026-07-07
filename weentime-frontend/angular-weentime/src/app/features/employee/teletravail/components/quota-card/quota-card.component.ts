import { Component, Input, ChangeDetectionStrategy, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Monitor, Calendar, Clock, CheckCircle } from 'lucide-angular';
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
  readonly iconCheck = CheckCircle;

  progressWidth = computed(() => {
    if (!this.quota || this.quota.joursAutorises === 0) return '0%';
    const percent = (this.quota.joursUtilises / this.quota.joursAutorises) * 100;
    return `${Math.min(percent, 100)}%`;
  });

  progressColorClass = computed(() => {
    const quota = this.quota;
    if (!quota || quota.joursAutorises === 0) return 'fill-green';
    const pct = (quota.joursRestants / quota.joursAutorises) * 100;
    if (pct > 50) return 'fill-green';
    if (pct > 20) return 'fill-orange';
    return 'fill-red';
  });

  getFormattedPeriod(): string {
    if (!this.quota) return '—';
    const date = new Date(this.quota.periodeDebut);
    return date.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  }
}
