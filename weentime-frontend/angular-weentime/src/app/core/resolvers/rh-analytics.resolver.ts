import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RhAnalyticsStore } from '../services/rh-analytics.store';

/**
 * Functional resolver for RH Analytics.
 * Ensures all HR-related data (employees, leaves, schedules) is loaded before analytics view activation.
 */
export const rhAnalyticsResolver: ResolveFn<any> = () => {
  const store = inject(RhAnalyticsStore);
  return store.loadAll();
};
