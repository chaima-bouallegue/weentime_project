import { Injectable, inject } from '@angular/core';
import { Observable, Subject, catchError, map, merge, of, shareReplay, startWith, switchMap } from 'rxjs';
import { ManagerApiService } from '../manager-api.service';
import { ManagerDashboardActivity, ManagerDashboardData } from '../manager.models';

@Injectable({ providedIn: 'root' })
export class ManagerDashboardService {
  private readonly managerApi = inject(ManagerApiService);
  private readonly refresh$ = new Subject<void>();

  readonly dashboard$ = merge(
    this.refresh$.pipe(startWith(void 0)),
    this.watchRealtimeEvents()
  ).pipe(
    switchMap(() => this.loadDashboard()),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  getDashboardData(): Observable<ManagerDashboardData> {
    return this.dashboard$;
  }

  refresh(): void {
    this.refresh$.next();
  }

  private loadDashboard(): Observable<ManagerDashboardData> {
    return this.managerApi.getManagerTeamSnapshot().pipe(
      switchMap(snapshot =>
        this.managerApi.getPendingRequests(0, 8).pipe(
          map(requests => {
            const members = snapshot.members;
            const totalMembers = members.length;
            const presentCount = members.filter(member => ['PRESENT', 'LATE', 'REMOTE'].includes(member.presence?.status ?? '')).length;
            const lateCount = members.filter(member => member.presence?.lateArrival || member.presence?.status === 'LATE').length;
            const absentCount = Math.max(totalMembers - presentCount, 0);
            const pendingRequests = requests.content;

            return {
              kpis: {
                totalMembers,
                presentCount,
                absentCount,
                lateCount,
                pendingCount: Number(requests.totalElements ?? pendingRequests.length),
                attendanceRate: totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 0
              },
              members,
              pendingRequests,
              activities: this.buildActivities(members, pendingRequests),
              hasLiveSignals: Boolean(snapshot.overview && totalMembers > 0)
            } satisfies ManagerDashboardData;
          })
        )
      ),
      catchError(() => {
        return of({
          kpis: {
            totalMembers: 0,
            presentCount: 0,
            absentCount: 0,
            lateCount: 0,
            pendingCount: 0,
            attendanceRate: 0
          },
          members: [],
          pendingRequests: [],
          activities: [],
          hasLiveSignals: false
        } satisfies ManagerDashboardData);
      })
    );
  }

  private buildActivities(dataMembers: ManagerDashboardData['members'], pendingRequests: ManagerDashboardData['pendingRequests']): ManagerDashboardActivity[] {
    const presenceActivities = dataMembers
      .filter(member => member.presence)
      .slice(0, 3)
      .map(member => ({
        title: member.fullName,
        description: this.describePresence(member),
        timestamp: member.presence?.heureEntree ?? new Date().toISOString()
      }));

    const requestActivities = pendingRequests.slice(0, 3).map(request => ({
      title: request.utilisateur.fullName,
      description: `${this.labelForType(request.type)} en attente de validation`,
      timestamp: request.dateCreation
    }));

    return [...requestActivities, ...presenceActivities]
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, 6);
  }

  private describePresence(member: ManagerDashboardData['members'][number]): string {
    const status = member.presence?.status ?? 'ABSENT';
    if (status === 'LATE') {
      return 'Arrivee tardive detectee ce matin';
    }
    if (status === 'REMOTE') {
      return 'Actif en teletravail';
    }
    if (status === 'PRESENT') {
      return 'Presence confirmee aujourd hui';
    }
    return 'Aucun signal de presence aujourd hui';
  }

  private labelForType(type: ManagerDashboardData['pendingRequests'][number]['type']): string {
    switch (type) {
      case 'AUTORISATION':
        return 'Autorisation';
      case 'TELETRAVAIL':
        return 'Teletravail';
      case 'ABSENCE':
        return 'Absence';
      case 'DOCUMENT':
        return 'Document';
      default:
        return 'Conge';
    }
  }

  private watchRealtimeEvents(): Observable<unknown> {
    return of(null);
  }
}
