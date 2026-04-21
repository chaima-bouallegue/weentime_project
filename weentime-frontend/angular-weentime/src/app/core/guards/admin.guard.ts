import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const roles = authService.currentUser()?.roles ?? [];
  const isAdmin = roles.includes('ROLE_ADMIN');

  if (isAdmin) {
    return true;
  }

  router.navigate(['/app'], { replaceUrl: true });
  return false;
};
