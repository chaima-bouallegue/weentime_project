import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService, User } from './auth.service';

export type AnomalyRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AnomalyCategory =
  | 'NONE'
  | 'ABSENCE'
  | 'LATE'
  | 'LATE_ARRIVAL'
  | 'MISSING_CHECKOUT'
  | 'REPEATED_MISSING_CHECKOUT'
  | 'RAPID_SESSION'
  | 'OVERTIME_EXCESS'
  | 'UNUSUAL_WORKING_HOURS'
  | 'NIGHT_ACTIVITY'
  | 'WEEKEND_ACTIVITY'
  | 'HOLIDAY_ACTIVITY'
  | 'SUSPICIOUS_POINTAGE'
  | 'BEHAVIORAL_ANOMALY'
  | string;

export interface DetectedReason {
  code: string;
  label: string;
  description: string;
  value?: string | null;
  expected?: string | null;
}

export interface AttendanceSnapshot {
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  workedMinutes?: number | null;
  lateMinutes?: number | null;
  missingCheckout?: boolean | null;
  isAbsent?: boolean | null;
  isWeekend?: boolean | null;
  overtimeMinutes?: number | null;
  location?: string | null;
}

export interface AnomalyRecord {
  id?: string | null;
  employeeId: number;
  employeeName: string;
  date: string;
  score: number;
  risk: AnomalyRisk;
  severity?: AnomalyRisk | null;
  category?: AnomalyCategory;
  title?: string;
  summary?: string;
  reasons: string[];
  detectedReasons?: DetectedReason[];
  attendanceSnapshot?: AttendanceSnapshot | null;
  recommendation?: string;
  actions?: string[];
  missingDataWarnings?: string[];
  explanation: string;
  features?: Record<string, unknown>;
}

export interface AnomalyDashboardResponse {
  success: boolean;
  /** Retained for back-compat; the service no longer fabricates demo data. */
  isDemo: boolean;
  /** "ok" when presence backend answered, "unavailable" when it errored. */
  backendStatus: 'ok' | 'unavailable' | 'error';
  generatedAt: string;
  totalAnomalies: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  anomalies: AnomalyRecord[];
  sourceEndpoint?: string | null;
  endpointName?: string | null;
  scope?: string | null;
  role?: string | null;
  entrepriseId?: number | null;
  rawRecordsCount?: number;
  parsedRecordsCount?: number;
  returnedAnomaliesCount?: number;
  duplicatesRemoved?: number;
  anomaliesCount?: number;
  ruleAnomaliesCount?: number;
  mlAnomaliesCount?: number;
  skippedRecords?: Array<Record<string, unknown>>;
  zeroReason?: string | null;
  dateUsed?: string | null;
}

export interface EmployeeRiskResponse {
  success: boolean;
  employeeId: number;
  employeeName: string;
  currentRisk: AnomalyRisk;
  score: number;
  anomaliesLast30Days: number;
  trend: 'IMPROVING' | 'STABLE' | 'WORSENING';
  latestAnomaly: AnomalyRecord | null;
}

export type AdminAnomalyStatus = 'UNVERIFIED' | 'IN_PROGRESS' | 'JUSTIFIED' | 'SUSPICIOUS' | 'CLOSED';

export interface AdminAnomalyFilters {
  fromDate?: string | null;
  toDate?: string | null;
  risk?: AnomalyRisk | string | null;
  category?: string | null;
  status?: AdminAnomalyStatus | string | null;
  employeeId?: number | null;
  entrepriseId?: number | null;
  teamId?: number | null;
  page?: number;
  size?: number;
  sort?: string | null;
}

export interface AdminAnomalySummary {
  totalAnomalies: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  employeesConcerned: number;
  anomalyRate: number;
  unverified: number;
  inProgress: number;
  justified: number;
  suspicious: number;
  closed: number;
}

export interface AdminRiskBucket {
  risk: AnomalyRisk;
  count: number;
  percentage: number;
}

export interface AdminTypeBucket {
  category: string;
  label: string;
  count: number;
  percentage: number;
}

export interface AdminDayBucket {
  date: string;
  count: number;
}

export interface AdminTopEmployee {
  employeeId: number;
  employeeName: string;
  count: number;
  highestRisk: AnomalyRisk;
  maxScore: number;
  departmentName?: string | null;
}

