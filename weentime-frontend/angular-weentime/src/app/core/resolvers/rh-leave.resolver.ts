import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RhLeaveStore } from '../services/rh-leave.store';

/**
 * rhLeaveResolver — Pre-fetches references and conge requests for RH.
 */
export const rhLeaveResolver: ResolveFn<any> = () => {
  const store = inject(RhLeaveStore);
  return forkJoin({
    refs: store.loadReferences(),
    demandes: store.loadAllDemandes()
  });
};

import { forkJoin } from 'rxjs';
