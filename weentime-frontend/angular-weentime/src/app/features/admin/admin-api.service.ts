import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfigService } from '../../core/services/api-config.service';

export interface AdminPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface AdminRole {
  id: number;
  nom: string;
  description?: string;
  permissions?: string[];
}

export interface AdminEntreprise {
  id: number;
  nom: string;
  siret: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  secteur?: string;
  codeInvitation?: string;
  maxUsers?: number;
  currentUsers?: number;
  estActive: boolean;
  createdAt?: string;
  nombreDepartements?: number;
}

export interface AdminDepartement {
  id: number;
  nom: string;
  description?: string;
  codeInterne: string;
  entrepriseId?: number;
  entrepriseNom?: string;
  nombreEquipes: number;
  nombreUtilisateurs: number;
}

export interface AdminEquipe {
  id: number;
  nom: string;
  description?: string;
  responsableId?: number;
  effectifMaximum?: number;
  estActive: boolean;
  departementId: number;
  departementNom?: string;
  entrepriseId?: number;
  entrepriseNom?: string;
}

export interface AdminUser {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  statut: 'ACTIF' | 'INACTIF';
  dateCreation?: string;
  dateModification?: string;
  departementId?: number;
  departementNom?: string;
  equipeId?: number;
  equipeNom?: string;
  managerId?: number;
  entrepriseId?: number;
  entrepriseNom?: string;
  roles: AdminRole[];
  permissions?: string[];
}

export interface AdminUserPayload {
  nom: string;
  prenom: string;
  email: string;
  motDePasse: string;
  telephone?: string;
  poste?: string;
  statut: 'ACTIF' | 'INACTIF';
  entrepriseId: number;
  departementId?: number | null;
  equipeId?: number | null;
  roleIds: number[];
}

export interface AdminEntreprisePayload {
  nom: string;
  siret: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  secteur?: string;
  maxUsers?: number | null;
  estActive?: boolean | null;
}

export interface AdminDepartementPayload {
  nom: string;
  description?: string;
  codeInterne: string;
  entrepriseId: number;
}

export interface AdminEquipePayload {
  nom: string;
  description?: string;
  responsableId?: number | null;
  effectifMaximum?: number | null;
  estActive: boolean;
  departementId: number;
}

export interface AdminRecentActivity {
  initials: string;
  color: string;
  description: string;
  date: string;
}

export interface AdminDashboardSnapshot {
  totalUsers: number;
  activeUsers: number;
  totalEntreprises: number;
  totalDemandes: number;
  tauxPresenceMoyen: number;
  demandesEnAttente: number;
  totalEmployees: number;
  employeesOnLeave: number;
  departmentEmployeeCounts: Record<string, number>;
  recentActivities: AdminRecentActivity[];
  demandeBreakdown: Record<string, number>;
}

export interface AdminRequestProfile {
  id?: number;
  nom?: string;
  prenom?: string;
  fullName?: string;
  email?: string;
  poste?: string;
  departement?: string;
  equipe?: string;
  entreprise?: string;
}

export interface AdminRequest {
  id: number;
  utilisateurId?: number;
  managerId?: number;
  utilisateur?: AdminRequestProfile | null;
  manager?: AdminRequestProfile | null;
  motif?: string | null;
  commentaire?: string | null;
  statut: 'EN_ATTENTE' | 'VALIDEE' | 'REJETEE' | string;
  typeDemande: string;
  createdAt?: string;
  updatedAt?: string;
  dateDecision?: string | null;
  commentaireValidateur?: string | null;
  version?: number;
  dateDebut?: string | null;
  dateFin?: string | null;
  nombreJours?: number | null;
  heureDebut?: string | null;
  heureFin?: string | null;
  duree?: number | null;
  typeAutorisation?: string | null;
  typeDocument?: string | null;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  details?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  getUsers(page: number, size: number): Observable<AdminPage<AdminUser>> {
    return this.http.get<AdminPage<AdminUser>>(this.api.ORGANISATION.GET_USERS, {
      params: new HttpParams().set('page', String(page)).set('size', String(size))
    });
  }

  createUser(payload: AdminUserPayload): Observable<AdminUser> {
    return this.http.post<AdminUser>(this.api.ORGANISATION.CREATE_USER, payload);
  }

  updateUser(id: number, payload: AdminUserPayload): Observable<AdminUser> {
    return this.http.put<AdminUser>(this.api.ORGANISATION.UPDATE_USER(id), payload);
  }

  toggleUserStatus(id: number): Observable<AdminUser> {
    return this.http.put<AdminUser>(this.api.ORGANISATION.TOGGLE_USER_STATUS(id), null);
  }

  assignManager(userId: number, managerId: number | null): Observable<AdminUser> {
    const params = managerId != null
      ? new HttpParams().set('managerId', String(managerId))
      : new HttpParams();
    return this.http.put<AdminUser>(`${this.api.getApiBase()}/organisations/users/${userId}/manager`, null, { params });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(this.api.ORGANISATION.DELETE_USER(id));
  }

