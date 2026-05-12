import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { DashboardStore } from '../services/dashboard.store';
import { DashboardRole } from '@app/shared/ui/models/dashboard-ui.models';
import { Observable } from 'rxjs';

/**
 * dashboardResolver — Prefetches dashboard data before the route is activated.
 * Ensures the UI feels "instant" and premium.
 */
export const dashboardResolver = (role: DashboardRole): ResolveFn<any> => {
  return (): Observable<any> => {
    const store = inject(DashboardStore);
    return store.loadDashboard(role);
  };
};
