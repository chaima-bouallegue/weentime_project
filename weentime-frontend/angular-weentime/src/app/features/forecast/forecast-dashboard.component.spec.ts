// @vitest-environment jsdom

import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { readFile } from 'node:fs/promises';
import { NEVER, of, throwError } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForecastDashboardResponse,
  ForecastEmployeeRiskResponse,
  ForecastWorkloadResponse,
  MlForecastService,
} from '../../core/services/ml-forecast.service';
import { ForecastDashboardComponent } from './forecast-dashboard.component';

const dashboardResponse: ForecastDashboardResponse = {
  success: true,
  period: 'next_30_days',
  generatedAt: '2026-06-06T10:00:00Z',
  summary: {
    predictedAbsences: 2,
    predictedLeaves: 4,
    predictedPresenceRate: 88.5,
    riskLevel: 'MEDIUM',
    predictedWorkload: 'HIGH',
  },
  series: [{
    date: '2026-06-07',
    predictedAbsences: 1,
    predictedLeaves: 2,
    predictedPresenceRate: 87,
  }],
  teams: [{
    teamId: 7,
    teamName: 'Ops',
    predictedAbsences: 1,
    predictedLeaves: 2,
    predictedPresenceRate: 87,
    riskLevel: 'MEDIUM',
    explanation: 'Pression moderee.',
  }],
  explanations: [],
  dataQuality: {
    status: 'OK',
    fallbackUsed: false,
    historicalDays: 30,
    source: 'database',
  },
};

const workloadResponse: ForecastWorkloadResponse = {
  success: true,
  period: 'next_30_days',
  generatedAt: '2026-06-06T10:00:00Z',
  predictedWorkload: 'HIGH',
  pendingRequestsCount: 5,
  approvedRequestsCount: 3,
  explanation: 'Charge elevee.',
  dataQuality: dashboardResponse.dataQuality,
};

const employeeResponse: ForecastEmployeeRiskResponse = {
  success: true,
  period: 'next_30_days',
  generatedAt: '2026-06-06T10:00:00Z',
  employees: [],
  dataQuality: dashboardResponse.dataQuality,
};

describe('ForecastDashboardComponent', () => {
  const service = {
    getDashboard: vi.fn(),
    getWorkload: vi.fn(),
    getRiskByEmployee: vi.fn(),
  };

  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await ɵresolveComponentResources(url => readFile(new URL(url, import.meta.url), 'utf-8'));
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ForecastDashboardComponent],
      providers: [{ provide: MlForecastService, useValue: service }],
    }).compileComponents();
  });

  it('shows loading placeholders while requests are pending', () => {
    service.getDashboard.mockReturnValue(NEVER);
    service.getWorkload.mockReturnValue(NEVER);
    service.getRiskByEmployee.mockReturnValue(NEVER);

    const fixture = TestBed.createComponent(ForecastDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.isLoading()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.metric-card.skeleton')).toHaveLength(5);
  });

  it('shows one consolidated retry error and no misleading KPI cards', () => {
    service.getDashboard.mockReturnValue(throwError(() => new Error('offline')));
    service.getWorkload.mockReturnValue(throwError(() => new Error('offline')));
    service.getRiskByEmployee.mockReturnValue(throwError(() => new Error('offline')));

    const fixture = TestBed.createComponent(ForecastDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toContain('Service de prévision indisponible');
    expect(fixture.nativeElement.querySelectorAll('.quality-strip')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.retry-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.metric-card')).toHaveLength(0);
  });

  it('shows the moving-average warning for insufficient history and keeps valid data', () => {
    service.getDashboard.mockReturnValue(of({
      ...dashboardResponse,
      dataQuality: {
        ...dashboardResponse.dataQuality,
        status: 'INSUFFICIENT_DATA',
        fallbackUsed: true,
        historicalDays: 8,
      },
    }));
    service.getWorkload.mockReturnValue(of(workloadResponse));
    service.getRiskByEmployee.mockReturnValue(of(employeeResponse));

    const fixture = TestBed.createComponent(ForecastDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.componentInstance.hasForecastData()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Historique insuffisant, prévision basée sur moyenne mobile',
    );
    expect(fixture.nativeElement.querySelectorAll('.metric-card')).toHaveLength(5);
  });

  it('rejects an incomplete workload response instead of showing a false zero', () => {
    service.getDashboard.mockReturnValue(of(dashboardResponse));
    service.getWorkload.mockReturnValue(of({ ...workloadResponse, success: false }));
    service.getRiskByEmployee.mockReturnValue(of(employeeResponse));

    const fixture = TestBed.createComponent(ForecastDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBe('Service de prévision indisponible');
    expect(fixture.nativeElement.querySelectorAll('.metric-card')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('Charge RH');
  });

  it('renders KPI cards and chart content for a successful response', () => {
    service.getDashboard.mockReturnValue(of(dashboardResponse));
    service.getWorkload.mockReturnValue(of(workloadResponse));
    service.getRiskByEmployee.mockReturnValue(of(employeeResponse));

    const fixture = TestBed.createComponent(ForecastDashboardComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.hasForecastData()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.metric-card')).toHaveLength(5);
    expect(fixture.nativeElement.querySelector('.forecast-chart')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('88.5%');
  });
});
