const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;

export function parseApiDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();
  if (!raw) {
    return null;
  }

  if (DATE_ONLY_PATTERN.test(raw)) {
    const date = new Date(`${raw}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (LOCAL_DATE_TIME_PATTERN.test(raw)) {
    const normalized = raw.includes('.') ? raw : `${raw}`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLocalTime(value: unknown, locale = 'fr-FR'): string {
  const date = parseApiDate(value);
  if (!date) {
    return '--:--';
  }

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatLocalDate(value: unknown, locale = 'fr-FR'): string {
  const date = parseApiDate(value);
  if (!date) {
    return '--';
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function diffMinutes(start: unknown, end: unknown = new Date()): number {
  const startDate = parseApiDate(start);
  const endDate = parseApiDate(end);

  if (!startDate || !endDate) {
    return 0;
  }

  const durationMs = endDate.getTime() - startDate.getTime();
  return Math.max(0, Math.floor(durationMs / 60000));
}
