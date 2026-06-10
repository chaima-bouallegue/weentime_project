import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfigService } from '../../../core/services/api-config.service';
import { SoldeConge, DemandeConge, NouvelleDemandeRequest, JourFerie, TypeConge } from './models/conge.model';

@Injectable({
  providedIn: 'root'
})
export class CongeService {
  private readonly apiConfig = inject(ApiConfigService);
  private readonly apiUrl = this.apiConfig.buildUrl('/rh');

  constructor(private readonly http: HttpClient) {}

  getSoldes(): Observable<SoldeConge[]> {
    const year = new Date().getFullYear();
    return this.http.get<unknown>(this.apiConfig.RH.GET_SOLDE_CONGES(year)).pipe(
      map(response => this.mapSoldes(this.extractArray(response)))
    );
  }

  getHistorique(): Observable<DemandeConge[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_MY_CONGES).pipe(
      map(response => this.mapDemandes(this.extractArray(response)))
    );
  }

  getJoursFeries(): Observable<JourFerie[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_JOURS_FERIES).pipe(
      map(response => this.extractArray(response).map(item => this.mapJourFerie(item)))
    );
  }

  getTypesConge(): Observable<any[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_TYPE_CONGES).pipe(
      map(response => this.extractArray(response).map(item => this.normalizeTypeConge(item)))
    );
  }

  soumettreDemande(request: NouvelleDemandeRequest): Observable<DemandeConge> {
    const payload = {
      dateDebut: request.dateDebut,
      dateFin: request.dateFin,
      motif: request.motif,
      typeCongeId: request.typeCongeId,
      typeCongeNom: request['label'] as string,
      justificatifFourni: Boolean(request.justificatifFourni || request.justificatif),
      typeDemande: 'CONGE'
    };
    return this.http.post<unknown>(this.apiConfig.RH.CREATE_CONGE, payload).pipe(
      map(item => this.mapDemande(item))
    );
  }

  annulerDemande(id: number): Observable<void> {
    return this.http.patch<void>(this.apiConfig.RH.CANCEL_CONGE(id), {});
  }

  getAllDemandes(): Observable<DemandeConge[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_CONGES).pipe(
      map(response => this.mapDemandes(this.extractArray(response)))
    );
  }

  getManagerDemandes(): Observable<DemandeConge[]> {
    return this.http.get<unknown>(this.apiConfig.RH.GET_MANAGER_CONGES).pipe(
      map(response => this.mapDemandes(this.extractArray(response)))
    );
  }

  validerParManager(id: number): Observable<DemandeConge> {
    return this.http.patch<unknown>(this.apiConfig.RH.VALIDATE_CONGE_MANAGER(id), {}).pipe(
      map(item => this.mapDemande(item))
    );
  }

  validerParRH(id: number): Observable<DemandeConge> {
    return this.http.patch<unknown>(this.apiConfig.RH.VALIDATE_CONGE_RH(id), {}).pipe(
      map(item => this.mapDemande(item))
    );
  }

  rejeterDemande(id: number, commentaire: string): Observable<DemandeConge> {
    return this.http.patch<unknown>(this.apiConfig.RH.REJECT_CONGE_RH(id), { commentaire }).pipe(
      map(item => this.mapDemande(item))
    );
  }

  private extractArray(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }

    const source = (response ?? {}) as Record<string, unknown>;
    const data = source['data'];
    if (Array.isArray(data)) {
      return data;
    }

    const dataObject = (data ?? {}) as Record<string, unknown>;
    if (Array.isArray(dataObject['content'])) {
      return dataObject['content'] as unknown[];
    }
    if (Array.isArray(dataObject['items'])) {
      return dataObject['items'] as unknown[];
    }
    if (Array.isArray(source['content'])) {
      return source['content'] as unknown[];
    }
    if (Array.isArray(source['items'])) {
      return source['items'] as unknown[];
    }

    return [];
  }

  private normalizeTypeConge(source: unknown): Record<string, unknown> {
    const item = (source ?? {}) as Record<string, unknown>;
    const joursMax = item['joursMax'] ?? item['maxJours'] ?? item['maxDays'] ?? item['nombreJoursMax'];
    const decompterJours = item['decompterJours'] ?? item['decompteJours'];
    const justificatifExige = item['justificatifExige'] ?? item['requireJustificatif'];
    return {
      ...item,
      libelle: String(item['libelle'] ?? ''),
      nombreJoursMax: joursMax,
      joursMax,
      decompteJours: Boolean(decompterJours),
      decompterJours: Boolean(decompterJours),
      requireJustificatif: Boolean(justificatifExige),
      justificatifExige: Boolean(justificatifExige)
    };
  }

  private mapDemandes(items: unknown[]): DemandeConge[] {
    return items.map(item => this.mapDemande(item));
  }

  private mapDemande(source: unknown): DemandeConge {
    const item = (source ?? {}) as Record<string, unknown>;
    const typeCongeNom = String(item['typeCongeNom'] ?? item['label'] ?? 'Conges');
    const type = this.resolveType(item['type'] ?? item['typeCongeNom'] ?? typeCongeNom);
    return {
      id: Number(item['id'] ?? 0),
      utilisateurId: this.optionalNumber(item['utilisateurId']),
      userName: item['userName'] as string | undefined,
      userEmail: item['userEmail'] as string | undefined,
      managerId: this.optionalNumber(item['managerId']),
      managerName: item['managerName'] as string | undefined,
      type,
      label: typeCongeNom,
      dateDebut: String(item['dateDebut'] ?? ''),
      dateFin: String(item['dateFin'] ?? ''),
      nombreJours: Number(item['nombreJours'] ?? 0),
      motif: String(item['motif'] ?? ''),
      commentaire: item['commentaire'] as string | undefined,
      commentaireManager: (item['commentaireManager'] ?? item['commentaireValidateur']) as string | undefined,
      commentaireValidateur: item['commentaireValidateur'] as string | undefined,
      statut: this.normalizeStatus(item['statut']),
      dateCreation: String(item['dateCreation'] ?? item['createdAt'] ?? ''),
      typeCongeId: this.optionalNumber(item['typeCongeId']),
      typeCongeNom,
      justificatifFourni: item['justificatifFourni'] as boolean | undefined
    };
  }

  private mapSoldes(items: unknown[]): SoldeConge[] {
    return items.map(item => {
      const source = (item ?? {}) as Record<string, unknown>;
      const type = this.resolveType(source['typeCongeNom'] ?? source['label'] ?? source['type'] ?? 'ANNUEL');
      const total = Number(source['joursAcquis'] ?? source['total'] ?? 0);
      const pris = Number(source['joursUtilises'] ?? source['pris'] ?? 0);
      const enAttente = Number(source['joursEnAttente'] ?? source['enAttente'] ?? 0);
      const joursRestants = Number(source['joursRestants'] ?? source['disponible'] ?? Math.max(total - pris, 0));
      return {
        type,
        label: String(source['typeCongeNom'] ?? source['label'] ?? this.getLabelForType(type)),
        total,
        pris,
        enAttente,
        disponible: Math.max(joursRestants - enAttente, 0),
        couleur: '#6366f1',
        icone: 'umbrella',
        typeCongeId: this.optionalNumber(source['typeCongeId'])
      };
    });
  }

  private mapJourFerie(source: unknown): JourFerie {
    const item = (source ?? {}) as Record<string, unknown>;
    return {
      date: String(item['date'] ?? ''),
      label: String(item['label'] ?? item['nom'] ?? item['libelle'] ?? 'Jour ferie')
    };
  }

  private resolveType(value: unknown): TypeConge {
    const raw = String(value ?? '').toUpperCase();
    if (raw.includes('MALAD')) return 'MALADIE';
    if (raw.includes('RTT')) return 'RTT';
    if (raw.includes('SANS')) return 'SANS_SOLDE';
    if (raw.includes('MATERN')) return 'MATERNITE_PATERNITE';
    if (raw.includes('EXCEPTION')) return 'EXCEPTIONNEL';
    return 'ANNUEL';
  }

  private optionalNumber(value: unknown): number | undefined {
    if (value == null || value === '') {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isNaN(numeric) ? undefined : numeric;
  }

  private normalizeStatus(value: unknown): DemandeConge['statut'] {
    const status = String(value ?? 'EN_ATTENTE_MANAGER').toUpperCase();
    if (['PRET', 'APPROUVE', 'APPROUVEE', 'VALIDEE', 'VALIDE', 'SIGNE', 'ENVOYE'].includes(status)) {
      return 'APPROUVE';
    }
    if (['REFUSE', 'REFUSEE', 'REJETEE'].includes(status)) {
      return 'REFUSE';
    }
    if (['ANNULE', 'ANNULEE', 'CANCELLED'].includes(status)) {
      return 'ANNULE';
    }
    if (['EN_ATTENTE', 'EN_ATTENTE_RH', 'PENDING_RH'].includes(status)) {
      return 'EN_ATTENTE_RH';
    }
    if (['PENDING_MANAGER', 'APPROVED_MANAGER'].includes(status)) {
      return 'EN_ATTENTE_MANAGER';
    }
    return status as DemandeConge['statut'];
  }

  private getLabelForType(type: TypeConge): string {
    const labels: Record<TypeConge, string> = {
      ANNUEL: 'Conges Annuels',
      MALADIE: 'Conges Maladie',
      SANS_SOLDE: 'Sans Solde',
      MATERNITE_PATERNITE: 'Maternite/Paternite',
      EXCEPTIONNEL: 'Conge Exceptionnel',
      RTT: 'RTT'
    };
    return labels[type];
  }
}
