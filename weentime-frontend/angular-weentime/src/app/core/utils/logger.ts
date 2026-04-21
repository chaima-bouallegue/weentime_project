import { environment } from '../../../environments/environment';

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_REGEX = /\beyJ[a-zA-Z0-9._-]+\b/g;
const SENSITIVE_KEYS = new Set([
  'password',
  'motdepasse',
  'token',
  'temptoken',
  'authorization',
  'email',
  'user',
  'credentials'
]);

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function logDebug(message: string, details?: unknown): void {
  writeLog('debug', message, details);
}

export function logInfo(message: string, details?: unknown): void {
  writeLog('info', message, details);
}

export function logWarn(message: string, details?: unknown): void {
  writeLog('warn', message, details);
}

export function logError(message: string, details?: unknown): void {
  writeLog('error', message, details);
}

export function extractErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return sanitizeString(error);
  }

  if (error && typeof error === 'object') {
    const candidate = error as {
      error?: { details?: unknown; message?: unknown; error?: unknown } | string;
      message?: unknown;
      statusText?: unknown;
      code?: unknown;
    };

    const nestedError = candidate.error;
    if (typeof nestedError === 'string' && nestedError.trim()) {
      return sanitizeString(nestedError);
    }

    const nestedPayload = typeof nestedError === 'object' && nestedError !== null
      ? nestedError as Record<string, unknown>
      : null;
    const nestedMessage = nestedPayload
      ? [
          nestedPayload['details'],
          nestedPayload['message'],
          nestedPayload['error']
        ].find(value => typeof value === 'string' && value.trim().length > 0)
      : undefined;

    if (typeof nestedMessage === 'string') {
      return sanitizeString(nestedMessage);
    }

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return sanitizeString(candidate.message);
    }

    if (typeof candidate.statusText === 'string' && candidate.statusText.trim()) {
      return sanitizeString(candidate.statusText);
    }

    if (typeof candidate.code === 'string' && candidate.code.trim()) {
      return sanitizeString(candidate.code);
    }
  }

  return 'Unknown error';
}

export function toErrorSummary(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') {
    const candidate = error as {
      name?: unknown;
      status?: unknown;
      url?: unknown;
      code?: unknown;
    };

    return sanitizeForLogging({
      name: candidate.name,
      status: candidate.status,
      url: candidate.url,
      code: candidate.code,
      message: extractErrorMessage(error)
    }) as Record<string, unknown>;
  }

  return { message: extractErrorMessage(error) };
}

export function sanitizeForLogging<T>(value: T): T {
  return sanitizeValue(value, 0) as T;
}

function writeLog(level: LogLevel, message: string, details?: unknown): void {
  if (environment.production) {
    return;
  }

  const writer = console[level] ?? console.log;
  if (details === undefined) {
    writer.call(console, message);
    return;
  }

  writer.call(console, message, sanitizeForLogging(details));
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) {
    return '[TRUNCATED]';
  }

  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, depth + 1));
  }

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entryValue]) => {
    const normalizedKey = key.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      acc[key] = '[REDACTED]';
      return acc;
    }

    acc[key] = sanitizeValue(entryValue, depth + 1);
    return acc;
  }, {});
}

function sanitizeString(value: string): string {
  return value
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(TOKEN_REGEX, '[REDACTED_TOKEN]');
}
