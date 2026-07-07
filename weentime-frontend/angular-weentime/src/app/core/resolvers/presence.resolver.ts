import { ResolveFn } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * presenceResolver — Returns immediately to prevent blocking navigation.
 */
export const presenceResolver: ResolveFn<any> = (): Observable<any> => {
  return of(true);
};
