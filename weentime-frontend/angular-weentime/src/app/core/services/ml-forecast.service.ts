import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../http/request-context.tokens';

export type ForecastRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ForecastWorkloadLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ForecastDataQualityStatus = 'OK' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE';
export type ForecastPeriod = 'next_week' | 'next_month' | 'next_30_days' | 'next_90_days' | string;

export interface ForecastFilters {
  period?: ForecastPeriod | null;
  startDate?: string | null;
  endDate?: string | null;
  companyId?: number | null;
  departmentId?: number | null;
  teamId?: number | null;
  employeeId?: number | null;
}

export interface ForecastDataQuality {
  status: ForecastDataQualityStatus;
  fallbackUsed: boolean;
  message?: string | null;
  historicalDays: number;
  source: string;
}

export interface ForecastSummary {
  predictedAbsences: number;
  predictedLeaves: number;
  predictedPresenceRate: number;
  riskLevel: ForecastRiskLevel;
  predictedWorkload: ForecastWorkloadLevel;
}

export interface ForecastSeriesPoint {
  date: string;
  predictedAbsences: number;
  predictedLeaves: number;
  predictedPresenceRate: number;
  actualAbsences?: number | null;
  actualLeaves?: number | null;
}

export interface ForecastTeamPrediction {
  teamId?: number | null;
  teamName: string;
  departmentId?: number | null;
  departmentName?: string | null;
  predictedAbsences: number;
  predictedLeaves: number;
  predictedPresenceRate: number;
  riskLevel: ForecastRiskLevel;
  explanation: string;
}

export interface ForecastEmployeeRisk {
  employeeId: number;
  employeeName: string;
  teamId?: number | null;
  teamName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  absenceCountLast30Days: number;
  leaveCountLast30Days: number;
  lateCountLast30Days: number;
  plannedLeaveDays: number;
  riskLevel: ForecastRiskLevel;
  score: number;
  explanation: string;
}

export interface ForecastDashboardResponse {
  success: boolean;
  period: string;
  generatedAt: string;
  summary: ForecastSummary;
  series: ForecastSeriesPoint[];
  teams: ForecastTeamPrediction[];
  explanations: string[];
  dataQuality: ForecastDataQuality;
}

export interface ForecastListResponse {
  success: boolean;
  period: string;
  generatedAt: string;
  items: ForecastSeriesPoint[];
  dataQuality: ForecastDataQuality;
}

export interface ForecastTeamPresenceResponse {
  success: boolean;
  period: string;
  generatedAt: string;
  teams: ForecastTeamPrediction[];
  dataQuality: ForecastDataQuality;
}

export interface ForecastWorkloadResponse {
  success: boolean;
  period: string;
  generatedAt: string;
  predictedWorkload: ForecastWorkloadLevel;
  pendingRequestsCount: number;
  approvedRequestsCount: number;
  explanation: string;
  dataQuality: ForecastDataQuality;
}

export interface ForecastEmployeeRiskResponse {
  success: boolean;
  period: string;
  generatedAt: string;
  employees: ForecastEmployeeRisk[];
  dataQuality: ForecastDataQuality;
}

type RawObject = Record<string, unknown>;

const EMPTY_QUALITY: ForecastDataQuality = {
  status: 'UNAVAILABLE',
  fallbackUsed: true,
  message: 'Service de prevision indisponible.',
  historicalDays: 0,
  source: 'unavailable',
};

const EMPTY_SUMMARY: ForecastSummary = {
  predictedAbsences: 0,
  predictedLeaves: 0,
  predictedPresenceRate: 100,
  riskLevel: 'LOW',
  predictedWorkload: 'LOW',
};

const EMPTY_DASHBOARD: ForecastDashboardResponse = {
  success: false,
  period: 'next_30_days',
  generatedAt: '',
  summary: EMPTY_SUMMARY,
  series: [],
  teams: [],
  explanations: [],
  dataQuality: EMPTY_QUALITY,
};

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  return values.find(value => value !== undefined && value !== null);
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeRisk(value: unknown): ForecastRiskLevel {
  const normalized = String(value || '').toUpperCase();
  return normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' ? normalized : 'LOW';
}

