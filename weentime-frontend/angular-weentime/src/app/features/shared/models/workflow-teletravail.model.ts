import type {
  PeriodeDemiJournee,
  StatutTeletravail,
  TypeTeletravail,
} from '../../employee/teletravail/models/teletravail.model';

export type { PeriodeDemiJournee, StatutTeletravail, TypeTeletravail };

export type WorkflowStatus = StatutTeletravail | 'TOUS' | string;

export interface EmployeWorkflowTeletravail {
  id: number;
  nom: string;
  prenom: string;
  poste: string;
  departement: string;
  avatarInitiales: string;
  email?: string;
  [key: string]: unknown;
}

export interface TeletravailWorkflow {
  id: number;
  utilisateurId?: number;
  type: TypeTeletravail;
  label: string;
  dateDebut: string;
  dateFin: string;
  nombreJours: number;
  periode?: PeriodeDemiJournee;
  motif: string;
  statut: StatutTeletravail;
  dateCreation: string;
  commentaireManager?: string;
  commentaireRH?: string;
  etapeActuelle?: 'MANAGER' | 'RH' | 'TERMINE' | string;
  employe: EmployeWorkflowTeletravail;
  [key: string]: unknown;
}

export interface DemandeTeletravailWorkflow extends TeletravailWorkflow {}

export interface WorkflowTeletravail extends TeletravailWorkflow {}

export interface StatsWorkflow {
  enAttente: number;
  valideesAujourdhui: number;
  refuseesAujourdhui: number;
  totalMois: number;
  [key: string]: unknown;
}

export interface StatsManagerWorkflow extends StatsWorkflow {}

export interface StatsRH {
  enAttente: number;
  approuveCeMois: number;
  refuseCeMois: number;
  tauxApprobation: number;
  moyenneJoursParDemande: number;
  topDepartement: string;
  [key: string]: unknown;
}

export interface DecisionTeletravailRequest {
  id: number;
  commentaire?: string;
  mode?: 'VALIDER' | 'REFUSER' | string;
}
