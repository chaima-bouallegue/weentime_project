// @vitest-environment jsdom

import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MlAnomalyService } from './ml-anomaly.service';
import { AuthService } from './auth.service';

describe('MlAnomalyService', () => {
  let service: MlAnomalyService;
  let httpMock: HttpTestingController;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    const authStub = {
      currentUser: () => ({
        id: 12,
        email: 'rh@weentime.test',
        role: 'ROLE_RH',
        roles: ['ROLE_RH'],
        entrepriseId: 42,
      }),
      getToken: () => 'test-token',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authStub },
        MlAnomalyService,
      ],
    });
    service = TestBed.inject(MlAnomalyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock?.verify();
  });

  it('uses the manager-scoped anomaly endpoint', () => {
    service.getTeamAnomalies().subscribe();

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/anomalies/manager'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(req.request.headers.get('X-User-Id')).toBe('12');
    expect(req.request.headers.get('X-Entreprise-Id')).toBe('42');
    expect(req.request.headers.get('X-Tenant-Id')).toBe('42');
    expect(req.request.headers.get('X-Dashboard-Scope')).toBe('MANAGER');
    req.flush({
      success: true,
      generated_at: '2026-05-31T10:00:00Z',
      total_anomalies: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      anomalies: [],
    });
  });

  it('propagates scoped dashboard errors instead of fabricating zero anomalies', () => {
    let failed = false;
    service.getRhAnomalies().subscribe({
      error: () => {
        failed = true;
      },
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/anomalies/rh'));
    req.flush({ detail: 'presence_backend_unavailable' }, { status: 503, statusText: 'Unavailable' });

    expect(failed).toBe(true);
  });

  it('uses the admin dashboard scope query', () => {
    service.getDashboardSummary().subscribe();

    const req = httpMock.expectOne(request =>
      request.urlWithParams.endsWith('/api/ml/anomalies/dashboard?scope=ADMIN')
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      generated_at: '2026-05-31T10:00:00Z',
      total_anomalies: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      anomalies: [],
    });
  });

  it('maps business anomaly fields for the details modal', () => {
    let result = null as unknown;

    service.getRhAnomalies().subscribe(response => {
      result = response.anomalies[0];
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/anomalies/rh'));
    req.flush({
      success: true,
      generated_at: '2026-05-31T10:00:00Z',
      total_anomalies: 1,
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      anomalies: [{
        id: '24:2026-05-31:RAPID_SESSION',
        employee_id: 24,
        employee_name: 'Amin Dupont',
        date: '2026-05-31',
        score: 0.82,
        risk: 'HIGH',
        category: 'RAPID_SESSION',
        title: 'Session tres courte',
        summary: 'Amin Dupont a travaille seulement 2 minutes.',
        explanation: 'Cette session est anormalement courte.',
        reasons: ['Session tres courte'],
        detectedReasons: [{
          code: 'RAPID_SESSION',
          label: 'Session tres courte',
          description: 'La duree travaillee est inferieure au minimum attendu.',
          value: '2 min',
          expected: 'au moins 30 min',
        }],
        attendanceSnapshot: {
          scheduledStart: '09:00',
          scheduledEnd: '18:00',
          checkIn: '23:02',
          checkOut: '23:05',
          workedMinutes: 3,
          lateMinutes: 0,
          missingCheckout: false,
          isAbsent: false,
          isWeekend: true,
          overtimeMinutes: 0,
          location: 'Jaafar, Tunisie',
        },
        recommendation: 'Verifier si ce pointage est un test ou une erreur.',
        actions: ['IGNORE', 'CONTACT_EMPLOYEE', 'VIEW_DETAILS'],
        features: {},
      }],
    });

    const anomaly = result as {
      id: string;
      employeeId: number;
      employeeName: string;
      category: string;
      title: string;
      attendanceSnapshot: { workedMinutes: number; location: string };
      detectedReasons: Array<{ code: string }>;
    };
    expect(anomaly.id).toBe('24:2026-05-31:RAPID_SESSION');
    expect(anomaly.employeeId).toBe(24);
    expect(anomaly.employeeName).toBe('Amin Dupont');
    expect(anomaly.category).toBe('RAPID_SESSION');
    expect(anomaly.title).toBe('Session tres courte');
    expect(anomaly.attendanceSnapshot.workedMinutes).toBe(3);
    expect(anomaly.attendanceSnapshot.location).toBe('Jaafar, Tunisie');
    expect(anomaly.detectedReasons.some(reason => reason.code === 'RAPID_SESSION')).toBe(true);
  });

  it('keeps anomaly cards displayable when backend only sends category, severity, and explanation', () => {
    let result = null as unknown;

    service.getRhAnomalies().subscribe(response => {
      result = response.anomalies[0];
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/anomalies/rh'));
    req.flush({
      success: true,
      generated_at: '2026-05-31T10:00:00Z',
      total_anomalies: 1,
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      anomalies: [{
        employee_id: 31,
        employee_name: 'Nour Ben Ali',
        date: '2026-05-31',
        score: 0.78,
        severity: 'HIGH',
        category: 'MISSING_CHECKOUT',
        explanation: 'Nour Ben Ali a une entree sans sortie enregistree.',
      }],
      rawRecordsCount: 1,
      parsedRecordsCount: 1,
      anomaliesCount: 1,
    });

    const anomaly = result as { risk: string; title: string; summary: string; explanation: string };
    expect(anomaly.risk).toBe('HIGH');
    expect(anomaly.title).toBe('MISSING_CHECKOUT');
    expect(anomaly.summary).toBe('Nour Ben Ali a une entree sans sortie enregistree.');
    expect(anomaly.explanation).toBe('Nour Ben Ali a une entree sans sortie enregistree.');
  });

  it('deduplicates duplicate anomaly records and recomputes counters from rendered cards', () => {
    let result = null as unknown;

    service.getRhAnomalies().subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/anomalies/rh'));
    req.flush({
      success: true,
      generated_at: '2026-05-31T10:00:00Z',
      total_anomalies: 3,
      critical: 3,
      high: 0,
      medium: 0,
      low: 0,
      anomalies: [
        {
          employee_id: 31,
          employee_name: 'Nour Ben Ali',
          date: '2026-05-31',
          score: 0.75,
          risk: 'HIGH',
          category: 'MISSING_CHECKOUT',
          explanation: 'Premiere version.',
          reasons: ['Sortie non pointee'],
        },
        {
          employee_id: 31,
          employee_name: 'Nour Ben Ali',
          date: '2026-05-31',
          score: 0.78,
          risk: 'HIGH',
          category: 'MISSING_CHECKOUT',
          explanation: 'Version dupliquee.',
          reasons: ['Sortie non pointee', 'Session ouverte'],
        },
        {
          employee_id: 32,
          employee_name: 'Nour Ben Ali',
          date: '2026-05-31',
          score: 0.92,
          risk: 'CRITICAL',
          category: 'ABSENCE',
          explanation: 'Homonyme absent.',
        },
      ],
    });

    const dashboard = result as {
      totalAnomalies: number;
      critical: number;
      high: number;
      anomalies: Array<{ employeeId: number; score: number; reasons: string[]; explanation: string }>;
    };
    expect(dashboard.totalAnomalies).toBe(2);
    expect(dashboard.critical).toBe(1);
    expect(dashboard.high).toBe(1);
    expect(dashboard.anomalies.length).toBe(2);
    expect(dashboard.anomalies[0].employeeId).toBe(32);
    expect(dashboard.anomalies[1].employeeId).toBe(31);
    expect(dashboard.anomalies[1].score).toBe(0.78);
    expect(dashboard.anomalies[1].reasons).toContain('Session ouverte');
    expect(dashboard.anomalies[1].explanation).toContain('Version dupliquee.');
  });

  it('loads admin anomaly list with filters and maps admin fields', () => {
    let result = null as unknown;

    service.getAdminAnomalies({
      fromDate: '2026-05-24',
      toDate: '2026-05-31',
      risk: 'HIGH',
      status: 'SUSPICIOUS',
      page: 2,
      size: 5,
      sort: '-risk',
    }).subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/anomalies/list'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    expect(req.request.headers.get('X-Dashboard-Scope')).toBe('ADMIN');
    expect(req.request.params.get('fromDate')).toBe('2026-05-24');
    expect(req.request.params.get('status')).toBe('SUSPICIOUS');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('5');
    req.flush({
      success: true,
      generatedAt: '2026-05-31T10:00:00Z',
      backendStatus: 'ok',
      total: 1,
      page: 2,
      size: 5,
      totalPages: 3,
      summary: {
        totalAnomalies: 1,
        high: 1,
        employeesConcerned: 1,
        suspicious: 1,
      },
      items: [{
        id: '24:2026-05-31:RAPID_SESSION',
        employeeId: 24,
        employeeName: 'Amin Dupont',
        date: '2026-05-31',
        score: 0.82,
        risk: 'HIGH',
        category: 'RAPID_SESSION',
        categoryLabel: 'Session trop courte',
        status: 'SUSPICIOUS',
        statusComment: 'Verification requise',
        title: 'Session tres courte',
        summary: 'Amin Dupont a travaille seulement 3 minutes.',
        explanation: 'Amin Dupont a travaille seulement 3 minutes.',
        reasons: ['Session tres courte'],
        departmentName: 'Produit',
        entrepriseName: 'WeenTime',
      }],
    });

    const list = result as {
      total: number;
      totalPages: number;
      summary: { high: number; suspicious: number; employeesConcerned: number };
      items: Array<{ id: string; categoryLabel: string; status: string; departmentName: string; entrepriseName: string }>;
    };
    expect(list.total).toBe(1);
    expect(list.totalPages).toBe(3);
    expect(list.summary.high).toBe(1);
    expect(list.summary.suspicious).toBe(1);
    expect(list.summary.employeesConcerned).toBe(1);
    expect(list.items[0].id).toBe('24:2026-05-31:RAPID_SESSION');
    expect(list.items[0].categoryLabel).toBe('Session trop courte');
    expect(list.items[0].status).toBe('SUSPICIOUS');
    expect(list.items[0].departmentName).toBe('Produit');
    expect(list.items[0].entrepriseName).toBe('WeenTime');
  });

  it('patches admin anomaly status', () => {
    service.updateAdminAnomalyStatus('24:2026-05-31:RAPID_SESSION', 'JUSTIFIED', 'OK').subscribe();

    const req = httpMock.expectOne(request =>
      request.url.endsWith('/api/ml/anomalies/admin/24%3A2026-05-31%3ARAPID_SESSION/status')
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'JUSTIFIED', comment: 'OK' });
    req.flush({
      success: true,
      anomalyId: '24:2026-05-31:RAPID_SESSION',
      status: 'JUSTIFIED',
      comment: 'OK',
      updatedAt: '2026-05-31T10:00:00Z',
    });
  });
});
