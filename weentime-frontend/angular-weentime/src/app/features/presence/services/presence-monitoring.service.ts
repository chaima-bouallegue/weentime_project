import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { ApiConfigService } from '../../../core/services/api-config.service';
import {
  AttendanceSessionView,
  GlobalPresenceAnalytics,
  PresenceOverview,
  PresenceStats,
} from '../models/presence.model';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class PresenceMonitoringService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  getTeamToday(teamId?: number): Observable<PresenceOverview> {
    const url = teamId != null
      ? `${this.api.PRESENCE.GET_TEAM_TODAY}?teamId=${teamId}`
      : this.api.PRESENCE.GET_TEAM_TODAY;
    return this.http.get<ApiEnvelope<PresenceOverview>>(url).pipe(map(response => response.data));
  }

  getTeamHistory(teamId?: number, size: number = 20): Observable<PageResponse<AttendanceSessionView>> {
    const params = [`page=0`, `size=${size}`];
    if (teamId != null) {
      params.push(`teamId=${teamId}`);
    }
    return this.http
      .get<ApiEnvelope<PageResponse<AttendanceSessionView>>>(`${this.api.PRESENCE.GET_TEAM_HISTORY}?${params.join('&')}`)
      .pipe(map(response => response.data));
  }

  getCompanyToday(): Observable<PresenceOverview> {
    return this.http
      .get<ApiEnvelope<PresenceOverview>>(this.api.PRESENCE.GET_COMPANY_TODAY)
      .pipe(map(response => response.data));
  }

  getCompanyStats(): Observable<PresenceStats> {
    return this.http
      .get<ApiEnvelope<PresenceStats>>(this.api.PRESENCE.GET_COMPANY_STATS)
      .pipe(map(response => response.data));
  }

  getGlobalAnalytics(): Observable<GlobalPresenceAnalytics> {
    return this.http
      .get<ApiEnvelope<GlobalPresenceAnalytics>>(this.api.PRESENCE.GET_GLOBAL_ANALYTICS)
      .pipe(map(response => response.data));
  }
}
