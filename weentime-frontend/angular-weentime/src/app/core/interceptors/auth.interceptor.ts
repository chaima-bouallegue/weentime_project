import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { extractErrorMessage, logWarn } from '../utils/logger';

/**
 * Functional HTTP Interceptor for:
 * 1. Attaching JWT Bearer token to every request
 * 2. Handling 401 with auto-logout + redirect to login
 * 3. Handling network errors with a clear toast message
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);

  const token = authService.getToken();
  const isAuthRequest =
    req.url.includes('/api/v1/auth/login') ||
    req.url.includes('/api/v1/auth/verify-2fa') ||
    req.url.includes('/api/v1/auth/register');

  let clonedRequest = req;
  if (token) {
    clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(clonedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthRequest) {
        logWarn('Authentication expired', {
          url: req.url,
          status: error.status,
          message: extractErrorMessage(error)
        });
        authService.clearAuthState();
        router.navigate(['/login'], { replaceUrl: true });
      }
      return throwError(() => error);
    })
  );
};