function safeWorkload(value: unknown): ForecastWorkloadLevel {
  const normalized = String(value || '').toUpperCase();
  return normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' ? normalized : 'LOW';
}

function safeQualityStatus(value: unknown): ForecastDataQualityStatus {
  const normalized = String(value || '').toUpperCase();
  return normalized === 'OK' || normalized === 'INSUFFICIENT_DATA' ? normalized : 'UNAVAILABLE';
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function rawArray(value: unknown): RawObject[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as RawObject[] : [];
}

function rawObject(value: unknown): RawObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RawObject : null;
}

function hasValue(raw: RawObject, ...keys: string[]): boolean {
  return firstDefined(...keys.map(key => raw[key])) !== undefined;
}

function mapQuality(raw: RawObject | null | undefined): ForecastDataQuality {
  if (!raw) {
    return { ...EMPTY_QUALITY };
  }
  return {
    status: safeQualityStatus(raw['status']),
    fallbackUsed: Boolean(firstDefined(raw['fallbackUsed'] as boolean, raw['fallback_used'] as boolean)),
    message: nullableString(raw['message']),
    historicalDays: safeNumber(firstDefined(raw['historicalDays'], raw['historical_days'])),
    source: safeString(raw['source'], 'database'),
  };
}

function mapSummary(raw: RawObject | null | undefined): ForecastSummary {
  if (!raw) {
    return { ...EMPTY_SUMMARY };
  }
  return {
    predictedAbsences: safeNumber(firstDefined(raw['predictedAbsences'], raw['predicted_absences'])),
    predictedLeaves: safeNumber(firstDefined(raw['predictedLeaves'], raw['predicted_leaves'])),
    predictedPresenceRate: safeNumber(firstDefined(raw['predictedPresenceRate'], raw['predicted_presence_rate']), 100),
    riskLevel: safeRisk(firstDefined(raw['riskLevel'], raw['risk_level'])),
    predictedWorkload: safeWorkload(firstDefined(raw['predictedWorkload'], raw['predicted_workload'])),
  };
}

function mapSeriesPoint(raw: RawObject): ForecastSeriesPoint {
  return {
    date: safeString(raw['date']),
    predictedAbsences: safeNumber(firstDefined(raw['predictedAbsences'], raw['predicted_absences'])),
    predictedLeaves: safeNumber(firstDefined(raw['predictedLeaves'], raw['predicted_leaves'])),
    predictedPresenceRate: safeNumber(firstDefined(raw['predictedPresenceRate'], raw['predicted_presence_rate']), 100),
    actualAbsences: nullableNumber(firstDefined(raw['actualAbsences'], raw['actual_absences'])),
    actualLeaves: nullableNumber(firstDefined(raw['actualLeaves'], raw['actual_leaves'])),
  };
}

function mapTeam(raw: RawObject): ForecastTeamPrediction {
  return {
    teamId: nullableNumber(firstDefined(raw['teamId'], raw['team_id'])),
    teamName: safeString(firstDefined(raw['teamName'], raw['team_name']), 'Non assigne'),
    departmentId: nullableNumber(firstDefined(raw['departmentId'], raw['department_id'])),
    departmentName: nullableString(firstDefined(raw['departmentName'], raw['department_name'])),
    predictedAbsences: safeNumber(firstDefined(raw['predictedAbsences'], raw['predicted_absences'])),
    predictedLeaves: safeNumber(firstDefined(raw['predictedLeaves'], raw['predicted_leaves'])),
    predictedPresenceRate: safeNumber(firstDefined(raw['predictedPresenceRate'], raw['predicted_presence_rate']), 100),
    riskLevel: safeRisk(firstDefined(raw['riskLevel'], raw['risk_level'])),
    explanation: safeString(raw['explanation']),
  };
}

