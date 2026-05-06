import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

type BusinessRole = 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE';

const ROLE_HOME: Record<BusinessRole, string> = {
  ADMIN: '/app/admin/dashboard',
  RH: '/app/rh/dashboard',
  MANAGER: '/app/manager/dashboard',
  EMPLOYEE: '/app/employee/dashboard'
};

const SECTION_ROLES: Record<string, BusinessRole[]> = {
  admin: ['ADMIN'],
  rh: ['RH'],
  manager: ['MANAGER'],
  employee: ['EMPLOYEE']
};

export const roleGuard: CanActivateChildFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = authService.currentUser();

  if (!authService.isAuthenticated() || !user) {
    return router.createUrlTree(['/login']);
  }

  const userRole = toBusinessRole(user.role ?? user.roles?.[0]);
  if (!userRole) {
    authService.clearAuthState();
    return router.createUrlTree(['/login']);
  }

  const routeRoles = route.data?.['roles'];
  const allowedRoles = Array.isArray(routeRoles)
    ? routeRoles.map(toBusinessRole).filter((role): role is BusinessRole => !!role)
    : resolveAllowedRolesFromUrl(state.url);

  if (allowedRoles.length === 0 || allowedRoles.includes(userRole)) {
    return true;
  }

  return router.parseUrl(ROLE_HOME[userRole]);
};

function resolveAllowedRolesFromUrl(url: string): BusinessRole[] {
  const section = url.split('?')[0].split('/').filter(Boolean)[1]?.toLowerCase();
  return section ? SECTION_ROLES[section] ?? [] : [];
}

function toBusinessRole(value: unknown): BusinessRole | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  const role = normalized.startsWith('ROLE_')
    ? normalized.substring('ROLE_'.length)
    : normalized;

  return ['ADMIN', 'RH', 'MANAGER', 'EMPLOYEE'].includes(role)
    ? role as BusinessRole
    : null;
}
