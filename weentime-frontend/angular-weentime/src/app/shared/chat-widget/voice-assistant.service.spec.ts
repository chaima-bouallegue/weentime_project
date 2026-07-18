// @vitest-environment jsdom

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceAssistantService } from './voice-assistant.service';
import { AuthService } from '../../core/services/auth.service';

class FakeAuthService {
  currentUser = () => ({ id: 7, role: 'EMPLOYEE', roles: ['EMPLOYEE'] } as any);
  getToken = () => 'fake-token';
}

describe('VoiceAssistantService — single-blob upload contract', () => {
  let service: VoiceAssistantService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: FakeAuthService },
        VoiceAssistantService,
      ],
    });
    service = TestBed.inject(VoiceAssistantService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts exactly one /v2/voice request per session, with Authorization and a file', async () => {
    const recorded = [
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
      new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'audio/webm' }),
    ];

    const uploadPromise = (service as any).uploadAssembled(recorded, 'audio/webm');

    const requests = httpMock.match(req =>
      req.url.endsWith('/v2/voice') && req.method === 'POST'
    );
    expect(requests.length).toBe(1);
    expect(requests[0].request.headers.get('Authorization')).toBe('Bearer fake-token');
    const body = requests[0].request.body as FormData;
    expect(body.get('generate_tts')).toBe('true');
    expect(body.get('metadata')).toBeTruthy();
    expect(body.get('audio_file')).toBeInstanceOf(Blob);
    expect((body.get('audio_file') as Blob).size).toBe(8);
    requests[0].flush({
      success: true,
      data: {
        transcript: 'je veux un conge demain',
        text: 'ok',
        response: 'ok',
      },
      warnings: [],
      error: null,
    });
    await uploadPromise;
  });

  it('falls back to /audio-stream only when /v2/voice is unavailable', async () => {
    const recorded = [
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
    ];

    const uploadPromise = (service as any).uploadAssembled(recorded, 'audio/webm');
    const v2 = httpMock.expectOne(req => req.url.endsWith('/v2/voice'));
    v2.flush({ error: 'missing' }, { status: 404, statusText: 'Not Found' });
    await new Promise(resolve => setTimeout(resolve, 0));

    const legacy = httpMock.expectOne(req => req.url.endsWith('/audio-stream'));
    const body = legacy.request.body as FormData;
    expect(legacy.request.headers.get('Authorization')).toBe('Bearer fake-token');
    expect(body.get('is_final')).toBe('true');
    expect(body.get('access_token')).toBe('fake-token');
    expect(body.get('file')).toBeInstanceOf(Blob);
    legacy.flush({ success: true, final: true, transcription: 'bonjour', message: 'ok' });

    await uploadPromise;
  });

  it('does not post during recording, only on finalize', async () => {
    (service as any).recordedChunks = [];
    (service as any).pushChunk(new Blob([new Uint8Array([9, 9])], { type: 'audio/webm' }));
    (service as any).pushChunk(new Blob([new Uint8Array([9, 9])], { type: 'audio/webm' }));

    const requests = httpMock.match(req => req.url.endsWith('/audio-stream') || req.url.endsWith('/v2/voice'));
    expect(requests.length).toBe(0);
  });

  it('emits authExpired state on voice 401 without falling back to /audio-stream', async () => {
    const events: Array<Record<string, unknown>> = [];
    service.events$.subscribe(event => events.push(event as Record<string, unknown>));

    (service as any).context = {
      user: { id: 7, role: 'EMPLOYEE', roles: ['EMPLOYEE'] },
      token: 'fake-token',
    };
    (service as any).recordedChunks = [
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
    ];
    (service as any).recorderMimeType = 'audio/webm';
    (service as any).hasHeardVoice = true;

    const finalizePromise = (service as any).doFinalizeStream();

    const request = httpMock.expectOne(req => req.url.endsWith('/v2/voice'));
    request.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    await finalizePromise;

    expect(httpMock.match(req => req.url.endsWith('/audio-stream')).length).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      kind: 'authExpired',
      message: 'Votre session a expire. Veuillez vous reconnecter.',
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'state',
      state: 'authExpired',
    }));
  });
});
