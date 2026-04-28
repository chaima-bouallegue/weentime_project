import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfigService } from '../../../core/services/api-config.service';

export enum StatutEntreprise {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED'
}

export interface Entreprise {
  id: number;
  nom: string;
  siret: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  secteur?: string;
  codeInvitation?: string;
  estActive: boolean;
  status: StatutEntreprise;
  statusLabel: 'ACTIVE' | 'FERMÉE';
  nombreDepartements: number;
  createdAt: string;
}

interface EntrepriseApiResponse {
  id: number;
  nom: string;
  siret: string;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  siteWeb?: string | null;
  secteur?: string | null;
  codeInvitation?: string | null;
  estActive?: boolean | null;
  isActive?: boolean | null;
  active?: boolean | null;
  statut?: string | null;
  status?: string | null;
  nombreDepartements: number;
  createdAt: string;
}

export interface EntrepriseRequest {
  nom: string;
  siret: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  secteur?: string;
}

export interface Departement {
  id: number;
  nom: string;
  description?: string;
  codeInterne: string;
  nombreEquipes: number;
  nombreUtilisateurs: number;
}

export interface DepartementRequest {
  nom: string;
  description?: string;
  codeInterne: string;
  entrepriseId?: number;
}

@Injectable({
  providedIn: 'root'
})
export class EntrepriseService {
  private http = inject(HttpClient);
  private api = inject(ApiConfigService);
  private readonly API_URL = this.api.ORGANISATION.GET_ENTREPRISES;
  private readonly DEPT_API_URL = this.api.ORGANISATION.GET_DEPARTEMENTS;

  // Entreprises
  getEntreprises(page: number = 0, size: number = 50): Observable<{ content: Entreprise[] }> {
    return this.http
      .get<{ content: EntrepriseApiResponse[] }>(`${this.API_URL}?page=${page}&size=${size}`)
      .pipe(
        map(response => ({
          ...response,
          content: (response.content ?? []).map(item => this.normalizeEntreprise(item))
        }))
      );
  }

  getEntrepriseById(id: number): Observable<Entreprise> {
    return this.http
      .get<EntrepriseApiResponse>(`${this.API_URL}/${id}`)
      .pipe(map(item => this.normalizeEntreprise(item)));
  }

  createEntreprise(data: EntrepriseRequest): Observable<Entreprise> {
    return this.http
      .post<EntrepriseApiResponse>(this.API_URL, data)
      .pipe(map(item => this.normalizeEntreprise(item)));
  }

  updateEntreprise(id: number, data: EntrepriseRequest): Observable<Entreprise> {
    return this.http
      .patch<EntrepriseApiResponse>(`${this.API_URL}/${id}`, data)
      .pipe(map(item => this.normalizeEntreprise(item)));
  }

  deleteEntreprise(id: number): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${id}`);
  }

  // Departements
  getDepartements(entrepriseId: number, page: number = 0, size: number = 50): Observable<{ content: Departement[] }> {
    return this.http.get<{ content: Departement[] }>(`${this.DEPT_API_URL}?page=${page}&size=${size}`);
  }

  createDepartement(data: DepartementRequest): Observable<Departement> {
    return this.http.post<Departement>(this.DEPT_API_URL, data);
  }

  updateDepartement(id: number, data: DepartementRequest): Observable<Departement> {
    return this.http.patch<Departement>(`${this.DEPT_API_URL}/${id}`, data);
  }

  deleteDepartement(id: number): Observable<void> {
    return this.http.delete<void>(`${this.DEPT_API_URL}/${id}`);
  }

  private normalizeEntreprise(item: EntrepriseApiResponse): Entreprise {
    const estActive = this.resolveEntrepriseActive(item);

    return {
      id: item.id,
      nom: item.nom,
      siret: item.siret,
      adresse: item.adresse ?? undefined,
      telephone: item.telephone ?? undefined,
      email: item.email ?? undefined,
      siteWeb: item.siteWeb ?? undefined,
      secteur: item.secteur ?? undefined,
      codeInvitation: item.codeInvitation ?? undefined,
      estActive,
      status: estActive ? StatutEntreprise.ACTIVE : StatutEntreprise.CLOSED,
      statusLabel: estActive ? 'ACTIVE' : 'FERMÉE',
      nombreDepartements: item.nombreDepartements ?? 0,
      createdAt: item.createdAt
    };
  }

  private resolveEntrepriseActive(item: EntrepriseApiResponse): boolean {
    if (typeof item.estActive === 'boolean') {
      return item.estActive;
    }

    if (typeof item.isActive === 'boolean') {
      return item.isActive;
    }

    if (typeof item.active === 'boolean') {
      return item.active;
    }

    const rawStatus = String(item.status ?? item.statut ?? '')
      .trim()
      .toUpperCase();

    if (['ACTIVE', 'ACTIF'].includes(rawStatus)) {
      return true;
    }

    if (['INACTIVE', 'INACTIF', 'CLOSED', 'CLOSE', 'FERMEE', 'FERMÉE'].includes(rawStatus)) {
      return false;
    }

    return true;
  }
}
