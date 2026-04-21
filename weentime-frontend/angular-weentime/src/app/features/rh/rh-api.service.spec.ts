import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiConfigService } from '../../core/services/api-config.service';
import { RhApiService } from './rh-api.service';

describe('RhApiService', () => {
  let service: RhApiService;
  let httpMock: HttpTestingController;
  let api: ApiConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ApiConfigService
      ]
    });

    service = TestBed.inject(RhApiService);
    httpMock = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiConfigService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps RH request pages from the API envelope and forwards filters', () => {
    let result: unknown;

    service.getRequests(2, 20, {
      statut: 'EN_ATTENTE_RH',
      type: 'CONGE',
      employee: 'ada',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30'
    }).subscribe(page => {
      result = page;
    });

    const req = httpMock.expectOne(request =>
      request.url === api.RH.GET_RH_REQUESTS &&
      request.params.get('page') === '2' &&
      request.params.get('size') === '20' &&
      request.params.get('sort') === 'createdAt,desc' &&
      request.params.get('statut') === 'EN_ATTENTE_RH' &&
      request.params.get('type') === 'CONGE' &&
      request.params.get('employee') === 'ada' &&
      request.params.get('dateFrom') === '2026-04-01' &&
      request.params.get('dateTo') === '2026-04-30'
    );

    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        content: [{
          id: 31,
          utilisateurId: 10,
          managerId: 77,
          typeDemande: 'CONGE',
          statut: 'EN_ATTENTE_RH',
          createdAt: '2026-04-05T09:30:00',
          dateDebut: '2026-04-10',
          dateFin: '2026-04-11',
          nombreJours: 2,
          motif: 'Family event',
          utilisateur: {
            id: 10,
            nom: 'Lovelace',
            prenom: 'Ada',
            email: 'ada@weentime.io'
          },
          manager: {
            id: 77,
            nom: 'Hopper',
            prenom: 'Grace',
            email: 'grace@weentime.io'
          }
        }],
        totalElements: 1,
        totalPages: 1,
        number: 2,
        size: 20
      }
    });

    expect(result).toEqual({
      content: [{
        id: 31,
        utilisateurId: 10,
        managerId: 77,
        type: 'CONGE',
        statut: 'EN_ATTENTE_RH',
        dateCreation: '2026-04-05T09:30:00',
        dateDecision: null,
        dateDebut: '2026-04-10',
        dateFin: '2026-04-11',
        nombreJours: 2,
        duree: null,
        motif: 'Family event',
        commentaire: null,
        commentaireValidateur: null,
        typeAutorisation: null,
        typeDocument: null,
        utilisateur: {
          id: 10,
          nom: 'Lovelace',
          prenom: 'Ada',
          email: 'ada@weentime.io'
        },
        manager: {
          id: 77,
          nom: 'Hopper',
          prenom: 'Grace',
          email: 'grace@weentime.io'
        }
      }],
      totalElements: 1,
      totalPages: 1,
      number: 2,
      size: 20
    });
  });

  it('routes RH absence approvals through the absence endpoint with commentaire params', () => {
    let result: unknown;

    service.approveRequest({
      id: 44,
      utilisateurId: 10,
      type: 'ABSENCE',
      statut: 'EN_ATTENTE_RH',
      dateCreation: '2026-04-06T08:00:00'
    }, 'Validated by HR').subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(request =>
      request.url === api.RH.VALIDATE_ABSENCE_RH(44) &&
      request.params.get('commentaire') === 'Validated by HR'
    );

    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toBeNull();

    req.flush({
      success: true,
      data: {
        id: 44,
        utilisateurId: 10,
        typeDemande: 'ABSENCE',
        statut: 'APPROUVEE',
        createdAt: '2026-04-06T08:00:00',
        commentaireValidateur: 'Validated by HR'
      }
    });

    expect(result).toEqual({
      id: 44,
      utilisateurId: 10,
      managerId: undefined,
      type: 'ABSENCE',
      statut: 'APPROUVEE',
      dateCreation: '2026-04-06T08:00:00',
      dateDecision: null,
      dateDebut: null,
      dateFin: null,
      nombreJours: null,
      duree: null,
      motif: null,
      commentaire: null,
      commentaireValidateur: 'Validated by HR',
      typeAutorisation: null,
      typeDocument: null,
      utilisateur: null,
      manager: null
    });
  });
});
