export type TypeDocument =
  | 'ATTESTATION_TRAVAIL'
  | 'BULLETIN_PAIE'
  | 'ATTESTATION_SALAIRE'
  | 'CONTRAT_TRAVAIL'
  | 'CERTIFICAT_CONGE'
  | 'ATTESTATION_ANCIENNETE'
  | 'FICHE_POSTE'
  | 'CERTIFICAT_TRAVAIL'
  | 'AVENANT_CONTRAT'
  | 'FICHE_PAIE'
  | 'TITRE_CONGE'
  | 'DOMICILIATION_SALAIRE'
  | 'BORDEREAU_CNSS'
  | 'ATTESTATION_FORMATION';

export type StatutDocument =
  | 'EN_ATTENTE'
  | 'EN_COURS'
  | 'PRET'
  | 'REFUSE'
  | 'ANNULE'
  | 'PENDING'
  | 'GENERATING'
  | 'READY'
  | 'REJECTED';

export interface TypeDocumentConfig {
  type: TypeDocument;
  label: string;
  description: string;
  icone: string;
  couleur: string;
  delaiEstime: string;
  requiresMois?: boolean;
  [key: string]: unknown;
}

export interface DemandeDocument {
  id: number;
  type?: TypeDocument | string;
  label: string;
  statut: StatutDocument;
  documentStatus?: StatutDocument;
  fileUrl?: string | null;
  motifRejet?: string | null;
  createdAt?: string;
  updatedAt?: string;
  dateCreation: string;
  dateMiseAJour?: string;
  moisConcerne?: string;
  motif?: string;
  commentaireRH?: string;
  documentUrl?: string | null;
  originalFileName?: string;
  hasAttachment?: boolean;
  delaiEstime?: string;
  [key: string]: unknown;
}

export interface NouvelleDemandeDocumentRequest {
  type: TypeDocument;
  moisConcerne?: string;
  motif?: string;
  file?: File | null;
  [key: string]: unknown;
}
