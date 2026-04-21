import { Injectable, inject } from '@angular/core';
import { Observable, throwError, catchError, map } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  DemandeDocumentRH,
  StatsDocuments,
  AIGenerationResult
} from './models/rh-document.model';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RhDocumentService {
  private http = inject(HttpClient);
  private readonly API = `${environment.apiUrl}/api/v1/documents`;

  getDemandesEntreprise(): Observable<DemandeDocumentRH[]> {
    return this.http.get<unknown>(`${this.API}/rh/demandes`).pipe(
      map(response => this.unwrapCollection(response).map(d => this.mapToFrontend(d))),
      catchError(err => throwError(() => err))
    );
  }

  getStats(): Observable<StatsDocuments> {
    return this.http.get<unknown>(`${this.API}/rh/stats`).pipe(
      map(response => this.unwrapItem(response) as StatsDocuments),
      catchError(err => throwError(() => err))
    );
  }

  passerEnCours(id: number): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(`${this.API}/${id}/passer-en-cours`, {}).pipe(
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
    return this.http.put<unknown>(`${this.API}/${id}/valider`, data).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  refuser(id: number, commentaireRH: string): Observable<DemandeDocumentRH> {
    return this.http.put<unknown>(`${this.API}/${id}/refuser`, { commentaireRH }).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  uploadAndValidate(id: number, file: File): Observable<DemandeDocumentRH> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<unknown>(`${this.API}/${id}/upload`, formData).pipe(
      map(response => this.mapToFrontend(this.unwrapItem(response))),
      catchError(err => throwError(() => err))
    );
  }

  getDocumentFile(id: number): Observable<Blob> {
    return this.http.get(`${this.API}/${id}/file`, {
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

    return this.http.post<AIGenerationResult>(`${this.API}/rh/generate-ai`, body).pipe(
      catchError(() => {
        // Fallback to mock on error
        return new Observable<AIGenerationResult>(observer => {
          this.mockAIGeneration(demande, observer);
        });
      })
    );
  }


  private mockAIGeneration(demande: DemandeDocumentRH, observer: any) {
    const mockContent = `WEENTIME\nService des Ressources Humaines\n\nOBJET : ${demande.label.toUpperCase()}\n\nNous soussignés, société WeenTime, certifions que M./Mme ${demande.employe.prenom} ${demande.employe.nom}, demeurant à l'adresse connue de nos services, est employé(e) au sein de notre établissement depuis le ${demande.employe.dateEntree} en qualité de ${demande.employe.poste}.\n\nL'intéressé(e) exerce ses fonctions au sein du département ${demande.employe.departement}.\n\nCette attestation est délivrée à la demande de l'intéressé(e) pour servir et valoir ce que de droit.\n\nFait à Paris, le ${new Date().toLocaleDateString('fr-FR')}\n\nLa Direction des Ressources Humaines`;
    
    setTimeout(() => {
      observer.next({
        contenu: mockContent,
        type: demande.type,
        employeNom: `${demande.employe.prenom} ${demande.employe.nom}`,
        dateGeneration: new Date().toISOString()
      });
      observer.complete();
    }, 2000);
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
