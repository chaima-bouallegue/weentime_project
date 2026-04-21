import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { ManagerPresenceData, ManagerPresenceKpis, ManagerPresenceMember } from '../manager.models';
import { PresenceOverview, PresenceStats } from '../../presence/models/presence.model';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class ManagerPresenceService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  getTeamPresence(teamId?: number | null): Observable<ManagerPresenceData> {
    const params = teamId ? new HttpParams().set('teamId', String(teamId)) : undefined;

    return forkJoin({
      team: this.http.get<ApiEnvelope<PresenceOverview> | PresenceOverview>(this.api.PRESENCE.GET_TEAM_TODAY, { params }).pipe(
        map(response => this.unwrap(response)),
        catchError(() => of(null))
      ),
      stats: this.http.get<ApiEnvelope<PresenceStats> | PresenceStats>(this.api.PRESENCE.GET_PRESENCE_STATS).pipe(
        map(response => this.unwrap(response)),
        catchError(() => of(null))
      )
    }).pipe(
      map(({ team, stats }) => this.normalize(team, stats))
    );
  }

  private normalize(team: PresenceOverview | null, stats: PresenceStats | null): ManagerPresenceData {
    const members = (team?.members ?? []).map(member => this.mapMember(member));
    const presentCount = members.filter(member => member.status === 'ACTIVE' || member.status === 'LATE').length;
    const lateCount = members.filter(member => member.status === 'LATE').length;
    const absentCount = members.filter(member => member.status === 'ABSENT' || member.status === 'OFF').length;

    return {
      team,
      stats,
      members,
      kpis: {
        totalMembers: Number(team?.totalMembers ?? members.length),
        presentCount,
        lateCount,
        absentCount,
        averagePunctuality: this.computePunctuality(stats, presentCount, lateCount)
      }
    };
  }

  private mapMember(member: PresenceOverview['members'][number]): ManagerPresenceMember {
    const durationMinutes = Math.max(Math.round(Number(member.durationSeconds ?? 0) / 60), 0);
    return {
      id: Number(member.utilisateurId ?? 0),
      name: member.nomComplet || `Employe #${member.utilisateurId ?? 0}`,
      avatar: null,
      jobTitle: member.equipe || 'Equipe',
      status: this.mapStatus(member.status, Boolean(member.lateArrival)),
      arrivalTime: this.formatTime(member.heureEntree),
      departureTime: this.formatTime(member.heureSortie),
      totalMinutes: durationMinutes,
      overtimeMinutes: Math.max(durationMinutes - 8 * 60, 0),
      lastActivity: this.resolveLastActivity(member.heureSortie ?? member.heureEntree)
    };
  }

  private mapStatus(status: string | null | undefined, lateArrival: boolean): ManagerPresenceMember['status'] {
    if (status === 'LATE' || lateArrival) {
      return 'LATE';
    }
    if (status === 'PRESENT' || status === 'REMOTE' || status === 'HALF_DAY') {
      return 'ACTIVE';
    }
    if (status === 'ON_LEAVE') {
      return 'OFF';
    }
    return 'ABSENT';
  }

  private computePunctuality(stats: PresenceStats | null, presentCount: number, lateCount: number): number {
    const onTimeArrivals = Number(stats?.onTimeArrivals ?? stats?.onTimeCount ?? Math.max(presentCount - lateCount, 0));
    const lateArrivals = Number(stats?.lateArrivals ?? stats?.lateCount ?? lateCount);
    const total = onTimeArrivals + lateArrivals;
    if (total <= 0) {
      return 0;
    }
    return Math.round((onTimeArrivals / total) * 100);
  }

  private resolveLastActivity(value: string | null | undefined): string {
    if (!value) {
      return '--:--';
    }
    return this.formatTime(value) ?? '--:--';
  }

  private formatTime(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const match = value.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }
}
