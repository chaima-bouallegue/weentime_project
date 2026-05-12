import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RhStructureStore } from '../services/rh-structure.store';

/**
 * rhStructureResolver — Ensures all organization data (Depts, Teams, Employees)
 * is loaded BEFORE the structure page is displayed.
 */
export const rhStructureResolver: ResolveFn<boolean> = () => {
  const store = inject(RhStructureStore);
  
  // We return true immediately but trigger the load.
  // The loadAll returns an Observable, the router will wait for it if we return it.
  return store.loadAll();
};
