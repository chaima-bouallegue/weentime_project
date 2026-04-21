import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { ApiConfigService } from '../../core/services/api-config.service';

export interface RhPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface RhDashboardActivity {
  initials: string;
  color: string;
  description: string;
  date: string;
}

export interface RhDashboardSnapshot {
  demandesEnAttente: number;
  employeesOnLeave: number;
  tauxPresenceMoyen: number;
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  totalHoursWorked: number;
  departmentEmployeeCounts: Record<string, number>;
  leaveDistribution: Record<string, number>;
  monthlyRequestEvolution: Record<number, number>;
  recentActivities: RhDashboardActivity[];
}

export interface RhStatsOverview {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  pendingRequests: number;
  employeesOnLeave: number;
  totalHoursWorked: number;
  overtimeHours: number;
  attendanceRate: number;
  absenceRate: number;
  requestTypeDistribution: Record<string, number>;
  requestStatusDistribution: Record<string, number>;
  monthlyRequestEvolution: Record<number, number>;
  departmentEmployeeCounts: Record<string, number>;
}

export interface RhRequestProfile {
  id?: number;
  nom?: string;
  prenom?: string;
  fullName?: string;
  email?: string;
  poste?: string;
  departement?: string;
  equipe?: string;
}

export interface RhRequest {
  id: number;
  utilisateurId: number;
  managerId?: number;
  type: 'CONGE' | 'ABSENCE' | 'TELETRAVAIL' | 'AUTORISATION' | 'DOCUMENT';
  statut: 'EN_ATTENTE_MANAGER' | 'EN_ATTENTE_RH' | 'APPROUVEE' | 'REFUSEE' | 'ANNULEE';
  dateCreation: string;
  dateDecision?: string | null;
  dateDebut?: string | null;
  dateFin?: string | null;
  nombreJours?: number | null;
  duree?: number | null;
  motif?: string | null;
  commentaire?: string | null;
  commentaireValidateur?: string | null;
  typeAutorisation?: string | null;
  typeDocument?: string | null;
  utilisateur?: RhRequestProfile | null;
  manager?: RhRequestProfile | null;
}

export interface RhLeaveBalance {
  id?: number;
  utilisateurId: number;
  typeCongeId: number;
  annee: number;
  joursAcquis: number;
  joursUtilises: number;
  joursRestants: number;
  joursEnAttente: number;
}

export interface TypeCongeOption {
  id: number;
  libelle: string;
  nombreJoursMax?: number | null;
  decompteJours?: boolean | null;
  requireJustificatif?: boolean | null;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable({ providedIn: 'root' })
export class RhApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  getDashboard(): Observable<RhDashboardSnapshot> {
    return this.http.get<ApiEnvelope<RhDashboardSnapshot>>(this.api.RH.GET_RH_DASHBOARD).pipe(
      map(response => this.unwrap(response) ?? this.emptyDashboard())
    );
  }

  getStatsOverview(): Observable<RhStatsOverview> {
    return this.http.get<ApiEnvelope<RhStatsOverview>>(this.api.RH.GET_RH_STATS).pipe(
      map(response => this.unwrap(response) ?? this.emptyStats())
    );
  }

  getRequests(
    page = 0,
    size = 50,
    filters?: {
      statut?: string;
      type?: string;
      employee?: string;
      dateFrom?: string;
      dateTo?: string;
    }
  ): Observable<RhPage<RhRequest>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', 'createdAt,desc');

    if (filters?.statut) {
      params = params.set('statut', filters.statut);
    }
    if (filters?.type) {
      params = params.set('type', filters.type);
    }
    if (filters?.employee) {
      params = params.set('employee', filters.employee);
    }
    if (filters?.dateFrom) {
      params = params.set('dateFrom', filters.dateFrom);
    }
    if (filters?.dateTo) {
      params = params.set('dateTo', filters.dateTo);
    }

