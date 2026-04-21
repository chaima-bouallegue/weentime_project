import { ErrorHandler, Injectable } from '@angular/core';
import { logError, toErrorSummary } from '../utils/logger';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const normalizedError =
      (error as { rejection?: unknown })?.rejection ??
      (error as { ngOriginalError?: unknown })?.ngOriginalError ??
      error;

    logError('[GlobalErrorHandler] Runtime error', toErrorSummary(normalizedError));
  }
}
