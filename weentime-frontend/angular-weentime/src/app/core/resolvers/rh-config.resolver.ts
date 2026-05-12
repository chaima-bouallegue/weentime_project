import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RhConfigStore } from '../services/rh-config.store';

/**
 * rhConfigResolver — Pre-fetches global RH parameters.
 */
export const rhConfigResolver: ResolveFn<any> = () => {
  const store = inject(RhConfigStore);
  return store.loadInitial();
};
