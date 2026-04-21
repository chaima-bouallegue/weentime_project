export type PresenceStatus = 'ACTIVE' | 'LATE' | 'OFF' | 'ABSENT';

export interface TeamMemberStatus {
  id: number;
  name: string;
  avatar: string | null;
  jobTitle: string;
  status: PresenceStatus;
  arrivalTime: string | null;
  departureTime: string | null;
  totalMinutes: number;
  overtimeMinutes: number;
  lastActivity: string;
}

export interface PresenceKPIs {
  totalMembers: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  averagePunctuality: number;
}

export interface TeamPresenceResponse {
  members: TeamMemberStatus[];
  kpis: PresenceKPIs;
}
