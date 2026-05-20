import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AnomalyRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/* ─── Angular-side domain (camelCase) ───────────────────────── */

export interface AnomalyRecord {
  employeeId: number;
  employeeName: string;
  date: string;
  score: number;
  risk: AnomalyRisk;
  reasons: string[];
  explanation: string;
  features?: Record<string, number | string>;
}

export interface AnomalyDashboardResponse {
  success: boolean;
  /** Retained for back-compat; the service no longer fabricates demo data. */
  isDemo: boolean;
  /** "ok" when presence backend answered, "unavailable" when it errored. */
  backendStatus: 'ok' | 'unavailable' | 'error';
  generatedAt: string;
  totalAnomalies: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  anomalies: AnomalyRecord[];
}

export interface EmployeeRiskResponse {
  success: boolean;
  employeeId: number;
  employeeName: string;
  currentRisk: AnomalyRisk;
  score: number;
  anomaliesLast30Days: number;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  latestAnomaly: AnomalyRecord | null;
}

/* ─── Raw ml-service payload (snake_case) ──────────────────── */

interface RawAnomalyRecord {
  employee_id: number;
  employee_name: string;
  date: string;
  score: number;
  risk: AnomalyRisk;
  reasons: string[];
  explanation: string;
  features?: Record<string, number | string>;
}

interface RawAnomalyDashboardResponse {
  success: boolean;
  is_demo?: boolean;
  backend_status?: string;
  generated_at: string;
  total_anomalies: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  anomalies: RawAnomalyRecord[];
}

interface RawEmployeeRiskResponse {
  success: boolean;
  employee_id: number;
  employee_name: string;
  current_risk: AnomalyRisk;
  score: number;
  anomalies_last_30_days: number;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  latest_anomaly: RawAnomalyRecord | null;
}

/* ─── Empty fallbacks (used when API fails / network down) ── */

const EMPTY_DASHBOARD: AnomalyDashboardResponse = {
  success: false,
  isDemo: false,
  backendStatus: 'unavailable',
  generatedAt: '',
  totalAnomalies: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  anomalies: [],
};

function safeBackendStatus(value: unknown): 'ok' | 'unavailable' | 'error' {
  return value === 'unavailable' || value === 'error' ? value : 'ok';
}

const ALLOWED_RISKS: ReadonlySet<AnomalyRisk> = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function safeRisk(value: unknown): AnomalyRisk {
  const upper = String(value || '').toUpperCase() as AnomalyRisk;
  return ALLOWED_RISKS.has(upper) ? upper : 'LOW';
}

function mapAnomalyRecord(raw: RawAnomalyRecord | null | undefined): AnomalyRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    employeeId: Number(raw.employee_id) || 0,
    employeeName: String(raw.employee_name ?? '').trim() || `Employé #${Number(raw.employee_id) || 0}`,
    date: String(raw.date ?? ''),
    score: Number.isFinite(raw.score) ? Number(raw.score) : 0,
    risk: safeRisk(raw.risk),
    reasons: Array.isArray(raw.reasons) ? raw.reasons.map(r => String(r)) : [],
    explanation: String(raw.explanation ?? ''),
    features: raw.features ?? undefined,
  };
}

function mapDashboard(raw: RawAnomalyDashboardResponse | null | undefined): AnomalyDashboardResponse {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_DASHBOARD };
  }
  const anomalies = Array.isArray(raw.anomalies)
    ? raw.anomalies.map(mapAnomalyRecord).filter((a): a is AnomalyRecord => a !== null)
    : [];
  // Trust the API-reported counts but never invent records the API didn't send.
  // If anomalies array is empty, total must be 0 regardless of what counts the API claims.
  const totalAnomalies = anomalies.length === 0 ? 0 : Number(raw.total_anomalies ?? anomalies.length) || 0;
  const critical = anomalies.length === 0 ? 0 : Number(raw.critical ?? 0) || 0;
  const high = anomalies.length === 0 ? 0 : Number(raw.high ?? 0) || 0;
  const medium = anomalies.length === 0 ? 0 : Number(raw.medium ?? 0) || 0;
  const low = anomalies.length === 0 ? 0 : Number(raw.low ?? 0) || 0;
  return {
    success: Boolean(raw.success),
    isDemo: Boolean(raw.is_demo),
    backendStatus: safeBackendStatus(raw.backend_status),
    generatedAt: String(raw.generated_at ?? ''),
    totalAnomalies,
    critical,
    high,
    medium,
    low,
    anomalies,
  };
}

