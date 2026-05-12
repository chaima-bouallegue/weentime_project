import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, switchMap, map, throwError, catchError } from 'rxjs';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  CreateDepartementRequest,
  CreateEmployeRequest,
  CreateEquipeRequest,
  Departement,
  EmployeRH,
  Equipe
} from './models/structure.model';

interface StructureDepartmentResponse {
  id: number;
  nom: string;
  description?: string;
  codeInterne?: string;
  entrepriseId: number;
  nombreEquipes: number;
  nombreEmployes: number;
}

interface StructureTeamResponse {
  id: number;
  nom: string;
  description?: string;
  departementId: number;
  departement?: string;
  managerId?: number | null;
  managerNom?: string | null;
  effectifMaximum?: number | null;
  estActive?: boolean | null;
  nombreEmployes: number;
}

interface StructureEmployeeResponse {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  statut?: string;
  dateCreation?: string;
  departementId?: number | null;
  departement?: string | null;
  equipeId?: number | null;
  equipe?: string | null;
  managerId?: number | null;
  roles?: string[];
}

interface OrganisationRoleResponse {
  id: number;
  nom: string;
}

interface DepartementResponse {
  id: number;
  nom: string;
  description?: string;
  codeInterne?: string;
  entrepriseId: number;
}

interface EquipeResponse {
  id: number;
  nom: string;
  description?: string;
  responsableId?: number | null;
  effectifMaximum?: number | null;
  estActive?: boolean | null;
  departementId: number;
  departementNom?: string;
}

interface UtilisateurResponse {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  statut?: string;
  dateCreation?: string;
  departementId?: number | null;
  departementNom?: string | null;
  equipeId?: number | null;
  equipeNom?: string | null;
  roles?: Array<{ nom?: string } | string>;
}

