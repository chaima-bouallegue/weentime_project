import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, delay, catchError, map, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SoldeConge, DemandeConge, NouvelleDemandeRequest, JourFerie, TypeConge } from './models/conge.model';

@Injectable({
  providedIn: 'root'
})
export class CongeService {
  private readonly apiUrl = `${environment.apiUrl}/api/v1/rh`;

  constructor(private readonly http: HttpClient) {}

  private soldes: SoldeConge[] = [
    {
      type: 'ANNUEL',
      label: 'Congés Annuels',
      total: 30,
      pris: 12,
      enAttente: 2,
      disponible: 16,
      couleur: '#6366f1',
      icone: 'umbrella'
    },
    {
      type: 'MALADIE',
      label: 'Congés Maladie',
      total: 5,
      pris: 1,
      enAttente: 0,
      disponible: 4,
      couleur: '#f59e0b',
      icone: 'heart'
    },
    {
      type: 'RTT',
      label: 'RTT',
      total: 8,
      pris: 4,
      enAttente: 1,
      disponible: 3,
      couleur: '#10b981',
      icone: 'clock'
    },
    {
      type: 'EXCEPTIONNEL',
      label: 'Exceptionnel',
      total: 3,
      pris: 0,
      enAttente: 0,
      disponible: 3,
      couleur: '#f97316',
      icone: 'star'
    }
  ];

  private historique: DemandeConge[] = [
    {
      id: 1,
      type: 'ANNUEL',
      label: 'Congés Annuels',
      dateDebut: '2026-06-15',
      dateFin: '2026-06-25',
      nombreJours: 9,
      motif: 'Vacances d\'été en famille',
      statut: 'EN_ATTENTE',
      dateCreation: '2026-03-10'
    },
    {
      id: 2,
      type: 'RTT',
      label: 'RTT',
      dateDebut: '2026-04-10',
      dateFin: '2026-04-10',
      nombreJours: 1,
      motif: 'Rendez-vous administratif',
      statut: 'APPROUVE',
      dateCreation: '2026-03-05'
    },
    {
      id: 3,
      type: 'MALADIE',
      label: 'Congés Maladie',
      dateDebut: '2026-02-12',
      dateFin: '2026-02-13',
      nombreJours: 2,
      motif: 'Grippe saisonnière',
      statut: 'APPROUVE',
      dateCreation: '2026-02-11'
    },
    {
      id: 4,
      type: 'ANNUEL',
      label: 'Congés Annuels',
      dateDebut: '2025-12-24',
      dateFin: '2026-01-02',
      nombreJours: 7,
      motif: 'Fêtes de fin d\'année',
      statut: 'APPROUVE',
      dateCreation: '2025-12-01'
    },
    {
      id: 5,
      type: 'EXCEPTIONNEL',
      label: 'Congé exceptionnel',
      dateDebut: '2026-01-20',
      dateFin: '2026-01-22',
      nombreJours: 3,
      motif: 'Événement familial',
      statut: 'REFUSE',
      dateCreation: '2026-01-05',
      commentaireManager: 'Période de forte activité sur le projet X.'
    },
    {
      id: 6,
      type: 'SANS_SOLDE',
      label: 'Sans Solde',
      dateDebut: '2026-02-01',
      dateFin: '2026-02-05',
      nombreJours: 5,
      motif: 'Projet personnel',
      statut: 'ANNULE',
      dateCreation: '2026-01-15'
    }
  ];

  private joursFeries: JourFerie[] = [
    { date: '2026-01-01', label: 'Jour de l\'an' },
    { date: '2026-01-14', label: 'Fête de la Révolution' },
    { date: '2026-03-20', label: 'Fête de l\'Indépendance' },
    { date: '2026-03-21', label: 'Aïd al-Fitr' },
    { date: '2026-03-22', label: 'Aïd al-Fitr (Suite)' },
    { date: '2026-04-09', label: 'Fête des Martyrs' },
    { date: '2026-05-01', label: 'Fête du Travail' },
    { date: '2026-05-27', label: 'Aïd al-Adha' },
    { date: '2026-05-28', label: 'Aïd al-Adha (Suite)' },
    { date: '2026-06-16', label: 'Nouvel an Hégire' },
    { date: '2026-07-25', label: 'Fête de la République' },
    { date: '2026-08-13', label: 'Fête de la Femme' },
    { date: '2026-08-25', label: 'Mouled' },
    { date: '2026-10-15', label: 'Fête de l\'Évacuation' }
  ];

