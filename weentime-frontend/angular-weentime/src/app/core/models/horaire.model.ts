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

export interface PlageHoraire {
  id?: number;
  type: 'TRAVAIL' | 'PAUSE' | string;
  heureDebut: string;
  heureFin: string;
  ordre?: number;
}

export interface JourHoraire {
  id?: number;
  jourSemaine: string;
  actif?: boolean;
  estTravaille?: boolean;
  plages: PlageHoraire[];
}

export interface Horaire {
  id: number;
  nom: string;
  description?: string;
  type?: string;
  heuresHebdo?: number;
  isDefaut?: boolean;
  statut?: 'ACTIF' | 'INACTIF' | string;
  fuseauHoraire?: string;
  jours: JourHoraire[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AffectationHoraire {
  id?: number;
  horaireId?: number;
  horaireNom?: string;
  horaire?: Horaire;
  cibleType?: 'ENTREPRISE' | 'EQUIPE' | 'UTILISATEUR' | string;
  cibleId?: number;
  cibleLabel?: string;
  cibleNom?: string;
  priorite?: number;
  dateDebut?: string;
  dateFin?: string | null;
  motif?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkSchedule extends Horaire {}

export interface WorkScheduleDto extends Horaire {}