  getEntreprises(page = 0, size = 100): Observable<AdminPage<AdminEntreprise>> {
    return this.http.get<AdminPage<AdminEntreprise>>(this.api.ORGANISATION.GET_ENTREPRISES, {
      params: new HttpParams().set('page', String(page)).set('size', String(size))
    });
  }

  createEntreprise(payload: AdminEntreprisePayload): Observable<AdminEntreprise> {
    return this.http.post<AdminEntreprise>(this.api.ORGANISATION.CREATE_ENTREPRISE, payload);
  }

  updateEntreprise(id: number, payload: AdminEntreprisePayload): Observable<AdminEntreprise> {
    return this.http.put<AdminEntreprise>(this.api.ORGANISATION.UPDATE_ENTREPRISE(id), payload);
  }

  deleteEntreprise(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api.getApiBase()}/organisations/entreprises/${id}`);
  }

  regenerateEntrepriseCode(id: number): Observable<AdminEntreprise> {
    return this.http.post<AdminEntreprise>(`${this.api.getApiBase()}/organisations/entreprises/${id}/regenerate-code`, {});
  }

  getRoles(): Observable<AdminRole[]> {
    return this.http.get<AdminRole[]>(this.api.ORGANISATION.GET_ROLES);
  }

  createRole(payload: { nom: string; description?: string; permissions?: string[] }): Observable<AdminRole> {
    return this.http.post<AdminRole>(this.api.ORGANISATION.CREATE_ROLE, payload);
  }

  updateRole(id: number, payload: { nom: string; description?: string; permissions?: string[] }): Observable<AdminRole> {
    return this.http.put<AdminRole>(this.api.ORGANISATION.UPDATE_ROLE(id), payload);
  }

  deleteRole(id: number): Observable<void> {
    return this.http.delete<void>(this.api.ORGANISATION.DELETE_ROLE(id));
  }

  getDepartements(page = 0, size = 100): Observable<AdminPage<AdminDepartement>> {
    return this.http.get<AdminPage<AdminDepartement>>(this.api.ORGANISATION.GET_DEPARTEMENTS, {
      params: new HttpParams().set('page', String(page)).set('size', String(size))
    });
  }

  createDepartement(payload: AdminDepartementPayload): Observable<AdminDepartement> {
    return this.http.post<AdminDepartement>(this.api.ORGANISATION.CREATE_DEPARTEMENT, payload);
  }

  updateDepartement(id: number, payload: AdminDepartementPayload): Observable<AdminDepartement> {
    return this.http.put<AdminDepartement>(this.api.ORGANISATION.UPDATE_DEPARTEMENT(id), payload);
  }

  deleteDepartement(id: number): Observable<void> {
    return this.http.delete<void>(this.api.ORGANISATION.DELETE_DEPARTEMENT(id));
  }

  getEquipes(page = 0, size = 100): Observable<AdminPage<AdminEquipe>> {
    return this.http.get<AdminPage<AdminEquipe>>(this.api.ORGANISATION.GET_EQUIPES, {
      params: new HttpParams().set('page', String(page)).set('size', String(size))
    });
  }

  createEquipe(payload: AdminEquipePayload): Observable<AdminEquipe> {
    return this.http.post<AdminEquipe>(this.api.ORGANISATION.CREATE_EQUIPE, payload);
  }

  updateEquipe(id: number, payload: AdminEquipePayload): Observable<AdminEquipe> {
    return this.http.put<AdminEquipe>(this.api.ORGANISATION.UPDATE_EQUIPE(id), payload);
  }

  deleteEquipe(id: number): Observable<void> {
    return this.http.delete<void>(this.api.ORGANISATION.DELETE_EQUIPE(id));
  }

  getPresenceStats(): Observable<any> {
    return this.http.get<ApiEnvelope<any> | any>(this.api.PRESENCE.GET_PRESENCE_STATS).pipe(
      map(response => this.unwrap(response))
    );
  }

  getRhDashboard(): Observable<any> {
    return this.http.get<ApiEnvelope<any> | any>(this.api.RH.GET_RH_DASHBOARD).pipe(
      map(response => this.unwrap(response))
    );
  }

  getDemandesByType(): Observable<Record<string, number>> {
    return this.http.get<ApiEnvelope<Record<string, number>> | Record<string, number>>(this.api.RH.GET_STATS_DEMANDS_BY_TYPE).pipe(
      map(response => this.unwrap(response) ?? {})
    );
  }

  getMonthlyEvolution(): Observable<Record<number, number>> {
    return this.http.get<ApiEnvelope<Record<number, number>> | Record<number, number>>(this.api.RH.GET_STATS_EVOLUTION).pipe(
      map(response => this.unwrap(response) ?? {})
    );
  }

  getRequests(page = 0, size = 20, filters?: { statut?: string | null }): Observable<AdminPage<AdminRequest>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', 'createdAt,desc');

    if (filters?.statut) {
      params = params.set('statut', filters.statut);
    }

    return this.http
      .get<ApiEnvelope<AdminPage<AdminRequest>>>(this.api.RH.GET_ALL_DEMANDS, { params })
      .pipe(map(response => this.unwrap(response)));
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }
}