export interface AdminAnomalyItem {
  id: string;
  employeeId: number;
  employeeName: string;
  date: string;
  category: string;
  categoryLabel: string;
  risk: AnomalyRisk;
  score: number;
  title: string;
  summary: string;
  reasons: string[];
  detectedReasons: DetectedReason[];
  recommendation: string;
  actions: string[];
  status: AdminAnomalyStatus;
  statusComment?: string | null;
  statusUpdatedAt?: string | null;
  attendanceSnapshot?: AttendanceSnapshot | null;
  missingDataWarnings: string[];
  entrepriseId?: number | null;
  entrepriseName?: string | null;
  managerId?: number | null;
  teamId?: number | null;
  teamName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  source?: string | null;
}

export interface AdminAnomalyDashboardResponse {
  success: boolean;
  generatedAt: string;
  backendStatus: 'ok' | 'unavailable' | 'error';
  sourceEndpoint?: string | null;
  scope?: string | null;
  rawRecordsCount: number;
  parsedRecordsCount: number;
  summary: AdminAnomalySummary;
  byRisk: AdminRiskBucket[];
  byType: AdminTypeBucket[];
  byDay: AdminDayBucket[];
  topEmployees: AdminTopEmployee[];
  topAnomalies: AdminAnomalyItem[];
}

export interface AdminAnomalyListResponse {
  success: boolean;
  generatedAt: string;
  backendStatus: 'ok' | 'unavailable' | 'error';
  total: number;
  page: number;
  size: number;
  totalPages: number;
  summary: AdminAnomalySummary;
  items: AdminAnomalyItem[];
}

export interface AdminStatusUpdateResponse {
  success: boolean;
  anomalyId: string;
  status: AdminAnomalyStatus;
  comment?: string | null;
  updatedAt: string;
}

interface RawAttendanceSnapshot {
  scheduled_start?: string | null;
  scheduledStart?: string | null;
  scheduled_end?: string | null;
  scheduledEnd?: string | null;
  check_in?: string | null;
  checkIn?: string | null;
  check_out?: string | null;
  checkOut?: string | null;
  worked_minutes?: number | null;
  workedMinutes?: number | null;
  late_minutes?: number | null;
  lateMinutes?: number | null;
  missing_checkout?: boolean | null;
  missingCheckout?: boolean | null;
  is_absent?: boolean | null;
  isAbsent?: boolean | null;
  is_weekend?: boolean | null;
  isWeekend?: boolean | null;
  overtime_minutes?: number | null;
  overtimeMinutes?: number | null;
  location?: string | null;
}

interface RawAnomalyRecord {
  id?: string | null;
  employee_id?: number;
  employeeId?: number;
  employee_name?: string;
  employeeName?: string;
  date?: string;
  score?: number;
  risk?: AnomalyRisk;
  severity?: AnomalyRisk | null;
  category?: AnomalyCategory;
  title?: string;
  summary?: string;
  reasons?: string[];
  detected_reasons?: unknown[];
  detectedReasons?: unknown[];
  attendance_snapshot?: RawAttendanceSnapshot | null;
  attendanceSnapshot?: RawAttendanceSnapshot | null;
  recommendation?: string;
  actions?: string[];
  missing_data_warnings?: string[];
  missingDataWarnings?: string[];
  explanation?: string;
  features?: Record<string, unknown>;
}

interface RawAnomalyDashboardResponse {
  success?: boolean;
  is_demo?: boolean;
  isDemo?: boolean;
  backend_status?: string;
  backendStatus?: string;
  generated_at?: string;
  generatedAt?: string;
  total_anomalies?: number;
  totalAnomalies?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  anomalies?: RawAnomalyRecord[];
  source_endpoint?: string | null;
  sourceEndpoint?: string | null;
  endpoint_name?: string | null;
  endpointName?: string | null;
  scope?: string | null;
  role?: string | null;
  entreprise_id?: number | null;
  entrepriseId?: number | null;
  raw_records_count?: number;
  rawRecordsCount?: number;
  parsed_records_count?: number;
  parsedRecordsCount?: number;
  returned_anomalies_count?: number;
  returnedAnomaliesCount?: number;
  duplicates_removed?: number;
  duplicatesRemoved?: number;
  anomalies_count?: number;
  anomaliesCount?: number;
  rule_anomalies_count?: number;
  ruleAnomaliesCount?: number;
  ml_anomalies_count?: number;
  mlAnomaliesCount?: number;
  skipped_records?: Array<Record<string, unknown>>;
  skippedRecords?: Array<Record<string, unknown>>;
  zero_reason?: string | null;
  zeroReason?: string | null;
  date_used?: string | null;
  dateUsed?: string | null;
}

