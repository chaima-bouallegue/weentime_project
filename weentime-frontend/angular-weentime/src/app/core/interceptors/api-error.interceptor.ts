import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, retry, throwError, timer } from 'rxjs';
import { SKIP_ERROR_TOAST } from '../http/request-context.tokens';
import { ToastService } from '../services/toast.service';
import { extractErrorMessage, logWarn, toErrorSummary } from '../utils/logger';

const AUTH_ENDPOINTS = ['/api/v1/auth/login', '/api/v1/auth/mfa/verify', '/api/v1/auth/register'];

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const skipErrorToast = req.context.get(SKIP_ERROR_TOAST) || req.headers.has('X-Skip-Error-Toast');
  const normalizedRequest = req.headers.has('X-Skip-Error-Toast')
    ? req.clone({
      headers: req.headers.delete('X-Skip-Error-Toast'),
      context: skipErrorToast ? req.context.set(SKIP_ERROR_TOAST, true) : req.context
    })
    : req;
  const isAuthRequest = AUTH_ENDPOINTS.some(endpoint => normalizedRequest.url.includes(endpoint));
  const shouldRetry = normalizedRequest.method === 'GET';

  return next(normalizedRequest).pipe(
    retry({
      count: shouldRetry ? 1 : 0,
      delay: (error, retryCount) => {
        if (!shouldRetryRequestError(error)) {
          throw error;
        }
        return timer(retryCount * 250);
      }
    }),
    catchError((error: HttpErrorResponse) => {
      if (!isAuthRequest) {
        const message = shouldSilenceToast(normalizedRequest, error) ? null : resolveApiMessage(error);
        if (message) {
          toast.error(message);
        }
      }

      if (shouldLogApiError(error)) {
        logWarn('API request failed', {
          url: normalizedRequest.url,
          method: normalizedRequest.method,
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
    return sanitizeApiMessage(rawMessage, 'La requete envoyee est invalide.');
  }
  if (error.status === 401) {
    return 'Votre session a expire. Veuillez vous reconnecter.';
  }
  if (error.status === 403) {
    return sanitizeApiMessage(rawMessage, 'Vous n avez pas les droits necessaires pour cette action.');
  }
  if (error.status === 404) {
    return 'La ressource demandee est introuvable.';
  }
  if (error.status === 409) {
    return sanitizeApiMessage(rawMessage, 'Cette action est en conflit avec votre etat actuel.');
  }
  if (error.status >= 500) {
    return sanitizeApiMessage(rawMessage, 'Une erreur interne est survenue. Reessayez dans quelques instants.');
  }

  return sanitizeApiMessage(rawMessage, extractErrorMessage(error));
}

function shouldLogApiError(error: HttpErrorResponse): boolean {
  return error.status === 0 || error.status >= 500;
}

function shouldRetryRequestError(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return true;
  }
  return error.status === 0 || error.status >= 500 || error.status === 429;
}

function shouldSilenceToast(req: HttpRequest<unknown>, error: HttpErrorResponse): boolean {
  if (req.context.get(SKIP_ERROR_TOAST) || req.headers.has('X-Skip-Error-Toast')) {
    return true;
  }

  const url = req.url.toLowerCase();
  const details = String(
    (error.error as Record<string, unknown> | null)?.['details']
    ?? (error.error as Record<string, unknown> | null)?.['message']
    ?? ''
  ).toLowerCase();
  const code = String((error.error as Record<string, unknown> | null)?.['error'] ?? '').toUpperCase();

  if (error.status === 403 && url.includes('/api/v1/structure/departments')) {
    return true;
  }

  if (req.method === 'GET') {
    if (url.includes('/api/v1/presence/me/today') || url.includes('/api/v1/presence/me/history')) {
      return true;
    }
  }

  if (error.status === 409 && (url.includes('/api/v1/presence/check-in') || url.includes('/api/v1/presence/me/check-in'))) {
    if (code.includes('ALREADY_OPEN') || details.includes('already open') || details.includes('session ouverte')) {
      return true;
    }
  }

  return false;
}

function sanitizeApiMessage(message: string | undefined, fallback: string): string {
  const candidate = String(message ?? '').trim();
  if (!candidate) {
    return fallback;
  }

  const normalized = candidate.toLowerCase();
  const looksTechnical = normalized.includes('java.')
    || normalized.includes('org.springframework')
    || normalized.includes('stack trace')
    || normalized.includes('exception:')
    || normalized.includes('at com.');

  return looksTechnical ? fallback : candidate;
}
