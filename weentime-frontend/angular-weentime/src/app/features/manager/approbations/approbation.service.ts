import { DestroyRef, Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { ToastService } from '@app/core/services/toast.service';

export interface Demande {
  id: number;
  utilisateurId: number;
  type: 'CONGE' | 'ABSENCE' | 'TELETRAVAIL' | 'AUTORISATION' | 'DOCUMENT';
  statut: 'EN_ATTENTE_MANAGER' | 'EN_ATTENTE_RH' | 'APPROUVEE' | 'REFUSEE' | 'ANNULEE';
  dateCreation: string;
  dateDebut?: string;
  dateFin?: string;
  description?: string;
  nombreJours?: number;
  raison?: string;
  utilisateur?: {
    id: number;
    nom: string;
    prenom: string;
    fullName?: string;
    email: string;
  };
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

interface ApiPage<T> {
  content?: T[];
  totalElements?: number;
}

interface BaseDemandeDto {
  id: number;
  utilisateurId: number;
  utilisateur?: UserProfileDto | null;
  manager?: UserProfileDto | null;
  statut: Demande['statut'];
  motif?: string;
  commentaire?: string;
  createdAt?: string;
  dateCreation?: string;
  dateDebut?: string;
  dateFin?: string;
  nombreJours?: number;
  heureDebut?: string;
  heureFin?: string;
  duree?: number;
  typeAutorisation?: string;
  typeDocument?: string;
  typeDemande?: Demande['type'];
}

interface UserProfileDto {
  id: number;
  nom?: string;
  prenom?: string;
  fullName?: string;
  email?: string;
  poste?: string;
  departement?: string;
}

interface CongeDto extends BaseDemandeDto {
  nombreJours?: number;
}

interface AbsenceDto extends BaseDemandeDto {}

interface TeletravailDto extends BaseDemandeDto {
  nombreJours?: number;
}

interface AutorisationDto extends BaseDemandeDto {
  typeAutorisation?: string;
}

interface DocumentDto extends BaseDemandeDto {
  typeDocument?: string;
}

interface ApprobationResponse {
  success: boolean;
  data: Demande;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApprobationService {
  private readonly httpClient = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pendingApprobationsSignal = signal<Demande[]>([]);
  readonly forwardedDemandesSignal = signal<Demande[]>([]);
  readonly approbedDemandesSignal = signal<Demande[]>([]);
  readonly rejectedDemandesSignal = signal<Demande[]>([]);
  readonly loadingSignal = signal(false);
  readonly currentApprobationSignal = signal<Demande | null>(null);

  readonly currentPageSignal = signal(0);
  readonly pageSizeSignal = signal(20);
  readonly totalElementsSignal = signal(0);

  readonly totalPendingCount = computed(() => this.pendingApprobationsSignal().length);

  readonly pendingByType = computed(() => {
    const pending = this.pendingApprobationsSignal();
    return {
      conges: pending.filter((d) => d.type === 'CONGE').length,
      absences: pending.filter((d) => d.type === 'ABSENCE').length,
      teletravails: pending.filter((d) => d.type === 'TELETRAVAIL').length,
      autorisations: pending.filter((d) => d.type === 'AUTORISATION').length,
      documents: pending.filter((d) => d.type === 'DOCUMENT').length
    };
  });

  loadPendingApprobations(page: number = 0, pageSize: number = 20): void {
    this.currentPageSignal.set(page);
    this.pageSizeSignal.set(pageSize);
    this.refreshBuckets();
  }

  loadApprovedDemandes(): void {
    this.refreshBuckets();
  }

  loadForwardedDemandes(): void {
    this.refreshBuckets();
  }

  loadRejectedDemandes(): void {
    this.refreshBuckets();
  }

  refreshBuckets(): void {
    this.loadingSignal.set(true);
    const params = this.buildPageParams(0, 100).set('sort', 'dateCreation,desc');

    this.httpClient.get<ApiResponse<ApiPage<BaseDemandeDto>>>(this.apiConfig.RH.GET_MANAGER_ALL_DEMANDS, { params })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const data = response?.data;
          const content = Array.isArray(data?.content) ? data.content : [];
          const demandes = this.sortDemandes(content.map((dto) => this.mapPendingDemande(dto)));

          this.pendingApprobationsSignal.set(demandes.filter((item) => item.statut === 'EN_ATTENTE_MANAGER'));
          this.forwardedDemandesSignal.set(demandes.filter((item) => item.statut === 'EN_ATTENTE_RH'));
          this.approbedDemandesSignal.set(demandes.filter((item) => item.statut === 'APPROUVEE'));
          this.rejectedDemandesSignal.set(demandes.filter((item) => item.statut === 'REFUSEE'));
          this.totalElementsSignal.set(demandes.filter((item) => item.statut === 'EN_ATTENTE_MANAGER').length);
          this.loadingSignal.set(false);
        },
        error: () => {
          this.pendingApprobationsSignal.set([]);
          this.forwardedDemandesSignal.set([]);
          this.approbedDemandesSignal.set([]);
          this.rejectedDemandesSignal.set([]);
          this.totalElementsSignal.set(0);
          this.loadingSignal.set(false);
          this.toastService.error('Erreur lors du chargement des demandes manager');
        }
      });
  }

  getDemande(type: string, id: number): Observable<ApprobationResponse> {
    const request = this.getRequestConfig(type, id);

    return this.httpClient.get<ApiResponse<unknown>>(request.detailPath).pipe(
      map((response) => {
        const demande = this.mapResponseDemande(type, response?.data);
        if (!demande) {
          throw new Error('Demande introuvable');
        }
        return {
          success: response?.success ?? true,
          data: demande,
          message: response?.message
        };
      }),
      tap((response) => this.currentApprobationSignal.set(response.data)),
      catchError((error) => {
        this.toastService.error('Erreur lors du chargement de la demande');
        return of({
          success: false,
          data: null as unknown as Demande,
          message: error?.message
        });
      })
    );
  }

  approveDemande(type: string, id: number, commentaire: string = ''): Observable<ApprobationResponse> {
    return this.sendDecision(type, id, true, commentaire).pipe(
      tap((response) => {
        if (response.success) {
          if (response.data?.statut === 'EN_ATTENTE_RH') {
            this.toastService.success('Demande transmise aux RH');
            this.forwardedDemandesSignal.update((items) => this.sortDemandes([response.data, ...items.filter(item => item.id !== id)]));
          } else {
            this.toastService.success('Demande approuvee avec succes');
            this.approbedDemandesSignal.update((items) => this.sortDemandes([response.data, ...items.filter(item => item.id !== id)]));
          }
          this.pendingApprobationsSignal.update((pending) => pending.filter((demande) => demande.id !== id));
        }
      }),
      catchError((error) => {
        this.toastService.error("Erreur lors de l'approbation de la demande");
        return throwError(() => error);
      })
    );
  }

  rejectDemande(type: string, id: number, commentaire: string = ''): Observable<ApprobationResponse> {
    return this.sendDecision(type, id, false, commentaire).pipe(
      tap((response) => {
        if (response.success) {
          this.toastService.success('Demande refusee');
          this.pendingApprobationsSignal.update((pending) => pending.filter((demande) => demande.id !== id));
          this.rejectedDemandesSignal.update((items) => this.sortDemandes([response.data, ...items.filter(item => item.id !== id)]));
        }
      }),
      catchError((error) => {
        this.toastService.error('Erreur lors du refus de la demande');
        return throwError(() => error);
      })
    );
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      CONGE: 'Conge',
      ABSENCE: 'Absence',
      TELETRAVAIL: 'Teletravail',
      AUTORISATION: 'Autorisation',
      DOCUMENT: 'Document'
    };

    return labels[type] || type;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      EN_ATTENTE_MANAGER: "En attente d'approbation",
      EN_ATTENTE_RH: 'En attente RH',
      APPROUVEE: 'Approuvee',
      REFUSEE: 'Refusee',
      ANNULEE: 'Annulee'
    };

    return labels[status] || status;
  }

  private loadDemandesByStatus(
    status: Demande['statut'],
    targetSignal: WritableSignal<Demande[]>,
    errorMessage: string
  ): void {
    this.loadingSignal.set(true);
    const params = this.buildPageParams(0, 100);

    forkJoin([
      this.fetchDemandesPage<CongeDto>('/conges/manager', 'CONGE', params, (dto) => this.mapConge(dto)),
      this.fetchDemandesPage<AbsenceDto>('/absences/manager', 'ABSENCE', params, (dto) => this.mapAbsence(dto)),
      this.fetchDemandesPage<TeletravailDto>('/rh/teletravails/demandes-equipe', 'TELETRAVAIL', params, (dto) => this.mapTeletravail(dto)),
      this.fetchDemandesPage<AutorisationDto>('/autorisations/manager', 'AUTORISATION', params, (dto) => this.mapAutorisation(dto)),
      this.fetchDemandesPage<DocumentDto>('/documents/manager', 'DOCUMENT', params, (dto) => this.mapDocument(dto))
    ]).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (pages) => {
        targetSignal.set(
          this.sortDemandes(
            pages.flatMap((pageData) => pageData.items.filter((demande) => demande.statut === status))
          )
        );
        this.loadingSignal.set(false);
      },
      error: () => {
        this.toastService.error(errorMessage);
        targetSignal.set([]);
        this.loadingSignal.set(false);
      }
    });
  }

  private fetchDemandesPage<T>(
    path: string,
    type: Demande['type'],
    params: HttpParams,
    mapper: (dto: T) => Demande
  ): Observable<{ items: Demande[]; totalElements: number }> {
    return this.httpClient.get<ApiResponse<ApiPage<T>>>(`${this.apiConfig.getApiBase()}${path}`, { params }).pipe(
      map((response) => {
        const data = response?.data;
        const content = Array.isArray(data?.content) ? data.content : [];
        return {
          items: content.map((item) => mapper(item)),
          totalElements: data?.totalElements ?? content.length
        };
      }),
      catchError(() => of({ items: [] as Demande[], totalElements: 0 }))
    );
  }

  private sendDecision(
    type: string,
    id: number,
    approved: boolean,
    commentaire: string
  ): Observable<ApprobationResponse> {
    const url = `${this.apiConfig.getApiBase()}/demandes/${id}/statut`;
    return this.httpClient.put<ApiResponse<unknown>>(url, {
      typeDemande: type,
      statut: approved ? 'APPROUVEE' : 'REFUSEE',
      commentaire
    }).pipe(
      map((response) => {
        const demande = this.mapResponseDemande(type, response?.data);
        if (!demande) {
          throw new Error('Reponse invalide');
        }
        return {
          success: response?.success ?? true,
          data: demande,
          message: response?.message
        };
      })
    );
  }

  private getRequestConfig(type: string, id: number): {
    detailPath: string;
    approvePath: string;
    rejectPath: string;
    approveMode: 'body' | 'query';
    rejectMode: 'body' | 'query';
  } {
    switch (type) {
      case 'ABSENCE':
        return {
          detailPath: `${this.apiConfig.getApiBase()}/absences/${id}`,
          approvePath: `/absences/${id}/validate/manager`,
          rejectPath: `/absences/${id}/reject`,
          approveMode: 'query',
          rejectMode: 'query'
        };
      case 'TELETRAVAIL':
        return {
          detailPath: `${this.apiConfig.getApiBase()}/rh/teletravails/${id}`,
          approvePath: `/rh/teletravails/${id}/valider-manager`,
          rejectPath: `/rh/teletravails/${id}/rejeter-manager`,
          approveMode: 'body',
          rejectMode: 'body'
        };
      case 'AUTORISATION':
        return {
          detailPath: `${this.apiConfig.getApiBase()}/autorisations/${id}`,
          approvePath: `/autorisations/${id}/validate/manager`,
          rejectPath: `/autorisations/${id}/reject`,
          approveMode: 'query',
          rejectMode: 'query'
        };
      case 'DOCUMENT':
        return {
          detailPath: `${this.apiConfig.getApiBase()}/documents/${id}`,
          approvePath: `/documents/${id}/validate/manager`,
          rejectPath: `/documents/${id}/reject`,
          approveMode: 'query',
          rejectMode: 'query'
        };
      case 'CONGE':
      default:
        return {
          detailPath: `${this.apiConfig.getApiBase()}/conges/${id}`,
          approvePath: `/conges/${id}/valider`,
          rejectPath: `/conges/${id}/refuser`,
          approveMode: 'body',
          rejectMode: 'body'
        };
    }
  }

  private mapResponseDemande(type: string, payload: unknown): Demande | null {
    if (!payload) {
      return null;
    }

    switch (type) {
      case 'ABSENCE':
        return this.mapAbsence(payload as AbsenceDto);
      case 'TELETRAVAIL':
        return this.mapTeletravail(payload as TeletravailDto);
      case 'AUTORISATION':
        return this.mapAutorisation(payload as AutorisationDto);
      case 'DOCUMENT':
        return this.mapDocument(payload as DocumentDto);
      case 'CONGE':
      default:
        return this.mapConge(payload as CongeDto);
    }
  }

  private mapResponseDemandeFromPath(path: string, payload: unknown): Demande | null {
    if (path.startsWith('/absences/')) {
      return this.mapAbsence(payload as AbsenceDto);
    }
    if (path.startsWith('/rh/teletravails/')) {
      return this.mapTeletravail(payload as TeletravailDto);
    }
    if (path.startsWith('/autorisations/')) {
      return this.mapAutorisation(payload as AutorisationDto);
    }
    if (path.startsWith('/documents/')) {
      return this.mapDocument(payload as DocumentDto);
    }
    return this.mapConge(payload as CongeDto);
  }

  private mapConge(dto: CongeDto): Demande {
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type: 'CONGE',
      statut: dto.statut,
      dateCreation: dto.createdAt || '',
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin,
      nombreJours: dto.nombreJours,
      description: dto.motif,
      raison: dto.motif,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId)
    };
  }

  private mapPendingDemande(dto: BaseDemandeDto): Demande {
    const type = dto.typeDemande || 'CONGE';
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type,
      statut: dto.statut,
      dateCreation: dto.createdAt || dto.dateCreation || '',
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin,
      nombreJours: dto.nombreJours,
      description: dto.typeDocument || dto.typeAutorisation || dto.motif || dto.commentaire,
      raison: dto.motif || dto.commentaire,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId)
    };
  }

  private mapAbsence(dto: AbsenceDto): Demande {
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type: 'ABSENCE',
      statut: dto.statut,
      dateCreation: dto.createdAt || '',
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin,
      nombreJours: this.calculateDaysInclusive(dto.dateDebut, dto.dateFin),
      description: dto.motif,
      raison: dto.motif,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId)
    };
  }

  private mapTeletravail(dto: TeletravailDto): Demande {
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type: 'TELETRAVAIL',
      statut: dto.statut,
      dateCreation: dto.createdAt || '',
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin,
      nombreJours: dto.nombreJours ?? this.calculateDaysInclusive(dto.dateDebut, dto.dateFin),
      description: dto.motif,
      raison: dto.motif,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId)
    };
  }

  private mapAutorisation(dto: AutorisationDto): Demande {
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type: 'AUTORISATION',
      statut: dto.statut,
      dateCreation: dto.createdAt || '',
      description: dto.typeAutorisation || dto.motif,
      raison: dto.motif,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId)
    };
  }

  private mapDocument(dto: DocumentDto): Demande {
    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type: 'DOCUMENT',
      statut: dto.statut,
      dateCreation: dto.createdAt || '',
      description: dto.typeDocument || dto.motif,
      raison: dto.motif,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId)
    };
  }

  private mapUtilisateur(profile: UserProfileDto | null | undefined, utilisateurId: number): Demande['utilisateur'] {
    if (profile) {
      return {
        id: profile.id ?? utilisateurId,
        prenom: profile.prenom || this.getFirstName(profile.fullName),
        nom: profile.nom || this.getLastName(profile.fullName),
        fullName: profile.fullName || `${profile.prenom || this.getFirstName(profile.fullName)} ${profile.nom || this.getLastName(profile.fullName)}`.trim(),
        email: profile.email || ''
      };
    }

    return {
      id: utilisateurId,
      prenom: '',
      nom: '',
      fullName: '',
      email: ''
    };
  }

  private getFirstName(fullName?: string): string {
    if (!fullName) {
      return '';
    }
    return fullName.split(' ')[0] || '';
  }

  private getLastName(fullName?: string): string {
    if (!fullName) {
      return '';
    }
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  private buildPageParams(page: number, size: number): HttpParams {
    return new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
  }

  private sortDemandes(demandes: Demande[]): Demande[] {
    return [...demandes].sort((left, right) => {
      const leftDate = left.dateCreation ? new Date(left.dateCreation).getTime() : 0;
      const rightDate = right.dateCreation ? new Date(right.dateCreation).getTime() : 0;
      return rightDate - leftDate;
    });
  }

  private calculateDaysInclusive(dateDebut?: string, dateFin?: string): number | undefined {
    if (!dateDebut || !dateFin) {
      return undefined;
    }

    const start = new Date(dateDebut);
    const end = new Date(dateFin);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return undefined;
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
  }
}
