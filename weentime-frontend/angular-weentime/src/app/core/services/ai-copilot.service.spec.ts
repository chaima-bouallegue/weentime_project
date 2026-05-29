// @vitest-environment jsdom

import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AiCopilotService,
  buildAiChatRequestPayload,
  detectAiMessageLanguage,
  resolveAiServiceEndpoint,
  resolvePreferredAiLanguage,
} from './ai-copilot.service';
import { AuthService } from './auth.service';

class FakeAiAuthService {
  user: any = { id: 7, role: 'EMPLOYEE', roles: ['EMPLOYEE'], entrepriseId: 42 };
  token: string | null = 'access-token';
  mfaChallenge: unknown = null;

  currentUser = () => this.user;
  getToken = () => this.token;
  getMfaChallenge = () => this.mfaChallenge;
}

describe('ai-copilot helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the v2 chat payload with nested metadata and user id', () => {
    const navigatorMock = { language: 'en-US' } as Navigator;
    vi.stubGlobal('navigator', navigatorMock);

    const payload = buildAiChatRequestPayload('Show my daily summary', 42);

    expect(payload.message).toBe('Show my daily summary');
    expect(payload.user_id).toBe(42);
    expect(payload.language).toBe('en');
    expect(payload.detectedLanguage).toBe('en');
    expect(payload.metadata).toEqual(expect.objectContaining({
      channel: 'chat',
      language: 'en',
      detectedLanguage: 'en',
      requested_language: 'en',
      response_language: 'en',
      mode: 'text',
    }));
  });

  it('detects latest message language instead of relying only on browser locale', () => {
    expect(detectAiMessageLanguage('Show my daily summary', 'fr-FR')).toBe('en');
    expect(detectAiMessageLanguage('Montre mon résumé du jour', 'en-US')).toBe('fr');
    expect(detectAiMessageLanguage('شنوة ملخص اليوم', 'fr-FR')).toBe('tn');
    expect(detectAiMessageLanguage('chnowa résumé lyoum', 'fr-FR')).toBe('tn');
  });

  it('uses the configured AI service endpoint before the debug fallback', () => {
    expect(
      resolveAiServiceEndpoint('http://127.0.0.1:8000/', 'http://localhost:8000/')
    ).toBe('http://127.0.0.1:8000');
    expect(resolveAiServiceEndpoint('', '')).toBe('http://127.0.0.1:8000');
  });

  it('maps supported browser locales to ai language codes', () => {
    expect(resolvePreferredAiLanguage('fr-FR')).toBe('fr');
    expect(resolvePreferredAiLanguage('en-US')).toBe('en');
    expect(resolvePreferredAiLanguage('ar-MA')).toBe('ar');
    expect(resolvePreferredAiLanguage('ar-TN')).toBe('tn');
    expect(resolvePreferredAiLanguage('tn')).toBe('tn');
  });
});

describe('AiCopilotService requests', () => {
  let service: AiCopilotService;
  let httpMock: HttpTestingController | null = null;
  let auth: FakeAiAuthService;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    httpMock?.verify();
    httpMock = null;
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  function configure(): void {
    auth = new FakeAiAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: { url: '/employee/dashboard' } },
        AiCopilotService,
      ],
    });
    service = TestBed.inject(AiCopilotService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  it('sends v2 chat with Authorization, tenant, role, page, and agent metadata', () => {
    configure();

    service.sendChatV2('Show my daily summary').subscribe();

    const req = httpMock!.expectOne(request => request.url.endsWith('/v2/chat') && request.method === 'POST');
    expect(req.request.url).toBe('http://127.0.0.1:8000/v2/chat');
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(req.request.headers.get('X-Entreprise-Id')).toBe('42');
    expect(req.request.headers.get('X-User-Role')).toBe('EMPLOYEE');
    expect(req.request.headers.get('X-Request-ID')).toMatch(/^chat-/);
    expect(req.request.body.metadata).toEqual(expect.objectContaining({
      role: 'EMPLOYEE',
      agentRole: 'EMPLOYEE',
      agent_role: 'EMPLOYEE',
      currentPage: '/employee/dashboard',
      current_page: '/employee/dashboard',
    }));

    req.flush({ success: true, data: { type: 'answer', text: 'ok' }, warnings: [], error: null });
  });

  it('does not use an MFA challenge token as an AI access token', async () => {
    configure();
    auth.user = null;
    auth.token = null;
    auth.mfaChallenge = { mfaToken: 'temporary-mfa-token' };

    await expect(firstValueFrom(service.sendChatV2('Show my daily summary'))).rejects.toThrow(/session/i);
    expect(httpMock!.match(() => true).length).toBe(0);
  });
});
