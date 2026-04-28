import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import {
  RhOwner,
  CreateRhOwnerRequest,
  UpdateRhOwnerRequest,
  EntrepriseSelectItem,
} from './models/rh-owner.model';
import { ApiConfigService } from '../../../core/services/api-config.service';

interface ApiResponse<T> {
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class RhOwnerService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly rhOwnersApi = this.api.buildUrl('organisations/rh-owners');
  private readonly legacyRhApi = this.api.ORGANISATION.GET_RH_USERS;
  private readonly entreprisesApi = this.api.ORGANISATION.GET_ENTREPRISES;

  getRhOwners(): Observable<RhOwner[]> {
    return this.http.get<RhOwner[] | ApiResponse<RhOwner[]>>(this.rhOwnersApi).pipe(
      map(response => this.normalizeRhOwners(this.unwrapArray(response))),
      catchError(() =>
        this.http.get<RhOwner[] | ApiResponse<RhOwner[]>>(this.legacyRhApi).pipe(
          map(response => this.normalizeRhOwners(this.unwrapArray(response)))
        )
      )
    );
  }

  getEntreprisesForSelect(): Observable<EntrepriseSelectItem[]> {
    return this.http.get<{ content?: EntrepriseSelectItem[] } | EntrepriseSelectItem[]>(this.entreprisesApi).pipe(
      map(response => {
        if (Array.isArray(response)) {
          return response;
        }
        return Array.isArray(response?.content) ? response.content : [];
      })
    );
  }

  createRhOwner(request: CreateRhOwnerRequest): Observable<RhOwner> {
    return this.http.post<RhOwner | ApiResponse<RhOwner>>(this.rhOwnersApi, request).pipe(
      map(response => this.normalizeRhOwner(this.unwrapItem(response)))
    );
  }

  updateRhOwner(id: number, request: UpdateRhOwnerRequest): Observable<RhOwner> {
    return this.http.put<RhOwner | ApiResponse<RhOwner>>(`${this.rhOwnersApi}/${id}`, request).pipe(
      map(response => this.normalizeRhOwner(this.unwrapItem(response)))
    );
  }

  deleteRhOwner(id: number): Observable<void> {
    return this.http.delete<void>(`${this.rhOwnersApi}/${id}`);
  }

  assignEntreprise(id: number, entrepriseId: number): Observable<RhOwner> {
    return this.http.put<RhOwner | ApiResponse<RhOwner>>(`${this.rhOwnersApi}/${id}/assign-entreprise`, { entrepriseId }).pipe(
      map(response => this.normalizeRhOwner(this.unwrapItem(response)))
    );
  }

  toggleRhStatus(id: number): Observable<RhOwner> {
    return this.http.patch<RhOwner | ApiResponse<RhOwner>>(`${this.rhOwnersApi}/${id}/toggle-statut`, {}).pipe(
      map(response => this.normalizeRhOwner(this.unwrapItem(response))),
      catchError(() =>
        this.http.patch<RhOwner | ApiResponse<RhOwner>>(this.api.ORGANISATION.TOGGLE_RH_STATUS(id), {}).pipe(
          map(response => this.normalizeRhOwner(this.unwrapItem(response)))
        )
      )
    );
  }

  checkEmailUnique(email: string, excludedUserId?: number): Observable<boolean> {
    return this.http.get<any>(this.api.ORGANISATION.GET_USER_BY_EMAIL(email)).pipe(
      map(response => {
        const payload = response?.data ?? response;
        const foundId = Number(payload?.id ?? 0);
        if (excludedUserId && foundId === excludedUserId) {
          return true;
        }
        return false;
      }),
      catchError((err: any) => {
        if (err.status === 404) {
          return of(true);
        }
        return of(false);
      })
    );
  }

  private unwrapArray(response: RhOwner[] | ApiResponse<RhOwner[]>): RhOwner[] {
    if (Array.isArray(response)) {
      return response;
    }
    return Array.isArray(response?.data) ? response.data : [];
  }

  private unwrapItem(response: RhOwner | ApiResponse<RhOwner>): RhOwner {
    return (response as ApiResponse<RhOwner>)?.data ?? (response as RhOwner);
  }

  private normalizeRhOwners(items: RhOwner[]): RhOwner[] {
    const list = Array.isArray(items) ? items : [];
    return list
      .filter((item, index, arr) => arr.findIndex(candidate => candidate.id === item.id) === index)
      .map(item => this.normalizeRhOwner(item));
  }

  private normalizeRhOwner(item: RhOwner): RhOwner {
    const prenom = String(item?.prenom ?? '').trim();
    const nom = String(item?.nom ?? '').trim();
    const name = String(item?.name ?? `${prenom} ${nom}`.trim()).trim();
    const role = String(item?.role ?? 'RH').replace(/^ROLE_/i, '').toUpperCase();

    return {
      ...item,
      prenom: prenom || name.split(' ')[0] || '',
      nom: nom || name.split(' ').slice(1).join(' ') || name.split(' ')[0] || '',
      name,
      role,
      entrepriseNom: String(item?.entrepriseNom ?? '').trim()
    };
  }
}
