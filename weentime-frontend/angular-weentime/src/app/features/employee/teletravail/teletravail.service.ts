import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, tap, throwError } from 'rxjs';
import {
  QuotaTeletravail,
  DemandeTeletravail,
  NouvelleDemandeTeletravailRequest
} from './models/teletravail.model';
import { StatsWorkflow, StatsRH, DemandeTeletravailWorkflow } from '../../shared/models/workflow-teletravail.model';
import { ToastService } from '../../../core/services/toast.service';
import { ApiConfigService } from '../../../core/services/api-config.service';

@Injectable({
  providedIn: 'root'
})
export class TeletravailService {
  private readonly http = inject(HttpClient);
  private readonly toastService = inject(ToastService);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly API = this.apiConfig.RH.GET_TELETRAVAILS;

  getQuota(): Observable<QuotaTeletravail> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);

    return this.getHistorique().pipe(
      map(items => {
        const inMonth = items.filter(item => {
          const date = new Date(item.dateDebut);
          return date >= monthStart && date <= monthEnd;
        });
        const joursUtilises = inMonth
          .filter(item => item.statut === 'APPROUVE')
          .reduce((sum, item) => sum + Number(item.nombreJours || 0), 0);
        const joursEnAttente = inMonth
          .filter(item => item.statut === 'EN_ATTENTE_MANAGER' || item.statut === 'EN_ATTENTE_RH')
          .reduce((sum, item) => sum + Number(item.nombreJours || 0), 0);
        const joursAutorises = 10;

        return {
          joursAutorises,
          joursUtilises,
          joursEnAttente,
          joursRestants: Math.max(joursAutorises - joursUtilises - joursEnAttente, 0),
          periodeDebut: monthStart.toISOString().slice(0, 10),
          periodeFin: monthEnd.toISOString().slice(0, 10)
        };
      })
    );
  }

  getHistorique(): Observable<DemandeTeletravail[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_MY_TELETRAVAILS).pipe(
      map(response => this.unwrapCollection(response).map(item => this.mapToTeletravail(item))),
      catchError(err => this.handleError('Erreur lors de la recuperation de l historique', err))
    );
  }

  soumettreDemande(req: NouvelleDemandeTeletravailRequest): Observable<DemandeTeletravail> {
    return this.http.post<unknown>(this.API, req).pipe(
      map(response => this.mapToTeletravail(this.unwrapItem(response))),
      tap(() => this.toastService.success('Demande de teletravail soumise avec succes')),
      catchError(err => this.handleError('Erreur lors de la soumission de la demande', err))
    );
  }

  annulerDemande(id: number): Observable<any> {
    return this.http.put(`${this.API}/${id}/annuler`, {}).pipe(
      tap(() => this.toastService.success('Demande annulee')),
      catchError(err => this.handleError('Erreur lors de l annulation', err))
    );
  }

  getJoursFeries(): Observable<string[]> {
    return of([]);
  }

  getDemandesEquipe(): Observable<DemandeTeletravailWorkflow[]> {
    return this.http.get<unknown>(`${this.API}/demandes-equipe`).pipe(
      map(response => this.unwrapCollection(response).map(item => this.mapToWorkflow(item))),
      catchError(err => this.handleError('Erreur lors de la recuperation des demandes equipe', err))
    );
  }

  getMesDecisions(): Observable<DemandeTeletravailWorkflow[]> {
    return this.http.get<unknown>(`${this.API}/mes-decisions`).pipe(
      map(response => this.unwrapCollection(response).map(item => this.mapToWorkflow(item))),
      catchError(err => this.handleError('Erreur lors de la recuperation de vos decisions', err))
    );
  }

  getStatsManager(): Observable<StatsWorkflow> {
    return this.http.get<unknown>(`${this.API}/stats-manager`).pipe(
      map(response => this.unwrapStats<StatsWorkflow>(response)),
      catchError(err => this.handleError('Erreur lors de la recuperation des stats manager', err))
    );
  }

  validerManager(id: number, commentaire?: string): Observable<DemandeTeletravailWorkflow> {
    return this.http.patch<unknown>(`${this.API}/${id}/valider-manager`, { commentaire }).pipe(
      map(response => this.mapToWorkflow(this.unwrapItem(response))),
      tap(() => this.toastService.success('Demande validee')),
      catchError(err => this.handleError('Erreur lors de la validation', err))
    );
  }

  rejeterManager(id: number, commentaire: string): Observable<DemandeTeletravailWorkflow> {
    return this.http.patch<unknown>(`${this.API}/${id}/rejeter-manager`, { commentaire }).pipe(
      map(response => this.mapToWorkflow(this.unwrapItem(response))),
      tap(() => this.toastService.success('Demande rejetee')),
      catchError(err => this.handleError('Erreur lors du rejet', err))
    );
  }

  getDemandesEnAttenteRH(): Observable<DemandeTeletravailWorkflow[]> {
    return this.http.get<unknown>(`${this.API}/en-attente-rh`).pipe(
      map(response => this.unwrapCollection(response).map(item => this.mapToWorkflow(item))),
      catchError(err => this.handleError('Erreur lors de la recuperation des demandes RH', err))
    );
  }

  getHistoriqueGlobal(): Observable<DemandeTeletravailWorkflow[]> {
    return this.http.get<unknown>(`${this.API}/historique-global`).pipe(
      map(response => this.unwrapCollection(response).map(item => this.mapToWorkflow(item))),
      catchError(err => this.handleError('Erreur lors de la recuperation de l historique global', err))
    );
  }

  getStatsRH(): Observable<StatsRH> {
    return this.http.get<unknown>(`${this.API}/stats-rh`).pipe(
      map(response => this.unwrapStats<StatsRH>(response)),
      catchError(err => this.handleError('Erreur lors de la recuperation des stats RH', err))
    );
  }

  validerRH(id: number, commentaire?: string): Observable<DemandeTeletravailWorkflow> {
    return this.http.patch<unknown>(`${this.API}/${id}/valider-rh`, { commentaire }).pipe(
      map(response => this.mapToWorkflow(this.unwrapItem(response))),
      tap(() => this.toastService.success('Demande approuvee definitivement')),
      catchError(err => this.handleError('Erreur lors de la validation RH', err))
    );
  }

  rejeterRH(id: number, commentaire: string): Observable<DemandeTeletravailWorkflow> {
    return this.http.patch<unknown>(`${this.API}/${id}/rejeter-rh`, { commentaire }).pipe(
      map(response => this.mapToWorkflow(this.unwrapItem(response))),
      tap(() => this.toastService.success('Demande rejetee definitivement')),
      catchError(err => this.handleError('Erreur lors du rejet RH', err))
    );
  }

  private mapToTeletravail(item: any): DemandeTeletravail {
    return {
      id: item.id,
      type: item.type,
      label: item.label || item.type,
      dateDebut: item.dateDebut,
      dateFin: item.dateFin,
      nombreJours: Number(item.nombreJours || 0),
      periode: item.periode,
      motif: item.motif,
      statut: item.statut,
      dateCreation: item.dateCreation || item.createdAt,
      etapeActuelle: item.etapeActuelle || this.resolveEtape(item.statut),
      commentaireManager: item.commentaireManager,
      commentaireRH: item.commentaireRH
    };
  }

  private mapToWorkflow(item: any): DemandeTeletravailWorkflow {
    const employee = item.employe ?? {};

    return {
      ...item,
      employe: {
        id: item.utilisateurId ?? employee.id ?? 0,
        nom: item.employeNom ?? employee.nom ?? 'Inconnu',
        prenom: item.employePrenom ?? employee.prenom ?? '',
        poste: item.employePoste ?? employee.poste ?? '',
        departement: item.employeDepartement ?? employee.departement ?? '',
        avatarInitiales: employee.avatarInitiales
          ?? `${(item.employePrenom ?? employee.prenom ?? '').charAt(0)}${(item.employeNom ?? employee.nom ?? '').charAt(0)}`
      }
    };
  }

  private resolveEtape(statut: string): 'MANAGER' | 'RH' | 'TERMINE' {
    if (statut === 'EN_ATTENTE_MANAGER') {
      return 'MANAGER';
    }
    if (statut === 'EN_ATTENTE_RH') {
      return 'RH';
    }
    return 'TERMINE';
  }

  private handleError(message: string, error: any): Observable<never> {
    this.toastService.error(message);
    return throwError(() => error);
  }

  private unwrapCollection(response: unknown): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (response && typeof response === 'object') {
      const data = (response as Record<string, unknown>)['data'];
      return Array.isArray(data) ? data : [];
    }

    return [];
  }

  private unwrapItem(response: unknown): any {
    if (response && typeof response === 'object') {
      const data = (response as Record<string, unknown>)['data'];
      return data ?? response;
    }

    return response;
  }

  private unwrapStats<T>(response: unknown): T {
    return this.unwrapItem(response) as T;
  }
}