interface RawEmployeeRiskResponse {
  success?: boolean;
  employee_id?: number;
  employeeId?: number;
  employee_name?: string;
  employeeName?: string;
  current_risk?: AnomalyRisk;
  currentRisk?: AnomalyRisk;
  score?: number;
  anomalies_last_30_days?: number;
  anomaliesLast30Days?: number;
  trend?: 'IMPROVING' | 'STABLE' | 'WORSENING';
  latest_anomaly?: RawAnomalyRecord | null;
  latestAnomaly?: RawAnomalyRecord | null;
}

interface RawAdminAnomalyItem extends RawAnomalyRecord {
  category_label?: string;
  categoryLabel?: string;
  status?: string;
  status_comment?: string | null;
  statusComment?: string | null;
  status_updated_at?: string | null;
  statusUpdatedAt?: string | null;
  entreprise_id?: number | null;
  entrepriseId?: number | null;
  entreprise_name?: string | null;
  entrepriseName?: string | null;
  manager_id?: number | null;
  managerId?: number | null;
  team_id?: number | null;
  teamId?: number | null;
  team_name?: string | null;
  teamName?: string | null;
  department_id?: number | null;
  departmentId?: number | null;
  department_name?: string | null;
  departmentName?: string | null;
  source?: string | null;
}

interface RawAdminSummary {
  total_anomalies?: number;
  totalAnomalies?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  employees_concerned?: number;
  employeesConcerned?: number;
  anomaly_rate?: number;
  anomalyRate?: number;
  unverified?: number;
  in_progress?: number;
  inProgress?: number;
  justified?: number;
  suspicious?: number;
  closed?: number;
}

interface RawAdminDashboardResponse {
  success?: boolean;
  generated_at?: string;
  generatedAt?: string;
  backend_status?: string;
  backendStatus?: string;
  source_endpoint?: string | null;
  sourceEndpoint?: string | null;
  scope?: string | null;
  raw_records_count?: number;
  rawRecordsCount?: number;
  parsed_records_count?: number;
  parsedRecordsCount?: number;
  summary?: RawAdminSummary;
  by_risk?: Array<Record<string, unknown>>;
  byRisk?: Array<Record<string, unknown>>;
  by_type?: Array<Record<string, unknown>>;
  byType?: Array<Record<string, unknown>>;
  by_day?: Array<Record<string, unknown>>;
  byDay?: Array<Record<string, unknown>>;
  top_employees?: Array<Record<string, unknown>>;
  topEmployees?: Array<Record<string, unknown>>;
  top_anomalies?: RawAdminAnomalyItem[];
  topAnomalies?: RawAdminAnomalyItem[];
}

interface RawAdminListResponse {
  success?: boolean;
  generated_at?: string;
  generatedAt?: string;
  backend_status?: string;
  backendStatus?: string;
  total?: number;
  page?: number;
  size?: number;
  total_pages?: number;
  totalPages?: number;
  summary?: RawAdminSummary;
  items?: RawAdminAnomalyItem[];
}

const EMPTY_DASHBOARD: AnomalyDashboardResponse = {
  success: false,
  isDemo: false,
  backendStatus: 'unavailable',
  generatedAt: '',
  totalAnomalies: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  anomalies: [],
};

const EMPTY_ADMIN_SUMMARY: AdminAnomalySummary = {
  totalAnomalies: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  employeesConcerned: 0,
  anomalyRate: 0,
  unverified: 0,
  inProgress: 0,
  justified: 0,
  suspicious: 0,
  closed: 0,
};

const EMPTY_ADMIN_DASHBOARD: AdminAnomalyDashboardResponse = {
  success: false,
  generatedAt: '',
  backendStatus: 'unavailable',
  sourceEndpoint: null,
  scope: null,
  rawRecordsCount: 0,
  parsedRecordsCount: 0,
  summary: EMPTY_ADMIN_SUMMARY,
  byRisk: [],
  byType: [],
  byDay: [],
  topEmployees: [],
  topAnomalies: [],
};

const EMPTY_ADMIN_LIST: AdminAnomalyListResponse = {
  success: false,
  generatedAt: '',
  backendStatus: 'unavailable',
  total: 0,
  page: 1,
  size: 20,
  totalPages: 0,
  summary: EMPTY_ADMIN_SUMMARY,
  items: [],
};

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  return values.find(value => value !== undefined && value !== null);
}

function safeBackendStatus(value: unknown): 'ok' | 'unavailable' | 'error' {
  return value === 'unavailable' || value === 'error' ? value : 'ok';
}

const ALLOWED_RISKS: ReadonlySet<AnomalyRisk> = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function safeRisk(value: unknown): AnomalyRisk {
  const upper = String(value || '').toUpperCase() as AnomalyRisk;
  return ALLOWED_RISKS.has(upper) ? upper : 'LOW';
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item)).filter(item => item.trim().length > 0)
    : [];
}

