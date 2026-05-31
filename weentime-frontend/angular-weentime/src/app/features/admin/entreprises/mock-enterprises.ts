// ─────────────────────────────────────────────────────────
// Interfaces — keep in sync with EntrepriseResponse.java
// ─────────────────────────────────────────────────────────

export interface Enterprise {
  id: string;                    // Long → string (codeInvitation affiché dans l'UI)
  codeInvitation: string;        // "WEEN-XXXXXXXXXXXX"
  nom: string;                   // nom légal (backend)
  name: string;                  // alias UI = nom
  initials: string;              // calculé côté frontend
  avatarColor: string;           // calculé côté frontend
  siret: string;
  secteur: string;               // backend
  sector: string;                // alias UI = secteur
  adresse?: string;
  telephone?: string;
  email?: string;
  siteWeb?: string;
  logo?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  estActive: boolean;            // rétrocompatibilité
  maxUsers: number;
  currentUsers: number;
  employeesCount: number;        // alias = maxUsers
  activeUsers: number;
  hrManagers: number;
  modulesEnabled: number;
  codeExpiration?: string;
  lastActivity?: string;         // ISO string
  lastLogin?: string;            // ISO string
  createdAt: string;             // ISO string
  nombreDepartements?: number;
}

export interface EntrepriseStats {
  total: number;
  active: number;
  suspended: number;
  closed: number;
}


export interface TableFilters {
  status: 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  search: string;
  page: number;
  size: number;
  sort?: string;
}

export interface PagedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;       // current page (0-indexed)
  first: boolean;
  last: boolean;
}

// Access control
export interface ModulePermission {
  key: string;
  label: string;
  enabled: boolean;
}

export interface RolePermission {
  role: string;
  label: string;
  modules: ModulePermission[];
}

export interface EntrepriseAccessControl {
  entrepriseId: number;
  codeInvitation: string;
  permissions: RolePermission[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface EntrepriseAccessControlHistory {
  id: number;
  changedBy: string;
  changedAt: string;
  role: string;
  moduleKey: string;
  previousValue: boolean;
  newValue: boolean;
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899',
  '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4'
] as const;

export function buildInitials(nom: string): string {
  const parts = nom.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return nom.substring(0, 2).toUpperCase();
}

export function buildAvatarColor(nom: string): string {
  let hash = 0;
  for (let i = 0; i < nom.length; i++) hash = nom.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
// Ajouter à la fin de mock-enterprises.ts si absent
export interface PaginationState {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
/** Map EntrepriseResponse (backend) → Enterprise (frontend) */
export function mapEntreprise(raw: any): Enterprise {
  const nom: string = raw.nom ?? raw.name ?? '';
  return {
    ...raw,
    id: String(raw.id),
    codeInvitation: raw.codeInvitation ?? '',
    nom,
    name: nom,
    secteur: raw.secteur ?? raw.sector ?? '',
    sector: raw.secteur ?? raw.sector ?? '',
    initials: buildInitials(nom),
    avatarColor: buildAvatarColor(nom),
    employeesCount: raw.employeesCount ?? raw.maxUsers ?? 0,
    maxUsers: raw.maxUsers ?? raw.employeesCount ?? 0,
    activeUsers: raw.activeUsers ?? 0,
    hrManagers: raw.hrManagers ?? 0,
    modulesEnabled: raw.modulesEnabled ?? 0,
    estActive: raw.estActive ?? (raw.status === 'ACTIVE'),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    logo: raw.logo ?? '',
  };


}