    return this.http.get<ApiEnvelope<RhPage<any>>>(this.api.RH.GET_RH_REQUESTS, { params }).pipe(
      map(response => this.mapRequestPage(this.unwrap(response)))
    );
  }

  approveRequest(request: RhRequest, commentaire: string): Observable<RhRequest> {
    return this.http.put<ApiEnvelope<any>>(`${this.api.getApiBase()}/rh/demandes/${request.id}/statut`, {
      typeDemande: request.type,
      statut: 'APPROUVEE',
      commentaire
    }).pipe(
      map(response => this.mapRequest(this.unwrap(response)))
    );
  }

  rejectRequest(request: RhRequest, commentaire: string): Observable<RhRequest> {
    return this.http.put<ApiEnvelope<any>>(`${this.api.getApiBase()}/rh/demandes/${request.id}/statut`, {
      typeDemande: request.type,
      statut: 'REFUSEE',
      commentaire
    }).pipe(
      map(response => this.mapRequest(this.unwrap(response)))
    );
  }

  getTypeConges(page = 0, size = 100): Observable<TypeCongeOption[]> {
    return this.http.get<ApiEnvelope<RhPage<TypeCongeOption>>>(this.api.RH.GET_TYPE_CONGES, {
      params: new HttpParams().set('page', String(page)).set('size', String(size))
    }).pipe(
      map(response => this.unwrap(response)?.content ?? [])
    );
  }

  getLeaveBalances(userId: number, annee: number): Observable<RhLeaveBalance[]> {
    return this.http.get<ApiEnvelope<RhLeaveBalance[]>>(this.api.RH.GET_USER_SOLDE_CONGES(userId, annee)).pipe(
      map(response => this.unwrap(response) ?? [])
    );
  }

  saveLeaveBalance(payload: RhLeaveBalance): Observable<RhLeaveBalance> {
    return this.http.post<ApiEnvelope<RhLeaveBalance>>(this.api.getApiBase() + '/solde-conges', payload).pipe(
      map(response => this.unwrap(response))
    );
  }

  private mapRequestPage(page: RhPage<any> | undefined): RhPage<RhRequest> {
    const content = Array.isArray(page?.content) ? page.content : [];
    return {
      content: content.map(item => this.mapRequest(item)),
      totalElements: page?.totalElements ?? content.length,
      totalPages: page?.totalPages ?? 1,
      number: page?.number ?? 0,
      size: page?.size ?? content.length
    };
  }

  private mapRequest(source: any): RhRequest {
    return {
      id: Number(source?.id ?? 0),
      utilisateurId: Number(source?.utilisateurId ?? source?.utilisateur?.id ?? 0),
      managerId: source?.managerId != null ? Number(source.managerId) : undefined,
      type: (source?.typeDemande ?? source?.type ?? 'CONGE') as RhRequest['type'],
      statut: (source?.statut ?? 'EN_ATTENTE_RH') as RhRequest['statut'],
      dateCreation: source?.createdAt ?? source?.dateCreation ?? '',
      dateDecision: source?.dateDecision ?? null,
      dateDebut: source?.dateDebut ?? null,
      dateFin: source?.dateFin ?? null,
      nombreJours: source?.nombreJours ?? null,
      duree: source?.duree ?? null,
      motif: source?.motif ?? null,
      commentaire: source?.commentaire ?? null,
      commentaireValidateur: source?.commentaireValidateur ?? null,
      typeAutorisation: source?.typeAutorisation ?? null,
      typeDocument: source?.typeDocument ?? null,
      utilisateur: source?.utilisateur ?? null,
      manager: source?.manager ?? null
    };
  }

  private emptyDashboard(): RhDashboardSnapshot {
    return {
      demandesEnAttente: 0,
      employeesOnLeave: 0,
      tauxPresenceMoyen: 0,
      totalEmployees: 0,
      presentToday: 0,
      absentToday: 0,
      totalHoursWorked: 0,
      departmentEmployeeCounts: {},
      leaveDistribution: {},
      monthlyRequestEvolution: {},
      recentActivities: []
    };
  }

  private emptyStats(): RhStatsOverview {
    return {
      totalEmployees: 0,
      presentToday: 0,
      absentToday: 0,
      pendingRequests: 0,
      employeesOnLeave: 0,
      totalHoursWorked: 0,
      overtimeHours: 0,
      attendanceRate: 0,
      absenceRate: 0,
      requestTypeDistribution: {},
      requestStatusDistribution: {},
      monthlyRequestEvolution: {},
      departmentEmployeeCounts: {}
    };
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }
}
