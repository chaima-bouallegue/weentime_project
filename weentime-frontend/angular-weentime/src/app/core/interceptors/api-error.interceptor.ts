import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, retry, throwError, timer } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { extractErrorMessage, logWarn, toErrorSummary } from '../utils/logger';

const AUTH_ENDPOINTS = ['/api/v1/auth/login', '/api/v1/auth/verify-2fa', '/api/v1/auth/register'];

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const isAuthRequest = AUTH_ENDPOINTS.some(endpoint => req.url.includes(endpoint));
  const shouldRetry = req.method === 'GET';

  return next(req).pipe(
    retry({
      count: shouldRetry ? 1 : 0,
      delay: (_error, retryCount) => timer(retryCount * 250)
    }),
    catchError((error: HttpErrorResponse) => {
      if (!isAuthRequest) {
        const message = resolveApiMessage(error);
        if (message) {
          toast.error(message);
        }
      }

      if (shouldLogApiError(error)) {
        logWarn('API request failed', {
          url: req.url,
          method: req.method,
          ...toErrorSummary(error)
        });
      }

      return throwError(() => error);
    })
  );
};

function resolveApiMessage(error: HttpErrorResponse): string {
  const payload = error.error as Record<string, unknown> | null;
  const rawMessage = [
    payload?.['details'],
    payload?.['message'],
    payload?.['error'],
    error.message
  ].find(value => typeof value === 'string' && value.trim().length > 0) as string | undefined;

  if (error.status === 0) {
    return 'Le serveur est inaccessible pour le moment. Verifiez votre connexion puis reessayez.';
  }
  if (error.status === 400) {
    return rawMessage ?? 'La requete envoyee est invalide.';
  }
  if (error.status === 403) {
    return rawMessage ?? 'Vous n avez pas les droits necessaires pour cette action.';
  }
  if (error.status === 404) {
    return 'La ressource demandee est introuvable.';
  }
  if (error.status === 409) {
    return rawMessage ?? 'Cette action est en conflit avec votre etat actuel.';
  }
  if (error.status >= 500) {
    return rawMessage ?? 'Une erreur interne est survenue. Reessayez dans quelques instants.';
  }

  return rawMessage ?? extractErrorMessage(error);
}

function shouldLogApiError(error: HttpErrorResponse): boolean {
  return error.status === 0 || error.status >= 500;
}