  getSoldes(): Observable<SoldeConge[]> {
    const year = new Date().getFullYear();
    return this.http.get<unknown[]>(`${this.apiUrl}/solde-conges/me/all?annee=${year}`).pipe(
      map(items => this.mapSoldes(items)),
      catchError(() => of([...this.soldes]).pipe(delay(250)))
    );
  }

  getHistorique(): Observable<DemandeConge[]> {
    return this.http.get<unknown[]>(`${this.apiUrl}/conges/me`).pipe(
      map(items => this.mapDemandes(items)),
      tap(items => this.historique = items.length ? items : this.historique),
      catchError(() => of([...this.historique]).pipe(delay(250)))
    );
  }

  getJoursFeries(): Observable<JourFerie[]> {
    return of([...this.joursFeries]).pipe(delay(300));
  }

  soumettreDemande(request: NouvelleDemandeRequest): Observable<DemandeConge> {
    const payload = {
      dateDebut: request.dateDebut,
      dateFin: request.dateFin,
      motif: request.motif,
      typeCongeId: request.typeCongeId ?? this.typeToId(request.type),
      typeCongeNom: this.getLabelForType(request.type),
      typeDemande: 'CONGE'
    };
    return this.http.post<unknown>(`${this.apiUrl}/conges`, payload).pipe(
      map(item => this.mapDemande(item)),
      tap(item => this.historique = [item, ...this.historique.filter(existing => existing.id !== item.id)])
    );
  }