function mapEmployeeRisk(raw: RawEmployeeRiskResponse | null | undefined, employeeId: number): EmployeeRiskResponse {
  if (!raw || typeof raw !== 'object') {
    return {
      success: false,
      employeeId,
      employeeName: `Employé #${employeeId}`,
      currentRisk: 'LOW',
      score: 0,
      anomaliesLast30Days: 0,
      trend: 'STABLE',
      latestAnomaly: null,
    };
  }
  return {
    success: Boolean(raw.success),
    employeeId: Number(raw.employee_id) || employeeId,
    employeeName: String(raw.employee_name ?? '').trim() || `Employé #${employeeId}`,
    currentRisk: safeRisk(raw.current_risk),
    score: Number.isFinite(raw.score) ? Number(raw.score) : 0,
    anomaliesLast30Days: Number(raw.anomalies_last_30_days ?? 0) || 0,
    trend: raw.trend === 'IMPROVING' || raw.trend === 'WORSENING' ? raw.trend : 'STABLE',
    latestAnomaly: mapAnomalyRecord(raw.latest_anomaly),
  };
}

/**
 * Calls the WeenTime ML service (port 8001) for attendance anomaly insights.
 * Network/CORS failures fail closed (empty dashboard, LOW risk) so callers can
 * always render without checking error envelopes. The raw snake_case payload
 * is mapped to a camelCase Angular domain model.
 */
@Injectable({ providedIn: 'root' })
export class MlAnomalyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = (environment.mlServiceUrl ?? 'http://127.0.0.1:8001').replace(/\/+$/, '');

  getTodayAnomalies(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/today`);
  }

  /**
   * Manager-scoped team anomalies. The ml-service does not yet expose a
   * dedicated team endpoint -- /today already returns the company snapshot
   * which the manager dashboard can filter/slice client-side.
   */
  getTeamAnomalies(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/today`);
  }

  getDashboardSummary(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/dashboard`);
  }

  getEmployeeRisk(employeeId: number): Observable<EmployeeRiskResponse> {
    const url = `${this.baseUrl}/api/ml/anomalies/employee/${employeeId}`;
    return this.http.get<RawEmployeeRiskResponse>(url).pipe(
      map(response => {
        // eslint-disable-next-line no-console
        console.debug('[ML employee risk response]', response);
        const mapped = mapEmployeeRisk(response, employeeId);
        // eslint-disable-next-line no-console
        console.debug('[ML employee risk mapped]', mapped);
        return mapped;
      }),
      catchError(err => {
        // eslint-disable-next-line no-console
        console.warn('[ML employee risk failed]', err);
        return of(mapEmployeeRisk(null, employeeId));
      }),
    );
  }

  private fetchDashboard(url: string): Observable<AnomalyDashboardResponse> {
    return this.http.get<RawAnomalyDashboardResponse>(url).pipe(
      map(response => {
        // eslint-disable-next-line no-console
        console.debug('[ML anomalies response]', response);
        const mapped = mapDashboard(response);
        // eslint-disable-next-line no-console
        console.debug('[ML anomalies mapped]', mapped);
        return mapped;
      }),
      catchError(err => {
        // eslint-disable-next-line no-console
        console.warn('[ML anomalies fetch failed]', err);
        return of({ ...EMPTY_DASHBOARD });
      }),
    );
  }
}
