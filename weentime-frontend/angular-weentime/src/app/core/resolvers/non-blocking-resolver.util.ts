import { Observable, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';

/**
 * Starts an async prefetch without blocking route activation.
 */
export function triggerPrefetch(prefetch$: Observable<unknown>): Observable<boolean> {
  queueMicrotask(() => {
    prefetch$
      .pipe(
        take(1),
        catchError(() => of(null))
      )
      .subscribe();
  });

  return of(true);
}