  annulerDemande(id: number): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/conges/${id}/cancel`, {}).pipe(
      tap(() => this.applyLocalCancel(id))
    );
  }

  getAllDemandes(): Observable<DemandeConge[]> {
    return this.http.get<unknown[]>(`${this.apiUrl}/conges`).pipe(
      map(items => this.mapDemandes(items)),
      catchError(() => of([...this.historique]).pipe(delay(250)))
    );
  }

  getManagerDemandes(): Observable<DemandeConge[]> {
    return this.http.get<unknown[]>(`${this.apiUrl}/conges/manager`).pipe(
      map(items => this.mapDemandes(items)),
      catchError(() => of([...this.historique]).pipe(delay(250)))
    );
  }

  validerParManager(id: number): Observable<DemandeConge> {
    return this.http.patch<unknown>(`${this.apiUrl}/conges/${id}/valider`, {}).pipe(
      map(item => this.mapDemande(item)),
      catchError(() => this.updateLocalStatus(id, 'EN_ATTENTE_RH'))
    );
  }

  validerParRH(id: number): Observable<DemandeConge> {
    return this.http.patch<unknown>(`${this.apiUrl}/conges/${id}/valider-rh`, {}).pipe(
      map(item => this.mapDemande(item)),
      catchError(() => this.updateLocalStatus(id, 'APPROUVE'))
    );
  }

  rejeterDemande(id: number, commentaire: string): Observable<DemandeConge> {
    return this.http.patch<unknown>(`${this.apiUrl}/conges/${id}/refuser`, { commentaire }).pipe(
      map(item => this.mapDemande(item)),
      catchError(() => this.updateLocalStatus(id, 'REFUSE', commentaire))
    );
  }

  private createLocalDemande(request: NouvelleDemandeRequest): Observable<DemandeConge> {
    const nouvelle: DemandeConge = {
      id: Math.max(...this.historique.map(h => h.id)) + 1,
      ...request,
      label: this.getLabelForType(request.type),
      statut: 'EN_ATTENTE_MANAGER',
      nombreJours: this.calculateBusinessDays(request.dateDebut, request.dateFin),
      dateCreation: new Date().toISOString().split('T')[0]
    };

    this.historique = [nouvelle, ...this.historique];

    // Simuler mise à jour des soldes
    const solde = this.soldes.find(s => s.type === request.type);
    if (solde) {
      solde.enAttente += nouvelle.nombreJours;
      solde.disponible -= nouvelle.nombreJours;
    }

    return of(nouvelle).pipe(delay(800));
  }

  private applyLocalCancel(id: number): void {
    const index = this.historique.findIndex(h => h.id === id);
    if (index !== -1) {
      const demande = this.historique[index];
      demande.statut = 'ANNULE';

      // Simuler remise à jour des soldes
      const solde = this.soldes.find(s => s.type === demande.type);
      if (solde) {
        solde.enAttente -= demande.nombreJours;
        solde.disponible += demande.nombreJours;
      }
    }
  }

  private updateLocalStatus(id: number, statut: DemandeConge['statut'], commentaire?: string): Observable<DemandeConge> {
    const existing = this.historique.find(item => item.id === id);
    const fallback: DemandeConge = existing ?? this.historique[0] ?? {
      id,
      type: 'ANNUEL',
      label: 'Conges',
      dateDebut: '',
      dateFin: '',
      nombreJours: 0,
      motif: '',
      statut: 'EN_ATTENTE_MANAGER',
      dateCreation: ''
    };
    const updated: DemandeConge = {
      ...fallback,
      id,
      statut,
      commentaireManager: commentaire ?? existing?.commentaireManager,
      commentaire: commentaire ?? existing?.commentaire
    };
    this.historique = this.historique.map(item => item.id === id ? updated : item);
    return of(updated).pipe(delay(250));
  }

  private mapDemandes(items: unknown[]): DemandeConge[] {
    return Array.isArray(items) ? items.map(item => this.mapDemande(item)) : [];
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
    if (!Array.isArray(items) || items.length === 0) {
      return [...this.soldes];
    }
    return items.map(item => {
      const source = (item ?? {}) as Record<string, unknown>;
      const type = this.resolveType(source['typeCongeNom'] ?? source['type'] ?? 'ANNUEL');
      const total = Number(source['joursAcquis'] ?? source['total'] ?? 0);
      const pris = Number(source['joursUtilises'] ?? source['pris'] ?? 0);
      const enAttente = Number(source['joursEnAttente'] ?? source['enAttente'] ?? 0);
      return {
        type,
        label: String(source['typeCongeNom'] ?? this.getLabelForType(type)),
        total,
        pris,
        enAttente,
        disponible: Number(source['joursRestants'] ?? source['disponible'] ?? Math.max(total - pris - enAttente, 0)),
        couleur: '#6366f1',
        icone: 'umbrella'
      };
    });
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
    return value == null ? undefined : Number(value);
  }

  private normalizeStatus(value: unknown): DemandeConge['statut'] {
    const status = String(value ?? 'EN_ATTENTE_MANAGER');
    if (status === 'APPROUVEE') return 'APPROUVE';
    if (status === 'REFUSEE') return 'REFUSE';
    if (status === 'ANNULEE') return 'ANNULE';
    return status as DemandeConge['statut'];
  }

  private typeToId(type: TypeConge): number {
    const map: Record<TypeConge, number> = {
      ANNUEL: 1,
      MALADIE: 2,
      SANS_SOLDE: 3,
      MATERNITE_PATERNITE: 4,
      EXCEPTIONNEL: 5,
      RTT: 6
    };
    return map[type];
  }

  private getLabelForType(type: TypeConge): string {
    const labels: Record<TypeConge, string> = {
      ANNUEL: 'Congés Annuels',
      MALADIE: 'Congés Maladie',
      SANS_SOLDE: 'Sans Solde',
      MATERNITE_PATERNITE: 'Maternité/Paternité',
      EXCEPTIONNEL: 'Congé Exceptionnel',
      RTT: 'RTT'
    };
    return labels[type];
  }

  private calculateBusinessDays(startStr: string, endStr: string): number {
    const start = new Date(startStr);
    const end = new Date(endStr);
    let count = 0;
    const cur = new Date(start);

    while (cur <= end) {
      const day = cur.getDay();
      const isWeekend = day === 0 || day === 6;
      const dateStr = cur.toISOString().split('T')[0];
      const isHoliday = this.joursFeries.some(jh => jh.date === dateStr);

      if (!isWeekend && !isHoliday) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }
}
