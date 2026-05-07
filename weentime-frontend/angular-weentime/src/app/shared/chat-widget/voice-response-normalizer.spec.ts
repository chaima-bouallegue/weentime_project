import { describe, expect, it } from 'vitest';
import { normalizeVoiceAiResponse } from './voice-response-normalizer';

describe('normalizeVoiceAiResponse', () => {
  it('normalizes /audio-stream legacy shape', () => {
    const result = normalizeVoiceAiResponse({
      success: true,
      transcription: 'je suis pointe',
      message: 'Vous etes pointe.',
      audio_url: '/audio/a.wav',
      warnings: ['legacy'],
    });

    expect(result.success).toBe(true);
    expect(result.transcript).toBe('je suis pointe');
    expect(result.assistantText).toBe('Vous etes pointe.');
    expect(result.audioUrl).toBe('/audio/a.wav');
    expect(result.warnings).toEqual(['legacy']);
  });

  it('normalizes /voice legacy shape', () => {
    const result = normalizeVoiceAiResponse({
      transcription: 'pointer mon entree',
      text: 'Confirmez-vous cette action ?',
      status: 'confirm',
      audio_url: '/audio/voice.wav',
    });

    expect(result.transcript).toBe('pointer mon entree');
    expect(result.assistantText).toBe('Confirmez-vous cette action ?');
    expect(result.audioUrl).toBe('/audio/voice.wav');
    expect(result.status).toBe('confirm');
  });

  it('normalizes /v2/voice envelope shape', () => {
    const result = normalizeVoiceAiResponse({
      success: true,
      data: {
        transcript: 'check me in',
        response: 'Please confirm.',
        audioUrl: '/audio/v2.wav',
        requiresConfirmation: true,
        confirmationId: 'confirm-1',
        toolCalls: [{ name: 'check_in' }],
        actionResult: { pending: true },
        warnings: ['data-warning'],
      },
      warnings: ['root-warning'],
    });

    expect(result.transcript).toBe('check me in');
    expect(result.assistantText).toBe('Please confirm.');
    expect(result.audioUrl).toBe('/audio/v2.wav');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationId).toBe('confirm-1');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.actionResult).toEqual({ pending: true });
    expect(result.warnings).toEqual(['root-warning', 'data-warning']);
  });

  it('normalizes /v2/chat envelope shape', () => {
    const result = normalizeVoiceAiResponse({
      success: true,
      data: {
        text: 'Vous etes actif.',
        intent: 'attendance.status',
        agent: 'attendance',
        request_id: 'req-123',
      },
    });

    expect(result.assistantText).toBe('Vous etes actif.');
    expect(result.intent).toBe('attendance.status');
    expect(result.agent).toBe('attendance');
    expect(result.requestId).toBe('req-123');
  });

  it('uses configured extraction priority', () => {
    const result = normalizeVoiceAiResponse({
      transcript: 'legacy transcript',
      transcription: 'legacy transcription',
      text: 'legacy text',
      message: 'legacy message',
      response: 'legacy response',
      audio_url: '/legacy.wav',
      audioUrl: '/legacy-camel.wav',
      data: {
        transcript: 'modern transcript',
        text: 'modern text',
        response: 'modern response',
        audioUrl: '/modern.wav',
      },
    });

    expect(result.transcript).toBe('modern transcript');
    expect(result.assistantText).toBe('modern text');
    expect(result.audioUrl).toBe('/modern.wav');
  });

  it('handles null and unknown values safely', () => {
    expect(() => normalizeVoiceAiResponse(null)).not.toThrow();
    expect(normalizeVoiceAiResponse(null).assistantText).toBeNull();
    expect(normalizeVoiceAiResponse('plain').success).toBe(false);
  });

  it('uses actionResult read_result summary when text is missing', () => {
    const result = normalizeVoiceAiResponse({
      success: true,
      data: {
        actionResult: {
          data: {
            read_result: {
              kind: 'read_result',
              summary: 'Il vous reste 12 jours de conge.',
              count: 1,
              items: [],
            },
          },
        },
      },
    });

    expect(result.assistantText).toBe('Il vous reste 12 jours de conge.');
    expect(result.actionResult).toEqual({
      data: {
        read_result: {
          kind: 'read_result',
          summary: 'Il vous reste 12 jours de conge.',
          count: 1,
          items: [],
        },
      },
    });
  });

  it('normalizes root action_result read_result summaries', () => {
    const result = normalizeVoiceAiResponse({
      success: true,
      action_result: {
        read_result: {
          kind: 'read_result',
          summary: 'Vous avez 3 demandes recentes.',
          count: 3,
          items: [{ status: 'EN_ATTENTE' }],
        },
      },
    });

    expect(result.assistantText).toBe('Vous avez 3 demandes recentes.');
    expect(result.actionResult).toEqual({
      read_result: {
        kind: 'read_result',
        summary: 'Vous avez 3 demandes recentes.',
        count: 3,
        items: [{ status: 'EN_ATTENTE' }],
      },
    });
  });
});
