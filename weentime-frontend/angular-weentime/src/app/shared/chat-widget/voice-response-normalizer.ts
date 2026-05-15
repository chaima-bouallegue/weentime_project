export interface NormalizedVoiceAiResponse {
  success: boolean;
  transcript: string | null;
  assistantText: string | null;
  audioUrl: string | null;
  audioStatus: string | null;
  detectedLanguage: string | null;
  intent: string | null;
  agent: string | null;
  requiresConfirmation: boolean;
  confirmationId: string | null;
  toolCalls: unknown[];
  actionResult: unknown | null;
  fallback: UnknownRecord | null;
  status: string | null;
  error: string | null;
  warnings: string[];
  requestId: string | null;
  raw: unknown;
}

type UnknownRecord = Record<string, unknown>;

export function normalizeVoiceAiResponse(raw: unknown): NormalizedVoiceAiResponse {
  try {
    const root = asRecord(raw);
    if (!root) {
      return emptyNormalizedResponse(raw);
    }
    const data = asRecord(root?.['data']);
    const actionResult = firstDefined(
      data?.['actionResult'],
      data?.['action_result'],
      root?.['actionResult'],
      root?.['action_result'],
    ) ?? null;
    const readResult = readActionResultSummary(actionResult);
    const error = readError(root, data);
    const success = typeof root?.['success'] === 'boolean'
      ? root['success'] as boolean
      : !error;

    return {
      success,
      transcript: firstString(
        data?.['transcript'],
        data?.['transcription'],
        root?.['transcript'],
        root?.['transcription'],
        root?.['partial'],
      ),
      assistantText: firstString(
        data?.['text'],
        data?.['response'],
        data?.['message'],
        readResult,
        root?.['text'],
        root?.['response'],
        root?.['message'],
      ),
      audioUrl: firstString(
        data?.['audioUrl'],
        data?.['audio_url'],
        root?.['audioUrl'],
        root?.['audio_url'],
        root?.['audio'],
      ),
      audioStatus: firstString(
        data?.['audioStatus'],
        data?.['audio_status'],
        root?.['audioStatus'],
        root?.['audio_status'],
      ),
      detectedLanguage: firstString(
        data?.['detectedLanguage'],
        data?.['detected_language'],
        root?.['detectedLanguage'],
        root?.['detected_language'],
      ),
      intent: firstString(data?.['intent'], root?.['intent']),
      agent: firstString(data?.['agent'], root?.['agent']),
      requiresConfirmation: firstBoolean(
        data?.['requiresConfirmation'],
        data?.['requires_confirmation'],
        root?.['requiresConfirmation'],
        root?.['requires_confirmation'],
      ),
      confirmationId: firstString(
        data?.['confirmationId'],
        data?.['confirmation_id'],
        root?.['confirmationId'],
        root?.['confirmation_id'],
      ),
      toolCalls: firstArray(data?.['toolCalls'], data?.['tool_calls'], root?.['toolCalls'], root?.['tool_calls']),
      actionResult,
      fallback: asRecord(data?.['fallback']) ?? asRecord(root?.['fallback']),
      status: firstString(data?.['status'], data?.['type'], root?.['status'], root?.['type']),
      error,
      warnings: uniqueStrings([
        ...toStringArray(root?.['warnings']),
        ...toStringArray(data?.['warnings']),
      ]),
      requestId: firstString(
        data?.['request_id'],
        data?.['requestId'],
        root?.['request_id'],
        root?.['requestId'],
      ),
      raw,
    };
  } catch {
    return emptyNormalizedResponse(raw);
  }
}

function emptyNormalizedResponse(raw: unknown): NormalizedVoiceAiResponse {
  return {
    success: false,
    transcript: null,
    assistantText: null,
    audioUrl: null,
    audioStatus: null,
    detectedLanguage: null,
    intent: null,
    agent: null,
    requiresConfirmation: false,
    confirmationId: null,
    toolCalls: [],
    actionResult: null,
    fallback: null,
    status: null,
    error: null,
    warnings: [],
    requestId: null,
    raw,
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return false;
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function firstDefined(...values: unknown[]): unknown | undefined {
  return values.find(value => value !== undefined && value !== null);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter((item): item is string => item.length > 0);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function readError(root: UnknownRecord | null, data: UnknownRecord | null): string | null {
  const direct = firstString(data?.['error'], root?.['error']);
  if (direct) {
    return direct;
  }

  const rootError = asRecord(root?.['error']);
  const dataError = asRecord(data?.['error']);
  return firstString(
    dataError?.['message'],
    dataError?.['code'],
    rootError?.['message'],
    rootError?.['code'],
  );
}

function readActionResultSummary(actionResult: unknown): string | null {
  const result = asRecord(actionResult);
  const resultData = asRecord(result?.['data']);
  const readResult = asRecord(resultData?.['read_result']) ?? asRecord(result?.['read_result']);
  return firstString(readResult?.['summary']);
}
