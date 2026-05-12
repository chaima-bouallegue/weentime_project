import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RhTeletravailStore } from '../services/rh-teletravail.store';

/**
 * rhTeletravailResolver — Pre-fetches teletravail requests and stats for RH.
 */
export const rhTeletravailResolver: ResolveFn<any> = () => {
  const store = inject(RhTeletravailStore);
  return store.loadAll();
};
