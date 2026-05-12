export enum ReunionType {
  PRESENTIEL = 'PRESENTIEL',
  EN_LIGNE = 'EN_LIGNE'
}

export enum ReunionStatut {
  PLANIFIEE = 'PLANIFIEE',
  EN_COURS = 'EN_COURS',
  CLOTUREE = 'CLOTUREE',
  ANNULEE = 'ANNULEE'
}

export enum ReunionRecurrence {
  AUCUNE = 'AUCUNE',
  QUOTIDIEN = 'QUOTIDIEN',
  HEBDOMADAIRE = 'HEBDOMADAIRE',
  MENSUEL = 'MENSUEL'
}

export enum RSVPResponse {
  CONFIRME = 'CONFIRME',
  DECLINE = 'DECLINE',
  EN_ATTENTE = 'EN_ATTENTE'
}

export interface ParticipantReunion {
  utilisateurId: number;
  reponse: RSVPResponse;
  present: boolean;
  rappelMinutes: number;
  nom?: string;
  prenom?: string;
  photo?: string;
}

export interface Reunion {
  id?: number;
  uuid: string;
  titre: string;
  description: string;
  dateReunion: string;
  heureDebut: string;
  heureFin: string;
  type: ReunionType;
  lieu?: string;
  lienVisio?: string;
  statut: ReunionStatut;
  recurrence: ReunionRecurrence;
  organisateurId: number;
  entrepriseId: number;
  compteRendu?: string;
  agenda?: string;
  participants: ParticipantReunion[];
}

export interface ReunionCreateRequest {
  titre: string;
  description: string;
  dateReunion: string;
  heureDebut: string;
  heureFin: string;
  type: ReunionType;
  lieu?: string;
  lienVisio?: string;
  recurrence: ReunionRecurrence;
  participantIds: number[];
  agenda?: string;
}

export interface ConflictDetail {
  userId: number;
  nom: string;
  raison: string;
}

export interface ConflictResponse {
  conflicts: ConflictDetail[];
}