function mapEmployee(raw: RawObject): ForecastEmployeeRisk {
  return {
    employeeId: safeNumber(firstDefined(raw['employeeId'], raw['employee_id'])),
    employeeName: safeString(firstDefined(raw['employeeName'], raw['employee_name']), 'Employe inconnu'),
    teamId: nullableNumber(firstDefined(raw['teamId'], raw['team_id'])),
    teamName: nullableString(firstDefined(raw['teamName'], raw['team_name'])),
    departmentId: nullableNumber(firstDefined(raw['departmentId'], raw['department_id'])),
    departmentName: nullableString(firstDefined(raw['departmentName'], raw['department_name'])),
    absenceCountLast30Days: safeNumber(firstDefined(raw['absenceCountLast30Days'], raw['absence_count_last_30_days'])),
    leaveCountLast30Days: safeNumber(firstDefined(raw['leaveCountLast30Days'], raw['leave_count_last_30_days'])),
    lateCountLast30Days: safeNumber(firstDefined(raw['lateCountLast30Days'], raw['late_count_last_30_days'])),
    plannedLeaveDays: safeNumber(firstDefined(raw['plannedLeaveDays'], raw['planned_leave_days'])),
    riskLevel: safeRisk(firstDefined(raw['riskLevel'], raw['risk_level'])),
    score: safeNumber(raw['score']),
    explanation: safeString(raw['explanation']),
  };
}

function mapDashboard(raw: RawObject | null | undefined): ForecastDashboardResponse {
  if (!raw) {
    return { ...EMPTY_DASHBOARD, summary: { ...EMPTY_SUMMARY }, dataQuality: { ...EMPTY_QUALITY } };
  }
  const summaryRaw = rawObject(raw['summary']);
  const qualityRaw = rawObject(firstDefined(raw['dataQuality'], raw['data_quality']));
  const dataQuality = mapQuality(qualityRaw);
  const hasCompleteSummary = Boolean(
    summaryRaw
    && hasValue(summaryRaw, 'predictedAbsences', 'predicted_absences')
    && hasValue(summaryRaw, 'predictedLeaves', 'predicted_leaves')
    && hasValue(summaryRaw, 'predictedPresenceRate', 'predicted_presence_rate')
    && hasValue(summaryRaw, 'riskLevel', 'risk_level')
    && hasValue(summaryRaw, 'predictedWorkload', 'predicted_workload'),
  );
  return {
    success: Boolean(raw['success']) && hasCompleteSummary && dataQuality.status !== 'UNAVAILABLE',
    period: safeString(raw['period'], 'next_30_days'),
    generatedAt: safeString(firstDefined(raw['generatedAt'], raw['generated_at'])),
    summary: mapSummary(summaryRaw),
    series: rawArray(raw['series']).map(mapSeriesPoint),
    teams: rawArray(raw['teams']).map(mapTeam),
    explanations: Array.isArray(raw['explanations']) ? raw['explanations'].map(item => String(item)) : [],
    dataQuality,
  };
}

