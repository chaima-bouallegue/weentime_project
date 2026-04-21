import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export enum StatutEntreprise {
  ACTIF = 'ACTIF',
  INACTIF = 'INACTIF'
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
  statut: StatutEntreprise;
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
  private readonly API_URL = 'http://localhost:8222/api/v1/organisations/entreprises';
  private readonly DEPT_API_URL = 'http://localhost:8222/api/v1/organisations/departements';

  // Entreprises
  getEntreprises(page: number = 0, size: number = 50): Observable<{ content: Entreprise[] }> {
    return this.http.get<{ content: Entreprise[] }>(`${this.API_URL}?page=${page}&size=${size}`);
  }

  getEntrepriseById(id: number): Observable<Entreprise> {
    return this.http.get<Entreprise>(`${this.API_URL}/${id}`);
  }

  createEntreprise(data: EntrepriseRequest): Observable<Entreprise> {
    return this.http.post<Entreprise>(this.API_URL, data);
  }

  updateEntreprise(id: number, data: EntrepriseRequest): Observable<Entreprise> {
    return this.http.patch<Entreprise>(`${this.API_URL}/${id}`, data);
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
}
