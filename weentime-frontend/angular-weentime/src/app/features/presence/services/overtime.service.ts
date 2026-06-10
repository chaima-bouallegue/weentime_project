import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiConfigService } from '../../../core/services/api-config.service';

export type OvertimeStatus =
  | 'NONE'
  | 'NO_OVERTIME'
  | 'PENDING_MANAGER'
  | 'APPROVED_MANAGER'
  | 'REJECTED_MANAGER'
  | 'PENDING_RH'
  | 'APPROVED_RH'
  | 'REJECTED_RH'
  | 'CANCELLED'
  | 'EN_ATTENTE_MANAGER'
  | 'APPROUVEE_MANAGER'
  | 'REFUSEE_MANAGER'
  | 'EN_ATTENTE_RH'
  | 'APPROUVEE_RH'
  | 'REFUSEE_RH'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export interface OvertimeRequestDto {
  id: number;
  utilisateurId: number;
  entrepriseId?: number | null;
  attendanceId?: number | null;
  date: string;
  heuresSupplementaires?: number | string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  actualCheckOut?: string | null;
  overtimeStart?: string | null;
  overtimeEnd?: string | null;
  workedMinutes?: number | null;
  expectedMinutes?: number | null;
  overtimeMinutes?: number | null;
  reason?: string | null;
  status: OvertimeStatus;
  managerId?: number | null;
  managerDecision?: string | null;
  managerComment?: string | null;
  rhDecision?: string | null;
  rhComment?: string | null;
  rhDecisionBy?: number | null;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OvertimePage {
  content: OvertimeRequestDto[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface OvertimeMonthlySummary {
  year: number;
  month: number;
  totalMinutes: number;
  totalHours: number;
  requestCount: number;
}

export interface OvertimeRhStats {
  totalOvertimeMinutes: number;
  totalOvertimeHours: number;
  pendingOvertime: number;
  approvedOvertime: number;
  rejectedOvertime: number;
  totalRequests: number;
}

export interface OvertimeDepartmentStat {
  department: string;
  overtimeMinutes: number;
  overtimeHours: number;
}

@Injectable({ providedIn: 'root' })
export class OvertimeService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  getMy(page = 0, size = 20): Observable<OvertimePage> {
    return this.http.get<unknown>(this.api.OVERTIME.GET_MY, { params: { page, size } as any }).pipe(
      map(response => this.unwrapPage(response))
    );
  }

  getMyMonthlySummary(): Observable<OvertimeMonthlySummary> {
    return this.http.get<unknown>(this.api.OVERTIME.GET_MY_MONTHLY_SUMMARY).pipe(
      map(response => this.unwrap(response) as OvertimeMonthlySummary)
    );
  }

  addReason(id: number, reason: string): Observable<OvertimeRequestDto> {
    return this.http.post<unknown>(this.api.OVERTIME.ADD_REASON(id), { reason }).pipe(
      map(response => this.unwrap(response) as OvertimeRequestDto)
    );
  }

  getManagerPending(page = 0, size = 20): Observable<OvertimePage> {
    return this.http.get<unknown>(this.api.OVERTIME.GET_MANAGER_PENDING, { params: { page, size } as any }).pipe(
      map(response => this.unwrapPage(response))
    );
  }

  getRhPending(page = 0, size = 20): Observable<OvertimePage> {
    return this.http.get<unknown>(this.api.OVERTIME.GET_RH_PENDING, { params: { page, size } as any }).pipe(
      map(response => this.unwrapPage(response))
    );
  }

  approve(id: number, comment?: string): Observable<OvertimeRequestDto> {
    return this.http.patch<unknown>(this.api.OVERTIME.MANAGER_DECISION(id), { decision: 'APPROVED', comment }).pipe(
      map(response => this.unwrap(response) as OvertimeRequestDto)
    );
  }

  reject(id: number, comment?: string): Observable<OvertimeRequestDto> {
    return this.http.patch<unknown>(this.api.OVERTIME.MANAGER_DECISION(id), { decision: 'REJECTED', comment }).pipe(
      map(response => this.unwrap(response) as OvertimeRequestDto)
    );
  }

  requestJustification(id: number, reason?: string): Observable<OvertimeRequestDto> {
    return this.http.post<unknown>(this.api.OVERTIME.REQUEST_JUSTIFICATION(id), { reason }).pipe(
      map(response => this.unwrap(response) as OvertimeRequestDto)
    );
  }

  getRhStats(): Observable<OvertimeRhStats> {
    return this.http.get<unknown>(this.api.OVERTIME.GET_RH_STATS).pipe(
      map(response => this.unwrap(response) as OvertimeRhStats)
    );
  }

  getRhByDepartment(): Observable<OvertimeDepartmentStat[]> {
    return this.http.get<unknown>(this.api.OVERTIME.GET_RH_BY_DEPARTMENT).pipe(
      map(response => this.unwrap(response) as OvertimeDepartmentStat[])
    );
  }

  rhApprove(id: number, comment?: string): Observable<OvertimeRequestDto> {
    return this.http.patch<unknown>(this.api.OVERTIME.RH_DECISION(id), { decision: 'APPROVED', comment }).pipe(
      map(response => this.unwrap(response) as OvertimeRequestDto)
    );
  }

  rhReject(id: number, comment?: string): Observable<OvertimeRequestDto> {
    return this.http.patch<unknown>(this.api.OVERTIME.RH_DECISION(id), { decision: 'REJECTED', comment }).pipe(
      map(response => this.unwrap(response) as OvertimeRequestDto)
    );
  }

  private unwrap(response: unknown): unknown {
    const envelope = response as { data?: unknown };
    return envelope?.data ?? response;
  }

  private unwrapPage(response: unknown): OvertimePage {
    const data = this.unwrap(response) as Partial<OvertimePage> | OvertimeRequestDto[];
    if (Array.isArray(data)) {
      return {
        content: data,
        totalElements: data.length,
        totalPages: 1,
        number: 0,
        size: data.length,
      };
    }
    return {
      content: Array.isArray(data?.content) ? data.content : [],
      totalElements: Number(data?.totalElements ?? data?.content?.length ?? 0),
      totalPages: Number(data?.totalPages ?? 1),
      number: Number(data?.number ?? 0),
      size: Number(data?.size ?? data?.content?.length ?? 0),
    };
  }
}
