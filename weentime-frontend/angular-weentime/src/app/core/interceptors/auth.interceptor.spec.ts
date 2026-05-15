// @vitest-environment jsdom

import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withAiChatWidgetContext } from '../http/request-context.tokens';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

class FakeAuthService {
  clearAuthState = vi.fn();
  getToken = vi.fn(() => 'fake-token');
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: FakeAuthService;
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: FakeAuthService },
        { provide: Router, useValue: router },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService) as unknown as FakeAuthService;
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  it('clears auth state and redirects on regular protected 401 responses', () => {
    http.get('/api/v1/secure/profile').subscribe({ error: () => undefined });

    const request = httpMock.expectOne('/api/v1/secure/profile');
    request.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.clearAuthState).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
  });

  it('keeps the current page alive for AI chat widget requests that return 401', () => {
    http.get('/api/v1/ai/v2/voice', { context: withAiChatWidgetContext() }).subscribe({ error: () => undefined });

    const request = httpMock.expectOne('/api/v1/ai/v2/voice');
    request.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.clearAuthState).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
