import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, of, catchError, map, throwError } from 'rxjs';
import {
  TypeDocumentConfig,
  DemandeDocument,
  NouvelleDemandeDocumentRequest,
  TypeDocument
} from './models/document.model';
import { ApiConfigService } from '../../../core/services/api-config.service';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);

  private cachedTypes: TypeDocumentConfig[] = [];

  getTypesDocument(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiConfig.buildUrl('/rh')}/parametres/types-documents`);
  }

  getTypesDisponibles(): Observable<TypeDocumentConfig[]> {
    if (this.cachedTypes.length > 0) return of(this.cachedTypes);

    return this.getTypesDocument().pipe(
      map(types => {
        this.cachedTypes = types.map(t => ({
          type: t.code as TypeDocument,
          label: t.libelle,
          description: t.requireSignature ? 'Signature requise' : 'Validation simple',
          icone: this.mapTypeToIcon(t.code),
          couleur: this.mapTypeToColor(t.code),
          delaiEstime: '48h',
          requiresMois: t.code === 'BULLETIN_PAIE'
        }));
        return this.cachedTypes;
      })
    );
  }

  private mapTypeToIcon(code: string): string {
    const map: Record<string, string> = {
      'ATTESTATION_TRAVAIL': 'file-check',
      'BULLETIN_PAIE': 'receipt',
      'ATTESTATION_SALAIRE': 'banknote',
      'CONTRAT_TRAVAIL': 'file-signature',
      'CERTIFICAT_CONGE': 'umbrella',
      'ATTESTATION_ANCIENNETE': 'award',
      'FICHE_POSTE': 'briefcase'
    };
    return map[code] || 'file-text';
  }

  private mapTypeToColor(code: string): string {
    const map: Record<string, string> = {
      'ATTESTATION_TRAVAIL': '#6366f1',
      'BULLETIN_PAIE': '#10b981',
      'ATTESTATION_SALAIRE': '#059669',
      'CONTRAT_TRAVAIL': '#8b5cf6',
      'CERTIFICAT_CONGE': '#3b82f6',
      'ATTESTATION_ANCIENNETE': '#f59e0b',
      'FICHE_POSTE': '#64748b'
    };
    return map[code] || '#4f46e5';
  }

  getHistorique(): Observable<DemandeDocument[]> {
    return this.http.get<any>(this.apiConfig.RH.GET_MY_DOCUMENTS).pipe(
      map(response => {
        const data = response?.data || response;
        const items = data?.content || data || [];
        return Array.isArray(items) ? items.map((item: any) => this.mapToDemandeDocument(item)) : [];
      }),
      catchError(() => of([]))
    );
  }

  soumettreDemande(req: NouvelleDemandeDocumentRequest): Observable<DemandeDocument> {
    const payload = {
      type: req.type,
      moisConcerne: req.moisConcerne || null,
      motif: req.motif || req.moisConcerne || req.type
    };

    return this.http.post<any>(this.apiConfig.RH.CREATE_DOCUMENT, payload).pipe(
      map(response => {
        const data = response?.data || response;
        if (!data) {
          throw new Error('DOCUMENT_REQUEST_EMPTY_RESPONSE');
        }
        return this.mapToDemandeDocument(data);
      })
    );
  }

  annulerDemande(id: number): Observable<DemandeDocument> {
    return this.http.put<unknown>(this.apiConfig.RH.CANCEL_DOCUMENT(id), {}).pipe(
      map(response => {
        const data = (response as { data?: unknown })?.data ?? response;
        return this.mapToDemandeDocument(data);
      }),
      catchError(err => {
        // Extraire le message d'erreur du backend
        const message =
          err?.error?.message ||
          err?.error?.error ||
          err?.message ||
          'Impossible d\'annuler cette demande.';
        return throwError(() => new Error(message));
      })
    );
  }

  telechargerDocument(id: number): Observable<HttpResponse<Blob>> {
    return this.http.get(this.apiConfig.RH.DOWNLOAD_DOCUMENT(id), {
      responseType: 'blob',
      observe: 'response'
    });
  }

  getConfigForType(type: TypeDocument): TypeDocumentConfig | undefined {
    return this.cachedTypes.find(t => t.type === type);
  }

  private mapToDemandeDocument(item: any): DemandeDocument {
    const type = (item?.typeDocument || item?.type || 'ATTESTATION_TRAVAIL') as TypeDocument;
    const config = this.getConfigForType(type);

    return {
      id: item.id,
      type,
      label: config?.label || type,
      statut: this.mapStatut(item.statut || item.status),
      dateCreation: item.createdAt || item.dateCreation || new Date().toISOString(),
      dateMiseAJour: item.updatedAt || item.dateMiseAJour || new Date().toISOString(),
      moisConcerne: item.moisConcerne || item.month,
      motif: item.motif || item.reason,
      commentaireRH: item.commentaireRH || item.commentaireValidateur,
      documentUrl: item.downloadUrl,
      originalFileName: item.originalFileName,
      hasAttachment: !!item.downloadUrl,
      delaiEstime: config?.delaiEstime || '48h'
    };
  }

  private mapStatut(status?: string): DemandeDocument['statut'] {
    switch (status) {
      case 'DEMANDE_RECUE':
      case 'EN_ATTENTE':
      case 'EN_ATTENTE_RH':
      case 'PENDING':
        return 'EN_ATTENTE';
      case 'EN_REVISION':
      case 'EN_COURS':
      case 'VALIDE':
      case 'SIGNE':
      case 'GENERATING':
        return 'EN_COURS';
      case 'ENVOYE':
      case 'APPROUVE':
      case 'APPROUVEE':
      case 'PRET':
      case 'READY':
        return 'PRET';
      case 'REFUSE':
      case 'REFUSEE':
      case 'REJECTED':
        return 'REFUSE';
      case 'ANNULE':
      case 'ANNULEE':
        return 'ANNULE';
      default:
        return 'EN_ATTENTE';
    }
  }
}