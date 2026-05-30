export enum AttendanceSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  AUTO_CLOSED = 'AUTO_CLOSED',
}

export enum AttendanceDayStatus {
  ABSENT = 'ABSENT',
  WORKING = 'WORKING',
  IDLE = 'IDLE',
  LATE = 'LATE',
  REMOTE = 'REMOTE',
  ON_LEAVE = 'ON_LEAVE',
  PRESENT = 'PRESENT',
  HOLIDAY = 'HOLIDAY',
  PARTIAL = 'PARTIAL',
  EARLY_LEAVE = 'EARLY_LEAVE',
  AUTO_CLOSED = 'AUTO_CLOSED',
  MISSING_CHECKOUT = 'MISSING_CHECKOUT',
  OUT_OF_ZONE = 'OUT_OF_ZONE',
}

export enum PresenceSource {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  BADGE = 'BADGE',
  MANUAL = 'MANUAL',
  API = 'API',
  AI = 'AI',
  AI_CHATBOT = 'AI_CHATBOT',
}

export interface CheckInRequest {
  source?: PresenceSource | string;
  localisation?: string | null;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  address?: string | null;
}

export interface CheckOutRequest {
  source?: PresenceSource | string;
  localisation?: string | null;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  address?: string | null;
}

export interface AttendanceLocation {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
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
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInAccuracy?: number | null;
  checkInAddress?: string | null;
  checkInLocation?: string | AttendanceLocation | null;
  checkInLocationLabel?: string | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkOutAccuracy?: number | null;
  checkOutAddress?: string | null;
  checkOutLocation?: string | AttendanceLocation | null;
  checkOutLocationLabel?: string | null;
  autoClosed?: boolean;
  autoClosedReason?: string | null;
  overtimeMinutes?: number;
  earlyLeaveMinutes?: number;
  expectedMinutes?: number;
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
  checkInLocation?: string | AttendanceLocation | null;
  checkInLocationLabel?: string | null;
  checkOutLocation?: string | AttendanceLocation | null;
  checkOutLocationLabel?: string | null;
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
  checkInLocation?: string | AttendanceLocation | null;
  checkInLocationLabel?: string | null;
  checkOutLocation?: string | AttendanceLocation | null;
  checkOutLocationLabel?: string | null;
  durationSeconds?: number;
  workedMinutes?: number;
  overtimeMinutes?: number;
  latestAlert?: string | null;
  autoClosed?: boolean;
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