function buildParams(filters: ForecastFilters = {}): HttpParams {
  let params = new HttpParams();
  const entries: Array<[string, string | number | null | undefined]> = [
    ['period', filters.period],
    ['startDate', filters.startDate],
    ['endDate', filters.endDate],
    ['companyId', filters.companyId],
    ['departmentId', filters.departmentId],
    ['teamId', filters.teamId],
    ['employeeId', filters.employeeId],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class MlForecastService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.gatewayUrl ?? environment.mlServiceUrl ?? 'http://localhost:8322').replace(/\/+$/, '')}/api/ml/forecast`;

  getDashboard(filters: ForecastFilters = {}): Observable<ForecastDashboardResponse> {
    return this.http.get<RawObject>(`${this.baseUrl}/dashboard`, {
      context: this.requestContext(),
      params: buildParams(filters),
    }).pipe(
      map(response => mapDashboard(response)),
    );
  }

  getLeaves(filters: ForecastFilters = {}): Observable<ForecastListResponse> {
    return this.getList('leaves', filters);
  }

  getAbsences(filters: ForecastFilters = {}): Observable<ForecastListResponse> {
    return this.getList('absences', filters);
  }

  getTeamPresence(filters: ForecastFilters = {}): Observable<ForecastTeamPresenceResponse> {
    return this.http.get<RawObject>(`${this.baseUrl}/team-presence`, {
      context: this.requestContext(),
      params: buildParams(filters),
    }).pipe(
      map(response => ({
        success: Boolean(response['success']),
        period: safeString(response['period'], filters.period || 'next_30_days'),
        generatedAt: safeString(firstDefined(response['generatedAt'], response['generated_at'])),
        teams: rawArray(response['teams']).map(mapTeam),
        dataQuality: mapQuality(firstDefined(response['dataQuality'], response['data_quality']) as RawObject | undefined),
      })),
    );
  }

  getWorkload(filters: ForecastFilters = {}): Observable<ForecastWorkloadResponse> {
    return this.http.get<RawObject>(`${this.baseUrl}/workload`, {
      context: this.requestContext(),
      params: buildParams(filters),
    }).pipe(
      map(response => {
        const dataQuality = mapQuality(rawObject(firstDefined(response['dataQuality'], response['data_quality'])));
        const hasWorkload = hasValue(response, 'predictedWorkload', 'predicted_workload');
        const hasPendingCount = hasValue(response, 'pendingRequestsCount', 'pending_requests_count');
        return {
          success: Boolean(response['success']) && hasWorkload && hasPendingCount && dataQuality.status !== 'UNAVAILABLE',
          period: safeString(response['period'], filters.period || 'next_30_days'),
          generatedAt: safeString(firstDefined(response['generatedAt'], response['generated_at'])),
          predictedWorkload: safeWorkload(firstDefined(response['predictedWorkload'], response['predicted_workload'])),
          pendingRequestsCount: safeNumber(firstDefined(response['pendingRequestsCount'], response['pending_requests_count'])),
          approvedRequestsCount: safeNumber(firstDefined(response['approvedRequestsCount'], response['approved_requests_count'])),
          explanation: safeString(response['explanation']),
          dataQuality,
        };
      }),
    );
  }

  getRiskByEmployee(filters: ForecastFilters = {}): Observable<ForecastEmployeeRiskResponse> {
    return this.http.get<RawObject>(`${this.baseUrl}/risk-by-employee`, {
      context: this.requestContext(),
      params: buildParams(filters),
    }).pipe(
      map(response => {
        const dataQuality = mapQuality(rawObject(firstDefined(response['dataQuality'], response['data_quality'])));
        return {
          success: Boolean(response['success'])
            && Array.isArray(response['employees'])
            && dataQuality.status !== 'UNAVAILABLE',
          period: safeString(response['period'], filters.period || 'next_30_days'),
          generatedAt: safeString(firstDefined(response['generatedAt'], response['generated_at'])),
          employees: rawArray(response['employees']).map(mapEmployee),
          dataQuality,
        };
      }),
    );
  }

  private getList(path: 'leaves' | 'absences', filters: ForecastFilters): Observable<ForecastListResponse> {
    return this.http.get<RawObject>(`${this.baseUrl}/${path}`, {
      context: this.requestContext(),
      params: buildParams(filters),
    }).pipe(
      map(response => ({
        success: Boolean(response['success']),
        period: safeString(response['period'], filters.period || 'next_30_days'),
        generatedAt: safeString(firstDefined(response['generatedAt'], response['generated_at'])),
        items: rawArray(response['items']).map(mapSeriesPoint),
        dataQuality: mapQuality(firstDefined(response['dataQuality'], response['data_quality']) as RawObject | undefined),
      })),
    );
  }

  private requestContext(): HttpContext {
    return new HttpContext().set(SKIP_ERROR_TOAST, true);
  }
}
