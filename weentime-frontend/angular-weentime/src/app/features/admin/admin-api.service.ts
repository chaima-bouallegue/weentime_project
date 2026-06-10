import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfigService } from '../../core/services/api-config.service';
import { SKIP_ERROR_TOAST } from '../../core/http/request-context.tokens';

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
  managerNom?: string;
  entrepriseId?: number;
  entrepriseNom?: string;
  role?: string;
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
  managerId?: number | null;
  role?: string;
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
  statut:
    | 'EN_ATTENTE'
    | 'EN_ATTENTE_MANAGER'
    | 'EN_ATTENTE_RH'
    | 'APPROUVEE'
    | 'REFUSEE'
    | 'VALIDEE'
    | 'REJETEE'
    | string;
  typeDemande: string;
  dateCreation?: string;
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
  payload?: T;
  result?: T;
  error?: string;
  details?: string;
}

interface RequestOptions {
  silent?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly silentContext = new HttpContext().set(SKIP_ERROR_TOAST, true);

  getUsers(
    page: number,
    size: number,
    searchOrOptions?: string | null | RequestOptions,
    role?: string,
    statut?: string,
    entrepriseId?: string,
    sort?: string,
    options?: RequestOptions
  ): Observable<AdminPage<AdminUser>> {
    const normalizedPage = Math.max(page, 0);
    const normalizedSize = this.normalizePageSize(size);
    const search = typeof searchOrOptions === 'string' ? searchOrOptions : null;
    const requestOptions = typeof searchOrOptions === 'object' && searchOrOptions !== null
      ? searchOrOptions
      : options;
    let params = new HttpParams()
      .set('page', String(normalizedPage))
      .set('size', String(normalizedSize));

    if (search?.trim()) {
      params = params.set('search', search.trim());
    }
    if (role) {
      params = params.set('role', role);
    }
    if (statut) {
      params = params.set('statut', statut);
    }
    if (entrepriseId) {
      params = params.set('entrepriseId', entrepriseId);
    }
    if (sort) {
      params = params.set('sort', sort);
    }

    return this.http
      .get<unknown>(this.api.ORGANISATION.GET_ADMIN_USERS, {
        params,
        context: this.requestContext(requestOptions)
      })
      .pipe(map(response => {
        const pageData = this.normalizePageResponse<AdminUser>(response, normalizedPage, normalizedSize);
        return {
          ...pageData,
          content: pageData.content.map(user => this.normalizeAdminUser(user))
        };
      }));
  }


  createUser(payload: AdminUserPayload): Observable<AdminUser> {
    return this.http.post<unknown>(this.api.ORGANISATION.CREATE_USER, payload).pipe(
      map(response => this.normalizeAdminUser(this.unwrap<AdminUser>(response)))
    );
  }

  updateUser(id: number, payload: AdminUserPayload): Observable<AdminUser> {
    return this.http.put<unknown>(this.api.ORGANISATION.UPDATE_USER(id), payload).pipe(
      map(response => this.normalizeAdminUser(this.unwrap<AdminUser>(response)))
    );
  }

  toggleUserStatus(id: number): Observable<AdminUser> {
    return this.http.put<unknown>(this.api.ORGANISATION.TOGGLE_USER_STATUS(id), null).pipe(
      map(response => this.normalizeAdminUser(this.unwrap<AdminUser>(response)))
    );
  }

  assignManager(userId: number, managerId: number | null): Observable<AdminUser> {
    const params = managerId != null
      ? new HttpParams().set('managerId', String(managerId))
      : new HttpParams();
    return this.http.put<unknown>(`${this.api.getApiBase()}/organisations/users/${userId}/manager`, null, { params }).pipe(
      map(response => this.normalizeAdminUser(this.unwrap<AdminUser>(response)))
    );
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(this.api.ORGANISATION.DELETE_USER(id));
  }

