export enum AttendanceSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum AttendanceDayStatus {
  ABSENT = 'ABSENT',
  WORKING = 'WORKING',
  IDLE = 'IDLE',
  LATE = 'LATE',
  REMOTE = 'REMOTE',
  ON_LEAVE = 'ON_LEAVE',
  PRESENT = 'PRESENT',
}

export enum PresenceSource {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  BADGE = 'BADGE',
  MANUAL = 'MANUAL',
  API = 'API',
}

export interface CheckInRequest {
  source?: PresenceSource | string;
  localisation?: string | null;
}

export interface CheckOutRequest {
  localisation?: string | null;
}

export interface AttendanceSession {
  id: number;
  utilisateurId: number;
  userId?: number | string;
  fullName?: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string | null;
  duration: number;
  workedMinutes?: number;
  status: AttendanceSessionStatus | string;
  source?: PresenceSource | string | null;
  localisation?: string | null;
  lateArrival?: boolean;
  dailyStatus?: AttendanceDayStatus | string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface AttendanceSessionView extends AttendanceSession {
  nomComplet?: string;
  equipe?: string;
  departement?: string;
  statutJour?: AttendanceDayStatus | string;
}

export interface Presence {
  utilisateurId: number;
  userId?: number | string;
  date: string;
  status: AttendanceDayStatus;
  lateArrival: boolean;
  hasOpenSession: boolean;
  totalDuration: number;
  workedMinutes?: number;
  heureEntree?: string | null;
  heureSortie?: string | null;
  source?: PresenceSource | string | null;
  activeSession?: AttendanceSession | null;
  sessions?: AttendanceSession[];
  [key: string]: unknown;
}

export interface PresenceMemberStatus {
  id?: number;
  utilisateurId: number;
  userId?: number | string;
  fullName?: string;
  nomComplet: string;
  equipe: string;
  departement?: string;
  status: 'PRESENT' | 'LATE' | 'REMOTE' | 'ON_LEAVE' | 'ABSENT' | 'HALF_DAY' | string;
  lateArrival?: boolean;
  heureEntree?: string | null;
  heureSortie?: string | null;
  durationSeconds?: number;
  workedMinutes?: number;
  source?: PresenceSource | string | null;
  [key: string]: unknown;
}

export interface PresenceOverview {
  date?: string;
  teamId?: number;
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  remoteCount?: number;
  onLeaveCount?: number;
  members: PresenceMemberStatus[];
  [key: string]: unknown;
}

export interface PresenceStats {
  dateFrom: string;
  dateTo: string;
  totalPresent: number;
  totalAbsent: number;
  lateCount: number;
  totalHoursThisWeek: number;
  totalHoursWorked: number;
  averageArrivalTime: string;
  onTimeCount: number;
  overtimeHours: number;
  onTimeArrivals: number;
  lateArrivals: number;
  [key: string]: unknown;
}

export interface GlobalPresenceAnalytics {
  totalHoursWorkedToday: number;
  averageSessionHours: number;
  totalTrackedUsers: number;
  absentToday: number;
  presentToday?: number;
  lateToday?: number;
  remoteToday?: number;
  onLeaveToday?: number;
  departmentDistribution: Record<string, number>;
  [key: string]: unknown;
}

export interface PresenceError {
  status: number;
  code: string;
  message: string;
  timestamp?: string;
}

export type PresenceDTO = Presence;
export type TeamPresence = PresenceOverview;
export type PresenceAnalytics = GlobalPresenceAnalytics;

export interface DailySummary {
  date: string;
  status?: AttendanceDayStatus | string;
  sessions?: AttendanceSession[];
  totalDuration?: number;
  [key: string]: unknown;
}

export interface OvertimeDTO {
  userId?: number | string;
  utilisateurId?: number | string;
  date?: string;
  overtimeHours?: number;
  overtimeMinutes?: number;
  [key: string]: unknown;
}
