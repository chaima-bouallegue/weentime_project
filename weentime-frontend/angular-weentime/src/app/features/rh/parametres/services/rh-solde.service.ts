import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';

export interface SoldeDetail {
  typeCongeId: number;
  typeNom: string;
  joursMax: number;
  joursRestants: number;
  joursUtilises: number;
}

export interface EmployeeSolde {
  utilisateurId: number;
  nom: string;
  prenom: string;
  isInitialised: boolean;
  soldes: SoldeDetail[];
}

@Injectable({
  providedIn: 'root'
})
export class RhSoldeService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/rh/soldes`;

  getGlobalSoldes(params: { page: number, size: number, annee: number, query?: string }): Observable<any> {
    let httpParams = new HttpParams()
      .set('page', params.page.toString())
      .set('size', params.size.toString())
      .set('annee', params.annee.toString());
    
    if (params.query) {
      httpParams = httpParams.set('query', params.query);
    }

    return this.http.get<any>(this.apiUrl, { params: httpParams });
  }

  initialiser(utilisateurIds: number[] = []): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/initialiser`, { utilisateurIds });
  }

  reinitialiserAnnuel(annee: number, utilisateurIds: number[] = []): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/reinitialiser-annuel`, { annee, utilisateurIds });
  }

  ajusterSolde(utilisateurId: number, typeCongeId: number, request: { joursRestants: number, motif: string }): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${utilisateurId}/${typeCongeId}`, request);
  }

  getAuditLogs(utilisateurId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${utilisateurId}/audit`);
  }

  getLeaveTypes(): Observable<any[]> {
    return this.http.get<any[]>(`${environment.apiUrl}/rh/type-conges`);
  }
}
