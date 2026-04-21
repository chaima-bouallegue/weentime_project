// ── Absence Models — API-connected types ──

export type AbsenceStatut = 'EN_ATTENTE' | 'APPROUVE' | 'REFUSE' | 'ANNULE';

export type TypeAbsenceCode =
  | 'MALADIE'
  | 'ACCIDENT_TRAVAIL'
  | 'RAISON_PERSONNELLE'
  | 'FORCE_MAJEURE'
  | 'ABSENCE_INJUSTIFIEE';

// ── Request / Response aligned with Spring API ──

export interface AbsenceRequest {
  typeAbsenceId: number;
  dateDebut: string;   // ISO date: 'YYYY-MM-DD'
  dateFin: string;
  motif?: string;
  justificatif?: string; // Fichier en base64
}

export interface AbsenceResponse {
  id: number;
  utilisateurId: number;
  entrepriseId: number;
  managerId?: number;
  typeAbsenceId: number;
  typeAbsenceLibelle: string;
  typeAbsenceCode: string;
  impactSalaire: boolean;
  requireJustificatif: boolean;
  dateDebut: string;
  dateFin: string;
  dureeJours: number;
  statut: AbsenceStatut;
  motif?: string;
  motifRefus?: string;
  justificatif?: string; // Fichier en base64 (si téléchargé ou affiché)
  dateCreation: string;
  dateDecision?: string;
  commentaireValidateur?: string;
}

export interface AbsencePage {
  content: AbsenceResponse[];
  totalElements: number;
  totalPages: number;
  number: number;   // page courante (0-indexed)
  size: number;
}


export interface RejectionRequest {
  motifRefus: string;
}

// ── Static config des types d'absence (pour les cards du stepper) ──

export interface TypeAbsenceConfig {
  code: TypeAbsenceCode;
  libelle: string;
  emoji: string;
  description: string;
  impactSalaire: boolean;
  requireJustificatif: boolean;
  badgeColor: 'red' | 'green' | 'amber';
}

export const ABSENCE_TYPES: TypeAbsenceConfig[] = [
  {
    code: 'MALADIE',
    libelle: 'Maladie',
    emoji: '🤒',
    description: 'Arrêt maladie avec certificat médical',
    impactSalaire: false,
    requireJustificatif: true,
    badgeColor: 'green'
  },
  {
    code: 'ACCIDENT_TRAVAIL',
    libelle: 'Accident de travail',
    emoji: '⚠️',
    description: 'Accident survenu dans le cadre professionnel',
    impactSalaire: false,
    requireJustificatif: true,
    badgeColor: 'green'
  },
  {
    code: 'RAISON_PERSONNELLE',
    libelle: 'Raison personnelle',
    emoji: '🏠',
    description: 'Événement familial ou personnel',
    impactSalaire: false,
    requireJustificatif: false,
    badgeColor: 'amber'
  },
  {
    code: 'FORCE_MAJEURE',
    libelle: 'Force majeure',
    emoji: '🌪️',
    description: 'Événement imprévisible et irrésistible',
    impactSalaire: false,
    requireJustificatif: false,
    badgeColor: 'amber'
  },
  {
    code: 'ABSENCE_INJUSTIFIEE',
    libelle: 'Absence injustifiée',
    emoji: '❌',
    description: 'Absence sans motif valable — impact sur le salaire',
    impactSalaire: true,
    requireJustificatif: false,
    badgeColor: 'red'
  }
];

// ── Helpers ──

export const STATUT_CONFIG: Record<AbsenceStatut, { label: string; cssClass: string }> = {
  EN_ATTENTE: { label: 'En attente',  cssClass: 'badge-amber' },
  APPROUVE:   { label: 'Approuvé',    cssClass: 'badge-green' },
  REFUSE:     { label: 'Refusé',      cssClass: 'badge-red'   },
  ANNULE:     { label: 'Annulé',      cssClass: 'badge-gray'  }
};

export function calcDureeJours(dateDebut: string, dateFin: string): number {
  const d1 = new Date(dateDebut).getTime();
  const d2 = new Date(dateFin).getTime();
  return Math.max(1, Math.round((d2 - d1) / 86_400_000) + 1);
}
