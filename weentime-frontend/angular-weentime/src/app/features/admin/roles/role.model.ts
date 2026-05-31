// Garder l'enum seulement pour référence des rôles système
export enum RoleNom {
  ROLE_EMPLOYEE = 'ROLE_EMPLOYEE',
  ROLE_MANAGER = 'ROLE_MANAGER',
  ROLE_RH = 'ROLE_RH',
  ROLE_ADMIN = 'ROLE_ADMIN'
}

export const ROLE_SYSTEME = Object.values(RoleNom); // rôles non-supprimables

export interface Role {
  id: number;
  nom: string;        // ← string, plus RoleNom
  description: string;
}

export interface RoleRequest {
  nom: string;        // ← string libre
  description: string;
}