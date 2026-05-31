// src/app/features/admin/entreprises/entreprise.service.ts

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';

import {
  Enterprise,
  EntrepriseStats,
  EntrepriseAccessControl,
  EntrepriseAccessControlHistory,
  PagedResponse,
  mapEntreprise,
} from './mock-enterprises';

// ── Re-exports pour les sous-composants ───────────────────
export type { Enterprise }                      from './mock-enterprises';
export type { EntrepriseStats }                 from './mock-enterprises';
export type { EntrepriseAccessControl }         from './mock-enterprises';
export type { EntrepriseAccessControlHistory }  from './mock-enterprises';
export type { RolePermission }                  from './mock-enterprises';
export type { ModulePermission }                from './mock-enterprises';
export type { PagedResponse }                   from './mock-enterprises';

// ── Aliases rétrocompat ───────────────────────────────────
export interface Entreprise extends Enterprise {}
export type StatutEntreprise = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

// ── Ancien type access-control (legacy modal) ─────────────
// Le modal enterprise-access-control-modal.component utilise
// l'ancienne API (rhUsers/managerUsers). On garde ce type
// séparé pour ne pas casser ce composant.
export interface EnterpriseAccessUserResponse {
  id: number;
  fullName: string;
  email: string;
  role: string;
  allowed: boolean;
}

export interface EnterpriseAccessControl {
  enterpriseId: number;
  enterpriseName: string;
  rhUsers: EnterpriseAccessUserResponse[];
  managerUsers: EnterpriseAccessUserResponse[];
}

export interface EnterpriseAccessControlRequest {
  rhUserIds: number[];
  managerUserIds: number[];
}

// ── Request DTO ───────────────────────────────────────────
export interface EntrepriseRequest {
  nom?: string;
  siret: string;
  secteur?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  logo?: string;
  maxUsers?: number;
  employeesCount?: number;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  estActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EntrepriseService {

  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/organisations/entreprises';

  // ── Liste filtrée + paginée ───────────────────────────────

  getAll(
    status: string = 'ALL',
    search: string = '',
    page: number = 0,
    size: number = 10,
    sort: string = 'createdAt,desc'
  ): Observable<PagedResponse<Enterprise>> {
    let params = new HttpParams()
      .set('status', status)
      .set('page', String(page))
      .set('size', String(size))
      .set('sort', sort);

    if (search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http
      .get<PagedResponse<any>>(this.base, { params })
      .pipe(
        retry({ count: 2, delay: 500 }),
        map(p => ({ ...p, content: p.content.map(mapEntreprise) })),
        catchError(this.handleError)
      );
  }

  // ── Stats ─────────────────────────────────────────────────

  getStats(): Observable<EntrepriseStats> {
    return this.http
      .get<EntrepriseStats>(`${this.base}/stats`)
      .pipe(
        retry({ count: 2, delay: 500 }),
        catchError(this.handleError)
      );
  }

  // ── Single ────────────────────────────────────────────────

  getById(id: string): Observable<Enterprise> {
    return this.http
      .get<any>(`${this.base}/${id}`)
      .pipe(map(mapEntreprise), catchError(this.handleError));
  }

  // ── CRUD ──────────────────────────────────────────────────

  create(payload: EntrepriseRequest): Observable<Enterprise> {
    return this.http
      .post<any>(this.base, payload)
      .pipe(map(mapEntreprise), catchError(this.handleError));
  }

  createEntreprise(payload: EntrepriseRequest): Observable<Enterprise> {
    return this.create(payload);
  }

  update(id: string, payload: EntrepriseRequest): Observable<Enterprise> {
    return this.http
      .put<any>(`${this.base}/${id}`, payload)
      .pipe(map(mapEntreprise), catchError(this.handleError));
  }

  updateEntreprise(id: string, payload: EntrepriseRequest): Observable<Enterprise> {
    return this.update(id, payload);
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/${id}`)
      .pipe(catchError(this.handleError));
  }

  deleteEntreprise(id: string): Observable<void> {
    return this.delete(id);
  }

  // ── Statut ────────────────────────────────────────────────

  changeStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  ): Observable<Enterprise> {
    return this.http
      .patch<any>(`${this.base}/${id}/status`, { status })
      .pipe(map(mapEntreprise), catchError(this.handleError));
  }

  // ── Batch ─────────────────────────────────────────────────

  deleteBatch(ids: string[]): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/batch`, { body: { ids } })
      .pipe(catchError(this.handleError));
  }

  changeStatusBatch(
    ids: string[],
    status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  ): Observable<void> {
    return this.http
      .patch<void>(`${this.base}/batch/status`, { ids, status })
      .pipe(catchError(this.handleError));
  }

  // ── Code invitation ───────────────────────────────────────

  regenerateCode(id: string): Observable<Enterprise> {
    return this.http
      .post<any>(`${this.base}/${id}/regenerate-code`, {})
      .pipe(map(mapEntreprise), catchError(this.handleError));
  }

  // ── Contrôle d'accès (nouveau — matrice modules/rôles) ────

  getAccessControl(id: string): Observable<EntrepriseAccessControl> {
    return this.http
      .get<EntrepriseAccessControl>(`${this.base}/${id}/access-control`)
      .pipe(catchError(this.handleError));
  }

  updateAccessControl(
    id: string,
    payload: EntrepriseAccessControl
  ): Observable<EntrepriseAccessControl> {
    return this.http
      .put<EntrepriseAccessControl>(`${this.base}/${id}/access-control`, payload)
      .pipe(catchError(this.handleError));
  }

  getAccessControlHistory(id: string): Observable<EntrepriseAccessControlHistory[]> {
    return this.http
      .get<EntrepriseAccessControlHistory[]>(
        `${this.base}/${id}/access-control/history`
      )
      .pipe(catchError(this.handleError));
  }

  // ── Contrôle d'accès (legacy — users RH/Manager) ─────────
  // Utilisé par enterprise-access-control-modal.component

  getEnterpriseAccessControl(id: string): Observable<EnterpriseAccessControl> {
    return this.http
      .get<EnterpriseAccessControl>(`${this.base}/${id}/access-control/users`)
      .pipe(catchError(this.handleError));
  }

  updateEnterpriseAccessControl(
    id: string,
    payload: EnterpriseAccessControlRequest
  ): Observable<EnterpriseAccessControl> {
    return this.http
      .put<EnterpriseAccessControl>(
        `${this.base}/${id}/access-control/users`,
        payload
      )
      .pipe(catchError(this.handleError));
  }

  // ── Error handler ─────────────────────────────────────────

  private handleError(err: HttpErrorResponse): Observable<never> {
    const message =
      err.error?.details  ||
      err.error?.message  ||
      err.message         ||
      'Une erreur inattendue est survenue.';
    return throwError(() => ({
      status:  err.status,
      message,
      code:    err.error?.error ?? err.error?.code,
    }));
  }
}