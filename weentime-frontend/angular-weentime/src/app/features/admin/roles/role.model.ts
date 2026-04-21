export enum RoleNom {
  ROLE_EMPLOYEE = 'ROLE_EMPLOYEE',
  ROLE_MANAGER = 'ROLE_MANAGER',
  ROLE_RH = 'ROLE_RH',
  ROLE_ADMIN = 'ROLE_ADMIN'
}

export interface Role {
  id: number;
  nom: RoleNom;
  description: string;
}

export interface RoleRequest {
  nom: RoleNom;
  description: string;
}