function mapDetectedReasons(value: unknown): DetectedReason[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const raw = item as Record<string, unknown>;
      return {
        code: String(raw['code'] ?? ''),
        label: String(raw['label'] ?? raw['code'] ?? ''),
        description: String(raw['description'] ?? ''),
        value: raw['value'] == null ? null : String(raw['value']),
        expected: raw['expected'] == null ? null : String(raw['expected']),
      };
    })
    .filter(reason => Boolean(reason.code || reason.label || reason.description));
}

function mapSnapshot(raw: RawAttendanceSnapshot | null | undefined): AttendanceSnapshot | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return {
    scheduledStart: firstDefined(raw.scheduledStart, raw.scheduled_start) ?? null,
    scheduledEnd: firstDefined(raw.scheduledEnd, raw.scheduled_end) ?? null,
    checkIn: firstDefined(raw.checkIn, raw.check_in) ?? null,
    checkOut: firstDefined(raw.checkOut, raw.check_out) ?? null,
    workedMinutes: safeNumber(firstDefined(raw.workedMinutes, raw.worked_minutes)),
    lateMinutes: safeNumber(firstDefined(raw.lateMinutes, raw.late_minutes)),
    missingCheckout: Boolean(firstDefined(raw.missingCheckout, raw.missing_checkout) ?? false),
    isAbsent: Boolean(firstDefined(raw.isAbsent, raw.is_absent) ?? false),
    isWeekend: Boolean(firstDefined(raw.isWeekend, raw.is_weekend) ?? false),
    overtimeMinutes: safeNumber(firstDefined(raw.overtimeMinutes, raw.overtime_minutes)),
    location: firstDefined(raw.location) ?? null,
  };
}

function mapAnomalyRecord(raw: RawAnomalyRecord | null | undefined): AnomalyRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const employeeId = safeNumber(firstDefined(raw.employeeId, raw.employee_id));
  const detectedReasons = mapDetectedReasons(firstDefined(raw.detectedReasons, raw.detected_reasons));
  const reasons = toStringArray(raw.reasons);
  const category = raw.category;
  const title = String(raw.title ?? category ?? '').trim();
  const explanation = String(raw.explanation ?? raw.summary ?? category ?? '').trim();
  const summary = String(raw.summary ?? explanation ?? category ?? '').trim();
  const risk = safeRisk(firstDefined(raw.risk, raw.severity));
  return {
    id: raw.id ?? null,
    employeeId,
    employeeName: String(firstDefined(raw.employeeName, raw.employee_name) ?? '').trim() || 'Employé inconnu',
    date: String(raw.date ?? ''),
    score: safeNumber(raw.score),
    risk,
    severity: raw.severity ? safeRisk(raw.severity) : risk,
    category,
    title,
    summary,
    reasons: reasons.length > 0 ? reasons : detectedReasons.map(reason => reason.label),
    detectedReasons,
    attendanceSnapshot: mapSnapshot(firstDefined(raw.attendanceSnapshot, raw.attendance_snapshot)),
    recommendation: String(raw.recommendation ?? '').trim(),
    actions: toStringArray(raw.actions),
    missingDataWarnings: toStringArray(firstDefined(raw.missingDataWarnings, raw.missing_data_warnings)),
    explanation,
    features: raw.features ?? undefined,
  };
}

function anomalyKey(anomaly: AnomalyRecord): string {
  return `${anomaly.employeeId}|${anomaly.date}|${String(anomaly.category || '').toUpperCase()}`;
}

