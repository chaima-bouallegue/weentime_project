// @vitest-environment jsdom

import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MlForecastService } from './ml-forecast.service';
import { SKIP_ERROR_TOAST } from '../http/request-context.tokens';

describe('MlForecastService', () => {
  let service: MlForecastService;
  let httpMock: HttpTestingController;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MlForecastService,
      ],
    });
    service = TestBed.inject(MlForecastService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads dashboard through the gateway route without duplicating auth metadata', () => {
    let result = null as unknown;

    service.getDashboard({ period: 'next_week', departmentId: 3, teamId: 7 }).subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(
      'http://localhost:8222/api/ml/forecast/dashboard?period=next_week&departmentId=3&teamId=7',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has('X-User-Id')).toBe(false);
    expect(req.request.headers.has('X-User-Role')).toBe(false);
    expect(req.request.headers.has('X-Tenant-Id')).toBe(false);
    expect(req.request.headers.has('X-Entreprise-Id')).toBe(false);
    expect(req.request.context.get(SKIP_ERROR_TOAST)).toBe(true);
    expect(req.request.params.get('period')).toBe('next_week');
    expect(req.request.params.get('departmentId')).toBe('3');
    expect(req.request.params.get('teamId')).toBe('7');
    req.flush({
      success: true,
      period: 'next_week',
      generatedAt: '2026-06-05T10:00:00Z',
      summary: {
        predictedAbsences: 2,
        predictedLeaves: 4,
        predictedPresenceRate: 88.5,
        riskLevel: 'MEDIUM',
        predictedWorkload: 'HIGH',
      },
      series: [{
        date: '2026-06-06',
        predictedAbsences: 1,
        predictedLeaves: 2,
        predictedPresenceRate: 87,
      }],
      teams: [{
        teamId: 7,
        teamName: 'Ops',
        departmentId: 3,
        departmentName: 'People',
        predictedAbsences: 1,
        predictedLeaves: 2,
        predictedPresenceRate: 87,
        riskLevel: 'MEDIUM',
        explanation: 'Ops: charge moderee.',
      }],
      explanations: ['Perimetre analyse: 2 salaries, 1 equipes.'],
      dataQuality: {
        status: 'OK',
        fallbackUsed: true,
        historicalDays: 9,
        source: 'database',
      },
    });

    const dashboard = result as {
      summary: { predictedLeaves: number; riskLevel: string; predictedWorkload: string };
      series: Array<{ date: string; predictedPresenceRate: number }>;
      teams: Array<{ teamName: string }>;
      dataQuality: { fallbackUsed: boolean; historicalDays: number };
    };
    expect(dashboard.summary.predictedLeaves).toBe(4);
    expect(dashboard.summary.riskLevel).toBe('MEDIUM');
    expect(dashboard.summary.predictedWorkload).toBe('HIGH');
    expect(dashboard.series[0].date).toBe('2026-06-06');
    expect(dashboard.series[0].predictedPresenceRate).toBe(87);
    expect(dashboard.teams[0].teamName).toBe('Ops');
    expect(dashboard.dataQuality.fallbackUsed).toBe(true);
    expect(dashboard.dataQuality.historicalDays).toBe(9);
  });

  it('loads risk by employee and maps snake case payloads', () => {
    let result = null as unknown;

    service.getRiskByEmployee({ period: 'next_30_days' }).subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/forecast/risk-by-employee'));
    req.flush({
      success: true,
      period: 'next_30_days',
      generated_at: '2026-06-05T10:00:00Z',
      employees: [{
        employee_id: 24,
        employee_name: 'Amin Dupont',
        team_name: 'Ops',
        absence_count_last_30_days: 2,
        leave_count_last_30_days: 3,
        late_count_last_30_days: 1,
        planned_leave_days: 4,
        risk_level: 'HIGH',
        score: 0.64,
        explanation: 'Historique eleve.',
      }],
      data_quality: {
        status: 'OK',
        fallback_used: false,
        historical_days: 30,
        source: 'database',
      },
    });

    const response = result as {
      employees: Array<{ employeeId: number; employeeName: string; riskLevel: string; plannedLeaveDays: number }>;
      dataQuality: { fallbackUsed: boolean };
    };
    expect(response.employees[0].employeeId).toBe(24);
    expect(response.employees[0].employeeName).toBe('Amin Dupont');
    expect(response.employees[0].riskLevel).toBe('HIGH');
    expect(response.employees[0].plannedLeaveDays).toBe(4);
    expect(response.dataQuality.fallbackUsed).toBe(false);
  });

  it('marks a malformed successful dashboard response as unavailable', () => {
    let result = null as unknown;

    service.getDashboard().subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/forecast/dashboard'));
    req.flush({
      success: true,
      summary: {
        predictedAbsences: 0,
      },
      dataQuality: {
        status: 'OK',
        fallbackUsed: false,
        historicalDays: 30,
        source: 'database',
      },
    });

    expect((result as { success: boolean }).success).toBe(false);
  });

  it('marks a workload payload without a request count as unavailable', () => {
    let result = null as unknown;

    service.getWorkload().subscribe(response => {
      result = response;
    });

    const req = httpMock.expectOne(request => request.url.endsWith('/api/ml/forecast/workload'));
    req.flush({
      success: true,
      predictedWorkload: 'LOW',
      dataQuality: {
        status: 'OK',
        fallbackUsed: false,
        historicalDays: 30,
        source: 'database',
      },
    });

    expect((result as { success: boolean }).success).toBe(false);
  });
});
