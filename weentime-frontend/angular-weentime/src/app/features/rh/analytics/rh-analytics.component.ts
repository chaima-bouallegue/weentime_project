import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, Activity, UserX, Timer, Inbox, Network, BarChart2, Briefcase } from 'lucide-angular';
import { RhAnalyticsStore } from '../../../core/services/rh-analytics.store';
import { RhStructureStore } from '../../../core/services/rh-structure.store';
import { RhLeaveStore } from '../../../core/services/rh-leave.store';
import { OvertimeDepartmentStat, OvertimeRhStats, OvertimeService } from '../../presence/services/overtime.service';

@Component({
  selector: 'app-rh-analytics',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './rh-analytics.component.html',
  styleUrls: ['./rh-analytics.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class RhAnalyticsComponent implements OnInit {
  private readonly store = inject(RhAnalyticsStore);
  private readonly structureStore = inject(RhStructureStore);
  private readonly leaveStore = inject(RhLeaveStore);
  private readonly overtimeService = inject(OvertimeService);

  // Icons
  readonly iconActivity = Activity;
  readonly iconUserX = UserX;
  readonly iconTimer = Timer;
  readonly iconInbox = Inbox;
  readonly iconNetwork = Network;
  readonly iconBarChart2 = BarChart2;
  readonly iconBriefcase = Briefcase;

  readonly isLoading = this.store.isLoading;
  readonly error = this.store.error;
  readonly overtimeStats = signal<OvertimeRhStats | null>(null);
  readonly overtimeDepartments = signal<OvertimeDepartmentStat[]>([]);

  // KPIs from Store
  readonly attendanceRate = this.store.attendanceRate;
  readonly absenceRate = computed(() => 100 - this.attendanceRate());
  readonly overtimeHours = computed(() => Number(this.overtimeStats()?.totalOvertimeHours ?? 0));
  readonly pendingOvertime = computed(() => this.overtimeStats()?.pendingOvertime ?? 0);
  readonly approvedOvertime = computed(() => this.overtimeStats()?.approvedOvertime ?? 0);
  readonly rejectedOvertime = computed(() => this.overtimeStats()?.rejectedOvertime ?? 0);
  readonly pendingRequestsCount = this.store.pendingRequestsCount;

  // Chart Data: Department Distribution
  readonly departmentBars = computed(() => {
    const deptCounts: Record<string, number> = {};
    this.structureStore.employes().forEach(e => {
        const dept = e.departementNom || 'Non assigné';
        deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    return this.toMetricEntries(deptCounts, 8);
  });

  // Chart Data: Request Mix
  readonly requestTypeEntries = computed(() => {
    const reqCounts: Record<string, number> = {};
    this.leaveStore.allDemandes().forEach(r => {
        const type = r.typeCongeNom || 'Autre';
        reqCounts[type] = (reqCounts[type] || 0) + 1;
    });
    return this.toMetricEntries(reqCounts);
  });

  readonly overtimeDepartmentBars = computed(() => {
    const entries = this.overtimeDepartments()
      .map(item => ({
        label: item.department,
        value: Number(item.overtimeMinutes ?? 0),
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const max = Math.max(...entries.map(item => item.value), 1);
    return entries.map(item => ({
      ...item,
      hours: Number((item.value / 60).toFixed(1)),
      percent: (item.value / max) * 100,
    }));
  });

  // Chart Data: Monthly Trends
  readonly monthlySeries = computed(() => {
     const monthsCount: Record<string, number> = {};
     this.leaveStore.allDemandes().forEach(r => {
         const date = new Date(r.dateCreation);
         if (!Number.isNaN(date.getTime())) {
             const mIndex = date.getMonth() + 1;
             monthsCount[mIndex] = (monthsCount[mIndex] || 0) + 1;
         }
     });

     const series = [];
     for(let i=1; i<=12; i++) {
        const val = monthsCount[i] || 0; 
        series.push({
           month: i,
           label: this.monthName(i),
           value: val
        });
     }
     return series;
  });

  readonly chartPoints = computed(() => {
    const series = this.monthlySeries();
    if (series.length === 0) return [];
    
    let max = Math.max(...series.map(item => item.value));
    if (max < 5) max = 5;
    
    const width = 640; // Based on viewBox
    const height = 220;
    
    return series.map((item, index) => ({
      ...item,
      x: 20 + ((width - 40) / Math.max(series.length - 1, 1)) * index,
      y: height - ((item.value / max) * (height - 40)) - 20
    }));
  });

  readonly linePath = computed(() => {
    const points = this.chartPoints();
    if (points.length === 0) return '';
    return `M ${points.map(point => `${point.x} ${point.y}`).join(' L ')}`;
  });

  readonly lineAreaPath = computed(() => {
    const points = this.chartPoints();
    if (points.length === 0) return '';
    
    const first = points[0];
    const last = points[points.length - 1];
    return `M ${first.x} 240 L ${points.map(point => `${point.x} ${point.y}`).join(' L ')} L ${last.x} 240 Z`;
  });

  ngOnInit(): void {
    this.loadOvertimeAnalytics();
  }

  refreshData() {
    this.store.refresh();
    this.loadOvertimeAnalytics();
  }

  private loadOvertimeAnalytics(): void {
    this.overtimeService.getRhStats().subscribe({
      next: stats => this.overtimeStats.set(stats),
      error: () => this.overtimeStats.set(null)
    });
    this.overtimeService.getRhByDepartment().subscribe({
      next: departments => this.overtimeDepartments.set(departments ?? []),
      error: () => this.overtimeDepartments.set([])
    });
  }

  private toMetricEntries(source: Record<string, number>, limit = Number.MAX_SAFE_INTEGER) {
    const entries = Object.entries(source)
      .map(([label, value]) => ({
        label: label,
        value: Number(value)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
      
    const max = Math.max(...entries.map(item => item.value), 1);
    return entries.map(item => ({ ...item, percent: (item.value / max) * 100 }));
  }

  private monthName(month: number): string {
    const d = new Date(2026, Math.max(month - 1, 0), 1);
    return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d);
  }
}