function riskRank(risk: AnomalyRisk): number {
  switch (risk) {
    case 'CRITICAL': return 4;
    case 'HIGH': return 3;
    case 'MEDIUM': return 2;
    case 'LOW': return 1;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return values
    .map(value => String(value ?? '').trim())
    .filter(value => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function dedupeDetectedReasons(values: DetectedReason[]): DetectedReason[] {
  const seen = new Set<string>();
  return values.filter(reason => {
    const key = [
      reason.code,
      reason.label,
      reason.description,
      reason.value ?? '',
      reason.expected ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAnomaly(existing: AnomalyRecord, incoming: AnomalyRecord): AnomalyRecord {
  const primary = incoming.score > existing.score ? incoming : existing;
  const secondary = primary === incoming ? existing : incoming;
  const score = Math.max(existing.score, incoming.score);
  const risk = riskRank(incoming.risk) > riskRank(existing.risk) ? incoming.risk : existing.risk;
  return {
    ...primary,
    score,
    risk,
    severity: risk,
    reasons: uniqueStrings([...existing.reasons, ...incoming.reasons]),
    detectedReasons: dedupeDetectedReasons([
      ...(existing.detectedReasons ?? []),
      ...(incoming.detectedReasons ?? []),
    ]),
    missingDataWarnings: uniqueStrings([
      ...(existing.missingDataWarnings ?? []),
      ...(incoming.missingDataWarnings ?? []),
    ]),
    actions: uniqueStrings([...(existing.actions ?? []), ...(incoming.actions ?? [])]),
    summary: uniqueStrings([primary.summary, secondary.summary]).join(' '),
    explanation: uniqueStrings([primary.explanation, secondary.explanation]).join(' '),
    recommendation: uniqueStrings([primary.recommendation, secondary.recommendation]).join(' '),
    attendanceSnapshot: primary.attendanceSnapshot ?? secondary.attendanceSnapshot ?? null,
    features: { ...(secondary.features ?? {}), ...(primary.features ?? {}) },
  };
}

function dedupeAnomalies(anomalies: AnomalyRecord[]): AnomalyRecord[] {
  const byKey = new Map<string, AnomalyRecord>();
  for (const anomaly of anomalies) {
    const key = anomalyKey(anomaly);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeAnomaly(existing, anomaly) : anomaly);
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

function mapDashboard(raw: RawAnomalyDashboardResponse | null | undefined): AnomalyDashboardResponse {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_DASHBOARD };
  }
  const anomalies = Array.isArray(raw.anomalies)
    ? raw.anomalies.map(mapAnomalyRecord).filter((a): a is AnomalyRecord => a !== null)
    : [];
  const dedupedAnomalies = dedupeAnomalies(anomalies);
  const critical = dedupedAnomalies.filter(anomaly => anomaly.risk === 'CRITICAL').length;
  const high = dedupedAnomalies.filter(anomaly => anomaly.risk === 'HIGH').length;
  const medium = dedupedAnomalies.filter(anomaly => anomaly.risk === 'MEDIUM').length;
  const low = dedupedAnomalies.filter(anomaly => anomaly.risk === 'LOW').length;
  const totalAnomalies = dedupedAnomalies.length === 0
    ? 0
    : dedupedAnomalies.length;
  return {
    success: Boolean(raw.success),
    isDemo: Boolean(firstDefined(raw.isDemo, raw.is_demo)),
    backendStatus: safeBackendStatus(firstDefined(raw.backendStatus, raw.backend_status)),
    generatedAt: String(firstDefined(raw.generatedAt, raw.generated_at) ?? ''),
    totalAnomalies,
    critical,
    high,
    medium,
    low,
    anomalies: dedupedAnomalies,
    sourceEndpoint: firstDefined(raw.sourceEndpoint, raw.source_endpoint) ?? null,
    endpointName: firstDefined(raw.endpointName, raw.endpoint_name) ?? null,
    scope: firstDefined(raw.scope) ?? null,
    role: firstDefined(raw.role) ?? null,
    entrepriseId: firstDefined(raw.entrepriseId, raw.entreprise_id) ?? null,
    rawRecordsCount: safeNumber(firstDefined(raw.rawRecordsCount, raw.raw_records_count)),
    parsedRecordsCount: safeNumber(firstDefined(raw.parsedRecordsCount, raw.parsed_records_count)),
    returnedAnomaliesCount: safeNumber(firstDefined(raw.returnedAnomaliesCount, raw.returned_anomalies_count), totalAnomalies),
    duplicatesRemoved: safeNumber(firstDefined(raw.duplicatesRemoved, raw.duplicates_removed), anomalies.length - dedupedAnomalies.length),
    anomaliesCount: totalAnomalies,
    ruleAnomaliesCount: safeNumber(firstDefined(raw.ruleAnomaliesCount, raw.rule_anomalies_count)),
    mlAnomaliesCount: safeNumber(firstDefined(raw.mlAnomaliesCount, raw.ml_anomalies_count)),
    skippedRecords: firstDefined(raw.skippedRecords, raw.skipped_records) ?? [],
    zeroReason: firstDefined(raw.zeroReason, raw.zero_reason) ?? null,
    dateUsed: firstDefined(raw.dateUsed, raw.date_used) ?? null,
  };
}

function mapEmployeeRisk(raw: RawEmployeeRiskResponse | null | undefined, employeeId: number): EmployeeRiskResponse {
  if (!raw || typeof raw !== 'object') {
    return {
      success: false,
      employeeId,
      employeeName: `Employe #${employeeId}`,
      currentRisk: 'LOW',
      score: 0,
      anomaliesLast30Days: 0,
      trend: 'STABLE',
      latestAnomaly: null,
    };
  }
  const resolvedEmployeeId = safeNumber(firstDefined(raw.employeeId, raw.employee_id), employeeId);
  return {
    success: Boolean(raw.success),
    employeeId: resolvedEmployeeId,
    employeeName: String(firstDefined(raw.employeeName, raw.employee_name) ?? '').trim() || `Employe #${resolvedEmployeeId}`,
    currentRisk: safeRisk(firstDefined(raw.currentRisk, raw.current_risk)),
    score: safeNumber(raw.score),
    anomaliesLast30Days: safeNumber(firstDefined(raw.anomaliesLast30Days, raw.anomalies_last_30_days)),
    trend: raw.trend === 'IMPROVING' || raw.trend === 'WORSENING' ? raw.trend : 'STABLE',
    latestAnomaly: mapAnomalyRecord(firstDefined(raw.latestAnomaly, raw.latest_anomaly)),
  };
}

const ALLOWED_ADMIN_STATUSES: ReadonlySet<AdminAnomalyStatus> = new Set([
  'UNVERIFIED',
  'IN_PROGRESS',
  'JUSTIFIED',
  'SUSPICIOUS',
  'CLOSED',
]);

function safeAdminStatus(value: unknown): AdminAnomalyStatus {
  const upper = String(value || '').toUpperCase() as AdminAnomalyStatus;
  return ALLOWED_ADMIN_STATUSES.has(upper) ? upper : 'UNVERIFIED';
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function nullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapAdminSummary(raw: RawAdminSummary | null | undefined): AdminAnomalySummary {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_ADMIN_SUMMARY };
  }
  return {
    totalAnomalies: safeNumber(firstDefined(raw.totalAnomalies, raw.total_anomalies)),
    critical: safeNumber(raw.critical),
    high: safeNumber(raw.high),
    medium: safeNumber(raw.medium),
    low: safeNumber(raw.low),
    employeesConcerned: safeNumber(firstDefined(raw.employeesConcerned, raw.employees_concerned)),
    anomalyRate: safeNumber(firstDefined(raw.anomalyRate, raw.anomaly_rate)),
    unverified: safeNumber(raw.unverified),
    inProgress: safeNumber(firstDefined(raw.inProgress, raw.in_progress)),
    justified: safeNumber(raw.justified),
    suspicious: safeNumber(raw.suspicious),
    closed: safeNumber(raw.closed),
  };
}

function mapAdminItem(raw: RawAdminAnomalyItem | null | undefined): AdminAnomalyItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const base = mapAnomalyRecord(raw);
  if (!base) {
    return null;
  }
  const category = String(raw.category ?? base.category ?? '');
  return {
    id: String(raw.id ?? base.id ?? `${base.employeeId}:${base.date}:${category}`),
    employeeId: base.employeeId,
    employeeName: base.employeeName,
    date: base.date,
    category,
    categoryLabel: String(firstDefined(raw.categoryLabel, raw.category_label) ?? category.replace(/_/g, ' ')),
    risk: base.risk,
    score: base.score,
    title: base.title || category,
    summary: base.summary || base.explanation,
    reasons: base.reasons,
    detectedReasons: base.detectedReasons ?? [],
    recommendation: base.recommendation ?? '',
    actions: base.actions ?? [],
    status: safeAdminStatus(raw.status),
    statusComment: nullableString(firstDefined(raw.statusComment, raw.status_comment)),
    statusUpdatedAt: nullableString(firstDefined(raw.statusUpdatedAt, raw.status_updated_at)),
    attendanceSnapshot: base.attendanceSnapshot,
    missingDataWarnings: base.missingDataWarnings ?? [],
    entrepriseId: nullableNumber(firstDefined(raw.entrepriseId, raw.entreprise_id)),
    entrepriseName: nullableString(firstDefined(raw.entrepriseName, raw.entreprise_name)),
    managerId: nullableNumber(firstDefined(raw.managerId, raw.manager_id)),
    teamId: nullableNumber(firstDefined(raw.teamId, raw.team_id)),
    teamName: nullableString(firstDefined(raw.teamName, raw.team_name)),
    departmentId: nullableNumber(firstDefined(raw.departmentId, raw.department_id)),
    departmentName: nullableString(firstDefined(raw.departmentName, raw.department_name)),
    source: nullableString(raw.source),
  };
}

function mapRiskBuckets(raw: Array<Record<string, unknown>> | null | undefined): AdminRiskBucket[] {
  return Array.isArray(raw)
    ? raw.map(item => ({
      risk: safeRisk(item['risk']),
      count: safeNumber(item['count']),
      percentage: safeNumber(item['percentage']),
    }))
    : [];
}

function mapTypeBuckets(raw: Array<Record<string, unknown>> | null | undefined): AdminTypeBucket[] {
  return Array.isArray(raw)
    ? raw.map(item => ({
      category: String(item['category'] ?? ''),
      label: String(item['label'] ?? item['category'] ?? ''),
      count: safeNumber(item['count']),
      percentage: safeNumber(item['percentage']),
    }))
    : [];
}

function mapDayBuckets(raw: Array<Record<string, unknown>> | null | undefined): AdminDayBucket[] {
  return Array.isArray(raw)
    ? raw.map(item => ({
      date: String(item['date'] ?? ''),
      count: safeNumber(item['count']),
    })).filter(item => item.date.length > 0)
    : [];
}

function mapTopEmployees(raw: Array<Record<string, unknown>> | null | undefined): AdminTopEmployee[] {
  return Array.isArray(raw)
    ? raw.map(item => ({
      employeeId: safeNumber(firstDefined(item['employeeId'], item['employee_id'])),
      employeeName: String(firstDefined(item['employeeName'], item['employee_name']) ?? ''),
      count: safeNumber(item['count']),
      highestRisk: safeRisk(firstDefined(item['highestRisk'], item['highest_risk'])),
      maxScore: safeNumber(firstDefined(item['maxScore'], item['max_score'])),
      departmentName: nullableString(firstDefined(item['departmentName'], item['department_name'])),
    }))
    : [];
}

function mapAdminDashboard(raw: RawAdminDashboardResponse | null | undefined): AdminAnomalyDashboardResponse {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_ADMIN_DASHBOARD, summary: { ...EMPTY_ADMIN_SUMMARY } };
  }
  return {
    success: Boolean(raw.success),
    generatedAt: String(firstDefined(raw.generatedAt, raw.generated_at) ?? ''),
    backendStatus: safeBackendStatus(firstDefined(raw.backendStatus, raw.backend_status)),
    sourceEndpoint: firstDefined(raw.sourceEndpoint, raw.source_endpoint) ?? null,
    scope: firstDefined(raw.scope) ?? null,
    rawRecordsCount: safeNumber(firstDefined(raw.rawRecordsCount, raw.raw_records_count)),
    parsedRecordsCount: safeNumber(firstDefined(raw.parsedRecordsCount, raw.parsed_records_count)),
    summary: mapAdminSummary(raw.summary),
    byRisk: mapRiskBuckets(firstDefined(raw.byRisk, raw.by_risk)),
    byType: mapTypeBuckets(firstDefined(raw.byType, raw.by_type)),
    byDay: mapDayBuckets(firstDefined(raw.byDay, raw.by_day)),
    topEmployees: mapTopEmployees(firstDefined(raw.topEmployees, raw.top_employees)),
    topAnomalies: (firstDefined(raw.topAnomalies, raw.top_anomalies) ?? [])
      .map(mapAdminItem)
      .filter((item): item is AdminAnomalyItem => item !== null),
  };
}

function mapAdminList(raw: RawAdminListResponse | null | undefined): AdminAnomalyListResponse {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_ADMIN_LIST, summary: { ...EMPTY_ADMIN_SUMMARY } };
  }
  return {
    success: Boolean(raw.success),
    generatedAt: String(firstDefined(raw.generatedAt, raw.generated_at) ?? ''),
    backendStatus: safeBackendStatus(firstDefined(raw.backendStatus, raw.backend_status)),
    total: safeNumber(raw.total),
    page: safeNumber(raw.page, 1),
    size: safeNumber(raw.size, 20),
    totalPages: safeNumber(firstDefined(raw.totalPages, raw.total_pages)),
    summary: mapAdminSummary(raw.summary),
    items: (raw.items ?? []).map(mapAdminItem).filter((item): item is AdminAnomalyItem => item !== null),
  };
}

