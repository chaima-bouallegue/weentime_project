export enum TypeAutorisation {
  RDV_MEDICAL = 'RDV_MEDICAL',
  SORTIE_ANTICIPEE = 'SORTIE_ANTICIPEE',
  ARRIVEE_TARDIVE = 'ARRIVEE_TARDIVE',
  TELETRAVAIL_EXCEPTIONNEL = 'TELETRAVAIL_EXCEPTIONNEL',
  PAUSE_LONGUE = 'PAUSE_LONGUE',
  MI_TEMPS_EXCEPTIONNEL = 'MI_TEMPS_EXCEPTIONNEL',
  AUTRE = 'AUTRE',
}

export enum StatutAutorisation {
  EN_ATTENTE = 'EN_ATTENTE',
  EN_ATTENTE_MANAGER = 'EN_ATTENTE_MANAGER',
  EN_ATTENTE_RH = 'EN_ATTENTE_RH',
  APPROUVE = 'APPROUVE',
  REFUSE = 'REFUSE',
  ANNULE = 'ANNULE',
  PENDING = 'PENDING',
  PENDING_MANAGER = 'PENDING_MANAGER',
  PENDING_RH = 'PENDING_RH',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  VALIDEE = 'VALIDEE',
  REFUSEE = 'REFUSEE',
}

export interface PageResponse<T> {
  content: T[];
  totalElements?: number;
  totalPages?: number;
  number?: number;
  size?: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
}

export interface UtilisateurAutorisation {
  id: number;
  nom?: string;
  prenom?: string;
  fullName?: string;
  email?: string;
}

export interface Autorisation {
  id: number;
  utilisateurId: number;
  utilisateur?: UtilisateurAutorisation;
  nomComplet?: string;
  managerId?: number;
  typeAutorisation: TypeAutorisation;
  typeAutorisationLabel?: string;
  dateAutorisation: string;
  heureDebut?: string;
  heureFin?: string;
  duree: number;
  motif: string;
  commentaire?: string;
  commentaireValidateur?: string;
  statut: StatutAutorisation;
  dateCreation: string;
  dateDecision?: string;
  entrepriseId?: number;
}

export type DemandeAutorisation = Autorisation;

export interface NouvelleAutorisationRequest {
  type: TypeAutorisation | string;
  date: string;
  heureDebut: string;
  heureFin: string;
  motif: string;
  justificatif?: File | null;
  [key: string]: unknown;
}

export interface StatsAutorisation {
  total: number;
  enAttente: number;
  approuvees: number;
  refusees?: number;
  annulees?: number;
  seuil?: number;
  [key: string]: unknown;
}

export const TYPE_AUTORISATION_LABELS: Record<string, string> = {
  [TypeAutorisation.RDV_MEDICAL]: 'RDV Medical',
  [TypeAutorisation.SORTIE_ANTICIPEE]: 'Sortie anticipee',
  [TypeAutorisation.ARRIVEE_TARDIVE]: 'Arrivee tardive',
  [TypeAutorisation.TELETRAVAIL_EXCEPTIONNEL]: 'Teletravail exceptionnel',
  [TypeAutorisation.PAUSE_LONGUE]: 'Pause longue',
  [TypeAutorisation.MI_TEMPS_EXCEPTIONNEL]: 'Mi-temps exceptionnel',
  [TypeAutorisation.AUTRE]: 'Autre',
};

export const STATUT_AUTORISATION_LABELS: Record<string, string> = {
  [StatutAutorisation.EN_ATTENTE]: 'En attente',
  [StatutAutorisation.EN_ATTENTE_MANAGER]: 'Attente manager',
  [StatutAutorisation.EN_ATTENTE_RH]: 'Attente RH',
  [StatutAutorisation.APPROUVE]: 'Approuve',
  [StatutAutorisation.REFUSE]: 'Refuse',
  [StatutAutorisation.ANNULE]: 'Annule',
  [StatutAutorisation.PENDING]: 'Pending',
  [StatutAutorisation.PENDING_MANAGER]: 'Pending manager',
  [StatutAutorisation.PENDING_RH]: 'Pending RH',
  [StatutAutorisation.APPROVED]: 'Approved',
  [StatutAutorisation.REJECTED]: 'Rejected',
  [StatutAutorisation.CANCELLED]: 'Cancelled',
  [StatutAutorisation.VALIDEE]: 'Validee',
  [StatutAutorisation.REFUSEE]: 'Refusee',
};

export const AUTORISATION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  EN_ATTENTE: { label: 'En attente', color: 'warning', icon: 'clock' },
  EN_ATTENTE_MANAGER: { label: 'Attente manager', color: 'warning', icon: 'clock' },
  EN_ATTENTE_RH: { label: 'Attente RH', color: 'info', icon: 'shield' },
  APPROUVE: { label: 'Approuve', color: 'success', icon: 'check-circle' },
  REFUSE: { label: 'Refuse', color: 'danger', icon: 'x-circle' },
  ANNULE: { label: 'Annule', color: 'muted', icon: 'minus-circle' },
  PENDING: { label: 'Pending', color: 'warning', icon: 'clock' },
  PENDING_MANAGER: { label: 'Pending manager', color: 'warning', icon: 'clock' },
  PENDING_RH: { label: 'Pending RH', color: 'info', icon: 'shield' },
  APPROVED: { label: 'Approved', color: 'success', icon: 'check-circle' },
  REJECTED: { label: 'Rejected', color: 'danger', icon: 'x-circle' },
  CANCELLED: { label: 'Cancelled', color: 'muted', icon: 'minus-circle' },
  VALIDEE: { label: 'Validee', color: 'success', icon: 'check-circle' },
  REFUSEE: { label: 'Refusee', color: 'danger', icon: 'x-circle' },
};

export const STATUT_CONFIG = AUTORISATION_STATUS_CONFIG;

export type AttachmentRequirement = 'HIDDEN' | 'OPTIONAL' | 'REQUIRED';

export const ATTACHMENT_CONFIG: Record<TypeAutorisation, AttachmentRequirement> = {
  [TypeAutorisation.RDV_MEDICAL]: 'OPTIONAL',
  [TypeAutorisation.SORTIE_ANTICIPEE]: 'OPTIONAL',
  [TypeAutorisation.ARRIVEE_TARDIVE]: 'OPTIONAL',
  [TypeAutorisation.TELETRAVAIL_EXCEPTIONNEL]: 'OPTIONAL',
  [TypeAutorisation.PAUSE_LONGUE]: 'OPTIONAL',
  [TypeAutorisation.MI_TEMPS_EXCEPTIONNEL]: 'REQUIRED',
  [TypeAutorisation.AUTRE]: 'OPTIONAL',
};
