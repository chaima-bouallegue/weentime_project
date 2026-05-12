import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { ApiConfigService } from '../../core/services/api-config.service';
import { AuthService } from '../../core/services/auth.service';
import { PresenceMonitoringService } from '../presence/services/presence-monitoring.service';
import { AttendanceSessionView, PresenceMemberStatus, PresenceOverview } from '../presence/models/presence.model';
import { ManagerApprovalRequest, ManagerTeamMember, ManagerTeamSnapshot, ManagerUserRef } from './manager.models';

export interface ManagerPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

interface EquipeDto {
  id: number;
  nom: string;
  responsableId?: number;
  departementId?: number;
  departementNom?: string;
}

interface TeamMemberDto {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  avatarUrl?: string | null;
  photo?: string | null;
  poste?: string;
  departementId?: number | null;
  departementNom?: string | null;
  equipeId?: number | null;
  equipeNom?: string | null;
  roles?: string[];
  statut?: string;
}

@Injectable({ providedIn: 'root' })
export class ManagerApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly auth = inject(AuthService);
  private readonly monitoringService = inject(PresenceMonitoringService);

  getPendingRequests(page = 0, size = 20): Observable<ManagerPage<ManagerApprovalRequest>> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size)).set('sort', 'dateCreation,desc');
    return this.http.get<ApiEnvelope<ManagerPage<any>>>(this.api.RH.GET_MANAGER_ALL_DEMANDS(this.auth.currentUser()?.id || 0), { params }).pipe(
      map(response => this.mapDemandPage(this.unwrap(response))),
      map(pageData => ({
        ...pageData,
        content: pageData.content.filter(item => item.statut === 'EN_ATTENTE_MANAGER'),
        totalElements: pageData.content.filter(item => item.statut === 'EN_ATTENTE_MANAGER').length,
        totalPages: 1,
        number: 0
      }))
    );
  }

  getAllManagerRequests(page = 0, size = 100, statut?: string): Observable<ManagerPage<ManagerApprovalRequest>> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size)).set('sort', 'createdAt,desc');
    if (statut) {
      params = params.set('statut', statut);
    }
    return this.http.get<ApiEnvelope<ManagerPage<any>>>(this.api.RH.GET_MANAGER_ALL_DEMANDS(this.auth.currentUser()?.id || 0), { params }).pipe(
      map(response => this.mapDemandPage(this.unwrap(response)))
    );
  }

  getManagerTeamMembers(): Observable<ManagerTeamMember[]> {
    return this.resolveManagerTeamMembers();
  }

  getManagerTeamSnapshot(): Observable<ManagerTeamSnapshot> {
    return forkJoin({
      members: this.resolveManagerTeamMembers(),
      overview: this.monitoringService.getTeamToday()
    }).pipe(
      map(({ members, overview }) => ({
        members: members.map(member => ({
          ...member,
          presence: overview.members.find(item => item.utilisateurId === member.id) ?? null
        })),
        overview
      }))
    );
  }

  getManagerPresenceOverview(): Observable<PresenceOverview> {
    return this.monitoringService.getTeamToday();
  }

  getManagerTeamHistory(size = 8): Observable<AttendanceSessionView[]> {
    return this.monitoringService.getTeamHistory(undefined, size).pipe(
      map(page => page.content ?? [])
    );
  }

  private resolveManagerTeamMembers(): Observable<ManagerTeamMember[]> {
    const currentUserId = this.auth.currentUser()?.id;
    if (!currentUserId) {
      return of([]);
    }

    return this.http.get<ManagerPage<EquipeDto>>(this.api.ORGANISATION.GET_EQUIPES, {
      params: new HttpParams().set('page', '0').set('size', '100')
    }).pipe(
      map(page => page.content.filter(team => team.responsableId === currentUserId)),
      map(teams => teams.slice(0, 10)),
      switchMap(teams => {
        if (teams.length === 0) {
          return of([] as ManagerTeamMember[]);
        }

        return forkJoin(
          teams.map(team =>
            this.http.get<ManagerPage<TeamMemberDto>>(this.api.ORGANISATION.GET_EQUIPE_MEMBERS(team.id), {
              params: new HttpParams().set('page', '0').set('size', '100')
            }).pipe(
              map(page => page.content || []),
              map(content => content.map(member => ({
                id: member.id,
                nom: member.nom,
                prenom: member.prenom,
                fullName: `${member.prenom ?? ''} ${member.nom ?? ''}`.trim(),
                email: member.email,
                avatarUrl: member.avatarUrl ?? member.photo ?? null,
                poste: member.poste ?? null,
                departementId: member.departementId ?? team.departementId ?? null,
                departementNom: member.departementNom ?? team.departementNom ?? null,
                equipeId: member.equipeId ?? team.id,
                equipeNom: member.equipeNom ?? team.nom,
                roles: member.roles ?? [],
                statut: member.statut ?? null
              } satisfies ManagerTeamMember)))
            )
          )
        ).pipe(
          map(results => results.flat())
        );
      })
    );
  }

  private mapDemandPage(page: ManagerPage<any> | undefined): ManagerPage<ManagerApprovalRequest> {
    const content = Array.isArray(page?.content) ? page.content : [];
    return {
      content: content.map(dto => this.mapDemande(dto)),
      totalElements: page?.totalElements ?? content.length,
      totalPages: page?.totalPages ?? 1,
      number: page?.number ?? 0,
      size: page?.size ?? content.length
    };
  }

  private mapDemande(dto: any): ManagerApprovalRequest {
    const utilisateur = this.mapUser(dto?.utilisateur, dto?.utilisateurId);
    const typeAutorisation = this.resolveNestedLabel(dto?.typeAutorisation);
    const typeDocument = this.resolveNestedLabel(dto?.typeDocument);
    return {
      id: Number(dto?.id ?? 0),
      utilisateurId: utilisateur.id,
      type: (dto?.typeDemande ?? 'CONGE') as ManagerApprovalRequest['type'],
      statut: (dto?.statut ?? 'EN_ATTENTE_MANAGER') as ManagerApprovalRequest['statut'],
      dateCreation: dto?.createdAt ?? dto?.dateCreation ?? '',
      dateDebut: dto?.dateDebut ?? null,
      dateFin: dto?.dateFin ?? null,
      nombreJours: this.toNullableNumber(dto?.nombreJours),
      description: String(typeDocument || typeAutorisation || dto?.typeCongeNom || dto?.motif || dto?.commentaire || ''),
      raison: String(dto?.motif ?? dto?.commentaire ?? ''),
      utilisateur
    };
  }

  private mapUser(source: any, fallbackId: unknown): ManagerUserRef {
    const prenom = String(source?.prenom ?? '').trim();
    const nom = String(source?.nom ?? '').trim();
    const generatedName = `${prenom} ${nom}`.trim();
    const resolvedName = source?.fullName ?? (generatedName || source?.name || '');
    const fullName = String(resolvedName ?? '').trim();

    return {
      id: Number(source?.id ?? fallbackId ?? 0),
      nom,
      prenom,
      fullName: fullName || `Employe #${Number(source?.id ?? fallbackId ?? 0)}`,
      email: String(source?.email ?? '')
    };
  }

  private resolveNestedLabel(value: unknown): string | null {
    if (value == null) {
      return null;
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object') {
      const item = value as Record<string, unknown>;
      return String(item['libelle'] ?? item['label'] ?? item['nom'] ?? item['name'] ?? '');
    }
    return String(value);
  }

  private toNullableNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }
}
