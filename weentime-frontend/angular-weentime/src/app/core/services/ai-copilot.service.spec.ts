import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAiChatRequestPayload,
  resolveAiServiceEndpoint,
  resolvePreferredAiLanguage,
} from './ai-copilot.service';

describe('ai-copilot helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds the v2 chat payload with nested metadata and user id', () => {
    const navigatorMock = { language: 'en-US' } as Navigator;
    vi.stubGlobal('navigator', navigatorMock);

    const payload = buildAiChatRequestPayload('Show my daily summary', 42);

    expect(payload).toEqual({
      message: 'Show my daily summary',
      user_id: 42,
      metadata: {
        channel: 'chat',
        language: 'en',
      },
    });
  });

  it('prefers the gateway aiServiceUrl over the direct debug aiUrl', () => {
    expect(
      resolveAiServiceEndpoint('http://localhost:8322/api/v1/ai/', 'http://localhost:8000/')
    ).toBe('http://localhost:8322/api/v1/ai');
  });

  it('maps supported browser locales to ai language codes', () => {
    expect(resolvePreferredAiLanguage('fr-FR')).toBe('fr');
    expect(resolvePreferredAiLanguage('en-US')).toBe('en');
    expect(resolvePreferredAiLanguage('ar-MA')).toBe('ar');
    expect(resolvePreferredAiLanguage('ar-TN')).toBe('tn');
    expect(resolvePreferredAiLanguage('tn')).toBe('tn');
  });
});
