import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Activity,
  AlertTriangle,
  Brain,
  CalendarDays,
  ClipboardList,
  Filter,
  RefreshCw,
  Search,
  Umbrella,
  UserX,
  Users,
  LucideAngularModule,
} from 'lucide-angular';
import { forkJoin } from 'rxjs';
import {
  ForecastDashboardResponse,
  ForecastEmployeeRisk,
  ForecastEmployeeRiskResponse,
  ForecastFilters,
  ForecastRiskLevel,
  ForecastSeriesPoint,
  ForecastTeamPrediction,
  ForecastWorkloadResponse,
  MlForecastService,
} from '../../core/services/ml-forecast.service';

type TypeFilter = 'all' | 'absences' | 'leaves';
type RiskFilter = 'ALL' | ForecastRiskLevel;

const FORECAST_UNAVAILABLE_MESSAGE = 'Service de prévision indisponible';
const INSUFFICIENT_DATA_MESSAGE = 'Historique insuffisant, prévision basée sur moyenne mobile';

interface ChartPoint extends ForecastSeriesPoint {
  x: number;
  yAbsences: number;
  yLeaves: number;
}

@Component({
  selector: 'app-forecast-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './forecast-dashboard.component.html',
  styleUrls: ['./forecast-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForecastDashboardComponent implements OnInit {
  private readonly forecastService = inject(MlForecastService);

  readonly iconBrain = Brain;
  readonly iconRefresh = RefreshCw;
  readonly iconCalendar = CalendarDays;
  readonly iconAbsence = UserX;
  readonly iconLeave = Umbrella;
  readonly iconPresence = Activity;
  readonly iconWarning = AlertTriangle;
  readonly iconUsers = Users;
  readonly iconWorkload = ClipboardList;
  readonly iconFilter = Filter;
  readonly iconSearch = Search;

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly dashboard = signal<ForecastDashboardResponse | null>(null);
  readonly workload = signal<ForecastWorkloadResponse | null>(null);
  readonly employeeRisks = signal<ForecastEmployeeRiskResponse | null>(null);

  readonly period = signal('next_30_days');
  readonly departmentId = signal('');
  readonly teamId = signal('');
  readonly typeFilter = signal<TypeFilter>('all');
  readonly riskFilter = signal<RiskFilter>('ALL');

  readonly summary = computed(() => this.dashboard()?.summary);
  readonly dataQuality = computed(() => this.dashboard()?.dataQuality);
  readonly hasForecastData = computed(() => (
    this.dashboard()?.success === true
    && this.workload()?.success === true
    && this.employeeRisks()?.success === true
    && this.dataQuality()?.status !== 'UNAVAILABLE'
    && !this.error()
  ));
  readonly qualityMessage = computed(() => {
    if (this.error()) {
      return this.error();
    }
    if (this.dataQuality()?.status === 'INSUFFICIENT_DATA') {
      return INSUFFICIENT_DATA_MESSAGE;
    }
    return this.dataQuality()?.message || 'Prévision basée sur les tendances historiques.';
  });
  readonly series = computed(() => this.dashboard()?.series ?? []);
  readonly teams = computed(() => this.dashboard()?.teams ?? []);
  readonly employees = computed(() => this.employeeRisks()?.employees ?? []);

  readonly teamsAtRisk = computed(() => (
    this.teams().filter(team => team.riskLevel === 'HIGH' || team.riskLevel === 'CRITICAL').length
  ));

  readonly filteredTeams = computed(() => {
    const risk = this.riskFilter();
    return this.teams().filter(team => risk === 'ALL' || team.riskLevel === risk);
  });

  readonly filteredEmployees = computed(() => {
    const risk = this.riskFilter();
    return this.employees().filter(employee => risk === 'ALL' || employee.riskLevel === risk).slice(0, 12);
  });

  readonly filteredSeries = computed(() => {
    const type = this.typeFilter();
    const risk = this.riskFilter();
    return this.series().filter(point => {
      if (type === 'absences') {
        return point.predictedAbsences > 0 && (risk === 'ALL' || this.rowRisk(point) === risk);
      }
      if (type === 'leaves') {
        return point.predictedLeaves > 0 && (risk === 'ALL' || this.rowRisk(point) === risk);
      }
      return risk === 'ALL' || this.rowRisk(point) === risk;
    });
  });

  readonly chartPoints = computed<ChartPoint[]>(() => {
    const series = this.filteredSeries();
    if (series.length === 0) {
      return [];
    }
    const width = 720;
    const height = 220;
    const maxValue = Math.max(
      ...series.map(point => Math.max(point.predictedAbsences, point.predictedLeaves)),
      1,
    );
    return series.map((point, index) => {
      const x = 24 + ((width - 48) / Math.max(series.length - 1, 1)) * index;
      return {
        ...point,
        x,
        yAbsences: height - 20 - ((point.predictedAbsences / maxValue) * (height - 48)),
        yLeaves: height - 20 - ((point.predictedLeaves / maxValue) * (height - 48)),
      };
    });
  });

  readonly absencePath = computed(() => this.pathFor('absences'));
  readonly leavePath = computed(() => this.pathFor('leaves'));

  readonly teamBars = computed(() => {
    const teams = this.filteredTeams();
    const maxPressure = Math.max(...teams.map(team => team.predictedAbsences + team.predictedLeaves), 1);
    return teams.map(team => ({
      ...team,
      pressure: team.predictedAbsences + team.predictedLeaves,
      percent: ((team.predictedAbsences + team.predictedLeaves) / maxPressure) * 100,
    }));
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const filters = this.buildFilters();
    this.isLoading.set(true);
    this.error.set(null);
    forkJoin({
      dashboard: this.forecastService.getDashboard(filters),
      workload: this.forecastService.getWorkload(filters),
      employeeRisks: this.forecastService.getRiskByEmployee(filters),
    }).subscribe({
      next: result => {
        if (
          !result.dashboard.success
          || !result.workload.success
          || !result.employeeRisks.success
          || result.dashboard.dataQuality.status === 'UNAVAILABLE'
        ) {
          this.clearForecastData();
          this.isLoading.set(false);
          this.error.set(FORECAST_UNAVAILABLE_MESSAGE);
          return;
        }
        this.dashboard.set(result.dashboard);
        this.workload.set(result.workload);
        this.employeeRisks.set(result.employeeRisks);
        this.isLoading.set(false);
      },
      error: () => {
        this.clearForecastData();
        this.isLoading.set(false);
        this.error.set(FORECAST_UNAVAILABLE_MESSAGE);
      },
    });
  }

  updatePeriod(value: string): void {
    this.period.set(value);
    this.load();
  }

  updateTypeFilter(value: string): void {
    this.typeFilter.set(value === 'absences' || value === 'leaves' ? value : 'all');
  }

  updateRiskFilter(value: string): void {
    if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL') {
      this.riskFilter.set(value);
      return;
    }
    this.riskFilter.set('ALL');
  }

  applyFilters(): void {
    this.load();
  }

  resetFilters(): void {
    this.departmentId.set('');
    this.teamId.set('');
    this.typeFilter.set('all');
    this.riskFilter.set('ALL');
    this.period.set('next_30_days');
    this.load();
  }

  riskClass(risk: ForecastRiskLevel | RiskFilter | undefined): string {
    return String(risk || 'LOW').toLowerCase();
  }

  rowRisk(point: ForecastSeriesPoint): ForecastRiskLevel {
    const pressure = point.predictedAbsences + point.predictedLeaves;
    if (point.predictedPresenceRate < 60 || pressure >= 8) {
      return 'CRITICAL';
    }
    if (point.predictedPresenceRate < 75 || pressure >= 5) {
      return 'HIGH';
    }
    if (point.predictedPresenceRate < 88 || pressure >= 2) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  formatDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(parsed);
  }

  trackDate(_: number, point: ForecastSeriesPoint): string {
    return point.date;
  }

  trackTeam(_: number, team: ForecastTeamPrediction): string {
    return `${team.teamId ?? 'none'}:${team.teamName}`;
  }

  trackEmployee(_: number, employee: ForecastEmployeeRisk): number {
    return employee.employeeId;
  }

  private buildFilters(): ForecastFilters {
    return {
      period: this.period(),
      departmentId: this.parseNumber(this.departmentId()),
      teamId: this.parseNumber(this.teamId()),
    };
  }

  private parseNumber(value: string): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private pathFor(type: 'absences' | 'leaves'): string {
    const points = this.chartPoints();
    if (points.length === 0) {
      return '';
    }
    return `M ${points.map(point => `${point.x} ${type === 'absences' ? point.yAbsences : point.yLeaves}`).join(' L ')}`;
  }

  private clearForecastData(): void {
    this.dashboard.set(null);
    this.workload.set(null);
    this.employeeRisks.set(null);
  }
}