  getEntreprises(page = 0, size = 100, options?: RequestOptions): Observable<AdminPage<AdminEntreprise>> {
    const normalizedPage = Math.max(page, 0);
    const normalizedSize = this.normalizePageSize(size);
    return this.http
      .get<unknown>(this.api.ORGANISATION.GET_ENTREPRISES, {
        params: new HttpParams()
          .set('page', String(normalizedPage))
          .set('size', String(normalizedSize)),
        context: this.requestContext(options)
      })
      .pipe(map(response => this.normalizePageResponse<AdminEntreprise>(response, normalizedPage, normalizedSize)));
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

  getRoles(options?: RequestOptions): Observable<AdminRole[]> {
    return this.http
      .get<unknown>(this.api.ORGANISATION.GET_ROLES, {
        context: this.requestContext(options)
      })
      .pipe(map(response => this.normalizeBusinessRoles(this.normalizeListResponse<AdminRole>(response))));
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

  getDepartements(page = 0, size = 100, options?: RequestOptions): Observable<AdminPage<AdminDepartement>> {
    const normalizedPage = Math.max(page, 0);
    const normalizedSize = this.normalizePageSize(size);
    return this.http
      .get<unknown>(this.api.ORGANISATION.GET_DEPARTEMENTS, {
        params: new HttpParams()
          .set('page', String(normalizedPage))
          .set('size', String(normalizedSize)),
        context: this.requestContext(options)
      })
      .pipe(map(response => this.normalizePageResponse<AdminDepartement>(response, normalizedPage, normalizedSize)));
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

  getEquipes(page = 0, size = 100, options?: RequestOptions): Observable<AdminPage<AdminEquipe>> {
    const normalizedPage = Math.max(page, 0);
    const normalizedSize = this.normalizePageSize(size);
    return this.http
      .get<unknown>(this.api.ORGANISATION.GET_EQUIPES, {
        params: new HttpParams()
          .set('page', String(normalizedPage))
          .set('size', String(normalizedSize)),
        context: this.requestContext(options)
      })
      .pipe(map(response => this.normalizePageResponse<AdminEquipe>(response, normalizedPage, normalizedSize)));
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

  getRequests(page = 0, size = 20, filters?: { statut?: string | null }, options?: RequestOptions): Observable<AdminPage<AdminRequest>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('size', String(size));

    if (filters?.statut) {
      params = params.set('statut', filters.statut);
    }

    return this.http
      .get<ApiEnvelope<AdminPage<AdminRequest>>>(this.api.RH.GET_ALL_DEMANDS, {
        params,
        context: this.requestContext(options)
      })
      .pipe(map(response => this.unwrap(response)));
  }

  private normalizeAdminUser(user: AdminUser): AdminUser {
    const raw = (user ?? {}) as AdminUser & {
      role?: string;
      manager?: { id?: number; name?: string } | null;
      company?: { id?: number; name?: string } | null;
      name?: string;
    };
    const canonical = this.toBusinessRole(raw.role ?? this.firstRoleName(raw.roles));
    const roles = this.normalizeUserRoles(raw.roles, canonical);
    const names = this.splitDisplayName(raw.name, raw.prenom, raw.nom, raw.email);

    return {
      ...raw,
      nom: raw.nom ?? names.lastName,
      prenom: raw.prenom ?? names.firstName,
      statut: this.toInternalStatus(raw.statut ?? (raw as any).status),
      managerId: raw.managerId ?? raw.manager?.id,
      managerNom: raw.managerNom ?? raw.manager?.name,
      entrepriseId: raw.entrepriseId ?? raw.company?.id,
      entrepriseNom: raw.entrepriseNom ?? raw.company?.name,
      role: canonical,
      roles
    };
  }

  private normalizeBusinessRoles(roles: AdminRole[]): AdminRole[] {
    const byCanonical = new Map<string, AdminRole>();
    for (const role of roles) {
      const canonical = this.toBusinessRole(role?.nom);
      const normalized: AdminRole = {
        ...role,
        nom: this.toInternalRoleName(canonical)
      };
      byCanonical.set(canonical, normalized);
    }

    return ['ADMIN', 'RH', 'MANAGER', 'EMPLOYEE']
      .map(role => byCanonical.get(role))
      .filter((role): role is AdminRole => !!role);
  }

  private normalizeUserRoles(roles: AdminRole[] | undefined, canonical: string): AdminRole[] {
    const source = Array.isArray(roles) ? roles : [];
    const match = source.find(role => this.toBusinessRole(role?.nom) === canonical);
    return [{
      ...(match ?? { id: 0, nom: this.toInternalRoleName(canonical) }),
      nom: this.toInternalRoleName(canonical)
    }];
  }

  private firstRoleName(roles: AdminRole[] | undefined): string {
    const source = Array.isArray(roles) ? roles : [];
    const roleNames = source.map(role => this.toBusinessRole(role?.nom));
    if (roleNames.includes('ADMIN')) {
      return 'ADMIN';
    }
    if (roleNames.includes('RH')) {
      return 'RH';
    }
    if (roleNames.includes('MANAGER')) {
      return 'MANAGER';
    }
    return 'EMPLOYEE';
  }

  private toBusinessRole(value: unknown): 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE' {
    const normalized = String(value ?? '').trim().toUpperCase().replace(/^ROLE_/, '');
    switch (normalized) {
      case 'ADMIN':
        return 'ADMIN';
      case 'RH':
        return 'RH';
      case 'MANAGER':
        return 'MANAGER';
      default:
        return 'EMPLOYEE';
    }
  }

  private toInternalRoleName(value: string): string {
    return `ROLE_${this.toBusinessRole(value)}`;
  }

  private toInternalStatus(value: unknown): 'ACTIF' | 'INACTIF' {
    const normalized = String(value ?? '').trim().toUpperCase();
    return normalized === 'ACTIF' || normalized === 'ACTIVE' ? 'ACTIF' : 'INACTIF';
  }

  private splitDisplayName(name: string | undefined, firstName: string | undefined, lastName: string | undefined, email: string): { firstName: string; lastName: string } {
    if (firstName || lastName) {
      return {
        firstName: firstName ?? '',
        lastName: lastName ?? ''
      };
    }
    const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return { firstName: email ?? '', lastName: '' };
    }
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' ')
    };
  }

  private unwrap<T>(response: unknown): T {
    if (response && typeof response === 'object') {
      const envelope = response as ApiEnvelope<T>;
      if ('data' in envelope && envelope.data !== undefined) {
        return envelope.data as T;
      }
      if ('payload' in envelope && envelope.payload !== undefined) {
        return envelope.payload as T;
      }
      if ('result' in envelope && envelope.result !== undefined) {
        return envelope.result as T;
      }
    }
    return response as T;
  }

  private requestContext(options?: RequestOptions): HttpContext {
    return options?.silent ? this.silentContext : new HttpContext();
  }

  private normalizePageSize(size: number): number {
    const numeric = Number(size);
    if (!Number.isFinite(numeric)) {
      return 100;
    }
    return Math.max(1, Math.min(Math.trunc(numeric), 100));
  }

  private normalizePageResponse<T>(source: unknown, requestedPage: number, requestedSize: number): AdminPage<T> {
    const raw = this.unwrap(source as ApiEnvelope<unknown> | unknown);
    if (Array.isArray(raw)) {
      return {
        content: raw as T[],
        totalElements: raw.length,
        totalPages: raw.length > 0 ? 1 : 0,
        number: requestedPage,
        size: requestedSize
      };
    }

    const candidate = raw as {
      content?: unknown;
      items?: unknown;
      results?: unknown;
      records?: unknown;
      data?: unknown;
      totalElements?: unknown;
      totalPages?: unknown;
      total?: unknown;
      count?: unknown;
      pages?: unknown;
      number?: unknown;
      page?: unknown;
      size?: unknown;
      pageSize?: unknown;
    } | null;

    const content = this.extractContent<T>(candidate);
    const totalElements = this.toNumber(candidate?.totalElements ?? candidate?.total ?? candidate?.count ?? content.length);
    const size = Math.max(this.toNumber(candidate?.size ?? candidate?.pageSize ?? requestedSize), 1);
    const totalPages = this.toNumber(candidate?.totalPages ?? candidate?.pages ?? (totalElements > 0 ? Math.ceil(totalElements / size) : 0));
    const number = this.toNumber(candidate?.number ?? candidate?.page ?? requestedPage);

    return {
      content,
      totalElements,
      totalPages,
      number,
      size
    };
  }

  private normalizeListResponse<T>(source: unknown): T[] {
    const raw = this.unwrap(source as ApiEnvelope<unknown> | unknown);
    if (Array.isArray(raw)) {
      return raw as T[];
    }
    if (raw && typeof raw === 'object') {
      return this.extractContent<T>(raw as Record<string, unknown>);
    }
    return [];
  }

  private extractContent<T>(source: Record<string, unknown> | null): T[] {
    if (!source || typeof source !== 'object') {
      return [];
    }
    if (Array.isArray(source['content'])) {
      return source['content'] as T[];
    }
    if (Array.isArray(source['items'])) {
      return source['items'] as T[];
    }
    if (Array.isArray(source['results'])) {
      return source['results'] as T[];
    }
    if (Array.isArray(source['records'])) {
      return source['records'] as T[];
    }
    if (Array.isArray(source['data'])) {
      return source['data'] as T[];
    }

    const nestedData = source['data'] as Record<string, unknown> | undefined;
    if (!nestedData || typeof nestedData !== 'object') {
      return [];
    }

    if (Array.isArray(nestedData['content'])) {
      return nestedData['content'] as T[];
    }
    if (Array.isArray(nestedData['items'])) {
      return nestedData['items'] as T[];
    }
    if (Array.isArray(nestedData['results'])) {
      return nestedData['results'] as T[];
    }
    if (Array.isArray(nestedData['records'])) {
      return nestedData['records'] as T[];
    }

    return [];
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}
