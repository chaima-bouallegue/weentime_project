export type SupportedLanguage = 'fr' | 'en' | 'ar' | 'tn';

export type VocalIntentType =
  | 'DEMANDE_CONGE'
  | 'SOLDE_CONGE'
  | 'POINTAGE_ENTREE'
  | 'POINTAGE_SORTIE'
  | 'DEMANDE_TELETRAVAIL'
  | 'VALIDATION_CONGE'
  | 'ABSENCES_EQUIPE'
  | 'PLANNING_SEMAINE'
  | 'STATUT_DEMANDE'
  | 'AIDE_GENERALE'
  | string;

export interface VocalEntity {
  type: string;
  value: string;
  normalized?: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface VocalIntent {
  type: VocalIntentType;
  confidence: number;
  entities: VocalEntity[];
  langue: SupportedLanguage;
  rawText: string;
  timestamp: Date | string;
  [key: string]: unknown;
}
