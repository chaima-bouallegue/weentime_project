import { DestroyRef, Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { ToastService } from '@app/core/services/toast.service';

export interface RHValidationDemande {
  id: number;
  utilisateurId: number;
  type: 'CONGE' | 'ABSENCE';
  statut: 'EN_ATTENTE_RH' | 'APPROUVEE' | 'REFUSEE' | 'ANNULEE';
  dateCreation: string;
  dateDebut?: string;
  dateFin?: string;
  description?: string;
  nombreJours?: number;
  raison?: string;
  commentaireManager?: string;
  utilisateur?: {
    id: number;
    nom: string;
    prenom: string;
    email: string;
  } | null;
  manager?: {
    id: number;
    nom: string;
    prenom: string;
  } | null;
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

interface BaseValidationDto {
  id: number;
  utilisateurId: number;
  managerId?: number;
  utilisateur?: UserProfileDto | null;
  manager?: UserProfileDto | null;
  statut: RHValidationDemande['statut'];
  motif?: string;
  commentaireValidateur?: string;
  createdAt?: string;
  dateDebut?: string;
  dateFin?: string;
}

interface UserProfileDto {
  id: number;
  nom?: string;
  prenom?: string;
  fullName?: string;
  email?: string;
}

interface CongeDto extends BaseValidationDto {
  nombreJours?: number;
}

interface AbsenceDto extends BaseValidationDto {}

interface RHValidationResponse {
  success: boolean;
  data: RHValidationDemande;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RHValidationService {
  private readonly httpClient = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pendingValidationsSignal = signal<RHValidationDemande[]>([]);
  readonly validatedDemandesSignal = signal<RHValidationDemande[]>([]);
  readonly loadingSignal = signal(false);
  readonly currentValidationSignal = signal<RHValidationDemande | null>(null);

  readonly filterByTypeSignal = signal<'CONGE' | 'ABSENCE' | 'ALL'>('ALL');
  readonly currentPageSignal = signal(0);
  readonly pageSizeSignal = signal(20);
  readonly totalElementsSignal = signal(0);

  readonly totalPendingCount = computed(() => this.pendingValidationsSignal().length);

  readonly filteredPendingSignal = computed(() => {
    const filter = this.filterByTypeSignal();
    const pending = this.pendingValidationsSignal();
    return filter === 'ALL' ? pending : pending.filter((demande) => demande.type === filter);
  });

  readonly pendingByType = computed(() => {
    const pending = this.pendingValidationsSignal();
    return {
      conges: pending.filter((demande) => demande.type === 'CONGE').length,
      absences: pending.filter((demande) => demande.type === 'ABSENCE').length
    };
  });

  loadPendingValidations(type: 'CONGE' | 'ABSENCE' = 'CONGE', page: number = 0, pageSize: number = 20): void {
    this.loadingSignal.set(true);
    this.currentPageSignal.set(page);
    this.pageSizeSignal.set(pageSize);
    this.filterByTypeSignal.set(type);

    const params = this.buildPageParams(page, pageSize);
    const path = type === 'CONGE' ? '/conges/rh/pending' : '/absences/rh/pending';

    this.fetchValidationPage<CongeDto | AbsenceDto>(path, type, params).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (result) => {
        this.pendingValidationsSignal.set(result.items);
        this.totalElementsSignal.set(result.totalElements);
        this.loadingSignal.set(false);
      },
      error: () => {
        this.toastService.error('Erreur lors du chargement des demandes en attente de validation');
        this.pendingValidationsSignal.set([]);
        this.totalElementsSignal.set(0);
        this.loadingSignal.set(false);
      }
    });
  }

  loadAllPendingValidations(): void {
    this.loadingSignal.set(true);
    this.filterByTypeSignal.set('ALL');
    const params = this.buildPageParams(0, 100);

    this.fetchValidationPage<CongeDto>('/conges/rh/pending', 'CONGE', params).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (result) => {
        const all = result.items;
        this.pendingValidationsSignal.set(all);
        this.totalElementsSignal.set(result.totalElements);
        this.loadingSignal.set(false);
      },
      error: () => {
        this.toastService.error('Erreur lors du chargement des demandes en attente');
        this.pendingValidationsSignal.set([]);
        this.totalElementsSignal.set(0);
        this.loadingSignal.set(false);
      }
    });
  }

  getDemande(type: 'CONGE' | 'ABSENCE', id: number): Observable<RHValidationResponse> {
    const path = type === 'CONGE' ? `/conges/${id}` : `/absences/${id}`;

    return this.httpClient.get<ApiResponse<CongeDto | AbsenceDto>>(`${this.apiConfig.getApiBase()}${path}`).pipe(
      map((response) => {
        const demande = this.mapValidation(type, response?.data as CongeDto | AbsenceDto);
        if (!demande) {
          throw new Error('Demande introuvable');
        }
        return {
          success: response?.success ?? true,
          data: demande,
          message: response?.message
        };
      }),
      tap((response) => this.currentValidationSignal.set(response.data)),
      catchError((error) => {
        this.toastService.error('Erreur lors du chargement de la demande');
        return of({
          success: false,
          data: null as unknown as RHValidationDemande,
          message: error?.message
        });
      })
    );
  }

  validateDemande(type: 'CONGE' | 'ABSENCE', id: number, commentaire: string = ''): Observable<RHValidationResponse> {
    const request = type === 'CONGE'
      ? { path: `/conges/${id}/valider-rh`, mode: 'body' as const }
      : { path: `/absences/${id}/validate/rh`, mode: 'query' as const };

    return this.sendDecision(type, request.path, request.mode, commentaire).pipe(
      tap((response) => {
        if (response.success) {
          this.toastService.success('Demande validee et approuvee');
          this.pendingValidationsSignal.update((pending) => pending.filter((demande) => demande.id !== id));
        }
      }),
      catchError((error) => {
        this.toastService.error('Erreur lors de la validation de la demande');
        return throwError(() => error);
      })
    );
  }

  rejectDemande(type: 'CONGE' | 'ABSENCE', id: number, commentaire: string = ''): Observable<RHValidationResponse> {
    const request = type === 'CONGE'
      ? { path: `/conges/${id}/refuser-rh`, mode: 'body' as const }
      : { path: `/absences/${id}/reject`, mode: 'query' as const };

    return this.sendDecision(type, request.path, request.mode, commentaire).pipe(
      tap((response) => {
        if (response.success) {
          this.toastService.success('Demande refusee');
          this.pendingValidationsSignal.update((pending) => pending.filter((demande) => demande.id !== id));
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
      ABSENCE: 'Absence'
    };

    return labels[type] || type;
  }

  private fetchValidationPage<T extends CongeDto | AbsenceDto>(
    path: string,
    type: 'CONGE' | 'ABSENCE',
    params: HttpParams
  ): Observable<{ items: RHValidationDemande[]; totalElements: number }> {
    return this.httpClient.get<ApiResponse<ApiPage<T>>>(`${this.apiConfig.getApiBase()}${path}`, { params }).pipe(
      map((response) => {
        const data = response?.data;
        const content = Array.isArray(data?.content) ? data.content : [];
        return {
          items: this.sortDemandes(
            content.map((item) => this.mapValidation(type, item)).filter((item): item is RHValidationDemande => !!item)
          ),
          totalElements: data?.totalElements ?? content.length
        };
      }),
      catchError(() => of({ items: [] as RHValidationDemande[], totalElements: 0 }))
    );
  }

  private sendDecision(
    type: 'CONGE' | 'ABSENCE',
    path: string,
    mode: 'body' | 'query',
    commentaire: string
  ): Observable<RHValidationResponse> {
    const url = `${this.apiConfig.getApiBase()}${path}`;
    const request$ = mode === 'body'
      ? this.httpClient.patch<ApiResponse<CongeDto | AbsenceDto>>(url, { commentaire })
      : this.httpClient.patch<ApiResponse<CongeDto | AbsenceDto>>(url, null, {
          params: commentaire ? new HttpParams().set('commentaire', commentaire) : undefined
        });

    return request$.pipe(
      map((response) => {
        const demande = this.mapValidation(type, response?.data as CongeDto | AbsenceDto);
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

  private mapValidation(
    type: 'CONGE' | 'ABSENCE',
    dto?: CongeDto | AbsenceDto
  ): RHValidationDemande | null {
    if (!dto) {
      return null;
    }

    return {
      id: dto.id,
      utilisateurId: dto.utilisateurId,
      type,
      statut: dto.statut,
      dateCreation: dto.createdAt || '',
      dateDebut: dto.dateDebut,
      dateFin: dto.dateFin,
      description: dto.motif,
      nombreJours: type === 'CONGE'
        ? (dto as CongeDto).nombreJours
        : this.calculateDaysInclusive(dto.dateDebut, dto.dateFin),
      raison: dto.motif,
      commentaireManager: dto.commentaireValidateur,
      utilisateur: this.mapUtilisateur(dto.utilisateur, dto.utilisateurId),
      manager: dto.manager ? this.mapManager(dto.manager, dto.managerId) : (dto.managerId ? this.mapManager(null, dto.managerId) : null)
    };
  }

  private mapUtilisateur(profile: UserProfileDto | null | undefined, utilisateurId: number): RHValidationDemande['utilisateur'] {
    if (profile) {
      return {
        id: profile.id ?? utilisateurId,
        prenom: profile.prenom || this.getFirstName(profile.fullName),
        nom: profile.nom || this.getLastName(profile.fullName),
        email: profile.email || ''
      };
    }

    return {
      id: utilisateurId,
      prenom: '',
      nom: '',
      email: ''
    };
  }

  private mapManager(profile: UserProfileDto | null | undefined, managerId?: number): RHValidationDemande['manager'] {
    if (profile) {
      return {
        id: profile.id ?? managerId ?? 0,
        prenom: profile.prenom || this.getFirstName(profile.fullName),
        nom: profile.nom || this.getLastName(profile.fullName)
      };
    }

    return {
      id: managerId ?? 0,
      prenom: '',
      nom: ''
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

  private sortDemandes(demandes: RHValidationDemande[]): RHValidationDemande[] {
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
