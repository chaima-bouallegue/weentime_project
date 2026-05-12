export interface TypeTeletravailConfig {
  id: number;
  libelle: string;
  periode: 'MATIN' | 'APRES_MIDI' | 'JOURNEE_COMPLETE';
  active: boolean;
  icon?: any;
  color?: string;
  desc?: string;
}

export type TypeTeletravail =
  | 'JOURNEE_COMPLETE'
  | 'DEMI_JOURNEE_MATIN'
  | 'DEMI_JOURNEE_APRES_MIDI'
  | 'SEMAINE_COMPLETE';

export type PeriodeDemiJournee = 'MATIN' | 'APRES_MIDI';

export type StatutTeletravail =
  | 'EN_ATTENTE_MANAGER'
  | 'EN_ATTENTE_RH'
  | 'APPROUVE'
  | 'REFUSE'
  | 'ANNULE';

export interface DemandeTeletravail {
  id: number;
  type: TypeTeletravail;
  label: string;
  dateDebut: string;
  dateFin: string;
  nombreJours: number;
  periode?: PeriodeDemiJournee;
  motif: string;
  statut: StatutTeletravail;
  dateCreation: string;
  etapeActuelle?: 'MANAGER' | 'RH' | 'TERMINE' | string;
  commentaireManager?: string;
  commentaireRH?: string;
  [key: string]: unknown;
}

export interface QuotaTeletravail {
  joursAutorises: number;
  joursUtilises: number;
  joursEnAttente: number;
  joursRestants: number;
  periodeDebut: string;
  periodeFin: string;
  [key: string]: unknown;
}

export interface NouvelleDemandeTeletravailRequest {
  typeTeletravailId: number;
  type?: TypeTeletravail;
  dateDebut: string;
  dateFin: string;
  periode?: PeriodeDemiJournee;
  motif: string;
  [key: string]: unknown;
}

export const TELETRAVAIL_STATUS_LABELS: Record<string, string> = {
  EN_ATTENTE_MANAGER: 'En attente manager',
  EN_ATTENTE_RH: 'En attente RH',
  APPROUVE: 'Approuve',
  REFUSE: 'Refuse',
  ANNULE: 'Annule',
  PENDING_MANAGER: 'Pending manager',
  PENDING_RH: 'Pending RH',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EN_ATTENTE: 'En attente',
  VALIDEE: 'Validee',
  REFUSEE: 'Refusee',
};

export const TELETRAVAIL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  EN_ATTENTE_MANAGER: { label: 'En attente manager', color: 'warning', icon: 'clock' },
  EN_ATTENTE_RH: { label: 'En attente RH', color: 'info', icon: 'clock' },
  APPROUVE: { label: 'Approuve', color: 'success', icon: 'check-circle' },
  REFUSE: { label: 'Refuse', color: 'danger', icon: 'x-circle' },
  ANNULE: { label: 'Annule', color: 'muted', icon: 'minus-circle' },
  PENDING_MANAGER: { label: 'Pending manager', color: 'warning', icon: 'clock' },
  PENDING_RH: { label: 'Pending RH', color: 'info', icon: 'clock' },
  APPROVED: { label: 'Approved', color: 'success', icon: 'check-circle' },
  REJECTED: { label: 'Rejected', color: 'danger', icon: 'x-circle' },
  CANCELLED: { label: 'Cancelled', color: 'muted', icon: 'minus-circle' },
  EN_ATTENTE: { label: 'En attente', color: 'warning', icon: 'clock' },
  VALIDEE: { label: 'Validee', color: 'success', icon: 'check-circle' },
  REFUSEE: { label: 'Refusee', color: 'danger', icon: 'x-circle' },
};
