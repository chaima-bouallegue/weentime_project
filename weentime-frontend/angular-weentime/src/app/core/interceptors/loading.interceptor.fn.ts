import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

export const loadingInterceptorFn: HttpInterceptorFn = (req, next) => {
  const loading = inject(LoadingService);
  const skipLoading = req.headers.has('X-Skip-Loader');

  if (!skipLoading) {
    loading.begin();
  }

  return next(req).pipe(
    finalize(() => {
      if (!skipLoading) {
        loading.end();
      }
    })
  );
};
