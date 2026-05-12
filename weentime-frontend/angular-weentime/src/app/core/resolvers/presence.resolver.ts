import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { PresenceStore } from '../services/presence.store';
import { Observable } from 'rxjs';

/**
 * presenceResolver — Ensures presence data is loaded before entering pointage view.
 */
export const presenceResolver: ResolveFn<any> = (): Observable<any> => {
  return inject(PresenceStore).prefetch();
};
