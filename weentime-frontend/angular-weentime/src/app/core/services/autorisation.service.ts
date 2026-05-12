import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import {
  Autorisation,
  StatsAutorisation,
  PageResponse
} from '../models/autorisation.model';

@Injectable({
  providedIn: 'root'
})
export class AutorisationService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly baseUrl = this.apiConfig.RH.GET_AUTORISATIONS;

  getMesDemandes(page = 0, size = 10): Observable<PageResponse<Autorisation>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PageResponse<Autorisation>>(`${this.baseUrl}/my-history`, { params }).pipe(
      map(response => this.mapPage(this.unwrap(response)))
    );
  }

  getDemandesEquipe(page = 0, size = 10): Observable<PageResponse<Autorisation>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PageResponse<Autorisation>>(`${this.baseUrl}/manager/history`, { params }).pipe(
      map(response => this.mapPage(this.unwrap(response)))
    );
  }

  getDemandesEntreprise(page = 0, size = 10): Observable<PageResponse<Autorisation>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PageResponse<Autorisation>>(`${this.baseUrl}/rh/history`, { params }).pipe(
      map(response => this.mapPage(this.unwrap(response)))
    );
  }

  getEmployeeKPIs(): Observable<StatsAutorisation> {
    return this.http.get<StatsAutorisation>(`${this.baseUrl}/kpis/employee`).pipe(map(response => this.unwrap(response)));
  }

  getManagerKPIs(): Observable<StatsAutorisation> {
    return this.http.get<StatsAutorisation>(`${this.baseUrl}/kpis/manager`).pipe(map(response => this.unwrap(response)));
  }

  getRhKPIs(): Observable<StatsAutorisation> {
    return this.http.get<StatsAutorisation>(`${this.baseUrl}/kpis/rh`).pipe(map(response => this.unwrap(response)));
  }

  getTypesAutorisation(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiConfig.buildUrl('/rh')}/parametres/types-autorisations`);
  }

  soumettreDemande(request: any): Observable<Autorisation> {
    const body = {
      ...request,
      typeAutorisation: request.type,
      dateAutorisation: request.date
    };

    return this.http.post<Autorisation>(this.baseUrl, body).pipe(
      map(response => this.mapAutorisation(this.unwrap(response)))
    );
  }

  annulerDemande(id: number): Observable<Autorisation> {
    return this.http.patch<Autorisation>(this.apiConfig.RH.CANCEL_AUTORISATION(id), {}).pipe(
      map(response => this.mapAutorisation(this.unwrap(response)))
    );
  }

  deciderManager(id: number, approved: boolean, comment?: string): Observable<Autorisation> {
    if (approved) {
      return this.http.patch<Autorisation>(`${this.baseUrl}/${id}/manager/validate`, {}).pipe(
        map(response => this.mapAutorisation(this.unwrap(response)))
      );
    }

    return this.http.patch<Autorisation>(`${this.baseUrl}/${id}/reject`, {
      commentaire: comment || 'Refuse par le manager'
    }).pipe(
      map(response => this.mapAutorisation(this.unwrap(response)))
    );
  }

  deciderRH(id: number, approved: boolean, comment?: string): Observable<Autorisation> {
    if (approved) {
      return this.http.patch<Autorisation>(`${this.baseUrl}/${id}/rh/validate`, {}).pipe(
        map(response => this.mapAutorisation(this.unwrap(response)))
      );
    }

    return this.http.patch<Autorisation>(`${this.baseUrl}/${id}/reject`, {
      commentaire: comment || 'Refuse par les RH'
    }).pipe(
      map(response => this.mapAutorisation(this.unwrap(response)))
    );
  }

  private mapPage(page: PageResponse<Autorisation>): PageResponse<Autorisation> {
    return {
      ...page,
      content: Array.isArray(page?.content) ? page.content.map(item => this.mapAutorisation(item)) : []
    };
  }

  private mapAutorisation(source: any): Autorisation {
    const utilisateur = this.mapUtilisateur(source);
    const typeAutorisation = this.resolveTypeValue(source?.typeAutorisation);
    return {
      id: Number(source?.id ?? 0),
      utilisateurId: Number(source?.utilisateurId ?? source?.utilisateur?.id ?? 0),
      utilisateur,
      nomComplet: source?.nomComplet || utilisateur.fullName,
      managerId: this.toOptionalNumber(source?.managerId),
      typeAutorisation,
      typeAutorisationLabel: this.resolveTypeLabel(source?.typeAutorisation) || typeAutorisation,
      dateAutorisation: source?.dateAutorisation ?? '',
      heureDebut: source?.heureDebut ?? '',
      heureFin: source?.heureFin ?? '',
      duree: Number(source?.duree ?? 0),
      motif: String(source?.motif ?? ''),
      commentaire: source?.commentaire ?? '',
      commentaireValidateur: source?.commentaireValidateur ?? '',
      statut: source?.statut ?? 'EN_ATTENTE_MANAGER',
      dateCreation: source?.dateCreation ?? source?.createdAt ?? '',
      dateDecision: source?.dateDecision ?? undefined,
      entrepriseId: this.toOptionalNumber(source?.entrepriseId)
    };
  }

  private mapUtilisateur(source: any): NonNullable<Autorisation['utilisateur']> {
    const prenom = String(source?.prenom ?? '').trim();
    const nom = String(source?.nom ?? '').trim();
    const fullName = String(source?.nomComplet ?? `${prenom} ${nom}`.trim()).trim();
    return {
      id: Number(source?.utilisateurId ?? source?.utilisateur?.id ?? 0),
      nom,
      prenom,
      fullName,
      email: String(source?.email ?? source?.utilisateur?.email ?? '')
    };
  }

  private resolveTypeValue(source: any): Autorisation['typeAutorisation'] {
    if (typeof source === 'string') {
      return source as Autorisation['typeAutorisation'];
    }
    const value = source?.libelle ?? source?.label ?? source?.nom ?? 'AUTRE';
    return String(value).replaceAll(' ', '_').toUpperCase() as Autorisation['typeAutorisation'];
  }

  private resolveTypeLabel(source: any): string {
    if (typeof source === 'string') {
      return source;
    }
    return String(source?.libelle ?? source?.label ?? source?.nom ?? '');
  }

  private toOptionalNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  calculerDuree(debut: string, fin: string): { decimal: number, libelle: string, heures: number, minutes: number } {
    if (!debut || !fin) {
      return { decimal: 0, libelle: '--', heures: 0, minutes: 0 };
    }

    const [h1, m1] = debut.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);

    let totalMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (totalMinutes < 0) {
      totalMinutes = 0;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return {
      decimal: totalMinutes / 60,
      libelle: `${hours}h ${minutes.toString().padStart(2, '0')}min`,
      heures: hours,
      minutes
    };
  }

  private unwrap<T>(response: T | { data?: T }): T {
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data?: T }).data as T;
    }
    return response as T;
  }
}
