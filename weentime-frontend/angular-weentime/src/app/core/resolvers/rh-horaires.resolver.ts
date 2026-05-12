import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RhHorairesStore } from '../services/rh-horaires.store';

/**
 * Functional resolver for RH Horaires.
 * Pre-fetches work schedules and assignments before route activation.
 */
export const rhHorairesResolver: ResolveFn<any> = () => {
  const store = inject(RhHorairesStore);
  return store.loadAll();
};