@Injectable({
  providedIn: 'root'
})
export class StructureService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly apiConfig = inject(ApiConfigService);
  private roleCache: OrganisationRoleResponse[] | null = null;

  getDepartements(): Observable<Departement[]> {
    return this.http.get<StructureDepartmentResponse[]>(this.apiConfig.STRUCTURE.GET_DEPARTMENTS).pipe(
      map(items => items.map(item => this.mapDepartement(item)))
    );
  }

  createDepartement(request: CreateDepartementRequest): Observable<Departement> {
    const entrepriseId = this.requireEntrepriseId();
    if (!entrepriseId) {
      return this.noEntrepriseError();
    }

    const payload = {
      nom: request.nom,
      description: request.description?.trim() || '',
      codeInterne: this.generateDepartmentCode(request.nom),
      entrepriseId
    };

    return this.http.post<DepartementResponse>(this.apiConfig.ORGANISATION.CREATE_DEPARTEMENT, payload).pipe(
      map(response => this.mapDepartement(response)),
      catchError(error => {
        if (error?.status === 409) {
          this.toastService.error('Departement deja existant.');
        }
        return throwError(() => error);
      })
    );
  }

  updateDepartement(id: number, request: CreateDepartementRequest): Observable<Departement> {
    return this.http.get<DepartementResponse>(`${this.apiConfig.getApiBase()}/organisations/departements/${id}`).pipe(
      switchMap(current => this.http.patch<DepartementResponse>(
        this.apiConfig.ORGANISATION.UPDATE_DEPARTEMENT(id),
        {
          nom: request.nom,
          description: request.description?.trim() || '',
          codeInterne: current.codeInterne || this.generateDepartmentCode(request.nom),
          entrepriseId: current.entrepriseId || this.requireEntrepriseId()
        }
      )),
      map(response => this.mapDepartement(response))
    );
  }

  deleteDepartement(id: number): Observable<void> {
    return this.http.delete<void>(this.apiConfig.ORGANISATION.DELETE_DEPARTEMENT(id));
  }

  getEquipes(): Observable<Equipe[]> {
    return this.http.get<StructureTeamResponse[]>(this.apiConfig.STRUCTURE.GET_TEAMS).pipe(
      map(items => items.map(item => this.mapEquipe(item)))
    );
  }

  createEquipe(request: CreateEquipeRequest): Observable<Equipe> {

    return this.http.post<EquipeResponse>(this.apiConfig.ORGANISATION.CREATE_EQUIPE, {
      nom: request.nom,
      description: request.description?.trim() || '',
      responsableId: request.managerId ?? null,
      effectifMaximum: 50,
      estActive: true,
      departementId: request.departementId
    }).pipe(
      map(response => this.mapEquipe(response))
    );
  }

  updateEquipe(id: number, request: CreateEquipeRequest): Observable<Equipe> {
    return this.http.patch<EquipeResponse>(this.apiConfig.ORGANISATION.UPDATE_EQUIPE(id), {
      nom: request.nom,
      description: request.description?.trim() || '',
      responsableId: request.managerId ?? null,
      effectifMaximum: 50,
      estActive: true,
      departementId: request.departementId
    }).pipe(
      map(response => this.mapEquipe(response))
    );
  }

  deleteEquipe(id: number): Observable<void> {
    return this.http.delete<void>(this.apiConfig.ORGANISATION.DELETE_EQUIPE(id));
  }

  getEquipesSansManager(): Observable<Equipe[]> {
    return this.getEquipes().pipe(
      map(items => items.filter(item => !item.managerId))
    );
  }

  getEmployes(): Observable<EmployeRH[]> {
    return this.http.get<StructureEmployeeResponse[]>(this.apiConfig.STRUCTURE.GET_EMPLOYEES).pipe(
      map(items => items.map(item => this.mapEmploye(item)))
    );
  }

  getManagers(): Observable<EmployeRH[]> {
    return this.http.get<StructureEmployeeResponse[]>(this.apiConfig.STRUCTURE.GET_MANAGERS).pipe(
      map(items => items.map(item => this.mapEmploye(item)))
    );
  }

  createEmploye(request: CreateEmployeRequest): Observable<EmployeRH> {
    const entrepriseId = this.requireEntrepriseId();
    if (!entrepriseId) {
      return this.noEntrepriseError();
    }

    return this.resolveRoleIds(request.role).pipe(
      switchMap(roleIds => this.http.post<UtilisateurResponse>(this.apiConfig.ORGANISATION.CREATE_USER, {
        nom: request.nom,
        prenom: request.prenom,
        email: request.email,
        motDePasse: request.password,
        telephone: request.telephone?.trim() || '',
        poste: request.poste,
        statut: 'ACTIF',
        entrepriseId,
        departementId: request.departementId,
        equipeId: request.equipeId ?? null,
        roleIds
      })),
      switchMap(created => {
        if (!request.managerId || request.role === 'ROLE_MANAGER') {
          return of(created);
        }

        return this.http.put<UtilisateurResponse>(
          `${this.apiConfig.getApiBase()}/organisations/users/${created.id}/manager`,
          null,
          { params: new HttpParams().set('managerId', String(request.managerId)) }
        );
      }),
      map(response => this.mapEmploye(response))
    );
  }

  toggleEmployeStatus(id: number): Observable<EmployeRH> {
    return this.http.put<UtilisateurResponse>(this.apiConfig.ORGANISATION.TOGGLE_USER_STATUS(id), {}).pipe(
      map(response => this.mapEmploye(response))
    );
  }

  getPendingUsers(): Observable<EmployeRH[]> {
    return this.http.get<UtilisateurResponse[]>(`${this.apiConfig.getApiBase()}/organisations/users/pending`).pipe(
      map(items => items.map(item => this.mapEmploye(item)))
    );
  }

  validateUser(id: number, request: any = {}): Observable<EmployeRH> {
    return this.http.patch<UtilisateurResponse>(`${this.apiConfig.getApiBase()}/organisations/users/${id}/valider`, request).pipe(
      map(response => this.mapEmploye(response))
    );
  }

  rejectUser(id: number): Observable<EmployeRH> {
    return this.http.patch<UtilisateurResponse>(`${this.apiConfig.getApiBase()}/organisations/users/${id}/rejeter`, {}).pipe(
      map(response => this.mapEmploye(response))
    );
  }

  assignManagerToEquipe(managerId: number, equipeId: number): Observable<void> {
    return this.http.get<EquipeResponse>(`${this.apiConfig.getApiBase()}/organisations/equipes/${equipeId}`).pipe(
      switchMap(team => this.http.patch<EquipeResponse>(this.apiConfig.ORGANISATION.UPDATE_EQUIPE(equipeId), {
        nom: team.nom,
        description: team.description || '',
        responsableId: managerId,
        effectifMaximum: team.effectifMaximum ?? 50,
        estActive: team.estActive ?? true,
        departementId: team.departementId
      })),
      map(() => void 0)
    );
  }

  private mapDepartement(source: StructureDepartmentResponse | DepartementResponse): Departement {
    return {
      id: source.id,
      nom: source.nom,
      description: source.description,
      codeInterne: source.codeInterne,
      entrepriseId: source.entrepriseId,
      nombreEquipes: 'nombreEquipes' in source ? source.nombreEquipes : 0,
      nombreEmployes: 'nombreEmployes' in source ? source.nombreEmployes : 0
    };
  }

  private mapEquipe(source: StructureTeamResponse | EquipeResponse): Equipe {
    const raw = source as unknown as Record<string, unknown>;
    const departementNom = (raw['departementNom'] as string | undefined) ?? (raw['departement'] as string | undefined);
    const managerId = (raw['responsableId'] as number | null | undefined) ?? (raw['managerId'] as number | null | undefined);
    const managerNom = raw['managerNom'] as string | null | undefined;

    return {
      id: source.id,
      nom: source.nom,
      description: source.description,
      departementId: source.departementId,
      departementNom: departementNom || 'Non renseigne',
      managerId: managerId ?? undefined,
      managerNom: managerNom ?? undefined,
      effectifMaximum: source.effectifMaximum ?? undefined,
      estActive: source.estActive ?? undefined,
      nombreEmployes: 'nombreEmployes' in source ? source.nombreEmployes : 0
    };
  }

  private mapEmploye(source: StructureEmployeeResponse | UtilisateurResponse): EmployeRH {
    const roleNames = (source.roles ?? []).map(role =>
      typeof role === 'string' ? role : String(role?.nom ?? 'ROLE_EMPLOYEE')
    );
    const isManager = roleNames.includes('ROLE_MANAGER');
    const raw = source as unknown as Record<string, unknown>;
    const departementNom = (raw['departementNom'] as string | undefined) ?? (raw['departement'] as string | undefined);
    const equipeNom = (raw['equipeNom'] as string | undefined) ?? (raw['equipe'] as string | undefined);

    return {
      id: source.id,
      nom: source.nom,
      prenom: source.prenom,
      email: source.email,
      telephone: source.telephone,
      poste: source.poste || 'Non renseigne',
      departementId: source.departementId ?? 0,
      departementNom: departementNom || 'Non renseigne',
      equipeId: source.equipeId ?? undefined,
      equipeNom: equipeNom || undefined,
      role: isManager ? 'ROLE_MANAGER' : 'ROLE_EMPLOYEE',
      statut: source.statut === 'INACTIF' ? 'INACTIF' : 'ACTIF',
      dateCreation: source.dateCreation || new Date().toISOString()
    };
  }

  private resolveRoleIds(roleName: CreateEmployeRequest['role']): Observable<number[]> {
    if (this.roleCache) {
      return of(this.extractRoleIds(this.roleCache, roleName));
    }

    return this.http.get<OrganisationRoleResponse[]>(this.apiConfig.ORGANISATION.GET_ROLES).pipe(
      map(roles => {
        this.roleCache = roles;
        return this.extractRoleIds(roles, roleName);
      })
    );
  }

  private extractRoleIds(roles: OrganisationRoleResponse[], roleName: CreateEmployeRequest['role']): number[] {
    const role = roles.find(item => item.nom === roleName);
    if (!role) {
      throw new Error(`Required role ${roleName} is not available.`);
    }
    return [role.id];
  }

  private requireEntrepriseId(): number | null {
    const entrepriseId = this.authService.currentUser()?.entreprise?.id ?? null;
    if (!entrepriseId) {
      this.toastService.error("Aucune entreprise assignee. Veuillez contacter l'administrateur.");
    }
    return entrepriseId;
  }

  private noEntrepriseError<T>(): Observable<T> {
    return throwError(() => new Error('No entreprise assigned to current user.'));
  }

  private generateDepartmentCode(name: string): string {
    const base = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 12);

    return base || `DEPT-${Date.now().toString().slice(-4)}`;
  }

  private generateTemporaryPassword(): string {
    return `Wt@${new Date().getFullYear()}${Math.random().toString(36).slice(-4)}A`;
  }
}
