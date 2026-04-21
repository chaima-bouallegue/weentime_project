import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

  private typesDisponibles: TypeDocumentConfig[] = [
    {
      type: 'ATTESTATION_TRAVAIL',
      label: 'Attestation de travail',
      description: "Confirme votre emploi actuel dans l'entreprise",
      icone: 'file-check',
      couleur: '#6366f1',
      delaiEstime: '24h',
      requiresMois: false
    },
    {
      type: 'BULLETIN_PAIE',
      label: 'Bulletin de paie',
      description: 'Bulletin de salaire pour un mois selectionne',
      icone: 'receipt',
      couleur: '#10b981',
      delaiEstime: '48h',
      requiresMois: true
    },
    {
      type: 'ATTESTATION_SALAIRE',
      label: 'Attestation de salaire',
      description: "Montant brut et net certifie par l'employeur",
      icone: 'banknote',
      couleur: '#059669',
      delaiEstime: '24h',
      requiresMois: false
    },
    {
      type: 'CONTRAT_TRAVAIL',
      label: 'Contrat de travail',
      description: 'Copie certifiee de votre contrat signe',
      icone: 'file-signature',
      couleur: '#8b5cf6',
      delaiEstime: '72h',
      requiresMois: false
    },
    {
      type: 'CERTIFICAT_CONGE',
      label: 'Certificat de conge',
      description: 'Attestation de la periode de conge approuvee',
      icone: 'umbrella',
      couleur: '#3b82f6',
      delaiEstime: '24h',
      requiresMois: false
    },
    {
      type: 'ATTESTATION_ANCIENNETE',
      label: "Attestation d'anciennete",
      description: "Confirme votre duree de service dans l'entreprise",
      icone: 'award',
      couleur: '#f59e0b',
      delaiEstime: '24h',
      requiresMois: false
    },
    {
      type: 'FICHE_POSTE',
      label: 'Fiche de poste',
      description: 'Description officielle de votre poste actuel',
      icone: 'briefcase',
      couleur: '#64748b',
      delaiEstime: '48h',
      requiresMois: false
    }
  ];

  getTypesDisponibles(): Observable<TypeDocumentConfig[]> {
    return of([...this.typesDisponibles]);
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

  annulerDemande(id: number): Observable<void> {
    return this.http.put(this.apiConfig.RH.CANCEL_DOCUMENT(id), {}).pipe(
      map(() => undefined),
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

  telechargerDocument(id: number): Observable<Blob> {
    return this.http.get(this.apiConfig.RH.DOWNLOAD_DOCUMENT(id), { responseType: 'blob' });
  }

  getConfigForType(type: TypeDocument): TypeDocumentConfig | undefined {
    return this.typesDisponibles.find(t => t.type === type);
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
      // Statuts annulables côté backend → EN_ATTENTE (bouton Annuler visible)
      case 'EN_ATTENTE':
        return 'EN_ATTENTE';
      case 'EN_ATTENTE_RH':
        return 'EN_ATTENTE';   // ← CORRIGÉ : était 'EN_COURS', empêchait l'annulation
      // Statuts non annulables
      case 'APPROUVEE':
        return 'PRET';
      case 'EN_COURS':
        return 'EN_COURS';
      case 'REFUSEE':
        return 'REFUSE';
      case 'ANNULEE':
        return 'ANNULE';
      default:
        return 'EN_ATTENTE';
    }
  }
}