import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, map } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { 
  Horaire, 
  AffectationHoraire, 
  PageResponse 
} from '../models/horaire.model';

export interface EmployeeSchedule {
  userId: number;
  firstName: string;
  lastName: string;
  initials: string;
  color: string;
  horaire: Horaire;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class HoraireService {
  private http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly baseUrl = this.apiConfig.buildUrl('/horaires');

  /**
   * --- GESTION DES MODÈLES (RH) ---
   */

  getHoraires(page = 0, size = 10): Observable<PageResponse<Horaire>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ApiEnvelope<PageResponse<Horaire>> | PageResponse<Horaire>>(this.baseUrl, { params }).pipe(
      map(response => this.unwrap(response))
    );
  }

  getHoraireById(id: number): Observable<Horaire> {
    return this.http.get<ApiEnvelope<Horaire> | Horaire>(`${this.baseUrl}/${id}`).pipe(
      map(response => this.unwrap(response))
    );
  }

  createHoraire(horaire: Partial<Horaire>): Observable<Horaire> {
    return this.http.post<ApiEnvelope<Horaire> | Horaire>(this.baseUrl, horaire).pipe(
      map(response => this.unwrap(response))
    );
  }

  updateHoraire(id: number, horaire: Partial<Horaire>): Observable<Horaire> {
    return this.http.put<ApiEnvelope<Horaire> | Horaire>(`${this.baseUrl}/${id}`, horaire).pipe(
      map(response => this.unwrap(response))
    );
  }

  deleteHoraire(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * --- AFFECTATIONS (RH) ---
   */

  assignHoraire(request: { horaireId: number, cibleType: string, cibleId: number, dateDebut?: string, dateFin?: string, motif?: string }): Observable<AffectationHoraire> {
    return this.http.post<ApiEnvelope<AffectationHoraire> | AffectationHoraire>(`${this.baseUrl}/assign`, request).pipe(
      map(response => this.unwrap(response))
    );
  }

  assignHoraireBatch(request: { horaireId: number, cibleType: string, cibleIds: number[], dateDebut?: string, dateFin?: string, motif?: string }): Observable<AffectationHoraire[]> {
    return this.http.post<ApiEnvelope<AffectationHoraire[]> | AffectationHoraire[]>(`${this.baseUrl}/assign/batch`, request).pipe(
      map(response => this.unwrap(response))
    );
  }

  getAffectations(page = 0, size = 10): Observable<PageResponse<AffectationHoraire>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ApiEnvelope<PageResponse<AffectationHoraire>> | PageResponse<AffectationHoraire>>(`${this.baseUrl}/assign`, { params }).pipe(
      map(response => this.unwrap(response))
    );
  }

  deleteAffectation(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/assign/${id}`);
  }

  // [WEENTIME - CHANGEMENT 4]
  checkChevauchement(request: {
    cibleType: string;
    cibleId: number;
    priorite: number;
    dateDebut: string;
    dateFin?: string;
  }): Observable<{ chevauchementDetecte: boolean }> {
    let params = new HttpParams()
      .set('cibleType', request.cibleType)
      .set('cibleId', request.cibleId.toString())
      .set('priorite', request.priorite.toString())
      .set('dateDebut', request.dateDebut);
    if (request.dateFin) {
      params = params.set('dateFin', request.dateFin);
    }
    return this.http.get<ApiEnvelope<{ chevauchementDetecte: boolean }> | { chevauchementDetecte: boolean }>(
      `${this.baseUrl}/assign/check-chevauchement`, { params }
    ).pipe(
      map(response => this.unwrap(response))
    );
  }

  /**
   * --- RÉSOLUTION (EMPLOYÉ / MANAGER) ---
   */

  /**
   * Résout l'horaire pour l'utilisateur actuel (ou un email spécifique si fourni)
   */
  resolveHoraire(email?: string): Observable<Horaire> {
    let params = new HttpParams();
    if (email) {
      params = params.set('email', email);
    }
    return this.http.get<ApiEnvelope<Horaire> | Horaire>(`${this.baseUrl}/resolve`, { params }).pipe(
      map(response => this.unwrap(response))
    );
  }

  /**
   * Pour le manager : résout les horaires des membres de son équipe via le backend.
   */
  getTeamSchedules(): Observable<EmployeeSchedule[]> {
    return this.http.get<ApiEnvelope<unknown> | unknown>(`${this.baseUrl}/team`).pipe(
      map(data => {
        const payload = this.unwrap(data);
        if (Array.isArray(payload)) {
          return payload as EmployeeSchedule[];
        }

        const schedules = (payload ?? {}) as { [key: string]: Horaire };
        return Object.entries(schedules).map(([email, horaire]) => {
          const namePart = email.split('@')[0];
          return {
            userId: 0, // Placeholder
            firstName: namePart.charAt(0).toUpperCase() + namePart.slice(1),
            lastName: '',
            initials: namePart.substring(0, 2).toUpperCase(),
            color: this.generateColor(email),
            horaire: horaire
          };
        });
      })
    );
  }

  private unwrap<T>(response: ApiEnvelope<T> | T): T {
    if (response && typeof response === 'object' && 'data' in (response as ApiEnvelope<T>)) {
      return (response as ApiEnvelope<T>).data as T;
    }
    return response as T;
  }

  private generateColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - color.length) + color;
  }
}
