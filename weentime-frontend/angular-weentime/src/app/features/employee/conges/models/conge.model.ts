export type TypeConge =
  | 'ANNUEL'
  | 'MALADIE'
  | 'RTT'
  | 'MATERNITE_PATERNITE'
  | 'EXCEPTIONNEL'
  | 'SANS_SOLDE';

export type StatutDemande =
  | 'EN_ATTENTE'
  | 'EN_ATTENTE_MANAGER'
  | 'EN_ATTENTE_RH'
  | 'APPROUVE'
  | 'APPROUVEE'
  | 'REFUSE'
  | 'REFUSEE'
  | 'ANNULE'
  | 'ANNULEE';

export type StatutConge = StatutDemande;

export interface DemandeConge {
  id: number;
  utilisateurId?: number;
  userName?: string;
  userEmail?: string;
  managerId?: number;
  managerName?: string;
  type: TypeConge;
  label: string;
  dateDebut: string;
  dateFin: string;
  nombreJours: number;
  motif: string;
  commentaire?: string;
  commentaireManager?: string;
  commentaireValidateur?: string;
  statut: StatutDemande;
  dateCreation: string;
  typeCongeId?: number;
  typeCongeNom?: string;
  justificatifFourni?: boolean;
  [key: string]: unknown;
}

export interface SoldeConge {
  type: TypeConge;
  label: string;
  total: number;
  pris: number;
  enAttente: number;
  disponible: number;
  couleur?: string;
  icone?: string;
  [key: string]: unknown;
}

export interface JourFerie {
  date: string;
  label: string;
}

export interface NouvelleDemandeRequest {
  type: TypeConge;
  dateDebut: string;
  dateFin: string;
  motif: string;
  typeCongeId?: number;
  typeCongeNom?: string;
  justificatif?: File | null;
  [key: string]: unknown;
}
