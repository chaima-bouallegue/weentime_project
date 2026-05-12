import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { PlanningStore } from '../services/planning.store';
import { Observable } from 'rxjs';

/**
 * planningResolver — Prefetches the current month's planning before entering the view.
 */
export const planningResolver: ResolveFn<any> = (): Observable<any> => {
  const store = inject(PlanningStore);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  return store.loadInitial(start, end);
};
