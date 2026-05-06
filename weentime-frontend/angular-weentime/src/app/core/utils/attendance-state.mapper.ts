export type AttendanceUiState = 'NOT_STARTED' | 'ACTIVE' | 'CLOSED' | 'ERROR';

export interface NormalizedAttendanceSession {
  checkInTime: string | null;
  checkOutTime: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedAttendanceSnapshot {
  state: AttendanceUiState;
  checkInTime: string | null;
  checkOutTime: string | null;
  hasOpenSession: boolean;
  activeSession: NormalizedAttendanceSession | null;
  sessions: NormalizedAttendanceSession[];
}

const CHECK_IN_KEYS = [
  'entree',
  'checkInTime',
  'checkIn',
  'heureEntree',
  'heureArrivee',
  'entryTime',
  'startTime',
  'heureDebut'
];

const CHECK_OUT_KEYS = [
  'sortie',
  'checkOutTime',
  'checkOut',
  'heureSortie',
  'heureDepart',
  'exitTime',
  'endTime',
  'heureFin'
];

const ACTIVE_FLAG_KEYS = [
  'active',
  'isActive',
  'hasOpenSession',
  'sessionOpen',
  'isSessionOpen',
  'open'
];

const STATE_KEYS = ['state', 'attendanceState', 'uiState'];
const STATUS_KEYS = ['sessionStatus', 'status', 'attendanceStatus', 'dailyStatus'];

const ACTIVE_STATUS_TOKENS = new Set([
  'ACTIVE',
  'OPEN',
  'STARTED',
  'WORKING',
  'IN_PROGRESS',
  'PRESENT',
  'LATE',
  'ON_DUTY',
  'SESSION_OPEN'
]);

const CLOSED_STATUS_TOKENS = new Set([
  'CLOSED',
  'COMPLETED',
  'COMPLETE',
  'FINISHED',
  'ENDED',
  'DONE',
  'IDLE',
  'SESSION_CLOSED'
]);

const NOT_STARTED_STATUS_TOKENS = new Set([
  'NOT_STARTED',
  'NONE',
  'ABSENT',
  'NEW',
  'UNSTARTED'
]);

const ERROR_STATUS_TOKENS = new Set(['ERROR', 'FAILED', 'FAILURE']);

export function normalizeAttendanceSnapshot(payload: unknown): NormalizedAttendanceSnapshot {
  const root = asRecord(payload);
  if (!root) {
    return {
      state: 'NOT_STARTED',
      checkInTime: null,
      checkOutTime: null,
      hasOpenSession: false,
      activeSession: null,
      sessions: []
    };
  }

  const sessions = collectSessions(root);
  const explicitCheckIn = extractDateTime(root, CHECK_IN_KEYS);
  const explicitCheckOut = extractDateTime(root, CHECK_OUT_KEYS);

  const activeSessionCandidate = resolveActiveSession(root, sessions);
  const checkInTime = explicitCheckIn ?? sessions.find(session => !!session.checkInTime)?.checkInTime ?? activeSessionCandidate?.checkInTime ?? null;
  const checkOutTime = explicitCheckOut ?? [...sessions].reverse().find(session => !!session.checkOutTime)?.checkOutTime ?? null;

  const explicitState = resolveExplicitState(root);
  const activeByFlag = ACTIVE_FLAG_KEYS.some(key => toBoolean(root[key]));
  const openBySession = Boolean(activeSessionCandidate?.checkInTime && !activeSessionCandidate?.checkOutTime);
  const openByTimes = Boolean(checkInTime && !checkOutTime);
  const closedByTimes = Boolean(checkInTime && checkOutTime);
  const closedBySession = sessions.some(session => !!session.checkInTime && !!session.checkOutTime);

  const state = resolveState(explicitState, activeByFlag, openBySession, openByTimes, closedByTimes || closedBySession);

  return {
    state,
    checkInTime,
    checkOutTime,
    hasOpenSession: state === 'ACTIVE',
    activeSession: state === 'ACTIVE'
      ? (activeSessionCandidate
        ?? (checkInTime
          ? { checkInTime, checkOutTime: null, raw: root }
          : null))
      : null,
    sessions
  };
}

function resolveState(
  explicitState: AttendanceUiState | null,
  activeByFlag: boolean,
  openBySession: boolean,
  openByTimes: boolean,
  hasClosedSession: boolean
): AttendanceUiState {
  if (explicitState === 'ERROR') {
    return 'ERROR';
  }

  if (activeByFlag || openBySession || openByTimes) {
    return 'ACTIVE';
  }

  if (hasClosedSession) {
    return 'CLOSED';
  }

  if (explicitState) {
    return explicitState;
  }

  return 'NOT_STARTED';
}

function resolveActiveSession(
  root: Record<string, unknown>,
  sessions: NormalizedAttendanceSession[]
): NormalizedAttendanceSession | null {
  const candidates = [
    root['activeSession'],
    root['currentSession'],
    root['openSession'],
    root['session']
  ];

  for (const candidate of candidates) {
    const mapped = mapSession(candidate);
    if (mapped && mapped.checkInTime && !mapped.checkOutTime) {
      return mapped;
    }
  }

  const fromSessions = sessions.find(session => session.checkInTime && !session.checkOutTime);
  if (fromSessions) {
    return fromSessions;
  }

  const statusDriven = sessions.find(session => {
    const token = normalizeToken(session.raw['status'] ?? session.raw['sessionStatus']);
    return token ? ACTIVE_STATUS_TOKENS.has(token) : false;
  });

  return statusDriven ?? null;
}

function collectSessions(root: Record<string, unknown>): NormalizedAttendanceSession[] {
  const list = asArray(root['sessions'])
    ?? asArray(root['content'])
    ?? asArray(root['history'])
    ?? [];

  const mapped = list
    .map(item => mapSession(item))
    .filter((session): session is NormalizedAttendanceSession => !!session);

  if (mapped.length > 0) {
    return mapped;
  }

  const rootSession = mapSession(root);
  return rootSession ? [rootSession] : [];
}

function mapSession(value: unknown): NormalizedAttendanceSession | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const checkInTime = extractDateTime(record, CHECK_IN_KEYS);
  const checkOutTime = extractDateTime(record, CHECK_OUT_KEYS);
  const looksLikeSession = Boolean(checkInTime || checkOutTime || record['status'] || record['sessionStatus']);

  if (!looksLikeSession) {
    return null;
  }

  return { checkInTime, checkOutTime, raw: record };
}

function resolveExplicitState(root: Record<string, unknown>): AttendanceUiState | null {
  const tokens = [...STATE_KEYS, ...STATUS_KEYS]
    .map(key => normalizeToken(root[key]))
    .filter((token): token is string => !!token);

  for (const token of tokens) {
    if (ERROR_STATUS_TOKENS.has(token)) {
      return 'ERROR';
    }
    if (ACTIVE_STATUS_TOKENS.has(token)) {
      return 'ACTIVE';
    }
    if (CLOSED_STATUS_TOKENS.has(token)) {
      return 'CLOSED';
    }
    if (NOT_STARTED_STATUS_TOKENS.has(token)) {
      return 'NOT_STARTED';
    }
  }

  return null;
}

function extractDateTime(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const token = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return token || null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'oui';
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
