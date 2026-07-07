import { HttpInterceptorFn, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { SKIP_AUTH_REDIRECT } from '../http/request-context.tokens';
import { AuthService } from '../services/auth.service';
import { extractErrorMessage, logWarn } from '../utils/logger';
import { environment } from '../../../environments/environment';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const skipAuthRedirect = req.context.get(SKIP_AUTH_REDIRECT);

  const isBackendCall = req.url.startsWith(environment.apiUrl)
                     || req.url.includes('localhost:8');
  const isRefreshCall = req.url.includes('/auth/refresh');

  let clonedRequest: HttpRequest<unknown> = req;
  if (isBackendCall) {
    clonedRequest = req.clone({ withCredentials: true });
  }

  return next(clonedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isRefreshCall && !req.url.includes('/auth/ws-token') && !isRefreshing) {
        isRefreshing = true;
        return authService.refreshToken().pipe(
          switchMap(success => {
            isRefreshing = false;
            if (success) {
              return next(clonedRequest);
            }
            if (!skipAuthRedirect) {
              authService.clearAuthState();
              void router.navigate(['/login'], { replaceUrl: true });
            }
            return throwError(() => error);
          })
        );
      }
      if (error.status === 401 && !isRefreshing && !skipAuthRedirect) {
        authService.clearAuthState();
        void router.navigate(['/login'], { replaceUrl: true });
      }
      return throwError(() => error);
    })
  );
};
