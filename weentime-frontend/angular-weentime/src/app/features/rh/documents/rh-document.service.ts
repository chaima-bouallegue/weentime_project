import { Injectable, inject } from '@angular/core';
import { Observable, throwError, catchError, map } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  DemandeDocumentRH,
  StatsDocuments,
  AIGenerationResult,
  TypeDocumentConfig
} from './models/rh-document.model';
import { ApiConfigService } from '../../../core/services/api-config.service';

@Injectable({
  providedIn: 'root'
})
export class RhDocumentService {
  private http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  getDemandesEntreprise(): Observable<DemandeDocumentRH[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_RH_DOCUMENT_REQUESTS).pipe(
      map(response => this.unwrapCollection(response).map(d => this.mapToFrontend(d))),
      catchError(err => throwError(() => err))
    );
  }

  getStats(): Observable<StatsDocuments> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_RH_DOCUMENT_STATS).pipe(
      map(response => this.unwrapItem(response) as StatsDocuments),
      catchError(err => throwError(() => err))
    );
  }

  passerEnCours(id: number): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.PASSER_DOCUMENT_EN_COURS(id), {}).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  validerAvecDocument(id: number, data: {
    documentUrl?: string;
    contenuIA?: string;
    generatedByAI: boolean;
    commentaireRH?: string;
  }): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.VALIDATE_DOCUMENT_RH(id), data).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  refuser(id: number, commentaireRH: string): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.REFUSE_DOCUMENT_RH(id), { commentaireRH }).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  uploadAndValidate(id: number, file: File): Observable<DemandeDocumentRH> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<unknown>(this.apiConfig.RH.UPLOAD_DOCUMENT_RH(id), formData).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  getDocumentFile(id: number): Observable<Blob> {
    return this.http.get(this.apiConfig.RH.GET_DOCUMENT_FILE_RH(id), {
      responseType: 'blob'
    });
  }

  private mapToFrontend(d: any): DemandeDocumentRH {
    const statut = this.normalizeStatus(d?.statut);
    const dateCreation = d?.dateCreation ?? d?.createdAt ?? new Date().toISOString();

    return {
      ...d,
      statut,
      dateCreation,
      dateMiseAJour: d?.dateMiseAJour ?? d?.dateDecision ?? dateCreation,
      delaiEstime: this.computeDelayLabel(dateCreation, statut),
      urgente: Boolean(d?.urgente) || this.isUrgent(dateCreation, statut),
      generatedByAI: Boolean(d?.generatedByAI),
      employe: {
        id: d?.employeId ?? 0,
        nom: d?.employeNom ?? 'Inconnu',
        prenom: d?.employePrenom ?? '',
        poste: d?.employePoste ?? 'Non renseigne',
        departement: d?.employeDepartement ?? 'Non renseigne',
        email: d?.employeeEmail ?? '',
        entrepriseId: 0,
        dateEntree: '' 
      }
    };
  }

  generateAIDocument(demande: DemandeDocumentRH): Observable<AIGenerationResult> {
    const body: any = {
      type: demande.type,
      label: demande.label,
      employeNom: demande.employe.nom,
      employePrenom: demande.employe.prenom,
      employePoste: demande.employe.poste,
      employeDepartement: demande.employe.departement,
      dateEntree: demande.employe.dateEntree,
      moisConcerne: demande.moisConcerne
    };

    return this.http.post<AIGenerationResult>(this.apiConfig.RH.GENERATE_DOCUMENT_AI, body).pipe(
      catchError(err => throwError(() => err))
    );
  }

  generateAIDocumentAdvanced(request: {
    type: string;
    prompt: string;
    employeNom: string;
    typeDocumentId?: number;
    temperature?: number;
  }): Observable<AIGenerationResult> {
    return this.http.post<AIGenerationResult>(this.apiConfig.RH.GENERATE_DOCUMENT_AI_ADVANCED, request).pipe(
      catchError(err => throwError(() => err))
    );
  }

  getTemplateVariables(): Observable<Array<{key: string, label: string, group: string}>> {
    return this.http.get<any>(this.apiConfig.RH.GET_TEMPLATE_VARIABLES).pipe(
      map(res => this.unwrapItem(res)),
      catchError(err => throwError(() => err))
    );
  }

  getTypeDocumentConfigs(): Observable<TypeDocumentConfig[]> {
    return this.http.get<any>(this.apiConfig.RH.GET_TYPE_DOCUMENTS).pipe(
      map(res => this.unwrapCollection(res)),
      catchError(err => throwError(() => err))
    );
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

  private normalizeStatus(rawStatus: string | undefined): DemandeDocumentRH['statut'] {
    switch (rawStatus) {
      case 'EN_ATTENTE':
      case 'EN_ATTENTE_RH':
        return 'EN_ATTENTE';
      case 'EN_COURS':
        return 'EN_COURS';
      case 'PRET':
      case 'APPROUVE':
        return 'PRET';
      case 'REFUSE':
        return 'REFUSE';
      case 'ANNULE':
        return 'ANNULE';
      default:
        return 'EN_ATTENTE';
    }
  }

  private isUrgent(dateCreation: string, statut: DemandeDocumentRH['statut']): boolean {
    if (statut !== 'EN_ATTENTE') {
      return false;
    }

    return (Date.now() - new Date(dateCreation).getTime()) > (48 * 60 * 60 * 1000);
  }

  private computeDelayLabel(dateCreation: string, statut: DemandeDocumentRH['statut']): string {
    if (statut === 'PRET') {
      return 'Pret';
    }

    if (statut === 'REFUSE') {
      return 'Refuse';
    }

    const elapsedHours = Math.max(Math.floor((Date.now() - new Date(dateCreation).getTime()) / (60 * 60 * 1000)), 0);
    return elapsedHours >= 24 ? `${Math.floor(elapsedHours / 24)} j` : `${elapsedHours} h`;
  }
}

