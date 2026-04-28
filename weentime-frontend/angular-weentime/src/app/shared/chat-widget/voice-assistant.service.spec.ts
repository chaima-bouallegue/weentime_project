// @vitest-environment jsdom

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VoiceAssistantService } from './voice-assistant.service';
import { AuthService } from '../../core/services/auth.service';

class FakeAuthService {
  currentUser = () => ({ id: 7, role: 'EMPLOYEE', roles: ['EMPLOYEE'] } as any);
  getToken = () => 'fake-token';
}

describe('VoiceAssistantService — single-blob upload contract', () => {
  let service: VoiceAssistantService;
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

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  it('posts exactly one /audio-stream request per session, with is_final=true and a file', async () => {
    const recorded = [
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
      new Blob([new Uint8Array([5, 6, 7, 8])], { type: 'audio/webm' }),
    ];

    // Exercise the package-private uploadAssembled() helper that Task 5 adds.
    // Implementation detail: the test calls the helper directly rather than
    // driving MediaRecorder, since jsdom has no MediaRecorder.
    const uploadPromise = (service as any).uploadAssembled(recorded, 'audio/webm');

    const requests = httpMock.match(req =>
      req.url.endsWith('/audio-stream') && req.method === 'POST'
    );
    expect(requests.length).toBe(1);
    const body = requests[0].request.body as FormData;
    expect(body.get('is_final')).toBe('true');
    expect(body.get('file')).toBeInstanceOf(Blob);
    expect((body.get('file') as Blob).size).toBe(8);
    requests[0].flush({ success: true, final: true, transcription: 'je veux un congé demain', message: 'ok' });
    await uploadPromise;
  });

  it('does not post during recording, only on finalize', async () => {
    (service as any).recordedChunks = [];
    (service as any).pushChunk(new Blob([new Uint8Array([9, 9])], { type: 'audio/webm' }));
    (service as any).pushChunk(new Blob([new Uint8Array([9, 9])], { type: 'audio/webm' }));

    const requests = httpMock.match(req => req.url.endsWith('/audio-stream'));
    expect(requests.length).toBe(0);
  });
});
