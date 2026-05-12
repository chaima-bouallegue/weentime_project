import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';

export interface EmployeeStatusDTO {
  id: number;
  name: string;
  prenom: string;
  email: string;
  poste: string;
  departementName: string;
  teamName: string;
  status: 'PRESENT' | 'REMOTE' | 'LEAVE' | 'ABSENCE';
  detail: string;
  photoUrl: string;
}

export interface PlanningResponseDTO {
  date: string;
  employees: EmployeeStatusDTO[];
  presenceRate: number;
  presenceText: string;
  isRestDay: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class RhPlanningService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/rh/planning`;

  getPlanning(start: string, end: string, teamId?: number, departmentId?: number): Observable<PlanningResponseDTO[]> {
    let params: any = { start, end };
    if (teamId) params.teamId = teamId;
    if (departmentId) params.departmentId = departmentId;
    return this.http.get<PlanningResponseDTO[]>(this.apiUrl, { params });
  }

  getBulkStatus(userIds: number[], dateDebut: string, dateFin: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/bulk-status`, { userIds, dateDebut, dateFin });
  }

  sendBulkNotification(userIds: number[], titre: string, message: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/notify`, { userIds, titre, message });
  }

  isExcused(userId: number, date: string): Observable<string> {
    return this.http.get<string>(`${this.apiUrl}/is-excused`, { params: { userId, date } });
  }
}
