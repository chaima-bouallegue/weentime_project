export interface RhOwner {
  id: number;
  name?: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  entrepriseId?: number;
  entrepriseNom: string;
  role?: string;
  statut: 'ACTIF' | 'INACTIF' | string;
  dateCreation?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface EntrepriseSelectItem {
  id: number;
  nom: string;
  codeInvitation: string;
  [key: string]: unknown;
}

export interface CreateRhOwnerRequest {
  name: string;
  email: string;
  password: string;
  entrepriseId: number;
}

export interface UpdateRhOwnerRequest {
  name: string;
  email: string;
  password?: string;
  entrepriseId: number;
}
