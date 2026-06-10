export type PointageType = 'ENTREE' | 'SORTIE';
export type AttendanceUiState = 'NOT_STARTED' | 'ACTIVE' | 'CLOSED' | 'ON_LEAVE' | 'HOLIDAY' | 'AUTO_CLOSED' | 'ERROR';
export type GpsCaptureStatus = 'idle' | 'requesting' | 'captured' | 'denied' | 'unavailable';
export type OvertimeMode = 'NONE' | 'WAITING_CONFIRMATION' | 'ACTIVE' | 'FINISHED';

export interface PointageLocation {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface PointageEntry {
  id?:              number;
  utilisateurId:    number;
  type:             PointageType;
  timestamp:        string;
  heureEntree?:     string;
  heureSortie?:     string;
  duree?:           number;
  dureeMinutes?:    number;
  estEnRetard?:     boolean;
  minutesRetard?:   number;
  isAutoClosed?:    boolean;
  overtimeMinutes?: number;
  latitude?:        number;
  longitude?:       number;
  accuracy?:        number;
  address?:         string;
  location?:        string;
  locationDetails?: PointageLocation | null;
  checkInLocation?: string;
  checkOutLocation?: string;
  latestAlert?:     string;
}

export interface DayStatus {
  jour:          string;
  statut:        'OK' | 'RETARD' | 'ABSENT' | 'OFF';
  minutes:       number;
  objectifHeures: number;
}

export interface PointageStats {
  ponctualitePct:    number;
  soldeConges:       number;
  heuresAujourdhui:  string;
  heuresSemaine:     string;
  minutesAujourdhui: number;
  minutesSemaine:    number;
  joursParStatus:    DayStatus[];
}

export interface TodayPointageSummary {
  state?: string;
  status?: string;
  canCheckIn?: boolean;
  canCheckOut?: boolean;
  reasonIfBlocked?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  expectedMinutes?: number;
  workedMinutes?: number;
  overtimePreview?: number;
  overtimeMinutes?: number;
  overtimeMode?: OvertimeMode | string | null;
  overtimeConfirmed?: boolean;
  showCheckoutAlert?: boolean;
  overtimeStartedAt?: string | null;
  overtimeLabel?: string | null;
  checkInLocation?: string | PointageLocation | null;
  checkInLocationLabel?: string | null;
  checkOutLocation?: string | PointageLocation | null;
  checkOutLocationLabel?: string | null;
  leaveOrHolidayInfo?: string | null;
  latestAlert?: string | null;
  [key: string]: unknown;
}
