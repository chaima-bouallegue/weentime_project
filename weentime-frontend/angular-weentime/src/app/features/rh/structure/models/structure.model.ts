export interface Departement {
  id: number;
  nom: string;
  description?: string;
  codeInterne?: string;
  entrepriseId: number;
  nombreEquipes: number;
  nombreEmployes: number;
  [key: string]: unknown;
}

export interface Equipe {
  id: number;
  nom: string;
  description?: string;
  departementId: number;
  departementNom: string;
  managerId?: number;
  managerNom?: string;
  effectifMaximum?: number;
  estActive?: boolean;
  nombreEmployes: number;
  [key: string]: unknown;
}

export interface EmployeRH {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste: string;
  departementId: number;
  departementNom: string;
  equipeId?: number;
  equipeNom?: string;
  role: 'ROLE_EMPLOYEE' | 'ROLE_MANAGER' | string;
  statut: 'ACTIF' | 'INACTIF' | string;
  dateCreation: string;
  [key: string]: unknown;
}

export interface ManagerRH extends EmployeRH {}

export interface CreateDepartementRequest {
  nom: string;
  description?: string;
}

export interface CreateEquipeRequest {
  nom: string;
  description?: string;
  departementId: number;
  managerId?: number | null;
}

export interface CreateEmployeRequest {
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  poste: string;
  departementId: number;
  equipeId?: number | null;
  managerId?: number | null;
  role: 'ROLE_EMPLOYEE' | 'ROLE_MANAGER';
}
