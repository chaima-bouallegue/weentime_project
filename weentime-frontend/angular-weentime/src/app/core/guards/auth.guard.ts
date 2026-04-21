import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Functional route guard (modern Angular pattern).
 * Reads the isAuthenticated() signal from AuthService as the single
 * source of truth — never reads localStorage directly.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/login'], { replaceUrl: true });
  return false;
};
