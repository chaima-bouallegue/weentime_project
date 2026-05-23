import { Injectable, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ToastService } from '../services/toast.service';

/**
 * HTTP Interceptor for:
 * 1. Attaching JWT Bearer token to every request
 * 2. Handling 401 with auto-logout + redirect to login
 * 3. Handling network errors with a clear toast message
 */
@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  private router = inject(Router);
  private toastService = inject(ToastService);

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const token = localStorage.getItem('token');
    const isAuthRequest =
      request.url.includes('/api/v1/auth/login') ||
      request.url.includes('/api/v1/auth/verify-2fa') ||
      request.url.includes('/api/v1/auth/2fa/verify') ||
      request.url.includes('/api/v1/auth/2fa/send') ||
      request.url.includes('/api/v1/auth/register');

    let clonedRequest = request;
    if (token) {
      clonedRequest = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return next.handle(clonedRequest).pipe(
      catchError((error: HttpErrorResponse) => {
        const details =
          error.error?.details ||
          error.error?.message ||
          error.message ||
          'Une erreur est survenue.';

        if (error.status === 0) {
          this.toastService.error(
            "Erreur reseau - Le serveur n'est pas accessible. Verifiez votre connexion."
          );
        } else if (error.status === 401 && !isAuthRequest) {
          this.toastService.error(details || 'Session expiree - Veuillez vous reconnecter.');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          this.router.navigate(['/login'], { replaceUrl: true });
        } else if (error.status === 403) {
          this.toastService.error(details || 'Acces refuse.');
        } else if (error.status >= 500) {
          this.toastService.error(details || 'Erreur serveur. Reessayez plus tard.');
        }
        return throwError(() => error);
      })
    );
  }
}
