import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ValidationStore } from '../services/validation.store';
import { Observable } from 'rxjs';

/**
 * validationResolver — Prefetches validation requests based on the role.
 */
export const validationResolver = (role: 'RH' | 'MANAGER'): ResolveFn<any> => {
  return (): Observable<any> => {
    const store = inject(ValidationStore);
    if (role === 'RH') {
      return store.loadRhInitial();
    }
    return store.loadManagerInitial();
  };
};
