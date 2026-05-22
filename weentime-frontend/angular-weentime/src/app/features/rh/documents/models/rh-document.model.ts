export type StatutDocumentRH =
  | 'DEMANDE_RECUE'
  | 'EN_REVISION'
  | 'VALIDE'
  | 'SIGNE'
  | 'ENVOYE'
  | 'EN_ATTENTE'
  | 'EN_COURS'
  | 'PRET'
  | 'REFUSE'
  | 'ANNULE'
  | 'PENDING'
  | 'GENERATING'
  | 'READY'
  | 'REJECTED';

export type TypeDocumentRH =
  | 'ATTESTATION_TRAVAIL'
  | 'BULLETIN_PAIE'
  | 'ATTESTATION_SALAIRE'
  | 'CONTRAT_TRAVAIL'
  | 'CERTIFICAT_CONGE'
  | 'ATTESTATION_ANCIENNETE'
  | 'FICHE_POSTE'
  | string;

export interface EmployeDocumentRH {
  id: number;
  nom: string;
  prenom: string;
  poste: string;
  departement: string;
  email: string;
  entrepriseId?: number;
  dateEntree: string;
  [key: string]: unknown;
}

export interface DemandeDocumentRH {
  id: number;
  type: TypeDocumentRH;
  label: string;
  statut: StatutDocumentRH;
  dateCreation: string;
  dateMiseAJour?: string;
  moisConcerne?: string;
  motif?: string;
  commentaireRH?: string;
  delaiEstime: string;
  urgente?: boolean;
  generatedByAI?: boolean;
  contenuIA?: string;
  aiModelUsed?: string;
  tokensUsed?: number;
  documentUrl?: string | null;
  employe: EmployeDocumentRH;
  [key: string]: unknown;
}

export interface TypeDocumentConfig {
  id: number;
  code: string;
  libelle: string;
  description?: string;
  modeGeneration: 'TEMPLATE_ONLY' | 'AI_HYBRID' | 'AI_FULL' | 'MANUAL_UPLOAD';
  contentTemplate?: string;
  aiPromptTemplate?: string;
  aiTemperature?: number;
  aiModel?: string;
  workflowType: 'RH_VALIDATION' | 'AUTO_APPROVE' | 'MANAGER_VALIDATION';
  niveauConfidentialite: 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL';
  delaiTraitementJours: number;
  maxDemandesParMois?: number;
  languesDisponibles: string;
}

export interface StatsDocuments {
  enAttente: number;
  enCours: number;
  prets: number;
  urgentes: number;
  tauxTraitement: number;
  refusees?: number;
  annulees?: number;
  total?: number;
  [key: string]: unknown;
}

export interface DocumentActionRequest {
  id: number;
  commentaireRH?: string;
  documentUrl?: string;
  contenuIA?: string;
  generatedByAI?: boolean;
}

export interface AIGenerationResult {
  contenu: string;
  type?: string;
  employeNom?: string;
  dateGeneration?: string;
  [key: string]: unknown;
}
