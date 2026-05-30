import { PresenceMemberStatus, PresenceOverview, PresenceStats } from '../presence/models/presence.model';

export interface ManagerUserRef {
  id: number;
  nom: string;
  prenom: string;
  fullName: string;
  email: string;
}

export interface ManagerTeamMember {
  id: number;
  nom: string;
  prenom: string;
  fullName: string;
  email: string;
  poste: string | null;
  departementId: number | null;
  departementNom: string | null;
  equipeId: number | null;
  equipeNom: string | null;
  roles: string[];
  statut: string | null;
  avatarUrl?: string | null;
  presence?: PresenceMemberStatus | null;
}

export interface ManagerTeamSnapshot {
  members: ManagerTeamMember[];
  overview: PresenceOverview | null;
}

export interface ManagerApprovalRequest {
  id: number;
  utilisateurId: number;
  type: 'CONGE' | 'ABSENCE' | 'TELETRAVAIL' | 'AUTORISATION' | 'DOCUMENT';
  statut: 'EN_ATTENTE_MANAGER' | 'EN_ATTENTE_RH' | 'APPROUVE' | 'REFUSE' | 'ANNULE';
  dateCreation: string;
  dateDebut: string | null;
  dateFin: string | null;
  nombreJours: number | null;
  description: string;
  raison: string;
  utilisateur: ManagerUserRef;
}

export interface ManagerDashboardKpis {
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  pendingCount: number;
  attendanceRate: number;
}

export interface ManagerDashboardActivity {
  title: string;
  description: string;
  timestamp: string;
}

export interface ManagerDashboardData {
  kpis: ManagerDashboardKpis;
  members: ManagerTeamMember[];
  pendingRequests: ManagerApprovalRequest[];
  activities: ManagerDashboardActivity[];
  hasLiveSignals: boolean;
}

export interface ManagerPresenceMember {
  id: number;
  name: string;
  avatar: string | null;
  jobTitle: string;
  status: 'ACTIVE' | 'LATE' | 'OFF' | 'ABSENT';
  arrivalTime: string | null;
  departureTime: string | null;
  checkInLocation: string | null;
  checkOutLocation: string | null;
  totalMinutes: number;
  overtimeMinutes: number;
  lastActivity: string;
}

export interface ManagerPresenceKpis {
  totalMembers: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  averagePunctuality: number;
}

export interface ManagerPresenceData {
  team: PresenceOverview | null;
  stats: PresenceStats | null;
  members: ManagerPresenceMember[];
  kpis: ManagerPresenceKpis;
}
