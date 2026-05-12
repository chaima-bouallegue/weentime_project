import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { TeletravailStore } from '../../features/employee/teletravail/teletravail.store';
import { Observable } from 'rxjs';

export const teletravailDataResolver: ResolveFn<void> = (): Observable<void> | void => {
  const store = inject(TeletravailStore);
  
  // If we already have data, navigation should be instant
  if (store.historique().length > 0 || store.quota()) {
    store.loadAll().subscribe(); // Background refresh if needed
    return;
  }
  
  // Otherwise, block to ensure data is there for the first view
  return store.loadAll();
};
