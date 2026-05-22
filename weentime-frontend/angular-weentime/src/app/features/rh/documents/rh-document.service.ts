import { Injectable, inject } from '@angular/core';
import { Observable, throwError, catchError, map } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  DemandeDocumentRH,
  StatsDocuments,
  AIGenerationResult,
  TypeDocumentConfig
} from './models/rh-document.model';
import { DocumentAuditEntry } from './models/document-audit.model';
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

  approuverDocument(id: number, contenu: string): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.APPROUVER_DOCUMENT_RH(id), { contenu }).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  signerDocument(id: number, signedBy: string): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.SIGNER_DOCUMENT_RH(id), { signedBy }).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  getDocumentAudit(id: number): Observable<DocumentAuditEntry[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_DOCUMENT_AUDIT(id)).pipe(
      map(response => {
        const raw = this.unwrapCollection(response);
        return raw.map((item: Record<string, unknown>) => ({
          id: Number(item['id']),
          action: String(item['action'] ?? ''),
          actionLabel: String(item['actionLabel'] ?? item['action'] ?? ''),
          details: item['details'] != null ? String(item['details']) : undefined,
          performedBy: Number(item['performedBy']),
          performedByName: String(item['performedByName'] ?? 'Utilisateur'),
          performedAt: String(item['performedAt'] ?? new Date().toISOString())
        }));
      }),
      catchError(err => throwError(() => err))
    );
  }

  updateStatut(id: number, statut: DemandeDocumentRH['statut'], commentaireRH?: string): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.UPDATE_DOCUMENT_STATUT(id), { statut, commentaireRH }).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  envoyerDocument(id: number): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(this.apiConfig.RH.ENVOYER_DOCUMENT_RH(id), {}).pipe(
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

  previewDocumentPdf(id: number, contenu: string): Observable<Blob> {
    return this.http.post(this.apiConfig.RH.PREVIEW_DOCUMENT_PDF(id), { contenu }, {
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
    const body: Record<string, unknown> = {
      type: demande.type,
      label: demande.label,
      employeNom: demande.employe.nom,
      employePrenom: demande.employe.prenom,
      employePoste: demande.employe.poste,
      employeDepartement: demande.employe.departement,
      dateEntree: demande.employe.dateEntree,
      moisConcerne: demande.moisConcerne,
      documentId: demande.id
    };

    return this.http.post<AIGenerationResult>(this.apiConfig.RH.GENERATE_DOCUMENT_AI, body).pipe(
      catchError(err => throwError(() => err))
    );
  }

  generateAIDocumentAdvanced(request: {
    type: string;
    prompt: string;
    employeNom: string;
    documentId?: number;
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
      // New workflow statuses — pass through
      case 'DEMANDE_RECUE':
        return 'DEMANDE_RECUE';
      case 'EN_REVISION':
        return 'EN_REVISION';
      case 'VALIDE':
        return 'VALIDE';
      case 'SIGNE':
        return 'SIGNE';
      case 'ENVOYE':
        return 'ENVOYE';

      // Legacy statuses — map to new equivalents
      case 'EN_ATTENTE':
      case 'EN_ATTENTE_RH':
      case 'PENDING':
        return 'DEMANDE_RECUE';
      case 'EN_COURS':
      case 'GENERATING':
        return 'EN_REVISION';
      case 'PRET':
      case 'APPROUVE':
      case 'READY':
        return 'ENVOYE';

      // Terminal statuses — keep as-is
      case 'REFUSE':
      case 'REJECTED':
        return 'REFUSE';
      case 'ANNULE':
        return 'ANNULE';

      default:
        return 'DEMANDE_RECUE';
    }
  }

  private isUrgent(dateCreation: string, statut: DemandeDocumentRH['statut']): boolean {
    if (statut !== 'DEMANDE_RECUE') {
      return false;
    }

    return (Date.now() - new Date(dateCreation).getTime()) > (48 * 60 * 60 * 1000);
  }

  private computeDelayLabel(dateCreation: string, statut: DemandeDocumentRH['statut']): string {
    if (statut === 'ENVOYE' || statut === 'SIGNE' || statut === 'VALIDE') {
      return 'Traité';
    }

    if (statut === 'REFUSE') {
      return 'Refusé';
    }

    if (statut === 'ANNULE') {
      return 'Annulé';
    }

    const elapsedHours = Math.max(Math.floor((Date.now() - new Date(dateCreation).getTime()) / (60 * 60 * 1000)), 0);
    return elapsedHours >= 24 ? `${Math.floor(elapsedHours / 24)} j` : `${elapsedHours} h`;
  }
}

