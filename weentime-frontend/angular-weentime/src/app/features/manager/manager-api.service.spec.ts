import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ManagerApiService } from './manager-api.service';
import { ApiConfigService } from '../../core/services/api-config.service';
import { AuthService } from '../../core/services/auth.service';
import { PresenceMonitoringService } from '../presence/services/presence-monitoring.service';
import { of } from 'rxjs';

describe('ManagerApiService', () => {
  let service: ManagerApiService;
  let httpMock: HttpTestingController;
  let api: ApiConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ApiConfigService,
        {
          provide: AuthService,
          useValue: {
            currentUser: signal({
              id: 77,
              email: 'manager@weentime.io',
              roles: ['ROLE_MANAGER']
            })
          }
        },
        {
          provide: PresenceMonitoringService,
          useValue: {
            getTeamToday: () => of({
              scope: 'TEAM',
              teamId: null,
              entrepriseId: 1,
              totalMembers: 1,
              presentMembers: 1,
              workingMembers: 1,
              lateMembers: 0,
              absentMembers: 0,
              members: [{
                utilisateurId: 10,
                nomComplet: 'Ada Lovelace',
                status: 'PRESENT',
                heureEntree: '2026-04-06T08:30:00',
                heureSortie: null,
                durationSeconds: 3600,
                lateArrival: false,
                equipeId: 5,
                equipe: 'Platform',
                entrepriseId: 1,
                entreprise: 'WeenTime'
              }]
            }),
            getTeamHistory: () => of({
              content: [],
              totalElements: 0,
              totalPages: 0,
              number: 0,
              size: 0
            })
          }
        }
      ]
    });

    service = TestBed.inject(ManagerApiService);
    httpMock = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ApiConfigService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps manager request payloads from the real API envelope', () => {
    let result: unknown;

    service.getAllManagerRequests(0, 25, 'EN_ATTENTE_MANAGER').subscribe(page => {
      result = page;
    });

    const req = httpMock.expectOne(request =>
      request.url === api.RH.GET_MANAGER_ALL_DEMANDS(77) &&
      request.params.get('page') === '0' &&
      request.params.get('size') === '25' &&
      request.params.get('statut') === 'EN_ATTENTE_MANAGER'
    );

    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        content: [{
          id: 14,
          utilisateurId: 10,
          typeDemande: 'CONGE',
          statut: 'EN_ATTENTE_MANAGER',
          createdAt: '2026-04-05T09:00:00',
          dateDebut: '2026-04-10',
          dateFin: '2026-04-12',
          nombreJours: 3,
          motif: 'Family trip',
          utilisateur: {
            id: 10,
            nom: 'Lovelace',
            prenom: 'Ada',
            email: 'ada@weentime.io'
          }
        }],
        totalElements: 1,
        totalPages: 1,
        number: 0,
        size: 25
      }
    });

    expect(result).toEqual({
      content: [{
        id: 14,
        utilisateurId: 10,
        type: 'CONGE',
        statut: 'EN_ATTENTE_MANAGER',
        dateCreation: '2026-04-05T09:00:00',
        dateDebut: '2026-04-10',
        dateFin: '2026-04-12',
        nombreJours: 3,
        description: 'Family trip',
        raison: 'Family trip',
        utilisateur: {
          id: 10,
          nom: 'Lovelace',
          prenom: 'Ada',
          email: 'ada@weentime.io'
        }
      }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 25
    });
  });

  it('resolves only teams managed by the current manager and flattens their members', () => {
    let membersResult: unknown;

    service.getManagerTeamMembers().subscribe(members => {
      membersResult = members;
    });

    const teamsReq = httpMock.expectOne(request =>
      request.url === api.ORGANISATION.GET_EQUIPES &&
      request.params.get('page') === '0' &&
      request.params.get('size') === '200'
    );

    teamsReq.flush({
      content: [
        { id: 5, nom: 'Platform', responsableId: 77, departementNom: 'Engineering' },
        { id: 6, nom: 'Finance', responsableId: 11, departementNom: 'Operations' }
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 200
    });

    const membersReq = httpMock.expectOne(request =>
      request.url === api.ORGANISATION.GET_EQUIPE_MEMBERS(5) &&
      request.params.get('page') === '0' &&
      request.params.get('size') === '100'
    );

    membersReq.flush({
      content: [{
        id: 10,
        nom: 'Lovelace',
        prenom: 'Ada',
        email: 'ada@weentime.io',
        poste: 'Engineer',
        departementNom: 'Engineering',
        equipeNom: 'Platform',
        roles: ['ROLE_EMPLOYEE']
      }],
      totalElements: 1,
      totalPages: 1,
      number: 0,
      size: 100
    });

    expect(membersResult).toEqual([{
      id: 10,
      nom: 'Lovelace',
      prenom: 'Ada',
      fullName: 'Ada Lovelace',
      email: 'ada@weentime.io',
      poste: 'Engineer',
      departementId: null,
      departementNom: 'Engineering',
      equipeId: 5,
      equipeNom: 'Platform',
      roles: ['ROLE_EMPLOYEE'],
      statut: undefined
    }]);
  });
});
