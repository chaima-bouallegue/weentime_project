import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export type AnomalyRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyRecord {
  employee_id: number;
  employee_name: string;
  date: string;
  score: number;
  risk: AnomalyRisk;
  reasons: string[];
  explanation: string;
  features?: Record<string, number | string>;
}

export interface AnomalyDashboardResponse {
  success: boolean;
  generated_at: string;
  total_anomalies: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  anomalies: AnomalyRecord[];
}

export interface EmployeeRiskResponse {
  success: boolean;
  employee_id: number;
  employee_name: string;
  current_risk: AnomalyRisk;
  score: number;
  anomalies_last_30_days: number;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  latest_anomaly: AnomalyRecord | null;
}

const EMPTY_DASHBOARD: AnomalyDashboardResponse = {
  success: false,
  generated_at: new Date().toISOString(),
  total_anomalies: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  anomalies: [],
};

/**
 * Calls the WeenTime ML service (port 8001) for attendance anomaly insights.
 * Network/CORS failures fail closed (empty dashboard, LOW risk) so callers can
 * always render without checking error envelopes.
 */
@Injectable({ providedIn: 'root' })
export class MlAnomalyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = (environment.mlServiceUrl ?? 'http://localhost:8001').replace(/\/+$/, '');

  getTodayAnomalies(): Observable<AnomalyDashboardResponse> {
    return this.http
      .get<AnomalyDashboardResponse>(`${this.baseUrl}/api/ml/anomalies/today`)
      .pipe(catchError(() => of(EMPTY_DASHBOARD)));
  }

  getDashboardSummary(): Observable<AnomalyDashboardResponse> {
    return this.http
      .get<AnomalyDashboardResponse>(`${this.baseUrl}/api/ml/anomalies/dashboard`)
      .pipe(catchError(() => of(EMPTY_DASHBOARD)));
  }

  getEmployeeRisk(employeeId: number): Observable<EmployeeRiskResponse> {
    return this.http
      .get<EmployeeRiskResponse>(`${this.baseUrl}/api/ml/anomalies/employee/${employeeId}`)
      .pipe(
        catchError(() =>
          of<EmployeeRiskResponse>({
            success: false,
            employee_id: employeeId,
            employee_name: `Employé #${employeeId}`,
            current_risk: 'LOW',
            score: 0,
            anomalies_last_30_days: 0,
            trend: 'STABLE',
            latest_anomaly: null,
          }),
        ),
      );
  }
}
