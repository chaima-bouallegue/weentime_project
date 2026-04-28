import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// [WEENTIME - CHANGEMENT 8]
export interface SimpleTeam {
  id: number;
  nom: string;
  nombreMembres?: number; // optionnel — fallback gracieux si absent du backend
}

export interface SimpleUser {
  id: number;
  nom: string;
  prenom: string;
  email: string;
}

import { 
  SimpleTeam as EquipeResponse, 
  SimpleUser as UtilisateurResponse 
} from './organisation.service';
import { PageResponse } from '../models/horaire.model';

@Injectable({
  providedIn: 'root'
})
export class OrganisationService {
  private http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/organisations`;

  getTeams(page = 0, size = 100): Observable<PageResponse<EquipeResponse>> {
    const safeSize = Math.min(Math.max(size, 1), 100);
    return this.http.get<PageResponse<EquipeResponse>>(`${this.baseUrl}/equipes`, {
      params: { page: page.toString(), size: safeSize.toString() }
    });
  }

  getUsers(page = 0, size = 100): Observable<PageResponse<UtilisateurResponse>> {
    const safeSize = Math.min(Math.max(size, 1), 100);
    return this.http.get<PageResponse<UtilisateurResponse>>(`${this.baseUrl}/users`, {
      params: { page: page.toString(), size: safeSize.toString() }
    });
  }

  getEquipesByResponsable(responsableId: number): Observable<EquipeResponse[]> {
    return this.http.get<EquipeResponse[]>(`${this.baseUrl}/equipes/responsable/${responsableId}`);
  }

  getUtilisateursByEquipe(equipeId: number): Observable<UtilisateurResponse[]> {
    return this.http.get<UtilisateurResponse[]>(`${this.baseUrl}/users/equipe/${equipeId}`);
  }
}
