import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ReunionStore } from '../services/reunion.store';
import { triggerPrefetch } from './non-blocking-resolver.util';

/** Warms reunion cache without blocking route activation. */
export const reunionListResolver: ResolveFn<boolean> = () => {
  return triggerPrefetch(inject(ReunionStore).loadIfNeeded());
};
