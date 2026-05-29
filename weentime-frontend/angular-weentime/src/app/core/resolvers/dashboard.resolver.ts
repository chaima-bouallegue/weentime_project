import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { of, take } from 'rxjs';

import { DashboardStore } from '../services/dashboard.store';
import { DashboardRole } from '@app/shared/ui/models/dashboard-ui.models';

/**
 * Starts dashboard loading without blocking route activation.
 */
export const dashboardResolver = (role: DashboardRole): ResolveFn<boolean> => {
  return () => {
    const store = inject(DashboardStore);
    setTimeout(() => {
      store.loadDashboard(role).pipe(take(1)).subscribe({ error: () => undefined });
    }, 0);
    return of(true);
  };
};