function buildAdminParams(filters: AdminAnomalyFilters = {}, includePaging = true): HttpParams {
  let params = new HttpParams();
  const entries: Array<[string, string | number | null | undefined]> = [
    ['fromDate', filters.fromDate],
    ['toDate', filters.toDate],
    ['risk', filters.risk],
    ['category', filters.category],
    ['status', filters.status],
    ['employeeId', filters.employeeId],
    ['entrepriseId', filters.entrepriseId],
    ['teamId', filters.teamId],
    ['sort', filters.sort],
  ];
  if (includePaging) {
    entries.push(['page', filters.page], ['size', filters.size]);
  }
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class MlAnomalyService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly baseUrl = (
    environment.mlServiceUrl
    ?? environment.gatewayUrl
    ?? 'http://localhost:8222'
  ).replace(/\/+$/, '');

  getTodayAnomalies(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/today`, 'TODAY');
  }

  getTeamAnomalies(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/manager`, 'MANAGER');
  }

  getRhAnomalies(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/rh`, 'RH');
  }

  getDashboardSummary(): Observable<AnomalyDashboardResponse> {
    return this.fetchDashboard(`${this.baseUrl}/api/ml/anomalies/dashboard?scope=ADMIN`, 'ADMIN');
  }

  getEmployeeRisk(employeeId: number): Observable<EmployeeRiskResponse> {
    const url = `${this.baseUrl}/api/ml/anomalies/employee/${employeeId}`;
    return this.http.get<RawEmployeeRiskResponse>(url).pipe(
      map(response => mapEmployeeRisk(response, employeeId)),
      catchError(() => of(mapEmployeeRisk(null, employeeId))),
    );
  }

  getAdminAnomalyDashboard(filters: AdminAnomalyFilters = {}): Observable<AdminAnomalyDashboardResponse> {
    const url = `${this.baseUrl}/api/ml/anomalies/admin/dashboard`;
    return this.http.get<RawAdminDashboardResponse>(url, {
      headers: this.authHeaders('ADMIN'),
      params: buildAdminParams(filters, false),
    }).pipe(
      map(response => mapAdminDashboard(response)),
    );
  }

  getAdminAnomalies(filters: AdminAnomalyFilters = {}): Observable<AdminAnomalyListResponse> {
    const url = `${this.baseUrl}/api/ml/anomalies/list`;
    return this.http.get<RawAdminListResponse>(url, {
      headers: this.authHeaders('ADMIN'),
      params: buildAdminParams(filters, true),
    }).pipe(
      map(response => mapAdminList(response)),
    );
  }

  getAnomaliesByEmployee(
    employeeId: number,
    filters: AdminAnomalyFilters = {},
  ): Observable<AdminAnomalyListResponse> {
    const url = `${this.baseUrl}/api/ml/anomalies/by-employee`;
    return this.http.get<RawAdminListResponse>(url, {
      headers: this.authHeaders('ADMIN'),
      params: buildAdminParams({ ...filters, employeeId }, true),
    }).pipe(map(response => mapAdminList(response)));
  }

  updateAdminAnomalyStatus(
    anomalyId: string,
    status: AdminAnomalyStatus,
    comment?: string | null,
  ): Observable<AdminStatusUpdateResponse> {
    const url = `${this.baseUrl}/api/ml/anomalies/admin/${encodeURIComponent(anomalyId)}/status`;
    return this.http.patch<AdminStatusUpdateResponse>(
      url,
      { status, comment: comment ?? null },
      { headers: this.authHeaders('ADMIN') },
    );
  }

  exportAdminAnomalies(filters: AdminAnomalyFilters = {}): Observable<Blob> {
    const url = `${this.baseUrl}/api/ml/anomalies/admin/export`;
    return this.http.get(url, {
      headers: this.authHeaders('ADMIN'),
      params: buildAdminParams(filters, false),
      responseType: 'blob',
    });
  }

  private fetchDashboard(url: string, scope: string): Observable<AnomalyDashboardResponse> {
    return this.http.get<RawAnomalyDashboardResponse>(url, { headers: this.authHeaders(scope) }).pipe(
      map(response => mapDashboard(response)),
    );
  }

  private authHeaders(scope: string): HttpHeaders {
    const headers: Record<string, string> = {};
    const user = this.auth.currentUser();
    if (user?.id) {
      headers['X-User-Id'] = String(user.id);
    }
    const role = this.resolveRole(user);
    if (role) {
      headers['X-User-Role'] = role;
      headers['X-Role'] = role;
    }
    const entrepriseId = user?.entrepriseId ?? user?.entreprise?.id;
    if (typeof entrepriseId === 'number' && entrepriseId > 0) {
      const value = String(entrepriseId);
      headers['X-Entreprise-Id'] = value;
      headers['X-Tenant-Id'] = value;
    }
    if (scope) {
      headers['X-Dashboard-Scope'] = scope;
    }
    return new HttpHeaders(headers);
  }

  private resolveRole(user: User | null): string | null {
    const rawRole = typeof user?.role === 'string' && user.role.trim().length > 0
      ? user.role
      : Array.isArray(user?.roles) && user.roles.length > 0
        ? user.roles[0]
        : '';
    const normalized = String(rawRole || '').replace(/^ROLE_/i, '').trim().toUpperCase();
    return normalized || null;
  }
}
