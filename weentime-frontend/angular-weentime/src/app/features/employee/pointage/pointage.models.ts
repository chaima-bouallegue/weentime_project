export type PointageType = 'ENTREE' | 'SORTIE';

export interface PointageEntry {
  id?:              number;
  utilisateurId:    number;
  type:             PointageType;
  timestamp:        string;
  heureEntree?:     string;
  heureSortie?:     string;
  duree?:           number;
  dureeMinutes?:    number;
  estEnRetard?:     boolean;
  minutesRetard?:   number;
  isAutoClosed?:    boolean;
  overtimeMinutes?: number;
}

export interface DayStatus {
  jour:          string;
  statut:        'OK' | 'RETARD' | 'ABSENT' | 'OFF';
  minutes:       number;
  objectifHeures: number;
}

export interface PointageStats {
  ponctualitePct:    number;
  soldeConges:       number;
  heuresAujourdhui:  string;
  heuresSemaine:     string;
  minutesAujourdhui: number;
  minutesSemaine:    number;
  joursParStatus:    DayStatus[];
}