import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { ReunionStore } from '../../core/services/reunion.store';

export const REUNION_ROUTES: Routes = [
  {
    path: '',
    resolve: { 
      data: () => inject(ReunionStore).loadReunions() 
    },
    loadComponent: () => import('./reunion-dashboard/reunion-dashboard.component').then(c => c.ReunionDashboardComponent)
  },
  {
    path: 'create',
    loadComponent: () => import('./reunion-create/reunion-create.component').then(c => c.ReunionCreateComponent)
  },
  {
    path: ':uuid',
    resolve: {
      reunion: (route: any) => inject(ReunionStore).getDetail(route.paramMap.get('uuid')!)
    },
    loadComponent: () => import('./reunion-detail/reunion-detail.component').then(c => c.ReunionDetailComponent)
  }
];
