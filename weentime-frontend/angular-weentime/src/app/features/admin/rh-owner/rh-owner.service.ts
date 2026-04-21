import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { RhOwner, CreateRhOwnerRequest, EntrepriseSelectItem } from './models/rh-owner.model';

interface ApiResponse<T> {
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class RhOwnerService {
  private http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8222/api/v1/organisations/rh';
  private readonly AUTH_API_URL = 'http://localhost:8222/api/v1/auth/admin';
  private readonly ENTREPRISE_API_URL = 'http://localhost:8222/api/v1/organisations/entreprises';

  getRhOwners(): Observable<RhOwner[]> {
    return this.http.get<RhOwner[] | ApiResponse<RhOwner[]>>(this.API_URL).pipe(
      map(response => this.unwrapArray(response))
    );
  }

  getEntreprisesForSelect(): Observable<EntrepriseSelectItem[]> {
    return this.http.get<{ content: EntrepriseSelectItem[] }>(this.ENTREPRISE_API_URL).pipe(
      map(response => response.content)
    );
  }

  createRhOwner(request: CreateRhOwnerRequest): Observable<RhOwner> {
    return this.http.post<RhOwner>(`${this.AUTH_API_URL}/create-rh`, request);
  }

  toggleRhStatus(id: number): Observable<RhOwner> {
    return this.http.patch<RhOwner | ApiResponse<RhOwner>>(`${this.API_URL}/${id}/toggle-statut`, {}).pipe(
      map(response => this.unwrapItem(response))
    );
  }

  checkEmailUnique(email: string): Observable<boolean> {
    return this.http.get<any>(`http://localhost:8222/api/v1/organisations/users/by-email?email=${email}`).pipe(
      map(() => false), // Found -> not unique
      catchError((err: any) => {
        if (err.status === 404) return of(true); // Not found -> unique
        return of(false); // Other errors (e.g. 403) -> assume not unique for safety
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
}
