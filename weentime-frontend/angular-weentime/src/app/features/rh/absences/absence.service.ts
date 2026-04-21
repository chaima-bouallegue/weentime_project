import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AbsenceRequest,
  AbsenceResponse,
  AbsencePage,
  RejectionRequest
} from './absence.models';

const BASE = '/api/v1/rh/absences';

@Injectable({ providedIn: 'root' })
export class AbsenceService {
  private http = inject(HttpClient);

  // ── EMPLOYEE ──────────────────────────────────────────────────────────────

  /** Déclare une absence */
  declarer(request: AbsenceRequest): Observable<AbsenceResponse> {
    return this.http.post<AbsenceResponse>(BASE, request);
  }

  /** Liste paginée des absences de l'employé connecté */
  mesAbsences(params: {
    page?: number;
    size?: number;
    statut?: string;
    type?: string;
  } = {}): Observable<AbsencePage> {
    let httpParams = new HttpParams()
      .set('page', params.page ?? 0)
      .set('size', params.size ?? 10);
    if (params.statut) httpParams = httpParams.set('statut', params.statut);
    if (params.type)   httpParams = httpParams.set('type',   params.type);
    return this.http.get<AbsencePage>(`${BASE}/mes-absences`, { params: httpParams });
  }

  /** Annuler une absence EN_ATTENTE */
  annuler(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}`);
  }

  // ── RH ────────────────────────────────────────────────────────────────────

  /** Toutes les absences de l'entreprise (vue RH) */
  absencesEntreprise(params: {
    page?: number;
    size?: number;
    statut?: string;
  } = {}): Observable<AbsencePage> {
    let httpParams = new HttpParams()
      .set('page', params.page ?? 0)
      .set('size', params.size ?? 20);
    if (params.statut) httpParams = httpParams.set('statut', params.statut);
    return this.http.get<AbsencePage>(`${BASE}/entreprise`, { params: httpParams });
  }

  /** Valider une absence */
  valider(id: number): Observable<AbsenceResponse> {
    return this.http.patch<AbsenceResponse>(`${BASE}/${id}/valider`, {});
  }

  /** Rejeter une absence avec motif */
  rejeter(id: number, motifRefus: string): Observable<AbsenceResponse> {
    const body: RejectionRequest = { motifRefus };
    return this.http.patch<AbsenceResponse>(`${BASE}/${id}/rejeter`, body);
  }
}
