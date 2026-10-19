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
  const formatIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const start = formatIso(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = formatIso(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  return store.loadInitial(start, end);
};
